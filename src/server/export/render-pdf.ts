import { existsSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import type { ExportBlock, ExportDocumentModel, ExportInline } from './model.js';
import type { ExportAssetLoader } from './assets.js';

export interface PdfFontCandidate {
  path: string;
  family?: string;
}

const defaultFontCandidates: PdfFontCandidate[] = [
  { path: 'C:\\Windows\\Fonts\\msyh.ttf' },
  { path: 'C:\\Windows\\Fonts\\Deng.ttf' },
  { path: 'C:\\Windows\\Fonts\\msyh.ttc', family: 'Microsoft YaHei' },
  { path: 'C:\\Windows\\Fonts\\simsun.ttc', family: 'SimSun' },
];

export class ExportFontMissingError extends Error {
  readonly code = 'EXPORT_FONT_MISSING';
  constructor() {
    super('未找到可用的中文 PDF 字体');
  }
}

export async function renderPdfExport(
  model: ExportDocumentModel,
  assets: ExportAssetLoader,
  fontCandidates: PdfFontCandidate[] = defaultFontCandidates,
): Promise<Buffer> {
  const document = new PDFDocument({
    size: 'A4',
    margins: { top: 54, right: 54, bottom: 58, left: 54 },
    bufferPages: true,
    info: { Title: model.title, Creator: '个人笔记' },
  });
  const chunks: Buffer[] = [];
  document.on('data', (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    document.once('end', () => resolve(Buffer.concat(chunks)));
    document.once('error', reject);
  });

  let fontLoaded = false;
  for (const font of fontCandidates) {
    if (!existsSync(font.path)) continue;
    try {
      if (font.family) {
        document.font(font.path, font.family);
      } else {
        document.font(font.path);
      }
      fontLoaded = true;
      break;
    } catch {
      // Continue through the configured fallbacks when a font is corrupt
      // or its collection family is unavailable.
    }
  }
  if (!fontLoaded && containsNonAscii(model)) {
    document.end();
    throw new ExportFontMissingError();
  }
  if (!fontLoaded) {
    document.font('Helvetica');
  }

  document.fontSize(26).fillColor('#111827').text(model.title, {
    paragraphGap: 18,
  });
  for (const block of model.blocks) {
    await renderBlock(document, block, assets, 0);
  }

  const range = document.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    document.switchToPage(range.start + index);
    document
      .fontSize(9)
      .fillColor('#6B7280')
      .text(
        `${index + 1} / ${range.count}`,
        54,
        document.page.height - 38,
        { width: document.page.width - 108, align: 'center' },
      );
  }
  document.end();
  return completed;
}

