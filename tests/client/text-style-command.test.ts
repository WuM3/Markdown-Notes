// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fakeMarkType, fakeTextSelection } = vi.hoisted(() => {
  const fakeMarkType = {
    isInSet: vi.fn(() => null),
    create: vi.fn((attrs: unknown) => ({ attrs, type: 'textStyle' })),
  };
  const fakeTextSelection = {
    create: vi.fn((doc: unknown, anchor: number, head: number) => ({
      doc,
      anchor,
      head,
      from: Math.min(anchor, head),
      to: Math.max(anchor, head),
      empty: anchor === head,
      $from: { marks: () => [] },
    })),
  };
  return { fakeMarkType, fakeTextSelection };
});

vi.mock('@milkdown/kit/core', () => ({
  editorViewCtx: Symbol('editorViewCtx'),
}));

vi.mock('@milkdown/kit/prose/state', () => ({
  TextSelection: fakeTextSelection,
}));

vi.mock('@milkdown/kit/utils', () => ({
  $markAttr: vi.fn((id: string) => ({ key: `${id}Attr` })),
  $markSchema: vi.fn(() => ({
    type: vi.fn(() => fakeMarkType),
  })),
  $remark: vi.fn(() => ({})),
}));

const { editorViewCtx } = await import('@milkdown/kit/core');
const { applyTextStyle, selectionFromDomSelection } = await import(
  '../../src/client/editor/text-style.js'
);

interface FakeSelection {
  from: number;
  to: number;
  empty: boolean;
  $from: { marks: () => unknown[] };
}

function createSelection(from: number, to: number): FakeSelection {
  return {
    from,
    to,
    empty: from === to,
    $from: { marks: () => [] },
  };
}

function createTransaction() {
  const transaction = {
    setSelection: vi.fn(),
    removeMark: vi.fn(),
    addMark: vi.fn(),
    removeStoredMark: vi.fn(),
    addStoredMark: vi.fn(),
    scrollIntoView: vi.fn(),
  };
  transaction.setSelection.mockReturnValue(transaction);
  transaction.removeMark.mockReturnValue(transaction);
  transaction.addMark.mockReturnValue(transaction);
  transaction.removeStoredMark.mockReturnValue(transaction);
  transaction.addStoredMark.mockReturnValue(transaction);
  transaction.scrollIntoView.mockReturnValue(transaction);
  return transaction;
}

function createContext(selection: FakeSelection, docSize = 20) {
  const transaction = createTransaction();
  const view = {
    dispatch: vi.fn(),
    focus: vi.fn(),
    state: {
      selection,
      tr: transaction,
      doc: {
        content: { size: docSize },
        nodesBetween: vi.fn(),
      },
    },
  };
  const ctx = {
    get: vi.fn((key) => (key === editorViewCtx ? view : undefined)),
  };
  return { ctx, transaction, view };
}

function mockDocumentSelection(selection: Partial<Selection>): void {
  Object.defineProperty(document, 'getSelection', {
    configurable: true,
    value: vi.fn(() => selection),
  });
}

