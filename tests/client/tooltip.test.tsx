// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GlobalTooltip,
} from '../../src/client/components/GlobalTooltip.js';
import { computeTooltipPosition } from '../../src/client/components/tooltip-position.js';
import {
  CREPE_TOOLBAR_LABELS,
  annotateCrepeToolbar,
  observeCrepeToolbar,
} from '../../src/client/editor/toolbar-tooltips.js';

describe('GlobalTooltip', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows after 300ms on hover and hides on pointer leave', async () => {
    vi.useFakeTimers();
    render(
      <>
        <button type="button" aria-label="新建目录" data-tooltip="新建目录">
          +
        </button>
        <GlobalTooltip />
      </>,
    );

    fireEvent.pointerOver(screen.getByRole('button', { name: '新建目录' }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(screen.getByRole('tooltip')).toHaveTextContent('新建目录');

    fireEvent.pointerOut(screen.getByRole('button', { name: '新建目录' }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows on keyboard focus and hides on blur', async () => {
    vi.useFakeTimers();
    render(
      <>
        <button type="button" aria-label="搜索" data-tooltip="搜索">
          S
        </button>
        <GlobalTooltip />
      </>,
    );

    act(() => screen.getByRole('button', { name: '搜索' }).focus());
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(screen.getByRole('tooltip')).toHaveTextContent('搜索');

    act(() => screen.getByRole('button', { name: '搜索' }).blur());
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('places the tooltip below when there is not enough space above', () => {
    expect(
      computeTooltipPosition(
        { left: 100, top: 4, width: 40, height: 32 },
        { width: 80, height: 28 },
        { width: 320, height: 640 },
      ),
    ).toMatchObject({ placement: 'bottom', top: 44 });
  });
});

describe('Milkdown toolbar tooltip annotations', () => {
  it('labels built-in formatting and Feishu-style block tool buttons in order', () => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="milkdown-toolbar">${'<button class="toolbar-item"></button>'.repeat(6)}</div>`;

    annotateCrepeToolbar(root);

    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.toolbar-item')];
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(
      CREPE_TOOLBAR_LABELS,
    );
    expect(buttons.map((button) => button.dataset.tooltip)).toEqual(
      CREPE_TOOLBAR_LABELS,
    );
  });

  it('repositions the format menu when the document scrolls', () => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="milkdown-toolbar">${'<button class="toolbar-item"></button>'.repeat(6)}</div>`;
    document.body.append(root);

    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.toolbar-item')];
    const trigger = buttons[5];
    let triggerTop = 40;
    trigger.getBoundingClientRect = () =>
      ({
        left: 24,
        right: 72,
        top: triggerTop,
        bottom: triggerTop + 28,
        width: 48,
        height: 28,
        x: 24,
        y: triggerTop,
        toJSON: () => ({}),
      }) as DOMRect;

    const stop = observeCrepeToolbar(root, { formatBlock: vi.fn() });

    try {
      fireEvent.pointerOver(trigger);
      const menu = document.body.querySelector<HTMLElement>('.toolbar-popover-menu');
      expect(menu?.style.top).toBe('74px');

      triggerTop = 112;
      document.dispatchEvent(new Event('scroll'));
      expect(menu?.style.top).toBe('146px');
    } finally {
      stop();
      root.remove();
    }
  });
});
