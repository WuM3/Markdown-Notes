import type {
  AssetRecord,
  DocumentRecord,
  SaveDocumentRequest,
  SearchResult,
  TrashEntry,
  TreeNode,
} from '../../shared/types.js';

export type RuntimeTarget = 'web' | 'android';

export class ApiError<T = unknown> extends Error {
  constructor(
    public readonly status: number,
    public readonly body: T,
  ) {
    super(
      typeof body === 'object' &&
        body !== null &&
        'message' in body &&
        typeof body.message === 'string'
        ? body.message
        : `请求失败 (${status})`,
    );
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  target: RuntimeTarget;
  baseUrl?: string;
  fetcher?: typeof fetch;
}

export class ApiClient {
  private readonly fetcher?: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly options: ApiClientOptions) {
    this.fetcher = options.fetcher;
    this.baseUrl = (options.baseUrl ?? '').replace(/\/+$/g, '');
  }

  apiUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const apiPath = `/api${normalizedPath}`;
    return this.options.target === 'web' ? apiPath : `${this.baseUrl}${apiPath}`;
  }

  assetUrl(documentId: string, name: string): string {
    return this.apiUrl(
      `/assets/${encodeURIComponent(documentId)}/${encodeURIComponent(name)}`,
    );
  }

  exportUrl(): string {
    return this.apiUrl('/export');
  }

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await (this.fetcher ?? globalThis.fetch)(
      this.apiUrl(path),
      init,
    );
    const contentType = response.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      throw new ApiError(response.status, body);
    }
    return body as T;
  }

  tree = () => this.request<TreeNode[]>('/tree');

  createFolder = (input: { parentPath: string; name: string }) =>
    this.request<TreeNode>('/folders', jsonRequest('POST', input));

  createDocument = (input: { parentPath: string; title: string }) =>
    this.request<DocumentRecord>('/documents', jsonRequest('POST', input));

  document = (id: string) =>
    this.request<DocumentRecord>(`/documents/${encodeURIComponent(id)}`);

  saveDocument = (id: string, input: SaveDocumentRequest) =>
    this.request<DocumentRecord>(
      `/documents/${encodeURIComponent(id)}`,
      jsonRequest('PUT', input),
    );

  moveNode = (input: {
    kind: 'folder' | 'document';
    path: string;
    targetParentPath: string;
    newName?: string;
  }) => this.request<TreeNode | DocumentRecord>('/nodes/move', jsonRequest('POST', input));

  deleteNode = (input: { kind: 'folder' | 'document'; path: string }) =>
    this.request<TrashEntry>('/nodes', jsonRequest('DELETE', input));

  search = (query: string) =>
    this.request<SearchResult[]>(`/search?q=${encodeURIComponent(query)}`);

  recent = () => this.request<DocumentRecord[]>('/recent');

  trash = () => this.request<TrashEntry[]>('/trash');

  restoreTrash = (id: string) =>
    this.request<TreeNode | DocumentRecord>(
      `/trash/${encodeURIComponent(id)}/restore`,
      { method: 'POST' },
    );

  permanentlyDeleteTrash = (id: string) =>
    this.request<void>(`/trash/${encodeURIComponent(id)}`, { method: 'DELETE' });

  emptyTrash = () => this.request<void>('/trash', { method: 'DELETE' });

  uploadAsset = (documentId: string, file: File) => {
    const body = new FormData();
    body.append('documentId', documentId);
    body.append('file', file);
    return this.request<AssetRecord>('/assets', {
      method: 'POST',
      body,
    });
  };
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export const webApiClient = new ApiClient({ target: 'web' });
