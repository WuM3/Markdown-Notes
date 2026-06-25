import path from 'node:path';
import { realpath } from 'node:fs/promises';

const WINDOWS_RESERVED_NAME =
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function sanitizeNodeName(input: string): string {
  let name = [...input]
    .map((character) => (character.charCodeAt(0) < 32 ? '-' : character))
    .join('')
    .trim()
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/-+/g, '-')
    .replace(/[\s.-]+$/g, '')
    .replace(/^[\s.-]+/g, '');

  if (!name) {
    return '未命名';
  }

  if (WINDOWS_RESERVED_NAME.test(name)) {
    const extensionIndex = name.indexOf('.');
    name =
      extensionIndex === -1
        ? `${name}-note`
        : `${name.slice(0, extensionIndex)}-note${name.slice(extensionIndex)}`;
  }

  return name;
}

export function toSafeRelativePath(input: string): string {
  if (!input) {
    return '';
  }

  if (
    input.includes('\0') ||
    path.isAbsolute(input) ||
    /^[a-zA-Z]:[\\/]/.test(input) ||
    input.startsWith('/') ||
    input.startsWith('\\')
  ) {
    throw new Error('非法路径');
  }

  const normalized = input.replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    throw new Error('非法路径');
  }

  return segments.filter(Boolean).join('/');
}

export function resolveWithin(root: string, relativePath: string): string {
  let safeRelative: string;
  try {
    safeRelative = toSafeRelativePath(relativePath);
  } catch {
    throw new Error('路径超出数据目录');
  }

  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...safeRelative.split('/'));
  const prefix = `${resolvedRoot}${path.sep}`;

  if (resolved !== resolvedRoot && !resolved.startsWith(prefix)) {
    throw new Error('路径超出数据目录');
  }

  return resolved;
}

export async function resolveExistingWithin(
  root: string,
  relativePath: string,
): Promise<string> {
  const lexicalPath = resolveWithin(root, relativePath);
  const [realRoot, realTarget] = await Promise.all([
    realpath(path.resolve(root)),
    realpath(lexicalPath),
  ]);
  const comparableRoot =
    process.platform === 'win32' ? realRoot.toLocaleLowerCase() : realRoot;
  const comparableTarget =
    process.platform === 'win32' ? realTarget.toLocaleLowerCase() : realTarget;
  const prefix = `${comparableRoot}${path.sep}`;

  if (comparableTarget !== comparableRoot && !comparableTarget.startsWith(prefix)) {
    throw new Error('符号链接超出数据目录');
  }
  return lexicalPath;
}
