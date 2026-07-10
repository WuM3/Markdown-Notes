import {
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type FileChild,
  type ParagraphChild,
} from 'docx';
import type {
  ExportBlock,
  ExportDocumentModel,
  ExportInline,
  ExportTextStyle,
} from './model.js';
import type { ExportAssetLoader } from './assets.js';

const pageContentWidth = 620;

export async function renderDocxExport(
  model: ExportDocumentModel,
  assets: ExportAssetLoader,
): Promise<Buffer> {
  const children: FileChild[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: model.title, bold: true })],
      spacing: { after: 320 },
    }),
  ];
  for (const block of model.blocks) {
    children.push(...(await renderBlock(block, assets, 0)));
  }

  const document = new Document({
    creator: '个人笔记',
    title: model.title,
    sections: [{ children }],
  });
  return Packer.toBuffer(document);
}

async function renderBlock(
  block: ExportBlock,
  assets: ExportAssetLoader,
  depth: number,
): Promise<FileChild[]> {
  switch (block.type) {
    case 'paragraph':
      return [new Paragraph({
        children: await renderInlines(block.children, assets),
        spacing: { after: 140, line: 320 },
        indent: depth ? { left: depth * 360 } : undefined,
      })];
    case 'heading':
      return [new Paragraph({
        heading: headingLevel(block.level),
        children: await renderInlines(block.children, assets),
        spacing: { before: 260, after: 120 },
      })];
    case 'divider':
      return [new Paragraph({
        border: {
          bottom: { color: 'D9DEE7', size: 6, style: BorderStyle.SINGLE },
        },
        spacing: { before: 120, after: 180 },
      })];
    case 'code':
      return [new Paragraph({
        children: [
          new TextRun({
            text: block.language ? `${block.language}\n${block.value}` : block.value,
            font: 'Consolas',
            size: 20,
            break: 0,
          }),
        ],
        shading: { fill: 'F4F6F8', type: ShadingType.CLEAR },
        border: {
          top: border(),
          bottom: border(),
          left: border(),
          right: border(),
        },
        spacing: { before: 120, after: 180, line: 280 },
      })];
    case 'quote': {
      const output: FileChild[] = [];
      if (block.alert) {
        output.push(new Paragraph({
          children: [new TextRun({ text: block.alert, bold: true, color: '2458B8' })],
          indent: { left: 280 },
        }));
      }
      for (const child of block.blocks) {
        if (child.type === 'list') {
          for (let index = 0; index < child.items.length; index += 1) {
            const item = child.items[index];
            if (!item) continue;
            const marker = child.ordered
              ? `${(child.start ?? 1) + index}. `
              : '• ';
            output.push(quoteParagraph(
              `${marker}${item.blocks.map(paragraphText).join(' ')}`,
            ));
          }
          continue;
        }
        output.push(quoteParagraph(paragraphText(child)));
      }
      return output;
    }
    case 'list': {
      const output: FileChild[] = [];
      for (let index = 0; index < block.items.length; index += 1) {
        const item = block.items[index];
        if (!item) continue;
        const marker =
          item.checked === true
            ? '☑ '
            : item.checked === false
              ? '☐ '
              : block.ordered
                ? `${(block.start ?? 1) + index}. `
                : '• ';
        const [first, ...rest] = item.blocks;
        if (first?.type === 'paragraph') {
          output.push(new Paragraph({
            children: [
              new TextRun({ text: marker }),
              ...(await renderInlines(first.children, assets)),
            ],
            indent: { left: (depth + 1) * 360, hanging: 240 },
            spacing: { after: 80, line: 300 },
          }));
        } else if (first) {
          output.push(...(await renderBlock(first, assets, depth + 1)));
        }
        for (const nested of rest) {
          output.push(...(await renderBlock(nested, assets, depth + 1)));
        }
      }
      return output;
    }
    case 'table':
      return [new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: block.rows.map((row) =>
          new TableRow({
            children: row.cells.map((cell) =>
              new TableCell({
                shading: row.header
                  ? { fill: 'EAF0FA', type: ShadingType.CLEAR }
                  : undefined,
                children: [
                  new Paragraph({
                    children: cell.map(tableInlineToTextRun),
                  }),
                ],
              }),
            ),
          }),
        ),
      })];
    case 'image': {
      const image = block.external ? undefined : await assets.loadImage(block.url);
      if (!image) {
        return [imageFallback(block.alt, block.url)];
      }
      const scale = Math.min(1, pageContentWidth / image.width);
      return [new Paragraph({
        children: [
          new ImageRun({
            type: 'png',
            data: image.data,
            transformation: {
              width: Math.max(1, Math.round(image.width * scale)),
              height: Math.max(1, Math.round(image.height * scale)),
            },
            altText: {
              name: block.alt || '图片',
              description: block.alt || '图片',
              title: block.title ?? undefined,
            },
          }),
        ],
        spacing: { before: 120, after: 160 },
      })];
  }
}
}

