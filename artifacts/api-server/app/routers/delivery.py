import logging
import mimetypes
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, RedirectResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import ai, config
from .. import references as refs
from ..auth import current_user
from ..db import get_db
from ..engines import assistant_engine, capabilities, resolve_engine
from ..models import Category, GeneratedAsset, User
from ..schemas import ExecuteInput
from ..seed import slugify
from ..serializers import VARIABLE_RE, asset_out
from ..variables import is_required, validate_and_fill
from ..storage import MODALITY_FOLDERS, upload
from .catalog import get_owned_prompt, parse_uuid

log = logging.getLogger("promptfolio.delivery")
router = APIRouter(prefix="/api/delivery", tags=["delivery"])

EXTENSIONS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "text/markdown": "md",
}


@router.get("/capabilities")
async def get_capabilities(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await capabilities(db, user)


@router.post("/execute")
async def execute(body: ExecuteInput, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    prompt = await get_owned_prompt(db, user, body.promptId)
    brand = body.brandReferences or []
    # Image/video/text models receive the actual pixels; audio only gets the textual reference.
    attach_pixels = bool(brand) and body.modality in ("image", "video", "text")
    resolved = await refs.resolve_for_run(db, user, brand, need_pixels=attach_pixels)
    brand_text = refs.describe(resolved, attached=attach_pixels, language=user.language)
    t = refs.texts(user.language)
    brand_var = next((v for v in (prompt.variables_schema or []) if v.get("name") == refs.VARIABLE_NAME), None)
    if brand_var and is_required(brand_var) and not brand:
        label = brand_var.get("label") or refs.VARIABLE_NAME
        raise HTTPException(status_code=400, detail=f"Fill in the required fields: {label} (attach at least one brand reference image)")
    final_prompt = validate_and_fill(
        prompt.prompt_template, prompt.variables_schema or [], body.variables or {}, forced={refs.VARIABLE_NAME: brand_text}
    )
    has_placeholder = refs.VARIABLE_NAME in {m.group(1).strip() for m in VARIABLE_RE.finditer(prompt.prompt_template)}
    if resolved and not has_placeholder:
        final_prompt += "\n\n" + t["suffix"].format(var=refs.VARIABLE_NAME, value=brand_text)
    if resolved and attach_pixels:
        final_prompt += "\n\n" + t["usage"]
    if body.extraInstructions and body.extraInstructions.strip():
        final_prompt = f"{final_prompt}\n\n{body.extraInstructions.strip()}"
    if body.modality in ("image", "video"):
        helper = await assistant_engine(db, user, required=False)
        compiled = await ai.compile_visual_prompt(helper, final_prompt, body.modality) if helper else None
        if compiled:
            final_prompt = compiled + ("\n\n" + t["usage"] if resolved and attach_pixels and t["usage"] not in compiled else "")
    images = [(r.data, r.mime) for r in resolved if r.data] if attach_pixels else None

    engine = await resolve_engine(db, user, body.modality, body.engineId, prompt.preferred_mcp_id)
    aspect = body.aspectRatio or ("16:9" if body.modality == "video" else "1:1")
    duration = max(4, min(10, body.durationSeconds or 5))
    text_content: Optional[str] = None
    try:
        if body.modality == "text":
            text_content = await ai.generate_text(engine, final_prompt, user.language, images)
            data, mime = text_content.encode("utf-8"), "text/markdown"
        elif body.modality == "image":
            data, mime = await ai.generate_image(engine, final_prompt, aspect, images)
        elif body.modality == "audio":
            data, mime = await ai.generate_audio(engine, final_prompt, body.voice or "alloy")
        else:
            data, mime = await ai.generate_video(engine, final_prompt, aspect, duration, images)
    except ai.EngineError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.localized(user.language))

    category = await db.get(Category, prompt.category_id) if prompt.category_id else None
    category_name = category.name if category else "Geral"
    ext = EXTENSIONS.get(mime) or (mimetypes.guess_extension(mime) or ".bin").lstrip(".")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    filename = f"{slugify(prompt.title)[:60]}-{stamp}.{ext}"

    asset_id = uuid.uuid4()
    local_path: Optional[Path] = None
    if text_content is None:
        user_dir = config.MEDIA_DIR / str(user.id)
        user_dir.mkdir(parents=True, exist_ok=True)
        local_path = user_dir / f"{asset_id}.{ext}"
        local_path.write_bytes(data)

    stored = await upload(db, user, [MODALITY_FOLDERS[body.modality], category_name], filename, data, mime)
    asset = GeneratedAsset(
        id=asset_id,
        user_id=user.id,
        prompt_id=prompt.id,
        prompt_title=prompt.title,
        category_name=category_name,
        modality=body.modality,
        final_prompt=final_prompt,
        text_content=text_content,
        filename=filename,
        local_path=str(local_path) if local_path else None,
        aspect_ratio=aspect if body.modality in ("image", "video") else None,
        duration_seconds=duration if body.modality == "video" else None,
        engine_label=engine.label,
        storage_provider_used=stored.provider,
        storage_status=stored.status,
        storage_message=stored.message,
        remote_file_id_or_key=stored.key,
        remote_view_url=stored.view_url,
        mime_type=mime,
        file_size_bytes=len(data),
    )
    db.add(asset)
    await refs.mark_used(db, user, brand)
    await db.commit()
    return asset_out(asset)


@router.get("/assets")
async def list_assets(
    modality: Optional[str] = None,
    promptId: Optional[str] = None,
    limit: Optional[int] = None,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(GeneratedAsset).where(GeneratedAsset.user_id == user.id)
    if modality:
        q = q.where(GeneratedAsset.modality == modality)
    if promptId:
        q = q.where(GeneratedAsset.prompt_id == parse_uuid(promptId, "promptId"))
    q = q.order_by(GeneratedAsset.created_at.desc()).limit(max(1, min(200, limit or 60)))
    return [asset_out(a) for a in (await db.execute(q)).scalars()]


async def get_owned_asset(db: AsyncSession, user: User, asset_id: str) -> GeneratedAsset:
    asset = await db.get(GeneratedAsset, parse_uuid(asset_id))
    if not asset or asset.user_id != user.id:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


@router.delete("/assets/{id}")
async def delete_asset(id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    asset = await get_owned_asset(db, user, id)
    if asset.local_path:
        Path(asset.local_path).unlink(missing_ok=True)
    await db.delete(asset)
    await db.commit()
    return {"ok": True}


@router.get("/assets/{id}/file")
async def asset_file(id: str, download: Optional[int] = None, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    asset = await get_owned_asset(db, user, id)
    disposition = f"{'attachment' if download else 'inline'}; filename*=UTF-8''{quote(asset.filename)}"
    if asset.text_content is not None:
        return Response(asset.text_content.encode("utf-8"), media_type="text/markdown; charset=utf-8", headers={"Content-Disposition": disposition})
    if asset.local_path and Path(asset.local_path).exists():
        return FileResponse(asset.local_path, media_type=asset.mime_type, headers={"Content-Disposition": disposition, "Cache-Control": "private, max-age=86400"})
    if asset.remote_view_url:
        return RedirectResponse(asset.remote_view_url, status_code=302)
    raise HTTPException(status_code=404, detail="The local copy is no longer available and there is no remote copy")
