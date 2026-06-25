export function assetMarkdownPath(documentId: string, name: string): string {
  return `.assets/${documentId}/${encodeURIComponent(name)}`;
}

export function assetPreviewUrl(url: string): string {
  const match = url.match(/^\.assets\/([^/]+)\/(.+)$/);
  if (!match) return url;
  return `/api/assets/${encodeURIComponent(match[1])}/${match[2]}`;
}

