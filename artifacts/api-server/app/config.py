import os
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
SERVER_DIR = APP_DIR.parent

SESSION_SECRET = os.environ.get("SESSION_SECRET", "")
if not SESSION_SECRET:
    raise RuntimeError("SESSION_SECRET must be set")

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL must be set")

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_OAUTH_CONFIGURED = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
GOOGLE_SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/drive.file",
]

OPENAI_BASE_URL = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL", "")
OPENAI_API_KEY = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY", "")
GEMINI_BASE_URL = os.environ.get("AI_INTEGRATIONS_GEMINI_BASE_URL", "")
GEMINI_API_KEY = os.environ.get("AI_INTEGRATIONS_GEMINI_API_KEY", "")

BUILTIN_CHAT_MODEL = "gpt-5.6-terra"
BUILTIN_FAST_MODEL = "gpt-5.6-luna"
BUILTIN_IMAGE_MODEL = "gemini-2.5-flash-image"
BUILTIN_OPENAI_IMAGE_MODEL = "gpt-image-1"
BUILTIN_AUDIO_MODEL = "gpt-audio"

MEDIA_DIR = Path(os.environ.get("MEDIA_CACHE_DIR", str(SERVER_DIR / ".media_cache")))
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

SESSION_COOKIE = "pf_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 30
IS_PRODUCTION = os.environ.get("NODE_ENV") == "production" or os.environ.get("REPLIT_DEPLOYMENT") == "1"
