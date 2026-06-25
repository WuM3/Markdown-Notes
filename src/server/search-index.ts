import MiniSearch from 'minisearch';
import type { DocumentRecord, SearchResult } from '../shared/types.js';
import { extractSearchText } from './domain/markdown.js';

interface IndexedDocument {
  id: string;
  title: string;
  text: string;
  path: string;
  updatedAt: string;
}

export class SearchIndex {
  private index = this.createIndex();
  private readonly documents = new Map<string, IndexedDocument>();

  rebuild(documents: DocumentRecord[]): void {
    this.index = this.createIndex();
    this.documents.clear();
    const uniqueDocuments = new Map(
      documents.map((document) => [document.id, document]),
    );
    for (const document of uniqueDocuments.values()) {
      const indexed = this.toIndexedDocument(document);
      this.documents.set(indexed.id, indexed);
      this.index.add(indexed);
    }
  }

  upsert(document: DocumentRecord): void {
    const indexed = this.toIndexedDocument(document);
    this.documents.set(indexed.id, indexed);
    if (this.index.has(indexed.id)) {
      this.index.replace(indexed);
    } else {
      this.index.add(indexed);
    }
  }

  remove(id: string): void {
    this.documents.delete(id);
    if (this.index.has(id)) {
      this.index.discard(id);
    }
  }

  search(query: string, limit = 30): SearchResult[] {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return [];

    return this.index
      .search(normalizedQuery, {
        boost: { title: 3 },
        combineWith: 'AND',
        prefix: true,
        fuzzy: 0.15,
      })
      .slice(0, limit)
      .map((match) => {
        const document = this.documents.get(String(match.id));
        if (!document) {
          throw new Error('搜索索引状态不一致');
        }
        return {
          id: document.id,
          title: document.title,
          path: document.path,
          updatedAt: document.updatedAt,
          excerpt: excerptAround(document.text, normalizedQuery),
          score: match.score,
        };
      });
  }

  private createIndex(): MiniSearch<IndexedDocument> {
    return new MiniSearch<IndexedDocument>({
      fields: ['title', 'text'],
      storeFields: ['title', 'path', 'updatedAt'],
      tokenize: tokenizeForSearch,
    });
  }

  private toIndexedDocument(document: DocumentRecord): IndexedDocument {
    return {
      id: document.id,
      title: document.title,
      text: extractSearchText(document.content),
      path: document.path,
      updatedAt: document.updatedAt,
    };
  }
}

export function tokenizeForSearch(value: string): string[] {
  const segments = value
    .toLocaleLowerCase('zh-CN')
    .match(/[\p{Script=Han}]+|[\p{Letter}\p{Number}]+/gu);
  if (!segments) return [];

  const tokens: string[] = [];
  for (const segment of segments) {
    if (/^\p{Script=Han}+$/u.test(segment)) {
      const characters = [...segment];
      tokens.push(...characters);
      for (let index = 0; index < characters.length - 1; index += 1) {
        tokens.push(`${characters[index]}${characters[index + 1]}`);
      }
    } else {
      tokens.push(segment);
    }
  }
  return [...new Set(tokens)];
}

function excerptAround(text: string, query: string): string {
  if (!text) return '';
  const maximumLength = 100;
  const lowerText = text.toLocaleLowerCase('zh-CN');
  const lowerQuery = query.toLocaleLowerCase('zh-CN');
  const matchIndex = lowerText.indexOf(lowerQuery);
  const center = matchIndex >= 0 ? matchIndex : 0;
  const start = Math.max(0, center - 35);
  const leadingMarker = start > 0 ? '…' : '';
  const contentBudget = maximumLength - leadingMarker.length - 1;
  const end = Math.min(text.length, start + contentBudget);
  const trailingMarker = end < text.length ? '…' : '';
  return `${leadingMarker}${text.slice(start, end)}${
    trailingMarker
  }`;
}
