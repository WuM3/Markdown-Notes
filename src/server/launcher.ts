import os from 'node:os';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import type { DesktopServerStatus } from '../shared/types.js';
import { buildApp } from './app.js';

interface StartNotesServerOptions {
  host: string;
  port: number;
  dataDir: string;
  staticDir?: string;
  watch?: boolean;
  imageLimitBytes?: number;
  attachmentLimitBytes?: number;
  logger?: boolean;
  startedByDesktop?: boolean;
}

export type { DesktopServerStatus };

export interface StartedNotesServer extends DesktopServerStatus {
  app: FastifyInstance;
  close: () => Promise<void>;
}

type NetworkInterfaces = Record<
  string,
  Array<{ address: string; family: string | number; internal: boolean }> | undefined
>;

export async function startNotesServer(
  options: StartNotesServerOptions,
): Promise<StartedNotesServer> {
  const app = await buildApp({
    dataDir: options.dataDir,
    staticDir: options.staticDir,
    watch: options.watch,
    imageLimitBytes: options.imageLimitBytes,
    attachmentLimitBytes: options.attachmentLimitBytes,
    logger: options.logger,
  });
  await app.listen({ host: options.host, port: options.port });

  const address = app.server.address() as AddressInfo | null;
  const port = address?.port ?? options.port;
  const urls = accessUrlsForPort(port);
  return {
    app,
    dataDir: options.dataDir,
    port,
    startedByDesktop: options.startedByDesktop === true,
    ...urls,
    close: () => app.close(),
  };
}

export function accessUrlsForPort(
  port: number,
  interfaces: NetworkInterfaces = os.networkInterfaces(),
) {
  const lanUrls = Object.values(interfaces)
    .flatMap((networks) => networks ?? [])
    .filter((network) => network.family === 'IPv4' && !network.internal)
    .map((network) => `http://${network.address}:${port}`);

  return {
    localUrl: `http://127.0.0.1:${port}`,
    lanUrls: [...new Set(lanUrls)],
  };
}
