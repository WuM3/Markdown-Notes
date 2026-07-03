// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureNotesApi, resetNotesApi } from '../../src/client/api.js';
import { ApiClient } from '../../src/client/runtime/api-client.js';
import { SearchView } from '../../src/client/views/SearchView.js';
import type { SearchResult } from '../../src/shared/types.js';

describe('SearchView', () => {
  afterEach(() => {
    cleanup();
    resetNotesApi();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('ignores stale search responses that return after the latest query', async () => {
    const oldSearch = deferred<Response>();
    const latestSearch = deferred<Response>();
    const fetcher = vi.fn<typeof fetch>((input) => {
      const url = String(input);
      if (url.includes(encodeURIComponent('旧'))) return oldSearch.promise;
      if (url.includes(encodeURIComponent('新'))) return latestSearch.promise;
      throw new Error(`Unexpected request: ${url}`);
    });
    configureNotesApi(new ApiClient({ target: 'web', fetcher }));
    const user = userEvent.setup();

    render(<SearchView onOpen={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('搜索标题和正文'), '旧');
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await user.clear(screen.getByPlaceholderText('搜索标题和正文'));
    await user.type(screen.getByPlaceholderText('搜索标题和正文'), '新');
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));

    latestSearch.resolve(jsonResponse([result('new', '新结果')]));
    await waitFor(() => expect(screen.getAllByText('新结果').length).toBeGreaterThan(0));
    oldSearch.resolve(jsonResponse([result('old', '旧结果')]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getAllByText('新结果').length).toBeGreaterThan(0);
    expect(screen.queryByText('旧结果')).not.toBeInTheDocument();
  });
});

function result(id: string, title: string): SearchResult {
  return {
    id,
    title,
    path: `${title}.md`,
    excerpt: title,
    updatedAt: '2026-06-25T08:00:00.000Z',
    score: 1,
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
