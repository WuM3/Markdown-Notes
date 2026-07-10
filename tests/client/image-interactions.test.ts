// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  calculateCornerResizeRatio,
  calculateImageDisplaySize,
  calculateMarqueeHighlightRects,
  collectMarqueeHits,
  createImageClipboardFallback,
  ensureImageResizeHandles,
  isSuspiciousMarqueeStartPosition,
  isMarqueeBlockHit,
  isMeaningfulResizeGesture,
  resolveMarqueeSelectionRange,
  resolveMarqueeDomBlockRange,
  resolveMarqueeClearPosition,
  resolveResizeGestureStep,
  shouldHandleOuterMarqueePointerDown,
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

  it('keeps native text selection from blank space inside text blocks', () => {
    const editor = document.createElement('div');
    editor.className = 'ProseMirror';
    const paragraph = document.createElement('p');
    const image = document.createElement('img');
    const button = document.createElement('button');
    const codeBlock = document.createElement('div');
    codeBlock.className = 'milkdown-code-block';
    const codeEditor = document.createElement('div');
    codeEditor.className = 'cm-editor';
    const codeLine = document.createElement('div');
    codeLine.className = 'cm-line';
    codeLine.textContent = 'const value = 1;';
    codeEditor.append(codeLine);
    codeBlock.append(codeEditor);
    paragraph.append('正文');
    editor.append(paragraph, codeBlock, image, button);

    paragraph.getBoundingClientRect = () =>
      new DOMRect(0, 0, 260, 32);

    expect(shouldStartMarqueeSelection(editor, editor)).toBe(false);
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
    ).toBe(false);
    expect(shouldStartMarqueeSelection(image, editor)).toBe(false);
    expect(shouldStartMarqueeSelection(button, editor)).toBe(false);
    expect(shouldStartMarqueeSelection(codeBlock, editor)).toBe(false);
    expect(shouldStartMarqueeSelection(codeLine, editor)).toBe(false);
  });

  it('starts marquee selection from the editor shell blank space', () => {
    const canvas = document.createElement('div');
    canvas.className = 'document-canvas';
    const root = document.createElement('div');
    root.className = 'markdown-editor';
    const shell = document.createElement('div');
    shell.className = 'milkdown';
    const editor = document.createElement('div');
    editor.className = 'ProseMirror';
    const paragraph = document.createElement('p');
    const button = document.createElement('button');
    paragraph.append('正文');
    canvas.append(root);
    root.append(shell);
    shell.append(editor, button);
    editor.append(paragraph);

    expect(shouldHandleOuterMarqueePointerDown(canvas, editor, canvas)).toBe(true);
    expect(shouldHandleOuterMarqueePointerDown(shell, editor, root)).toBe(true);
    expect(shouldHandleOuterMarqueePointerDown(root, editor, root)).toBe(true);
    expect(shouldHandleOuterMarqueePointerDown(root, editor, canvas)).toBe(true);
    expect(shouldHandleOuterMarqueePointerDown(paragraph, editor, root)).toBe(false);
    expect(shouldHandleOuterMarqueePointerDown(button, editor, root)).toBe(false);
    expect(shouldHandleOuterMarqueePointerDown(document.body, editor, root)).toBe(false);
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

  it('does not highlight rows when the marquee is only before the row content', () => {
    const highlights = calculateMarqueeHighlightRects({
      editorRect: new DOMRect(0, 0, 1000, 600),
      selectionRect: new DOMRect(40, 150, 80, 30),
      lineRects: [
        new DOMRect(300, 148, 520, 28),
        new DOMRect(300, 210, 520, 28),
      ],
      hitAreaRect: new DOMRect(0, 0, 1000, 600),
    });

    expect(highlights).toEqual([]);
  });

  it('hits text blocks by rendered rows instead of the whole block box', () => {
    const hitAreaRect = new DOMRect(0, 0, 1000, 600);
    const fallbackRect = new DOMRect(40, 80, 500, 160);
    const lineRects = [
      new DOMRect(40, 100, 420, 28),
      new DOMRect(40, 148, 520, 28),
    ];

    expect(
      isMarqueeBlockHit({
        selectionRect: new DOMRect(820, 150, 120, 20),
        fallbackRect,
        lineRects,
        hitAreaRect,
      }),
    ).toBe(true);

    expect(
      isMarqueeBlockHit({
        selectionRect: new DOMRect(0, 150, 20, 20),
        fallbackRect,
        lineRects,
        hitAreaRect,
      }),
    ).toBe(false);

    expect(
      isMarqueeBlockHit({
        selectionRect: new DOMRect(820, 210, 120, 20),
        fallbackRect,
        lineRects,
        hitAreaRect,
      }),
    ).toBe(false);
  });

  it('hits image blocks by their block rectangle when no text rows exist', () => {
    expect(
      isMarqueeBlockHit({
        selectionRect: new DOMRect(700, 120, 160, 140),
        fallbackRect: new DOMRect(80, 100, 780, 180),
        lineRects: [],
        hitAreaRect: new DOMRect(0, 0, 1000, 600),
      }),
    ).toBe(true);
  });

  it('collects one shared marquee hit list for highlights and selection', () => {
    const editor = document.createElement('div');
    const first = document.createElement('p');
    const second = document.createElement('p');
    const third = document.createElement('p');
    editor.append(first, second, third);

    first.getBoundingClientRect = () => new DOMRect(40, 40, 320, 28);
    second.getBoundingClientRect = () => new DOMRect(40, 84, 520, 28);
    third.getBoundingClientRect = () => new DOMRect(40, 128, 520, 28);

    const hits = collectMarqueeHits({
      editorRoot: editor,
      editorRect: new DOMRect(0, 0, 900, 400),
      selectionRect: new DOMRect(460, 30, 300, 120),
      hitAreaRect: new DOMRect(0, 0, 900, 400),
    });

    expect(hits.map((hit) => hit.block)).toEqual([first, second, third]);
    expect(hits.flatMap((hit) => hit.highlightRects)).toEqual([
      { left: 40, top: 40, width: 320, height: 28 },
      { left: 40, top: 84, width: 520, height: 28 },
      { left: 40, top: 128, width: 520, height: 28 },
    ]);
  });

  it('maps marquee DOM block order to top-level document node ranges', () => {
    const editor = document.createElement('div');
    const first = document.createElement('p');
    const overlay = document.createElement('div');
    const second = document.createElement('p');
    const third = document.createElement('p');
    overlay.className = 'editor-marquee-selection';
    editor.append(first, overlay, second, third);

    expect(
      resolveMarqueeDomBlockRange({
        editorRoot: editor,
        block: first,
        nodeSizes: [8, 12, 10],
        docSize: 30,
      }),
    ).toEqual({ from: 0, to: 8 });
    expect(
      resolveMarqueeDomBlockRange({
        editorRoot: editor,
        block: second,
        nodeSizes: [8, 12, 10],
        docSize: 30,
      }),
    ).toEqual({ from: 8, to: 20 });
    expect(
      resolveMarqueeDomBlockRange({
        editorRoot: editor,
        block: third,
        nodeSizes: [8, 12, 10],
        docSize: 30,
      }),
    ).toEqual({ from: 20, to: 30 });
  });

  it('resolves marquee selection to hit text rows instead of the whole paragraph', () => {
    const editor = document.createElement('div');
    const paragraph = document.createElement('p');
    editor.append(paragraph);
    const lines = [
      new DOMRect(80, 40, 420, 24),
      new DOMRect(80, 80, 500, 24),
      new DOMRect(80, 120, 460, 24),
    ];
    const view = createMarqueeView({
      editor,
      blocks: [
        {
          element: paragraph,
          from: 0,
          to: 80,
          typeName: 'paragraph',
        },
      ],
      positions: [
        { y: 80, side: 'start', pos: 21 },
        { y: 80, side: 'end', pos: 40 },
        { y: 120, side: 'start', pos: 41 },
        { y: 120, side: 'end', pos: 60 },
      ],
    });

    expect(
      resolveMarqueeSelectionRange(view, [
        {
          block: paragraph,
          blockIndex: 0,
          lineRects: [lines[1], lines[2]],
          highlightRects: [],
        },
      ]),
    ).toEqual({
      from: 21,
      to: 60,
      selectNode: false,
    });
  });

  it('keeps the first and last text blocks line-trimmed when marquee hits mixed blocks', () => {
    const editor = document.createElement('div');
    const paragraph = document.createElement('p');
    const image = document.createElement('div');
    image.className = 'milkdown-image-block';
    const code = document.createElement('div');
    code.className = 'milkdown-code-block';
    const heading = document.createElement('h2');
    editor.append(paragraph, image, code, heading);

    const view = createMarqueeView({
      editor,
      blocks: [
        { element: paragraph, from: 0, to: 50, typeName: 'paragraph' },
        { element: image, from: 50, to: 55, typeName: 'image-block' },
        { element: code, from: 55, to: 90, typeName: 'code_block' },
        { element: heading, from: 90, to: 120, typeName: 'heading' },
      ],
      positions: [
        { y: 72, side: 'start', pos: 16 },
        { y: 72, side: 'end', pos: 32 },
        { y: 220, side: 'start', pos: 96 },
        { y: 220, side: 'end', pos: 112 },
      ],
    });

    expect(
      resolveMarqueeSelectionRange(view, [
        {
          block: paragraph,
          blockIndex: 0,
          lineRects: [new DOMRect(80, 72, 420, 24)],
          highlightRects: [],
        },
        {
          block: image,
          blockIndex: 1,
          lineRects: [new DOMRect(80, 112, 520, 96)],
          highlightRects: [],
        },
        {
          block: code,
          blockIndex: 2,
          lineRects: [new DOMRect(80, 216, 520, 80)],
          highlightRects: [],
        },
        {
          block: heading,
          blockIndex: 3,
          lineRects: [new DOMRect(80, 220, 360, 28)],
          highlightRects: [],
        },
      ]),
    ).toEqual({
      from: 16,
      to: 112,
      selectNode: false,
    });
  });

  it('selects a single image block as a node when marquee only hits that image', () => {
    const editor = document.createElement('div');
    const image = document.createElement('div');
    image.className = 'milkdown-image-block';
    editor.append(image);
    const view = createMarqueeView({
      editor,
      blocks: [{ element: image, from: 12, to: 17, typeName: 'image-block' }],
      positions: [],
    });

    expect(
      resolveMarqueeSelectionRange(view, [
        {
          block: image,
          blockIndex: 0,
          lineRects: [new DOMRect(80, 120, 520, 140)],
          highlightRects: [],
        },
      ]),
    ).toEqual({
      from: 12,
      to: 17,
      selectNode: true,
    });
  });

  it('uses whole code block boundaries when marquee starts or ends on a code block', () => {
    const editor = document.createElement('div');
    const code = document.createElement('div');
    code.className = 'milkdown-code-block';
    const paragraph = document.createElement('p');
    editor.append(code, paragraph);
    const view = createMarqueeView({
      editor,
      blocks: [
        { element: code, from: 0, to: 40, typeName: 'code_block' },
        { element: paragraph, from: 40, to: 80, typeName: 'paragraph' },
      ],
      positions: [
        { y: 180, side: 'start', pos: 48 },
        { y: 180, side: 'end', pos: 66 },
      ],
    });

    expect(
      resolveMarqueeSelectionRange(view, [
        {
          block: code,
          blockIndex: 0,
          lineRects: [new DOMRect(80, 80, 520, 80)],
          highlightRects: [],
        },
        {
          block: paragraph,
          blockIndex: 1,
          lineRects: [new DOMRect(80, 180, 360, 24)],
          highlightRects: [],
        },
      ]),
    ).toEqual({
      from: 0,
      to: 66,
      selectNode: false,
    });
  });

  it('rejects document-start positions for non-first marquee blocks', () => {
    const editor = document.createElement('div');
    const first = document.createElement('p');
    const second = document.createElement('p');
    const third = document.createElement('p');
    const overlay = document.createElement('div');
    overlay.className = 'editor-marquee-selection';
    editor.append(first, overlay, second, third);

    expect(
      isSuspiciousMarqueeStartPosition({
        editorRoot: editor,
        block: first,
        start: 0,
      }),
    ).toBe(false);
    expect(
      isSuspiciousMarqueeStartPosition({
        editorRoot: editor,
        block: second,
        start: 0,
      }),
    ).toBe(true);
    expect(
      isSuspiciousMarqueeStartPosition({
        editorRoot: editor,
        block: second,
        start: 18,
      }),
    ).toBe(false);
  });

  it('collapses an existing selection when a blank marquee click does not drag', () => {
    expect(
      resolveMarqueeClearPosition({
        docSize: 100,
        currentFrom: 12,
        currentTo: 42,
        clickPosition: 140,
      }),
    ).toBe(100);

    expect(
      resolveMarqueeClearPosition({
        docSize: 100,
        currentFrom: 12,
        currentTo: 42,
      }),
    ).toBe(42);

    expect(
      resolveMarqueeClearPosition({
        docSize: 100,
        currentFrom: 42,
        currentTo: 42,
        clickPosition: 12,
      }),
    ).toBeUndefined();
  });
});

