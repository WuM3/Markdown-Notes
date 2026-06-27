import path from 'node:path';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import type { NotesRepository } from './repository.js';

interface ImportRemoteMarkdownImagesOptions {
  markdown: string;
  documentId: string;
  repository: NotesRepository;
  fetcher?: typeof fetch;
  maxBytes?: number;
}

interface ImageNode {
  type: 'image';
  url: string;
  alt?: string;
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
}

interface Replacement {
  from: number;
  to: number;
  markdown: string;
}

export async function importRemoteMarkdownImages({
  markdown,
  documentId,
  repository,
  fetcher = globalThis.fetch,
  maxBytes = 20 * 1024 * 1024,
}: ImportRemoteMarkdownImagesOptions): Promise<string> {
  if (!fetcher) return markdown;

  const replacements: Replacement[] = [];
  const tree = unified().use(remarkParse).parse(markdown);
  const images = collectRemoteImages(tree);

  for (const image of images) {
    const from = image.position?.start?.offset;
    const to = image.position?.end?.offset;
    if (typeof from !== 'number' || typeof to !== 'number') continue;

    const downloaded = await downloadImage(image.url, fetcher, maxBytes);
    if (!downloaded) continue;

    const asset = await repository.writeAsset(
      documentId,
      fileNameForRemoteImage(image.url, downloaded.mimeType),
      downloaded.data,
      downloaded.mimeType,
    );
    replacements.push({
      from,
      to,
      markdown: `![${escapeAlt(image.alt ?? '')}](.assets/${documentId}/${encodeURIComponent(asset.name)})`,
    });
  }

  return replacements
    .sort((a, b) => b.from - a.from)
    .reduce(
      (content, replacement) =>
        `${content.slice(0, replacement.from)}${replacement.markdown}${content.slice(
          replacement.to,
        )}`,
      markdown,
    );
}

function collectRemoteImages(node: unknown): ImageNode[] {
  const images: ImageNode[] = [];

  function visit(current: unknown) {
    if (!current || typeof current !== 'object') return;
    const candidate = current as { type?: string; url?: string; children?: unknown[] };
    if (
      candidate.type === 'image' &&
      typeof candidate.url === 'string' &&
      isImportableRemoteImage(candidate.url)
    ) {
      images.push(candidate as ImageNode);
    }
    if (Array.isArray(candidate.children)) {
      candidate.children.forEach(visit);
    }
  }

  visit(node);
  return images;
}

function isImportableRemoteImage(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    if (parsed.pathname.startsWith('/.assets/')) return false;
    if (parsed.pathname.includes('/api/assets/')) return false;
    return true;
  } catch {
    return false;
  }
}

async function downloadImage(
  url: string,
  fetcher: typeof fetch,
  maxBytes: number,
): Promise<{ data: Buffer; mimeType: string } | undefined> {
  try {
    const response = await fetcher(url);
    if (!response.ok) return undefined;

    const mimeType = response.headers.get('content-type')?.split(';')[0] ?? '';
    if (!mimeType.startsWith('image/')) return undefined;

    const data = Buffer.from(await response.arrayBuffer());
    if (data.byteLength > maxBytes) return undefined;

    return { data, mimeType };
  } catch {
    return undefined;
  }
}

function fileNameForRemoteImage(url: string, mimeType: string): string {
  const parsed = new URL(url);
  const baseName = decodeURIComponent(path.posix.basename(parsed.pathname)) || '图片';
  if (path.extname(baseName)) return baseName;
  return `${baseName}${extensionForMimeType(mimeType)}`;
}

function extensionForMimeType(mimeType: string): string {
  const extensions: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
  };
  return extensions[mimeType] ?? '';
}

function escapeAlt(alt: string): string {
  return alt.replace(/[[\]]/g, '');
}
