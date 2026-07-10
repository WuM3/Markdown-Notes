import { unified } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import type {
  ExportBlock,
  ExportDocumentModel,
  ExportInline,
  ExportTextStyle,
} from './model.js';

interface MarkdownNode {
  type: string;
  value?: string;
  depth?: number;
  lang?: string | null;
  url?: string;
  title?: string | null;
  alt?: string;
  ordered?: boolean;
  start?: number | null;
  checked?: boolean | null;
  align?: Array<'left' | 'center' | 'right' | null>;
  children?: MarkdownNode[];
}

const unsafeHtmlBlock =
  /<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const styleSpanOpen = /^<span\b([^>]*)>$/i;
const styleSpanClose = /^<\/span\s*>$/i;

export function parseExportDocument(input: {
  id: string;
  title: string;
  createdAt: string;
  markdown: string;
}): ExportDocumentModel {
  const source = input.markdown.replace(unsafeHtmlBlock, '');
  const tree = unified().use(remarkParse).use(remarkGfm).parse(source) as MarkdownNode;
  return {
    id: input.id,
    title: input.title,
    createdAt: input.createdAt,
    blocks: mapBlocks(tree.children ?? []),
  };
}

function mapBlocks(nodes: MarkdownNode[]): ExportBlock[] {
  const output: ExportBlock[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case 'paragraph': {
        const children = mapInlines(node.children ?? []);
        if (children.length === 1 && children[0]?.type === 'image') {
          output.push({ ...children[0], type: 'image' });
          break;
        }
        if (children.length) output.push({ type: 'paragraph', children });
        break;
      }
      case 'heading':
        output.push({
          type: 'heading',
          level: clampHeadingDepth(node.depth),
          children: mapInlines(node.children ?? []),
        });
        break;
      case 'list':
        output.push({
          type: 'list',
          ordered: Boolean(node.ordered),
          start: node.ordered ? node.start ?? 1 : null,
          items: (node.children ?? []).map((item) => ({
            checked: typeof item.checked === 'boolean' ? item.checked : null,
            blocks: mapBlocks(item.children ?? []),
          })),
        });
        break;
      case 'blockquote': {
        const blocks = mapBlocks(node.children ?? []);
        const alert = extractAlert(blocks);
        if (blocks.length) output.push({ type: 'quote', alert, blocks });
        break;
      }
      case 'code':
        output.push({
          type: 'code',
          language: node.lang?.trim() || null,
          value: node.value ?? '',
        });
        break;
      case 'table':
        output.push({
          type: 'table',
          align: node.align ?? [],
          rows: (node.children ?? []).map((row, index) => ({
            header: index === 0,
            cells: (row.children ?? []).map((cell) =>
              mapInlines(cell.children ?? []),
            ),
          })),
        });
        break;
      case 'thematicBreak':
        output.push({ type: 'divider' });
        break;
      default:
        break;
    }
  }
  return output;
}

function mapInlines(
  nodes: MarkdownNode[],
  style: ExportTextStyle = {},
): ExportInline[] {
  const output: ExportInline[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!node) continue;

    if (node.type === 'html') {
      const spanStyle = parseStyleSpan(node.value ?? '');
      if (spanStyle) {
        const closingIndex = findClosingSpan(nodes, index + 1);
        if (closingIndex >= 0) {
          output.push(
            ...mapInlines(nodes.slice(index + 1, closingIndex), {
              ...style,
              ...spanStyle,
            }),
          );
          index = closingIndex;
        }
      }
      continue;
    }

    switch (node.type) {
      case 'text':
        if (node.value) output.push({ type: 'text', text: node.value, ...style });
        break;
      case 'strong':
        output.push(...mapInlines(node.children ?? [], { ...style, bold: true }));
        break;
      case 'emphasis':
        output.push(...mapInlines(node.children ?? [], { ...style, italic: true }));
        break;
      case 'delete':
        output.push(...mapInlines(node.children ?? [], { ...style, strike: true }));
        break;
      case 'inlineCode':
        output.push({ type: 'inlineCode', text: node.value ?? '' });
        break;
      case 'break':
        output.push({ type: 'break' });
        break;
      case 'link': {
        const children = mapInlines(node.children ?? [], style);
        output.push({
          type: 'link',
          text: inlineText(children),
          url: node.url ?? '',
          title: node.title ?? null,
          children,
        });
        break;
      }
      case 'image':
        output.push({
          type: 'image',
          alt: node.alt ?? '',
          url: node.url ?? '',
          title: node.title ?? null,
          external: isExternalUrl(node.url ?? ''),
        });
        break;
      default:
        output.push(...mapInlines(node.children ?? [], style));
        break;
    }
  }
  return output;
}

function extractAlert(blocks: ExportBlock[]): string | null {
  const first = blocks[0];
  if (first?.type !== 'paragraph') return null;
  const firstInline = first.children[0];
  if (firstInline?.type !== 'text') return null;
  const match = firstInline.text.match(/^\[!([A-Z]+)\](?:\s*\n)?/);
  if (!match) return null;

  firstInline.text = firstInline.text.slice(match[0].length);
  if (!firstInline.text) first.children.shift();
  if (!first.children.length) blocks.shift();
  return match[1] ?? null;
}

function parseStyleSpan(value: string): ExportTextStyle | undefined {
  const match = value.match(styleSpanOpen);
  if (!match) return undefined;
  const attributes = match[1] ?? '';
  const declaration =
    attributes.match(/\bstyle\s*=\s*"([^"]*)"/i)?.[1] ??
    attributes.match(/\bstyle\s*=\s*'([^']*)'/i)?.[1];
  if (!declaration) return undefined;

  const style: ExportTextStyle = {};
  for (const rule of declaration.split(';')) {
    const [rawName, ...rawValueParts] = rule.split(':');
    const name = rawName?.trim().toLowerCase();
    const value = rawValueParts.join(':').trim();
    if (!isSafeColor(value)) continue;
    if (name === 'color') style.color = value;
    if (name === 'background' || name === 'background-color') {
      style.backgroundColor = value;
    }
  }
  return Object.keys(style).length ? style : undefined;
}

function findClosingSpan(nodes: MarkdownNode[], from: number): number {
  let depth = 1;
  for (let index = from; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node?.type !== 'html') continue;
    if (styleSpanOpen.test(node.value ?? '')) depth += 1;
    if (styleSpanClose.test(node.value ?? '')) depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function isSafeColor(value: string): boolean {
  return Boolean(
    value &&
      value.length <= 48 &&
      !/[;<>{}]/.test(value) &&
      !/url\s*\(/i.test(value),
  );
}

function inlineText(inlines: ExportInline[]): string {
  return inlines
    .map((inline) => {
      if (inline.type === 'text' || inline.type === 'inlineCode') return inline.text;
      if (inline.type === 'link') return inline.text;
      if (inline.type === 'image') return inline.alt;
      return '\n';
    })
    .join('');
}

function isExternalUrl(url: string): boolean {
  return /^(?:https?:)?\/\//i.test(url);
}

function clampHeadingDepth(depth: number | undefined): number {
  return Math.max(1, Math.min(5, depth ?? 1));
}
