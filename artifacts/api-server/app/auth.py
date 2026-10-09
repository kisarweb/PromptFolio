import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import Depends, HTTPException, Request, Response
from itsdangerous import BadSignature, URLSafeTimedSerializer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from . import config
from .crypto import decrypt_str, encrypt_str
from .db import get_db
from .models import StorageConfig, User
from .seed import seed_user_categories

_serializer = URLSafeTimedSerializer(config.SESSION_SECRET, salt="promptfolio-session")
_state_serializer = URLSafeTimedSerializer(config.SESSION_SECRET, salt="promptfolio-oauth-state")

STORAGE_PROVIDERS = ("google_drive_mcp", "cloudflare_r2", "aws_s3")


def set_session_cookie(response: Response, user_id: uuid.UUID) -> None:
    response.set_cookie(
        config.SESSION_COOKIE,
        _serializer.dumps(str(user_id)),
        max_age=config.SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=True,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(config.SESSION_COOKIE, path="/")


def read_session_user_id(request: Request) -> uuid.UUID | None:
    raw = request.cookies.get(config.SESSION_COOKIE)
    if not raw:
        return None
    try:
        return uuid.UUID(_serializer.loads(raw, max_age=config.SESSION_MAX_AGE))
    except (BadSignature, ValueError):
        return None


async def optional_user(request: Request, db: AsyncSession = Depends(get_db)) -> User | None:
    user_id = read_session_user_id(request)
    if not user_id:
        return None
    return await db.get(User, user_id)


async def current_user(user: User | None = Depends(optional_user)) -> User:
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def make_oauth_state() -> str:
    return _state_serializer.dumps(uuid.uuid4().hex)


def verify_oauth_state(state: str) -> bool:
    try:
        _state_serializer.loads(state, max_age=600)
        return True
    except BadSignature:
        return False


async def provision_user(db: AsyncSession, user: User) -> None:
    """Ensure the three storage rows exist (Google Drive MCP default) and starter categories."""
    existing = {
        row.provider: row
        for row in (await db.execute(select(StorageConfig).where(StorageConfig.user_id == user.id))).scalars()
    }
    for provider in STORAGE_PROVIDERS:
        if provider not in existing:
            db.add(
                StorageConfig(
                    user_id=user.id,
                    provider=provider,
                    is_default=provider == "google_drive_mcp",
                    is_configured=provider == "google_drive_mcp",
                    drive_folder_cache={},
                )
            )
    await seed_user_categories(db, user.id)
    await db.commit()


def public_base_url(request: Request) -> str:
    proto = request.headers.get("x-forwarded-proto", request.url.scheme).split(",")[0].strip()
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{proto}://{host.split(',')[0].strip()}"


async def get_google_access_token(db: AsyncSession, user: User) -> str | None:
    """Return a valid Google access token for the user, refreshing it when expired."""
    access = decrypt_str(user.encrypted_google_access_token)
    if not access:
        return None
    expires = user.google_token_expires_at
    if expires and expires > datetime.now(timezone.utc) + timedelta(seconds=60):
        return access
    refresh = decrypt_str(user.encrypted_google_refresh_token)
    if not refresh or not config.GOOGLE_OAUTH_CONFIGURED:
        return access
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": config.GOOGLE_CLIENT_ID,
                "client_secret": config.GOOGLE_CLIENT_SECRET,
                "refresh_token": refresh,
                "grant_type": "refresh_token",
            },
        )
    if resp.status_code != 200:
        return None
    data = resp.json()
    user.encrypted_google_access_token = encrypt_str(data["access_token"])
    user.google_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(data.get("expires_in", 3600)))
    await db.commit()
    return data["access_token"]
