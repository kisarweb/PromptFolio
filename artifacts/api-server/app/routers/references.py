"""Brand reference image library (`referencia_marca_anexa`)."""
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import undefer

from .. import references as refs
from ..auth import current_user
from ..db import get_db
from ..models import ReferenceImage, User
from ..schemas import ReferenceBulkDeleteInput, ReferenceCleanupInput, ReferenceSettingsInput, ReferenceUpdateInput, ReferenceUploadInput
from ..serializers import iso

router = APIRouter(prefix="/api/references", tags=["references"])


def reference_out(ref: ReferenceImage, deduplicated: bool | None = None) -> dict[str, Any]:
    version = int(ref.created_at.timestamp()) if ref.created_at else 0
    out = {
        "id": str(ref.id),
        "code": ref.code,
        "originalName": ref.original_name,
        "source": ref.source,
        "mimeType": ref.mime_type,
        "width": ref.width,
        "height": ref.height,
        "sizeBytes": ref.size_bytes,
        "useCount": ref.use_count,
        "lastUsedAt": iso(ref.last_used_at),
        "createdAt": iso(ref.created_at),
        "thumbUrl": f"/api/references/{ref.id}/thumb?v={version}",
        "fileUrl": f"/api/references/{ref.id}/file?v={version}",
    }
    if deduplicated is not None:
        out["deduplicated"] = deduplicated
    return out


def _uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except (ValueError, TypeError):
        raise HTTPException(status_code=404, detail="Reference image not found")


async def _owned(db: AsyncSession, user: User, ref_id: str, *load) -> ReferenceImage:
    q = select(ReferenceImage).where(ReferenceImage.id == _uuid(ref_id), ReferenceImage.user_id == user.id)
    for col in load:
        q = q.options(undefer(col))
    ref = (await db.execute(q)).scalar_one_or_none()
    if not ref:
        raise HTTPException(status_code=404, detail="Reference image not found")
    return ref


@router.get("")
async def list_references(
    search: Optional[str] = None,
    sort: Optional[str] = None,
    limit: Optional[int] = None,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(ReferenceImage).where(ReferenceImage.user_id == user.id)
    cond = refs.search_filter(search)
    if cond is not None:
        q = q.where(cond)
    if sort == "size":
        q = q.order_by(ReferenceImage.size_bytes.desc())
    elif sort == "lastUsed":
        q = q.order_by(func.coalesce(ReferenceImage.last_used_at, ReferenceImage.created_at).asc())
    elif sort == "code":
        q = q.order_by(ReferenceImage.code.asc())
    else:
        q = q.order_by(func.coalesce(ReferenceImage.last_used_at, ReferenceImage.created_at).desc())
    q = q.limit(max(1, min(500, limit or 200)))
    return [reference_out(r) for r in (await db.execute(q)).scalars()]


@router.get("/stats")
async def reference_stats(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await refs.library_stats(db, user)


@router.put("/settings")
async def update_reference_settings(body: ReferenceSettingsInput, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    user.reference_autoclean_days = body.autoCleanupDays
    await db.commit()
    if body.autoCleanupDays:
        await refs.cleanup(db, user.id, body.autoCleanupDays, only_never_used=False, dry_run=False)
    return await refs.library_stats(db, user)


@router.post("/cleanup")
async def cleanup_references(body: ReferenceCleanupInput, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await refs.cleanup(db, user.id, body.unusedForDays, body.onlyNeverUsed, body.dryRun)


@router.post("/bulk-delete")
async def bulk_delete_references(body: ReferenceBulkDeleteInput, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    ids = [_uuid(i) for i in body.ids]
    cond = [ReferenceImage.user_id == user.id, ReferenceImage.id.in_(ids)]
    row = (await db.execute(select(func.count(ReferenceImage.id), func.coalesce(func.sum(ReferenceImage.size_bytes), 0)).where(*cond))).one()
    await db.execute(delete(ReferenceImage).where(*cond))
    await db.commit()
    return {"count": int(row[0]), "freedBytes": int(row[1]), "dryRun": False}


@router.post("")
async def upload_reference(body: ReferenceUploadInput, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    raw = refs.decode_data(body.data)
    ref, dedup = await refs.create_reference(db, user, raw, body.filename, body.code, body.source)
    return reference_out(ref, deduplicated=dedup)


@router.patch("/{id}")
async def rename_reference(id: str, body: ReferenceUpdateInput, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    ref = await _owned(db, user, id)
    code = refs.normalize_code(body.code)
    if code != ref.code:
        clash = (await db.execute(select(ReferenceImage.id).where(ReferenceImage.user_id == user.id, ReferenceImage.code == code))).first()
        if clash:
            raise HTTPException(status_code=409, detail=f"The code @{code} is already in use")
        ref.code = code
        await db.commit()
    return reference_out(ref)


@router.delete("/{id}")
async def delete_reference(id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    ref = await _owned(db, user, id)
    freed = ref.size_bytes
    await db.delete(ref)
    await db.commit()
    return {"count": 1, "freedBytes": freed, "dryRun": False}


@router.get("/{id}/thumb")
async def reference_thumb(id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    ref = await _owned(db, user, id, ReferenceImage.thumb)
    return Response(ref.thumb, media_type="image/webp", headers={"Cache-Control": "private, max-age=604800, immutable"})


@router.get("/{id}/file")
async def reference_file(id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    ref = await _owned(db, user, id, ReferenceImage.data)
    return Response(ref.data, media_type=ref.mime_type, headers={"Cache-Control": "private, max-age=604800, immutable"})
