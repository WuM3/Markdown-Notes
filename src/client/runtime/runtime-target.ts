import { Capacitor } from '@capacitor/core';
import type { RuntimeTarget } from './api-client.js';

export function runtimeTargetForPlatform(
  platform: string,
  isNative: boolean,
): RuntimeTarget {
  return isNative && platform === 'android' ? 'android' : 'web';
}

export function detectRuntimeTarget(): RuntimeTarget {
  return runtimeTargetForPlatform(
    Capacitor.getPlatform(),
    Capacitor.isNativePlatform(),
  );
}
