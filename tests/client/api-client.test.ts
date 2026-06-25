import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '../../src/client/runtime/api-client.js';

describe('ApiClient', () => {
  it('uses same-origin URLs for the web runtime', () => {
    const client = new ApiClient({ target: 'web' });

    expect(client.apiUrl('/tree')).toBe('/api/tree');
    expect(client.assetUrl('doc-1', 'image.png')).toBe('/api/assets/doc-1/image.png');
  });

  it('uses the configured LAN server for the android runtime', () => {
    const client = new ApiClient({
      target: 'android',
      baseUrl: 'http://10.29.166.53:3210',
    });

    expect(client.apiUrl('/tree')).toBe('http://10.29.166.53:3210/api/tree');
    expect(client.assetUrl('文档', '图 1.png')).toBe(
      'http://10.29.166.53:3210/api/assets/%E6%96%87%E6%A1%A3/%E5%9B%BE%201.png',
    );
    expect(client.exportUrl()).toBe('http://10.29.166.53:3210/api/export');
  });

  it('preserves conflict response details in ApiError', async () => {
    const client = new ApiClient({
      target: 'web',
      fetcher: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ code: 'REVISION_CONFLICT', current: { revision: 'new' } }),
          {
            status: 409,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ),
    });

    await expect(client.request('/documents/doc-1')).rejects.toMatchObject<ApiError>({
      status: 409,
      body: { code: 'REVISION_CONFLICT', current: { revision: 'new' } },
    });
  });

  it('reads the current global fetch implementation at request time', async () => {
    const client = new ApiClient({ target: 'web' });
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await client.request('/health');

    expect(fetcher).toHaveBeenCalledWith('/api/health', undefined);
  });
});
