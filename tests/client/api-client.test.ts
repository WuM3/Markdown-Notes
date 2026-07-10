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
  });

  it('downloads a binary current-document export with response metadata', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(new Blob(['draft bytes'], { type: 'text/markdown' }), {
        headers: {
          'content-type': 'text/markdown; charset=utf-8',
          'content-disposition':
            "attachment; filename*=UTF-8''%E5%AE%9E%E9%AA%8C.md",
        },
      }),
    );
    const client = new ApiClient({ target: 'web', fetcher });

    const result = await client.exportDocument('文档/id', {
      format: 'md',
      title: '实验',
      content: '未保存草稿',
    });

    expect(fetcher).toHaveBeenCalledWith(
      '/api/documents/%E6%96%87%E6%A1%A3%2Fid/export',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          format: 'md',
          title: '实验',
          content: '未保存草稿',
        }),
      }),
    );
    expect(await result.blob.text()).toBe('draft bytes');
    expect(result.contentDisposition).toContain('%E5%AE%9E%E9%AA%8C.md');
  });

  it('preserves JSON export errors instead of returning a corrupt blob', async () => {
    const client = new ApiClient({
      target: 'web',
      fetcher: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 'EXPORT_FAILED', message: '导出失败' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    });

    await expect(
      client.exportDocument('doc-1', {
        format: 'pdf',
        title: '失败',
        content: '',
      }),
    ).rejects.toMatchObject({
      status: 500,
      body: { code: 'EXPORT_FAILED', message: '导出失败' },
    });
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

    await expect(client.request('/documents/doc-1')).rejects.toMatchObject({
      status: 409,
      body: { code: 'REVISION_CONFLICT', current: { revision: 'new' } },
    } satisfies Partial<ApiError>);
  });

  it('returns undefined for empty 204 responses', async () => {
    const client = new ApiClient({
      target: 'web',
      fetcher: vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    });

    await expect(client.request<void>('/trash/doc-1')).resolves.toBeUndefined();
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
