import type { Ctx } from '@milkdown/kit/ctx';
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import {
  blockquoteSchema,
  codeBlockSchema,
  headingSchema,
  paragraphSchema,
  setBlockTypeCommand,
  wrapInBlockTypeCommand,
} from '@milkdown/kit/preset/commonmark';
import { lift } from '@milkdown/kit/prose/commands';
import type { ResolvedPos } from '@milkdown/kit/prose/model';
import {
  NodeSelection,
  type Selection,
  TextSelection,
} from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { markdownToSlice } from '@milkdown/kit/utils';
import { inferCodeBlockLanguage } from './code-block-language.js';

export type BlockFormat = 'paragraph' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'code_block';

export function getTouchedTextBlockRange(
  selection: Selection,
): { from: number; to: number } | undefined {
  if (selection.empty || !(selection instanceof TextSelection)) return undefined;

  const from = textBlockContentRange(selection.$from, 'following');
  const to = textBlockContentRange(selection.$to, 'preceding');
  if (!from || !to) return undefined;

  return { from: from.from, to: to.to };
}

export function applyBlockFormat(ctx: Ctx, format: BlockFormat): void {
  const commands = ctx.get(commandsCtx);
  commands.call(setBlockTypeCommand.key, {
    nodeType:
      format === 'paragraph'
        ? paragraphSchema.type(ctx)
        : format === 'code_block'
          ? codeBlockSchema.type(ctx)
        : headingSchema.type(ctx),
    attrs:
      format === 'paragraph' || format === 'code_block'
        ? null
        : { level: Number(format.replace('h', '')) },
  });
  focusEditor(ctx);
}

export function toggleBlockquote(ctx: Ctx): void {
  const view = ctx.get(editorViewCtx);
  const { selection } = view.state;
  if (selection instanceof TextSelection && !selection.empty) {
    const selectedText = view.state.doc
      .textBetween(selection.from, selection.to, '\n')
      .replace(/\r\n?/g, '\n');
    if (!selectedText.trim()) {
      focusEditor(ctx);
      return;
    }
  }

  if (selectionInsideNode(selection, 'blockquote')) {
    lift(view.state, view.dispatch, view);
  } else {
    const expandedSelection = expandSelectionToTouchedTextBlocks(selection);
    if (expandedSelection !== selection) {
      view.dispatch(view.state.tr.setSelection(expandedSelection));
    }
    ctx.get(commandsCtx).call(wrapInBlockTypeCommand.key, {
      nodeType: blockquoteSchema.type(ctx),
    });
  }
  focusEditor(ctx);
}

export function applyCodeBlock(ctx: Ctx): void {
  const view = ctx.get(editorViewCtx);
  const { state } = view;
  const { selection } = state;
  if (selection.empty) {
    ctx.get(commandsCtx).call(setBlockTypeCommand.key, {
      nodeType: codeBlockSchema.type(ctx),
    });
    focusEditor(ctx);
    return;
  }

  const originalSelectedText = state.doc
    .textBetween(selection.from, selection.to, '\n')
    .replace(/\r\n?/g, '\n');
  if (!originalSelectedText.trim()) {
    focusEditor(ctx);
    return;
  }

  const expandedSelection = expandSelectionToTouchedTextBlocks(selection);
  const selectedText = state.doc
    .textBetween(expandedSelection.from, expandedSelection.to, '\n')
    .replace(/\r\n?/g, '\n');
  const language = inferCodeBlockLanguage(selectedText);
  const markdown = `\`\`\`${language}\n${selectedText}\n\`\`\`\n`;
  view.dispatch(
    state.tr
      .setSelection(expandedSelection)
      .replaceSelection(markdownToSlice(markdown)(ctx))
      .scrollIntoView(),
  );
  focusEditor(ctx);
}

