import { config, remarkStringifyOptionsCtx } from '@milkdown/core';
import type { Ctx } from '@milkdown/kit/ctx';
import { editorViewCtx } from '@milkdown/kit/core';
import type { Mark, MarkType, Node as ProseNode } from '@milkdown/kit/prose/model';
import { TextSelection, type Selection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  $markAttr,
  $markSchema,
  $remark,
} from '@milkdown/kit/utils';

export interface TextStyleInput {
  color?: string | null;
  backgroundColor?: string | null;
}

export interface TextStyleAttrs {
  color: string | null;
  backgroundColor: string | null;
}

interface MarkdownNode {
  [key: string]: unknown;
  type: string;
  value?: string;
  children?: MarkdownNode[];
  color?: string | null;
  backgroundColor?: string | null;
}

export const textStyleAttr = $markAttr('textStyle');

export const textStyleSchema = $markSchema('textStyle', (ctx) => ({
  attrs: {
    color: { default: null },
    backgroundColor: { default: null },
  },
  parseDOM: [
    {
      tag: 'span[style]',
      getAttrs: (dom) =>
        parseTextStyleDeclaration((dom as HTMLElement).getAttribute('style') ?? '') ??
        false,
    },
  ],
  toDOM: (mark) => [
    'span',
    {
      ...ctx.get(textStyleAttr.key)(mark),
      style: buildStyleDeclaration(mark.attrs as TextStyleAttrs),
    },
    0,
  ],
  parseMarkdown: {
    match: (node) => node.type === 'textStyle',
    runner: (state, node, markType) => {
      const styleNode = node as MarkdownNode;
      state.openMark(markType, {
        color: styleNode.color ?? null,
        backgroundColor: styleNode.backgroundColor ?? null,
      });
      state.next(styleNode.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'textStyle',
    runner: (state, mark) => {
      const attrs = normalizeTextStyleAttrs(mark.attrs as TextStyleInput);
      if (!hasTextStyle(attrs)) return false;
      state.withMark(mark, 'textStyle', undefined, {
        color: attrs.color,
        backgroundColor: attrs.backgroundColor,
      });
      return false;
    },
  },
}));

export const textStyleRemarkPlugin = $remark('textStyleSpan', () => () => {
  return (tree: unknown) => {
    transformStyleSpans(tree as MarkdownNode);
  };
});

export const textStyleStringifyConfig = config((ctx) => {
  const options = ctx.get(remarkStringifyOptionsCtx);
  const handlers = {
    ...(options.handlers as Record<string, unknown>),
    textStyle: textStyleMarkdownHandler,
  } as typeof options.handlers;
  ctx.set(remarkStringifyOptionsCtx, {
    ...options,
    handlers,
  });
});

export function textStyleMarkdownHandler(
  node: MarkdownNode,
  _parent: unknown,
  state: {
    containerPhrasing: (node: MarkdownNode, info?: unknown) => string;
  },
  info: unknown,
): string {
  const content = state.containerPhrasing(node, info);
  const style = buildStyleDeclaration({
    color: node.color ?? null,
    backgroundColor: node.backgroundColor ?? null,
  });
  if (!style) return content;
  return `<span style="${escapeHtmlAttribute(style)}">${content}</span>`;
}

export function getStableEditorSelection(ctx: Ctx): Selection {
  const view = ctx.get(editorViewCtx);
  if (!view.state.selection.empty) return view.state.selection;
  return selectionFromDomSelection(view) ?? view.state.selection;
}

export function selectionFromDomSelection(
  view: EditorView,
): Selection | undefined {
  const domSelection = view.dom.ownerDocument.getSelection();
  if (
    !domSelection ||
    domSelection.rangeCount === 0 ||
    domSelection.isCollapsed ||
    !domSelection.anchorNode ||
    !domSelection.focusNode
  ) {
    return undefined;
  }

  if (
    !view.dom.contains(domSelection.anchorNode) ||
    !view.dom.contains(domSelection.focusNode)
  ) {
    return undefined;
  }

  try {
    const anchor = view.posAtDOM(
      domSelection.anchorNode,
      domSelection.anchorOffset,
    );
    const head = view.posAtDOM(
      domSelection.focusNode,
      domSelection.focusOffset,
    );
    const docSize = view.state.doc.content.size;
    if (anchor === head || anchor < 0 || head < 0 || anchor > docSize || head > docSize) {
      return undefined;
    }
    return TextSelection.create(view.state.doc, anchor, head);
  } catch {
    return undefined;
  }
}

export function getCurrentTextStyle(
  ctx: Ctx,
  selectionSnapshot?: Selection,
): TextStyleAttrs {
  const view = ctx.get(editorViewCtx);
  const markType = textStyleSchema.type(ctx);
  const { state } = view;
  const selection = usableSelectionSnapshot(
    selectionSnapshot,
    state.doc.content.size,
  ) ?? state.selection;
  const { from, to, empty } = selection;
  const current = findTextStyleAttrs(selection.$from.marks(), markType);
  return empty
    ? current
    : findTextStyleAttrsInRange(state.doc, from, to, markType) ?? current;
}

export function applyTextStyle(
  ctx: Ctx,
  style: TextStyleInput,
  selectionSnapshot?: Selection,
): void {
  const view = ctx.get(editorViewCtx);
  const markType = textStyleSchema.type(ctx);
  const { state } = view;
  let transaction = state.tr;
  let selection = state.selection;
  const preservedSelection = usableSelectionSnapshot(
    selectionSnapshot,
    state.doc.content.size,
  );

  if (preservedSelection) {
    try {
      transaction = transaction.setSelection(preservedSelection);
      selection = preservedSelection;
    } catch {
      selection = state.selection;
    }
  }

  const { from, to, empty } = selection;
  const selected = getSelectedTextStyle(state.doc, selection, markType);
  const next = normalizeTextStyleAttrs({
    color: style.color === undefined ? selected.color : style.color,
    backgroundColor:
      style.backgroundColor === undefined
        ? selected.backgroundColor
        : style.backgroundColor,
  });

  if (empty) {
    transaction = transaction.removeStoredMark(markType);
    if (hasTextStyle(next)) {
      transaction = transaction.addStoredMark(markType.create(next));
    }
  } else {
    transaction = transaction.removeMark(from, to, markType);
    if (hasTextStyle(next)) {
      transaction = transaction.addMark(from, to, markType.create(next));
    }
  }
  view.dispatch(transaction.scrollIntoView());
  view.focus();
}

export function buildStyleDeclaration(style: TextStyleInput): string {
  const rules: string[] = [];
  if (style.color) rules.push(`color: ${style.color}`);
  if (style.backgroundColor) {
    rules.push(`background-color: ${style.backgroundColor}`);
  }
  return rules.join('; ');
}

export function parseTextStyleDeclaration(
  declaration: string,
): TextStyleAttrs | undefined {
  const attrs: TextStyleAttrs = {
    color: null,
    backgroundColor: null,
  };

  for (const rule of declaration.split(';')) {
    const [rawName, ...rawValue] = rule.split(':');
    const name = rawName?.trim().toLowerCase();
    if (!name) continue;

    const isColorRule =
      name === 'color' || name === 'background-color' || name === 'background';
    if (!isColorRule) continue;

    const rawStyleValue = rawValue.join(':');
    const value = normalizeStyleValue(rawStyleValue);
    if (!value) return undefined;

    if (name === 'color') attrs.color = value;
    if (name === 'background-color' || name === 'background') {
      attrs.backgroundColor = value;
    }
  }

  return hasTextStyle(attrs) ? attrs : undefined;
}

export function transformStyleSpans(node: MarkdownNode): void {
  if (!node.children?.length) return;

  const nextChildren: MarkdownNode[] = [];
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    if (!child) continue;

    const style = parseOpeningStyleSpan(child);
    if (!style) {
      transformStyleSpans(child);
      nextChildren.push(child);
      continue;
    }

    const children: MarkdownNode[] = [];
    let depth = 1;
    let cursor = index + 1;
    for (; cursor < node.children.length; cursor += 1) {
      const candidate = node.children[cursor];
      if (!candidate) continue;
      if (parseOpeningStyleSpan(candidate)) {
        depth += 1;
      }
      if (isClosingSpan(candidate)) {
        depth -= 1;
        if (depth === 0) break;
      }
      children.push(candidate);
    }

    if (depth !== 0) {
      nextChildren.push(child);
      continue;
    }

    const styleNode: MarkdownNode = {
      type: 'textStyle',
      color: style.color,
      backgroundColor: style.backgroundColor,
      children,
    };
    transformStyleSpans(styleNode);
    nextChildren.push(styleNode);
    index = cursor;
  }

  node.children = nextChildren;
}

function parseOpeningStyleSpan(node: MarkdownNode): TextStyleAttrs | undefined {
  if (node.type !== 'html' || !node.value) return undefined;
  const match = node.value.match(/^<span\b([^>]*)>$/i);
  if (!match) return undefined;
  const attrs = match[1] ?? '';
  const style =
    attrs.match(/\bstyle\s*=\s*"([^"]*)"/i)?.[1] ??
    attrs.match(/\bstyle\s*=\s*'([^']*)'/i)?.[1] ??
    '';
  return parseTextStyleDeclaration(style);
}

