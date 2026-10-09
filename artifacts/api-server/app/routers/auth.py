import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import ai, config
from ..auth import (
    clear_session_cookie,
    current_user,
    make_oauth_state,
    optional_user,
    provision_user,
    public_base_url,
    set_session_cookie,
    verify_oauth_state,
)
from ..crypto import encrypt_str
from ..db import get_db
from ..models import User
from ..schemas import PreferencesUpdate
from ..serializers import user_out
from ..storage import ensure_drive_structure

log = logging.getLogger("promptfolio.auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])

GOOGLE_LOGIN_PATH = "/api/auth/google/login"
DEMO_EMAIL = "demo@promptfolio.local"


def _session_payload(user: User | None) -> dict:
    return {
        "authenticated": user is not None,
        "user": user_out(user, bool(user.encrypted_google_access_token)) if user else None,
        "googleOAuthConfigured": config.GOOGLE_OAUTH_CONFIGURED,
        "googleLoginUrl": GOOGLE_LOGIN_PATH,
        "demoLoginEnabled": config.ALLOW_DEMO_LOGIN,
        "builtinAiAvailable": ai.builtin_available() or ai.builtin_gemini_available(),
    }


@router.get("/session")
async def get_session(user: User | None = Depends(optional_user)):
    return _session_payload(user)


@router.post("/demo-login")
async def demo_login(response: Response, db: AsyncSession = Depends(get_db)):
    if not config.ALLOW_DEMO_LOGIN:
        raise HTTPException(status_code=403, detail="Demo login is disabled on this server. Sign in with Google.")
    user = (await db.execute(select(User).where(User.email == DEMO_EMAIL))).scalar_one_or_none()
    if user is None:
        user = User(email=DEMO_EMAIL, name="Demo Local", is_demo=True, language="pt-BR", theme="dark", active_storage_provider="google_drive_mcp")
        db.add(user)
        await db.commit()
    await provision_user(db, user)
    set_session_cookie(response, user.id)
    return _session_payload(user)


@router.post("/logout")
async def logout(response: Response):
    clear_session_cookie(response)
    return {"ok": True}


@router.patch("/preferences")
async def update_preferences(body: PreferencesUpdate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if body.language:
        user.language = body.language
    if body.theme:
        user.theme = body.theme
    await db.commit()
    return user_out(user, bool(user.encrypted_google_access_token))


@router.get("/google/login")
async def google_login(request: Request):
    if not config.GOOGLE_OAUTH_CONFIGURED:
        return RedirectResponse("/?auth_error=google_not_configured", status_code=302)
    state = make_oauth_state()
    params = {
        "client_id": config.GOOGLE_CLIENT_ID,
        "redirect_uri": f"{public_base_url(request)}/api/auth/google/callback",
        "response_type": "code",
        "scope": " ".join(config.GOOGLE_SCOPES),
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent",
        "state": state,
    }
    resp = RedirectResponse("https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params), status_code=302)
    resp.set_cookie("pf_oauth_state", state, max_age=600, httponly=True, samesite="lax", secure=True, path="/")
    return resp


@router.get("/google/callback")
async def google_callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None, db: AsyncSession = Depends(get_db)):
    if error or not code or not state:
        return RedirectResponse(f"/?auth_error={error or 'missing_code'}", status_code=302)
    if state != request.cookies.get("pf_oauth_state") or not verify_oauth_state(state):
        return RedirectResponse("/?auth_error=invalid_state", status_code=302)
    async with httpx.AsyncClient(timeout=20) as http:
        token_resp = await http.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": config.GOOGLE_CLIENT_ID,
                "client_secret": config.GOOGLE_CLIENT_SECRET,
                "redirect_uri": f"{public_base_url(request)}/api/auth/google/callback",
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            log.error("google token exchange failed: %s", token_resp.text[:300])
            return RedirectResponse("/?auth_error=token_exchange_failed", status_code=302)
        tokens = token_resp.json()
        info_resp = await http.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        if info_resp.status_code != 200:
            return RedirectResponse("/?auth_error=userinfo_failed", status_code=302)
        info = info_resp.json()

    user = (await db.execute(select(User).where(User.google_id == info["sub"]))).scalar_one_or_none()
    if user is None:
        user = (await db.execute(select(User).where(User.email == info["email"]))).scalar_one_or_none()
    if user is None:
        user = User(email=info["email"], name=info.get("name") or info["email"], active_storage_provider="google_drive_mcp")
        db.add(user)
    user.google_id = info["sub"]
    user.name = info.get("name") or user.name
    user.avatar_url = info.get("picture")
    user.is_demo = False
    user.encrypted_google_access_token = encrypt_str(tokens["access_token"])
    if tokens.get("refresh_token"):
        user.encrypted_google_refresh_token = encrypt_str(tokens["refresh_token"])
    user.google_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(tokens.get("expires_in", 3600)))
    await db.commit()
    await provision_user(db, user)
    try:
        await ensure_drive_structure(db, user)
    except Exception:
        log.exception("could not create /PromptFolio folder structure on Drive")

    resp = RedirectResponse("/", status_code=302)
    resp.delete_cookie("pf_oauth_state", path="/")
    set_session_cookie(resp, user.id)
    return resp
