export const CREPE_TOOLBAR_LABELS = [
  '加粗',
  '斜体',
  '删除线',
  '行内代码',
  '链接',
] as const;

export function annotateCrepeToolbar(root: ParentNode): void {
  const buttons = root.querySelectorAll<HTMLButtonElement>(
    '.milkdown-toolbar .toolbar-item',
  );
  buttons.forEach((button, index) => {
    const label = CREPE_TOOLBAR_LABELS[index];
    if (!label) return;
    button.setAttribute('aria-label', label);
    button.dataset.tooltip = label;
  });
}

export function observeCrepeToolbar(root: HTMLElement): () => void {
  annotateCrepeToolbar(root);
  const observer = new MutationObserver(() => annotateCrepeToolbar(root));
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}

