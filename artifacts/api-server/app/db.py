from urllib.parse import parse_qs, urlparse, urlunparse

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import DATABASE_URL


def _build_engine_args() -> tuple[str, dict]:
    parsed = urlparse(DATABASE_URL)
    query = parse_qs(parsed.query)
    sslmode = query.get("sslmode", ["prefer"])[0]
    url = urlunparse(parsed._replace(scheme="postgresql+asyncpg", query=""))
    connect_args: dict = {}
    if sslmode == "disable":
        connect_args["ssl"] = False
    elif sslmode in ("require", "verify-ca", "verify-full"):
        connect_args["ssl"] = "require"
    return url, connect_args


_url, _connect_args = _build_engine_args()
engine = create_async_engine(_url, connect_args=_connect_args, pool_pre_ping=True, pool_size=5, max_overflow=10)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with SessionLocal() as session:
        yield session
