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
      use: vi.fn((plugin: unknown) => {
        void plugin;
        return this.editor;
      }),
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
  $markAttr: vi.fn((id: string) => ({ key: `${id}Attr` })),
  $markSchema: vi.fn((id: string) => ({
    id,
    key: `${id}Schema`,
    mark: vi.fn(),
    type: vi.fn(),
  })),
  $remark: vi.fn((id: string) => ({
    id,
    options: {},
    plugin: vi.fn(),
  })),
  replaceAll: vi.fn((markdown: string) => ({ type: 'replaceAll', markdown })),
}));

import { MarkdownEditor } from '../../src/client/editor/MarkdownEditor.js';
import {
  textStyleAttr,
  textStyleRemarkPlugin,
  textStyleSchema,
  textStyleStringifyConfig,
} from '../../src/client/editor/text-style.js';
import { plainTextClipboardConfig } from '../../src/client/editor/plain-text-clipboard.js';

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

  it('registers text style attr before schema so color marks render in the editor', () => {
    render(<MarkdownEditor document={baseDocument} onChange={vi.fn()} />);

    const editorUse = createdEditors[0]?.editor.use;
    expect(editorUse).toBeDefined();
    const registeredPlugins = editorUse!.mock.calls.map(([plugin]) => plugin);

    expect(registeredPlugins).toContain(textStyleAttr);
    expect(registeredPlugins).toContain(textStyleSchema);
    expect(registeredPlugins).toContain(textStyleRemarkPlugin);
    expect(registeredPlugins).toContain(textStyleStringifyConfig);
    expect(registeredPlugins).toContain(plainTextClipboardConfig);
    expect(registeredPlugins.indexOf(textStyleAttr)).toBeLessThan(
      registeredPlugins.indexOf(textStyleSchema),
    );
  });
});
