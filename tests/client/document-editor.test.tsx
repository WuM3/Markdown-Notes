// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../../src/client/runtime/api-client.js';
import {
  configureNotesApi,
  resetNotesApi,
} from '../../src/client/api.js';
import type { DocumentRecord } from '../../src/shared/types.js';

vi.mock('../../src/client/editor/MarkdownEditor.js', async () => {
  const React = await import('react');
  return {
    MarkdownEditor: React.forwardRef(
      (
        {
          document,
          onChange,
        }: {
          document: DocumentRecord;
          onChange: (markdown: string) => void;
        },
        ref,
      ) => {
        React.useImperativeHandle(ref, () => ({
          appendMarkdown: vi.fn(),
          getMarkdown: () => document.content,
        }));
        return (
          <textarea
            aria-label="正文"
            defaultValue={document.content}
            onChange={(event) => onChange(event.target.value)}
          />
        );
      },
    ),
  };
});

import { DocumentEditor } from '../../src/client/editor/DocumentEditor.js';

const baseDocument: DocumentRecord = {
  id: 'doc-1',
  title: '实验记录',
  path: '实验记录.md',
  parentPath: '',
  createdAt: '2026-06-25T08:00:00.000Z',
  updatedAt: '2026-06-25T09:00:00.000Z',
  revision: 'revision-1',
  content: '初始正文',
};

describe('DocumentEditor', () => {
  afterEach(() => {
    cleanup();
    resetNotesApi();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('flushes a pending draft when the editor unmounts', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ...baseDocument, title: '未发送草稿' }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    configureNotesApi(new ApiClient({ target: 'web', fetcher }));
    const user = userEvent.setup();
    const { unmount } = renderEditor(baseDocument);

    await user.clear(screen.getByLabelText('文档标题'));
    await user.type(screen.getByLabelText('文档标题'), '未发送草稿');
    unmount();

    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        '/api/documents/doc-1',
        expect.objectContaining({ method: 'PUT' }),
      ),
    );
  });

  it('syncs title state when the same document receives a new revision', () => {
    const { rerender } = renderEditor(baseDocument);

    rerender(
      <DocumentEditor
        document={{
          ...baseDocument,
          title: '实验记录 (2)',
          path: '实验记录 (2).md',
          revision: 'revision-2',
        }}
        onSaved={vi.fn()}
        onConflict={vi.fn()}
        onOpenSidebar={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('文档标题')).toHaveValue('实验记录 (2)');
  });
});

function renderEditor(document: DocumentRecord) {
  return render(
    <DocumentEditor
      document={document}
      onSaved={vi.fn()}
      onConflict={vi.fn()}
      onOpenSidebar={vi.fn()}
    />,
  );
}
