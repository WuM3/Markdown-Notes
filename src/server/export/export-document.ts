import type {
  ExportDocumentRequest,
  ExportFormat,
} from '../../shared/types.js';
import { sanitizeNodeName } from '../domain/paths.js';
import type { NotesRepository } from '../repository.js';
import { createExportAssetLoader } from './assets.js';
import { parseExportDocument } from './parse-markdown.js';
import { renderDocxExport } from './render-docx.js';
import { renderMarkdownExport } from './render-markdown.js';
import {
  renderPdfExport,
  type PdfFontCandidate,
} from './render-pdf.js';

export interface ExportedDocument {
  data: Buffer;
  contentType: string;
  fileName: string;
}

export class ExportRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
    readonly code = 'BAD_REQUEST',
  ) {
    super(message);
  }
}

export async function exportDocument(input: {
  repository: NotesRepository;
  documentId: string;
  request: ExportDocumentRequest;
  fontCandidates?: PdfFontCandidate[];
}): Promise<ExportedDocument> {
  validateExportRequest(input.request);
  const current = await input.repository.getDocument(input.documentId);
  const format = input.request.format;
  const fileName = `${safeExportName(input.request.title)}.${format}`;

  if (format === 'md') {
    return {
      data: renderMarkdownExport({
        id: current.id,
        title: input.request.title.trim(),
        createdAt: current.createdAt,
        content: input.request.content,
      }),
      contentType: 'text/markdown; charset=utf-8',
      fileName,
    };
  }

  const model = parseExportDocument({
    id: current.id,
    title: input.request.title.trim(),
    createdAt: current.createdAt,
    markdown: input.request.content,
  });
  const assets = createExportAssetLoader(input.repository, current.id);
  if (format === 'docx') {
    return {
      data: await renderDocxExport(model, assets),
      contentType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileName,
    };
  }

  return {
    data: await renderPdfExport(model, assets, input.fontCandidates),
    contentType: 'application/pdf',
    fileName,
  };
}

export function validateExportRequest(
  request: Partial<ExportDocumentRequest>,
): asserts request is ExportDocumentRequest {
  if (
    !isExportFormat(request.format) ||
    typeof request.title !== 'string' ||
    !request.title.trim() ||
    Array.from(request.title).length > 200 ||
    typeof request.content !== 'string'
  ) {
    throw new ExportRequestError('导出参数无效');
  }
  if (Buffer.byteLength(request.content, 'utf8') > 10 * 1024 * 1024) {
    throw new ExportRequestError(
      '文档内容超过导出限制',
      413,
      'PAYLOAD_TOO_LARGE',
    );
  }
}

function isExportFormat(format: unknown): format is ExportFormat {
  return format === 'md' || format === 'docx' || format === 'pdf';
}

function safeExportName(title: string): string {
  return sanitizeNodeName(title.trim().replace(/\.(?:md|docx|pdf)$/i, ''));
}
