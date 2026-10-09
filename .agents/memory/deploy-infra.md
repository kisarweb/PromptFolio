---
name: Production infrastructure (Neon + Railway)
description: Where production runs, IDs, and the rules for changing env vars / DB / deploys.
---
- Neon project "promptfolio" (id rough-meadow-78496404, branch "production", db neondb). Dev (Replit, via NEON_DATABASE_URL secret) and prod (Railway DATABASE_URL) share this one DB.
- Railway project 225d4cb7-dca4-4fe1-a433-8c9e25ac39ce, env production a1549535-e7a6-4fd4-8ea5-3612c07093b8, service 012d62f7-d51e-4232-b9d6-8b0eb8883a7a, URL https://promptfolio.up.railway.app (renamed from promptfolio-production). Builds from kisarweb/PromptFolio main (Dockerfile), but a push did NOT auto-deploy (2026-10-09): after pushing, trigger it with connectServiceSource(repo, branch main) and confirm via listDeployments.
- SESSION_SECRET must stay identical on Replit and Railway: it decrypts users' BYOK keys and Google tokens stored in the shared DB.
**Why:** user asked for Neon + Railway production; Replit's DATABASE_URL is runtime-managed so Neon goes through NEON_DATABASE_URL.
**How to apply:** use Neon's direct (non -pooler) URL (asyncpg prepared statements). Neon MCP getConnectionString is blocked by the credential filter — ask the user. Pass secrets to Railway setVariables by reading process.env inside an impure function; never print them. Railway deploy logs show uvicorn INFO lines as severity "error" (stderr) — not real errors.
- AI is BYOK per user (Settings > AI connectors); no server AI keys in production. **Why:** user asked that each client use their own OpenAI/Gemini keys.
