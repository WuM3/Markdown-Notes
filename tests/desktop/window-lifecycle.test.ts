import { describe, expect, it, vi } from 'vitest';
import { handleMainWindowClose } from '../../src/desktop/window-lifecycle.js';

describe('desktop window lifecycle', () => {
  it('destroys and clears the window when the user closes the window without quitting', () => {
    const preventDefault = vi.fn();
    const destroy = vi.fn();
    const clearWindow = vi.fn();

    handleMainWindowClose(
      { preventDefault },
      {
        isQuitting: false,
        window: { destroy },
        clearWindow,
      },
    );

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(clearWindow).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('lets Electron close the window normally when the app is quitting', () => {
    const preventDefault = vi.fn();
    const destroy = vi.fn();
    const clearWindow = vi.fn();

    handleMainWindowClose(
      { preventDefault },
      {
        isQuitting: true,
        window: { destroy },
        clearWindow,
      },
    );

    expect(preventDefault).not.toHaveBeenCalled();
    expect(clearWindow).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });
});
