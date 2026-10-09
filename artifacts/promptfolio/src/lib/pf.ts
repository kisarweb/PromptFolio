import { Image, Video, AudioLines, FileText, type LucideIcon } from 'lucide-react';
import type { Modality } from '@workspace/api-client-react';

export const MODALITIES: Modality[] = ['image', 'video', 'audio', 'text'];

export const MODALITY_ICON: Record<Modality, LucideIcon> = {
  image: Image,
  video: Video,
  audio: AudioLines,
  text: FileText,
};

export const MODALITY_HUE: Record<Modality, string> = {
  image: 'hsl(var(--chart-1))',
  video: 'hsl(var(--chart-4))',
  audio: 'hsl(var(--chart-2))',
  text: 'hsl(var(--chart-3))',
};

export function apiErrorMessage(err: unknown): string {
  const e = err as { data?: { detail?: unknown }; message?: string } | null;
  const d = e?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x) => (x as { msg?: string }).msg ?? String(x)).join('; ');
  return e?.message ?? 'Error';
}

export function detectVariables(text: string): string[] {
  const out: string[] = [];
  const re = /\{\{\s*([\w.-]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

export function downloadText(content: string, filename: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'delivery';
}
