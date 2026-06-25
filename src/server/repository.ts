import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import type {
  AssetRecord,
  DocumentRecord,
  NodeKind,
  SaveDocumentRequest,
  TrashEntry,
  TreeNode,
} from '../shared/types.js';
import {
  parseMarkdownFile,
  revisionFor,
  serializeMarkdownFile,
} from './domain/markdown.js';
import {
  resolveExistingWithin,
  resolveWithin,
  sanitizeNodeName,
  toSafeRelativePath,
} from './domain/paths.js';

interface RepositoryOptions {
  dataDir: string;
  now?: () => Date;
}

interface CreateFolderInput {
  parentPath: string;
  name: string;
}

interface CreateDocumentInput {
  parentPath: string;
  title: string;
}

interface MoveNodeInput {
  kind: NodeKind;
  path: string;
  targetParentPath: string;
  newName?: string;
}

interface DeleteNodeInput {
  kind: NodeKind;
  path: string;
}

export class RevisionConflictError extends Error {
  constructor(public readonly current: DocumentRecord) {
    super('文档已在其他位置更新');
    this.name = 'RevisionConflictError';
  }
}

export class NotesRepository {
  readonly dataDir: string;
  readonly notesDir: string;
  readonly trashDir: string;

  private readonly now: () => Date;
  private readonly documentPaths = new Map<string, string>();

  constructor(options: RepositoryOptions) {
    this.dataDir = path.resolve(options.dataDir);
    this.notesDir = path.join(this.dataDir, 'notes');
    this.trashDir = path.join(this.dataDir, '.trash');
    this.now = options.now ?? (() => new Date());
  }

  async initialize(): Promise<void> {
    await Promise.all([
      mkdir(this.notesDir, { recursive: true }),
      mkdir(this.trashDir, { recursive: true }),
    ]);
    await this.rebuildDocumentMap();
  }

  async close(): Promise<void> {}

  async getTree(): Promise<TreeNode[]> {
    return this.readTreeLevel(this.notesDir, '');
  }

  async createFolder(input: CreateFolderInput): Promise<TreeNode> {
    const parentPath = toSafeRelativePath(input.parentPath);
    const parent = resolveWithin(this.notesDir, parentPath);
    await this.requireDirectory(parent);

    const name = await this.uniqueName(parent, sanitizeNodeName(input.name), '');
    const absolutePath = path.join(parent, name);
    await mkdir(absolutePath);

    return {
      id: `folder:${this.joinRelative(parentPath, name)}`,
      kind: 'folder',
      name,
      path: this.joinRelative(parentPath, name),
      updatedAt: this.now().toISOString(),
      children: [],
    };
  }

  async createDocument(input: CreateDocumentInput): Promise<DocumentRecord> {
    const parentPath = toSafeRelativePath(input.parentPath);
    const parent = resolveWithin(this.notesDir, parentPath);
    await this.requireDirectory(parent);

    const requestedTitle = sanitizeNodeName(input.title.replace(/\.md$/i, ''));
    const title = await this.uniqueName(parent, requestedTitle, '.md');
    const id = randomUUID();
    const createdAt = this.now().toISOString();
    const source = serializeMarkdownFile({ id, title, createdAt, content: '' });
    const relativePath = this.joinRelative(parentPath, `${title}.md`);
    const absolutePath = resolveWithin(this.notesDir, relativePath);

    await this.atomicWrite(absolutePath, source);
    this.documentPaths.set(id, relativePath);
    return this.toDocumentRecord(relativePath, source);
  }

  async getDocument(id: string): Promise<DocumentRecord> {
    let relativePath = this.documentPaths.get(id);
    if (!relativePath) {
      await this.rebuildDocumentMap();
      relativePath = this.documentPaths.get(id);
    }
    if (!relativePath) {
      throw new Error('文档不存在');
    }

    const source = await readFile(
      await resolveExistingWithin(this.notesDir, relativePath),
      'utf8',
    );
    return this.toDocumentRecord(relativePath, source);
  }

