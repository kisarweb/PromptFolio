"""Generation engines.

Built-in engines use Replit AI Integrations (OpenAI + Gemini proxies, no user key needed).
User engines come from encrypted MCP connections (BYOK): OpenAI, Google Gemini/Veo, Runway.
"""
import asyncio
import base64
import io
import json
import logging
import wave
from dataclasses import dataclass, field
from typing import Any

import httpx
from google import genai
from google.genai import types as gtypes
from openai import AsyncOpenAI

from . import config

log = logging.getLogger("promptfolio.ai")


class EngineError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.message = message
        self.status = status


_builtin_openai = AsyncOpenAI(api_key=config.OPENAI_API_KEY or "missing", base_url=config.OPENAI_BASE_URL or None)
_builtin_gemini = genai.Client(
    api_key=config.GEMINI_API_KEY or "missing",
    http_options=gtypes.HttpOptions(api_version="", base_url=config.GEMINI_BASE_URL or None),
)

BUILTIN_TEXT = "builtin"
BUILTIN_IMAGE_GEMINI = "builtin"
BUILTIN_IMAGE_OPENAI = "builtin-openai"
BUILTIN_AUDIO = "builtin"

LANGUAGE_NAMES = {"pt-BR": "Brazilian Portuguese", "en-US": "English"}

# Reference images passed to models: list of (bytes, mime_type)
RefImages = list[tuple[bytes, str]]


