import { notesApi } from '../api.js';

export function assetMarkdownPath(documentId: string, name: string): string {
  return `.assets/${documentId}/${encodeURIComponent(name)}`;
}

export function assetPreviewUrl(url: string): string {
  const normalized = normalizeAssetUrl(url);
  const match = normalized.match(/^\.assets\/([^/]+)\/(.+)$/);
  if (!match) return url;
  return notesApi.assetUrl(match[1], decodeURIComponent(match[2]));
}

function normalizeAssetUrl(url: string): string {
  if (url.startsWith('/.assets/')) return url.slice(1);
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith('/.assets/')) {
      return `${parsed.pathname.slice(1)}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // Plain Markdown URLs are expected here.
  }
  return url;
}
