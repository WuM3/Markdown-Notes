import { describe, expect, it, vi } from 'vitest';
import {
  MemoryProfileStore,
  normalizeServerUrl,
  rememberServerProfile,
  testServerConnection,
} from '../../src/client/runtime/server-profiles.js';

describe('server profile utilities', () => {
  it('normalizes manually entered LAN server addresses', () => {
    expect(normalizeServerUrl('  10.29.166.53:3210/  ')).toBe(
      'http://10.29.166.53:3210',
    );
    expect(normalizeServerUrl('HTTP://192.168.1.2:3210///')).toBe(
      'http://192.168.1.2:3210',
    );
  });

  it('rejects blank or non-http addresses', () => {
    expect(() => normalizeServerUrl('')).toThrow('请输入服务器地址');
    expect(() => normalizeServerUrl('ftp://example.test')).toThrow(
      '服务器地址必须使用 http 或 https',
    );
  });

  it('keeps the latest successful server first and limits history to five', async () => {
    const store = new MemoryProfileStore();
    for (let index = 1; index <= 6; index += 1) {
      await rememberServerProfile(store, `http://192.168.1.${index}:3210`, () =>
        new Date(`2026-06-25T08:00:0${index}.000Z`),
      );
    }
    await rememberServerProfile(store, 'http://192.168.1.4:3210', () =>
      new Date('2026-06-25T08:01:00.000Z'),
    );

    const profiles = await store.list();
    expect(profiles).toHaveLength(5);
    expect(profiles[0]).toMatchObject({
      id: 'http://192.168.1.4:3210',
      baseUrl: 'http://192.168.1.4:3210',
      lastConnectedAt: '2026-06-25T08:01:00.000Z',
    });
    expect(profiles.map((profile) => profile.baseUrl)).not.toContain(
      'http://192.168.1.1:3210',
    );
  });

  it('tests server health with the normalized address', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', version: '0.1.0' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(testServerConnection('10.0.0.8:3210', fetcher)).resolves.toEqual({
      baseUrl: 'http://10.0.0.8:3210',
      health: { status: 'ok', version: '0.1.0' },
    });
    expect(fetcher).toHaveBeenCalledWith('http://10.0.0.8:3210/api/health', {
      signal: expect.any(AbortSignal),
    });
  });
});

