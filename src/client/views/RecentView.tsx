import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import type { DocumentRecord } from '../../shared/types.js';
import { notesApi } from '../api.js';

export function RecentView({ onOpen }: { onOpen: (id: string) => void }) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);

  useEffect(() => {
    void notesApi.recent().then(setDocuments);
  }, []);

  return (
    <section className="utility-view">
      <header>
        <h1>最近编辑</h1>
      </header>
      <div className="result-list">
        {documents.map((document) => (
          <button
            key={document.id}
            type="button"
            onClick={() => onOpen(document.id)}
          >
            <FileText size={18} />
            <span>
              <strong>{document.title}</strong>
              <small>{document.path}</small>
              <p>{new Date(document.updatedAt).toLocaleString('zh-CN')}</p>
            </span>
          </button>
        ))}
        {documents.length === 0 && <div className="view-empty">还没有最近文档</div>}
      </div>
    </section>
  );
}

