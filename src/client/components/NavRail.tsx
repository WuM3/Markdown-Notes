import {
  Clock3,
  Download,
  FileText,
  Search,
  Settings,
  Trash2,
  type LucideIcon,
} from 'lucide-react';

export type AppView = 'notes' | 'search' | 'recent' | 'trash';

interface NavRailProps {
  view: AppView;
  exportUrl?: string;
  onOpenServerSettings?: () => void;
  onChange: (view: AppView) => void;
}

const navigation: Array<{
  id: AppView;
  label: string;
  icon: LucideIcon;
}> = [
  { id: 'notes', label: '笔记', icon: FileText },
  { id: 'search', label: '搜索', icon: Search },
  { id: 'recent', label: '最近', icon: Clock3 },
  { id: 'trash', label: '回收站', icon: Trash2 },
];

export function NavRail({
  view,
  exportUrl = '/api/export',
  onOpenServerSettings,
  onChange,
}: NavRailProps) {
  return (
    <nav className="nav-rail" aria-label="主导航">
      <div className="brand-mark" aria-label="个人笔记">
        N
      </div>
      <div className="nav-actions">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-label={label}
            data-tooltip={label}
            className={view === id ? 'active' : ''}
            onClick={() => onChange(id)}
          >
            <Icon size={20} strokeWidth={1.8} />
          </button>
        ))}
      </div>
      {onOpenServerSettings && (
        <button
          type="button"
          className="nav-download"
          aria-label="服务器设置"
          data-tooltip="服务器设置"
          onClick={onOpenServerSettings}
        >
          <Settings size={20} strokeWidth={1.8} />
        </button>
      )}
      <a
        className="nav-download"
        href={exportUrl}
        aria-label="导出全部笔记"
        data-tooltip="导出全部笔记"
      >
        <Download size={20} strokeWidth={1.8} />
      </a>
    </nav>
  );
}
