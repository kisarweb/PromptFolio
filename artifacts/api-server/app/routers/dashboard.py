from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user
from ..db import get_db
from ..models import Agent, ChatSession, GeneratedAsset, McpConnection, Prompt, User
from ..serializers import iso

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
MODALITIES = ("image", "video", "audio", "text")


async def _count(db: AsyncSession, stmt) -> int:
    return (await db.execute(stmt)).scalar_one()


async def _by_modality(db: AsyncSession, column, model, user: User) -> list[dict]:
    rows = dict((await db.execute(select(column, func.count()).where(model.user_id == user.id).group_by(column))).all())
    return [{"modality": m, "count": rows.get(m, 0)} for m in MODALITIES]


@router.get("/summary")
async def summary(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return {
        "totalPrompts": await _count(db, select(func.count()).select_from(Prompt).where(Prompt.user_id == user.id)),
        "publishedPrompts": await _count(db, select(func.count()).select_from(Prompt).where(Prompt.user_id == user.id, Prompt.is_published.is_(True))),
        "totalAgents": await _count(db, select(func.count()).select_from(Agent).where(or_(Agent.user_id.is_(None), Agent.user_id == user.id))),
        "customAgents": await _count(db, select(func.count()).select_from(Agent).where(Agent.user_id == user.id)),
        "builderSessions": await _count(db, select(func.count()).select_from(ChatSession).where(ChatSession.user_id == user.id)),
        "totalAssets": await _count(db, select(func.count()).select_from(GeneratedAsset).where(GeneratedAsset.user_id == user.id)),
        "assetsByModality": await _by_modality(db, GeneratedAsset.modality, GeneratedAsset, user),
        "promptsByModality": await _by_modality(db, Prompt.target_modality, Prompt, user),
        "activeStorageProvider": user.active_storage_provider,
        "activeMcpConnections": await _count(db, select(func.count()).select_from(McpConnection).where(McpConnection.user_id == user.id, McpConnection.is_active.is_(True))),
    }


@router.get("/activity")
async def activity(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    items: list[dict] = []
    for p in (await db.execute(select(Prompt).where(Prompt.user_id == user.id, Prompt.is_published.is_(True)).order_by(Prompt.updated_at.desc()).limit(10))).scalars():
        items.append({"id": f"p-{p.id}", "kind": "prompt_published", "title": p.title, "modality": p.target_modality, "storageProvider": None, "createdAt": iso(p.updated_at)})
    for a in (await db.execute(select(Agent).where(Agent.user_id == user.id).order_by(Agent.created_at.desc()).limit(5))).scalars():
        items.append({"id": f"a-{a.id}", "kind": "agent_published", "title": a.name, "modality": None, "storageProvider": None, "createdAt": iso(a.created_at)})
    for g in (await db.execute(select(GeneratedAsset).where(GeneratedAsset.user_id == user.id).order_by(GeneratedAsset.created_at.desc()).limit(10))).scalars():
        items.append({"id": f"g-{g.id}", "kind": "asset_generated", "title": g.prompt_title or g.filename, "modality": g.modality, "storageProvider": g.storage_provider_used, "createdAt": iso(g.created_at)})
    for s in (await db.execute(select(ChatSession).where(ChatSession.user_id == user.id).order_by(ChatSession.created_at.desc()).limit(5))).scalars():
        items.append({"id": f"s-{s.id}", "kind": "session_started", "title": s.title, "modality": None, "storageProvider": None, "createdAt": iso(s.created_at)})
    items.sort(key=lambda i: i["createdAt"] or "", reverse=True)
    return items[:15]
