import path from 'node:path';
import process from 'node:process';
import { loadConfig } from './config.js';
import { startNotesServer } from './launcher.js';

try {
  process.loadEnvFile?.();
} catch {
  // .env is optional.
}

const config = loadConfig();
const server = await startNotesServer({
  host: config.host,
  port: config.port,
  dataDir: config.dataDir,
  staticDir: path.resolve('dist/client'),
  imageLimitBytes: config.imageLimitBytes,
  attachmentLimitBytes: config.attachmentLimitBytes,
  logger: true,
});

server.app.log.info(`数据目录: ${server.dataDir}`);
for (const address of [server.localUrl, ...server.lanUrls]) {
  server.app.log.info(`访问地址: ${address}`);
}
