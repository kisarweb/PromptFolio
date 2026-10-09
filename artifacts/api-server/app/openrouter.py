"""OpenRouter: model catalogs per output kind (public, cached) and the HTTP calls for image, voice and video.

Text goes through the OpenAI-compatible chat endpoint (see ai.py). Each OpenRouter connector serves exactly one kind,
and its model must come from that kind's catalog so a text model can never be used for images (and vice versa).
"""
import asyncio
import base64
import logging
import time
from typing import Any

import httpx

log = logging.getLogger("promptfolio.openrouter")

BASE_URL = "https://openrouter.ai/api/v1"
APP_HEADERS = {"HTTP-Referer": "https://promptfolio.up.railway.app", "X-Title": "PromptFolio"}

PROVIDER_KIND = {
    "openrouter_text": "text",
    "openrouter_image": "image",
    "openrouter_audio": "audio",
    "openrouter_video": "video",
}

# Public catalog endpoints; each lists only models that produce that kind of output.
CATALOG_PATHS = {
    "text": "/models?output_modalities=text",
    "image": "/images/models",
    "audio": "/models?output_modalities=speech",
    "video": "/videos/models",
}
CATALOG_TTL_S = 3600
_cache: dict[str, tuple[float, dict[str, dict[str, Any]]]] = {}
_locks: dict[str, asyncio.Lock] = {}


class OpenRouterHTTPError(Exception):
    """Carries the HTTP status so ai._provider_error can classify it (402 = no credits, 401 = bad key...)."""

    def __init__(self, status_code: int, text: str):
        super().__init__(f"OpenRouter {status_code}: {text[:400]}")
        self.status_code = status_code


def is_openrouter(provider_type: str | None) -> bool:
    return provider_type in PROVIDER_KIND


def _simplify(kind: str, m: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {"id": m["id"], "name": m.get("name") or m["id"]}
    if kind == "text":
        # Image/audio models also emit text; the text connector only accepts pure text models.
        out["outputs"] = (m.get("architecture") or {}).get("output_modalities") or []
    if kind == "image":
        params = m.get("supported_parameters") or {}
        refs = params.get("input_references") if isinstance(params, dict) else None
        out["maxRefs"] = int(refs.get("max", 0)) if isinstance(refs, dict) else 0
        ratios = params.get("aspect_ratio") if isinstance(params, dict) else None
        out["aspectRatios"] = ratios.get("values") if isinstance(ratios, dict) else None
    if kind == "audio":
        out["voices"] = m.get("supported_voices") or []
    if kind == "video":
        out["durations"] = sorted(m.get("supported_durations") or [])
        out["aspectRatios"] = m.get("supported_aspect_ratios") or []
        out["frameImages"] = m.get("supported_frame_images") or []
    return out


async def catalog(kind: str) -> dict[str, dict[str, Any]] | None:
    """Models for one kind keyed by id, cached for an hour. None when OpenRouter can't be reached."""
    hit = _cache.get(kind)
    if hit and time.monotonic() - hit[0] < CATALOG_TTL_S:
        return hit[1]
    lock = _locks.setdefault(kind, asyncio.Lock())
    async with lock:
        hit = _cache.get(kind)
        if hit and time.monotonic() - hit[0] < CATALOG_TTL_S:
            return hit[1]
        try:
            async with httpx.AsyncClient(timeout=10) as http:
                r = await http.get(BASE_URL + CATALOG_PATHS[kind])
                r.raise_for_status()
                data = r.json().get("data") or []
        except Exception:
            log.warning("could not load the OpenRouter %s catalog", kind, exc_info=True)
            return hit[1] if hit else None
        models = {}
        for m in data:
            if not isinstance(m, dict) or not m.get("id"):
                continue
            item = _simplify(kind, m)
            if kind == "text" and item.get("outputs") not in (["text"], []):
                continue
            models[item["id"]] = item
        _cache[kind] = (time.monotonic(), models)
        return models


async def model_info(kind: str, model: str | None) -> dict[str, Any] | None:
    if not model:
        return None
    cat = await catalog(kind)
    return (cat or {}).get(model)


def _headers(api_key: str | None) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key or ''}", "Content-Type": "application/json", **APP_HEADERS}


def _check(r: httpx.Response) -> None:
    if r.status_code >= 400:
        raise OpenRouterHTTPError(r.status_code, r.text)