async function renderBlock(
  pdf: PDFKit.PDFDocument,
  block: ExportBlock,
  assets: ExportAssetLoader,
  depth: number,
): Promise<void> {
  ensureSpace(pdf, 40);
  switch (block.type) {
    case 'paragraph':
      renderInlineText(pdf, block.children, { size: 11, indent: depth * 18 });
      return;
    case 'heading':
      pdf
        .moveDown(0.45)
        .fontSize(Math.max(13, 23 - block.level * 2))
        .fillColor('#111827')
        .text(inlineText(block.children), { paragraphGap: 8 });
      return;
    case 'divider':
      pdf
        .moveDown(0.5)
        .strokeColor('#D9DEE7')
        .moveTo(pdf.page.margins.left, pdf.y)
        .lineTo(pdf.page.width - pdf.page.margins.right, pdf.y)
        .stroke()
        .moveDown(0.7);
      return;
    case 'code':
      ensureSpace(pdf, 64);
      pdf
        .fontSize(8.8)
        .fillColor('#1F2937')
        .text(block.language ? `[${block.language}]\n${block.value}` : block.value, {
          width: writableWidth(pdf) - 20,
          indent: 10,
          paragraphGap: 10,
          lineGap: 2,
        });
      return;
    case 'quote':
      pdf
        .fontSize(10.5)
        .fillColor('#374151')
        .text(
          `${block.alert ? `${block.alert}\n` : ''}${block.blocks.map(blockText).join('\n')}`,
          { indent: 16 + depth * 12, paragraphGap: 10 },
        );
      return;
    case 'list':
      for (let index = 0; index < block.items.length; index += 1) {
        const item = block.items[index];
        if (!item) continue;
        const marker =
          item.checked === true
            ? '☑'
            : item.checked === false
              ? '☐'
              : block.ordered
                ? `${(block.start ?? 1) + index}.`
                : '•';
        pdf
          .fontSize(10.5)
          .fillColor('#1F2937')
          .text(`${marker} ${item.blocks.map(blockText).join(' ')}`, {
            indent: (depth + 1) * 18,
            paragraphGap: 4,
          });
      }
      return;
    case 'table': {
      const columnCount = Math.max(1, ...block.rows.map((row) => row.cells.length));
      const cellWidth = writableWidth(pdf) / columnCount;
      for (const row of block.rows) {
        const values = row.cells.map((cell) => inlineText(cell));
        const heights = values.map((value) =>
          pdf.heightOfString(value || ' ', { width: cellWidth - 10 }),
        );
        const rowHeight = Math.max(24, ...heights) + 8;
        ensureSpace(pdf, rowHeight);
        const rowY = pdf.y;
        values.forEach((value, index) => {
          const x = pdf.page.margins.left + index * cellWidth;
          pdf
            .rect(x, rowY, cellWidth, rowHeight)
            .fillAndStroke(row.header ? '#EAF0FA' : '#FFFFFF', '#CBD5E1')
            .fillColor('#1F2937')
            .fontSize(9)
            .text(value, x + 5, rowY + 5, {
              width: cellWidth - 10,
              height: rowHeight - 10,
            });
        });
        pdf.y = rowY + rowHeight;
      }
      pdf.moveDown(0.7);
      return;
    }
    case 'image': {
      const image = block.external ? undefined : await assets.loadImage(block.url);
      if (!image) {
        pdf
          .fontSize(10)
          .fillColor('#6B7280')
          .text(`[图片不可用: ${block.alt || block.url}]`, { paragraphGap: 8 });
        return;
      }
      const maxWidth = writableWidth(pdf);
      const maxHeight = pdf.page.height - pdf.page.margins.top - pdf.page.margins.bottom;
      const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      ensureSpace(pdf, height + 16);
      pdf.image(image.data, {
        fit: [width, height],
        align: 'center',
      });
      pdf.y += height + 12;
      return;
    }
  }
}

function renderInlineText(
  pdf: PDFKit.PDFDocument,
  inlines: ExportInline[],
  options: { size: number; indent: number },
): void {
  pdf.fontSize(options.size).fillColor('#1F2937');
  for (let index = 0; index < inlines.length; index += 1) {
    const inline = inlines[index];
    if (!inline) continue;
    const continued = index < inlines.length - 1;
    if (inline.type === 'break') {
      pdf.text('\n', { continued });
      continue;
    }
    const text =
      inline.type === 'image'
        ? `[图片: ${inline.alt || inline.url}]`
        : inline.type === 'link'
          ? inline.text || inline.url
          : inline.text;
    const color =
      inline.type === 'text' && inline.color
        ? inline.color
        : inline.type === 'link'
          ? '#2563EB'
          : '#1F2937';
    pdf.fillColor(color).text(text, {
      continued,
      indent: index === 0 ? options.indent : 0,
      link: inline.type === 'link' ? inline.url : undefined,
      underline: inline.type === 'link',
    });
  }
  pdf.fillColor('#1F2937').moveDown(0.55);
}

function ensureSpace(pdf: PDFKit.PDFDocument, height: number): void {
  const bottom = pdf.page.height - pdf.page.margins.bottom;
  if (pdf.y + height > bottom) pdf.addPage();
}

function writableWidth(pdf: PDFKit.PDFDocument): number {
  return pdf.page.width - pdf.page.margins.left - pdf.page.margins.right;
}

function containsNonAscii(model: ExportDocumentModel): boolean {
  return Array.from(
    `${model.title}\n${model.blocks.map(blockText).join('\n')}`,
  ).some((character) => (character.codePointAt(0) ?? 0) > 127);
}

function blockText(block: ExportBlock): string {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
      return inlineText(block.children);
    case 'code':
      return block.value;
    case 'quote':
      return block.blocks.map(blockText).join('\n');
    case 'list':
      return block.items.flatMap((item) => item.blocks.map(blockText)).join('\n');
    case 'table':
      return block.rows.flatMap((row) => row.cells.map(inlineText)).join('\n');
    case 'image':
      return block.alt;
    case 'divider':
      return '';
  }
}

function inlineText(inlines: ExportInline[]): string {
  return inlines
    .map((inline) => {
      if (inline.type === 'break') return '\n';
      if (inline.type === 'image') return inline.alt;
      if (inline.type === 'link') return inline.text;
      return inline.text;
    })
    .join('');
}
