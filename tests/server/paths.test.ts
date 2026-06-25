import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveExistingWithin,
  resolveWithin,
  sanitizeNodeName,
  toSafeRelativePath,
} from '../../src/server/domain/paths.js';

describe('filesystem path safety', () => {
  it('removes Windows-invalid characters and reserved trailing characters', () => {
    expect(sanitizeNodeName('  项目:计划?.  ')).toBe('项目-计划');
  });

  it('protects Windows reserved device names', () => {
    expect(sanitizeNodeName('CON')).toBe('CON-note');
    expect(sanitizeNodeName('nul.txt')).toBe('nul-note.txt');
  });

  it('falls back when a name becomes empty', () => {
    expect(sanitizeNodeName('...')).toBe('未命名');
  });

  it('accepts normalized relative paths', () => {
    expect(toSafeRelativePath('科研/论文')).toBe('科研/论文');
    expect(toSafeRelativePath('')).toBe('');
  });

  it('rejects traversal and absolute paths', () => {
    expect(() => toSafeRelativePath('../secret')).toThrow('非法路径');
    expect(() => toSafeRelativePath('/absolute')).toThrow('非法路径');
    expect(() => toSafeRelativePath('C:\\secret')).toThrow('非法路径');
  });

  it('resolves only paths contained by the configured root', () => {
    const root = path.resolve('data-root');
    expect(resolveWithin(root, 'notes/demo.md')).toBe(path.join(root, 'notes', 'demo.md'));
    expect(() => resolveWithin(root, '../outside')).toThrow('路径超出数据目录');
  });

  it('rejects an existing path that escapes through a directory link', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'lan-notes-path-'));
    const root = path.join(base, 'root');
    const outside = path.join(base, 'outside');
    await Promise.all([mkdir(root), mkdir(outside)]);
    await writeFile(path.join(outside, 'secret.txt'), 'secret');
    await symlink(outside, path.join(root, 'linked'), 'junction');

    await expect(resolveExistingWithin(root, 'linked/secret.txt')).rejects.toThrow(
      '符号链接超出数据目录',
    );
    await rm(base, { recursive: true, force: true });
  });
});