def _data_uri(data: bytes, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def _gemini_image_parts(images: RefImages | None) -> list[gtypes.Part]:
    return [gtypes.Part.from_bytes(data=d, mime_type=m) for d, m in (images or [])]


@dataclass
class Engine:
    id: str
    label: str
    source: str  # builtin | mcp
    provider_type: str | None = None
    api_key: str | None = None
    endpoint_url: str | None = None
    default_model: str | None = None
    headers: dict[str, str] = field(default_factory=dict)


def builtin_available() -> bool:
    return bool(config.OPENAI_BASE_URL and config.OPENAI_API_KEY)


def builtin_gemini_available() -> bool:
    return bool(config.GEMINI_BASE_URL and config.GEMINI_API_KEY)


# ------------------------------------------------------------------ capability matrix
MCP_SUPPORT: dict[str, set[str]] = {
    "openai_chatgpt": {"text", "image", "audio"},
    "google_nano_banana": {"text", "image", "audio", "video"},
    "runway": {"image", "video"},
    "custom_mcp": set(),
}

PROVIDER_LABELS = {
    "openai_chatgpt": "OpenAI",
    "google_nano_banana": "Google Gemini",
    "runway": "Runway",
    "custom_mcp": "MCP",
}


def builtin_engines(modality: str) -> list[dict[str, Any]]:
    if modality == "text":
        return [_eng(BUILTIN_TEXT, "PromptFolio AI · GPT (built-in)", builtin_available(), None if builtin_available() else "Built-in AI is not provisioned")]
    if modality == "image":
        return [
            _eng(BUILTIN_IMAGE_GEMINI, "PromptFolio AI · Nano Banana (built-in)", builtin_gemini_available(), None if builtin_gemini_available() else "Built-in Gemini is not provisioned"),
            _eng(BUILTIN_IMAGE_OPENAI, "PromptFolio AI · GPT Image (built-in)", builtin_available(), None if builtin_available() else "Built-in OpenAI is not provisioned"),
        ]
    if modality == "audio":
        return [_eng(BUILTIN_AUDIO, "PromptFolio AI · GPT Audio voice (built-in)", builtin_available(), None if builtin_available() else "Built-in AI is not provisioned")]
    return [
        _eng(
            "builtin",
            "PromptFolio AI (built-in)",
            False,
            "Built-in video generation is not available. Add a Runway or Google (Veo) key in Settings > AI MCP Connectors.",
        )
    ]


def _eng(eid: str, label: str, available: bool, reason: str | None, source: str = "builtin", provider: str | None = None) -> dict[str, Any]:
    return {"id": eid, "label": label, "source": source, "providerType": provider, "available": available, "reason": reason}


def mcp_engine_option(conn_id: str, name: str, provider_type: str, is_active: bool, has_key: bool, modality: str) -> dict[str, Any] | None:
    supported = modality in MCP_SUPPORT.get(provider_type, set())
    if provider_type == "custom_mcp":
        return _eng(conn_id, name, False, "Custom MCP servers are stored and testable; direct execution through custom tools is not supported yet.", "mcp", provider_type)
    if not supported:
        return None
    if not is_active:
        return _eng(conn_id, name, False, "Connection is disabled", "mcp", provider_type)
    if not has_key:
        return _eng(conn_id, name, False, "No API key saved", "mcp", provider_type)
    return _eng(conn_id, f"{name} ({PROVIDER_LABELS.get(provider_type, provider_type)})", True, None, "mcp", provider_type)


# ------------------------------------------------------------------ chat / text
def _openai_for(engine: Engine) -> AsyncOpenAI:
    if engine.source == "builtin":
        return _builtin_openai
    return AsyncOpenAI(api_key=engine.api_key, base_url=engine.endpoint_url or None, default_headers=engine.headers or None)


async def chat_complete(engine: Engine, system: str, messages: list[dict[str, str]], temperature: float | None = None, images: RefImages | None = None) -> str:
    try:
        if engine.source == "builtin" or engine.provider_type == "openai_chatgpt":
            client = _openai_for(engine)
            model = config.BUILTIN_CHAT_MODEL if engine.source == "builtin" else (engine.default_model or "gpt-4o-mini")
            kwargs: dict[str, Any] = {}
            if temperature is not None and not model.startswith(("gpt-5", "o1", "o3", "o4")):
                kwargs["temperature"] = temperature
            oa_messages: list[dict[str, Any]] = [{"role": "system", "content": system}, *messages]
            if images:
                last = oa_messages[-1]
                oa_messages[-1] = {
                    "role": last["role"],
                    "content": [{"type": "text", "text": last["content"]}]
                    + [{"type": "image_url", "image_url": {"url": _data_uri(d, m)}} for d, m in images],
                }
            resp = await client.chat.completions.create(model=model, messages=oa_messages, **kwargs)
            content = resp.choices[0].message.content
            if not content:
                raise EngineError("The model returned an empty response.")
            return content
        if engine.provider_type == "google_nano_banana":
            client = genai.Client(api_key=engine.api_key)
            contents = [
                gtypes.Content(role="model" if m["role"] == "assistant" else "user", parts=[gtypes.Part(text=m["content"])])
                for m in messages
            ]
            if images and contents:
                contents[-1].parts = _gemini_image_parts(images) + list(contents[-1].parts or [])
            resp = await client.aio.models.generate_content(
                model=engine.default_model or "gemini-2.5-flash",
                contents=contents,
                config=gtypes.GenerateContentConfig(system_instruction=system, temperature=temperature),
            )
            if not resp.text:
                raise EngineError("Gemini returned an empty response.")
            return resp.text
    except EngineError:
        raise
    except Exception as exc:  # surface provider errors explicitly
        log.exception("chat completion failed")
        raise EngineError(f"{engine.label}: {exc}") from exc
    raise EngineError(f"{engine.label} cannot generate text.", 400)


async def json_complete(system: str, user: str) -> str:
    resp = await _builtin_openai.chat.completions.create(
        model=config.BUILTIN_FAST_MODEL,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        response_format={"type": "json_object"},
    )
    return resp.choices[0].message.content or "{}"


async def generate_text(engine: Engine, prompt: str, language: str, images: RefImages | None = None) -> str:
    system = (
        "You are the Delivery Executor of PromptFolio. Produce ONLY the final deliverable requested by the prompt, "
        "well formatted in Markdown. No preamble, no follow-up questions, no meta commentary. "
        f"Unless the prompt specifies another language, write in {LANGUAGE_NAMES.get(language, 'English')}."
    )
    return await chat_complete(engine, system, [{"role": "user", "content": prompt}], images=images)


# ------------------------------------------------------------------ visual prompt compiler
# Templates written as chat-assistant instructions (briefing forms, "wait for START", modes...) make image/video
# models answer with text. This step turns them into the final generation prompt the template would produce.
COMPILE_MIN_CHARS = 600


async def compile_visual_prompt(prompt: str, modality: str) -> str | None:
    """Return a direct image/video prompt, or None when the input already is one (or compilation fails)."""
    if len(prompt) < COMPILE_MIN_CHARS:
        return None
    system = (
        f"You prepare prompts for a {modality}-generation model, which can only follow a direct visual description. "
        "You receive a prompt template already filled with the user's values. Decide: "
        "\"direct\" if it is already a description of the image/video to generate (possibly long and detailed); "
        "\"assistant\" if it is instructions for a chat assistant (e.g. collect a briefing, ask questions, operating modes, wait for a command such as START, then output a final prompt). "
        "For \"assistant\": act as that assistant having received every field value shown plus the final command (e.g. START), and write ONLY the final "
        f"{modality}-generation prompt it would deliver, following all its rules, defaults and restrictions. Use only the values actually provided; ignore fields marked as examples; "
        "keep brand names, product names and on-pack texts exactly as given; keep any instruction about attached brand reference images; "
        "write it in the template's language. "
        'Answer ONLY with JSON {"kind": "direct"|"assistant", "prompt": "<final prompt, or empty for direct>"}.'
    )
    try:
        raw = await _builtin_openai.chat.completions.create(
            model=config.BUILTIN_CHAT_MODEL,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt[:30000]}],
            response_format={"type": "json_object"},
        )
        data = json.loads(raw.choices[0].message.content or "{}")
    except Exception:
        log.exception("visual prompt compilation failed; sending the template as-is")
        return None
    compiled = str(data.get("prompt") or "").strip()
    return compiled if data.get("kind") == "assistant" and compiled else None


