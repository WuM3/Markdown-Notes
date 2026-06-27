import { App as CapacitorApp } from '@capacitor/app';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { StatusBar, Style } from '@capacitor/status-bar';

export async function initializeNativeUi(): Promise<void> {
  await Promise.all([
    StatusBar.setOverlaysWebView({ overlay: false }),
    StatusBar.setBackgroundColor({ color: '#242a34' }),
    StatusBar.setStyle({ style: Style.Light }),
    Keyboard.setResizeMode({ mode: KeyboardResize.Body }),
  ]);
}

export async function minimizeNativeApp(): Promise<void> {
  await CapacitorApp.minimizeApp();
}

export const nativeAppEvents = CapacitorApp;
