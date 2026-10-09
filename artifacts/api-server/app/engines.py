"""Resolve which engine handles a request: the user's own connections first, built-in (Replit dev only) as fallback."""
import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from . import ai, openrouter
from .crypto import decrypt_data
from .models import McpConnection, User


def engine_from_connection(conn: McpConnection) -> ai.Engine:
    creds = decrypt_data(conn.encrypted_credentials)
    return ai.Engine(
        id=str(conn.id),
        label=f"{conn.name} ({ai.PROVIDER_LABELS.get(conn.provider_type, conn.provider_type)})",
        source="mcp",
        provider_type=conn.provider_type,
        api_key=creds.get("apiKey"),
        endpoint_url=conn.endpoint_url,
        default_model=conn.default_model,
        headers=creds.get("headers") or {},
        models={k: v for k, v in (conn.models or {}).items() if v},
    )


def builtin_engine(modality: str, engine_id: str = "builtin") -> ai.Engine:
    for opt in ai.builtin_engines(modality):
        if opt["id"] == engine_id:
            return ai.Engine(id=opt["id"], label=opt["label"], source="builtin")
    return ai.Engine(id="builtin", label="PromptFolio AI (built-in)", source="builtin")


async def user_connections(db: AsyncSession, user: User) -> list[McpConnection]:
    return list((await db.execute(select(McpConnection).where(McpConnection.user_id == user.id).order_by(McpConnection.created_at))).scalars())


async def capabilities(db: AsyncSession, user: User) -> list[dict]:
    conns = await user_connections(db, user)
    out = []
    for modality in ("image", "video", "audio", "text"):
        engines = list(ai.builtin_engines(modality))
        for c in conns:
            model = ai.resolve_model(c.provider_type, c.default_model, c.models, modality) or None
            opt = ai.mcp_engine_option(str(c.id), c.name, c.provider_type, c.is_active, bool(c.encrypted_credentials), modality, model)
            if not opt:
                continue
            if openrouter.is_openrouter(c.provider_type) and model:
                info = await openrouter.model_info(modality, model) or {}
                if modality == "audio":
                    opt["voices"] = info.get("voices") or None
                if modality == "video":
                    opt["durations"] = info.get("durations") or None
            engines.append(opt)
        if not any(e["available"] for e in engines):
            engines.insert(0, ai.missing_engine_placeholder(modality))
        out.append({"modality": modality, "engines": engines})
    return out


async def resolve_engine(db: AsyncSession, user: User, modality: str, engine_id: str | None, preferred_mcp_id=None) -> ai.Engine:
    caps = next(c for c in await capabilities(db, user) if c["modality"] == modality)["engines"]
    by_id = {e["id"]: e for e in caps}

    if engine_id:
        opt = by_id.get(engine_id)
        if opt is None:
            raise HTTPException(status_code=400, detail=f"Engine {engine_id} cannot generate {modality}")
        if not opt["available"]:
            raise HTTPException(status_code=400, detail=opt.get("reason") or "Engine unavailable")
    else:
        # automatic choice: prompt's preferred MCP -> first available user MCP (video) -> first available built-in
        opt = None
        if preferred_mcp_id and str(preferred_mcp_id) in by_id and by_id[str(preferred_mcp_id)]["available"]:
            opt = by_id[str(preferred_mcp_id)]
        if opt is None:
            ordered = sorted(caps, key=lambda e: 0 if e["source"] == "mcp" else 1)  # the user's own keys first
            opt = next((e for e in ordered if e["available"]), None)
        if opt is None:
            reason = caps[0].get("reason") if caps else None
            raise HTTPException(status_code=400, detail=reason or f"No engine available for {modality}")

    if opt["source"] == "builtin":
        return ai.Engine(id=opt["id"], label=opt["label"], source="builtin")
    conn = await db.get(McpConnection, uuid.UUID(opt["id"]))
    return engine_from_connection(conn)


TEXT_PROVIDERS = ("openai_chatgpt", "google_nano_banana", "openrouter_text")


async def assistant_engine(db: AsyncSession, user: User, preferred_mcp_id=None, required: bool = True) -> ai.Engine | None:
    """Text engine for the app's own AI work (Builder chat, metadata, field docs, prompt compiling).

    Order: the agent's preferred connection -> the user's OpenAI key -> Gemini key -> OpenRouter Text -> built-in (Replit dev only).
    """
    usable = [
        c for c in await user_connections(db, user)
        if c.is_active and c.encrypted_credentials and c.provider_type in TEXT_PROVIDERS
        and (c.provider_type != "openrouter_text" or c.default_model)
    ]
    if preferred_mcp_id:
        preferred = next((c for c in usable if str(c.id) == str(preferred_mcp_id)), None)
        if preferred:
            return engine_from_connection(preferred)
    usable.sort(key=lambda c: TEXT_PROVIDERS.index(c.provider_type))
    if usable:
        return engine_from_connection(usable[0])
    if ai.builtin_available():
        return builtin_engine("text")
    if required:
        raise HTTPException(status_code=400, detail=ai.NO_KEY_REASON)
    return None


async def chat_engine_for_agent(db: AsyncSession, user: User, preferred_mcp_id) -> ai.Engine:
    """Builder chat uses the agent's preferred text-capable connection when usable, else the user's own key."""
    return await assistant_engine(db, user, preferred_mcp_id)
