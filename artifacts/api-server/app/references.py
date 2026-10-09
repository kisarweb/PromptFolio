"""Brand reference images (`referencia_marca_anexa`).

Three ways to provide a reference in the Executor:
  * a public URL (not stored; downloaded on the fly when a model needs the pixels),
  * an uploaded file or a pasted image (stored in the `reference_images` table),
  * an existing library image picked by its unique `@code`.
"""
import asyncio
import base64
import hashlib
import io
import ipaddress
import logging
import re
import secrets
import socket
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import undefer

from .models import ReferenceImage, User

log = logging.getLogger("promptfolio.references")

VARIABLE_NAME = "referencia_marca_anexa"
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
MAX_URL_BYTES = 12 * 1024 * 1024
MAX_SIDE = 2048
THUMB_SIDE = 256
MAX_REFERENCES_PER_RUN = 4
CODE_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,39}$")
GENERIC_NAMES = {"image", "imagem", "img", "clipboard", "blob", "untitled", "download", "screenshot", "captura", "foto", "photo", "pasted"}
KEEP_FORMATS = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}


# ------------------------------------------------------------------ helpers
def _slug(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def normalize_code(raw: str) -> str:
    code = _slug(raw.lstrip("@"))[:40]
    if not CODE_RE.match(code):
        raise HTTPException(status_code=400, detail="Invalid code: use 2-40 lowercase letters, numbers, '-' or '_'")
    return code


async def _unique_code(db: AsyncSession, user_id, base: str) -> str:
    base = base[:32].strip("-_") or "ref"
    if len(base) < 2:
        base = f"ref-{base}"
    taken = set(
        (await db.execute(select(ReferenceImage.code).where(ReferenceImage.user_id == user_id, ReferenceImage.code.like(f"{base}%")))).scalars()
    )
    if base not in taken:
        return base
    n = 2
    while f"{base}-{n}" in taken:
        n += 1
    return f"{base}-{n}"


def _suggest_base(filename: Optional[str]) -> str:
    stem = (filename or "").rsplit(".", 1)[0]
    slug = _slug(stem)[:28]
    if not slug or slug in GENERIC_NAMES or re.fullmatch(r"(image|imagem|screenshot|captura)[-0-9]*", slug):
        return "ref-" + secrets.token_hex(2)
    return slug


def decode_data(payload: str) -> bytes:
    if payload.startswith("data:"):
        payload = payload.split(",", 1)[1] if "," in payload else ""
    try:
        data = base64.b64decode(payload, validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image data")
    if not data:
        raise HTTPException(status_code=400, detail="Empty image data")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image is too large (max 15 MB)")
    return data


@dataclass
class ProcessedImage:
    data: bytes
    mime: str
    width: int
    height: int
    thumb: bytes


def process_image(raw: bytes) -> ProcessedImage:
    """Validate that the bytes are an image, downscale to MAX_SIDE and build a WebP thumbnail."""
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(status_code=400, detail="The file is not a supported image (PNG, JPG, WebP, GIF, BMP)")
    fmt = (img.format or "").upper()
    img = ImageOps.exif_transpose(img)
    has_alpha = img.mode in ("RGBA", "LA", "PA") or (img.mode == "P" and "transparency" in img.info)
    resized = max(img.size) > MAX_SIDE
    if resized:
        img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)

    if not resized and fmt in KEEP_FORMATS and getattr(img, "n_frames", 1) == 1:
        data, mime = raw, KEEP_FORMATS[fmt]
    else:
        out = io.BytesIO()
        if has_alpha or fmt == "PNG":
            img.convert("RGBA").save(out, "PNG", optimize=True)
            mime = "image/png"
        else:
            img.convert("RGB").save(out, "JPEG", quality=90, optimize=True)
            mime = "image/jpeg"
        data = out.getvalue()

    thumb_img = img.copy()
    thumb_img.thumbnail((THUMB_SIDE, THUMB_SIDE), Image.LANCZOS)
    tb = io.BytesIO()
    thumb_img.convert("RGBA").save(tb, "WEBP", quality=80)
    return ProcessedImage(data=data, mime=mime, width=img.size[0], height=img.size[1], thumb=tb.getvalue())


# ------------------------------------------------------------------ CRUD
async def create_reference(db: AsyncSession, user: User, raw: bytes, filename: Optional[str], code: Optional[str], source: str) -> tuple[ReferenceImage, bool]:
    content_hash = hashlib.sha256(raw).hexdigest()
    existing = (
        await db.execute(select(ReferenceImage).where(ReferenceImage.user_id == user.id, ReferenceImage.content_hash == content_hash))
    ).scalar_one_or_none()
    if existing:
        return existing, True

    processed = await asyncio.to_thread(process_image, raw)
    if code:
        wanted = normalize_code(code)
        clash = (await db.execute(select(ReferenceImage.id).where(ReferenceImage.user_id == user.id, ReferenceImage.code == wanted))).first()
        if clash:
            raise HTTPException(status_code=409, detail=f"The code @{wanted} is already in use")
        final_code = wanted
    else:
        final_code = await _unique_code(db, user.id, _suggest_base(filename))

    ref = ReferenceImage(
        user_id=user.id,
        code=final_code,
        original_name=(filename or None) and filename[:255],
        source=source,
        content_hash=content_hash,
        mime_type=processed.mime,
        width=processed.width,
        height=processed.height,
        size_bytes=len(processed.data) + len(processed.thumb),
        data=processed.data,
        thumb=processed.thumb,
        use_count=0,
    )
    db.add(ref)
    await db.commit()
    await db.refresh(ref)
    return ref, False


async def library_stats(db: AsyncSession, user: User) -> dict:
    row = (
        await db.execute(
            select(func.count(ReferenceImage.id), func.coalesce(func.sum(ReferenceImage.size_bytes), 0)).where(ReferenceImage.user_id == user.id)
        )
    ).one()
    never_used = (
        await db.execute(select(func.count(ReferenceImage.id)).where(ReferenceImage.user_id == user.id, ReferenceImage.use_count == 0))
    ).scalar_one()
    return {"count": int(row[0]), "totalBytes": int(row[1]), "neverUsedCount": int(never_used), "autoCleanupDays": user.reference_autoclean_days}


def _stale_filter(user_id, unused_days: int, only_never_used: bool):
    cutoff = datetime.now(timezone.utc) - timedelta(days=max(0, unused_days))
    conds = [ReferenceImage.user_id == user_id, func.coalesce(ReferenceImage.last_used_at, ReferenceImage.created_at) <= cutoff]
    if only_never_used:
        conds.append(ReferenceImage.use_count == 0)
    return conds


async def cleanup(db: AsyncSession, user_id, unused_days: int, only_never_used: bool, dry_run: bool) -> dict:
    conds = _stale_filter(user_id, unused_days, only_never_used)
    row = (await db.execute(select(func.count(ReferenceImage.id), func.coalesce(func.sum(ReferenceImage.size_bytes), 0)).where(*conds))).one()
    if not dry_run and row[0]:
        await db.execute(delete(ReferenceImage).where(*conds))
        await db.commit()
    return {"count": int(row[0]), "freedBytes": int(row[1]), "dryRun": dry_run}


async def run_auto_cleanup(db: AsyncSession) -> int:
    users = (await db.execute(select(User.id, User.reference_autoclean_days).where(User.reference_autoclean_days.is_not(None)))).all()
    total = 0
    for uid, days in users:
        res = await cleanup(db, uid, int(days), only_never_used=False, dry_run=False)
        total += res["count"]
    if total:
        log.info("auto-cleanup removed %s unused reference images", total)
    return total


# ------------------------------------------------------------------ URL safety + download
def _assert_public_host(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Reference URL must start with http:// or https://")
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror:
        raise HTTPException(status_code=400, detail=f"Could not resolve the reference URL host: {parsed.hostname}")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise HTTPException(status_code=400, detail="Reference URL points to a private network address")


def validate_url(url: str) -> str:
    url = url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Reference URL must start with http:// or https://")
    return url


async def download_url_image(url: str) -> tuple[bytes, str]:
    current = url
    async with httpx.AsyncClient(timeout=25, follow_redirects=False, headers={"User-Agent": "Mozilla/5.0 PromptFolio/1.0"}) as http:
        for _ in range(4):
            await asyncio.to_thread(_assert_public_host, current)
            async with http.stream("GET", current) as r:
                if r.is_redirect and r.headers.get("location"):
                    current = urljoin(current, r.headers["location"])
                    continue
                if r.status_code >= 400:
                    raise HTTPException(status_code=400, detail=f"Could not download the reference image ({r.status_code}): {url}")
                chunks, size = [], 0
                async for chunk in r.aiter_bytes():
                    size += len(chunk)
                    if size > MAX_URL_BYTES:
                        raise HTTPException(status_code=400, detail="The reference image at the URL is larger than 12 MB")
                    chunks.append(chunk)
                raw = b"".join(chunks)
                break
        else:
            raise HTTPException(status_code=400, detail="Too many redirects for the reference URL")
    processed = await asyncio.to_thread(process_image, raw)  # validates it is really an image
    return processed.data, processed.mime


# ------------------------------------------------------------------ execution
@dataclass
class ResolvedReference:
    kind: str  # url | library
    label: str  # @code or the URL
    url: Optional[str] = None
    data: Optional[bytes] = None
    mime: Optional[str] = None

    def data_uri(self) -> Optional[str]:
        if self.data is None:
            return None
        return f"data:{self.mime};base64,{base64.b64encode(self.data).decode()}"


async def resolve_for_run(db: AsyncSession, user: User, refs: list, need_pixels: bool) -> list[ResolvedReference]:
    if len(refs) > MAX_REFERENCES_PER_RUN:
        raise HTTPException(status_code=400, detail=f"Use at most {MAX_REFERENCES_PER_RUN} brand references per run")
    resolved: list[ResolvedReference] = []
    library_ids = [r.referenceId for r in refs if r.kind == "library"]
    by_id: dict[str, ReferenceImage] = {}
    if library_ids:
        import uuid as _uuid

        try:
            ids = [_uuid.UUID(i) for i in library_ids]
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid reference id")
        q = select(ReferenceImage).where(ReferenceImage.user_id == user.id, ReferenceImage.id.in_(ids))
        if need_pixels:
            q = q.options(undefer(ReferenceImage.data))
        by_id = {str(r.id): r for r in (await db.execute(q)).scalars()}

    for ref in refs:
        if ref.kind == "url":
            url = validate_url(ref.url or "")
            item = ResolvedReference(kind="url", label=url, url=url)
            if need_pixels:
                item.data, item.mime = await download_url_image(url)
            resolved.append(item)
        else:
            row = by_id.get(ref.referenceId or "")
            if not row:
                raise HTTPException(status_code=404, detail="A selected library image no longer exists. Remove it from the field and try again.")
            resolved.append(
                ResolvedReference(kind="library", label=f"@{row.code}", data=row.data if need_pixels else None, mime=row.mime_type if need_pixels else None)
            )
    return resolved


async def mark_used(db: AsyncSession, user: User, refs: list) -> None:
    ids = [r.referenceId for r in refs if r.kind == "library" and r.referenceId]
    if not ids:
        return
    import uuid as _uuid
    from sqlalchemy import update

    await db.execute(
        update(ReferenceImage)
        .where(ReferenceImage.user_id == user.id, ReferenceImage.id.in_([_uuid.UUID(i) for i in ids]))
        .values(use_count=ReferenceImage.use_count + 1, last_used_at=datetime.now(timezone.utc))
    )


TEXTS = {
    "pt-BR": {
        "attached": "a(s) imagem(ns) de referência de marca anexada(s) ({labels})",
        "suffix": "Referência de marca ({var}): {value}.",
        "usage": "Use a(s) imagem(ns) anexada(s) como referência da identidade visual da marca: logotipo, cores, tipografia e estilo.",
    },
    "en-US": {
        "attached": "the attached brand reference image(s) ({labels})",
        "suffix": "Brand reference ({var}): {value}.",
        "usage": "Use the attached image(s) as the brand identity reference: logo, colors, typography and visual style.",
    },
}


def texts(language: str) -> dict[str, str]:
    return TEXTS.get(language, TEXTS["en-US"])


def describe(resolved: list[ResolvedReference], attached: bool, language: str) -> str:
    """Text that replaces {{referencia_marca_anexa}} in the template."""
    if not resolved:
        return ""
    labels = ", ".join(r.label for r in resolved)
    return texts(language)["attached"].format(labels=labels) if attached else labels


def search_filter(search: Optional[str]):
    if not search:
        return None
    term = f"%{search.lstrip('@').strip().lower()}%"
    return or_(ReferenceImage.code.ilike(term), func.coalesce(ReferenceImage.original_name, "").ilike(term))
