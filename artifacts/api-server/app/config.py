import os
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
SERVER_DIR = APP_DIR.parent

SESSION_SECRET = os.environ.get("SESSION_SECRET", "")
if not SESSION_SECRET:
    raise RuntimeError("SESSION_SECRET must be set")

# NEON_DATABASE_URL lets the Replit workspace (whose DATABASE_URL is platform-managed) use the Neon database.
DATABASE_URL = os.environ.get("NEON_DATABASE_URL") or os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL (or NEON_DATABASE_URL) must be set")

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_OAUTH_CONFIGURED = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
GOOGLE_SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/drive.file",
]

# Built-in engines. Inside Replit they go through the Replit AI Integrations proxy; anywhere else (e.g. Railway)
# set OPENAI_API_KEY / GEMINI_API_KEY and the official APIs are called directly.
_DIRECT_OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")
_DIRECT_GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
if _DIRECT_OPENAI_KEY:
    OPENAI_API_KEY, OPENAI_BASE_URL = _DIRECT_OPENAI_KEY, ""
else:
    OPENAI_API_KEY = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY", "")
    OPENAI_BASE_URL = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL", "")
if _DIRECT_GEMINI_KEY:
    GEMINI_API_KEY, GEMINI_BASE_URL = _DIRECT_GEMINI_KEY, ""
else:
    GEMINI_API_KEY = os.environ.get("AI_INTEGRATIONS_GEMINI_API_KEY", "")
    GEMINI_BASE_URL = os.environ.get("AI_INTEGRATIONS_GEMINI_BASE_URL", "")

_OPENAI_DIRECT = bool(_DIRECT_OPENAI_KEY)
BUILTIN_CHAT_MODEL = os.environ.get("BUILTIN_CHAT_MODEL") or ("gpt-5" if _OPENAI_DIRECT else "gpt-5.6-terra")
BUILTIN_FAST_MODEL = os.environ.get("BUILTIN_FAST_MODEL") or ("gpt-5-mini" if _OPENAI_DIRECT else "gpt-5.6-luna")
BUILTIN_IMAGE_MODEL = os.environ.get("BUILTIN_IMAGE_MODEL") or "gemini-2.5-flash-image"
BUILTIN_OPENAI_IMAGE_MODEL = os.environ.get("BUILTIN_OPENAI_IMAGE_MODEL") or "gpt-image-1"
BUILTIN_AUDIO_MODEL = os.environ.get("BUILTIN_AUDIO_MODEL") or "gpt-audio"

MEDIA_DIR = Path(os.environ.get("MEDIA_CACHE_DIR", str(SERVER_DIR / ".media_cache")))
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

SESSION_COOKIE = "pf_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 30
IS_PRODUCTION = os.environ.get("NODE_ENV") == "production" or os.environ.get("REPLIT_DEPLOYMENT") == "1"

# The shared demo account is a development convenience; in production it is off unless explicitly enabled.
ALLOW_DEMO_LOGIN = os.environ.get("ALLOW_DEMO_LOGIN", "false" if IS_PRODUCTION else "true").lower() in ("1", "true", "yes")

# Built frontend (vite build output). When present, the API also serves the SPA (single-service deploys like Railway).
STATIC_DIR = Path(os.environ.get("STATIC_DIR", str(SERVER_DIR.parent / "promptfolio" / "dist" / "public")))
