import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type WheelEvent,
} from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  AlertCircle,
  Check,
  Download,
  FileUp,
  FileText,
  Highlighter,
  ImagePlus,
  ListTree,
  LoaderCircle,
  Menu,
  Paperclip,
  Plus,
} from 'lucide-react';
import type { DocumentRecord } from '../../shared/types.js';
import type { ExportFormat } from '../../shared/types.js';
import { ApiError, notesApi } from '../api.js';
import { downloadCurrentDocument } from '../export/download-document.js';
import { DebouncedSaver, type SaveStatus } from './autosave.js';
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from './MarkdownEditor.js';
import { assetMarkdownPath } from './asset-paths.js';
import { DocumentOutline } from './DocumentOutline.js';
import {
  buildOutlineTree,
  parseMarkdownHeadings,
  resolveActiveHeadingId,
} from './document-outline.js';

const headingSelector =
  '.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5';
const activeHeadingAnchorOffset = 72;

export interface DraftDocument {
  title: string;
  content: string;
}

interface DocumentEditorProps {
  document: DocumentRecord;
  onSaved: (document: DocumentRecord) => void;
  onConflict: (current: DocumentRecord, draft: DraftDocument) => void;
  onOpenSidebar: () => void;
}

export function DocumentEditor({
  document,
  onSaved,
  onConflict,
  onOpenSidebar,
}: DocumentEditorProps) {
  const documentSyncKey = `${document.id}:${document.revision}`;
  const [titleState, setTitleState] = useState(() => ({
    syncKey: documentSyncKey,
    value: document.title,
  }));
  const [outlineState, setOutlineState] = useState(() => ({
    syncKey: documentSyncKey,
    headings: parseMarkdownHeadings(document.content),
  }));
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outlineCollapsed, setOutlineCollapsed] = useState(false);
  const [activeHeadingId, setActiveHeadingId] = useState<string>();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  let title = titleState.value;
  let outlineHeadings = outlineState.headings;
  if (titleState.syncKey !== documentSyncKey) {
    title = document.title;
    setTitleState({ syncKey: documentSyncKey, value: document.title });
  }
  if (outlineState.syncKey !== documentSyncKey) {
    outlineHeadings = parseMarkdownHeadings(document.content);
    setOutlineState({ syncKey: documentSyncKey, headings: outlineHeadings });
  }
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const revisionRef = useRef(document.revision);
  const titleRef = useRef(document.title);
  const titleDocumentIdRef = useRef(document.id);
  const markdownRef = useRef(document.content);
  const saverRef = useRef<DebouncedSaver<DraftDocument> | undefined>(undefined);
  const outlineTree = useMemo(
    () => buildOutlineTree(outlineHeadings),
    [outlineHeadings],
  );
  const documentCanvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    revisionRef.current = document.revision;
    markdownRef.current = document.content;
  }, [document.content, document.revision]);

  useEffect(() => {
    if (titleDocumentIdRef.current === document.id) return;
    titleDocumentIdRef.current = document.id;
    titleRef.current = document.title;
  }, [document.id, document.title]);

  useEffect(() => {
    const scroller = editorScrollRef.current;
    if (!scroller) return;

    let frame = 0;
    const updateActiveHeading = () => {
      frame = 0;
      const viewportTop =
        scroller.getBoundingClientRect().top + activeHeadingAnchorOffset;
      const headingElements = [
        ...scroller.querySelectorAll<HTMLElement>(headingSelector),
      ];
      const positions = headingElements
        .map((element, index) => {
          const heading = outlineHeadings[index];
          if (!heading) return undefined;
          return {
            id: heading.id,
            top: element.getBoundingClientRect().top,
          };
        })
        .filter((position): position is { id: string; top: number } =>
          Boolean(position),
        );
      const nextActiveId = resolveActiveHeadingId(positions, viewportTop);
      setActiveHeadingId((current) =>
        current === nextActiveId ? current : nextActiveId,
      );
    };
    const requestUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateActiveHeading);
    };

    updateActiveHeading();
    scroller.addEventListener('scroll', requestUpdate, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', requestUpdate);
    };
  }, [document.id, outlineHeadings]);

  useEffect(() => {
    const saver = new DebouncedSaver<DraftDocument>({
      delay: 800,
      retryDelay: 3_000,
      onStatus: setStatus,
      shouldRetry: (error) => !(error instanceof ApiError && error.status === 409),
      save: async (draft) => {
        try {
          const saved = await notesApi.saveDocument(document.id, {
            ...draft,
            revision: revisionRef.current,
          });
          revisionRef.current = saved.revision;
          onSaved(saved);
        } catch (error) {
          if (error instanceof ApiError && error.status === 409) {
            const body = error.body as { current?: DocumentRecord };
            if (body.current) onConflict(body.current, draft);
          }
          throw error;
        }
      },
    });
    saverRef.current = saver;
    return () => {
      void saver.flushNow();
      saverRef.current = undefined;
    };
  }, [document.id, onConflict, onSaved]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!saverRef.current?.hasPendingWork()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  function scheduleSave() {
    saverRef.current?.schedule({
      title: titleRef.current,
      content: markdownRef.current,
    });
  }

  function handleTitleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextTitle = event.target.value;
    setTitleState({ syncKey: documentSyncKey, value: nextTitle });
    titleRef.current = nextTitle;
    scheduleSave();
  }

  function handleMarkdownChange(markdown: string) {
    markdownRef.current = markdown;
    setOutlineState({
      syncKey: documentSyncKey,
      headings: parseMarkdownHeadings(markdown),
    });
    scheduleSave();
  }

  function scrollToHeading(index: number) {
    const heading = outlineHeadings[index];
    const headingElement =
      editorScrollRef.current?.querySelectorAll<HTMLElement>(headingSelector)[
        index
      ];
    if (!heading || !headingElement) return;

    setActiveHeadingId(heading.id);
    headingElement.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
    setOutlineOpen(false);
  }

  function handleOutlineWheel(event: WheelEvent<HTMLElement>) {
    const scroller = editorScrollRef.current;
    if (!scroller || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;

    const maxScrollTop = scroller.scrollHeight - scroller.clientHeight;
    if (maxScrollTop <= 0) return;

    const nextScrollTop = Math.min(
      maxScrollTop,
      Math.max(0, scroller.scrollTop + event.deltaY),
    );
    if (nextScrollTop === scroller.scrollTop) return;

    scroller.scrollTop = nextScrollTop;
    event.preventDefault();
  }

  async function handleAsset(file: File, image: boolean) {
    const asset = await notesApi.uploadAsset(document.id, file);
    const target = assetMarkdownPath(document.id, asset.name);
    const escapedName = file.name.replace(/[[\]]/g, '');
    editorRef.current?.appendMarkdown(
      image ? `![${escapedName}](${target})` : `[${escapedName}](${target})`,
    );
  }

  async function handleExport(format: ExportFormat) {
    if (exporting) return;
    setExporting(true);
    setExportError('');
    try {
      await downloadCurrentDocument({
        client: notesApi,
        documentId: document.id,
        request: {
          format,
          title,
          content: markdownRef.current,
        },
      });
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '导出失败');
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="editor-pane">
      <header className="editor-header">
        <button
          type="button"
          className="mobile-menu-button"
          aria-label="打开目录"
          data-tooltip="打开目录"
          onClick={onOpenSidebar}
        >
          <Menu size={20} />
        </button>
        <button
          type="button"
          className="mobile-outline-button"
          aria-label="打开文档目录"
          data-tooltip="文档目录"
          onClick={() => setOutlineOpen(true)}
        >
          <ListTree size={20} />
        </button>
        <div className="breadcrumbs">
          {document.parentPath || '根目录'}
          <span>/</span>
        </div>
        <SaveState status={status} />
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="insert-button export-button"
              aria-label="导出"
              data-tooltip="导出当前文档"
              disabled={exporting}
            >
              <Download size={16} />
              <span>{exporting ? '导出中' : '导出'}</span>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="menu-content"
              align="end"
              aria-label="导出格式"
            >
              <ExportMenuItem
                label="Markdown"
                extension="MD"
                disabled={exporting}
                onSelect={() => void handleExport('md')}
              />
              <ExportMenuItem
                label="Word"
                extension="DOCX"
                disabled={exporting}
                onSelect={() => void handleExport('docx')}
              />
              <ExportMenuItem
                label="PDF"
                extension="PDF"
                disabled={exporting}
                onSelect={() => void handleExport('pdf')}
              />
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <button type="button" className="insert-button">
              <Plus size={16} /> 插入
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu-content" align="end">
              <DropdownMenu.Item
                className="menu-item"
                onSelect={() => imageInputRef.current?.click()}
              >
                <ImagePlus size={16} /> 图片
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="menu-item"
                onSelect={() => attachmentInputRef.current?.click()}
              >
                <Paperclip size={16} /> 附件
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="menu-item"
                onSelect={() =>
                  editorRef.current?.appendMarkdown(
                    '> [!NOTE]\n> 在这里输入高亮内容',
                  )
                }
              >
                <Highlighter size={16} /> 高亮块
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        {exportError && (
          <div className="export-error" role="alert">
            {exportError}
          </div>
        )}
      </header>
      <div className="editor-body">
        <div className="editor-scroll" ref={editorScrollRef}>
          <div
            ref={documentCanvasRef}
            className={`document-canvas ${
              outlineCollapsed ? 'outline-collapsed' : ''
            }`}
          >
            <DocumentOutline
              collapsed={outlineCollapsed}
              nodes={outlineTree}
              activeId={activeHeadingId}
              onCollapsedChange={setOutlineCollapsed}
              onNavigate={scrollToHeading}
              onWheel={handleOutlineWheel}
            />
            <div className="document-surface">
              <input
                className="document-title"
                aria-label="文档标题"
                value={title}
                onChange={handleTitleChange}
                placeholder="未命名文档"
              />
              <MarkdownEditor
                ref={editorRef}
                document={document}
                marqueeRootRef={documentCanvasRef}
                onChange={handleMarkdownChange}
              />
            </div>
          </div>
        </div>
      </div>
      {outlineOpen && (
        <div className="document-outline-drawer">
          <button
            type="button"
            className="document-outline-backdrop"
            aria-label="关闭文档目录"
            onClick={() => setOutlineOpen(false)}
          />
          <div className="document-outline-sheet">
            <DocumentOutline
              compact
              nodes={outlineTree}
              activeId={activeHeadingId}
              onClose={() => setOutlineOpen(false)}
              onNavigate={scrollToHeading}
            />
          </div>
        </div>
      )}
      <div className="mobile-editor-toolbar">
        <button type="button" onClick={() => imageInputRef.current?.click()}>
          <ImagePlus size={19} />
          <span>图片</span>
        </button>
        <button type="button" onClick={() => attachmentInputRef.current?.click()}>
          <FileUp size={19} />
          <span>附件</span>
        </button>
        <button
          type="button"
          onClick={() =>
            editorRef.current?.appendMarkdown('> [!NOTE]\n> 在这里输入高亮内容')
          }
        >
          <Highlighter size={19} />
          <span>高亮</span>
        </button>
      </div>
      <input
        ref={imageInputRef}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleAsset(file, true);
          event.target.value = '';
        }}
      />
      <input
        ref={attachmentInputRef}
        hidden
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleAsset(file, false);
          event.target.value = '';
        }}
      />
    </section>
  );
}

function ExportMenuItem({
  label,
  extension,
  disabled,
  onSelect,
}: {
  label: string;
  extension: string;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item
      className="menu-item export-menu-item"
      aria-label={label}
      disabled={disabled}
      onSelect={onSelect}
    >
      <FileText size={16} />
      <span>{label}</span>
      <small>{extension}</small>
    </DropdownMenu.Item>
  );
}

function SaveState({ status }: { status: SaveStatus }) {
  const content = {
    pending: { icon: LoaderCircle, text: '等待保存' },
    saving: { icon: LoaderCircle, text: '保存中' },
    saved: { icon: Check, text: '已保存' },
    error: { icon: AlertCircle, text: '保存失败，正在重试' },
  }[status];
  const Icon = content.icon;
  return (
    <div className={`save-state ${status}`}>
      <Icon size={14} className={status === 'saving' ? 'spinning' : ''} />
      <span>{content.text}</span>
    </div>
  );
}
