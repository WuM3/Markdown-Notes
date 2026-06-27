// @vitest-environment jsdom

import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { MockCrepe, createdEditors } = vi.hoisted(() => {
  const instances: MockCrepe[] = [];

  class MockCrepe {
    readonly create = vi.fn(async () => {});
    readonly destroy = vi.fn(async () => {});
    readonly on = vi.fn();
    readonly getMarkdown = vi.fn(() => 'draft');
    readonly editor = {
      action: vi.fn(),
      config: vi.fn(),
    };

    constructor() {
      instances.push(this);
    }
  }

  return { MockCrepe, createdEditors: instances };
});

vi.mock('@milkdown/crepe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@milkdown/crepe')>()),
  Crepe: MockCrepe,
}));

vi.mock('@milkdown/kit/utils', () => ({
  replaceAll: vi.fn((markdown: string) => ({ type: 'replaceAll', markdown })),
}));

import { MarkdownEditor } from '../../src/client/editor/MarkdownEditor.js';

const baseDocument = {
  id: 'doc-1',
  title: '实验记录',
  path: '实验记录.md',
  parentPath: '',
  createdAt: '2026-06-25T08:00:00.000Z',
  updatedAt: '2026-06-25T09:00:00.000Z',
  revision: 'revision-1',
  content: 'draft',
};

describe('MarkdownEditor', () => {
  afterEach(() => {
    cleanup();
    createdEditors.length = 0;
    vi.restoreAllMocks();
  });

  it('does not recreate Milkdown when a save response only normalizes content', () => {
    const { rerender } = render(
      <MarkdownEditor document={baseDocument} onChange={vi.fn()} />,
    );

    rerender(
      <MarkdownEditor
        document={{
          ...baseDocument,
          revision: 'revision-2',
          content: 'draft\n',
        }}
        onChange={vi.fn()}
      />,
    );

    expect(createdEditors).toHaveLength(1);
    expect(createdEditors[0]?.destroy).not.toHaveBeenCalled();
  });
});
