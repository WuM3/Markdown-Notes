import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import JSZip from 'jszip';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';

describe('current document export API', () => {
  let app: FastifyInstance;
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), 'lan-notes-export-'));
    app = await buildApp({ dataDir, watch: false });
  });

  afterEach(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('exports the latest Markdown draft without mutating the saved document', async () => {
    const created = await createDocument(app, '旧标题');
    const response = await exportDocument(app, created.id, {
      format: 'md',
      title: '最新标题',
      content: '# 最新草稿\n\n尚未自动保存',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/markdown');
    expect(response.headers['content-disposition']).toContain(
      "filename*=UTF-8''%E6%9C%80%E6%96%B0%E6%A0%87%E9%A2%98.md",
    );
    expect(response.body).toContain('title: 最新标题');
    expect(response.body).toContain('# 最新草稿');
    expect(response.body).toContain('尚未自动保存');

    const saved = (
      await app.inject({ method: 'GET', url: `/api/documents/${created.id}` })
    ).json();
    expect(saved.title).toBe('旧标题');
    expect(saved.content).toBe('');
    expect(saved.revision).toBe(created.revision);
  });

  it('generates a DOCX containing headings, marks, tables and current text', async () => {
    const created = await createDocument(app, 'Word 导出');
    const response = await exportDocument(app, created.id, {
      format: 'docx',
      title: 'Word 完整排版',
      content: [
        '# 一级标题',
        '',
        '**粗体**、*斜体*、~~删除线~~和 `inline`',
        '',
        '| 列一 | 列二 |',
        '| --- | --- |',
        '| 中文 | 内容 |',
      ].join('\n'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(response.rawPayload.subarray(0, 2).toString()).toBe('PK');

    const zip = await JSZip.loadAsync(response.rawPayload);
    const documentXml = await zip.file('word/document.xml')?.async('string');
    expect(documentXml).toContain('Word 完整排版');
    expect(documentXml).toContain('一级标题');
    expect(documentXml).toContain('粗体');
    expect(documentXml).toContain('中文');
  });

  it('does not duplicate nested list text inside a DOCX quote', async () => {
    const created = await createDocument(app, '引用列表');
    const response = await exportDocument(app, created.id, {
      format: 'docx',
      title: '引用列表',
      content: [
        '> 引用说明',
        '>',
        '> - UNIQUE-QUOTE-ITEM-A',
        '> - UNIQUE-QUOTE-ITEM-B',
      ].join('\n'),
    });

    expect(response.statusCode).toBe(200);
    const zip = await JSZip.loadAsync(response.rawPayload);
    const documentXml = await zip.file('word/document.xml')?.async('string');
    expect(documentXml?.match(/UNIQUE-QUOTE-ITEM-A/g)).toHaveLength(1);
    expect(documentXml?.match(/UNIQUE-QUOTE-ITEM-B/g)).toHaveLength(1);
  });

  it('generates a non-empty Chinese PDF with a valid signature', async () => {
    const created = await createDocument(app, 'PDF 导出');
    const response = await exportDocument(app, created.id, {
      format: 'pdf',
      title: '中文 PDF',
      content: [
        '# 测试标题',
        '',
        '这是一段中文正文。',
        '',
        '```shell',
        'echo "long output"',
        '```',
      ].join('\n'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect(response.rawPayload.byteLength).toBeGreaterThan(1_000);
  });

  it.each([
    ['unsupported format', { format: 'zip', title: '错误', content: '' }],
    ['empty title', { format: 'md', title: '   ', content: '' }],
    ['overlong title', { format: 'md', title: '题'.repeat(201), content: '' }],
  ])('rejects %s with a stable bad request response', async (_name, payload) => {
    const created = await createDocument(app, '参数校验');
    const response = await exportDocument(app, created.id, payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('returns 404 for a missing document before rendering', async () => {
    const response = await exportDocument(app, 'missing-document', {
      format: 'pdf',
      title: '不存在',
      content: '不能导出',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: 'NOT_FOUND',
      message: '文档不存在',
    });
  });

  it('keeps exporting when a local image is missing or corrupt', async () => {
    const created = await createDocument(app, '损坏图片');
    const assetDir = path.join(
      dataDir,
      'notes',
      '.assets',
      created.id,
    );
    await mkdir(assetDir, { recursive: true });
    await writeFile(path.join(assetDir, 'broken.png'), 'not an image');

    const response = await exportDocument(app, created.id, {
      format: 'docx',
      title: '损坏图片降级',
      content: [
        '![缺失图片](.assets/' + created.id + '/missing.png)',
        '',
        '![损坏图片](.assets/' + created.id + '/broken.png)',
        '',
        '图片后的正文仍然存在。',
      ].join('\n'),
    });

    expect(response.statusCode).toBe(200);
    const zip = await JSZip.loadAsync(response.rawPayload);
    const documentXml = await zip.file('word/document.xml')?.async('string');
    expect(documentXml).toContain('缺失图片');
    expect(documentXml).toContain('损坏图片');
    expect(documentXml).toContain('图片后的正文仍然存在');
  });

  it('embeds a valid local image in DOCX media', async () => {
    const created = await createDocument(app, '有效图片');
    const assetDir = path.join(dataDir, 'notes', '.assets', created.id);
    await mkdir(assetDir, { recursive: true });
    await writeFile(
      path.join(assetDir, 'valid.png'),
      await sharp({
        create: {
          width: 32,
          height: 16,
          channels: 4,
          background: '#2f66d0',
        },
      }).png().toBuffer(),
    );

    const response = await exportDocument(app, created.id, {
      format: 'docx',
      title: '图片嵌入',
      content: `![有效图片](.assets/${created.id}/valid.png)`,
    });

    expect(response.statusCode).toBe(200);
    const zip = await JSZip.loadAsync(response.rawPayload);
    expect(
      Object.keys(zip.files).some((name) => name.startsWith('word/media/')),
    ).toBe(true);
  });

  it('does not read traversal image paths outside the document asset directory', async () => {
    const created = await createDocument(app, '路径安全');
    const secretPath = path.join(dataDir, 'secret.png');
    await writeFile(secretPath, 'private bytes');

    const response = await exportDocument(app, created.id, {
      format: 'docx',
      title: '路径安全',
      content: '![越界图片](.assets/' + created.id + '/../../../secret.png)',
    });

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.includes(await readFile(secretPath))).toBe(false);
  });

  it('keeps concurrent exports isolated by document and draft', async () => {
    const first = await createDocument(app, '第一篇');
    const second = await createDocument(app, '第二篇');

    const [firstExport, secondExport] = await Promise.all([
      exportDocument(app, first.id, {
        format: 'md',
        title: '第一篇导出',
        content: 'ONLY-FIRST-DRAFT',
      }),
      exportDocument(app, second.id, {
        format: 'md',
        title: '第二篇导出',
        content: 'ONLY-SECOND-DRAFT',
      }),
    ]);

    expect(firstExport.body).toContain('ONLY-FIRST-DRAFT');
    expect(firstExport.body).not.toContain('ONLY-SECOND-DRAFT');
    expect(secondExport.body).toContain('ONLY-SECOND-DRAFT');
    expect(secondExport.body).not.toContain('ONLY-FIRST-DRAFT');
  });
});

async function createDocument(app: FastifyInstance, title: string) {
  return (
    await app.inject({
      method: 'POST',
      url: '/api/documents',
      payload: { parentPath: '', title },
    })
  ).json();
}

function exportDocument(
  app: FastifyInstance,
  id: string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: 'POST',
    url: `/api/documents/${encodeURIComponent(id)}/export`,
    payload,
  });
}
