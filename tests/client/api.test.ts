import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '../../src/client/api.js';

describe('apiRequest', () => {
  afterEach(() => {
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
});
