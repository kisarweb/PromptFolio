from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user
from ..db import get_db
from ..models import Agent, Category, ChatSession, User
from ..schemas import AgentInput, AgentUpdate
from ..serializers import agent_out
from .catalog import parse_uuid

router = APIRouter(prefix="/api/agents", tags=["agents"])


async def agent_with_category(db: AsyncSession, agent: Agent) -> dict:
    name = None
    if agent.category_id:
        cat = await db.get(Category, agent.category_id)
        name = cat.name if cat else None
    return agent_out(agent, name)


def visible_to(user: User):
    return or_(Agent.user_id.is_(None), Agent.user_id == user.id)


async def get_visible_agent(db: AsyncSession, user: User, agent_id: str) -> Agent:
    agent = await db.get(Agent, parse_uuid(agent_id, "agentId"))
    if not agent or (agent.user_id is not None and agent.user_id != user.id):
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.get("")
async def list_agents(role: Optional[str] = None, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    q = select(Agent).where(visible_to(user))
    if role:
        q = q.where(Agent.agent_role == role)
    agents = (await db.execute(q.order_by(Agent.is_system_default.desc(), Agent.created_at))).scalars().all()
    cats = {c.id: c.name for c in (await db.execute(select(Category).where(Category.user_id == user.id))).scalars()}
    return [agent_out(a, cats.get(a.category_id) if a.category_id else None) for a in agents]


@router.post("", status_code=201)
async def create_agent(body: AgentInput, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    agent = Agent(
        user_id=user.id,
        name=body.name.strip(),
        description=body.description,
        agent_role=body.agentRole,
        system_prompt=body.systemPrompt,
        category_id=parse_uuid(body.categoryId, "categoryId"),
        preferred_mcp_id=parse_uuid(body.preferredMcpId, "preferredMcpId"),
        temperature=body.temperature if body.temperature is not None else 0.7,
        is_system_default=False,
        is_published=True,
        is_active=True,
    )
    db.add(agent)
    await db.commit()
    return await agent_with_category(db, agent)


@router.patch("/{id}")
async def update_agent(id: str, body: AgentUpdate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    agent = await get_visible_agent(db, user, id)
    fields = body.model_fields_set
    if "name" in fields and body.name:
        agent.name = body.name.strip()
    if "description" in fields:
        agent.description = body.description
    if "systemPrompt" in fields and body.systemPrompt:
        agent.system_prompt = body.systemPrompt
    if "categoryId" in fields:
        agent.category_id = parse_uuid(body.categoryId, "categoryId")
    if "preferredMcpId" in fields:
        agent.preferred_mcp_id = parse_uuid(body.preferredMcpId, "preferredMcpId")
    if "temperature" in fields and body.temperature is not None:
        agent.temperature = max(0.0, min(2.0, body.temperature))
    if "isActive" in fields and body.isActive is not None:
        agent.is_active = body.isActive
    if "isPublished" in fields and body.isPublished is not None:
        agent.is_published = body.isPublished
    await db.commit()
    return await agent_with_category(db, agent)


@router.delete("/{id}")
async def delete_agent(id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    agent = await get_visible_agent(db, user, id)
    if agent.is_system_default or agent.user_id is None:
        raise HTTPException(status_code=403, detail="Factory agents cannot be deleted; you can deactivate them instead")
    await db.execute(update(ChatSession).where(ChatSession.locked_agent_id == agent.id).values(locked_agent_id=None))
    await db.delete(agent)
    await db.commit()
    return {"ok": True}
