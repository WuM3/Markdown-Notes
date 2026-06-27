import { describe, expect, it } from 'vitest';
import { runtimeTargetForPlatform } from '../../src/client/runtime/runtime-target.js';

describe('runtimeTargetForPlatform', () => {
  it('uses the Android API client only inside the Android native runtime', () => {
    expect(runtimeTargetForPlatform('android', true)).toBe('android');
    expect(runtimeTargetForPlatform('web', false)).toBe('web');
    expect(runtimeTargetForPlatform('ios', true)).toBe('web');
  });
});