# ------------------------------------------------------------------ image
OPENAI_SIZES = {"1:1": "1024x1024", "16:9": "1536x1024", "9:16": "1024x1536"}
RUNWAY_IMAGE_RATIOS = {"1:1": "1024:1024", "16:9": "1920:1080", "9:16": "1080:1920"}


async def _gemini_image(client: genai.Client, model: str, prompt: str, aspect: str, images: RefImages | None = None) -> tuple[bytes, str]:
    resp = await client.aio.models.generate_content(
        model=model,
        contents=[gtypes.Content(role="user", parts=[*_gemini_image_parts(images), gtypes.Part(text=prompt)])],
        config=gtypes.GenerateContentConfig(
            response_modalities=["TEXT", "IMAGE"],
            image_config=gtypes.ImageConfig(aspect_ratio=aspect),
        ),
    )
    for cand in resp.candidates or []:
        for part in (cand.content.parts if cand.content else None) or []:
            if part.inline_data and part.inline_data.data:
                data = part.inline_data.data
                if isinstance(data, str):
                    data = base64.b64decode(data)
                return data, part.inline_data.mime_type or "image/png"
    text = " ".join(
        p.text.strip() for c in resp.candidates or [] for p in ((c.content.parts if c.content else None) or []) if getattr(p, "text", None)
    ).strip()
    if text:
        snippet = text[:220] + ("…" if len(text) > 220 else "")
        raise EngineError(f"The image model answered with text instead of an image: \"{snippet}\"")
    raise EngineError("The image model returned no image (the request may have been blocked by safety filters).")


