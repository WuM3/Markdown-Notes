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
    root.innerHTML = `<div class="milkdown-toolbar">${'<button class="toolbar-item"></button>'.repeat(8)}</div>`;

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
    root.innerHTML = `<div class="milkdown-toolbar">${'<button class="toolbar-item"></button>'.repeat(8)}</div>`;
    document.body.append(root);

    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.toolbar-item')];
    const trigger = buttons[7];
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

    const stop = observeCrepeToolbar(root, {
      applyTextStyle: vi.fn(),
      formatBlock: vi.fn(),
    });

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

  it('keeps code block out of the text format menu', () => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="milkdown-toolbar">${'<button class="toolbar-item"></button>'.repeat(8)}</div>`;
    document.body.append(root);

    const trigger = root.querySelectorAll<HTMLButtonElement>('.toolbar-item')[7];
    const stop = observeCrepeToolbar(root, {
      applyTextStyle: vi.fn(),
      formatBlock: vi.fn(),
    });

    try {
      fireEvent.pointerOver(trigger);
      const items = [
        ...document.body.querySelectorAll<HTMLButtonElement>('.toolbar-menu-item'),
      ].map((button) => button.textContent);
      expect(items).toContain('正文✓');
      expect(items).not.toContain('代码块✓');
    } finally {
      stop();
      root.remove();
    }
  });

  it('opens a Feishu-style color menu from the text color button', () => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="milkdown-toolbar">${'<button class="toolbar-item"></button>'.repeat(8)}</div>`;
    document.body.append(root);

    const trigger = root.querySelectorAll<HTMLButtonElement>('.toolbar-item')[6];
    const applyTextStyle = vi.fn();
    const stop = observeCrepeToolbar(root, {
      applyTextStyle,
      formatBlock: vi.fn(),
    });

    try {
      fireEvent.pointerOver(trigger);
      expect(document.body.querySelector('.toolbar-color-menu')).toBeTruthy();
      expect(document.body).toHaveTextContent('字体颜色');
      expect(document.body).toHaveTextContent('背景颜色');

      const red = document.body.querySelector<HTMLButtonElement>(
        '.toolbar-color-swatch[data-style-kind="color"][data-style-value="#ef4444"]',
      );
      fireEvent.pointerDown(red!);

      expect(applyTextStyle).toHaveBeenCalledWith({
        color: '#ef4444',
      });
    } finally {
      stop();
      root.remove();
    }
  });

  it('captures the editor selection before applying a color swatch', () => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="milkdown-toolbar">${'<button class="toolbar-item"></button>'.repeat(8)}</div>`;
    document.body.append(root);

    const trigger = root.querySelectorAll<HTMLButtonElement>('.toolbar-item')[6];
    const applyTextStyle = vi.fn();
    const captureSelection = vi.fn();
    const stop = observeCrepeToolbar(root, {
      applyTextStyle,
      formatBlock: vi.fn(),
      captureSelection,
    } as unknown as Parameters<typeof observeCrepeToolbar>[1]);

    try {
      fireEvent.pointerOver(trigger);

      expect(captureSelection).toHaveBeenCalledTimes(1);

      const red = document.body.querySelector<HTMLButtonElement>(
        '.toolbar-color-swatch[data-style-kind="color"][data-style-value="#ef4444"]',
      );
      fireEvent.pointerDown(red!);

      expect(applyTextStyle).toHaveBeenCalledWith({
        color: '#ef4444',
      });
    } finally {
      stop();
      root.remove();
    }
  });

  it('applies a color swatch only once for a pointer click sequence', () => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="milkdown-toolbar">${'<button class="toolbar-item"></button>'.repeat(8)}</div>`;
    document.body.append(root);

    const trigger = root.querySelectorAll<HTMLButtonElement>('.toolbar-item')[6];
    const applyTextStyle = vi.fn();
    const stop = observeCrepeToolbar(root, {
      applyTextStyle,
      formatBlock: vi.fn(),
    });

    try {
      fireEvent.pointerOver(trigger);
      const red = document.body.querySelector<HTMLButtonElement>(
        '.toolbar-color-swatch[data-style-kind="color"][data-style-value="#ef4444"]',
      );

      fireEvent.pointerDown(red!);
      fireEvent.click(red!, { detail: 1 });

      expect(applyTextStyle).toHaveBeenCalledTimes(1);
      expect(applyTextStyle).toHaveBeenCalledWith({
        color: '#ef4444',
      });
    } finally {
      stop();
      root.remove();
    }
  });

  it('still applies a color swatch from keyboard-style click activation', () => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="milkdown-toolbar">${'<button class="toolbar-item"></button>'.repeat(8)}</div>`;
    document.body.append(root);

    const trigger = root.querySelectorAll<HTMLButtonElement>('.toolbar-item')[6];
    const applyTextStyle = vi.fn();
    const stop = observeCrepeToolbar(root, {
      applyTextStyle,
      formatBlock: vi.fn(),
    });

    try {
      fireEvent.pointerOver(trigger);
      const red = document.body.querySelector<HTMLButtonElement>(
        '.toolbar-color-swatch[data-style-kind="color"][data-style-value="#ef4444"]',
      );

      fireEvent.click(red!, { detail: 0 });

      expect(applyTextStyle).toHaveBeenCalledTimes(1);
      expect(applyTextStyle).toHaveBeenCalledWith({
        color: '#ef4444',
      });
    } finally {
      stop();
      root.remove();
    }
  });

  it('still opens the color menu if reading the current editor style throws', () => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="milkdown-toolbar">${'<button class="toolbar-item"></button>'.repeat(8)}</div>`;
    document.body.append(root);

    const trigger = root.querySelectorAll<HTMLButtonElement>('.toolbar-item')[6];
    const stop = observeCrepeToolbar(root, {
      applyTextStyle: vi.fn(),
      formatBlock: vi.fn(),
      captureSelection: () => {
        throw new Error('transient selection failure');
      },
      getTextStyle: () => {
        throw new Error('style read failure');
      },
    });

    try {
      fireEvent.pointerOver(trigger);

      expect(document.body.querySelector('.toolbar-color-menu')).toBeTruthy();
      expect(document.body).toHaveTextContent('字体颜色');
      expect(document.body).toHaveTextContent('背景颜色');
    } finally {
      stop();
      root.remove();
    }
  });

  it('marks the currently selected text colors in the color menu', () => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="milkdown-toolbar">${'<button class="toolbar-item"></button>'.repeat(8)}</div>`;
    document.body.append(root);

    const trigger = root.querySelectorAll<HTMLButtonElement>('.toolbar-item')[6];
    const stop = observeCrepeToolbar(root, {
      applyTextStyle: vi.fn(),
      formatBlock: vi.fn(),
      getTextStyle: () => ({
        color: '#ef4444',
        backgroundColor: '#fef08a',
      }),
    } as unknown as Parameters<typeof observeCrepeToolbar>[1]);

    try {
      fireEvent.pointerOver(trigger);

      const textColor = document.body.querySelector<HTMLButtonElement>(
        '.toolbar-color-swatch[data-style-kind="color"][data-style-value="#ef4444"]',
      );
      const backgroundColor = document.body.querySelector<HTMLButtonElement>(
        '.toolbar-color-swatch[data-style-kind="background"][data-style-value="#fef08a"]',
      );
      const otherColor = document.body.querySelector<HTMLButtonElement>(
        '.toolbar-color-swatch[data-style-kind="color"][data-style-value="#2563eb"]',
      );

      expect(textColor?.dataset.active).toBe('true');
      expect(textColor?.getAttribute('aria-pressed')).toBe('true');
      expect(backgroundColor?.dataset.active).toBe('true');
      expect(otherColor?.dataset.active).toBeUndefined();
    } finally {
      stop();
      root.remove();
    }
  });

  it('keeps hover menus open while moving through the gap into the panel', async () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    root.innerHTML = `<div class="milkdown-toolbar">${'<button class="toolbar-item"></button>'.repeat(8)}</div>`;
    document.body.append(root);

    const trigger = root.querySelectorAll<HTMLButtonElement>('.toolbar-item')[6];
    const stop = observeCrepeToolbar(root, {
      applyTextStyle: vi.fn(),
      formatBlock: vi.fn(),
    });

    try {
      fireEvent.pointerOver(trigger);
      const menu = document.body.querySelector<HTMLElement>('.toolbar-popover-menu');
      expect(menu).toBeTruthy();

      fireEvent.pointerOut(trigger, { relatedTarget: document.body });

      expect(document.body.querySelector('.toolbar-popover-menu')).toBeTruthy();

      fireEvent.pointerOver(menu!);
      await act(() => vi.advanceTimersByTimeAsync(180));

      expect(document.body.querySelector('.toolbar-popover-menu')).toBeTruthy();
      expect(trigger.getAttribute('aria-expanded')).toBe('true');

      fireEvent.pointerOut(menu!, { relatedTarget: document.body });
      await act(() => vi.advanceTimersByTimeAsync(180));

      expect(document.body.querySelector('.toolbar-popover-menu')).toBeNull();
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
    } finally {
      stop();
      root.remove();
      vi.useRealTimers();
    }
  });

  it('closes hover menus after the pointer leaves both trigger and panel', async () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    root.innerHTML = `<div class="milkdown-toolbar">${'<button class="toolbar-item"></button>'.repeat(8)}</div>`;
    document.body.append(root);

    const trigger = root.querySelectorAll<HTMLButtonElement>('.toolbar-item')[6];
    const stop = observeCrepeToolbar(root, {
      applyTextStyle: vi.fn(),
      formatBlock: vi.fn(),
    });

    try {
      fireEvent.pointerOver(trigger);
      expect(document.body.querySelector('.toolbar-popover-menu')).toBeTruthy();

      fireEvent.pointerOut(trigger, { relatedTarget: document.body });

      expect(document.body.querySelector('.toolbar-popover-menu')).toBeTruthy();
      await act(() => vi.advanceTimersByTimeAsync(180));

      expect(document.body.querySelector('.toolbar-popover-menu')).toBeNull();
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
    } finally {
      stop();
      root.remove();
      vi.useRealTimers();
    }
  });

  it('does not reopen an underlying toolbar menu when an item closes the panel', () => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="milkdown-toolbar">${'<button class="toolbar-item"></button>'.repeat(8)}</div>`;
    document.body.append(root);

    const buttons = root.querySelectorAll<HTMLButtonElement>('.toolbar-item');
    const stop = observeCrepeToolbar(root, {
      applyTextStyle: vi.fn(),
      formatBlock: vi.fn(),
    });

    try {
      fireEvent.pointerOver(buttons[7]);
      const formatMenu = document.body.querySelector<HTMLElement>(
        '.toolbar-popover-menu[data-menu-kind="format"]',
      );
      expect(formatMenu).toBeTruthy();

      fireEvent.pointerDown(
        formatMenu!.querySelector<HTMLButtonElement>('[data-value="h1"]')!,
      );
      fireEvent.pointerOver(buttons[6]);

      expect(document.body.querySelector('.toolbar-popover-menu')).toBeNull();

      fireEvent.pointerMove(buttons[6]);
      expect(
        document.body.querySelector(
          '.toolbar-popover-menu[data-menu-kind="color"]',
        ),
      ).toBeTruthy();
    } finally {
      stop();
      root.remove();
    }
  });
});



