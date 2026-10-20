import re
from urllib.parse import quote

import httpx

import config

_API_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice}"

_MARKDOWN_RE = re.compile(r"\]\([^)]*\)|[*_`#>|\[\]]")
_WS_RE = re.compile(r"\s+")


def clean_for_speech(text: str) -> str:
    text = _MARKDOWN_RE.sub(" ", text or "")
    text = text.replace("&", " and ").replace("…", "...").replace("%", " percent")
    return _WS_RE.sub(" ", text).strip()


async def synthesize(text: str) -> bytes | None:
    if not config.ELEVENLABS_API_KEY or not text:
        return None
    payload = {
        "text": text,
        "model_id": config.ELEVENLABS_MODEL,
        "voice_settings": {"stability": 0.45, "similarity_boost": 0.8, "style": 0.15},
    }
    headers = {"xi-api-key": config.ELEVENLABS_API_KEY, "accept": "audio/mpeg"}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                _API_URL.format(voice=quote(config.ELEVENLABS_VOICE_ID, safe="")),
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()
            if "audio" not in resp.headers.get("content-type", ""):
                return None
            return resp.content
    except Exception:
        return None
