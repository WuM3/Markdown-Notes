import { ApiError, webApiClient } from './runtime/api-client.js';

export { ApiError };

export const notesApi = webApiClient;

export function apiRequest<T>(input: string, init?: RequestInit): Promise<T> {
  const path = input.startsWith('/api') ? input.slice(4) || '/' : input;
  return webApiClient.request<T>(path, init);
}
