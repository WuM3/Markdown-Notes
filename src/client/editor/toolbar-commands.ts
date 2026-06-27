import type { Ctx } from '@milkdown/kit/ctx';
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import {
  headingSchema,
  paragraphSchema,
  setBlockTypeCommand,
} from '@milkdown/kit/preset/commonmark';

export type BlockFormat = 'paragraph' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5';

export function applyBlockFormat(ctx: Ctx, format: BlockFormat): void {
  const commands = ctx.get(commandsCtx);
  commands.call(setBlockTypeCommand.key, {
    nodeType:
      format === 'paragraph'
        ? paragraphSchema.type(ctx)
        : headingSchema.type(ctx),
    attrs:
      format === 'paragraph'
        ? null
        : { level: Number(format.replace('h', '')) },
  });
  focusEditor(ctx);
}

function focusEditor(ctx: Ctx): void {
  ctx.get(editorViewCtx).focus();
}
