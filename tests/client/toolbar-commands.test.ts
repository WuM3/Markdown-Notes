import { Fragment, Schema, Slice } from '@milkdown/kit/prose/model';
import { EditorState, NodeSelection, TextSelection } from '@milkdown/kit/prose/state';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  lift: vi.fn(),
  markdownToSlice: vi.fn(),
}));

vi.mock('@milkdown/kit/core', () => ({
  commandsCtx: Symbol('commandsCtx'),
  editorViewCtx: Symbol('editorViewCtx'),
}));

vi.mock('@milkdown/kit/preset/commonmark', () => ({
  blockquoteSchema: { type: (ctx: TestCtx) => ctx.nodeTypes.blockquote },
  codeBlockSchema: { type: (ctx: TestCtx) => ctx.nodeTypes.code_block },
  headingSchema: { type: (ctx: TestCtx) => ctx.nodeTypes.heading },
  paragraphSchema: { type: (ctx: TestCtx) => ctx.nodeTypes.paragraph },
  setBlockTypeCommand: { key: 'set-block-type' },
  wrapInBlockTypeCommand: { key: 'wrap-in-block-type' },
}));

vi.mock('@milkdown/kit/prose/commands', () => ({ lift: mocks.lift }));

vi.mock('@milkdown/kit/utils', () => ({ markdownToSlice: mocks.markdownToSlice }));

const { commandsCtx, editorViewCtx } = await import('@milkdown/kit/core');
const { setBlockTypeCommand, wrapInBlockTypeCommand } = await import(
  '@milkdown/kit/preset/commonmark'
);
const { applyCodeBlock, getTouchedTextBlockRange, toggleBlockquote } = await import(
  '../../src/client/editor/toolbar-commands.js'
);

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    blockquote: { content: 'block+', group: 'block' },
    code_block: { content: 'text*', group: 'block', code: true },
    text: { group: 'inline' },
  },
});

function paragraph(text: string) {
  return schema.node('paragraph', undefined, schema.text(text));
}

interface TestCtx {
  nodeTypes: typeof schema.nodes;
  get: ReturnType<typeof vi.fn>;
}

function createHarness(doc: ReturnType<typeof schema.node>, selection: TextSelection) {
  let state = EditorState.create({ schema, doc, selection });
  const commands = { call: vi.fn() };
  const view = {
    get state() {
      return state;
    },
    dispatch: vi.fn((transaction) => {
      state = state.apply(transaction);
    }),
    focus: vi.fn(),
  };
  const ctx: TestCtx = {
    nodeTypes: schema.nodes,
    get: vi.fn((key) => {
      if (key === editorViewCtx) return view;
      if (key === commandsCtx) return commands;
      return undefined;
    }),
  };

  return { commands, ctx, get state() { return state; }, view };
}

function codeSliceFromMarkdown(markdown: string): Slice {
  const lines = markdown.trimEnd().split('\n');
  return new Slice(
    Fragment.from(schema.node('code_block', undefined, schema.text(lines.slice(1, -1).join('\n')))),
    0,
    0,
  );
}

mocks.markdownToSlice.mockImplementation((markdown: string) => () =>
  codeSliceFromMarkdown(markdown),
);

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