interface MarqueeViewBlock {
  element: HTMLElement;
  from: number;
  to: number;
  typeName: string;
}

interface MarqueeCoordinatePosition {
  y: number;
  side: 'start' | 'end';
  pos: number;
}

function createMarqueeView(input: {
  editor: HTMLElement;
  blocks: MarqueeViewBlock[];
  positions: MarqueeCoordinatePosition[];
}) {
  return {
    dom: input.editor,
    nodeDOM: (offset: number) =>
      input.blocks.find((block) => block.from === offset)?.element,
    posAtCoords: ({ left, top }: { left: number; top: number }) => {
      const side = left < 200 ? 'start' : 'end';
      const match = input.positions.find(
        (position) =>
          Math.abs(position.y - top) <= 20 &&
          position.side === side,
      );
      return match ? { pos: match.pos } : undefined;
    },
    state: {
      doc: {
        content: { size: Math.max(...input.blocks.map((block) => block.to)) },
        childCount: input.blocks.length,
        forEach: (
          callback: (
            node: { nodeSize: number; type: { name: string }; isBlock: boolean },
            offset: number,
          ) => void,
        ) => {
          input.blocks.forEach((block) => {
            callback(
              {
                nodeSize: block.to - block.from,
                type: { name: block.typeName },
                isBlock: true,
              },
              block.from,
            );
          });
        },
        nodeAt: (pos: number) => {
          const block = input.blocks.find(
            (candidate) => candidate.from === pos,
          );
          if (!block) return undefined;
          return {
            nodeSize: block.to - block.from,
            type: { name: block.typeName },
            isBlock: true,
          };
        },
      },
    },
  } as never;
}
