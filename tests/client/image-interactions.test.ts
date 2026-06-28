// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  calculateCornerResizeRatio,
  calculateImageDisplaySize,
  calculateMarqueeHighlightRects,
  createImageClipboardFallback,
  ensureImageResizeHandles,
  isMeaningfulResizeGesture,
  resolveResizeGestureStep,
  shouldStartMarqueeSelection,
} from '../../src/client/editor/image-interactions.js';

describe('image editor interactions', () => {
  it('adds four corner resize handles only once', () => {
    const block = document.createElement('div');
    block.className = 'milkdown-image-block selected';
    const wrapper = document.createElement('div');
    wrapper.className = 'image-wrapper';
    block.append(wrapper);

    ensureImageResizeHandles(block);
    ensureImageResizeHandles(block);

    const handles = [
      ...wrapper.querySelectorAll<HTMLElement>('[data-image-resize-corner]'),
    ];
    expect(handles).toHaveLength(4);
    expect(handles.map((handle) => handle.dataset.imageResizeCorner)).toEqual([
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
    ]);
    expect(handles.map((handle) => handle.getAttribute('aria-label'))).toEqual([
      '左上缩放图片',
      '右上缩放图片',
      '左下缩放图片',
      '右下缩放图片',
    ]);
  });

  it('clamps oversized image ratios to the available display width', () => {
    expect(
      calculateImageDisplaySize({
        naturalWidth: 1200,
        naturalHeight: 400,
        availableWidth: 860,
        ratio: 1.52,
      }),
    ).toMatchObject({
      width: 860,
      height: 287,
      ratio: 1,
    });
  });

  it('allows small images to expand to the note content width', () => {
    expect(
      calculateImageDisplaySize({
        naturalWidth: 400,
        naturalHeight: 100,
        availableWidth: 860,
        ratio: 1,
      }),
    ).toMatchObject({
      width: 860,
      height: 215,
      ratio: 1,
      maxWidth: 860,
    });
  });

  it('calculates smooth corner resize ratios without exceeding the maximum', () => {
    expect(
      calculateCornerResizeRatio({
        corner: 'bottom-right',
        startRatio: 0.8,
        startWidth: 688,
        startHeight: 229,
        deltaX: 260,
        deltaY: 0,
        minRatio: 0.2,
        maxRatio: 1,
      }),
    ).toBe(1);

    expect(
      calculateCornerResizeRatio({
        corner: 'top-left',
        startRatio: 0.5,
        startWidth: 430,
        startHeight: 143,
        deltaX: -86,
        deltaY: -14,
        minRatio: 0.2,
        maxRatio: 1,
      }),
    ).toBeCloseTo(0.6, 1);
  });

  it('treats the first resize movement as intentional without a threshold', () => {
    expect(
      isMeaningfulResizeGesture({
        deltaX: -1,
        deltaY: 1,
        startRatio: 1,
        nextRatio: 0.998,
      }),
    ).toBe(true);

    expect(
      isMeaningfulResizeGesture({
        deltaX: 0,
        deltaY: 0,
        startRatio: 1,
        nextRatio: 1,
      }),
    ).toBe(false);
  });

  it('resizes immediately on the first pointer movement', () => {
    expect(
      resolveResizeGestureStep({
        active: false,
        deltaX: -1,
        deltaY: 1,
        startRatio: 1,
        nextRatio: 0.998,
      }),
    ).toEqual({
      active: true,
      resetAnchor: false,
      shouldResize: true,
    });

    expect(
      resolveResizeGestureStep({
        active: true,
        deltaX: -9,
        deltaY: 0,
        startRatio: 1,
        nextRatio: 0.99,
      }),
    ).toEqual({
      active: true,
      resetAnchor: false,
      shouldResize: true,
    });
  });

  it('builds safe clipboard fallback data for a selected image', () => {
    const image = document.createElement('img');
    image.src = 'http://localhost:3210/api/assets/doc/image.png';
    image.alt = '图 "A" <测试>';

    const fallback = createImageClipboardFallback(image);

    expect(fallback.text).toBe('http://localhost:3210/api/assets/doc/image.png');
    expect(fallback.html).toBe(
      '<img src="http://localhost:3210/api/assets/doc/image.png" alt="图 &quot;A&quot; &lt;测试&gt;">',
    );
  });

  it('starts marquee selection from blank editor space around text blocks', () => {
    const editor = document.createElement('div');
    editor.className = 'ProseMirror';
    const paragraph = document.createElement('p');
    const image = document.createElement('img');
    const button = document.createElement('button');
    paragraph.append('正文');
    editor.append(paragraph, image, button);

    paragraph.getBoundingClientRect = () =>
      new DOMRect(0, 0, 260, 32);

    expect(shouldStartMarqueeSelection(editor, editor)).toBe(true);
    expect(
      shouldStartMarqueeSelection(paragraph, editor, {
        clientX: 120,
        clientY: 16,
      }),
    ).toBe(false);
    expect(
      shouldStartMarqueeSelection(paragraph, editor, {
        clientX: 420,
        clientY: 16,
      }),
    ).toBe(true);
    expect(shouldStartMarqueeSelection(image, editor)).toBe(false);
    expect(shouldStartMarqueeSelection(button, editor)).toBe(false);
  });

  it('builds Feishu-like line highlights for text rows inside the marquee', () => {
    const highlights = calculateMarqueeHighlightRects({
      editorRect: new DOMRect(10, 20, 800, 600),
      selectionRect: new DOMRect(100, 80, 420, 150),
      lineRects: [
        new DOMRect(40, 48, 360, 28),
        new DOMRect(40, 92, 500, 28),
        new DOMRect(40, 136, 500, 28),
        new DOMRect(40, 180, 500, 28),
        new DOMRect(40, 260, 500, 28),
      ],
    });

    expect(highlights).toEqual([
      { left: 30, top: 72, width: 500, height: 28 },
      { left: 30, top: 116, width: 500, height: 28 },
      { left: 30, top: 160, width: 500, height: 28 },
    ]);
  });
});
