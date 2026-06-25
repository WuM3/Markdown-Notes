import path from 'node:path';

export interface ServerConfig {
  host: string;
  port: number;
  dataDir: string;
  imageLimitBytes: number;
  attachmentLimitBytes: number;
}

export function loadConfig(environment = process.env): ServerConfig {
  return {
    host: environment.HOST || '0.0.0.0',
    port: Number(environment.PORT) || 3210,
    dataDir: path.resolve(environment.DATA_DIR || './data'),
    imageLimitBytes: (Number(environment.IMAGE_LIMIT_MB) || 20) * 1024 * 1024,
    attachmentLimitBytes:
      (Number(environment.ATTACHMENT_LIMIT_MB) || 100) * 1024 * 1024,
  };
}

