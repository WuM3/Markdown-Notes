import { readFile, stat } from 'node:fs/promises';
import sharp from 'sharp';
import type { NotesRepository } from '../repository.js';

const maxImageBytes = 20 * 1024 * 1024;
const maxTotalImageBytes = 100 * 1024 * 1024;

export interface ExportImageAsset {
  data: Buffer;
  width: number;
  height: number;
}

export interface ExportAssetLoader {
  loadImage: (url: string) => Promise<ExportImageAsset | undefined>;
}

export function createExportAssetLoader(
  repository: NotesRepository,
  documentId: string,
): ExportAssetLoader {
  let totalBytes = 0;
  return {
    async loadImage(url) {
      const fileName = localAssetName(url, documentId);
      if (!fileName) return undefined;

      try {
        const filePath = await repository.assetPath(documentId, fileName);
        const info = await stat(filePath);
        if (
          !info.isFile() ||
          info.size <= 0 ||
          info.size > maxImageBytes ||
          totalBytes + info.size > maxTotalImageBytes
        ) {
          return undefined;
        }

        const source = await readFile(filePath);
        const converted = await sharp(source, { animated: false, pages: 1 })
          .png()
          .toBuffer({ resolveWithObject: true });
        const width = converted.info.width;
        const height = converted.info.height;
        if (!width || !height) return undefined;
        totalBytes += info.size;
        return { data: converted.data, width, height };
      } catch {
        return undefined;
      }
    },
  };
}

export function localAssetName(
  url: string,
  documentId: string,
): string | undefined {
  const normalized = url.replaceAll('\\', '/');
  const prefix = `.assets/${documentId}/`;
  if (!normalized.startsWith(prefix)) return undefined;
  const encodedName = normalized.slice(prefix.length);
  if (
    !encodedName ||
    encodedName.includes('/') ||
    encodedName === '.' ||
    encodedName === '..' ||
    encodedName.includes('\0')
  ) {
    return undefined;
  }

  try {
    const name = decodeURIComponent(encodedName);
    if (!name || name === '.' || name === '..' || /[/\\\0]/.test(name)) {
      return undefined;
    }
    return name;
  } catch {
    return undefined;
  }
}
