import { describe, expect, it } from 'vitest';
import { parseExportDocument } from '../../src/server/export/parse-markdown.js';
import { renderMarkdownExport } from '../../src/server/export/render-markdown.js';

describe('export document model', () => {
  it('keeps empty documents valid and preserves current frontmatter metadata', () => {
    const model = parseExportDocument({
      id: 'doc-empty',
      title: '空文档',
      createdAt: '2026-07-09T08:00:00.000Z',
      markdown: ' \n',
    });

    expect(model).toEqual({
      id: 'doc-empty',
      title: '空文档',
      createdAt: '2026-07-09T08:00:00.000Z',
      blocks: [],
    });

    const markdown = renderMarkdownExport({
      id: model.id,
      title: model.title,
      createdAt: model.createdAt,
      content: '',
    }).toString('utf8');
    expect(markdown).toContain('id: doc-empty');
    expect(markdown).toContain('title: 空文档');
    expect(markdown).toContain("createdAt: '2026-07-09T08:00:00.000Z'");
  });

  it('parses headings, combined inline marks, hard breaks, links and colors', () => {
    const model = parseExportDocument({
      id: 'doc-inline',
      title: '组合样式',
      createdAt: '2026-07-09T08:00:00.000Z',
      markdown: [
        '# 一级标题',
        '',
        '普通 **粗体 _粗斜体_** ~~删除~~ `inline()`  ',
        '[链接](https://example.com)',
        '',
        '<span style="color: #ef4444; background-color: #fef08a">彩色文字</span>',
      ].join('\n'),
    });

    expect(model.blocks[0]).toMatchObject({
      type: 'heading',
      level: 1,
      children: [{ type: 'text', text: '一级标题' }],
    });
    expect(model.blocks[1]).toMatchObject({
      type: 'paragraph',
      children: expect.arrayContaining([
        expect.objectContaining({ type: 'text', text: '粗体 ', bold: true }),
        expect.objectContaining({
          type: 'text',
          text: '粗斜体',
          bold: true,
          italic: true,
        }),
        expect.objectContaining({ type: 'text', text: '删除', strike: true }),
        expect.objectContaining({ type: 'inlineCode', text: 'inline()' }),
        expect.objectContaining({ type: 'break' }),
        expect.objectContaining({
          type: 'link',
          url: 'https://example.com',
        }),
      ]),
    });
    expect(model.blocks[2]).toMatchObject({
      type: 'paragraph',
      children: [
        expect.objectContaining({
          type: 'text',
          text: '彩色文字',
          color: '#ef4444',
          backgroundColor: '#fef08a',
        }),
      ],
    });
  });

  it('parses nested lists, task states, nested quotes and alert quotes', () => {
    const model = parseExportDocument({
      id: 'doc-structure',
      title: '结构',
      createdAt: '2026-07-09T08:00:00.000Z',
      markdown: [
        '1. 第一项',
        '   - [x] 已完成',
        '   - [ ] 未完成',
        '2. 第二项',
        '',
        '> [!NOTE]',
        '> 第一层',
        '>',
        '> > 第二层',
      ].join('\n'),
    });

    expect(model.blocks[0]).toMatchObject({
      type: 'list',
      ordered: true,
      start: 1,
      items: [
        {
          checked: null,
          blocks: expect.arrayContaining([
            expect.objectContaining({ type: 'paragraph' }),
            expect.objectContaining({
              type: 'list',
              ordered: false,
              items: [
                expect.objectContaining({ checked: true }),
                expect.objectContaining({ checked: false }),
              ],
            }),
          ]),
        },
        expect.objectContaining({ checked: null }),
      ],
    });
    expect(model.blocks[1]).toMatchObject({
      type: 'quote',
      alert: 'NOTE',
      blocks: expect.arrayContaining([
        expect.objectContaining({ type: 'paragraph' }),
        expect.objectContaining({ type: 'quote' }),
      ]),
    });
  });

  it('parses empty and long code blocks without losing language or newlines', () => {
    const longLine = 'x'.repeat(5_000);
    const model = parseExportDocument({
      id: 'doc-code',
      title: '代码',
      createdAt: '2026-07-09T08:00:00.000Z',
      markdown: [
        '```typescript',
        longLine,
        '```',
        '',
        '```',
        '```',
      ].join('\n'),
    });

    expect(model.blocks).toEqual([
      { type: 'code', language: 'typescript', value: longLine },
      { type: 'code', language: null, value: '' },
    ]);
  });

  it('parses wide GFM tables including empty cells and alignment', () => {
    const model = parseExportDocument({
      id: 'doc-table',
      title: '表格',
      createdAt: '2026-07-09T08:00:00.000Z',
      markdown: [
        '| 左 | 中 | 右 | 空 | 很长的列 |',
        '| :-- | :-: | --: | --- | --- |',
        '| A | B | C | | ' + '内容'.repeat(100) + ' |',
      ].join('\n'),
    });

    expect(model.blocks[0]).toMatchObject({
      type: 'table',
      align: ['left', 'center', 'right', null, null],
      rows: [
        expect.objectContaining({ header: true }),
        expect.objectContaining({
          header: false,
          cells: expect.arrayContaining([[]]),
        }),
      ],
    });
  });

  it('preserves local images and attachments but marks external images', () => {
    const model = parseExportDocument({
      id: 'doc-assets',
      title: '资源',
      createdAt: '2026-07-09T08:00:00.000Z',
      markdown: [
        '![本地图](.assets/doc-assets/topology.png)',
        '',
        '[报告](.assets/doc-assets/report.pdf)',
        '',
        '![远程图](https://example.com/remote.png)',
      ].join('\n'),
    });

    expect(model.blocks[0]).toMatchObject({
      type: 'image',
      alt: '本地图',
      url: '.assets/doc-assets/topology.png',
      external: false,
    });
    expect(model.blocks[1]).toMatchObject({
      type: 'paragraph',
      children: [
        expect.objectContaining({
          type: 'link',
          text: '报告',
          url: '.assets/doc-assets/report.pdf',
        }),
      ],
    });
    expect(model.blocks[2]).toMatchObject({
      type: 'image',
      alt: '远程图',
      external: true,
    });
  });

  it('drops unsafe raw HTML while retaining readable text around it', () => {
    const model = parseExportDocument({
      id: 'doc-hostile',
      title: '安全',
      createdAt: '2026-07-09T08:00:00.000Z',
      markdown: [
        '前面<script>alert("x")</script>后面',
        '',
        '<span style="color: red; background-image: url(javascript:x)">危险样式</span>',
        '',
        '<span style="color: #2563eb">合法样式</span>',
      ].join('\n'),
    });

    expect(JSON.stringify(model)).not.toContain('script');
    expect(JSON.stringify(model)).not.toContain('javascript');
    expect(JSON.stringify(model)).not.toContain('background-image');
    expect(JSON.stringify(model)).toContain('前面');
    expect(JSON.stringify(model)).toContain('后面');
    expect(JSON.stringify(model)).toContain('合法样式');
  });

  it('keeps Unicode, emoji and combining characters unchanged', () => {
    const value = '中文 😀 café e\u0301 𠮷';
    const model = parseExportDocument({
      id: 'doc-unicode',
      title: value,
      createdAt: '2026-07-09T08:00:00.000Z',
      markdown: value,
    });

    expect(model.title).toBe(value);
    expect(model.blocks[0]).toMatchObject({
      type: 'paragraph',
      children: [{ type: 'text', text: value }],
    });
  });
});
