import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { FilePlus2, Menu, NotebookPen } from 'lucide-react';
import type { DocumentRecord, TreeNode } from '../shared/types.js';
import { notesApi } from './api.js';
import { ActionDialog, ConfirmDialog } from './components/ActionDialog.js';
import { GlobalTooltip } from './components/GlobalTooltip.js';
import { NavRail, type AppView } from './components/NavRail.js';
import { TreePanel } from './components/TreePanel.js';
import {
  DocumentEditor,
  type DraftDocument,
} from './editor/DocumentEditor.js';
import { RecentView } from './views/RecentView.js';
import { SearchView } from './views/SearchView.js';
import { TrashView } from './views/TrashView.js';

type DialogState =
  | { kind: 'document'; parentPath: string }
  | { kind: 'folder'; parentPath: string }
  | { kind: 'rename'; node: TreeNode }
  | null;

interface ConflictState {
  current: DocumentRecord;
  draft: DraftDocument;
}

export interface AppHandle {
  handleBack: () => boolean;
}

interface AppProps {
  onOpenServerSettings?: () => void;
}

export const App = forwardRef<AppHandle, AppProps>(function App(
  { onOpenServerSettings },
  ref,
) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [view, setView] = useState<AppView>('notes');
  const [document, setDocument] = useState<DocumentRecord>();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleteNode, setDeleteNode] = useState<TreeNode>();
  const [conflict, setConflict] = useState<ConflictState>();
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [error, setError] = useState('');

  useImperativeHandle(
    ref,
    () => ({
      handleBack() {
        if (conflict) {
          setConflict(undefined);
          return true;
        }
        if (deleteNode) {
          setDeleteNode(undefined);
          return true;
        }
        if (dialog) {
          setDialog(null);
          return true;
        }
        if (drawerOpen) {
          setDrawerOpen(false);
          return true;
        }
        if (view !== 'notes') {
          setView('notes');
          return true;
        }
        return false;
      },
    }),
    [conflict, deleteNode, dialog, drawerOpen, view],
  );

  const reloadTree = useCallback(async () => {
    setTree(await notesApi.tree());
  }, []);

  useEffect(() => {
    void notesApi
      .tree()
      .then(setTree)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const openDocument = useCallback(async (id: string) => {
    setView('notes');
    setDrawerOpen(false);
    setDocument(await notesApi.document(id));
  }, []);

  const handleSaved = useCallback(
    (saved: DocumentRecord) => {
      setDocument(saved);
      void reloadTree();
    },
    [reloadTree],
  );

  const handleConflict = useCallback(
    (current: DocumentRecord, draft: DraftDocument) =>
      setConflict({ current, draft }),
    [],
  );

  const handleMove = useCallback(
    async (node: TreeNode, targetParentPath: string) => {
      await notesApi.moveNode({
        kind: node.kind,
        path: node.path,
        targetParentPath,
      });
      await reloadTree();
      if (document) {
        setDocument(await notesApi.document(document.id));
      }
    },
    [document, reloadTree],
  );

  async function submitDialog(value: string) {
    if (!dialog) return;
    if (dialog.kind === 'document') {
      const created = await notesApi.createDocument({
        parentPath: dialog.parentPath,
        title: value,
      });
      await reloadTree();
      setDocument(created);
      setView('notes');
      setDrawerOpen(false);
      return;
    }
    if (dialog.kind === 'folder') {
      await notesApi.createFolder({
        parentPath: dialog.parentPath,
        name: value,
      });
      await reloadTree();
      setDrawerOpen(false);
      return;
    }

    const parentPath = parentOf(dialog.node.path);
    const moved = await notesApi.moveNode({
      kind: dialog.node.kind,
      path: dialog.node.path,
      targetParentPath: parentPath,
      newName: value,
    });
    await reloadTree();
    if (dialog.node.kind === 'document' && document?.id === dialog.node.id) {
      setDocument(moved as DocumentRecord);
    }
  }

  async function confirmDelete() {
    if (!deleteNode) return;
    await notesApi.deleteNode({
      kind: deleteNode.kind,
      path: deleteNode.path,
    });
    if (deleteNode.kind === 'document' && document?.id === deleteNode.id) {
      setDocument(undefined);
    }
    await reloadTree();
  }

  async function saveConflictCopy() {
    if (!conflict) return;
    const created = await notesApi.createDocument({
      parentPath: conflict.current.parentPath,
      title: `${conflict.draft.title} 冲突副本`,
    });
    const saved = await notesApi.saveDocument(created.id, {
      ...conflict.draft,
      title: created.title,
      revision: created.revision,
    });
    setConflict(undefined);
    setDocument(saved);
    await reloadTree();
  }

  const dialogPresentation = useMemo(() => {
    if (!dialog) return undefined;
    if (dialog.kind === 'document') {
      return {
        title: '新建文档',
        description: '文档会保存为当前目录中的 Markdown 文件。',
        label: '文档标题',
        defaultValue: '未命名文档',
      };
    }
    if (dialog.kind === 'folder') {
      return {
        title: '新建目录',
        description: '目录可以继续包含任意层级的子目录。',
        label: '目录名称',
        defaultValue: '新建目录',
      };
    }
    return {
      title: '重命名',
      description: '名称会同步修改硬盘上的目录或 Markdown 文件。',
      label: '新名称',
      defaultValue: dialog.node.name,
    };
  }, [dialog]);

  return (
    <div
      data-testid="app-shell"
      className={`app-shell ${drawerOpen ? 'drawer-open' : ''} ${
        treeCollapsed ? 'tree-collapsed' : ''
      }`}
    >
      <NavRail
        view={view}
        exportUrl={notesApi.exportUrl()}
        onOpenServerSettings={onOpenServerSettings}
        onChange={(nextView) => {
          setView(nextView);
          setDrawerOpen(false);
        }}
      />
      <div className="mobile-drawer-backdrop" onClick={() => setDrawerOpen(false)} />
      <TreePanel
        collapsed={treeCollapsed}
        tree={tree}
        selectedId={document?.id}
        onCollapsedChange={setTreeCollapsed}
        onOpen={(id) => void openDocument(id)}
        onCreateDocument={(parentPath) => setDialog({ kind: 'document', parentPath })}
        onCreateFolder={(parentPath) => setDialog({ kind: 'folder', parentPath })}
        onMove={handleMove}
        onRename={(node) => setDialog({ kind: 'rename', node })}
        onDelete={setDeleteNode}
      />
      <main className="workspace">
        {error && <div className="global-error">{error}</div>}
        {view === 'search' && <SearchView onOpen={(id) => void openDocument(id)} />}
        {view === 'recent' && <RecentView onOpen={(id) => void openDocument(id)} />}
        {view === 'trash' && <TrashView onChanged={reloadTree} />}
        {view === 'notes' &&
          (document ? (
            <DocumentEditor
              key={`${document.id}:${editorEpoch}`}
              document={document}
              onSaved={handleSaved}
              onConflict={handleConflict}
              onOpenSidebar={() => {
                setTreeCollapsed(false);
                setDrawerOpen(true);
              }}
            />
          ) : (
            <EmptyWorkspace
              onOpenSidebar={() => {
                setTreeCollapsed(false);
                setDrawerOpen(true);
              }}
              onCreate={() => setDialog({ kind: 'document', parentPath: '' })}
            />
          ))}
      </main>

      {dialogPresentation && (
        <ActionDialog
          open={Boolean(dialog)}
          onOpenChange={(open) => !open && setDialog(null)}
          onSubmit={submitDialog}
          {...dialogPresentation}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleteNode)}
        title="移到回收站"
        description={`“${deleteNode?.name ?? ''}”可以稍后从回收站恢复。`}
        confirmText="移到回收站"
        danger
        onOpenChange={(open) => !open && setDeleteNode(undefined)}
        onConfirm={confirmDelete}
      />
      <AlertDialog.Root open={Boolean(conflict)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog-overlay" />
          <AlertDialog.Content className="dialog-content">
            <AlertDialog.Title>检测到其他设备的修改</AlertDialog.Title>
            <AlertDialog.Description>
              当前草稿没有覆盖服务器版本。请选择加载最新内容，或将草稿保存为副本。
            </AlertDialog.Description>
            <div className="dialog-actions conflict-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  if (!conflict) return;
                  setDocument(conflict.current);
                  setConflict(undefined);
                  setEditorEpoch((value) => value + 1);
                }}
              >
                加载最新版本
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => void saveConflictCopy()}
              >
                另存为副本
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <GlobalTooltip />
    </div>
  );
});

function EmptyWorkspace({
  onOpenSidebar,
  onCreate,
}: {
  onOpenSidebar: () => void;
  onCreate: () => void;
}) {
  return (
    <section className="empty-workspace">
      <button
        type="button"
        className="mobile-menu-button"
        aria-label="打开目录"
        data-tooltip="打开目录"
        onClick={onOpenSidebar}
      >
        <Menu size={20} />
      </button>
      <NotebookPen size={42} strokeWidth={1.4} />
      <h1>选择一篇笔记开始编辑</h1>
      <p>内容会自动保存为这台电脑上的 Markdown 文件。</p>
      <button type="button" className="button primary" onClick={onCreate}>
        <FilePlus2 size={17} /> 新建文档
      </button>
    </section>
  );
}

function parentOf(nodePath: string): string {
  const normalized = nodePath.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index === -1 ? '' : normalized.slice(0, index);
}