async def _openai_image(client: AsyncOpenAI, model: str, prompt: str, aspect: str, images: RefImages | None = None) -> tuple[bytes, str]:
    size = OPENAI_SIZES.get(aspect, "1024x1024")
    if images:
        ext = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
        files = [(f"brand-reference-{i + 1}.{ext.get(m, 'png')}", d, m) for i, (d, m) in enumerate(images)]
        resp = await client.images.edit(model=model, image=files, prompt=prompt, size=size)
    else:
        resp = await client.images.generate(model=model, prompt=prompt, size=size)
    item = resp.data[0] if resp.data else None
    if item is None:
        raise EngineError("The image model returned no image.")
    if item.b64_json:
        return base64.b64decode(item.b64_json), "image/png"
    if item.url:
        async with httpx.AsyncClient(timeout=60) as http:
            r = await http.get(item.url)
            r.raise_for_status()
            return r.content, r.headers.get("content-type", "image/png")
    raise EngineError("The image model returned no image data.")


async def generate_image(engine: Engine, prompt: str, aspect: str, images: RefImages | None = None) -> tuple[bytes, str]:
    try:
        if engine.source == "builtin":
            if engine.id == BUILTIN_IMAGE_OPENAI:
                return await _openai_image(_builtin_openai, config.BUILTIN_OPENAI_IMAGE_MODEL, prompt, aspect, images)
            return await _gemini_image(_builtin_gemini, config.BUILTIN_IMAGE_MODEL, prompt, aspect, images)
        if engine.provider_type == "openai_chatgpt":
            return await _openai_image(_openai_for(engine), engine.default_model or "gpt-image-1", prompt, aspect, images)
        if engine.provider_type == "google_nano_banana":
            return await _gemini_image(genai.Client(api_key=engine.api_key), engine.default_model or "gemini-2.5-flash-image", prompt, aspect, images)
        if engine.provider_type == "runway":
            body: dict[str, Any] = {"promptText": prompt[:1000], "ratio": RUNWAY_IMAGE_RATIOS.get(aspect, "1024:1024"), "model": engine.default_model or "gen4_image"}
            if images:
                body["referenceImages"] = [{"uri": _data_uri(d, m), "tag": f"brand{i + 1}"} for i, (d, m) in enumerate(images[:3])]
            url = await _runway_task(engine, "/text_to_image", body)
            return await _download(url, "image/png")
    except EngineError:
        raise
    except Exception as exc:
        log.exception("image generation failed")
        raise EngineError(f"{engine.label}: {exc}") from exc
    raise EngineError(f"{engine.label} cannot generate images.", 400)


