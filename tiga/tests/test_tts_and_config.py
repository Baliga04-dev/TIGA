from pathlib import Path

import config
import tts


def test_markdown_noise_is_removed_before_speaking():
    assert tts.clean_for_speech("**Hi** see [the docs](https://x.example) and ] stray") == "Hi see the docs and stray"


def test_symbols_are_spoken_as_words():
    assert tts.clean_for_speech("Profit & loss up 5%") == "Profit and loss up 5 percent"


async def test_synthesis_returns_audio_bytes(http, monkeypatch):
    monkeypatch.setattr(config, "ELEVENLABS_API_KEY", "k")
    http.add("api.elevenlabs.io", content=b"ID3audio", headers={"content-type": "audio/mpeg"})
    assert await tts.synthesize("hello") == b"ID3audio"


async def test_synthesis_failure_returns_none(http, monkeypatch):
    monkeypatch.setattr(config, "ELEVENLABS_API_KEY", "k")
    http.add("api.elevenlabs.io", status=500, text="nope")
    assert await tts.synthesize("hello") is None


async def test_voice_id_cannot_alter_the_request_path(http, monkeypatch):
    monkeypatch.setattr(config, "ELEVENLABS_API_KEY", "k")
    monkeypatch.setattr(config, "ELEVENLABS_VOICE_ID", "../../v1/user?x=1")
    http.add("api.elevenlabs.io", content=b"audio", headers={"content-type": "audio/mpeg"})
    await tts.synthesize("hello")
    assert http.requests[0].url.raw_path == b"/v1/text-to-speech/..%2F..%2Fv1%2Fuser%3Fx%3D1"


def test_relative_config_paths_resolve_next_to_the_backend_not_the_cwd():
    base = Path(config.__file__).parent
    assert config.resolve_path("credentials.json") == str(base / "credentials.json")
    assert config.resolve_path("/abs/token.json") == "/abs/token.json"
