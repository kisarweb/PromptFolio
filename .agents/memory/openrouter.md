---
name: OpenRouter connectors
description: Decisions and unverified points about the 4 OpenRouter connectors (text/image/audio/video).
---
- User asked (2026-10-09) for 4 OpenRouter connectors sharing one key, each requiring a model; "file" models not used. Each modality must offer only models able to generate it; user always picks the model (no automatic choice).
**Why:** a text model must never be offered for image/video and vice versa.
**How to apply:** validate models against the per-kind public catalog; "audio" = TTS (/audio/speech), chat-audio and music models are out of scope.
- Unverified (no real key yet): whether OpenRouter video `frame_images` accepts base64 data URIs (docs show public URLs only; images endpoint does accept data URIs). If video-with-reference fails, upload the frame somewhere public first.
