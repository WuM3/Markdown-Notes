import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { localAssetName } from '../../src/server/export/assets.js';
import {
  validateExportRequest,
} from '../../src/server/export/export-document.js';
import { parseExportDocument } from '../../src/server/export/parse-markdown.js';
import {
  ExportFontMissingError,
  renderPdfExport,
} from '../../src/server/export/render-pdf.js';

describe('document export boundaries', () => {
  it.each([
    ['.assets/doc-1/image.png', 'doc-1', 'image.png'],
    ['.assets/doc-1/image%20one.png', 'doc-1', 'image one.png'],
    ['.assets/other/image.png', 'doc-1', undefined],
    ['.assets/doc-1/../secret.png', 'doc-1', undefined],
    ['.assets/doc-1/%2e%2e%2fsecret.png', 'doc-1', undefined],
    ['.assets/doc-1/folder%2Fsecret.png', 'doc-1', undefined],
    ['.assets\\doc-1\\secret.png', 'doc-1', 'secret.png'],
    ['https://example.com/image.png', 'doc-1', undefined],
  ])('resolves safe asset URL %s', (url, documentId, expected) => {
    expect(localAssetName(url, documentId)).toBe(expected);
  });

  it('accepts exactly 10 MiB and rejects the next UTF-8 byte', () => {
    expect(() =>
      validateExportRequest({
        format: 'md',
        title: '边界',
        content: 'a'.repeat(10 * 1024 * 1024),
      }),
    ).not.toThrow();

    expect(() =>
      validateExportRequest({
        format: 'md',
        title: '边界',
        content: `${'a'.repeat(10 * 1024 * 1024)}中`,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'PAYLOAD_TOO_LARGE',
        statusCode: 413,
      }),
    );
  });

  it('uses Helvetica for ASCII PDF content when no system font exists', async () => {
    const model = parseExportDocument({
      id: 'ascii',
      title: 'ASCII export',
      createdAt: '2026-07-09T08:00:00.000Z',
      markdown: 'Plain text only.',
    });

    const data = await renderPdfExport(
      model,
      { loadImage: async () => undefined },
      [],
    );
    expect(data.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('fails explicitly instead of producing garbled Chinese without a font', async () => {
    const model = parseExportDocument({
      id: 'unicode',
      title: '中文导出',
      createdAt: '2026-07-09T08:00:00.000Z',
      markdown: '中文正文',
    });

    await expect(
      renderPdfExport(model, { loadImage: async () => undefined }, []),
    ).rejects.toBeInstanceOf(ExportFontMissingError);
  });

  it('skips an existing but invalid font candidate before using a valid one', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'notes-font-'));
    try {
      const brokenFont = path.join(tempDir, 'broken.ttf');
      await writeFile(brokenFont, 'not a font');
      const model = parseExportDocument({
        id: 'font-fallback',
        title: '字体回退',
        createdAt: '2026-07-09T08:00:00.000Z',
        markdown: '中文正文',
      });

      const data = await renderPdfExport(
        model,
        { loadImage: async () => undefined },
        [
          { path: brokenFont },
          { path: 'C:\\Windows\\Fonts\\Deng.ttf' },
        ],
      );
      expect(data.subarray(0, 5).toString()).toBe('%PDF-');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
