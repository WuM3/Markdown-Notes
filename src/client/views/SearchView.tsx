import { useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import type { SearchResult } from '../../shared/types.js';
import { notesApi } from '../api.js';

export function SearchView({ onOpen }: { onOpen: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      void notesApi.search(query).then(setResults);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <section className="utility-view">
      <header>
        <h1>搜索</h1>
      </header>
      <label className="search-input">
        <Search size={18} />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索标题和正文"
        />
      </label>
      <div className="result-list">
        {results.map((result) => (
          <button key={result.id} type="button" onClick={() => onOpen(result.id)}>
            <FileText size={18} />
            <span>
              <strong>{result.title}</strong>
              <small>{result.path}</small>
              <p>{result.excerpt}</p>
            </span>
          </button>
        ))}
        {query && results.length === 0 && <div className="view-empty">没有匹配结果</div>}
      </div>
    </section>
  );
}

