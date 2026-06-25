import { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import type { TrashEntry } from '../../shared/types.js';
import { notesApi } from '../api.js';

interface TrashViewProps {
  onChanged: () => Promise<void>;
}

export function TrashView({ onChanged }: TrashViewProps) {
  const [entries, setEntries] = useState<TrashEntry[]>([]);

  const load = useCallback(async () => {
    setEntries(await notesApi.trash());
  }, []);

  useEffect(() => {
    void notesApi.trash().then(setEntries);
  }, []);

  async function restore(id: string) {
    await notesApi.restoreTrash(id);
    await Promise.all([load(), onChanged()]);
  }

  async function remove(id: string) {
    await notesApi.permanentlyDeleteTrash(id);
    await load();
  }

  async function empty() {
    await notesApi.emptyTrash();
    await load();
  }

  return (
    <section className="utility-view">
      <header className="view-header-row">
        <h1>回收站</h1>
        {entries.length > 0 && (
          <button type="button" className="button danger subtle" onClick={() => void empty()}>
            清空回收站
          </button>
        )}
      </header>
      <div className="result-list">
        {entries.map((entry) => (
          <div className="trash-row" key={entry.id}>
            <Trash2 size={18} />
            <span>
              <strong>{entry.name}</strong>
              <small>{entry.originalPath}</small>
            </span>
            <button
              type="button"
              title="恢复"
              aria-label={`恢复 ${entry.name}`}
              data-tooltip="恢复"
              onClick={() => void restore(entry.id)}
            >
              <RotateCcw size={16} />
            </button>
            <button
              type="button"
              title="永久删除"
              aria-label={`永久删除 ${entry.name}`}
              data-tooltip="永久删除"
              className="danger-text"
              onClick={() => void remove(entry.id)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {entries.length === 0 && <div className="view-empty">回收站为空</div>}
      </div>
    </section>
  );
}