  async saveDocument(
    id: string,
    input: SaveDocumentRequest,
  ): Promise<DocumentRecord> {
    const current = await this.getDocument(id);
    if (current.revision !== input.revision) {
      throw new RevisionConflictError(current);
    }

    const requestedTitle = sanitizeNodeName(input.title.replace(/\.md$/i, ''));
    const parentAbsolute = resolveWithin(this.notesDir, current.parentPath);
    const currentBaseName = path.posix.basename(current.path, '.md');
    const title =
      requestedTitle === currentBaseName
        ? requestedTitle
        : await this.uniqueName(parentAbsolute, requestedTitle, '.md');
    const nextPath = this.joinRelative(current.parentPath, `${title}.md`);
    const nextSource = serializeMarkdownFile({
      id,
      title,
      createdAt: current.createdAt,
      content: input.content,
    });

    await this.atomicWrite(resolveWithin(this.notesDir, nextPath), nextSource);
    if (nextPath !== current.path) {
      await unlink(resolveWithin(this.notesDir, current.path));
    }
    this.documentPaths.set(id, nextPath);

    return this.toDocumentRecord(nextPath, nextSource);
  }

  async moveNode(input: MoveNodeInput): Promise<TreeNode | DocumentRecord> {
    const sourcePath = toSafeRelativePath(input.path);
    const targetParentPath = toSafeRelativePath(input.targetParentPath);
    const source = await resolveExistingWithin(this.notesDir, sourcePath);
    const targetParent = resolveWithin(this.notesDir, targetParentPath);
    await this.requireDirectory(targetParent);

    if (
      input.kind === 'folder' &&
      (targetParentPath === sourcePath ||
        targetParentPath.startsWith(`${sourcePath}/`))
    ) {
      throw new Error('不能将目录移动到自身内部');
    }

    if (input.kind === 'document') {
      const document = await this.documentAtPath(sourcePath);
      const desiredName = sanitizeNodeName(
        (input.newName ?? document.title).replace(/\.md$/i, ''),
      );
      const title = await this.uniqueName(targetParent, desiredName, '.md', source);
      const targetPath = this.joinRelative(targetParentPath, `${title}.md`);
      const target = resolveWithin(this.notesDir, targetPath);

      if (source !== target) {
        await rename(source, target);
      }
      await this.moveAssetDirectory(document.id, path.dirname(source), targetParent);

      const moved = await this.rewriteDocumentTitle(targetPath, title);
      this.documentPaths.set(document.id, targetPath);
      return moved;
    }

    const currentName = path.posix.basename(sourcePath);
    const desiredName = sanitizeNodeName(input.newName ?? currentName);
    const name = await this.uniqueName(targetParent, desiredName, '', source);
    const targetPath = this.joinRelative(targetParentPath, name);
    if (source !== resolveWithin(this.notesDir, targetPath)) {
      await rename(source, resolveWithin(this.notesDir, targetPath));
    }
    await this.rebuildDocumentMap();

    return {
      id: `folder:${targetPath}`,
      kind: 'folder',
      name,
      path: targetPath,
      updatedAt: this.now().toISOString(),
      children: await this.readTreeLevel(resolveWithin(this.notesDir, targetPath), targetPath),
    };
  }

  async writeAsset(
    documentId: string,
    fileName: string,
    data: Buffer,
    mimeType = 'application/octet-stream',
  ): Promise<AssetRecord> {
    const document = await this.getDocument(documentId);
    const parent = resolveWithin(this.notesDir, document.parentPath);
    const assetDir = path.join(parent, '.assets', documentId);
    await mkdir(assetDir, { recursive: true });

    const parsed = path.parse(sanitizeNodeName(fileName));
    const baseName = parsed.name || '附件';
    const name = `${await this.uniqueName(assetDir, baseName, parsed.ext)}${parsed.ext}`;
    await this.atomicWrite(path.join(assetDir, name), data);

    return {
      documentId,
      name,
      size: data.byteLength,
      mimeType,
      url: `/api/assets/${encodeURIComponent(documentId)}/${encodeURIComponent(name)}`,
    };
  }

  async assetPath(documentId: string, fileName: string): Promise<string> {
    const document = await this.getDocument(documentId);
    const safeName = sanitizeNodeName(fileName);
    return resolveExistingWithin(
      this.notesDir,
      this.joinRelative(document.parentPath, '.assets', documentId, safeName),
    );
  }

  async deleteNode(input: DeleteNodeInput): Promise<TrashEntry> {
    const sourcePath = toSafeRelativePath(input.path);
    const source = await resolveExistingWithin(this.notesDir, sourcePath);
    const id = randomUUID();
    const trashItemDir = path.join(this.trashDir, id);
    await mkdir(trashItemDir, { recursive: true });

    let documentId: string | undefined;
    if (input.kind === 'document') {
      const document = await this.documentAtPath(sourcePath);
      documentId = document.id;
      await rename(source, path.join(trashItemDir, 'item.md'));
      const sourceAssets = path.join(path.dirname(source), '.assets', document.id);
      if (await this.exists(sourceAssets)) {
        await rename(sourceAssets, path.join(trashItemDir, 'assets'));
      }
      this.documentPaths.delete(document.id);
    } else {
      await rename(source, path.join(trashItemDir, 'content'));
      await this.rebuildDocumentMap();
    }

    const entry: TrashEntry = {
      id,
      kind: input.kind,
      name: path.posix.basename(sourcePath).replace(/\.md$/i, ''),
      originalPath: sourcePath,
      deletedAt: this.now().toISOString(),
      documentId,
    };
    await writeFile(
      path.join(trashItemDir, 'metadata.json'),
      JSON.stringify(entry, null, 2),
      'utf8',
    );
    return entry;
  }

