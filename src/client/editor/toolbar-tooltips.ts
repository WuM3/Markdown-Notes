import type { BlockFormat } from './toolbar-commands.js';
import type { TextStyleInput } from './text-style.js';

export const CREPE_TOOLBAR_LABELS = [
  '加粗',
  '斜体',
  '删除线',
  '链接',
  '引用',
  '代码块',
  '颜色',
  '格式',
] as const;

type ToolbarLabel = (typeof CREPE_TOOLBAR_LABELS)[number];
type MenuKind = 'format' | 'color';

const MENU_CLOSE_DELAY_MS = 160;

export interface CrepeToolbarMenuActions {
  applyTextStyle: (style: TextStyleInput) => void;
  captureSelection?: () => void;
  formatBlock: (format: BlockFormat) => void;
  getTextStyle?: () => TextStyleInput;
}

const TOOLBAR_MENU_BY_INDEX: Record<number, MenuKind> = {
  6: 'color',
  7: 'format',
};

const FORMAT_ITEMS: Array<{ label: string; shortLabel: string; value: BlockFormat }> = [
  { label: '正文', shortLabel: '正文', value: 'paragraph' },
  { label: '一级标题', shortLabel: 'H1', value: 'h1' },
  { label: '二级标题', shortLabel: 'H2', value: 'h2' },
  { label: '三级标题', shortLabel: 'H3', value: 'h3' },
  { label: '四级标题', shortLabel: 'H4', value: 'h4' },
  { label: '五级标题', shortLabel: 'H5', value: 'h5' },
];

const TEXT_COLORS = [
  '#1f2937',
  '#6b7280',
  '#ef4444',
  '#f97316',
  '#ca8a04',
  '#16a34a',
  '#2563eb',
  '#7c3aed',
] as const;

