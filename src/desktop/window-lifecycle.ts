interface CloseEventLike {
  preventDefault: () => void;
}

interface DestroyableWindow {
  destroy: () => void;
}

interface MainWindowCloseOptions {
  isQuitting: boolean;
  window: DestroyableWindow | undefined;
  clearWindow: () => void;
}

export function handleMainWindowClose(
  event: CloseEventLike,
  options: MainWindowCloseOptions,
): void {
  if (options.isQuitting) return;

  event.preventDefault();
  const window = options.window;
  options.clearWindow();
  window?.destroy();
}
