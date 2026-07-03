// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ActionDialog,
  ConfirmDialog,
} from '../../src/client/components/ActionDialog.js';

describe('ActionDialog', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps the dialog open and shows a submit error', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ActionDialog
        open
        title="新建文档"
        description="文档会保存为 Markdown 文件。"
        label="文档标题"
        defaultValue="失败文档"
        onOpenChange={onOpenChange}
        onSubmit={vi.fn().mockRejectedValue(new Error('目录不存在'))}
      />,
    );

    await user.click(screen.getByRole('button', { name: '确认' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('目录不存在');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('keeps the confirm dialog open and shows a confirm error', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open
        title="移到回收站"
        description="可以稍后恢复。"
        onOpenChange={onOpenChange}
        onConfirm={vi.fn().mockRejectedValue(new Error('文档不存在'))}
      />,
    );

    await user.click(screen.getByRole('button', { name: '确认' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('文档不存在');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
