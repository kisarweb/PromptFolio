"""StorageRouterService: Strategy pattern routing each delivery to the user's active provider."""
import asyncio
import json
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

import boto3
import httpx
from botocore.config import Config as BotoConfig
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import get_google_access_token
from .crypto import decrypt_str
from .models import StorageConfig, User

log = logging.getLogger("promptfolio.storage")

MODALITY_FOLDERS = {"image": "Imagens", "video": "Videos", "audio": "Audios", "text": "Textos"}
ROOT_FOLDER = "PromptFolio"
PROVIDER_LABELS = {"google_drive_mcp": "Google Drive", "cloudflare_r2": "Cloudflare R2", "aws_s3": "AWS S3"}
DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder"


@dataclass
class StorageResult:
    provider: str
    status: str  # saved | simulated | failed
    key: str | None
    view_url: str | None
    message: str | None


async def get_config(db: AsyncSession, user: User, provider: str) -> StorageConfig | None:
    return (
        await db.execute(select(StorageConfig).where(StorageConfig.user_id == user.id, StorageConfig.provider == provider))
    ).scalar_one_or_none()


def build_path(segments: list[str]) -> str:
    return "/".join(s.strip().replace("/", "-") for s in segments if s and s.strip())


async def upload(db: AsyncSession, user: User, segments: list[str], filename: str, data: bytes, mime: str) -> StorageResult:
    provider = user.active_storage_provider
    cfg = await get_config(db, user, provider)
    try:
        if provider == "google_drive_mcp":
            return await _drive_upload(db, user, cfg, segments, filename, data, mime)
        if provider in ("cloudflare_r2", "aws_s3"):
            if cfg is None or not cfg.is_configured:
                return StorageResult(provider, "failed", None, None, f"{PROVIDER_LABELS[provider]} is not configured. Open Settings > Storage.")
            return await _s3_upload(cfg, segments, filename, data, mime)
    except Exception as exc:
        log.exception("storage upload failed")
        return StorageResult(provider, "failed", None, None, f"{PROVIDER_LABELS.get(provider, provider)}: {exc}"[:500])
    return StorageResult(provider, "failed", None, None, f"Unknown storage provider {provider}")


# ------------------------------------------------------------------ Google Drive
async def _drive_folder(http: httpx.AsyncClient, token: str, name: str, parent: str) -> str:
    safe = name.replace("\\", "\\\\").replace("'", "\\'")
    q = f"name = '{safe}' and mimeType = '{DRIVE_FOLDER_MIME}' and '{parent}' in parents and trashed = false"
    r = await http.get(
        "https://www.googleapis.com/drive/v3/files",
        params={"q": q, "fields": "files(id,name)", "spaces": "drive"},
        headers={"Authorization": f"Bearer {token}"},
    )
    r.raise_for_status()
    files = r.json().get("files", [])
    if files:
        return files[0]["id"]
    c = await http.post(
        "https://www.googleapis.com/drive/v3/files",
        params={"fields": "id"},
        json={"name": name, "mimeType": DRIVE_FOLDER_MIME, "parents": [parent]},
        headers={"Authorization": f"Bearer {token}"},
    )
    c.raise_for_status()
    return c.json()["id"]


async def _drive_ensure_path(http: httpx.AsyncClient, token: str, cfg: StorageConfig, segments: list[str]) -> str:
    cache = dict(cfg.drive_folder_cache or {})
    parent = "root"
    path = ""
    for seg in [ROOT_FOLDER, *segments]:
        path = f"{path}/{seg}"
        folder_id = cache.get(path)
        if not folder_id:
            folder_id = await _drive_folder(http, token, seg, parent)
            cache[path] = folder_id
        parent = folder_id
    cfg.drive_folder_cache = cache
    cfg.drive_root_folder_id = cache.get(f"/{ROOT_FOLDER}")
    return parent


async def ensure_drive_structure(db: AsyncSession, user: User) -> str | None:
    token = await get_google_access_token(db, user)
    cfg = await get_config(db, user, "google_drive_mcp")
    if not token or cfg is None:
        return None
    async with httpx.AsyncClient(timeout=30) as http:
        await _drive_ensure_path(http, token, cfg, [])
        for folder in MODALITY_FOLDERS.values():
            await _drive_ensure_path(http, token, cfg, [folder])
    await db.commit()
    return cfg.drive_root_folder_id