export function applyBlockFormatAtElement(
  ctx: Ctx,
  format: BlockFormat,
  element: HTMLElement,
): void {
  const view = ctx.get(editorViewCtx);
  const pos = findTopLevelBlockPosition(view, element);
  if (pos !== undefined) {
    selectBlock(view, pos);
  }
  applyBlockFormat(ctx, format);
}

function selectionInsideNode(
  selection: { $from: ResolvedPos; $to: ResolvedPos; node?: { type: { name: string } } },
  nodeName: string,
): boolean {
  if (selection.node?.type.name === nodeName) return true;
  return (
    positionInsideNode(selection.$from, nodeName) ||
    positionInsideNode(selection.$to, nodeName)
  );
}

function positionInsideNode($from: ResolvedPos, nodeName: string): boolean {
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === nodeName) return true;
  }
  return false;
}

function textBlockContentRange(
  $pos: ResolvedPos,
  boundaryDirection: 'following' | 'preceding',
): { from: number; to: number } | undefined {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).isTextblock) {
      return { from: $pos.start(depth), to: $pos.end(depth) };
    }
  }

  const sibling =
    boundaryDirection === 'following' ? $pos.nodeAfter : $pos.nodeBefore;
  if (!sibling?.isTextblock) return undefined;

  return boundaryDirection === 'following'
    ? { from: $pos.pos + 1, to: $pos.pos + sibling.nodeSize - 1 }
    : { from: $pos.pos - sibling.nodeSize + 1, to: $pos.pos - 1 };
}

function expandSelectionToTouchedTextBlocks(selection: Selection): Selection {
  const range = getTouchedTextBlockRange(selection);
  return range
    ? TextSelection.create(selection.$from.doc, range.from, range.to)
    : selection;
}

function focusEditor(ctx: Ctx): void {
  ctx.get(editorViewCtx).focus();
}

function selectBlock(view: EditorView, pos: number): void {
  const node = view.state.doc.nodeAt(pos);
  if (!node?.isBlock) return;

  const selection = NodeSelection.isSelectable(node)
    ? NodeSelection.create(view.state.doc, pos)
    : TextSelection.near(
        view.state.doc.resolve(
          Math.min(pos + 1, view.state.doc.content.size),
        ),
      );
  view.dispatch(view.state.tr.setSelection(selection));
}

function findTopLevelBlockPosition(
  view: EditorView,
  element: HTMLElement,
): number | undefined {
  const target = closestDirectChild(view.dom, element) ?? element;
  let found: number | undefined;
  view.state.doc.forEach((_node, offset) => {
    if (found !== undefined) return;
    const nodeDOM = view.nodeDOM(offset);
    const nodeElement =
      nodeDOM instanceof HTMLElement ? nodeDOM : nodeDOM?.parentElement;
    const directChild = nodeElement
      ? closestDirectChild(view.dom, nodeElement)
      : undefined;
    if (
      directChild &&
      (directChild === target ||
        directChild.contains(target) ||
        target.contains(directChild))
    ) {
      found = offset;
    }
  });
  if (found !== undefined) return found;

  const pos = safePosAtDom(view, element, 0);
  if (pos === undefined) return undefined;
  const resolved = view.state.doc.resolve(
    Math.max(0, Math.min(pos, view.state.doc.content.size)),
  );
  for (let depth = 1; depth <= resolved.depth; depth += 1) {
    if (resolved.node(depth).isBlock) return resolved.before(depth);
  }
  return undefined;
}

function closestDirectChild(
  root: HTMLElement,
  element: HTMLElement,
): HTMLElement | undefined {
  let current: HTMLElement | null = element;
  while (current && current.parentElement !== root) {
    current = current.parentElement;
  }
  return current?.parentElement === root ? current : undefined;
}

function safePosAtDom(
  view: EditorView,
  element: HTMLElement,
  offset: number,
): number | undefined {
  try {
    return view.posAtDOM(element, offset);
  } catch {
    return undefined;
  }
}