  async listTrash(): Promise<TrashEntry[]> {
    const entries = await readdir(this.trashDir, { withFileTypes: true });
    const result: TrashEntry[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        result.push(
          JSON.parse(
            await readFile(
              path.join(this.trashDir, entry.name, 'metadata.json'),
              'utf8',
            ),
          ) as TrashEntry,
        );
      } catch {
        // Ignore incomplete trash entries left by interrupted filesystem operations.
      }
    }
    return result.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  }

  async restoreTrash(id: string): Promise<TreeNode | DocumentRecord> {
    const trashItemDir = resolveWithin(this.trashDir, id);
    const entry = JSON.parse(
      await readFile(path.join(trashItemDir, 'metadata.json'), 'utf8'),
    ) as TrashEntry;
    const originalParentPath = path.posix.dirname(entry.originalPath);
    const parentPath = originalParentPath === '.' ? '' : originalParentPath;
    const parent = resolveWithin(this.notesDir, parentPath);
    await mkdir(parent, { recursive: true });

    if (entry.kind === 'document') {
      const originalTitle = path.posix.basename(entry.originalPath, '.md');
      const title = await this.uniqueName(parent, originalTitle, '.md');
      const destinationPath = this.joinRelative(parentPath, `${title}.md`);
      await rename(
        path.join(trashItemDir, 'item.md'),
        resolveWithin(this.notesDir, destinationPath),
      );
      if (entry.documentId && (await this.exists(path.join(trashItemDir, 'assets')))) {
        const destinationAssets = path.join(parent, '.assets', entry.documentId);
        await mkdir(path.dirname(destinationAssets), { recursive: true });
        await rename(path.join(trashItemDir, 'assets'), destinationAssets);
      }
      const document = await this.rewriteDocumentTitle(destinationPath, title);
      this.documentPaths.set(document.id, destinationPath);
      await rm(trashItemDir, { recursive: true, force: true });
      return document;
    }

    const originalName = path.posix.basename(entry.originalPath);
    const name = await this.uniqueName(parent, originalName, '');
    const destinationPath = this.joinRelative(parentPath, name);
    await rename(
      path.join(trashItemDir, 'content'),
      resolveWithin(this.notesDir, destinationPath),
    );
    await rm(trashItemDir, { recursive: true, force: true });
    await this.rebuildDocumentMap();
    return {
      id: `folder:${destinationPath}`,
      kind: 'folder',
      name,
      path: destinationPath,
      updatedAt: this.now().toISOString(),
      children: await this.readTreeLevel(
        resolveWithin(this.notesDir, destinationPath),
        destinationPath,
      ),
    };
  }

  async permanentlyDeleteTrash(id: string): Promise<void> {
    await rm(resolveWithin(this.trashDir, id), { recursive: true, force: true });
  }

  async emptyTrash(): Promise<void> {
    const entries = await readdir(this.trashDir, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) =>
          rm(path.join(this.trashDir, entry.name), { recursive: true, force: true }),
        ),
    );
  }

  async listDocuments(): Promise<DocumentRecord[]> {
    const documents: DocumentRecord[] = [];
    for (const id of this.documentPaths.keys()) {
      try {
        documents.push(await this.getDocument(id));
      } catch {
        // A watcher may observe a document between rename operations.
      }
    }
    return documents;
  }

  async listRecent(limit = 20): Promise<DocumentRecord[]> {
    return (await this.listDocuments())
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  async rebuildDocumentMap(): Promise<void> {
    this.documentPaths.clear();
    await this.scanDocumentPaths(this.notesDir, '');
  }

  private async scanDocumentPaths(
    absoluteDirectory: string,
    relativeDirectory: string,
  ): Promise<void> {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.assets') continue;
      const relativePath = this.joinRelative(relativeDirectory, entry.name);
      const absolutePath = path.join(absoluteDirectory, entry.name);
      if (entry.isDirectory()) {
        await this.scanDocumentPaths(absolutePath, relativePath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        try {
          const document = parseMarkdownFile(await readFile(absolutePath, 'utf8'));
          this.documentPaths.set(document.id, relativePath);
        } catch {
          // Files without application metadata remain untouched and are not indexed.
        }
      }
    }
  }

  private async readTreeLevel(
    absoluteDirectory: string,
    relativeDirectory: string,
  ): Promise<TreeNode[]> {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    const nodes: TreeNode[] = [];

    for (const entry of entries) {
      if (entry.name === '.assets') continue;
      const relativePath = this.joinRelative(relativeDirectory, entry.name);
      const absolutePath = path.join(absoluteDirectory, entry.name);
      const fileStat = await stat(absolutePath);

      if (entry.isDirectory()) {
        nodes.push({
          id: `folder:${relativePath}`,
          kind: 'folder',
          name: entry.name,
          path: relativePath,
          updatedAt: fileStat.mtime.toISOString(),
          children: await this.readTreeLevel(absolutePath, relativePath),
        });
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        try {
          const document = parseMarkdownFile(await readFile(absolutePath, 'utf8'));
          nodes.push({
            id: document.id,
            kind: 'document',
            name: document.title,
            path: relativePath,
            updatedAt: fileStat.mtime.toISOString(),
          });
        } catch {
          // Do not expose malformed files as editable documents.
        }
      }
    }

    return nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
  }

  private async documentAtPath(relativePath: string): Promise<DocumentRecord> {
    const source = await readFile(
      await resolveExistingWithin(this.notesDir, relativePath),
      'utf8',
    );
    return this.toDocumentRecord(relativePath, source);
  }

  private async toDocumentRecord(
    relativePath: string,
    source: string,
  ): Promise<DocumentRecord> {
    const document = parseMarkdownFile(source);
    const fileStat = await stat(
      await resolveExistingWithin(this.notesDir, relativePath),
    );
    const parentPath = path.posix.dirname(relativePath);
    return {
      ...document,
      path: relativePath,
      parentPath: parentPath === '.' ? '' : parentPath,
      updatedAt: fileStat.mtime.toISOString(),
      revision: revisionFor(source),
    };
  }

  private async rewriteDocumentTitle(
    relativePath: string,
    title: string,
  ): Promise<DocumentRecord> {
    const absolutePath = resolveWithin(this.notesDir, relativePath);
    const source = await readFile(absolutePath, 'utf8');
    const document = parseMarkdownFile(source);
    const nextSource = serializeMarkdownFile({ ...document, title });
    if (source !== nextSource) {
      await this.atomicWrite(absolutePath, nextSource);
    }
    return this.toDocumentRecord(relativePath, nextSource);
  }

  private async moveAssetDirectory(
    documentId: string,
    sourceParent: string,
    targetParent: string,
  ): Promise<void> {
    if (sourceParent === targetParent) return;
    const sourceAssets = path.join(sourceParent, '.assets', documentId);
    if (!(await this.exists(sourceAssets))) return;
    const targetAssets = path.join(targetParent, '.assets', documentId);
    await mkdir(path.dirname(targetAssets), { recursive: true });
    await rename(sourceAssets, targetAssets);
  }

  private async uniqueName(
    parent: string,
    desiredBase: string,
    extension: string,
    ignoredPath?: string,
  ): Promise<string> {
    let suffix = 1;
    let candidate = desiredBase;
    while (true) {
      const candidatePath = path.join(parent, `${candidate}${extension}`);
      if (candidatePath === ignoredPath || !(await this.exists(candidatePath))) {
        return candidate;
      }
      suffix += 1;
      candidate = `${desiredBase} (${suffix})`;
    }
  }

  private async atomicWrite(filePath: string, data: string | Buffer): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = path.join(
      path.dirname(filePath),
      `.${path.basename(filePath)}.${randomUUID()}.tmp`,
    );
    await writeFile(temporaryPath, data);
    await rename(temporaryPath, filePath);
  }

  private async requireDirectory(directory: string): Promise<void> {
    const relativePath = path
      .relative(this.notesDir, directory)
      .split(path.sep)
      .join('/');
    const result = await stat(
      await resolveExistingWithin(this.notesDir, relativePath),
    );
    if (!result.isDirectory()) {
      throw new Error('目录不存在');
    }
  }

  private async exists(target: string): Promise<boolean> {
    try {
      await stat(target);
      return true;
    } catch {
      return false;
    }
  }

  private joinRelative(...segments: string[]): string {
    return segments.filter(Boolean).join('/').replace(/\/+/g, '/');
  }
}