async def _drive_upload(db, user, cfg, segments, filename, data, mime) -> StorageResult:
    provider = "google_drive_mcp"
    simulated_key = "/" + build_path([ROOT_FOLDER, *segments, filename])
    token = await get_google_access_token(db, user)
    if not token:
        if user.is_demo:
            return StorageResult(provider, "simulated", simulated_key, None, "Demo account: sign in with Google to save to your real Drive. Use the local download meanwhile.")
        return StorageResult(provider, "failed", None, None, "Google Drive permission missing or expired. Sign out and sign in with Google again.")
    if cfg is None:
        return StorageResult(provider, "failed", None, None, "Google Drive storage is not provisioned.")
    async with httpx.AsyncClient(timeout=120) as http:
        parent = await _drive_ensure_path(http, token, cfg, segments)
        boundary = f"pf-{uuid.uuid4().hex}"
        meta = json.dumps({"name": filename, "parents": [parent]}).encode()
        body = (
            f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n".encode()
            + meta
            + f"\r\n--{boundary}\r\nContent-Type: {mime}\r\n\r\n".encode()
            + data
            + f"\r\n--{boundary}--".encode()
        )
        r = await http.post(
            "https://www.googleapis.com/upload/drive/v3/files",
            params={"uploadType": "multipart", "fields": "id,webViewLink,webContentLink"},
            content=body,
            headers={"Authorization": f"Bearer {token}", "Content-Type": f"multipart/related; boundary={boundary}"},
        )
        if r.status_code >= 400:
            return StorageResult(provider, "failed", None, None, f"Google Drive {r.status_code}: {r.text[:300]}")
        info = r.json()
    await db.commit()
    return StorageResult(provider, "saved", info.get("id"), info.get("webViewLink"), f"{simulated_key}")


# ------------------------------------------------------------------ S3 / R2
def normalize_r2_endpoint(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip()
    if "://" not in value:
        return f"https://{value}.r2.cloudflarestorage.com"
    return value.rstrip("/")


def s3_client(cfg: StorageConfig):
    access = decrypt_str(cfg.encrypted_access_key)
    secret = decrypt_str(cfg.encrypted_secret_key)
    if cfg.provider == "cloudflare_r2":
        return boto3.client(
            "s3",
            endpoint_url=normalize_r2_endpoint(cfg.endpoint_url),
            aws_access_key_id=access,
            aws_secret_access_key=secret,
            region_name="auto",
            config=BotoConfig(signature_version="s3v4", retries={"max_attempts": 2}),
        )
    return boto3.client(
        "s3",
        region_name=cfg.region or "us-east-1",
        endpoint_url=cfg.endpoint_url or None,
        aws_access_key_id=access,
        aws_secret_access_key=secret,
        config=BotoConfig(signature_version="s3v4", retries={"max_attempts": 2}),
    )


async def _s3_upload(cfg: StorageConfig, segments: list[str], filename: str, data: bytes, mime: str) -> StorageResult:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    key = build_path([ROOT_FOLDER, *segments, f"{stamp}_{filename}"])
    client = s3_client(cfg)

    def _put():
        client.put_object(Bucket=cfg.bucket_name, Key=key, Body=data, ContentType=mime)
        if cfg.public_url_prefix:
            return f"{cfg.public_url_prefix.rstrip('/')}/{key}"
        return client.generate_presigned_url("get_object", Params={"Bucket": cfg.bucket_name, "Key": key}, ExpiresIn=7 * 24 * 3600)

    url = await asyncio.to_thread(_put)
    return StorageResult(cfg.provider, "saved", key, url, None)


# ------------------------------------------------------------------ test
async def test_provider(db: AsyncSession, user: User, provider: str) -> dict:
    cfg = await get_config(db, user, provider)
    payload = f"PromptFolio connection test {datetime.now(timezone.utc).isoformat()}".encode()
    filename = f"promptfolio-test-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.txt"
    try:
        if provider == "google_drive_mcp":
            token = await get_google_access_token(db, user)
            if not token:
                msg = (
                    "Demo account: there is no real Google token. Uploads are simulated until you sign in with Google."
                    if user.is_demo
                    else "Google Drive permission missing or expired. Sign out and sign in with Google again."
                )
                return {"ok": False, "message": msg, "detail": None, "remoteViewUrl": None}
            await ensure_drive_structure(db, user)
            result = await _drive_upload(db, user, cfg, ["_teste_conexao"], filename, payload, "text/plain")
        else:
            if cfg is None or not cfg.bucket_name or not cfg.encrypted_access_key or not cfg.encrypted_secret_key:
                return {"ok": False, "message": "Fill in and save all required fields first.", "detail": None, "remoteViewUrl": None}
            if provider == "aws_s3" and not cfg.region and not cfg.endpoint_url:
                return {"ok": False, "message": "Region is required for AWS S3.", "detail": None, "remoteViewUrl": None}
            if provider == "cloudflare_r2" and not cfg.endpoint_url:
                return {"ok": False, "message": "Account ID / S3 endpoint is required for Cloudflare R2.", "detail": None, "remoteViewUrl": None}
            result = await _s3_upload(cfg, ["_teste_conexao"], filename, payload, "text/plain")
    except Exception as exc:
        return {"ok": False, "message": "Connection or write failed", "detail": str(exc)[:500], "remoteViewUrl": None}
    if result.status != "saved":
        return {"ok": False, "message": result.message or "Write failed", "detail": None, "remoteViewUrl": None}
    if cfg is not None and provider != "google_drive_mcp":
        cfg.is_configured = True
        await db.commit()
    return {
        "ok": True,
        "message": f"Connected and wrote a test file to {PROVIDER_LABELS[provider]}",
        "detail": result.key,
        "remoteViewUrl": result.view_url,
    }
