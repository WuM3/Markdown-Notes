import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  accessUrlsForPort,
  startNotesServer,
} from '../../src/server/launcher.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'notes-server-launcher-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('server launcher', () => {
  it('starts the Fastify app with the provided data directory and port', async () => {
    const started = await startNotesServer({
      host: '127.0.0.1',
      port: 0,
      dataDir: tempDir,
      watch: false,
      logger: false,
    });

    try {
      expect(started.dataDir).toBe(tempDir);
      expect(started.localUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      const response = await fetch(`${started.localUrl}/api/health`);
      await expect(response.json()).resolves.toEqual({
        status: 'ok',
        version: '0.1.0',
      });
    } finally {
      await started.close();
    }
  });

  it('returns local and LAN URLs without loopback network interfaces', () => {
    const urls = accessUrlsForPort(3210, {
      Loopback: [
        {
          address: '127.0.0.1',
          family: 'IPv4',
          internal: true,
        },
      ],
      WiFi: [
        {
          address: '192.168.1.20',
          family: 'IPv4',
          internal: false,
        },
      ],
    });

    expect(urls).toEqual({
      localUrl: 'http://127.0.0.1:3210',
      lanUrls: ['http://192.168.1.20:3210'],
    });
  });
});
