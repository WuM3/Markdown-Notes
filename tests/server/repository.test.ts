import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NotesRepository, RevisionConflictError } from '../../src/server/repository.js';

describe('NotesRepository', () => {
  let dataDir: string;
  let repository: NotesRepository;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), 'lan-notes-'));
    repository = new NotesRepository({
      dataDir,
      now: () => new Date('2026-06-25T08:00:00.000Z'),
    });
    await repository.initialize();
  });

  afterEach(async () => {
    await repository.close();
    await import('node:fs/promises').then(({ rm }) =>
      rm(dataDir, { recursive: true, force: true }),
    );
  });

  it('creates nested folders and Markdown-backed documents', async () => {
    await repository.createFolder({ parentPath: '', name: '科研' });
    await repository.createFolder({ parentPath: '科研', name: '论文' });
    const document = await repository.createDocument({
      parentPath: '科研/论文',
      title: '实验记录',
    });

    expect(document.path).toBe('科研/论文/实验记录.md');
    expect(document.content).toBe('');

    const diskSource = await readFile(
      path.join(dataDir, 'notes', '科研', '论文', '实验记录.md'),
      'utf8',
    );
    expect(diskSource).toContain(`id: ${document.id}`);
    expect(diskSource).toContain('title: 实验记录');

    const tree = await repository.getTree();
    expect(tree[0]).toMatchObject({
      kind: 'folder',
      name: '科研',
      children: [
        {
          kind: 'folder',
          name: '论文',
          children: [{ kind: 'document', name: '实验记录' }],
        },
      ],
    });
  });

  it('uses numbered names instead of overwriting an existing node', async () => {
    await repository.createFolder({ parentPath: '', name: '收集箱' });
    const first = await repository.createDocument({
      parentPath: '收集箱',
      title: '随手记',
    });
    const second = await repository.createDocument({
      parentPath: '收集箱',
      title: '随手记',
    });

    expect(first.path).toBe('收集箱/随手记.md');
    expect(second.path).toBe('收集箱/随手记 (2).md');
    expect(second.title).toBe('随手记 (2)');
  });

  it('saves atomically, renames from the title, and rejects stale revisions', async () => {
    const created = await repository.createDocument({
      parentPath: '',
      title: '旧标题',
    });

    const saved = await repository.saveDocument(created.id, {
      title: '新标题',
      content: '# 正文\n',
      revision: created.revision,
    });

    expect(saved.path).toBe('新标题.md');
    expect(saved.content).toBe('# 正文\n');
    await expect(stat(path.join(dataDir, 'notes', '旧标题.md'))).rejects.toThrow();
    expect(await readFile(path.join(dataDir, 'notes', '新标题.md'), 'utf8')).toContain(
      '# 正文',
    );

    await expect(
      repository.saveDocument(created.id, {
        title: '覆盖',
        content: '过期内容',
        revision: created.revision,
      }),
    ).rejects.toBeInstanceOf(RevisionConflictError);
  });

  it('moves documents and their asset directory together', async () => {
    await repository.createFolder({ parentPath: '', name: '目标' });
    const document = await repository.createDocument({
      parentPath: '',
      title: '带附件',
    });
    await repository.writeAsset(document.id, 'image.png', Buffer.from('image'));

    const moved = await repository.moveNode({
      kind: 'document',
      path: document.path,
      targetParentPath: '目标',
    });

    expect(moved.path).toBe('目标/带附件.md');
    expect(
      await readFile(
        path.join(dataDir, 'notes', '目标', '.assets', document.id, 'image.png'),
        'utf8',
      ),
    ).toBe('image');
  });

  it('soft deletes and restores documents to a numbered path on collision', async () => {
    const document = await repository.createDocument({
      parentPath: '',
      title: '可恢复',
    });
    const trashEntry = await repository.deleteNode({
      kind: 'document',
      path: document.path,
    });
    await repository.createDocument({ parentPath: '', title: '可恢复' });

    expect(await repository.listTrash()).toHaveLength(1);

    const restored = await repository.restoreTrash(trashEntry.id);
    expect(restored.path).toBe('可恢复 (2).md');
    expect(await repository.listTrash()).toHaveLength(0);
    expect((await repository.getDocument(document.id)).path).toBe('可恢复 (2).md');
  });
});

