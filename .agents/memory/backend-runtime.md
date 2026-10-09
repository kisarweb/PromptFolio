---
name: Backend runtime quirks
description: Non-obvious facts about the Python backend and the Replit AI proxy behavior verified in this project
---
- The api-server artifact runs Python (uvicorn) even though it was scaffolded as the Node/Express template. Production run uses `--app-dir artifacts/api-server`.
  **Why:** the user explicitly required React + Python FastAPI + PostgreSQL.
- SQLAlchemy asyncio needs the `greenlet` package installed explicitly; it is not pulled in automatically here.
- Verified through the Replit AI proxy (Oct 2026): gpt-5.6-terra chat works without temperature; gemini-2.5-flash-image accepts `ImageConfig(aspect_ratio=...)`; gpt-image-1 is slow (~55s); gpt-audio with modalities text+audio returns mp3.
  **How to apply:** keep long HTTP timeouts on image generation; don't re-add temperature for gpt-5 models.
- Verified via the proxy (Oct 2026): gpt-image-1 `images.edit` with a list of reference images works (~35s); gpt-5.6-terra accepts `image_url` data-URI parts; Gemini image accepts `Part.from_bytes` refs.
- Wikimedia thumbnail URLs with non-standard widths (e.g. /320px-) return HTTP 400; use original file URLs when testing URL references.
- Field-doc AI suggestions vary between runs (required flags, odd examples). For the user's own prompts, curate the result (follow the template's CAMPOS OBRIGATÓRIOS/OPCIONAIS) instead of saving the raw output.
  **Why:** a second run flipped an optional field to required and produced a garbled example.
- Users write image prompts as chat-assistant scripts (briefing forms, "wait for START"). Sent raw, Gemini image replies with text and no image, so image/video runs first go through a text-model "compile" step.
  **Why:** the user hit a 502 "returned no image" on such a prompt; publishing was unrelated.
