import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkStringify from 'remark-stringify';
import {
  buildStyleDeclaration,
  parseTextStyleDeclaration,
  textStyleMarkdownHandler,
  transformStyleSpans,
} from '../../src/client/editor/text-style.js';

describe('text style markdown helpers', () => {
  it('builds stable inline style declarations for markdown spans', () => {
    expect(
      buildStyleDeclaration({
        color: '#ef4444',
        backgroundColor: '#fef08a',
      }),
    ).toBe('color: #ef4444; background-color: #fef08a');
  });

  it('parses safe color and background styles from html spans', () => {
    expect(
      parseTextStyleDeclaration(
        'color: #ef4444; background-color: #fef08a',
      ),
    ).toEqual({
      color: '#ef4444',
      backgroundColor: '#fef08a',
    });
  });

  it('rejects unsafe or malformed style declarations before they reach the editor', () => {
    expect(parseTextStyleDeclaration('color: url(javascript:alert(1))')).toBeUndefined();
    expect(parseTextStyleDeclaration('color: #fff; background: red{}')).toBeUndefined();
    expect(
      parseTextStyleDeclaration(
        `color: ${'a'.repeat(49)}`,
      ),
    ).toBeUndefined();
  });

  it('serializes styled text without dropping multiline paragraph content', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'textStyle',
              color: '#ef4444',
              backgroundColor: '#fef08a',
              children: [{ type: 'text', value: '第一段文字' }],
            },
          ],
        },
        {
          type: 'paragraph',
          children: [
            {
              type: 'textStyle',
              color: '#2563eb',
              backgroundColor: null,
              children: [{ type: 'text', value: '第二段文字' }],
            },
          ],
        },
      ],
    };

    const markdown = unified()
      .use(remarkStringify, {
        handlers: { textStyle: textStyleMarkdownHandler },
      } as never)
      .stringify(tree as never);

    expect(markdown).toContain(
      '<span style="color: #ef4444; background-color: #fef08a">第一段文字</span>',
    );
    expect(markdown).toContain(
      '<span style="color: #2563eb">第二段文字</span>',
    );
    expect(markdown).toContain('\n\n');
  });

  it('serializes unstyled textStyle nodes as plain text instead of raw empty spans', () => {
    const markdown = textStyleMarkdownHandler(
      {
        type: 'textStyle',
        color: null,
        backgroundColor: null,
        children: [{ type: 'text', value: '保留文字' }],
      },
      undefined,
      {
        containerPhrasing: () => '保留文字',
      },
      undefined,
    );

    expect(markdown).toBe('保留文字');
  });

  it('converts saved inline style spans back into textStyle nodes without losing nested markdown', () => {
    const tree = {
      type: 'paragraph',
      children: [
        { type: 'html', value: '<span style="color: #ef4444; background-color: #fef08a">' },
        { type: 'text', value: '红色' },
        { type: 'strong', children: [{ type: 'text', value: '加粗' }] },
        { type: 'html', value: '</span>' },
        { type: 'text', value: '后续正文' },
      ],
    };

    transformStyleSpans(tree as Parameters<typeof transformStyleSpans>[0]);

    expect(tree.children).toEqual([
      {
        type: 'textStyle',
        color: '#ef4444',
        backgroundColor: '#fef08a',
        children: [
          { type: 'text', value: '红色' },
          { type: 'strong', children: [{ type: 'text', value: '加粗' }] },
        ],
      },
      { type: 'text', value: '后续正文' },
    ]);
  });

  it('leaves malformed unclosed style spans untouched so saved content is not deleted', () => {
    const tree = {
      type: 'paragraph',
      children: [
        { type: 'html', value: '<span style="color: #ef4444">' },
        { type: 'text', value: '不能丢' },
      ],
    };

    transformStyleSpans(tree as Parameters<typeof transformStyleSpans>[0]);

    expect(tree.children).toEqual([
      { type: 'html', value: '<span style="color: #ef4444">' },
      { type: 'text', value: '不能丢' },
    ]);
  });
});
