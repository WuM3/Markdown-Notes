import { serializeMarkdownFile } from '../domain/markdown.js';

export function renderMarkdownExport(input: {
  id: string;
  title: string;
  createdAt: string;
  content: string;
}): Buffer {
  return Buffer.from(
    serializeMarkdownFile({
      id: input.id,
      title: input.title,
      createdAt: input.createdAt,
      content: input.content,
    }),
    'utf8',
  );
}