const BACKGROUND_COLORS = [
  '',
  '#eef2f7',
  '#fecaca',
  '#fed7aa',
  '#fef08a',
  '#bbf7d0',
  '#bfdbfe',
  '#ddd6fe',
  '#e5e7eb',
  '#d1d5db',
  '#f87171',
  '#fb923c',
  '#facc15',
  '#4ade80',
  '#93c5fd',
  '#c4b5fd',
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
  let closeTimer: number | undefined;
  let suspendHoverOpen = false;
  const owner = root.ownerDocument;

  const openFromTarget = (target: EventTarget | null) => {
    const nextTrigger = closestMenuTrigger(root, target);
    if (!nextTrigger) return;
    const kind = nextTrigger.dataset.toolbarMenu as MenuKind | undefined;
    if (!kind) return;
    openMenu(kind, nextTrigger);
  };

  const onPointerOver = (event: PointerEvent) => {
    if (!suspendHoverOpen) openFromTarget(event.target);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!suspendHoverOpen) return;
    suspendHoverOpen = false;
    openFromTarget(event.target);
  };
  const onFocusIn = (event: FocusEvent) => {
    suspendHoverOpen = false;
    openFromTarget(event.target);
  };
  const onPointerDown = (event: PointerEvent) => {
    suspendHoverOpen = false;
    const nextTrigger = closestMenuTrigger(root, event.target);
    if (!nextTrigger) return;
    event.preventDefault();
    openFromTarget(event.target);
  };
  const onPointerOut = (event: PointerEvent) => {
    if (!menu || !trigger) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!trigger.contains(target) && !menu.contains(target)) return;

    const nextTarget = event.relatedTarget;
    if (
      nextTarget instanceof Node &&
      (trigger.contains(nextTarget) || menu.contains(nextTarget))
    ) {
      return;
    }
    scheduleCloseMenu();
  };
  const onOwnerPointerOver = (event: PointerEvent) => {
    if (!menu || !trigger) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (trigger.contains(target) || menu.contains(target)) {
      cancelScheduledClose();
    }
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
  const onScroll = () => repositionMenu();
  const onResize = () => repositionMenu();

  root.addEventListener('pointerover', onPointerOver);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('pointerdown', onPointerDown);
  owner.addEventListener('pointerout', onPointerOut);
  owner.addEventListener('pointerover', onOwnerPointerOver);
  owner.addEventListener('pointerdown', onDocumentPointerDown);
  owner.addEventListener('scroll', onScroll, true);
  owner.defaultView?.addEventListener('resize', onResize);

  function openMenu(kind: MenuKind, nextTrigger: HTMLButtonElement) {
    cancelScheduledClose();
    if (trigger === nextTrigger && menu?.isConnected) return;
    try {
      actions.captureSelection?.();
    } catch {
      // A transient DOM selection should not prevent the menu from opening.
    }
    let currentTextStyle: TextStyleInput | undefined;
    if (kind === 'color') {
      try {
        currentTextStyle = actions.getTextStyle?.();
      } catch {
        currentTextStyle = undefined;
      }
    }
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
      () => closeMenu(true),
      root,
      currentTextStyle,
    );
    owner.body.append(menu);
    positionMenu(menu, trigger);
  }

  function cancelScheduledClose() {
    if (closeTimer === undefined) return;
    owner.defaultView?.clearTimeout(closeTimer);
    closeTimer = undefined;
  }

  function scheduleCloseMenu() {
    cancelScheduledClose();
    const windowRef = owner.defaultView;
    if (!windowRef) {
      closeMenu();
      return;
    }
    closeTimer = windowRef.setTimeout(() => {
      closeTimer = undefined;
      closeMenu();
    }, MENU_CLOSE_DELAY_MS);
  }

  function closeMenu(suspendHover = false) {
    cancelScheduledClose();
    suspendHoverOpen = suspendHover;
    trigger?.setAttribute('aria-expanded', 'false');
    trigger = undefined;
    menu?.remove();
    menu = undefined;
  }

  function repositionMenu() {
    if (!menu || !trigger) return;
    if (!trigger.isConnected) {
      closeMenu();
      return;
    }
    positionMenu(menu, trigger);
  }

  return {
    refresh() {
      repositionMenu();
    },
    destroy() {
      closeMenu();
      root.removeEventListener('pointerover', onPointerOver);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('pointerdown', onPointerDown);
      owner.removeEventListener('pointerout', onPointerOut);
      owner.removeEventListener('pointerover', onOwnerPointerOver);
      owner.removeEventListener('pointerdown', onDocumentPointerDown);
      owner.removeEventListener('scroll', onScroll, true);
      owner.defaultView?.removeEventListener('resize', onResize);
    },
  };
}