function isClosingSpan(node: MarkdownNode): boolean {
  return node.type === 'html' && /^<\/span\s*>$/i.test(node.value ?? '');
}

function getSelectedTextStyle(
  doc: ProseNode,
  selection: Selection,
  markType: MarkType,
): TextStyleAttrs {
  const current = findTextStyleAttrs(selection.$from.marks(), markType);
  return selection.empty
    ? current
    : findTextStyleAttrsInRange(doc, selection.from, selection.to, markType) ?? current;
}

function usableSelectionSnapshot(
  selection: Selection | undefined,
  docSize: number,
): Selection | undefined {
  if (!selection) return undefined;
  if (selection.from < 0 || selection.to > docSize || selection.from > selection.to) {
    return undefined;
  }
  return selection;
}

function findTextStyleAttrs(marks: readonly Mark[], markType: MarkType) {
  const mark = markType.isInSet(marks);
  return normalizeTextStyleAttrs((mark?.attrs ?? {}) as TextStyleInput);
}

function findTextStyleAttrsInRange(
  doc: ProseNode,
  from: number,
  to: number,
  markType: MarkType,
): TextStyleAttrs | undefined {
  let found: TextStyleAttrs | undefined;
  doc.nodesBetween(from, to, (node) => {
    if (found) return false;
    if (!node.isText) return true;
    const mark = markType.isInSet(node.marks);
    if (!mark) return true;
    found = normalizeTextStyleAttrs(mark.attrs as TextStyleInput);
    return false;
  });
  return found;
}

function normalizeTextStyleAttrs(style: TextStyleInput): TextStyleAttrs {
  return {
    color: normalizeStyleValue(style.color),
    backgroundColor: normalizeStyleValue(style.backgroundColor),
  };
}

function normalizeStyleValue(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (
    normalized.length > 48 ||
    /[;<>{}]/.test(normalized) ||
    /url\s*\(/i.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function hasTextStyle(style: TextStyleInput): boolean {
  return Boolean(style.color || style.backgroundColor);
}

function escapeHtmlAttribute(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}






