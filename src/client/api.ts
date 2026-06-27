import {
  ApiClient,
  ApiError,
  webApiClient,
} from './runtime/api-client.js';

export { ApiError };

let activeApiClient = webApiClient;

export const notesApi = new Proxy(webApiClient, {
  get(_target, property) {
    const value = Reflect.get(activeApiClient, property);
    return typeof value === 'function' ? value.bind(activeApiClient) : value;
  },
}) as ApiClient;

export function configureNotesApi(client: ApiClient): void {
  activeApiClient = client;
}

export function resetNotesApi(): void {
  activeApiClient = webApiClient;
}

export function apiRequest<T>(input: string, init?: RequestInit): Promise<T> {
  const path = input.startsWith('/api') ? input.slice(4) || '/' : input;
  return activeApiClient.request<T>(path, init);
}
