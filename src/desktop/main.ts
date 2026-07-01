import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  clipboard,
  dialog,
  nativeImage,
  shell,
  type MenuItemConstructorOptions,
} from 'electron';
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  accessUrlsForPort,
  startNotesServer,
  type DesktopServerStatus,
  type StartedNotesServer,
} from '../server/launcher.js';
import {
  ensureDataDirectory,
  loadDesktopSettings,
  saveDesktopSettings,
  type DesktopSettings,
} from './settings.js';
import { probeNotesService } from './server-probe.js';
import { handleMainWindowClose } from './window-lifecycle.js';

let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let settings: DesktopSettings;
let serverStatus: DesktopServerStatus | undefined;
let startedServer: StartedNotesServer | undefined;
let isQuitting = false;
let serverClosed = false;

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });
}

app.on('before-quit', (event) => {
  isQuitting = true;
  if (startedServer && !serverClosed) {
    event.preventDefault();
    void shutdownAndQuit();
  }
});

app.on('window-all-closed', () => {
  // Keep the tray app alive on Windows.
});

app.on('activate', () => {
  showMainWindow();
});

void app.whenReady().then(startDesktopApp);

async function startDesktopApp(): Promise<void> {
  const state = await loadDesktopSettings(app.getPath('userData'), {
    dataDir: defaultDataDir(),
  });
  settings = state.settings;

  if (!state.exists || !(await pathExists(settings.dataDir))) {
    const chosenDataDir = await chooseDataDirectory(settings.dataDir);
    if (!chosenDataDir) {
      app.quit();
      return;
    }
    settings = { ...settings, dataDir: chosenDataDir };
    await saveDesktopSettings(app.getPath('userData'), settings);
  } else {
    await ensureDataDirectory(settings.dataDir);
  }

  applyLaunchAtLogin(settings.launchAtLogin);

  try {
    serverStatus = await connectOrStartServer(settings);
  } catch (error) {
    await dialog.showMessageBox({
      type: 'error',
      message: '个人笔记服务启动失败',
      detail: error instanceof Error ? error.message : String(error),
    });
    app.quit();
    return;
  }

  createMainWindow();
  createTray();
}

async function connectOrStartServer(
  currentSettings: DesktopSettings,
): Promise<DesktopServerStatus> {
  const probe = await probeNotesService(currentSettings.port);
  if (probe.status === 'compatible') {
    return {
      ...accessUrlsForPort(currentSettings.port),
      dataDir: currentSettings.dataDir,
      port: currentSettings.port,
      startedByDesktop: false,
    };
  }
  if (probe.status === 'incompatible') {
    throw new Error(
      `端口 ${currentSettings.port} 已被其他服务占用：${probe.reason}`,
    );
  }

  startedServer = await startNotesServer({
    host: '0.0.0.0',
    port: currentSettings.port,
    dataDir: currentSettings.dataDir,
    staticDir: resolveStaticDir(),
    logger: true,
    startedByDesktop: true,
  });
  return startedServer;
}

