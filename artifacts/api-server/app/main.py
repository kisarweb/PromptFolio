import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import text

from . import config
from . import models  # noqa: F401  (registers tables)
from .db import Base, SessionLocal, engine
from . import references as reference_service
from .routers import agents, auth, builder, catalog, dashboard, delivery, references, settings
from .seed import seed_factory_agents

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("promptfolio")


# create_all() never alters existing tables, so additive column changes go here (idempotent).
SCHEMA_PATCHES = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS reference_autoclean_days INTEGER",
]
AUTO_CLEANUP_INTERVAL_S = 6 * 3600


async def auto_cleanup_loop() -> None:
    while True:
        try:
            async with SessionLocal() as db:
                await reference_service.run_auto_cleanup(db)
        except Exception:
            log.exception("reference auto-cleanup failed")
        await asyncio.sleep(AUTO_CLEANUP_INTERVAL_S)


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for stmt in SCHEMA_PATCHES:
            await conn.execute(text(stmt))
    async with SessionLocal() as db:
        await seed_factory_agents(db)
    cleanup_task = asyncio.create_task(auto_cleanup_loop())
    log.info("PromptFolio API ready")
    yield
    cleanup_task.cancel()
    await engine.dispose()


app = FastAPI(title="PromptFolio API", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException):
    return JSONResponse({"error": exc.detail if isinstance(exc.detail, str) else str(exc.detail)}, status_code=exc.status_code, headers=getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    loc = ".".join(str(p) for p in first.get("loc", []) if p != "body")
    return JSONResponse({"error": f"Invalid {loc}: {first.get('msg', 'validation error')}", "details": exc.errors()}, status_code=400)


@app.get("/api/healthz")
async def healthz():
    return {"status": "ok"}


for r in (auth.router, dashboard.router, catalog.router, agents.router, builder.router, delivery.router, references.router, settings.router):
    app.include_router(r)


# ------------------------------------------------------------------ frontend (single-service deploys)
# On Replit the platform serves the built SPA separately; elsewhere (e.g. Railway) this process serves it too.
if (config.STATIC_DIR / "index.html").is_file():
    _static_root = config.STATIC_DIR.resolve()
    _index_html = _static_root / "index.html"

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = (_static_root / full_path).resolve()
        if full_path and candidate.is_file() and candidate.is_relative_to(_static_root):
            cache = "public, max-age=31536000, immutable" if full_path.startswith("assets/") else "no-cache"
            return FileResponse(candidate, headers={"Cache-Control": cache})
        return FileResponse(_index_html, headers={"Cache-Control": "no-cache"})

    log.info("serving frontend from %s", _static_root)
