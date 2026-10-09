import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import Text, cast, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user
from ..db import get_db
from ..engines import assistant_engine
from ..models import Agent, Category, GeneratedAsset, McpConnection, Prompt, User
from .. import variables as var_docs
from ..schemas import CategoryInput, ImportInput, PromptUpdate, SuggestVariablesInput
from ..seed import slugify
from ..serializers import asset_urls, iso, merge_variables, sid, variables_out
from ..storage import upload

router = APIRouter(prefix="/api", tags=["catalog"])

PALETTE = ["#7c5cff", "#ff6b9a", "#2ec4b6", "#ffb020", "#3a86ff", "#ef476f", "#06d6a0", "#f77f00"]


def parse_uuid(value: Optional[str], field: str = "id") -> Optional[uuid.UUID]:
    if value is None or value == "":
        return None
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid {field}")


# ------------------------------------------------------------------ categories
async def category_rows(db: AsyncSession, user: User) -> list[dict[str, Any]]:
    counts = dict(
        (await db.execute(select(Prompt.category_id, func.count()).where(Prompt.user_id == user.id).group_by(Prompt.category_id))).all()
    )
    cats = (await db.execute(select(Category).where(Category.user_id == user.id).order_by(Category.created_at))).scalars().all()
    return [
        {"id": str(c.id), "name": c.name, "slug": c.slug, "color": c.color, "modalityScope": c.modality_scope, "promptCount": counts.get(c.id, 0)}
        for c in cats
    ]


