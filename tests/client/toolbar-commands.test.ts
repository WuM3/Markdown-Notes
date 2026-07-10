import { Schema } from '@milkdown/kit/prose/model';
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state';
import { describe, expect, it } from 'vitest';
import { getTouchedTextBlockRange } from '../../src/client/editor/toolbar-commands.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
  },
});

function paragraph(text: string) {
  return schema.node('paragraph', undefined, schema.text(text));
}

describe('getTouchedTextBlockRange', () => {
  it('expands a partial multi-paragraph selection to every touched text block', () => {
    const doc = schema.node('doc', undefined, [
      paragraph('第一行内容'),
      paragraph('第二行内容'),
      paragraph('第三行内容'),
    ]);
    const selection = TextSelection.create(doc, 3, doc.content.size - 3);

    expect(getTouchedTextBlockRange(selection)).toEqual({
      from: 1,
      to: doc.content.size - 1,
    });
  });

  it('does not expand an empty selection', () => {
    const doc = schema.node('doc', undefined, [paragraph('第一行内容')]);

    expect(getTouchedTextBlockRange(TextSelection.create(doc, 3))).toBeUndefined();
  });

  it('returns the current text block bounds when both endpoints share a paragraph', () => {
    const doc = schema.node('doc', undefined, [
      paragraph('第一行内容'),
      paragraph('第二行内容'),
    ]);

    expect(getTouchedTextBlockRange(TextSelection.create(doc, 3, 5))).toEqual({
      from: 1,
      to: doc.firstChild!.nodeSize - 1,
    });
  });

  it('does not expand a non-textblock node selection', () => {
    const doc = schema.node('doc', undefined, [paragraph('第一行内容')]);

    expect(getTouchedTextBlockRange(NodeSelection.create(doc, 0))).toBeUndefined();
  });
});
