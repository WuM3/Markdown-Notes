import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { TreeNode } from '../../shared/types.js';

interface TreePanelProps {
  tree: TreeNode[];
  selectedId?: string;
  onOpen: (id: string) => void;
  onCreateDocument: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onMove: (node: TreeNode, targetParentPath: string) => Promise<void>;
  onRename: (node: TreeNode) => void;
  onDelete: (node: TreeNode) => void;
}

export function TreePanel({
  tree,
  selectedId,
  onOpen,
  onCreateDocument,
  onCreateFolder,
  onMove,
  onRename,
  onDelete,
}: TreePanelProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const node = event.active.data.current?.node as TreeNode | undefined;
    const targetParentPath = event.over?.data.current?.path as string | undefined;
    if (!node || targetParentPath === undefined) return;
    await onMove(node, targetParentPath);
  }

  return (
    <section className="tree-panel" aria-label="笔记目录">
      <header className="tree-header">
        <div>
          <strong>我的笔记</strong>
          <span>Markdown 文档</span>
        </div>
        <div className="tree-header-actions">
          <button
            type="button"
            title="新建文档"
            aria-label="新建文档"
            data-tooltip="新建文档"
            onClick={() => onCreateDocument('')}
          >
            <FilePlus2 size={17} />
          </button>
          <button
            type="button"
            title="新建目录"
            aria-label="新建目录"
            data-tooltip="新建目录"
            onClick={() => onCreateFolder('')}
          >
            <FolderPlus size={17} />
          </button>
        </div>
      </header>
      <DndContext sensors={sensors} onDragEnd={(event) => void handleDragEnd(event)}>
        <RootDropZone>
          {tree.length === 0 ? (
            <div className="tree-empty">新建一个目录或文档开始记录</div>
          ) : (
            tree.map((node) => (
              <TreeItem
                key={node.id}
                node={node}
                depth={0}
                selectedId={selectedId}
                onOpen={onOpen}
                onCreateDocument={onCreateDocument}
                onCreateFolder={onCreateFolder}
                onRename={onRename}
                onDelete={onDelete}
              />
            ))
          )}
        </RootDropZone>
      </DndContext>
    </section>
  );
}

function RootDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'drop:root',
    data: { path: '' },
  });
  return (
    <div ref={setNodeRef} className={`tree-scroll ${isOver ? 'drop-active' : ''}`}>
      {children}
    </div>
  );
}

interface TreeItemProps
  extends Pick<
    TreePanelProps,
    | 'selectedId'
    | 'onOpen'
    | 'onCreateDocument'
    | 'onCreateFolder'
    | 'onRename'
    | 'onDelete'
  > {
  node: TreeNode;
  depth: number;
}

function TreeItem({
  node,
  depth,
  selectedId,
  onOpen,
  onCreateDocument,
  onCreateFolder,
  onRename,
  onDelete,
}: TreeItemProps) {
  const [expanded, setExpanded] = useState(true);
  const draggable = useDraggable({
    id: `drag:${node.kind}:${node.path}`,
    data: { node },
  });
  const droppable = useDroppable({
    id: `drop:${node.path}`,
    data: { path: node.kind === 'folder' ? node.path : undefined },
    disabled: node.kind !== 'folder',
  });
  const setRefs = (element: HTMLElement | null) => {
    draggable.setNodeRef(element);
    if (node.kind === 'folder') droppable.setNodeRef(element);
  };
  const transform = draggable.transform
    ? CSS.Translate.toString(draggable.transform)
    : undefined;

  return (
    <div>
      <div
        ref={setRefs}
        style={{ paddingLeft: 10 + depth * 16, transform }}
        className={[
          'tree-row',
          selectedId === node.id ? 'selected' : '',
          droppable.isOver ? 'drop-active' : '',
          draggable.isDragging ? 'dragging' : '',
        ].join(' ')}
        {...draggable.attributes}
      >
        {node.kind === 'folder' ? (
          <button
            type="button"
            className="tree-chevron"
            aria-label={expanded ? '折叠目录' : '展开目录'}
            data-tooltip={expanded ? '折叠目录' : '展开目录'}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="tree-indent" />
        )}
        <button
          type="button"
          className="tree-label"
          onClick={() =>
            node.kind === 'folder' ? setExpanded((value) => !value) : onOpen(node.id)
          }
          {...draggable.listeners}
        >
          {node.kind === 'folder' ? (
            <Folder size={16} className="folder-icon" />
          ) : (
            <FileText size={16} className="document-icon" />
          )}
          <span>{node.name}</span>
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="row-menu"
              aria-label={`${node.name} 操作`}
              data-tooltip="更多操作"
            >
              <MoreHorizontal size={16} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu-content" align="start">
              {node.kind === 'folder' && (
                <>
                  <DropdownMenu.Item
                    className="menu-item"
                    onSelect={() => onCreateDocument(node.path)}
                  >
                    <FilePlus2 size={15} /> 新建文档
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className="menu-item"
                    onSelect={() => onCreateFolder(node.path)}
                  >
                    <FolderPlus size={15} /> 新建子目录
                  </DropdownMenu.Item>
                </>
              )}
              <DropdownMenu.Item
                className="menu-item"
                onSelect={() => onRename(node)}
              >
                <Pencil size={15} /> 重命名
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="menu-separator" />
              <DropdownMenu.Item
                className="menu-item danger-text"
                onSelect={() => onDelete(node)}
              >
                <Trash2 size={15} /> 移到回收站
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {node.kind === 'folder' &&
        expanded &&
        node.children?.map((child) => (
          <TreeItem
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            onOpen={onOpen}
            onCreateDocument={onCreateDocument}
            onCreateFolder={onCreateFolder}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
    </div>
  );
}