@router.get("/categories")
async def list_categories(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await category_rows(db, user)


async def create_category_row(db: AsyncSession, user: User, name: str, color: str | None = None, scope: str | None = None) -> Category:
    existing_count = (await db.execute(select(func.count()).select_from(Category).where(Category.user_id == user.id))).scalar_one()
    cat = Category(
        user_id=user.id,
        name=name.strip(),
        slug=slugify(name),
        color=color or PALETTE[existing_count % len(PALETTE)],
        modality_scope=scope or "all",
    )
    db.add(cat)
    await db.flush()
    return cat


@router.post("/categories", status_code=201)
async def create_category(body: CategoryInput, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    dup = (await db.execute(select(Category).where(Category.user_id == user.id, func.lower(Category.name) == body.name.strip().lower()))).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=409, detail="A category with this name already exists")
    cat = await create_category_row(db, user, body.name, body.color, body.modalityScope)
    await db.commit()
    return {"id": str(cat.id), "name": cat.name, "slug": cat.slug, "color": cat.color, "modalityScope": cat.modality_scope, "promptCount": 0}


@router.delete("/categories/{id}")
async def delete_category(id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    cat = await db.get(Category, parse_uuid(id))
    if not cat or cat.user_id != user.id:
        raise HTTPException(status_code=404, detail="Category not found")
    await db.execute(update(Prompt).where(Prompt.category_id == cat.id).values(category_id=None))
    await db.execute(update(Agent).where(Agent.category_id == cat.id).values(category_id=None))
    await db.delete(cat)
    await db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ prompt serialization
async def serialize_prompts(db: AsyncSession, prompts: list[Prompt]) -> list[dict[str, Any]]:
    if not prompts:
        return []
    cat_ids = {p.category_id for p in prompts if p.category_id}
    mcp_ids = {p.preferred_mcp_id for p in prompts if p.preferred_mcp_id}
    cats = {c.id: c for c in (await db.execute(select(Category).where(Category.id.in_(cat_ids)))).scalars()} if cat_ids else {}
    mcps = {m.id: m for m in (await db.execute(select(McpConnection).where(McpConnection.id.in_(mcp_ids)))).scalars()} if mcp_ids else {}
    ids = [p.id for p in prompts]
    counts = dict((await db.execute(select(GeneratedAsset.prompt_id, func.count()).where(GeneratedAsset.prompt_id.in_(ids)).group_by(GeneratedAsset.prompt_id))).all())
    ranked = (
        select(
            GeneratedAsset.id,
            GeneratedAsset.prompt_id,
            GeneratedAsset.modality,
            func.row_number().over(partition_by=GeneratedAsset.prompt_id, order_by=GeneratedAsset.created_at.desc()).label("rn"),
        )
        .where(GeneratedAsset.prompt_id.in_(ids))
        .subquery()
    )
    thumbs: dict[uuid.UUID, list[dict[str, Any]]] = {}
    for row in (await db.execute(select(ranked).where(ranked.c.rn <= 4).order_by(ranked.c.prompt_id, ranked.c.rn))).all():
        thumbs.setdefault(row.prompt_id, []).append({"id": str(row.id), "modality": row.modality, "previewUrl": asset_urls(row.id)[0]})
    out = []
    for p in prompts:
        cat = cats.get(p.category_id) if p.category_id else None
        mcp = mcps.get(p.preferred_mcp_id) if p.preferred_mcp_id else None
        out.append(
            {
                "id": str(p.id),
                "title": p.title,
                "description": p.description,
                "promptTemplate": p.prompt_template,
                "variables": variables_out(p.variables_schema),
                "tags": p.tags or [],
                "folder": p.folder,
                "categoryId": sid(p.category_id),
                "categoryName": cat.name if cat else None,
                "categoryColor": cat.color if cat else None,
                "targetModality": p.target_modality,
                "preferredMcpId": sid(p.preferred_mcp_id),
                "preferredMcpName": mcp.name if mcp else None,
                "sourceAgentName": p.source_agent_name,
                "isPublished": p.is_published,
                "version": p.version,
                "recentAssets": thumbs.get(p.id, []),
                "assetCount": counts.get(p.id, 0),
                "createdAt": iso(p.created_at),
                "updatedAt": iso(p.updated_at),
            }
        )
    return out


async def get_owned_prompt(db: AsyncSession, user: User, prompt_id: str) -> Prompt:
    prompt = await db.get(Prompt, parse_uuid(prompt_id))
    if not prompt or prompt.user_id != user.id:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return prompt


# ------------------------------------------------------------------ prompts
@router.get("/prompts")
async def list_prompts(
    search: Optional[str] = None,
    categoryId: Optional[str] = None,
    modality: Optional[str] = None,
    tag: Optional[str] = None,
    folder: Optional[str] = None,
    publishedOnly: Optional[bool] = None,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Prompt).where(Prompt.user_id == user.id)
    if search:
        like = f"%{search.strip()}%"
        q = q.where(or_(Prompt.title.ilike(like), Prompt.description.ilike(like), Prompt.prompt_template.ilike(like), cast(Prompt.tags, Text).ilike(like)))
    if categoryId:
        q = q.where(Prompt.category_id == parse_uuid(categoryId, "categoryId"))
    if modality:
        q = q.where(Prompt.target_modality == modality)
    if tag:
        q = q.where(Prompt.tags.contains([tag]))
    if folder:
        q = q.where(Prompt.folder == folder)
    if publishedOnly:
        q = q.where(Prompt.is_published.is_(True))
    prompts = (await db.execute(q.order_by(Prompt.updated_at.desc()))).scalars().all()
    return await serialize_prompts(db, list(prompts))


@router.get("/prompts/facets")
async def prompt_facets(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    prompts = (await db.execute(select(Prompt.folder, Prompt.tags, Prompt.target_modality).where(Prompt.user_id == user.id))).all()
    folders = sorted({p.folder for p in prompts if p.folder})
    tags = sorted({t for p in prompts for t in (p.tags or [])})
    counts = {m: 0 for m in ("image", "video", "audio", "text")}
    for p in prompts:
        counts[p.target_modality] = counts.get(p.target_modality, 0) + 1
    return {"folders": folders, "tags": tags, "modalityCounts": [{"modality": m, "count": c} for m, c in counts.items()]}


async def build_export(db: AsyncSession, user: User, fmt: str) -> dict[str, Any]:
    prompts = (await db.execute(select(Prompt).where(Prompt.user_id == user.id).order_by(Prompt.created_at))).scalars().all()
    cats = {c.id: c.name for c in (await db.execute(select(Category).where(Category.user_id == user.id))).scalars()}
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    items = [
        {
            "title": p.title,
            "description": p.description,
            "promptTemplate": p.prompt_template,
            "variables": variables_out(p.variables_schema),
            "tags": p.tags or [],
            "folder": p.folder,
            "category": cats.get(p.category_id) if p.category_id else None,
            "targetModality": p.target_modality,
            "version": p.version,
            "isPublished": p.is_published,
        }
        for p in prompts
    ]
    if fmt == "markdown":
        lines = [f"# PromptFolio — {user.name}", "", f"Exported at {datetime.now(timezone.utc).isoformat()} · {len(items)} prompts", ""]
        for it in items:
            lines += [f"## {it['title']}", ""]
            meta = [f"**Modality:** {it['targetModality']}", f"**Version:** v{it['version']}"]
            if it["category"]:
                meta.append(f"**Category:** {it['category']}")
            if it["folder"]:
                meta.append(f"**Folder:** {it['folder']}")
            if it["tags"]:
                meta.append("**Tags:** " + ", ".join(it["tags"]))
            lines.append(" · ".join(meta))
            lines.append("")
            if it["description"]:
                lines += [it["description"], ""]
            lines += ["```", it["promptTemplate"], "```", ""]
            if it["variables"]:
                lines.append("**Variables:** " + ", ".join("{{" + v["name"] + "}}" for v in it["variables"]))
                lines.append("")
        return {"filename": f"promptfolio-{stamp}.md", "mimeType": "text/markdown", "content": "\n".join(lines), "count": len(items)}
    content = json.dumps({"app": "PromptFolio", "schemaVersion": 1, "exportedAt": datetime.now(timezone.utc).isoformat(), "prompts": items}, ensure_ascii=False, indent=2)
    return {"filename": f"promptfolio-{stamp}.json", "mimeType": "application/json", "content": content, "count": len(items)}


@router.get("/prompts/export")
async def export_prompts(format: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if format not in ("json", "markdown"):
        raise HTTPException(status_code=400, detail="format must be json or markdown")
    return await build_export(db, user, format)


@router.post("/prompts/import")
async def import_prompts(body: ImportInput, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    try:
        data = json.loads(body.content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="The file is not valid JSON")
    items = data.get("prompts") if isinstance(data, dict) else data
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="JSON must contain a 'prompts' list (use a PromptFolio JSON export)")
    existing = {(p.title, p.prompt_template) for p in (await db.execute(select(Prompt).where(Prompt.user_id == user.id))).scalars()}
    cats = {c.name.lower(): c for c in (await db.execute(select(Category).where(Category.user_id == user.id))).scalars()}
    imported = skipped = 0
    for it in items:
        if not isinstance(it, dict):
            skipped += 1
            continue
        title = str(it.get("title") or "").strip()
        template = str(it.get("promptTemplate") or "").strip()
        modality = it.get("targetModality")
        if not title or not template or modality not in ("image", "video", "audio", "text") or (title, template) in existing:
            skipped += 1
            continue
        cat_id = None
        cat_name = (it.get("category") or "").strip()
        if cat_name:
            cat = cats.get(cat_name.lower())
            if cat is None:
                cat = await create_category_row(db, user, cat_name)
                cats[cat_name.lower()] = cat
            cat_id = cat.id
        db.add(
            Prompt(
                user_id=user.id,
                title=title[:255],
                description=it.get("description"),
                prompt_template=template,
                variables_schema=merge_variables(template, it.get("variables") if isinstance(it.get("variables"), list) else []),
                tags=[str(t) for t in (it.get("tags") or []) if t][:30],
                folder=it.get("folder"),
                category_id=cat_id,
                target_modality=modality,
                is_published=bool(it.get("isPublished", True)),
                version=int(it.get("version") or 1),
            )
        )
        existing.add((title, template))
        imported += 1
    await db.commit()
    return {"imported": imported, "skipped": skipped}


@router.post("/prompts/backup")
async def backup_prompts(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    bundle = await build_export(db, user, "json")
    result = await upload(db, user, ["Backups"], bundle["filename"], bundle["content"].encode(), "application/json")
    return {"provider": result.provider, "status": result.status, "filename": bundle["filename"], "remoteViewUrl": result.view_url, "message": result.message}


@router.post("/prompts/suggest-variables")
async def suggest_variables(body: SuggestVariablesInput, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """AI-written purpose, examples and required flag for every {{variable}}; existing non-empty fields are kept."""
    existing = [v.model_dump() for v in body.variables] if body.variables else []
    engine = await assistant_engine(db, user)
    return {"variables": await var_docs.suggest_docs(engine, body.promptTemplate, user.language, existing)}


@router.get("/prompts/{id}")
async def get_prompt(id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    prompt = await get_owned_prompt(db, user, id)
    return (await serialize_prompts(db, [prompt]))[0]


@router.patch("/prompts/{id}")
async def update_prompt(id: str, body: PromptUpdate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    prompt = await get_owned_prompt(db, user, id)
    fields = body.model_fields_set
    if "title" in fields and body.title:
        prompt.title = body.title
    if "description" in fields:
        prompt.description = body.description
    template_changed = "promptTemplate" in fields and body.promptTemplate and body.promptTemplate != prompt.prompt_template
    if template_changed:
        prompt.prompt_template = body.promptTemplate
        prompt.version += 1
    if "variables" in fields or template_changed:
        provided = [v.model_dump() for v in body.variables] if body.variables is not None else (prompt.variables_schema or [])
        prompt.variables_schema = merge_variables(prompt.prompt_template, provided)
    if "tags" in fields and body.tags is not None:
        prompt.tags = [t.strip() for t in body.tags if t.strip()]
    if "folder" in fields:
        prompt.folder = body.folder or None
    if "categoryId" in fields:
        prompt.category_id = parse_uuid(body.categoryId, "categoryId")
    if "targetModality" in fields and body.targetModality:
        prompt.target_modality = body.targetModality
    if "preferredMcpId" in fields:
        prompt.preferred_mcp_id = parse_uuid(body.preferredMcpId, "preferredMcpId")
    if "isPublished" in fields and body.isPublished is not None:
        prompt.is_published = body.isPublished
    prompt.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return (await serialize_prompts(db, [prompt]))[0]


@router.delete("/prompts/{id}")
async def delete_prompt(id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    prompt = await get_owned_prompt(db, user, id)
    await db.delete(prompt)
    await db.commit()
    return {"ok": True}
