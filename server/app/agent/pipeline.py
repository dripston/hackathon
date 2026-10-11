from math import ceil

from loguru import logger
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import InputTransportMessageFrame, LLMRunFrame, MetricsFrame
from pipecat.observers.base_observer import BaseObserver
from pipecat.observers.user_bot_latency_observer import UserBotLatencyObserver
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair, LLMUserAggregatorParams
from pipecat.processors.frame_processor import FrameProcessor
from pipecat.services.groq.llm import GroqLLMService
from pipecat.workers.runner import WorkerRunner

from app.agent.prompt import SYSTEM_PROMPT
from app.agent.tools import tools, weather_handler
from app.config import Settings
from app.services.sarvam import create_stt, create_tts
from app.services.weather import WeatherService


class CallControl(FrameProcessor):
    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        if isinstance(frame, InputTransportMessageFrame) and frame.message.get("event") == "stop":
            await self.pipeline_worker.cancel(reason="Exotel stop")
            return
        await self.push_frame(frame, direction)


class StageMetricsObserver(BaseObserver):
    async def on_push_frame(self, data):
        if isinstance(data.frame, MetricsFrame):
            for metric in data.frame.data:
                value = getattr(metric, "value", None)
                if isinstance(value, (int, float)):
                    logger.info("stage_metric processor={} metric={} value={}",
                                metric.processor, type(metric).__name__, value)


def create_llm(settings: Settings, weather: WeatherService):
    llm = GroqLLMService(
        api_key=settings.llm_api_key.get_secret_value(),
        settings=GroqLLMService.Settings(model=settings.llm_model),
    )
    llm.register_function("get_weather", weather_handler(weather), cancel_on_interruption=True)
    return llm


async def run_voice_session(transport, settings: Settings, weather: WeatherService, call_id: str):
    context = LLMContext(
        messages=[{"role": "system", "content": SYSTEM_PROMPT}],
        tools=tools,
    )
    user, assistant = LLMContextAggregatorPair(
        context, user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(params=VADParams(stop_secs=0.3)),
        ),
    )
    llm = create_llm(settings, weather)
    pipeline = Pipeline([
        transport.input(), CallControl(), create_stt(settings), user,
        llm, create_tts(settings), transport.output(), assistant,
    ])
    latency = UserBotLatencyObserver()
    samples = []

    @latency.event_handler("on_latency_measured")
    async def on_latency_measured(observer, seconds):
        samples.append(seconds)
        logger.info("response_latency call={} seconds={:.3f}", call_id, seconds)

    worker = PipelineWorker(
        pipeline, conversation_id=call_id, enable_rtvi=False,
        idle_timeout_secs=settings.call_idle_timeout_seconds,
        params=PipelineParams(
            audio_in_sample_rate=16000, audio_out_sample_rate=24000,
            enable_metrics=True, enable_usage_metrics=True,
        ),
        observers=[StageMetricsObserver(), latency],
    )

    @transport.event_handler("on_client_connected")
    async def on_connected(transport, websocket):
        await worker.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_disconnected(transport, websocket):
        await worker.cancel(reason="WebSocket disconnected")

    @transport.event_handler("on_session_timeout")
    async def on_timeout(transport, websocket):
        await worker.cancel(reason="Maximum call duration")

    @worker.event_handler("on_pipeline_error")
    async def on_error(worker, frame):
        # Avoid logging provider response bodies or caller transcripts.
        logger.error("voice_pipeline_error call={}", call_id)
        await worker.cancel(reason="Voice provider error")

    runner = WorkerRunner(handle_sigint=False)
    try:
        await runner.add_workers(worker)
        await runner.run()
    finally:
        await worker.cancel(reason="Session cleanup")
        # Groq uses an OpenAI-compatible async HTTP client.
        await llm._client.close()
        if samples:
            values = sorted(samples)
            logger.info("response_latency_summary call={} turns={} p50={:.3f} p95={:.3f}",
                        call_id, len(values), values[ceil(len(values) * .5) - 1],
                        values[ceil(len(values) * .95) - 1])
