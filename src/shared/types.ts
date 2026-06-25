export type NodeKind = 'folder' | 'document';

export interface TreeNode {
  id: string;
  kind: NodeKind;
  name: string;
  path: string;
  updatedAt: string;
  children?: TreeNode[];
}

export interface DocumentRecord {
  id: string;
  title: string;
  path: string;
  parentPath: string;
  createdAt: string;
  updatedAt: string;
  content: string;
  revision: string;
}

export interface SaveDocumentRequest {
  title: string;
  content: string;
  revision: string;
}

export interface SearchResult {
  id: string;
  title: string;
  path: string;
  excerpt: string;
  updatedAt: string;
  score: number;
}

export interface TrashEntry {
  id: string;
  kind: NodeKind;
  name: string;
  originalPath: string;
  deletedAt: string;
  documentId?: string;
}

export interface AssetRecord {
  documentId: string;
  name: string;
  size: number;
  mimeType: string;
  url: string;
}

export interface HealthResponse {
  status: 'ok';
  version: string;
}

export interface ServerProfile {
  id: string;
  baseUrl: string;
  lastConnectedAt: string;
}
