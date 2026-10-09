"""BYOK vault: Fernet (AES-128-CBC + HMAC-SHA256) encryption for user credentials.

The Fernet key is derived from SESSION_SECRET so no extra secret is required.
"""
import base64
import hashlib
import json
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from .config import SESSION_SECRET

_key = base64.urlsafe_b64encode(hashlib.sha256(("promptfolio-byok:" + SESSION_SECRET).encode()).digest())
_fernet = Fernet(_key)


def encrypt_str(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    return _fernet.encrypt(value.encode()).decode()


def decrypt_str(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return _fernet.decrypt(value.encode()).decode()
    except InvalidToken:
        return None


def encrypt_data(data: dict[str, Any]) -> str:
    return _fernet.encrypt(json.dumps(data).encode()).decode()


def decrypt_data(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        return json.loads(_fernet.decrypt(value.encode()).decode())
    except (InvalidToken, ValueError):
        return {}


def mask(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 8:
        return "••••"
    return f"{value[:4]}••••{value[-4:]}"
