import type { Crepe } from '@milkdown/crepe';
import { editorViewOptionsCtx } from '@milkdown/kit/core';
import type { ResolvedPos } from '@milkdown/kit/prose/model';
import { markdownToSlice } from '@milkdown/kit/utils';
import {
  hasRichCodeBlock,
  markdownForRichClipboard,
  markdownForPlainTextPaste,
  normalizePastedCodeBlock,
} from './code-block-language.js';

export function configureCodePaste(crepe: Crepe): void {
  crepe.editor.config((ctx) => {
    ctx.update(editorViewOptionsCtx, (options) => {
      const previous = options.handlePaste;
      return {
        ...options,
        handlePaste(view, event, slice) {
          if (previous?.(view, event, slice)) return true;

          const text = event.clipboardData?.getData('text/plain') ?? '';
          const html = event.clipboardData?.getData('text/html') ?? '';
          const normalized = normalizePastedCodeBlock(text, html);
          const isFencedCodeBlock = /^```[\s\S]*```$/m.test(text.trim());
          const isRichCodeBlock = hasRichCodeBlock(html);
          const richMarkdown = markdownForRichClipboard(html);
          const codeBlock = findCurrentCodeBlock(view.state.selection.$from);
          if (!normalized.text) return false;

          if (codeBlock) {
            let transaction = view.state.tr;
            if (normalized.language && !codeBlock.node.attrs.language) {
              transaction = transaction.setNodeMarkup(codeBlock.pos, undefined, {
                ...codeBlock.node.attrs,
                language: normalized.language,
              });
            }
            transaction = transaction.replaceSelectionWith(
              view.state.schema.text(normalized.text),
            );
            view.dispatch(transaction.scrollIntoView());
            return true;
          }

          if (richMarkdown) {
            view.dispatch(
              view.state.tr
                .replaceSelection(markdownToSlice(richMarkdown)(ctx))
                .scrollIntoView(),
            );
            return true;
          }

          if (!isFencedCodeBlock && !isRichCodeBlock) {
            if (!text.includes('\n')) return false;
            view.dispatch(
              view.state.tr
                .replaceSelection(markdownToSlice(markdownForPlainTextPaste(text))(ctx))
                .scrollIntoView(),
            );
            return true;
          }

          const markdown = `\`\`\`${normalized.language}\n${normalized.text}\n\`\`\`\n`;
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
