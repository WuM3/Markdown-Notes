// @vitest-environment jsdom

import React, { createRef } from 'react';
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/client/editor/MarkdownEditor.js', () => ({
  MarkdownEditor: ({
    document,
  }: {
    document: { content: string };
  }) => React.createElement('div', { 'data-testid': 'markdown-editor' }, document.content),
}));

import { App, type AppHandle } from '../../src/client/App.js';

const documentRecord = {
  id: 'doc-1',
  title: '实验记录',
  path: '科研/实验记录.md',
  parentPath: '科研',
  createdAt: '2026-06-25T08:00:00.000Z',
  updatedAt: '2026-06-25T09:00:00.000Z',
  revision: 'revision-1',
  content: '# 第一轮实验',
};

describe('App', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('opens a document from the tree and switches to searchable results', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/tree') {
        return jsonResponse([
          {
            id: 'folder:科研',
            kind: 'folder',
            name: '科研',
            path: '科研',
            updatedAt: documentRecord.updatedAt,
            children: [
              {
                id: documentRecord.id,
                kind: 'document',
                name: documentRecord.title,
                path: documentRecord.path,
                updatedAt: documentRecord.updatedAt,
              },
            ],
          },
        ]);
      }
      if (url === '/api/documents/doc-1') {
        return jsonResponse(documentRecord);
      }
      if (url === '/api/search?q=%E5%8D%B7%E7%A7%AF') {
        return jsonResponse([
          {
            id: documentRecord.id,
            title: documentRecord.title,
            path: documentRecord.path,
            excerpt: '记录卷积网络结果',
            updatedAt: documentRecord.updatedAt,
            score: 1,
          },
        ]);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(<App />);
    expect(screen.getByRole('button', { name: '笔记' })).toHaveAttribute(
      'data-tooltip',
      '笔记',
    );
    expect(screen.getByRole('button', { name: '搜索' })).toHaveAttribute(
      'data-tooltip',
      '搜索',
    );
    expect(screen.getByRole('button', { name: '最近' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '回收站' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '导出全部笔记' })).toHaveAttribute(
      'data-tooltip',
      '导出全部笔记',
    );
    expect(screen.getByRole('button', { name: '收起文件夹目录' })).toHaveAttribute(
      'data-tooltip',
      '收起文件夹目录',
    );

    const treePanel = screen.getByRole('region', { name: '笔记目录' });
    expect(
      await within(treePanel).findByRole('button', { name: '新建文档' }),
    ).toHaveAttribute('data-tooltip', '新建文档');
    expect(screen.getByRole('button', { name: '新建目录' })).toHaveAttribute(
      'data-tooltip',
      '新建目录',
    );
    expect(screen.getByRole('button', { name: '实验记录 操作' })).toHaveAttribute(
      'data-tooltip',
      '更多操作',
    );

    await userEvent.click(screen.getByText('实验记录'));
    expect(await screen.findByLabelText('文档标题')).toHaveValue('实验记录');
    expect(screen.getByTestId('markdown-editor')).toHaveTextContent('第一轮实验');
    expect(screen.getByRole('navigation', { name: '文档目录' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '第一轮实验' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '收起文档目录' }));
    expect(screen.queryByRole('button', { name: '第一轮实验' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '展开文档目录' }));
    expect(screen.getByRole('button', { name: '第一轮实验' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开目录' })).toHaveAttribute(
      'data-tooltip',
      '打开目录',
    );

    await userEvent.click(screen.getByRole('button', { name: '收起文件夹目录' }));
    expect(screen.getByTestId('app-shell')).toHaveClass('tree-collapsed');
    expect(screen.getByRole('button', { name: '展开文件夹目录' })).toHaveAttribute(
      'data-tooltip',
      '展开文件夹目录',
    );
    await userEvent.click(screen.getByRole('button', { name: '展开文件夹目录' }));
    expect(screen.getByTestId('app-shell')).not.toHaveClass('tree-collapsed');

    await userEvent.click(screen.getByRole('button', { name: '搜索' }));
    await userEvent.type(screen.getByPlaceholderText('搜索标题和正文'), '卷积');
    await waitFor(() =>
      expect(screen.getByText('记录卷积网络结果')).toBeInTheDocument(),
    );
  });

  it('lets the native back handler return from search to notes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([]));
    const ref = createRef<AppHandle>();

    render(<App ref={ref} />);
    await screen.findByText('选择一篇笔记开始编辑');
    await userEvent.click(screen.getByRole('button', { name: '搜索' }));

    expect(ref.current?.handleBack()).toBe(true);
    await act(async () => {});

    expect(screen.getByRole('button', { name: '笔记' })).toHaveClass('active');
    expect(ref.current?.handleBack()).toBe(false);
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
