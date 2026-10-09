# PromptFolio — single-service image (FastAPI API + built React SPA), used for Railway deploys.
# On Replit the artifacts run separately; this file is not used there.

# ---------- 1. build the React frontend ----------
FROM node:24-slim AS web
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter "@workspace/promptfolio..."
ENV NODE_ENV=production PORT=3000 BASE_PATH=/
RUN pnpm --filter @workspace/promptfolio run build

# ---------- 2. Python runtime ----------
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.9.24 /uv /usr/local/bin/uv
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH"
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY artifacts/api-server artifacts/api-server
COPY --from=web /app/artifacts/promptfolio/dist/public artifacts/promptfolio/dist/public

ENV NODE_ENV=production \
    MEDIA_CACHE_DIR=/data/media \
    STATIC_DIR=/app/artifacts/promptfolio/dist/public
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn app.main:app --app-dir artifacts/api-server --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips '*'"]
