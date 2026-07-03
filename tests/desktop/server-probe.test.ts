import { describe, expect, it, vi } from 'vitest';
import { probeNotesService } from '../../src/desktop/server-probe.js';

describe('desktop server probe', () => {
  it('reports an available port when no service responds', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('ECONNREFUSED'));

    await expect(probeNotesService(3210, fetcher)).resolves.toEqual({
      status: 'available',
      baseUrl: 'http://127.0.0.1:3210',
    });
  });

  it('reports a compatible existing notes service', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', version: '0.1.0' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(probeNotesService(3210, fetcher)).resolves.toMatchObject({
      status: 'compatible',
      baseUrl: 'http://127.0.0.1:3210',
      health: { status: 'ok', version: '0.1.0' },
    });
  });

  it('reports an incompatible service when health payload does not match', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: 'up' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(probeNotesService(3210, fetcher)).resolves.toEqual({
      status: 'incompatible',
      baseUrl: 'http://127.0.0.1:3210',
      reason: '目标地址不是兼容的个人笔记服务',
    });
  });

  it('reports an incompatible service when health JSON cannot be parsed', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('not json', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(probeNotesService(3210, fetcher)).resolves.toEqual({
      status: 'incompatible',
      baseUrl: 'http://127.0.0.1:3210',
      reason: '健康检查响应不是有效 JSON',
    });
  });
});
