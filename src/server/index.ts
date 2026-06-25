import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

try {
  process.loadEnvFile?.();
} catch {
  // .env is optional.
}

const config = loadConfig();
const app = await buildApp({
  dataDir: config.dataDir,
  staticDir: path.resolve('dist/client'),
  imageLimitBytes: config.imageLimitBytes,
  attachmentLimitBytes: config.attachmentLimitBytes,
  logger: true,
});

await app.listen({ host: config.host, port: config.port });

const addresses = new Set<string>([`http://127.0.0.1:${config.port}`]);
for (const network of Object.values(os.networkInterfaces()).flat()) {
  if (network?.family === 'IPv4' && !network.internal) {
    addresses.add(`http://${network.address}:${config.port}`);
  }
}

app.log.info(`数据目录: ${config.dataDir}`);
for (const address of addresses) {
  app.log.info(`访问地址: ${address}`);
}

