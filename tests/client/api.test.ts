import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiRequest,
  configureNotesApi,
  resetNotesApi,
} from '../../src/client/api.js';
import { ApiClient } from '../../src/client/runtime/api-client.js';

describe('apiRequest', () => {
  afterEach(() => {
    resetNotesApi();
    vi.restoreAllMocks();
  });

  it('returns parsed JSON for successful responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ value: 42 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(apiRequest<{ value: number }>('/api/value')).resolves.toEqual({
      value: 42,
    });
  });

  it('preserves conflict response details in ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'REVISION_CONFLICT',
          current: { revision: 'new-revision' },
        }),
        {
          status: 409,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    await expect(apiRequest('/api/document')).rejects.toMatchObject({
      status: 409,
      body: {
        code: 'REVISION_CONFLICT',
        current: { revision: 'new-revision' },
      },
    });
  });

  it('routes every request through the configured Android server', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', version: '0.1.0' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    configureNotesApi(
      new ApiClient({
        target: 'android',
        baseUrl: 'http://192.168.1.8:3210',
        fetcher,
      }),
    );

    await apiRequest('/api/health');

    expect(fetcher).toHaveBeenCalledWith(
      'http://192.168.1.8:3210/api/health',
      undefined,
    );
  });
});
