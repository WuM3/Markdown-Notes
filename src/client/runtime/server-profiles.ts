import type { HealthResponse, ServerProfile } from '../../shared/types.js';

export interface ServerProfileStore {
  list(): Promise<ServerProfile[]>;
  save(profiles: ServerProfile[]): Promise<void>;
}

interface PreferencesLike {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

const PROFILES_KEY = 'serverProfiles';
const ACTIVE_SERVER_KEY = 'activeServer';

export class MemoryProfileStore implements ServerProfileStore {
  private profiles: ServerProfile[] = [];

  async list(): Promise<ServerProfile[]> {
    return this.profiles;
  }

  async save(profiles: ServerProfile[]): Promise<void> {
    this.profiles = profiles;
  }
}

export class PreferencesProfileStore implements ServerProfileStore {
  constructor(private readonly preferences: PreferencesLike) {}

  async list(): Promise<ServerProfile[]> {
    const { value } = await this.preferences.get({ key: PROFILES_KEY });
    if (!value) return [];
    try {
      const profiles = JSON.parse(value) as ServerProfile[];
      return Array.isArray(profiles) ? profiles : [];
    } catch {
      return [];
    }
  }

  async save(profiles: ServerProfile[]): Promise<void> {
    await this.preferences.set({
      key: PROFILES_KEY,
      value: JSON.stringify(profiles.slice(0, 5)),
    });
  }

  async getActive(): Promise<string | undefined> {
    const { value } = await this.preferences.get({ key: ACTIVE_SERVER_KEY });
    return value ?? undefined;
  }

  async setActive(baseUrl: string): Promise<void> {
    await this.preferences.set({
      key: ACTIVE_SERVER_KEY,
      value: normalizeServerUrl(baseUrl),
    });
  }

  async removeProfile(id: string): Promise<void> {
    const profiles = (await this.list()).filter((profile) => profile.id !== id);
    await this.save(profiles);
    if ((await this.getActive()) === id) {
      await this.preferences.remove({ key: ACTIVE_SERVER_KEY });
    }
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
    const health = (await response.json()) as Partial<HealthResponse>;
    if (health.status !== 'ok' || typeof health.version !== 'string') {
      throw new Error('目标地址不是兼容的个人笔记服务');
    }
    return {
      baseUrl,
      health: health as HealthResponse,
    };
  } finally {
    clearTimeout(timeout);
  }
}
