import { createReadStream, existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import chokidar, { type FSWatcher } from 'chokidar';
import Fastify, {
  type FastifyInstance,
} from 'fastify';
import type {
  DocumentRecord,
  ExportDocumentRequest,
  NodeKind,
} from '../shared/types.js';
import { exportDocument } from './export/export-document.js';
import { NotesRepository, RevisionConflictError } from './repository.js';
import { importRemoteMarkdownImages } from './remote-assets.js';
import { SearchIndex } from './search-index.js';

interface BuildAppOptions {
  dataDir: string;
  staticDir?: string;
  watch?: boolean;
  imageLimitBytes?: number;
  attachmentLimitBytes?: number;
  logger?: boolean;
}

interface NodeBody {
  kind: NodeKind;
  path: string;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const repository = new NotesRepository({ dataDir: options.dataDir });
  const searchIndex = new SearchIndex();
  const attachmentLimitBytes = options.attachmentLimitBytes ?? 100 * 1024 * 1024;
  const imageLimitBytes = options.imageLimitBytes ?? 20 * 1024 * 1024;

  await repository.initialize();
  searchIndex.rebuild(await repository.listDocuments());

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || isAllowedCorsOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  });

  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: attachmentLimitBytes,
    },
  });

  app.get('/api/health', async () => ({
    status: 'ok',
    version: '0.1.0',
  }));

  app.get('/api/tree', async () => repository.getTree());

  app.post('/api/folders', async (request, reply) => {
    const body = request.body as { parentPath: string; name: string };
    const folder = await repository.createFolder(body);
    return reply.code(201).send(folder);
  });

  app.post('/api/documents', async (request, reply) => {
    const body = request.body as { parentPath: string; title: string };
    const document = await repository.createDocument(body);
    searchIndex.upsert(document);
    return reply.code(201).send(document);
  });

  app.get('/api/documents/:id', async (request) => {
    const { id } = request.params as { id: string };
    return repository.getDocument(id);
  });

  app.post(
    '/api/documents/:id/export',
    { bodyLimit: 11 * 1024 * 1024 },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const exported = await exportDocument({
        repository,
        documentId: id,
        request: request.body as ExportDocumentRequest,
      });
      return reply
        .header('content-type', exported.contentType)
        .header(
          'content-disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(exported.fileName)}`,
        )
        .send(exported.data);
    },
  );

  app.put('/api/documents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      title: string;
      content: string;
      revision: string;
    };
    try {
      const current = await repository.getDocument(id);
      if (current.revision !== body.revision) {
        throw new RevisionConflictError(current);
      }
      const content = await importRemoteMarkdownImages({
        markdown: body.content,
        documentId: id,
        repository,
        maxBytes: imageLimitBytes,
      });
      const document = await repository.saveDocument(id, {
        ...body,
        content,
      });
      searchIndex.upsert(document);
      return document;
    } catch (error) {
      if (error instanceof RevisionConflictError) {
        return reply.code(409).send({
          code: 'REVISION_CONFLICT',
          message: error.message,
          current: error.current,
        });
      }
      throw error;
    }
  });

  app.post('/api/nodes/move', async (request) => {
    const body = request.body as {
      kind: NodeKind;
      path: string;
      targetParentPath: string;
      newName?: string;
    };
    const moved = await repository.moveNode(body);
    if (body.kind === 'document') {
      searchIndex.upsert(moved as DocumentRecord);
    } else {
      searchIndex.rebuild(await repository.listDocuments());
    }
    return moved;
  });

  app.delete('/api/nodes', async (request) => {
    const body = request.body as NodeBody;
    const deleted = await repository.deleteNode(body);
    if (deleted.documentId) {
      searchIndex.remove(deleted.documentId);
    } else {
      searchIndex.rebuild(await repository.listDocuments());
    }
    return deleted;
  });

  app.get('/api/search', async (request) => {
    const { q = '' } = request.query as { q?: string };
    return searchIndex.search(q);
  });

  app.get('/api/recent', async (request) => {
    const { limit = '20' } = request.query as { limit?: string };
    return repository.listRecent(Math.min(Number(limit) || 20, 100));
  });

  app.get('/api/trash', async () => repository.listTrash());

  app.post('/api/trash/:id/restore', async (request) => {
    const { id } = request.params as { id: string };
    const restored = await repository.restoreTrash(id);
    if ('content' in restored) {
      searchIndex.upsert(restored);
    } else {
      searchIndex.rebuild(await repository.listDocuments());
    }
    return restored;
  });

  app.delete('/api/trash/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await repository.permanentlyDeleteTrash(id);
    return reply.code(204).send();
  });

  app.delete('/api/trash', async (_request, reply) => {
    await repository.emptyTrash();
    return reply.code(204).send();
  });

  app.post('/api/assets', async (request, reply) => {
    let documentId = '';
    let upload:
      | {
          name: string;
          mimeType: string;
          data: Buffer;
        }
      | undefined;

    for await (const part of request.parts()) {
      if (part.type === 'field' && part.fieldname === 'documentId') {
        documentId = String(part.value);
      }
      if (part.type === 'file' && part.fieldname === 'file') {
        upload = {
          name: part.filename,
          mimeType: part.mimetype,
          data: await part.toBuffer(),
        };
      }
    }

    if (!documentId || !upload) {
      return reply.code(400).send({
        code: 'BAD_REQUEST',
        message: '缺少文档或附件',
      });
    }
    if (upload.mimeType.startsWith('image/') && upload.data.byteLength > imageLimitBytes) {
      return reply.code(413).send({
        code: 'PAYLOAD_TOO_LARGE',
        message: '图片超过大小限制',
      });
    }

    const asset = await repository.writeAsset(
      documentId,
      upload.name,
      upload.data,
      upload.mimeType,
    );
    return reply.code(201).send(asset);
  });

  app.get('/api/assets/:documentId/:name', async (request, reply) => {
    const { documentId, name } = request.params as {
      documentId: string;
      name: string;
    };
    const filePath = await repository.assetPath(documentId, name);
    const info = await stat(filePath);
    const mimeType = mimeTypeFor(filePath);
    const disposition = isSafeInlineImage(filePath) ? 'inline' : 'attachment';

    reply
      .header('content-type', mimeType)
      .header('content-length', info.size)
      .header('x-content-type-options', 'nosniff')
      .header(
        'content-disposition',
        `${disposition}; filename*=UTF-8''${encodeURIComponent(path.basename(filePath))}`,
      );
    return reply.send(createReadStream(filePath));
  });

  let watcher: FSWatcher | undefined;
  let refreshTimer: NodeJS.Timeout | undefined;
  if (options.watch !== false) {
    watcher = chokidar.watch(repository.notesDir, {
      ignoreInitial: true,
      ignored: (watchedPath) =>
        watchedPath.split(path.sep).includes('.assets') ||
        watchedPath.endsWith('.tmp'),
      awaitWriteFinish: {
        stabilityThreshold: 250,
        pollInterval: 50,
      },
    });
    watcher.on('all', () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(async () => {
        await repository.rebuildDocumentMap();
        searchIndex.rebuild(await repository.listDocuments());
      }, 100);
    });
    await new Promise<void>((resolve, reject) => {
      watcher?.once('ready', resolve);
      watcher?.once('error', reject);
    });
  }

  const staticDir = options.staticDir ? path.resolve(options.staticDir) : undefined;
  if (staticDir && existsSync(staticDir)) {
    await app.register(fastifyStatic, {
      root: staticDir,
      prefix: '/',
      wildcard: false,
    });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({
          code: 'NOT_FOUND',
          message: '接口不存在',
        });
      }
      return reply.type('text/html').send(await readFile(path.join(staticDir, 'index.html')));
    });
  }

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const errorStatus =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : undefined;
    const statusCode =
      errorStatus && errorStatus >= 400 ? errorStatus : 500;
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : statusCode === 500
          ? 'INTERNAL_ERROR'
          : 'REQUEST_ERROR';
    const message = error instanceof Error ? error.message : '未知错误';
    reply.code(statusCode).send({
      code,
      message: statusCode === 500 ? '服务器处理请求失败' : message,
    });
  });

  app.addHook('onClose', async () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    await watcher?.close();
    await repository.close();
  });

  return app;
}

function isSafeInlineImage(filePath: string): boolean {
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(
    path.extname(filePath).toLowerCase(),
  );
}

function mimeTypeFor(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.txt': 'text/plain; charset=utf-8',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
  };
  return types[extension] ?? 'application/octet-stream';
}

function isAllowedCorsOrigin(origin: string): boolean {
  return (
    origin === 'http://localhost' ||
    origin === 'capacitor://localhost' ||
    origin === 'http://localhost:5173' ||
    origin === 'http://127.0.0.1:5173'
  );
}
