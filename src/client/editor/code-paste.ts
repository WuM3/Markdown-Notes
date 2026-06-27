import type { Crepe } from '@milkdown/crepe';
import { editorViewOptionsCtx } from '@milkdown/kit/core';
import type { ResolvedPos } from '@milkdown/kit/prose/model';
import { markdownToSlice } from '@milkdown/kit/utils';
import { inferCodeBlockLanguage } from './code-block-language.js';

export function configureCodePaste(crepe: Crepe): void {
  crepe.editor.config((ctx) => {
    ctx.update(editorViewOptionsCtx, (options) => {
      const previous = options.handlePaste;
      return {
        ...options,
        handlePaste(view, event, slice) {
          if (previous?.(view, event, slice)) return true;

          const text = event.clipboardData?.getData('text/plain') ?? '';
          const language = inferCodeBlockLanguage(text);
          if (!language) return false;

          const codeBlock = findCurrentCodeBlock(view.state.selection.$from);
          if (codeBlock && !codeBlock.node.attrs.language) {
            view.dispatch(
              view.state.tr.setNodeMarkup(codeBlock.pos, undefined, {
                ...codeBlock.node.attrs,
                language,
              }),
            );
            return false;
          }
          if (codeBlock) return false;

          const markdown = `\`\`\`${language}\n${text.trimEnd()}\n\`\`\`\n`;
          view.dispatch(
            view.state.tr
              .replaceSelection(markdownToSlice(markdown)(ctx))
              .scrollIntoView(),
          );
          return true;
        },
      };
    });
  });
}

function findCurrentCodeBlock($from: ResolvedPos) {
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'code_block') {
      return {
        node,
        pos: $from.before(depth),
      };
    }
  }
  return undefined;
}
