import type { McpProviderType, Modality } from '@workspace/api-client-react';

// What each kind of AI connector can generate. Must match MCP_SUPPORT in the API (app/ai.py).
export const PROVIDER_MODALITIES: Record<McpProviderType, Modality[]> = {
  openai_chatgpt: ['text', 'image', 'audio'],
  google_nano_banana: ['text', 'image', 'audio', 'video'],
  runway: ['image', 'video'],
  openrouter_text: ['text'],
  openrouter_image: ['image'],
  openrouter_audio: ['audio'],
  openrouter_video: ['video'],
  custom_mcp: [],
};

// Defaults the API uses when a per-modality model field is left blank (PROVIDER_DEFAULT_MODELS in app/ai.py).
export const PROVIDER_DEFAULT_MODELS: Partial<Record<McpProviderType, Partial<Record<Modality, string>>>> = {
  openai_chatgpt: { text: 'gpt-5-mini', image: 'gpt-image-1', audio: 'gpt-4o-mini-tts' },
  google_nano_banana: { text: 'gemini-2.5-flash', image: 'gemini-2.5-flash-image', audio: 'gemini-2.5-flash-preview-tts', video: 'veo-3.0-generate-001' },
  runway: { image: 'gen4_image', video: 'gen4.5' },
};

export const OPENROUTER_KIND: Partial<Record<McpProviderType, Modality>> = {
  openrouter_text: 'text',
  openrouter_image: 'image',
  openrouter_audio: 'audio',
  openrouter_video: 'video',
};

export const isOpenRouter = (p: McpProviderType) => p in OPENROUTER_KIND;

export const servesModality = (p: McpProviderType, m: Modality) => PROVIDER_MODALITIES[p]?.includes(m) ?? false;

// The executor remembers the last model picked per modality so the next visit starts there.
const LAST_ENGINE_KEY = (m: Modality) => `pf:last-engine:${m}`;
export const getLastEngine = (m: Modality) => { try { return localStorage.getItem(LAST_ENGINE_KEY(m)); } catch { return null; } };
export const setLastEngine = (m: Modality, id: string) => { try { localStorage.setItem(LAST_ENGINE_KEY(m), id); } catch { /* storage unavailable */ } };