# ------------------------------------------------------------------ audio
def _pcm_to_wav(pcm: bytes, rate: int = 24000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(pcm)
    return buf.getvalue()


GEMINI_VOICES = {"alloy": "Kore", "echo": "Puck", "fable": "Charon", "onyx": "Fenrir", "nova": "Aoede", "shimmer": "Leda"}


async def generate_audio(engine: Engine, prompt: str, voice: str) -> tuple[bytes, str]:
    voice = voice if voice in GEMINI_VOICES else "alloy"
    try:
        if engine.source == "builtin":
            resp = await _builtin_openai.chat.completions.create(
                model=config.BUILTIN_AUDIO_MODEL,
                modalities=["text", "audio"],
                audio={"voice": voice, "format": "mp3"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a professional voice actor. If the user text is a script, read it aloud exactly, "
                            "word for word, following any bracketed direction (do not read the brackets). If it is a "
                            "description of audio to create, perform the spoken content it describes. Never add comments."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
            )
            audio = getattr(resp.choices[0].message, "audio", None)
            if not audio or not audio.data:
                raise EngineError("The voice model returned no audio.")
            return base64.b64decode(audio.data), "audio/mpeg"
        if engine.provider_type == "openai_chatgpt":
            client = _openai_for(engine)
            resp = await client.audio.speech.create(model=engine.default_model or "gpt-4o-mini-tts", voice=voice, input=prompt[:4096])
            return resp.content, "audio/mpeg"
        if engine.provider_type == "google_nano_banana":
            client = genai.Client(api_key=engine.api_key)
            resp = await client.aio.models.generate_content(
                model=engine.default_model or "gemini-2.5-flash-preview-tts",
                contents=prompt,
                config=gtypes.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=gtypes.SpeechConfig(
                        voice_config=gtypes.VoiceConfig(prebuilt_voice_config=gtypes.PrebuiltVoiceConfig(voice_name=GEMINI_VOICES[voice]))
                    ),
                ),
            )
            part = resp.candidates[0].content.parts[0]
            data = part.inline_data.data
            if isinstance(data, str):
                data = base64.b64decode(data)
            return _pcm_to_wav(data), "audio/wav"
    except EngineError:
        raise
    except Exception as exc:
        log.exception("audio generation failed")
        raise EngineError(f"{engine.label}: {exc}") from exc
    raise EngineError(f"{engine.label} cannot generate audio.", 400)


# ------------------------------------------------------------------ video
RUNWAY_VIDEO_RATIOS = {"16:9": "1280:720", "9:16": "720:1280", "1:1": "960:960"}


async def generate_video(engine: Engine, prompt: str, aspect: str, duration: int, images: RefImages | None = None) -> tuple[bytes, str]:
    if engine.source == "builtin":
        raise EngineError(
            "Built-in video generation is not available. Add a Runway or Google (Veo) API key in Settings > AI MCP Connectors.",
            400,
        )
    try:
        if engine.provider_type == "runway":
            body: dict[str, Any] = {
                "promptText": prompt[:1000],
                "ratio": RUNWAY_VIDEO_RATIOS.get(aspect, "1280:720"),
                "duration": 10 if duration >= 10 else 5,
                "model": engine.default_model or "gen4.5",
            }
            path = "/text_to_video"
            if images:  # first brand reference becomes the starting frame
                path = "/image_to_video"
                body["promptImage"] = _data_uri(*images[0])
            url = await _runway_task(engine, path, body, timeout_s=600)
            return await _download(url, "video/mp4")
        if engine.provider_type == "google_nano_banana":
            client = genai.Client(api_key=engine.api_key)
            model = engine.default_model or "veo-3.0-generate-001"
            cfg: dict[str, Any] = {"aspect_ratio": "9:16" if aspect == "9:16" else "16:9", "number_of_videos": 1}
            if model.startswith("veo-2"):
                cfg["duration_seconds"] = max(5, min(8, duration))
            image = gtypes.Image(image_bytes=images[0][0], mime_type=images[0][1]) if images else None
            operation = await client.aio.models.generate_videos(model=model, prompt=prompt, image=image, config=gtypes.GenerateVideosConfig(**cfg))
            waited = 0
            while not operation.done:
                if waited > 600:
                    raise EngineError("Video generation timed out after 10 minutes.")
                await asyncio.sleep(8)
                waited += 8
                operation = await client.aio.operations.get(operation)
            if operation.error:
                raise EngineError(f"Veo: {operation.error}")
            videos = (operation.response.generated_videos if operation.response else None) or []
            if not videos or not videos[0].video:
                raise EngineError("Veo returned no video (it may have been blocked by safety filters).")
            video = videos[0].video
            if video.video_bytes:
                return video.video_bytes, video.mime_type or "video/mp4"
            async with httpx.AsyncClient(timeout=120, follow_redirects=True) as http:
                r = await http.get(video.uri, headers={"x-goog-api-key": engine.api_key or ""})
                r.raise_for_status()
                return r.content, "video/mp4"
    except EngineError:
        raise
    except Exception as exc:
        log.exception("video generation failed")
        raise EngineError(f"{engine.label}: {exc}") from exc
    raise EngineError(f"{engine.label} cannot generate video.", 400)


# ------------------------------------------------------------------ runway helpers
RUNWAY_BASE = "https://api.dev.runwayml.com/v1"


def _runway_headers(engine: Engine) -> dict[str, str]:
    return {"Authorization": f"Bearer {engine.api_key}", "X-Runway-Version": "2024-11-06", "Content-Type": "application/json"}


async def _runway_task(engine: Engine, path: str, body: dict[str, Any], timeout_s: int = 300) -> str:
    base = (engine.endpoint_url or RUNWAY_BASE).rstrip("/")
    async with httpx.AsyncClient(timeout=60) as http:
        r = await http.post(base + path, json=body, headers=_runway_headers(engine))
        if r.status_code >= 400:
            raise EngineError(f"Runway {r.status_code}: {r.text[:400]}")
        task_id = r.json().get("id")
        waited = 0
        while waited < timeout_s:
            await asyncio.sleep(5)
            waited += 5
            t = await http.get(f"{base}/tasks/{task_id}", headers=_runway_headers(engine))
            if t.status_code >= 400:
                raise EngineError(f"Runway {t.status_code}: {t.text[:400]}")
            data = t.json()
            status = data.get("status")
            if status == "SUCCEEDED":
                output = data.get("output") or []
                if not output:
                    raise EngineError("Runway task finished without output.")
                return output[0]
            if status in ("FAILED", "CANCELLED"):
                raise EngineError(f"Runway task failed: {data.get('failure') or status}")
    raise EngineError("Runway task timed out.")


async def _download(url: str, fallback_mime: str) -> tuple[bytes, str]:
    async with httpx.AsyncClient(timeout=180, follow_redirects=True) as http:
        r = await http.get(url)
        r.raise_for_status()
        return r.content, r.headers.get("content-type", fallback_mime).split(";")[0]


# ------------------------------------------------------------------ connection tests
async def test_engine(engine: Engine) -> tuple[bool, str, str | None]:
    try:
        if engine.provider_type == "openai_chatgpt":
            models = await _openai_for(engine).models.list()
            return True, "OpenAI connection OK", f"{len(models.data)} models available"
        if engine.provider_type == "google_nano_banana":
            client = genai.Client(api_key=engine.api_key)
            pager = await client.aio.models.list(config={"page_size": 5})
            names = [m.name for m in pager.page][:3]
            return True, "Google Gemini connection OK", ", ".join(n for n in names if n)
        if engine.provider_type == "runway":
            async with httpx.AsyncClient(timeout=20) as http:
                r = await http.get(f"{(engine.endpoint_url or RUNWAY_BASE).rstrip('/')}/organization", headers=_runway_headers(engine))
            if r.status_code == 200:
                credits = r.json().get("creditBalance")
                return True, "Runway connection OK", f"Credit balance: {credits}" if credits is not None else None
            return False, f"Runway returned {r.status_code}", r.text[:300]
        if engine.provider_type == "custom_mcp":
            if not engine.endpoint_url:
                return False, "Endpoint URL is required", None
            ok, detail = await probe_mcp_endpoint(engine.endpoint_url, engine.headers, engine.api_key)
            return ok, ("MCP server responded" if ok else "MCP server did not respond correctly"), detail
    except Exception as exc:
        return False, "Connection failed", str(exc)[:400]
    return False, "Unknown provider", None


async def probe_mcp_endpoint(url: str, headers: dict[str, str] | None, api_key: str | None) -> tuple[bool, str]:
    """Send a JSON-RPC `initialize` request (MCP Streamable HTTP); accept SSE endpoints that answer GET."""
    hdrs = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json", **(headers or {})}
    if api_key and "Authorization" not in hdrs:
        hdrs["Authorization"] = f"Bearer {api_key}"
    body = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "PromptFolio", "version": "1.0"}},
    }
    async with httpx.AsyncClient(timeout=15) as http:
        try:
            r = await http.post(url, json=body, headers=hdrs)
            if r.status_code < 400 and ("serverInfo" in r.text or "protocolVersion" in r.text):
                return True, r.text[:300]
            if url.rstrip("/").endswith("/sse"):
                async with http.stream("GET", url, headers=hdrs) as s:
                    if s.status_code < 400:
                        return True, f"SSE stream opened ({s.headers.get('content-type')})"
            return False, f"HTTP {r.status_code}: {r.text[:300]}"
        except httpx.HTTPError as exc:
            return False, str(exc)[:300]
