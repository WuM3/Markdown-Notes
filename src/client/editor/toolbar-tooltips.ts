import type { BlockFormat } from './toolbar-commands.js';

export const CREPE_TOOLBAR_LABELS = [
  '加粗',
  '斜体',
  '删除线',
  '行内代码',
  '链接',
  '格式',
] as const;

type ToolbarLabel = (typeof CREPE_TOOLBAR_LABELS)[number];
type MenuKind = 'format';

export interface CrepeToolbarMenuActions {
  formatBlock: (format: BlockFormat) => void;
}

const TOOLBAR_MENU_BY_INDEX: Record<number, MenuKind> = {
  5: 'format',
};

const FORMAT_ITEMS: Array<{ label: string; shortLabel: string; value: BlockFormat }> = [
  { label: '正文', shortLabel: '正文', value: 'paragraph' },
  { label: '一级标题', shortLabel: 'H1', value: 'h1' },
  { label: '二级标题', shortLabel: 'H2', value: 'h2' },
  { label: '三级标题', shortLabel: 'H3', value: 'h3' },
  { label: '四级标题', shortLabel: 'H4', value: 'h4' },
  { label: '五级标题', shortLabel: 'H5', value: 'h5' },
];

export function annotateCrepeToolbar(root: ParentNode): void {
  const buttons = root.querySelectorAll<HTMLButtonElement>(
    '.milkdown-toolbar .toolbar-item',
  );
  buttons.forEach((button, index) => {
    const label = CREPE_TOOLBAR_LABELS[index];
    if (!label) return;
    button.setAttribute('aria-label', label);
    button.dataset.tooltip = label;
    const menuKind = TOOLBAR_MENU_BY_INDEX[index];
    if (menuKind) {
      button.dataset.toolbarMenu = menuKind;
      button.setAttribute('aria-haspopup', 'menu');
      button.setAttribute('aria-expanded', 'false');
      updateDropdownLabel(root, button, label);
    } else {
      delete button.dataset.toolbarMenu;
      button.removeAttribute('aria-haspopup');
      button.removeAttribute('aria-expanded');
    }
  });
}

export function observeCrepeToolbar(
  root: HTMLElement,
  actions?: CrepeToolbarMenuActions,
): () => void {
  annotateCrepeToolbar(root);
  const controller = actions
    ? createToolbarMenuController(root, actions)
    : undefined;
  const observer = new MutationObserver(() => {
    annotateCrepeToolbar(root);
    controller?.refresh();
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    controller?.destroy();
  };
}

function updateDropdownLabel(
  root: ParentNode,
  button: HTMLButtonElement,
  label: ToolbarLabel,
): void {
  const current = button.querySelector<HTMLElement>('[data-toolbar-current]');
  if (!current) return;

  let nextText: string | undefined;
  if (label === '格式') {
    nextText = currentBlockFormat(root).shortLabel;
  }

  if (nextText && current.textContent !== nextText) {
    current.textContent = nextText;
  }
}

function createToolbarMenuController(
  root: HTMLElement,
  actions: CrepeToolbarMenuActions,
) {
  let menu: HTMLElement | undefined;
  let trigger: HTMLButtonElement | undefined;
  const owner = root.ownerDocument;

  const openFromTarget = (target: EventTarget | null) => {
    const nextTrigger = closestMenuTrigger(root, target);
    if (!nextTrigger) return;
    const kind = nextTrigger.dataset.toolbarMenu as MenuKind | undefined;
    if (!kind) return;
    openMenu(kind, nextTrigger);
  };

  const onPointerOver = (event: PointerEvent) => openFromTarget(event.target);
  const onFocusIn = (event: FocusEvent) => openFromTarget(event.target);
  const onPointerDown = (event: PointerEvent) => {
    const nextTrigger = closestMenuTrigger(root, event.target);
    if (!nextTrigger) return;
    event.preventDefault();
    openFromTarget(event.target);
  };
  const onDocumentPointerDown = (event: PointerEvent) => {
    if (
      menu?.contains(event.target as Node) ||
      trigger?.contains(event.target as Node)
    ) {
      return;
    }
    closeMenu();
  };

  root.addEventListener('pointerover', onPointerOver);
  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('pointerdown', onPointerDown);
  owner.addEventListener('pointerdown', onDocumentPointerDown);

  function openMenu(kind: MenuKind, nextTrigger: HTMLButtonElement) {
    if (trigger === nextTrigger && menu?.isConnected) return;
    closeMenu();
    annotateCrepeToolbar(root);
    trigger = nextTrigger;
    trigger.setAttribute('aria-expanded', 'true');

    menu = owner.createElement('div');
    menu.className = 'toolbar-popover-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', menuLabel(kind));
    menu.dataset.menuKind = kind;
    buildMenuItems(
      menu,
      kind,
      actions,
      closeMenu,
      root,
    );
    owner.body.append(menu);
    positionMenu(menu, trigger);
  }

  function closeMenu() {
    trigger?.setAttribute('aria-expanded', 'false');
    trigger = undefined;
    menu?.remove();
    menu = undefined;
  }

  return {
    refresh() {
      if (menu && trigger) {
        positionMenu(menu, trigger);
      }
    },
    destroy() {
      closeMenu();
      root.removeEventListener('pointerover', onPointerOver);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('pointerdown', onPointerDown);
      owner.removeEventListener('pointerdown', onDocumentPointerDown);
    },
  };
}

