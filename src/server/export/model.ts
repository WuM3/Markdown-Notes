export interface ExportTextStyle {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  color?: string;
  backgroundColor?: string;
}

export type ExportInline =
  | ({ type: 'text'; text: string } & ExportTextStyle)
  | { type: 'inlineCode'; text: string }
  | {
      type: 'link';
      text: string;
      url: string;
      title: string | null;
      children: ExportInline[];
    }
  | {
      type: 'image';
      alt: string;
      url: string;
      title: string | null;
      external: boolean;
    }
  | { type: 'break' };

export interface ExportListItem {
  checked: boolean | null;
  blocks: ExportBlock[];
}

export type ExportBlock =
  | { type: 'paragraph'; children: ExportInline[] }
  | { type: 'heading'; level: number; children: ExportInline[] }
  | {
      type: 'list';
      ordered: boolean;
      start: number | null;
      items: ExportListItem[];
    }
  | { type: 'quote'; alert: string | null; blocks: ExportBlock[] }
  | { type: 'code'; language: string | null; value: string }
  | {
      type: 'table';
      align: Array<'left' | 'center' | 'right' | null>;
      rows: Array<{
        header: boolean;
        cells: ExportInline[][];
      }>;
    }
  | {
      type: 'image';
      alt: string;
      url: string;
      title: string | null;
      external: boolean;
    }
  | { type: 'divider' };

export interface ExportDocumentModel {
  id: string;
  title: string;
  createdAt: string;
  blocks: ExportBlock[];
}