describe('block toolbar commands', () => {
  it('converts every touched paragraph to one code block for a partial three-paragraph selection', () => {
    const doc = schema.node('doc', undefined, [
      paragraph('alpha'),
      paragraph('bravo'),
      paragraph('charlie'),
    ]);
    const harness = createHarness(
      doc,
      TextSelection.create(doc, 3, doc.content.size - 3),
    );

    applyCodeBlock(harness.ctx as never);

    expect(harness.state.doc.toJSON()).toEqual({
      type: 'doc',
      content: [
        { type: 'code_block', content: [{ type: 'text', text: 'alpha\nbravo\ncharlie' }] },
      ],
    });
    expect(mocks.markdownToSlice).toHaveBeenCalledWith(
      expect.stringContaining('alpha\nbravo\ncharlie'),
    );
  });

  it('converts a partial selection within one paragraph using the whole paragraph', () => {
    const doc = schema.node('doc', undefined, [paragraph('alpha')]);
    const harness = createHarness(doc, TextSelection.create(doc, 2, 4));

    applyCodeBlock(harness.ctx as never);

    expect(harness.state.doc.textContent).toBe('alpha');
    expect(harness.state.doc.firstChild?.type.name).toBe('code_block');
  });

  it('converts selections whose endpoints are exactly at text block boundaries', () => {
    const doc = schema.node('doc', undefined, [
      paragraph('alpha'),
      paragraph('bravo'),
      paragraph('charlie'),
    ]);
    const harness = createHarness(
      doc,
      TextSelection.create(doc, 1, doc.content.size - 1),
    );

    applyCodeBlock(harness.ctx as never);

    expect(harness.state.doc.textContent).toBe('alpha\nbravo\ncharlie');
    expect(harness.state.doc.childCount).toBe(1);
  });

  it('keeps the existing empty-selection code block command behavior', () => {
    const doc = schema.node('doc', undefined, [paragraph('alpha')]);
    const harness = createHarness(doc, TextSelection.create(doc, 3));

    applyCodeBlock(harness.ctx as never);

    expect(harness.commands.call).toHaveBeenCalledWith(setBlockTypeCommand.key, {
      nodeType: schema.nodes.code_block,
    });
    expect(harness.view.dispatch).not.toHaveBeenCalled();
  });

  it('keeps the existing non-empty whitespace-selection code block behavior', () => {
    const doc = schema.node('doc', undefined, [paragraph('   ')]);
    const harness = createHarness(doc, TextSelection.create(doc, 1, 4));

    applyCodeBlock(harness.ctx as never);

    expect(harness.commands.call).not.toHaveBeenCalled();
    expect(harness.view.dispatch).not.toHaveBeenCalled();
  });

  it('keeps a whitespace-only selection inside non-whitespace text unchanged', () => {
    const doc = schema.node('doc', undefined, [paragraph('alpha   bravo')]);
    const harness = createHarness(doc, TextSelection.create(doc, 6, 9));

    applyCodeBlock(harness.ctx as never);

    expect(harness.state.doc.toJSON()).toEqual(doc.toJSON());
    expect(harness.commands.call).not.toHaveBeenCalled();
    expect(harness.view.dispatch).not.toHaveBeenCalled();
  });

  it('expands a partial three-paragraph quote selection before calling the wrap command', () => {
    const doc = schema.node('doc', undefined, [
      paragraph('alpha'),
      paragraph('bravo'),
      paragraph('charlie'),
    ]);
    const harness = createHarness(
      doc,
      TextSelection.create(doc, 3, doc.content.size - 3),
    );

    toggleBlockquote(harness.ctx as never);

    expect(harness.state.selection).toEqual(TextSelection.create(doc, 1, doc.content.size - 1));
    expect(harness.commands.call).toHaveBeenCalledWith(wrapInBlockTypeCommand.key, {
      nodeType: schema.nodes.blockquote,
    });
    expect(harness.view.dispatch.mock.invocationCallOrder[0]).toBeLessThan(
      harness.commands.call.mock.invocationCallOrder[0],
    );
  });

  it('keeps lifting when text is selected inside an existing blockquote', () => {
    const quote = schema.node('blockquote', undefined, [paragraph('alpha')]);
    const doc = schema.node('doc', undefined, [quote]);
    const harness = createHarness(doc, TextSelection.create(doc, 3, 5));

    toggleBlockquote(harness.ctx as never);

    expect(mocks.lift).toHaveBeenCalledWith(harness.view.state, harness.view.dispatch, harness.view);
    expect(harness.commands.call).not.toHaveBeenCalled();
  });

  it('preserves all text when a partial selection is already inside a code block', () => {
    const doc = schema.node('doc', undefined, [
      schema.node('code_block', undefined, schema.text('alpha')),
    ]);
    const harness = createHarness(doc, TextSelection.create(doc, 2, 4));

    applyCodeBlock(harness.ctx as never);

    expect(harness.state.doc.toJSON()).toEqual(doc.toJSON());
  });
});