function buildMenuItems(
  menu: HTMLElement,
  kind: MenuKind,
  actions: CrepeToolbarMenuActions,
  closeMenu: () => void,
  root: HTMLElement,
) {
  const items = kind === 'format' ? FORMAT_ITEMS : [];
  const activeValue = kind === 'format' ? currentBlockFormat(root).value : undefined;

  const runMenuItem = (event: Event) => {
    const target = event.target;
    const element =
      target instanceof Element
        ? target
        : target instanceof Node
          ? target.parentElement
          : null;
    const button = element?.closest<HTMLButtonElement>('.toolbar-menu-item');
    if (!button || !menu.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    const value = button.dataset.value;
    if (!value) return;
    const activeKind = menu.dataset.menuKind as MenuKind;
    if (activeKind === 'format') actions.formatBlock(value as BlockFormat);
    closeMenu();
  };
  menu.addEventListener('pointerdown', runMenuItem);
  menu.addEventListener('click', runMenuItem);

  items.forEach((item) => {
    const button = menu.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'toolbar-menu-item';
    button.setAttribute('role', 'menuitem');
    button.dataset.value = item.value;
    if (item.value === activeValue) {
      button.dataset.active = 'true';
    }
    button.innerHTML = `<span>${item.label}</span><span class="toolbar-menu-check">✓</span>`;
    menu.append(button);
  });
}

function closestMenuTrigger(root: HTMLElement, target: EventTarget | null) {
  if (!(target instanceof Node)) return undefined;
  const element =
    target instanceof Element ? target : target.parentElement;
  const trigger = element?.closest<HTMLButtonElement>(
    '.milkdown-toolbar .toolbar-item[data-toolbar-menu]',
  );
  return trigger && root.contains(trigger) ? trigger : undefined;
}

function positionMenu(menu: HTMLElement, button: HTMLElement): void {
  const rect = button.getBoundingClientRect();
  const width = Math.max(176, menu.offsetWidth || 176);
  const left = Math.min(
    Math.max(8, rect.left),
    window.innerWidth - width - 8,
  );
  menu.style.left = `${left}px`;
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.minWidth = `${width}px`;
}

function menuLabel(kind: MenuKind): string {
  return kind === 'format' ? '格式' : '';
}

function currentBlockFormat(root: ParentNode) {
  const block = currentTextBlock(root);
  const tagName = block?.tagName.toLowerCase();
  const item =
    FORMAT_ITEMS.find((candidate) => candidate.value === tagName) ??
    FORMAT_ITEMS[0];
  return item;
}

function currentTextBlock(root: ParentNode): HTMLElement | undefined {
  const selection = root.ownerDocument?.getSelection();
  const anchor = selection?.anchorNode;
  if (!anchor) return undefined;
  const element =
    anchor instanceof Element ? anchor : anchor.parentElement;
  if (!element || !root.contains(element)) return undefined;
  return element.closest<HTMLElement>('p,h1,h2,h3,h4,h5,li') ?? undefined;
}