async function renderInlines(
  inlines: ExportInline[],
  assets: ExportAssetLoader,
): Promise<ParagraphChild[]> {
  const output: ParagraphChild[] = [];
  for (const inline of inlines) {
    if (inline.type === 'image') {
      const image = inline.external ? undefined : await assets.loadImage(inline.url);
      if (!image) {
        output.push(new TextRun({ text: `[图片: ${inline.alt || inline.url}]` }));
        continue;
      }
      const scale = Math.min(1, pageContentWidth / image.width);
      output.push(new ImageRun({
        type: 'png',
        data: image.data,
        transformation: {
          width: Math.max(1, Math.round(image.width * scale)),
          height: Math.max(1, Math.round(image.height * scale)),
        },
      }));
      continue;
    }
    if (inline.type === 'link') {
      output.push(new ExternalHyperlink({
        link: inline.url,
        children: [new TextRun({
          text: inline.text || inline.url,
          color: '2563EB',
          underline: {},
        })],
      }));
      continue;
    }
    output.push(inlineToTextRun(inline));
  }
  return output;
}

function inlineToTextRun(inline: Exclude<ExportInline, { type: 'image' }>): TextRun {
  if (inline.type === 'break') return new TextRun({ break: 1 });
  if (inline.type === 'link') {
    return new TextRun({ text: inline.text || inline.url, color: '2563EB' });
  }
  if (inline.type === 'inlineCode') {
    return new TextRun({
      text: inline.text,
      font: 'Consolas',
      shading: { fill: 'EEF1F4', type: ShadingType.CLEAR },
    });
  }
  return textRun(inline.text, inline);
}

function textRun(text: string, style: ExportTextStyle): TextRun {
  return new TextRun({
    text,
    bold: style.bold,
    italics: style.italic,
    strike: style.strike,
    color: hexColor(style.color),
    shading: style.backgroundColor
      ? { fill: hexColor(style.backgroundColor), type: ShadingType.CLEAR }
      : undefined,
  });
}

function imageFallback(alt: string, url: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({
      text: `[图片不可用: ${alt || url}]`,
      italics: true,
      color: '6B7280',
    })],
  });
}

function quoteParagraph(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text })],
    border: {
      left: {
        color: '78A7EB',
        size: 18,
        space: 8,
        style: BorderStyle.SINGLE,
      },
    },
    shading: { fill: 'F3F6FB', type: ShadingType.CLEAR },
    indent: { left: 280 },
    spacing: { after: 100, line: 300 },
  });
}

function headingLevel(level: number) {
  return [
    HeadingLevel.HEADING_1,
    HeadingLevel.HEADING_2,
    HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4,
    HeadingLevel.HEADING_5,
  ][Math.max(0, Math.min(4, level - 1))] ?? HeadingLevel.HEADING_1;
}

function border() {
  return { color: 'D8E0EC', size: 4, style: BorderStyle.SINGLE };
}

function hexColor(value: string | undefined): string | undefined {
  const match = value?.match(/^#([0-9a-f]{6})$/i);
  return match?.[1]?.toUpperCase();
}

function paragraphText(block: ExportBlock): string {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
      return block.children.map(inlinePlainText).join('');
    case 'code':
      return block.value;
    case 'quote':
      return block.blocks.map(paragraphText).join('\n');
    case 'list':
      return block.items
        .flatMap((item) => item.blocks.map(paragraphText))
        .join('\n');
    case 'table':
      return block.rows
        .flatMap((row) => row.cells.map((cell) => cell.map(inlinePlainText).join('')))
        .join('\n');
    case 'image':
      return block.alt || block.url;
    case 'divider':
      return '';
  }
}

function tableInlineToTextRun(inline: ExportInline): TextRun {
  if (inline.type === 'image') {
    return new TextRun({ text: `[图片: ${inline.alt || inline.url}]` });
  }
  return inlineToTextRun(inline);
}

function inlinePlainText(inline: ExportInline): string {
  if (inline.type === 'break') return '\n';
  if (inline.type === 'image') return inline.alt || inline.url;
  if (inline.type === 'link') return inline.text || inline.url;
  return inline.text;
}
