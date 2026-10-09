"""Resolve which generation engine handles a request (built-in or a user MCP connection)."""
import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from . import ai
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
            opt = ai.mcp_engine_option(str(c.id), c.name, c.provider_type, c.is_active, bool(c.encrypted_credentials), modality)
            if opt:
                engines.append(opt)
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
            ordered = sorted(caps, key=lambda e: 0 if e["source"] == "builtin" else 1)
            opt = next((e for e in ordered if e["available"]), None)
        if opt is None:
            reason = caps[0].get("reason") if caps else None
            raise HTTPException(status_code=400, detail=reason or f"No engine available for {modality}")

    if opt["source"] == "builtin":
        return ai.Engine(id=opt["id"], label=opt["label"], source="builtin")
    conn = await db.get(McpConnection, uuid.UUID(opt["id"]))
    return engine_from_connection(conn)


async def chat_engine_for_agent(db: AsyncSession, user: User, preferred_mcp_id) -> ai.Engine:
    """Builder chat uses the agent's preferred text-capable connection when usable, else built-in."""
    if preferred_mcp_id:
        conn = await db.get(McpConnection, preferred_mcp_id)
        if conn and conn.user_id == user.id and conn.is_active and conn.encrypted_credentials and conn.provider_type in ("openai_chatgpt", "google_nano_banana"):
            return engine_from_connection(conn)
    return builtin_engine("text")
