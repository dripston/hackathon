from pipecat.services.sarvam.stt import SarvamSTTService
from pipecat.services.sarvam.tts import SarvamTTSService
from pipecat.transcriptions.language import Language

from app.config import Settings


def create_stt(settings: Settings):
    return SarvamSTTService(
        api_key=settings.sarvam_api_key.get_secret_value(), sample_rate=16000,
        mode="transcribe",
        settings=SarvamSTTService.Settings(model=settings.sarvam_stt_model, language=None),
    )


def create_tts(settings: Settings):
    return SarvamTTSService(
        api_key=settings.sarvam_api_key.get_secret_value(), sample_rate=24000,
        settings=SarvamTTSService.Settings(
            model=settings.sarvam_tts_model, voice=settings.sarvam_tts_voice,
            language=Language(settings.sarvam_tts_language),
        ),
    )
