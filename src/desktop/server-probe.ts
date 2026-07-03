import type { HealthResponse } from '../shared/types.js';

export type ServiceProbeResult =
  | {
      status: 'available';
      baseUrl: string;
    }
  | {
      status: 'compatible';
      baseUrl: string;
      health: HealthResponse;
    }
  | {
      status: 'incompatible';
      baseUrl: string;
      reason: string;
    };

export async function probeNotesService(
  port: number,
  fetcher: typeof fetch = fetch,
  timeoutMs = 2_000,
): Promise<ServiceProbeResult> {
  const baseUrl = `http://127.0.0.1:${port}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetcher(`${baseUrl}/api/health`, {
      signal: controller.signal,
    });
  } catch {
    return {
      status: 'available',
      baseUrl,
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return {
      status: 'incompatible',
      baseUrl,
      reason: `服务器返回 ${response.status}`,
    };
  }

  let health: Partial<HealthResponse>;
  try {
    health = (await response.json()) as Partial<HealthResponse>;
  } catch {
    return {
      status: 'incompatible',
      baseUrl,
      reason: '健康检查响应不是有效 JSON',
    };
  }

  if (health.status !== 'ok' || typeof health.version !== 'string') {
    return {
      status: 'incompatible',
      baseUrl,
      reason: '目标地址不是兼容的个人笔记服务',
    };
  }
  return {
    status: 'compatible',
    baseUrl,
    health: health as HealthResponse,
  };
}
