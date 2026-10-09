import asyncio
import json
import logging
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import ai
from ..auth import current_user
from ..db import get_db
from ..engines import assistant_engine, chat_engine_for_agent
from ..models import Agent, ChatMessage, ChatSession, Prompt, User
from ..schemas import ChatMessageInput, ChatSessionInput, PublishInput
from .. import variables as var_docs
from ..serializers import merge_variables, message_out, session_out
from .agents import agent_with_category, get_visible_agent
from .catalog import parse_uuid, serialize_prompts

log = logging.getLogger("promptfolio.builder")
router = APIRouter(prefix="/api/builder", tags=["builder"])

WORKSPACE_ROLE = {"builder_agent": "meta_agent_builder", "builder_prompt": "prompt_builder"}
DEFAULT_TITLES = {"pt-BR": "Nova sessão", "en-US": "New session"}
BLOCK_RE = re.compile(r"```(prompt|system)[^\n]*\n(.*?)```", re.DOTALL | re.IGNORECASE)
SEED_MODALITY = {"prompt-image": "image", "prompt-video": "video", "prompt-audio": "audio", "prompt-text": "text"}


async def get_owned_session(db: AsyncSession, user: User, session_id: str) -> ChatSession:
    s = await db.get(ChatSession, parse_uuid(session_id))
    if not s or s.user_id != user.id or s.workspace_type not in WORKSPACE_ROLE:
        raise HTTPException(status_code=404, detail="Session not found")
    return s


async def message_count(db: AsyncSession, session_id) -> int:
    return (await db.execute(select(func.count()).select_from(ChatMessage).where(ChatMessage.session_id == session_id))).scalar_one()


async def history(db: AsyncSession, session_id) -> list[ChatMessage]:
    return list((await db.execute(select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at, ChatMessage.id))).scalars())


