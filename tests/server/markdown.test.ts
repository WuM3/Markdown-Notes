import { describe, expect, it } from 'vitest';
import {
  extractSearchText,
  parseMarkdownFile,
  revisionFor,
  serializeMarkdownFile,
} from '../../src/server/domain/markdown.js';

describe('markdown document format', () => {
  it('round-trips required frontmatter and body content', () => {
    const serialized = serializeMarkdownFile({
      id: 'doc-123',
      title: '研究笔记',
      createdAt: '2026-06-25T08:00:00.000Z',
      content: '# 第一章\n\n- [x] 已完成\n',
    });

    expect(serialized).toContain('id: doc-123');
    expect(serialized).toContain('title: 研究笔记');
    expect(parseMarkdownFile(serialized)).toEqual({
      id: 'doc-123',
      title: '研究笔记',
      createdAt: '2026-06-25T08:00:00.000Z',
      content: '# 第一章\n\n- [x] 已完成\n',
    });
  });

  it('rejects markdown files without required metadata', () => {
    expect(() => parseMarkdownFile('# 无元数据')).toThrow('缺少文档元数据');
  });

  it('produces a stable revision that changes with content', () => {
    expect(revisionFor('same')).toBe(revisionFor('same'));
    expect(revisionFor('first')).not.toBe(revisionFor('second'));
  });

  it('extracts readable text without markdown punctuation', () => {
    const text = extractSearchText(
      '# 项目计划\n\n查看[资料](https://example.com)，完成 `npm test`。\n\n> [!NOTE]\n> 重要说明',
    );

    expect(text).toContain('项目计划');
    expect(text).toContain('查看资料');
    expect(text).toContain('npm test');
    expect(text).toContain('重要说明');
    expect(text).not.toContain('https://example.com');
  });
});

