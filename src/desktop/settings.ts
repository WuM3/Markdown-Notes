import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DesktopSettings } from '../shared/types.js';

export type { DesktopSettings };

export interface DesktopSettingsState {
  exists: boolean;
  settings: DesktopSettings;
  loadError?: string;
}

export const desktopSettingsFileName = 'desktop-settings.json';

interface DesktopSettingsDefaults {
  dataDir: string;
  port?: number;
  launchAtLogin?: boolean;
}

export async function loadDesktopSettings(
  userDataDir: string,
  defaults: DesktopSettingsDefaults,
): Promise<DesktopSettingsState> {
  const filePath = settingsPath(userDataDir);
  const fallback = normalizeDesktopSettings(defaults);
  try {
    const raw = JSON.parse(await readFile(filePath, 'utf8')) as Partial<DesktopSettings>;
    return {
      exists: true,
      settings: normalizeDesktopSettings({
        ...fallback,
        ...raw,
      }),
    };
  } catch (error) {
    if (isMissingFile(error)) {
      return { exists: false, settings: fallback };
    }
    return {
      exists: true,
      settings: fallback,
      loadError: `${desktopSettingsFileName} 无法读取，已使用默认设置。`,
    };
  }
}

export async function saveDesktopSettings(
  userDataDir: string,
  settings: DesktopSettings,
): Promise<void> {
  await mkdir(userDataDir, { recursive: true });
  await writeFile(
    settingsPath(userDataDir),
    `${JSON.stringify(normalizeDesktopSettings(settings), null, 2)}\n`,
    'utf8',
  );
}

export async function ensureDataDirectory(dataDir: string): Promise<void> {
  await mkdir(path.resolve(dataDir), { recursive: true });
  await mkdir(path.join(path.resolve(dataDir), 'notes'), { recursive: true });
  await mkdir(path.join(path.resolve(dataDir), '.trash'), { recursive: true });
}

function settingsPath(userDataDir: string): string {
  return path.join(userDataDir, desktopSettingsFileName);
}

function normalizeDesktopSettings(
  input: DesktopSettingsDefaults | Partial<DesktopSettings>,
): DesktopSettings {
  return {
    dataDir: path.resolve(String(input.dataDir || './data')),
    port: normalizePort(input.port),
    launchAtLogin: input.launchAtLogin === true,
  };
}

function normalizePort(port: unknown): number {
  return typeof port === 'number' && Number.isInteger(port) && port > 0 && port <= 65535
    ? port
    : 3210;
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
