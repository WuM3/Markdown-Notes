import { config, editorViewOptionsCtx } from '@milkdown/core';
import type { Slice } from '@milkdown/kit/prose/model';

export function serializeClipboardPlainText(slice: Slice): string {
  return slice.content.textBetween(0, slice.content.size, '\n');
}

export const plainTextClipboardConfig = config((ctx) => {
  ctx.update(editorViewOptionsCtx, (options) => ({
    ...options,
    clipboardTextSerializer: serializeClipboardPlainText,
  }));
});
