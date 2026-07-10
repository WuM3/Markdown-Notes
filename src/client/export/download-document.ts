import type {
  ExportDocumentRequest,
  ExportFormat,
} from '../../shared/types.js';

interface ExportClient {
  exportDocument: (
    documentId: string,
    request: ExportDocumentRequest,
  ) => Promise<{ blob: Blob; contentDisposition: string | null }>;
}

export async function downloadCurrentDocument(input: {
  client: ExportClient;
  documentId: string;
  request: ExportDocumentRequest;
  document?: Document;
}): Promise<string> {
  const ownerDocument = input.document ?? globalThis.document;
  const response = await input.client.exportDocument(
    input.documentId,
    input.request,
  );
  const fileName = exportFileName(
    response.contentDisposition,
    input.request.title,
    input.request.format,
  );
  const objectUrl = URL.createObjectURL(response.blob);
  try {
    const anchor = ownerDocument.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.hidden = true;
    ownerDocument.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
  return fileName;
}

export function exportFileName(
  contentDisposition: string | null,
  fallbackTitle: string,
  format: ExportFormat,
): string {
  const encoded = contentDisposition?.match(
    /filename\*\s*=\s*UTF-8''([^;]+)/i,
  )?.[1];
  if (encoded) {
    try {
      return sanitizeFileName(decodeURIComponent(encoded.trim()));
    } catch {
      // Fall through to the safe local title.
    }
  }

  const quoted = contentDisposition?.match(/filename\s*=\s*"([^"]+)"/i)?.[1];
  if (quoted) return sanitizeFileName(quoted);
  return `${sanitizeBaseName(fallbackTitle)}.${format}`;
}

function sanitizeFileName(value: string): string {
  const extension = value.match(/\.(md|docx|pdf)$/i)?.[0].toLowerCase() ?? '';
  const base = extension ? value.slice(0, -extension.length) : value;
  return `${sanitizeBaseName(base)}${extension}`;
}

function sanitizeBaseName(value: string): string {
  let result = Array.from(value, (character) =>
    (character.codePointAt(0) ?? 0) <= 31 ? '_' : character,
  )
    .join('')
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/[.\s]+$/g, '')
    .trim();
  if (!result) result = '未命名文档';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(result)) {
    result += '_';
  }
  return result.slice(0, 180);
}
