import type { HealthResponse, ServerProfile } from '../../shared/types.js';

export interface ServerProfileStore {
  list(): Promise<ServerProfile[]>;
  save(profiles: ServerProfile[]): Promise<void>;
}

export class MemoryProfileStore implements ServerProfileStore {
  private profiles: ServerProfile[] = [];

  async list(): Promise<ServerProfile[]> {
    return this.profiles;
  }

  async save(profiles: ServerProfile[]): Promise<void> {
    this.profiles = profiles;
  }
}

export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('请输入服务器地址');
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  const parsed = new URL(withProtocol);
  parsed.protocol = parsed.protocol.toLowerCase();

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('服务器地址必须使用 http 或 https');
  }

  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/+$/g, '');
}

export async function rememberServerProfile(
  store: ServerProfileStore,
  input: string,
  now = () => new Date(),
): Promise<ServerProfile[]> {
  const baseUrl = normalizeServerUrl(input);
  const previous = await store.list();
  const next: ServerProfile = {
    id: baseUrl,
    baseUrl,
    lastConnectedAt: now().toISOString(),
  };
  const profiles = [
    next,
    ...previous.filter((profile) => profile.baseUrl !== baseUrl),
  ].slice(0, 5);
  await store.save(profiles);
  return profiles;
}

export async function testServerConnection(
  input: string,
  fetcher: typeof fetch = fetch,
): Promise<{ baseUrl: string; health: HealthResponse }> {
  const baseUrl = normalizeServerUrl(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetcher(`${baseUrl}/api/health`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`服务器返回 ${response.status}`);
    }
    return {
      baseUrl,
      health: (await response.json()) as HealthResponse,
    };
  } finally {
    clearTimeout(timeout);
  }
}

