import type { ReferenceImage, BrandReferenceInput } from '@workspace/api-client-react';

export const BRAND_VAR = 'referencia_marca_anexa';
export const MAX_BRAND_REFS = 4;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** A brand reference selected in the Executor field. */
export type BrandRef = { kind: 'url'; url: string } | { kind: 'library'; ref: ReferenceImage };

export function brandRefKey(r: BrandRef) {
  return r.kind === 'url' ? `url:${r.url}` : `lib:${r.ref.id}`;
}

export function toBrandInput(r: BrandRef): BrandReferenceInput {
  return r.kind === 'url' ? { kind: 'url', url: r.url } : { kind: 'library', referenceId: r.ref.id };
}

export function isHttpUrl(text: string) {
  try {
    const u = new URL(text.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