function buildMenuItems(
  menu: HTMLElement,
  kind: MenuKind,
  actions: CrepeToolbarMenuActions,
  closeMenu: () => void,
  root: HTMLElement,
  currentTextStyle?: TextStyleInput,
) {
  if (kind === 'color') {
    buildColorMenuItems(menu, actions, closeMenu, currentTextStyle);
    return;
  }

  const items = FORMAT_ITEMS;
  const activeValue = kind === 'format' ? currentBlockFormat(root).value : undefined;

  let ignoreNextPointerClick = false;
  const runMenuItem = (event: Event) => {
    if (ignoreDuplicatePointerClick(event, ignoreNextPointerClick)) {
      ignoreNextPointerClick = false;
      return;
    }
    if (event.type === 'pointerdown') {
      ignoreNextPointerClick = true;
    }
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
    actions.formatBlock(value as BlockFormat);
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

function buildColorMenuItems(
  menu: HTMLElement,
  actions: CrepeToolbarMenuActions,
  closeMenu: () => void,
  currentTextStyle: TextStyleInput = {},
): void {
  menu.classList.add('toolbar-color-menu');
  const runStyle = (style: TextStyleInput) => {
    let ignoreNextPointerClick = false;
    return (event: Event) => {
      if (ignoreDuplicatePointerClick(event, ignoreNextPointerClick)) {
        ignoreNextPointerClick = false;
        return;
      }
      if (event.type === 'pointerdown') {
        ignoreNextPointerClick = true;
      }
      event.preventDefault();
      event.stopPropagation();
      actions.applyTextStyle(style);
      closeMenu();
    };
  };

  menu.append(
    colorSection(
      menu.ownerDocument,
      '字体颜色',
      TEXT_COLORS.map((color) => ({
        color,
        kind: 'color' as const,
        style: { color },
      })),
      runStyle,
      currentTextStyle,
    ),
  );
  menu.append(
    colorSection(
      menu.ownerDocument,
      '背景颜色',
      BACKGROUND_COLORS.map((backgroundColor) => ({
        color: backgroundColor,
        kind: 'background' as const,
        style: backgroundColor
          ? { backgroundColor }
          : { backgroundColor: null },
      })),
      runStyle,
      currentTextStyle,
    ),
  );

  const reset = menu.ownerDocument.createElement('button');
  reset.type = 'button';
  reset.className = 'toolbar-color-reset';
  reset.textContent = '恢复默认';
  const resetStyle = runStyle({
    color: null,
    backgroundColor: null,
  });
  reset.addEventListener('pointerdown', resetStyle);
  reset.addEventListener('click', resetStyle);
  menu.append(reset);
}

function colorSection(
  owner: Document,
  title: string,
  swatches: Array<{
    color: string;
    kind: 'color' | 'background';
    style: TextStyleInput;
  }>,
  runStyle: (style: TextStyleInput) => (event: Event) => void,
  currentTextStyle: TextStyleInput,
): HTMLElement {
  const section = owner.createElement('section');
  section.className = 'toolbar-color-section';

  const heading = owner.createElement('div');
  heading.className = 'toolbar-color-title';
  heading.textContent = title;
  section.append(heading);

  const grid = owner.createElement('div');
  grid.className = 'toolbar-color-grid';
  swatches.forEach((swatch) => {
    const button = owner.createElement('button');
    button.type = 'button';
    button.className = 'toolbar-color-swatch';
    button.dataset.styleKind = swatch.kind;
    button.dataset.styleValue = swatch.color;
    button.setAttribute('aria-label', `${title} ${swatch.color || '无'}`);
    const active = isActiveColorSwatch(swatch, currentTextStyle);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (active) {
      button.dataset.active = 'true';
    }
    if (swatch.color) {
      if (swatch.kind === 'color') {
        button.style.color = swatch.color;
      } else {
        button.style.backgroundColor = swatch.color;
      }
    } else {
      button.classList.add('is-empty');
    }
    button.textContent = swatch.kind === 'color' ? 'A' : '';
    const applySwatch = runStyle(swatch.style);
    button.addEventListener('pointerdown', applySwatch);
    button.addEventListener('click', applySwatch);
    grid.append(button);
  });
  section.append(grid);
  return section;
}

function ignoreDuplicatePointerClick(
  event: Event,
  ignoreNextPointerClick: boolean,
): boolean {
  if (
    event.type !== 'click' ||
    !ignoreNextPointerClick ||
    !(event instanceof MouseEvent) ||
    event.detail === 0
  ) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function isActiveColorSwatch(
  swatch: { color: string; kind: 'color' | 'background' },
  currentTextStyle: TextStyleInput,
): boolean {
  const current = swatch.kind === 'color'
    ? currentTextStyle.color
    : currentTextStyle.backgroundColor;
  return normalizeMenuColor(current) === normalizeMenuColor(swatch.color);
}

function normalizeMenuColor(color: string | null | undefined): string {
  return color?.trim().toLowerCase() ?? '';
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
  return kind === 'format' ? '格式' : '颜色';
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
  return element.closest<HTMLElement>('p,h1,h2,h3,h4,h5,li,.milkdown-code-block') ?? undefined;
}

