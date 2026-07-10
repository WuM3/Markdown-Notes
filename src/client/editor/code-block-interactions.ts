const codeBlockSelector = '.milkdown-code-block';
const collapseButtonSelector = '.code-collapse-button';
const formatButtonSelector = '.code-format-button';

export type CodeBlockFormat = 'paragraph';

export interface CodeBlockInteractionOptions {
  formatCodeBlock?: (block: HTMLElement, format: CodeBlockFormat) => void;
}

export function configureCodeBlockInteractions(
  root: HTMLElement,
  options: CodeBlockInteractionOptions = {},
): () => void {
  enhanceCodeBlocks(root, options);
  const observer = new MutationObserver(() => enhanceCodeBlocks(root, options));
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}

export function enhanceCodeBlocks(
  root: ParentNode,
  options: CodeBlockInteractionOptions = {},
): void {
  root
    .querySelectorAll<HTMLElement>(codeBlockSelector)
    .forEach((block) => enhanceCodeBlock(block, options));
}

function enhanceCodeBlock(
  block: HTMLElement,
  options: CodeBlockInteractionOptions,
): void {
  const tools = block.querySelector<HTMLElement>(':scope > .tools');
  if (!tools) return;
  ensureCollapseButton(block, tools);
  ensureFormatButton(block, tools, options);
}

function ensureCollapseButton(block: HTMLElement, tools: HTMLElement): void {
  if (tools.querySelector(collapseButtonSelector)) return;

  const button = block.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'code-collapse-button';
  button.innerHTML = '<span aria-hidden="true">▾</span>';
  setButtonState(button, false);
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const collapsed = !block.classList.contains('is-collapsed');
    block.classList.toggle('is-collapsed', collapsed);
    setButtonState(button, collapsed);
  });

  tools.prepend(button);
}

function ensureFormatButton(
  block: HTMLElement,
  tools: HTMLElement,
  options: CodeBlockInteractionOptions,
): void {
  if (!options.formatCodeBlock) return;
  if (tools.querySelector(formatButtonSelector)) return;

  const button = block.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'code-format-button';
  button.textContent = '正文';
  button.setAttribute('aria-label', '转为正文');
  button.dataset.tooltip = '转为正文';
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    options.formatCodeBlock?.(block, 'paragraph');
  });

  const buttonGroup = tools.querySelector<HTMLElement>('.tools-button-group');
  tools.insertBefore(button, buttonGroup ?? null);
}

function setButtonState(button: HTMLButtonElement, collapsed: boolean): void {
  const label = collapsed ? '展开代码块' : '收起代码块';
  button.setAttribute('aria-label', label);
  button.dataset.tooltip = label;
  button.querySelector('span')?.replaceChildren(collapsed ? '▸' : '▾');
}