function createMainWindow(): void {
  if (!serverStatus) return;
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: '个人笔记',
    icon: resolveIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;
  window.loadURL(serverStatus.localUrl).catch((error) => {
    void dialog.showMessageBox({
      type: 'error',
      message: '打开个人笔记页面失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  });
  window.on('close', (event) => {
    handleMainWindowClose(event, {
      isQuitting,
      window,
      clearWindow: () => {
        if (mainWindow === window) {
          mainWindow = undefined;
        }
      },
    });
  });
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = undefined;
    }
  });
}

function createTray(): void {
  tray = new Tray(resolveTrayImage());
  tray.setToolTip('个人笔记');
  tray.on('click', () => showMainWindow());
  refreshTrayMenu();
}

function refreshTrayMenu(): void {
  if (!tray || !serverStatus) return;
  const primaryLanUrl = serverStatus.lanUrls[0];
  const template: MenuItemConstructorOptions[] = [
    {
      label: '打开个人笔记',
      click: () => showMainWindow(),
    },
    {
      label: `本机地址：${serverStatus.localUrl}`,
      enabled: false,
    },
    {
      label: primaryLanUrl
        ? `局域网地址：${primaryLanUrl}`
        : '局域网地址：未检测到',
      enabled: false,
    },
    {
      label: '复制局域网地址',
      enabled: Boolean(primaryLanUrl),
      click: () => {
        if (primaryLanUrl) clipboard.writeText(primaryLanUrl);
      },
    },
    {
      label: '在浏览器中打开',
      click: () => {
        void shell.openExternal(serverStatus?.localUrl ?? 'http://127.0.0.1:3210');
      },
    },
    { type: 'separator' },
    {
      label: '更换数据目录',
      click: () => {
        void changeDataDirectory();
      },
    },
    {
      label: '开机自动启动',
      type: 'checkbox',
      checked: settings.launchAtLogin,
      click: () => {
        void toggleLaunchAtLogin();
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        void shutdownAndQuit();
      },
    },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

async function chooseDataDirectory(previousPath: string): Promise<string | undefined> {
  while (true) {
    const result = await dialog.showOpenDialog({
      title: '选择个人笔记数据目录',
      defaultPath: previousPath,
      buttonLabel: '使用此目录',
      properties: ['openDirectory', 'createDirectory'],
      message: '请选择现有 data 文件夹，或选择一个新目录用于保存笔记。',
    });
    if (result.canceled || !result.filePaths[0]) return undefined;

    const dataDir = path.resolve(result.filePaths[0]);
    if (await isNotesDataDirectory(dataDir)) {
      await ensureDataDirectory(dataDir);
      return dataDir;
    }

    const empty = await isEmptyDirectory(dataDir);
    if (empty) {
      await ensureDataDirectory(dataDir);
      return dataDir;
    }

    const answer = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['在此创建笔记数据', '重新选择', '退出'],
      defaultId: 0,
      cancelId: 1,
      message: '这个目录不像现有笔记数据目录',
      detail: '未找到 notes 文件夹。可以在此目录创建新的笔记数据结构，也可以重新选择当前项目的 data 文件夹。',
    });
    if (answer.response === 0) {
      await ensureDataDirectory(dataDir);
      return dataDir;
    }
    if (answer.response === 1) continue;
    return undefined;
  }
}

async function changeDataDirectory(): Promise<void> {
  const dataDir = await chooseDataDirectory(settings.dataDir);
  if (!dataDir || dataDir === settings.dataDir) return;
  settings = { ...settings, dataDir };
  await saveDesktopSettings(app.getPath('userData'), settings);
  await dialog.showMessageBox({
    type: 'info',
    message: '数据目录已更新',
    detail: '请从托盘菜单退出并重新打开个人笔记，新的数据目录会在下次启动时生效。',
  });
}

async function toggleLaunchAtLogin(): Promise<void> {
  settings = {
    ...settings,
    launchAtLogin: !settings.launchAtLogin,
  };
  applyLaunchAtLogin(settings.launchAtLogin);
  await saveDesktopSettings(app.getPath('userData'), settings);
  refreshTrayMenu();
}

function applyLaunchAtLogin(openAtLogin: boolean): void {
  app.setLoginItemSettings({
    openAtLogin,
    path: process.execPath,
  });
}

function showMainWindow(): void {
  if (!mainWindow) {
    createMainWindow();
  }
  mainWindow?.show();
  mainWindow?.focus();
}

async function shutdownAndQuit(): Promise<void> {
  isQuitting = true;
  if (startedServer && !serverClosed) {
    await startedServer.close();
    serverClosed = true;
  }
  tray?.destroy();
  app.quit();
}

function resolveStaticDir(): string {
  return path.join(app.getAppPath(), 'dist', 'client');
}

function resolveIconPath(): string {
  return path.join(app.getAppPath(), 'build', 'icon.png');
}

function resolveTrayImage() {
  const iconPath = resolveIconPath();
  if (existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath);
  }
  return nativeImage.createEmpty();
}

function defaultDataDir(): string {
  return app.isPackaged
    ? path.join(app.getPath('documents'), '个人笔记数据')
    : path.resolve('data');
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function isNotesDataDirectory(dataDir: string): Promise<boolean> {
  try {
    const info = await stat(path.join(dataDir, 'notes'));
    return info.isDirectory();
  } catch {
    return false;
  }
}

async function isEmptyDirectory(dataDir: string): Promise<boolean> {
  try {
    const entries = await readdir(dataDir);
    return entries.length === 0;
  } catch {
    return true;
  }
}
