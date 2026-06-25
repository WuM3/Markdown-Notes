import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { parseMarkdownFile, serializeMarkdownFile } from '../../src/server/domain/markdown.js';

describe('Fastify API', () => {
  let dataDir: string;
  let app: FastifyInstance;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), 'lan-notes-api-'));
    app = await buildApp({ dataDir, watch: false });
  });

  afterEach(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('creates folders and documents, then returns them in the tree', async () => {
    const folderResponse = await app.inject({
      method: 'POST',
      url: '/api/folders',
      payload: { parentPath: '', name: '工作' },
    });
    expect(folderResponse.statusCode).toBe(201);

    const documentResponse = await app.inject({
      method: 'POST',
      url: '/api/documents',
      payload: { parentPath: '工作', title: '周报' },
    });
    expect(documentResponse.statusCode).toBe(201);
    expect(documentResponse.json()).toMatchObject({
      title: '周报',
      path: '工作/周报.md',
    });

    const treeResponse = await app.inject({ method: 'GET', url: '/api/tree' });
    expect(treeResponse.statusCode).toBe(200);
    expect(treeResponse.json()[0].children[0]).toMatchObject({
      kind: 'document',
      name: '周报',
    });
  });

  it('reports health for LAN and Android clients', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      version: '0.1.0',
    });
  });

  it('allows Capacitor and local development origins but rejects unrelated browser origins', async () => {
    const capacitor = await app.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: {
        origin: 'http://localhost',
        'access-control-request-method': 'GET',
      },
    });
    expect(capacitor.headers['access-control-allow-origin']).toBe('http://localhost');

    const unrelated = await app.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: {
        origin: 'http://example.test',
        'access-control-request-method': 'GET',
      },
    });
    expect(unrelated.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns 409 and the current document for a stale save', async () => {
    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/documents',
        payload: { parentPath: '', title: '并发测试' },
      })
    ).json();

    const saved = await app.inject({
      method: 'PUT',
      url: `/api/documents/${created.id}`,
      payload: {
        title: created.title,
        content: '服务器版本',
        revision: created.revision,
      },
    });
    expect(saved.statusCode).toBe(200);

    const conflict = await app.inject({
      method: 'PUT',
      url: `/api/documents/${created.id}`,
      payload: {
        title: created.title,
        content: '过期版本',
        revision: created.revision,
      },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      code: 'REVISION_CONFLICT',
      current: { content: '服务器版本\n' },
    });
  });

  it('indexes saves for search and exposes recent documents', async () => {
    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/documents',
        payload: { parentPath: '', title: '实验日志' },
      })
    ).json();
    await app.inject({
      method: 'PUT',
      url: `/api/documents/${created.id}`,
      payload: {
        title: created.title,
        content: '今天完成卷积网络实验。',
        revision: created.revision,
      },
    });

    const search = await app.inject({
      method: 'GET',
      url: '/api/search?q=卷积',
    });
    expect(search.json()[0]).toMatchObject({ title: '实验日志' });

    const recent = await app.inject({ method: 'GET', url: '/api/recent' });
    expect(recent.json()[0]).toMatchObject({ title: '实验日志' });
  });

  it('uploads assets, enforces safe download headers, and exports a zip', async () => {
    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/documents',
        payload: { parentPath: '', title: '附件测试' },
      })
    ).json();
    const boundary = '----lan-notes-boundary';
    const multipartBody = [
      `--${boundary}\r\n`,
      'Content-Disposition: form-data; name="documentId"\r\n\r\n',
      `${created.id}\r\n`,
      `--${boundary}\r\n`,
      'Content-Disposition: form-data; name="file"; filename="report.txt"\r\n',
      'Content-Type: text/plain\r\n\r\n',
      'attachment body\r\n',
      `--${boundary}--\r\n`,
    ].join('');

    const upload = await app.inject({
      method: 'POST',
      url: '/api/assets',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipartBody,
    });
    expect(upload.statusCode).toBe(201);

    const asset = upload.json();
    const download = await app.inject({ method: 'GET', url: asset.url });
    expect(download.body).toBe('attachment body');
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.headers['x-content-type-options']).toBe('nosniff');

    const exported = await app.inject({ method: 'GET', url: '/api/export' });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-type']).toContain('application/zip');
    expect(exported.rawPayload.subarray(0, 2).toString()).toBe('PK');
  });

  it('lists, restores, and permanently removes trash entries', async () => {
    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/documents',
        payload: { parentPath: '', title: '待删除' },
      })
    ).json();
    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/nodes',
      payload: { kind: 'document', path: created.path },
    });
    const trashEntry = deleted.json();

    expect((await app.inject({ method: 'GET', url: '/api/trash' })).json()).toHaveLength(
      1,
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/trash/${trashEntry.id}/restore`,
        })
      ).statusCode,
    ).toBe(200);

    const deletedAgain = (
      await app.inject({
        method: 'DELETE',
        url: '/api/nodes',
        payload: { kind: 'document', path: created.path },
      })
    ).json();
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/trash/${deletedAgain.id}`,
        })
      ).statusCode,
    ).toBe(204);
  });

  it('refreshes search after an existing Markdown file is edited externally', async () => {
    await app.close();
    app = await buildApp({ dataDir, watch: true });
    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/documents',
        payload: { parentPath: '', title: '外部编辑' },
      })
    ).json();
    const filePath = path.join(dataDir, 'notes', '外部编辑.md');
    const parsed = parseMarkdownFile(await readFile(filePath, 'utf8'));
    await writeFile(
      filePath,
      serializeMarkdownFile({ ...parsed, content: '由其他编辑器写入的特殊关键词' }),
      'utf8',
    );

    let results: unknown[] = [];
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      results = (
        await app.inject({
          method: 'GET',
          url: '/api/search?q=特殊关键词',
        })
      ).json();
      if (results.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(results).toEqual([
      expect.objectContaining({ id: created.id, title: '外部编辑' }),
    ]);
  });
});
