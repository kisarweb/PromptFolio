# PromptFolio

Bilingual (PT/EN) studio to build expert agents and parametrized prompts through guided chat, catalog them, and execute them into images, videos, audio and text saved to the user's own cloud (Google Drive by default, or Cloudflare R2 / AWS S3). Source PRD: `attached_assets/PRD-arquitect-geral_1791493704483.md`.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — FastAPI backend (uvicorn, port from `PORT`, default 8080, served under `/api`)
- `pnpm --filter @workspace/promptfolio run dev` — React/Vite frontend (served at `/`)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate React Query hooks + Zod from `lib/api-spec/openapi.yaml`
- Python deps live in root `pyproject.toml` (install via package tooling, not pip)
- Required env: `DATABASE_URL` (or `NEON_DATABASE_URL`, which wins; use Neon's direct endpoint, not `-pooler`), `SESSION_SECRET` (must be identical in every environment sharing the DB: it decrypts stored keys/tokens)
- No server AI keys: each user saves their own OpenAI / Gemini / Runway / OpenRouter keys in Settings > AI connectors. Replit AI Integrations vars (`AI_INTEGRATIONS_*`) only add a built-in fallback engine in the Replit dev workspace.
- `ALLOW_DEMO_LOGIN` (default on in dev, off when `NODE_ENV=production`)
- Deploy: root `Dockerfile` + `railway.json` (single service; FastAPI serves the built SPA from `STATIC_DIR`; healthcheck `/api/healthz`; `MEDIA_CACHE_DIR` on a volume)
- Optional env: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — enables real Google login + Drive. Redirect URI: `https://<domain>/api/auth/google/callback`. Without them the UI offers "Login Demo Local" (Drive uploads are simulated).

## Stack

- Backend: Python 3.13, FastAPI, SQLAlchemy 2 async + asyncpg, PostgreSQL, Fernet (cryptography) for BYOK secrets, boto3 (R2/S3), httpx (Drive v3, Runway), openai + google-genai SDKs
- Frontend: React + Vite, Tailwind, shadcn/ui, i18next (pt-BR/en-US), Zustand, Orval-generated hooks (`@workspace/api-client-react`)
- Contract: `lib/api-spec/openapi.yaml` is the source of truth; backend JSON is camelCase to match it

## Where things live

- `artifacts/api-server/app/` — FastAPI app: `models.py` (DB schema, tables auto-created on startup), `seed.py` (factory agents/categories), `ai.py` (engines), `storage.py` (StorageRouterService), `routers/*`
- `artifacts/promptfolio/src/` — pages (Login, Home, Builder, Executor, Catalog, Settings, Tutorials), locales, stores
- Generated media cache: `artifacts/api-server/.media_cache/` (gitignored, ephemeral in production)

## Architecture decisions

- Express template was replaced by FastAPI at the user's request; the OpenAPI spec still drives frontend codegen.
- Builder sessions lock to the first agent used (409 on a different agent); publishing again updates the same prompt and bumps `version` when the template changes.
- BYOK: the user's own connections always win over built-ins. The app's internal AI work (Builder chat, draft metadata, field docs, visual prompt compiling) runs on the user's OpenAI key, else Gemini, else OpenRouter Text, else the built-in (dev only); without any key those endpoints return 400 asking for a key in Settings.
- Multi-purpose providers (OpenAI, Gemini, Runway) store one optional model per modality (`mcp_connections.models` JSONB); blank uses `PROVIDER_DEFAULT_MODELS` (`ai.py`). A model is rejected if it doesn't belong to that modality.
- OpenRouter has 4 single-purpose connectors (text/image/audio/video), each with a required model validated against that kind's public OpenRouter catalog (`app/openrouter.py`, cached 1h). All OpenRouter connectors share one API key: a blank key on create reuses it, changing it on one updates all.
- Executor has no "automatic" engine: it lists only available engines for the modality (label "Name · model") and preselects the prompt's preferred connection, else the last pick (localStorage), else the first.
- Storage credentials only count as configured after a successful write test; a provider can only be activated when configured.
- Factory agents are global rows (`user_id` null): editable/deactivatable, never deletable.
- Brand references (`{{referencia_marca_anexa}}`): uploaded/pasted images live in Postgres (`reference_images`, bytea, deduped by sha256 per user, unique `@code`); typed URLs are never stored. Chip "x" only deselects; permanent deletion is in Settings > Referências de Marca (manual, bulk, cleanup with preview, opt-in auto-cleanup every 6 h). Image/video/text engines receive the pixels; audio gets only the text label.
- Field docs: each entry of `prompts.variables_schema` carries `label`, `helpText`, `examples[]`, `options[]` and `required` (missing = required). The Executor shows an ⓘ popover per field (white = required, yellow = optional) and blocks Run until required fields are filled and option fields hold an allowed value; the backend re-validates. New prompts get docs from AI (`POST /api/prompts/suggest-variables`, also run when publishing from the Builder); edit them in Catalog or the publish dialog.
- `create_all` never alters existing tables: additive column changes go in `SCHEMA_PATCHES` in `app/main.py`.

## Product

Dashboard, Builder Studio (agent + prompt workspaces with agent lock and "Salvar e Publicar"), Executor Studio (4 delivery tabs), Catalog (search/filters/versioning/export/import/backup), Settings (appearance, agents, AI MCP connectors, storage, brand reference library), Tutorials (Drive, R2, S3).

## User preferences

- Communicate with the user in Portuguese (Brazil).

## Gotchas

- Custom MCP connectors are testable (JSON-RPC `initialize`) but not executable yet.
- gpt-5 family models reject `temperature`; the code omits it for those models.
