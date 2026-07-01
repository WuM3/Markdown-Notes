import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  desktopSettingsFileName,
  ensureDataDirectory,
  loadDesktopSettings,
  saveDesktopSettings,
} from '../../src/desktop/settings.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'notes-desktop-settings-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('desktop settings', () => {
  it('returns defaults and marks the settings file missing on first launch', async () => {
    const dataDir = path.join(tempDir, 'data');

    const state = await loadDesktopSettings(tempDir, { dataDir });

    expect(state.exists).toBe(false);
    expect(state.settings).toEqual({
      dataDir: path.resolve(dataDir),
      port: 3210,
      launchAtLogin: false,
    });
  });

  it('saves settings and reads normalized values back', async () => {
    const dataDir = path.join(tempDir, 'chosen-data');

    await saveDesktopSettings(tempDir, {
      dataDir,
      port: 4210,
      launchAtLogin: true,
    });

    const state = await loadDesktopSettings(tempDir, {
      dataDir: path.join(tempDir, 'fallback'),
    });
    const raw = JSON.parse(
      await readFile(path.join(tempDir, desktopSettingsFileName), 'utf8'),
    ) as unknown;

    expect(state.exists).toBe(true);
    expect(state.settings).toEqual({
      dataDir: path.resolve(dataDir),
      port: 4210,
      launchAtLogin: true,
    });
    expect(raw).toMatchObject({ dataDir: path.resolve(dataDir) });
  });

  it('creates the notes and trash folders for a chosen data directory', async () => {
    const dataDir = path.join(tempDir, 'new-data');

    await ensureDataDirectory(dataDir);

    await expect(mkdir(path.join(dataDir, 'notes'))).rejects.toMatchObject({
      code: 'EEXIST',
    });
    await expect(mkdir(path.join(dataDir, '.trash'))).rejects.toMatchObject({
      code: 'EEXIST',
    });
  });
});