@router.get("/sessions")
async def list_sessions(workspaceType: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if workspaceType not in WORKSPACE_ROLE:
        raise HTTPException(status_code=400, detail="Invalid workspaceType")
    sessions = (
        await db.execute(select(ChatSession).where(ChatSession.user_id == user.id, ChatSession.workspace_type == workspaceType).order_by(ChatSession.created_at.desc()))
    ).scalars().all()
    ids = [s.id for s in sessions]
    counts = dict((await db.execute(select(ChatMessage.session_id, func.count()).where(ChatMessage.session_id.in_(ids)).group_by(ChatMessage.session_id))).all()) if ids else {}
    return [session_out(s, counts.get(s.id, 0)) for s in sessions]


@router.post("/sessions", status_code=201)
async def create_session(body: ChatSessionInput, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    s = ChatSession(user_id=user.id, workspace_type=body.workspaceType, title=(body.title or "").strip() or DEFAULT_TITLES.get(user.language, "New session"))
    db.add(s)
    await db.commit()
    return session_out(s, 0)


@router.get("/sessions/{id}")
async def get_session_detail(id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    s = await get_owned_session(db, user, id)
    msgs = await history(db, s.id)
    agent = await db.get(Agent, s.locked_agent_id) if s.locked_agent_id else None
    return {
        "session": session_out(s, len(msgs)),
        "lockedAgent": await agent_with_category(db, agent) if agent else None,
        "messages": [message_out(m) for m in msgs],
    }


@router.delete("/sessions/{id}")
async def delete_session(id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    s = await get_owned_session(db, user, id)
    await db.delete(s)
    await db.commit()
    return {"ok": True}


def language_directive(lang: str) -> str:
    name = ai.LANGUAGE_NAMES.get(lang, "English")
    return f"\n\nInterface language: reply to the user in {name} unless they write in another language. Keep fenced block tags exactly as specified."


@router.post("/sessions/{id}/messages")
async def send_message(id: str, body: ChatMessageInput, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    s = await get_owned_session(db, user, id)
    newly_locked = False
    if s.locked_agent_id is None:
        if s.locked_agent_name:
            raise HTTPException(status_code=409, detail="The agent locked to this session no longer exists. Start a new session.")
        if not body.agentId:
            raise HTTPException(status_code=400, detail="Choose an agent before sending the first message")
        agent = await get_visible_agent(db, user, body.agentId)
        if agent.agent_role != WORKSPACE_ROLE[s.workspace_type]:
            raise HTTPException(status_code=400, detail="This agent does not belong to this studio")
        if not agent.is_active:
            raise HTTPException(status_code=400, detail="This agent is deactivated")
        s.locked_agent_id = agent.id
        s.locked_agent_name = agent.name
        newly_locked = True
    else:
        if body.agentId and parse_uuid(body.agentId, "agentId") != s.locked_agent_id:
            raise HTTPException(status_code=409, detail="This session is locked to another agent. Start a new session to switch agents.")
        agent = await db.get(Agent, s.locked_agent_id)
        if agent is None:
            raise HTTPException(status_code=409, detail="The agent locked to this session no longer exists. Start a new session.")

    prior = await history(db, s.id)
    user_msg = ChatMessage(session_id=s.id, role="user", content=body.content.strip())
    db.add(user_msg)
    await db.flush()

    engine = await chat_engine_for_agent(db, user, agent.preferred_mcp_id)
    convo = [{"role": m.role, "content": m.content} for m in prior] + [{"role": "user", "content": user_msg.content}]
    try:
        reply = await ai.chat_complete(engine, agent.system_prompt + language_directive(user.language), convo, agent.temperature)
    except ai.EngineError as exc:
        await db.rollback()  # discards the user message and the lock set in this request
        raise HTTPException(status_code=exc.status if exc.code else 502, detail=exc.localized(user.language) if exc.code else f"AI engine error: {exc.message}")

    assistant_msg = ChatMessage(session_id=s.id, role="assistant", content=reply)
    db.add(assistant_msg)
    if not prior and s.title in DEFAULT_TITLES.values():
        title = re.sub(r"\s+", " ", user_msg.content)[:60]
        s.title = title + ("…" if len(user_msg.content) > 60 else "")
    await db.commit()
    _ = newly_locked
    return {
        "session": session_out(s, len(prior) + 2),
        "userMessage": message_out(user_msg),
        "assistantMessage": message_out(assistant_msg),
    }


def extract_block(messages: list[ChatMessage]) -> str | None:
    for m in reversed(messages):
        if m.role != "assistant":
            continue
        blocks = BLOCK_RE.findall(m.content)
        if blocks:
            return blocks[-1][1].strip()
    return None


@router.get("/sessions/{id}/draft")
async def get_draft(id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    s = await get_owned_session(db, user, id)
    msgs = await history(db, s.id)
    assistant = [m for m in msgs if m.role == "assistant"]
    if not assistant:
        raise HTTPException(status_code=400, detail="Talk to the agent first: there is nothing to publish yet")
    kind = "agent" if s.workspace_type == "builder_agent" else "prompt"
    content = extract_block(msgs) or assistant[-1].content.strip()
    agent = await db.get(Agent, s.locked_agent_id) if s.locked_agent_id else None
    fallback_modality = SEED_MODALITY.get(agent.seed_key or "", "text") if agent else "text"

    meta: dict = {}
    convo_excerpt = "\n\n".join(f"{m.role.upper()}: {m.content[:1500]}" for m in msgs[-8:])
    lang = ai.LANGUAGE_NAMES.get(user.language, "English")
    helper = await assistant_engine(db, user, required=False)  # without a key the draft still opens, just without AI metadata

    async def documented_variables() -> list[dict]:
        if kind != "prompt":
            return []
        if helper is None:
            return merge_variables(content, [])
        try:
            return await var_docs.suggest_docs(helper, content, user.language)
        except Exception:
            log.exception("variable documentation failed; publishing without it")
            return merge_variables(content, [])

    docs_task = asyncio.create_task(documented_variables())
    try:
        if helper is None:
            raise ai.EngineError(ai.NO_KEY_REASON, 400)
        raw = await ai.json_complete(
            helper,
            "You extract catalog metadata for a prompt library. Answer ONLY with a JSON object with keys: "
            '"title" (max 60 chars), "description" (1-2 sentences), "tags" (3-6 short lowercase tags), '
            '"targetModality" (one of image, video, audio, text), "suggestedMcpProvider" (one of google_nano_banana, openai_chatgpt, runway or null). '
            f"Write title, description and tags in {lang}.",
            f"Kind: {kind}\n\nFinal content:\n{content[:6000]}\n\nConversation excerpt:\n{convo_excerpt[:6000]}",
        )
        meta = json.loads(raw)
    except Exception:
        log.exception("draft metadata extraction failed; using fallbacks")

    modality = meta.get("targetModality") if meta.get("targetModality") in ("image", "video", "audio", "text") else fallback_modality
    if agent and agent.seed_key in SEED_MODALITY:
        modality = SEED_MODALITY[agent.seed_key]
    if kind == "agent":
        modality = "text"
    suggested = meta.get("suggestedMcpProvider") if meta.get("suggestedMcpProvider") in ("google_nano_banana", "openai_chatgpt", "runway") else None
    tags = [str(t).strip().lower() for t in (meta.get("tags") or []) if str(t).strip()][:8]
    return {
        "kind": kind,
        "title": (str(meta.get("title") or "").strip() or s.title)[:120],
        "description": meta.get("description") or None,
        "content": content,
        "variables": await docs_task,
        "tags": tags,
        "targetModality": modality,
        "suggestedMcpProvider": suggested,
    }


@router.post("/sessions/{id}/publish")
async def publish(id: str, body: PublishInput, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    s = await get_owned_session(db, user, id)
    expected = "agent" if s.workspace_type == "builder_agent" else "prompt"
    if body.kind != expected:
        raise HTTPException(status_code=400, detail=f"This studio publishes {expected}s")

    if body.kind == "prompt":
        provided = [v.model_dump() for v in body.variables] if body.variables else []
        prompt = await db.get(Prompt, s.published_prompt_id) if s.published_prompt_id else None
        if prompt and prompt.user_id == user.id:
            if prompt.prompt_template != body.content:
                prompt.version += 1
            prompt.prompt_template = body.content
        else:
            prompt = Prompt(user_id=user.id, prompt_template=body.content, version=1, source_agent_name=s.locked_agent_name)
            db.add(prompt)
        prompt.title = body.title.strip()
        prompt.description = body.description
        prompt.variables_schema = merge_variables(body.content, provided)
        prompt.tags = [t.strip() for t in (body.tags or []) if t.strip()]
        prompt.folder = body.folder or None
        prompt.category_id = parse_uuid(body.categoryId, "categoryId")
        prompt.target_modality = body.targetModality or "text"
        prompt.preferred_mcp_id = parse_uuid(body.preferredMcpId, "preferredMcpId")
        prompt.is_published = True
        await db.flush()
        s.published_prompt_id = prompt.id
        await db.commit()
        return {"kind": "prompt", "prompt": (await serialize_prompts(db, [prompt]))[0], "agent": None}

    agent = await db.get(Agent, s.published_agent_id) if s.published_agent_id else None
    if not agent or agent.user_id != user.id:
        agent = Agent(user_id=user.id, is_system_default=False, is_active=True, temperature=0.7, agent_role=body.agentRole or "prompt_builder")
        db.add(agent)
    agent.name = body.title.strip()
    agent.description = body.description
    agent.system_prompt = body.content
    if body.agentRole:
        agent.agent_role = body.agentRole
    agent.category_id = parse_uuid(body.categoryId, "categoryId")
    agent.preferred_mcp_id = parse_uuid(body.preferredMcpId, "preferredMcpId")
    agent.is_published = True
    await db.flush()
    s.published_agent_id = agent.id
    await db.commit()
    return {"kind": "agent", "prompt": None, "agent": await agent_with_category(db, agent)}
