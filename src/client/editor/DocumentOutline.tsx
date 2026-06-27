import { useState, type CSSProperties, type WheelEvent } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { OutlineNode } from './document-outline.js';

interface DocumentOutlineProps {
  nodes: OutlineNode[];
  activeId?: string;
  collapsed?: boolean;
  compact?: boolean;
  onClose?: () => void;
  onCollapsedChange?: (collapsed: boolean) => void;
  onNavigate: (index: number) => void;
  onWheel?: (event: WheelEvent<HTMLElement>) => void;
}

export function DocumentOutline({
  nodes,
  activeId,
  collapsed = false,
  compact = false,
  onClose,
  onCollapsedChange,
  onNavigate,
  onWheel,
}: DocumentOutlineProps) {
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(
    () => new Set(),
  );

  function toggle(id: string) {
    setCollapsedItems((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (collapsed && !compact) {
    return (
      <nav
        className="document-outline collapsed"
        aria-label="文档目录"
        onWheel={onWheel}
      >
        <button
          type="button"
          className="document-outline-expand"
          aria-label="展开文档目录"
          data-tooltip="展开文档目录"
          onClick={() => onCollapsedChange?.(false)}
        >
          <ChevronRight size={18} />
        </button>
      </nav>
    );
  }

  return (
    <nav
      className={`document-outline ${compact ? 'compact' : ''}`}
      aria-label="文档目录"
      onWheel={onWheel}
    >
      <div className="document-outline-header">
        {compact ? (
          <>
            <strong>文档目录</strong>
            <button
              type="button"
              className="icon-button"
              aria-label="关闭文档目录"
              data-tooltip="关闭文档目录"
              onClick={onClose}
            >
              <X size={17} />
            </button>
          </>
        ) : (
          <button
            type="button"
            className="icon-button"
            aria-label="收起文档目录"
            data-tooltip="收起文档目录"
            onClick={() => onCollapsedChange?.(true)}
          >
            <ChevronLeft size={17} />
          </button>
        )}
      </div>
      {nodes.length === 0 ? (
        <div className="document-outline-empty">暂无标题</div>
      ) : (
        <div className="document-outline-list">
          {nodes.map((node) => (
            <OutlineItem
              key={node.id}
              node={node}
              root
              activeId={activeId}
              collapsed={collapsedItems}
              onNavigate={onNavigate}
              onToggle={toggle}
            />
          ))}
        </div>
      )}
    </nav>
  );
}

function OutlineItem({
  node,
  activeId,
  collapsed,
  root = false,
  onNavigate,
  onToggle,
}: {
  node: OutlineNode;
  activeId?: string;
  collapsed: Set<string>;
  root?: boolean;
  onNavigate: (index: number) => void;
  onToggle: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.id);
  const isActive = activeId === node.id;

  return (
    <div className="document-outline-item">
      <div
        className="document-outline-row"
        style={{ '--level': node.level } as CSSProperties}
      >
        {hasChildren ? (
          <button
            type="button"
            className="document-outline-toggle"
            aria-label={`${isCollapsed ? '展开' : '收起'} ${node.title}`}
            onClick={() => onToggle(node.id)}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        ) : (
          <span className="document-outline-spacer" />
        )}
        <button
          type="button"
          className="document-outline-link"
          data-level={node.level}
          data-root={root ? 'true' : undefined}
          aria-current={isActive ? 'true' : undefined}
          onClick={() => onNavigate(node.index)}
        >
          {node.title}
        </button>
      </div>
      {hasChildren && !isCollapsed && (
        <div className="document-outline-children">
          {node.children.map((child) => (
            <OutlineItem
              key={child.id}
              node={child}
              activeId={activeId}
              collapsed={collapsed}
              root={false}
              onNavigate={onNavigate}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