def _data_uri(data: bytes, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


# ------------------------------------------------------------------ image
async def generate_image(api_key: str | None, model: str, prompt: str, aspect: str, images: list[tuple[bytes, str]] | None) -> tuple[bytes, str]:
    info = await model_info("image", model) or {}
    body: dict[str, Any] = {"model": model, "prompt": prompt}
    ratios = info.get("aspectRatios")
    if not ratios or aspect in ratios:
        body["aspect_ratio"] = aspect
    max_refs = info.get("maxRefs", 4) if info else 4
    if images and max_refs:
        body["input_references"] = [{"type": "image_url", "image_url": {"url": _data_uri(d, m)}} for d, m in images[:max_refs]]
    async with httpx.AsyncClient(timeout=300) as http:
        r = await http.post(f"{BASE_URL}/images", json=body, headers=_headers(api_key))
    _check(r)
    items = r.json().get("data") or []
    if not items or not items[0].get("b64_json"):
        raise RuntimeError("OpenRouter returned no image (the request may have been blocked by safety filters).")
    return base64.b64decode(items[0]["b64_json"]), items[0].get("media_type") or "image/png"


# ------------------------------------------------------------------ voice
async def generate_speech(api_key: str | None, model: str, text: str, voice: str | None) -> tuple[bytes, str]:
    info = await model_info("audio", model) or {}
    voices = info.get("voices") or []
    body: dict[str, Any] = {"model": model, "input": text, "response_format": "mp3"}
    if voices:
        body["voice"] = voice if voice in voices else voices[0]
    async with httpx.AsyncClient(timeout=300) as http:
        r = await http.post(f"{BASE_URL}/audio/speech", json=body, headers=_headers(api_key))
    _check(r)
    mime = r.headers.get("content-type", "audio/mpeg").split(";")[0]
    if not r.content:
        raise RuntimeError("OpenRouter returned no audio.")
    return r.content, ("audio/mpeg" if mime in ("application/octet-stream", "") else mime)


# ------------------------------------------------------------------ video
def _nearest(value: int, options: list[int]) -> int:
    return min(options, key=lambda o: (abs(o - value), o)) if options else value


async def generate_video(api_key: str | None, model: str, prompt: str, aspect: str, duration: int, images: list[tuple[bytes, str]] | None) -> tuple[bytes, str]:
    info = await model_info("video", model) or {}
    body: dict[str, Any] = {"model": model, "prompt": prompt, "duration": _nearest(duration, info.get("durations") or [])}
    ratios = info.get("aspectRatios") or []
    body["aspect_ratio"] = aspect if not ratios or aspect in ratios else ratios[0]
    if images and (not info or "first_frame" in (info.get("frameImages") or [])):
        d, m = images[0]
        body["frame_images"] = [{"type": "image_url", "image_url": {"url": _data_uri(d, m)}, "frame_type": "first_frame"}]
    async with httpx.AsyncClient(timeout=60) as http:
        r = await http.post(f"{BASE_URL}/videos", json=body, headers=_headers(api_key))
        _check(r)
        job = r.json()
        waited = 0
        while job.get("status") not in ("completed", "failed", "cancelled", "expired"):
            if waited >= 900:
                raise RuntimeError("Video generation timed out after 15 minutes.")
            await asyncio.sleep(10)
            waited += 10
            poll = job.get("polling_url") or f"/api/v1/videos/{job.get('id')}"
            p = await http.get(poll if poll.startswith("http") else "https://openrouter.ai" + poll, headers=_headers(api_key))
            _check(p)
            job = p.json()
        if job.get("status") != "completed":
            raise RuntimeError(f"Video generation {job.get('status')}: {job.get('error') or ''}".strip())
    async with httpx.AsyncClient(timeout=300, follow_redirects=True) as http:
        c = await http.get(f"{BASE_URL}/videos/{job['id']}/content", params={"index": 0}, headers=_headers(api_key))
    _check(c)
    return c.content, c.headers.get("content-type", "video/mp4").split(";")[0] or "video/mp4"


# ------------------------------------------------------------------ connection test
async def key_info(api_key: str | None) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=20) as http:
        r = await http.get(f"{BASE_URL}/key", headers=_headers(api_key))
    _check(r)
    return r.json().get("data") or {}
