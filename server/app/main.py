from contextlib import asynccontextmanager
import secrets
import sys

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from starlette.websockets import WebSocketState
import httpx
from loguru import logger

from app.config import Settings
from app.services.weather import WeatherError, WeatherRequest, WeatherResult, WeatherService


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app):
        logger.remove()
        logger.add(sys.stderr, level=settings.log_level)
        async with httpx.AsyncClient(timeout=settings.weather_request_timeout_seconds) as client:
            app.state.weather = WeatherService(client, settings.weather_request_timeout_seconds)
            yield

    app = FastAPI(title="Weather Voice Agent", lifespan=lifespan)
    app.state.settings = settings

    @app.get("/health")
    async def health():
        return {"status": "ok", "voice_configured": settings.voice_ready,
                "exotel_auth_configured": bool(settings.exotel_ws_token.get_secret_value())}

    @app.exception_handler(WeatherError)
    async def weather_error(request, exc):
        return JSONResponse(status_code=exc.status, content={"error": exc.detail})

    @app.post("/tools/get-weather", response_model=WeatherResult)
    async def get_weather(payload: WeatherRequest):
        return await app.state.weather.get_weather(payload.city)

    @app.websocket("/ws/exotel")
    async def exotel(websocket: WebSocket):
        # A URL token works with the Voicebot applet's static WSS URL.
        expected = settings.exotel_ws_token.get_secret_value()
        supplied = websocket.query_params.get("token", "")
        if not expected or not secrets.compare_digest(supplied.encode(), expected.encode()):
            await websocket.close(code=1008)
            return
        if not settings.voice_ready:
            await websocket.close(code=1013)
            return
        await websocket.accept()
        try:
            from app.telephony.exotel import VoicebotSerializer, read_start
            from app.agent.pipeline import run_voice_session
            from pipecat.transports.websocket.fastapi import FastAPIWebsocketParams, FastAPIWebsocketTransport

            session = await read_start(websocket, settings.handshake_timeout_seconds, settings.exotel_account_sid)
            logger.info("call_started call={}", session.call_sid)
            transport = FastAPIWebsocketTransport(
                websocket,
                params=FastAPIWebsocketParams(
                    audio_in_enabled=True, audio_out_enabled=True,
                    audio_out_sample_rate=session.sample_rate,
                    # 200ms at 8k = 3200 bytes; meets Exotel minimum output chunk size.
                    audio_out_10ms_chunks=20,
                    add_wav_header=False, serializer=VoicebotSerializer(session),
                    session_timeout=settings.max_call_seconds,
                ),
            )
            await run_voice_session(transport, settings, app.state.weather, session.call_sid)
            logger.info("call_finished call={}", session.call_sid)
        except WebSocketDisconnect:
            pass
        except (ValueError, TypeError, AttributeError, TimeoutError):
            logger.warning("Invalid or timed-out Exotel handshake")
            if websocket.application_state == WebSocketState.CONNECTED:
                await websocket.close(code=1008)
        except Exception as exc:
            logger.error("Call failed error_type={}", type(exc).__name__)
            if websocket.application_state == WebSocketState.CONNECTED:
                await websocket.close(code=1011)
        finally:
            if websocket.application_state == WebSocketState.CONNECTED:
                await websocket.close()

    return app


app = create_app()
