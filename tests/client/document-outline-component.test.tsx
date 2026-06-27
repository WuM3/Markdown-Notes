// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentOutline } from '../../src/client/editor/DocumentOutline.js';
import type { OutlineNode } from '../../src/client/editor/document-outline.js';

const outline: OutlineNode[] = [
  {
    id: 'heading-0',
    index: 0,
    level: 1,
    title: '核心网 UPF',
    children: [
      {
        id: 'heading-1',
        index: 1,
        level: 2,
        title: 'PDU 会话类型',
        children: [],
      },
    ],
  },
  {
    id: 'heading-2',
    index: 2,
    level: 1,
    title: 'PFCP-Server',
    children: [],
  },
];

describe('DocumentOutline', () => {
  afterEach(() => cleanup());

  it('shows an empty state when the document has no headings', () => {
    render(
      <DocumentOutline
        nodes={[]}
        activeId={undefined}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByText('暂无标题')).toBeInTheDocument();
  });

  it('renders nested headings, collapses children, and navigates by index', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <DocumentOutline
        nodes={outline}
        activeId="heading-1"
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByRole('navigation', { name: '文档目录' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PDU 会话类型' })).toHaveAttribute(
      'aria-current',
      'true',
    );

    await user.click(screen.getByRole('button', { name: '收起 核心网 UPF' }));
    expect(screen.queryByRole('button', { name: 'PDU 会话类型' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '展开 核心网 UPF' }));
    await user.click(screen.getByRole('button', { name: 'PDU 会话类型' }));
    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it('calls onClose from compact mode', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <DocumentOutline
        compact
        nodes={outline}
        activeId={undefined}
        onClose={onClose}
        onNavigate={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '关闭文档目录' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('collapses the whole outline and exposes an expand control', async () => {
    const user = userEvent.setup();
    const onCollapsedChange = vi.fn();
    render(
      <DocumentOutline
        collapsed
        nodes={outline}
        activeId={undefined}
        onCollapsedChange={onCollapsedChange}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '核心网 UPF' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '展开文档目录' }));
    expect(onCollapsedChange).toHaveBeenCalledWith(false);
  });
});
