import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import { toString } from 'mdast-util-to-string';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

export interface MarkdownDocument {
  id: string;
  title: string;
  createdAt: string;
  content: string;
}

export function serializeMarkdownFile(document: MarkdownDocument): string {
  const content = document.content.endsWith('\n')
    ? document.content
    : `${document.content}\n`;

  return matter.stringify(content, {
    id: document.id,
    title: document.title,
    createdAt: document.createdAt,
  });
}

export function parseMarkdownFile(source: string): MarkdownDocument {
  const parsed = matter(source);
  const { id, title, createdAt } = parsed.data;

  if (
    typeof id !== 'string' ||
    typeof title !== 'string' ||
    typeof createdAt !== 'string'
  ) {
    throw new Error('缺少文档元数据');
  }

  return {
    id,
    title,
    createdAt,
    content: parsed.content.trim() ? parsed.content : '',
  };
}

export function revisionFor(source: string | Buffer): string {
  return createHash('sha256').update(source).digest('hex');
}

export function extractSearchText(markdown: string): string {
  const tree = unified().use(remarkParse).parse(markdown);
  return toString(tree, { includeImageAlt: true }).replace(/\s+/g, ' ').trim();
}