describe('applyTextStyle', () => {
  beforeEach(() => {
    fakeMarkType.create.mockClear();
    fakeMarkType.isInSet.mockReset();
    fakeMarkType.isInSet.mockReturnValue(null);
    fakeTextSelection.create.mockClear();
    vi.restoreAllMocks();
  });

  it('applies color to the preserved non-empty selection after toolbar focus changes', () => {
    const preservedSelection = createSelection(2, 8);
    const { ctx, transaction, view } = createContext(createSelection(8, 8));

    (applyTextStyle as unknown as (
      context: typeof ctx,
      style: { color: string },
      selection: typeof preservedSelection,
    ) => void)(ctx, { color: '#ef4444' }, preservedSelection);

    expect(transaction.setSelection).toHaveBeenCalledWith(preservedSelection);
    expect(transaction.removeMark).toHaveBeenCalledWith(2, 8, fakeMarkType);
    expect(transaction.addMark).toHaveBeenCalledWith(
      2,
      8,
      expect.objectContaining({
        attrs: {
          color: '#ef4444',
          backgroundColor: null,
        },
      }),
    );
    expect(transaction.addStoredMark).not.toHaveBeenCalled();
    expect(view.dispatch).toHaveBeenCalledWith(transaction);
  });

  it('ignores an out-of-range preserved selection instead of applying style to the wrong range', () => {
    const invalidSelection = createSelection(4, 999);
    const { ctx, transaction } = createContext(createSelection(6, 6), 20);

    (applyTextStyle as unknown as (
      context: typeof ctx,
      style: { backgroundColor: string },
      selection: typeof invalidSelection,
    ) => void)(ctx, { backgroundColor: '#fef08a' }, invalidSelection);

    expect(transaction.setSelection).not.toHaveBeenCalled();
    expect(transaction.removeMark).not.toHaveBeenCalled();
    expect(transaction.addMark).not.toHaveBeenCalled();
    expect(transaction.removeStoredMark).toHaveBeenCalledWith(fakeMarkType);
    expect(transaction.addStoredMark).toHaveBeenCalledWith(
      expect.objectContaining({
        attrs: {
          color: null,
          backgroundColor: '#fef08a',
        },
      }),
    );
  });

  it('removes textStyle marks without inserting replacement marks when resetting a selection', () => {
    const selection = createSelection(3, 11);
    const { ctx, transaction } = createContext(selection);

    (applyTextStyle as unknown as (
      context: typeof ctx,
      style: { color: null; backgroundColor: null },
    ) => void)(ctx, { color: null, backgroundColor: null });

    expect(transaction.removeMark).toHaveBeenCalledWith(3, 11, fakeMarkType);
    expect(transaction.addMark).not.toHaveBeenCalled();
    expect(transaction.addStoredMark).not.toHaveBeenCalled();
  });

  it('stores textStyle marks for future typing when the selection is empty', () => {
    const { ctx, transaction } = createContext(createSelection(5, 5));

    (applyTextStyle as unknown as (
      context: typeof ctx,
      style: { color: string },
    ) => void)(ctx, { color: '#2563eb' });

    expect(transaction.removeStoredMark).toHaveBeenCalledWith(fakeMarkType);
    expect(transaction.addStoredMark).toHaveBeenCalledWith(
      expect.objectContaining({
        attrs: {
          color: '#2563eb',
          backgroundColor: null,
        },
      }),
    );
    expect(transaction.removeMark).not.toHaveBeenCalled();
    expect(transaction.addMark).not.toHaveBeenCalled();
  });
});

describe('selectionFromDomSelection', () => {
  beforeEach(() => {
    fakeTextSelection.create.mockClear();
    vi.restoreAllMocks();
  });

  it('restores an editor range from the browser DOM selection when toolbar focus collapsed the ProseMirror selection', () => {
    const root = document.createElement('div');
    const textNode = document.createTextNode('科技创新2030');
    root.append(textNode);
    document.body.append(root);
    const doc = { content: { size: 20 } };
    const view = {
      dom: root,
      state: { doc },
      posAtDOM: vi.fn((_node: Node, offset: number) => offset + 2),
    };
    mockDocumentSelection({
      rangeCount: 1,
      isCollapsed: false,
      anchorNode: textNode,
      anchorOffset: 0,
      focusNode: textNode,
      focusOffset: 6,
    });

    const selection = selectionFromDomSelection(view as never);

    expect(view.posAtDOM).toHaveBeenCalledWith(textNode, 0);
    expect(view.posAtDOM).toHaveBeenCalledWith(textNode, 6);
    expect(fakeTextSelection.create).toHaveBeenCalledWith(doc, 2, 8);
    expect(selection).toEqual(expect.objectContaining({ from: 2, to: 8 }));
    root.remove();
  });

  it('does not restore a range when the DOM selection is outside the editor', () => {
    const root = document.createElement('div');
    const insideText = document.createTextNode('编辑器');
    const outsideText = document.createTextNode('外部文字');
    root.append(insideText);
    document.body.append(root, outsideText);
    const view = {
      dom: root,
      state: { doc: { content: { size: 20 } } },
      posAtDOM: vi.fn(),
    };
    mockDocumentSelection({
      rangeCount: 1,
      isCollapsed: false,
      anchorNode: outsideText,
      anchorOffset: 0,
      focusNode: insideText,
      focusOffset: 2,
    });

    expect(selectionFromDomSelection(view as never)).toBeUndefined();
    expect(view.posAtDOM).not.toHaveBeenCalled();
    expect(fakeTextSelection.create).not.toHaveBeenCalled();
    root.remove();
    outsideText.remove();
  });
});
