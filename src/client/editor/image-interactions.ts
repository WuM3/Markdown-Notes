import type { Crepe } from '@milkdown/crepe';
import { editorViewOptionsCtx } from '@milkdown/kit/core';
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

const imageBlockSelector = '.milkdown-image-block';
const imageSelector = 'img[data-type="image-block"]';
const handleSelector = '[data-image-resize-corner]';
const marqueeSelector = '.editor-marquee-selection';
const marqueeHighlightLayerSelector = '.editor-marquee-highlights';
const minImageRatio = 0.2;
const maxImageRatio = 1;

const resizeCorners = [
  ['top-left', '左上缩放图片'],
  ['top-right', '右上缩放图片'],
  ['bottom-left', '左下缩放图片'],
  ['bottom-right', '右下缩放图片'],
] as const;

type ResizeCorner = (typeof resizeCorners)[number][0];

export interface CornerResizeInput {
  corner: ResizeCorner;
  startWidth: number;
  startHeight: number;
  deltaX: number;
  deltaY: number;
  minHeight: number;
  maxHeight: number;
}

export interface CornerResizeRatioInput {
  corner: ResizeCorner;
  startRatio: number;
  startWidth: number;
  startHeight: number;
  deltaX: number;
  deltaY: number;
  minRatio: number;
  maxRatio: number;
}

export interface ImageDisplaySizeInput {
  naturalWidth: number;
  naturalHeight: number;
  availableWidth: number;
  ratio: number;
  minRatio?: number;
  maxRatio?: number;
}

export interface ResizeGestureInput {
  deltaX: number;
  deltaY: number;
  startRatio: number;
  nextRatio: number;
  distanceThreshold?: number;
  ratioThreshold?: number;
}

export interface ResizeGestureStepInput extends ResizeGestureInput {
  active: boolean;
}

export interface ResizeGestureStep {
  active: boolean;
  resetAnchor: boolean;
  shouldResize: boolean;
}

export interface PointerPoint {
  clientX: number;
  clientY: number;
}

export interface MarqueeHighlightInput {
  editorRect: DOMRect;
  selectionRect: DOMRect;
  lineRects: DOMRect[];
}

export interface MarqueeHighlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function configureImageInteractions(
  crepe: Crepe,
  root: HTMLElement,
): () => void {
  const cleanupImageHandles = observeImageBlocks(root);

  crepe.editor.config((ctx) => {
    ctx.update(editorViewOptionsCtx, (options) => {
      const previousDomEvents = options.handleDOMEvents ?? {};
      return {
        ...options,
        handleDOMEvents: {
          ...previousDomEvents,
          copy(view, event) {
            if (copySelectedImage(view, event as ClipboardEvent)) return true;
            return previousDomEvents.copy?.(view, event) ?? false;
          },
          pointerdown(view, event) {
            if (handleImageResizePointerDown(view, event as PointerEvent)) {
              return true;
            }
            if (handleMarqueePointerDown(view, event as PointerEvent)) {
              return true;
            }
            return previousDomEvents.pointerdown?.(view, event) ?? false;
          },
        },
      };
    });
  });

  return cleanupImageHandles;
}

export function ensureImageResizeHandles(block: HTMLElement): void {
  const wrapper = block.querySelector<HTMLElement>(':scope > .image-wrapper');
  if (!wrapper) return;

  for (const [corner, label] of resizeCorners) {
    if (wrapper.querySelector(`[data-image-resize-corner="${corner}"]`)) {
      continue;
    }
    const handle = document.createElement('span');
    handle.className = `image-corner-resize-handle image-corner-resize-handle-${corner}`;
    handle.dataset.imageResizeCorner = corner;
    handle.setAttribute('aria-label', label);
    handle.setAttribute('role', 'button');
    handle.tabIndex = -1;
    wrapper.append(handle);
  }
}

export function calculateCornerResizeHeight(input: CornerResizeInput): number {
  const horizontalSign = input.corner.endsWith('right') ? 1 : -1;
  const verticalSign = input.corner.startsWith('bottom') ? 1 : -1;
  const widthScale =
    (input.startWidth + input.deltaX * horizontalSign) / input.startWidth;
  const heightScale =
    (input.startHeight + input.deltaY * verticalSign) / input.startHeight;
  const scale = Math.max(widthScale, heightScale, 0.2);
  return Math.round(clamp(input.startHeight * scale, input.minHeight, input.maxHeight));
}

export function calculateCornerResizeRatio(
  input: CornerResizeRatioInput,
): number {
  const horizontalSign = input.corner.endsWith('right') ? 1 : -1;
  const verticalSign = input.corner.startsWith('bottom') ? 1 : -1;
  const diagonal = Math.hypot(input.startWidth, input.startHeight) || 1;
  const projectedDelta =
    input.deltaX * horizontalSign * (input.startWidth / diagonal) +
    input.deltaY * verticalSign * (input.startHeight / diagonal);
  const scale = (diagonal + projectedDelta) / diagonal;
  return roundRatio(
    clamp(input.startRatio * Math.max(scale, 0.1), input.minRatio, input.maxRatio),
  );
}

export function calculateImageDisplaySize(input: ImageDisplaySizeInput): {
  width: number;
  height: number;
  ratio: number;
  maxWidth: number;
} {
  const availableWidth = Math.max(1, input.availableWidth || input.naturalWidth || 1);
  const naturalWidth = Math.max(1, input.naturalWidth || availableWidth);
  const naturalHeight = Math.max(1, input.naturalHeight || 1);
  const maxWidth = availableWidth;
  const ratio = roundRatio(
    clamp(
      input.ratio,
      input.minRatio ?? minImageRatio,
      input.maxRatio ?? maxImageRatio,
    ),
  );
  const width = Math.round(maxWidth * ratio);
  const height = Math.round((width / naturalWidth) * naturalHeight);

  return {
    width,
    height,
    ratio,
    maxWidth,
  };
}

export function isMeaningfulResizeGesture(input: ResizeGestureInput): boolean {
  const distance = Math.hypot(input.deltaX, input.deltaY);
  const ratioDelta = Math.abs(input.nextRatio - input.startRatio);
  return distance > 0 && ratioDelta > 0;
}

export function resolveResizeGestureStep(
  input: ResizeGestureStepInput,
): ResizeGestureStep {
  if (input.active) {
    return {
      active: true,
      resetAnchor: false,
      shouldResize: true,
    };
  }

  if (!isMeaningfulResizeGesture(input)) {
    return {
      active: false,
      resetAnchor: false,
      shouldResize: false,
    };
  }

  return {
    active: true,
    resetAnchor: false,
    shouldResize: true,
  };
}

export function createImageClipboardFallback(image: HTMLImageElement): {
  html: string;
  text: string;
} {
  const source = image.currentSrc || image.src || image.getAttribute('src') || '';
  const alt = image.alt || '';
  return {
    text: source,
    html: `<img src="${escapeHtmlAttribute(source)}" alt="${escapeHtmlAttribute(alt)}">`,
  };
}

export function shouldStartMarqueeSelection(
  target: EventTarget | null,
  editorRoot: HTMLElement,
  point?: PointerPoint,
): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (!editorRoot.contains(target)) return false;
  if (target.closest(`${handleSelector}, button, input, textarea, select, a, img, ${imageBlockSelector}`)) {
    return false;
  }
  if (target === editorRoot) return true;

  const contentBlock = target.closest<HTMLElement>(
    'p, h1, h2, h3, h4, h5, li, blockquote, pre, table',
  );
  if (!contentBlock || !editorRoot.contains(contentBlock)) return true;
  if (!point) return false;

  const contentRect = getContentRect(contentBlock);
  if (!contentRect) return false;

  return !isPointInsideRect(point, contentRect, 2);
}

export function calculateMarqueeHighlightRects(
  input: MarqueeHighlightInput,
): MarqueeHighlightRect[] {
  return mergeLineRects(input.lineRects)
    .filter((rect) => rectanglesIntersect(input.selectionRect, rect))
    .map((rect) => ({
      left: Math.round(rect.left - input.editorRect.left),
      top: Math.round(rect.top - input.editorRect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    }));
}

function observeImageBlocks(root: HTMLElement): () => void {
  const refresh = () => {
    root
      .querySelectorAll<HTMLElement>(imageBlockSelector)
      .forEach((block) => {
        ensureImageResizeHandles(block);
        const image = block.querySelector<HTMLImageElement>(imageSelector);
        if (image) normalizeImageDisplay(image);
      });
  };
  const handleImageLoad = (event: Event) => {
    if (!(event.target instanceof HTMLImageElement)) return;
    if (!event.target.matches(imageSelector)) return;
    window.setTimeout(() => normalizeImageDisplay(event.target as HTMLImageElement));
  };

  refresh();
  root.addEventListener('load', handleImageLoad, true);

  const observer = new MutationObserver(refresh);
  observer.observe(root, {
    childList: true,
    subtree: true,
  });

  return () => {
    root.removeEventListener('load', handleImageLoad, true);
    observer.disconnect();
  };
}

function handleImageResizePointerDown(
  view: EditorView,
  event: PointerEvent,
): boolean {
  if (event.button !== 0) return false;
  if (!(event.target instanceof HTMLElement)) return false;

  const handle = event.target.closest<HTMLElement>(handleSelector);
  if (!handle || !view.dom.contains(handle)) return false;

  const corner = parseResizeCorner(handle.dataset.imageResizeCorner);
  const block = handle.closest<HTMLElement>(imageBlockSelector);
  const image = block?.querySelector<HTMLImageElement>(imageSelector);
  if (!corner || !block || !image) return false;
  normalizeImageDisplay(image);

  const pos = findImageBlockPosition(view, block);
  if (pos !== undefined) {
    view.dispatch(
      view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)),
    );
  }

  const startRect = image.getBoundingClientRect();
  const startWidth = Math.max(startRect.width, 1);
  const startHeight = Math.max(startRect.height, 1);
  const maxWidth = getImageAvailableWidth(image);
  const startRatio = clamp(startWidth / Math.max(maxWidth, 1), minImageRatio, maxImageRatio);
  const startX = event.clientX;
  const startY = event.clientY;
  let currentRatio = roundRatio(startRatio);
  let resizeActive = false;
  let hasResized = false;

  event.preventDefault();
  event.stopPropagation();

  const onPointerMove = (moveEvent: PointerEvent) => {
    moveEvent.preventDefault();
    const activationDeltaX = moveEvent.clientX - startX;
    const activationDeltaY = moveEvent.clientY - startY;
    const activationRatio = calculateCornerResizeRatio({
      corner,
      startRatio,
      startWidth,
      startHeight,
      deltaX: activationDeltaX,
      deltaY: activationDeltaY,
      minRatio: minImageRatio,
      maxRatio: maxImageRatio,
    });
    const step = resolveResizeGestureStep({
      active: resizeActive,
      deltaX: activationDeltaX,
      deltaY: activationDeltaY,
      startRatio,
      nextRatio: activationRatio,
    });

    if (!step.active) {
      return;
    }
    resizeActive = true;

    currentRatio = activationRatio;
    hasResized = true;
    applyImageDisplayRatio(image, currentRatio, maxWidth);
  };

  const onPointerUp = () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);

    if (pos === undefined) return;
    const node = view.state.doc.nodeAt(pos);
    if (node?.type.name !== 'image-block') return;
    if (!Number.isFinite(currentRatio) || currentRatio <= 0) return;
    if (!hasResized) return;
    if (currentRatio === startRatio) return;

    view.dispatch(view.state.tr.setNodeAttribute(pos, 'ratio', currentRatio));
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  return true;
}

function copySelectedImage(view: EditorView, event: ClipboardEvent): boolean {
  const image = findSelectedImageElement(view.dom);
  if (!image) return false;

  const fallback = createImageClipboardFallback(image);
  event.clipboardData?.setData('text/plain', fallback.text);
  event.clipboardData?.setData('text/html', fallback.html);
  event.preventDefault();

  void writeImageToClipboard(image).catch(() => {
    // The synchronous HTML/text fallback above remains available.
  });

  return true;
}

function findSelectedImageElement(root: HTMLElement): HTMLImageElement | null {
  return root.querySelector<HTMLImageElement>(
    `${imageBlockSelector}.selected ${imageSelector}`,
  );
}

function normalizeImageDisplay(image: HTMLImageElement): void {
  if (!image.complete || !image.naturalWidth) return;
  applyImageDisplayRatio(image, readImageRatio(image));
}

function applyImageDisplayRatio(
  image: HTMLImageElement,
  ratio: number,
  availableWidth = getImageAvailableWidth(image),
): void {
  const size = calculateImageDisplaySize({
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    availableWidth,
    ratio,
  });
  const fullSize = calculateImageDisplaySize({
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    availableWidth,
    ratio: maxImageRatio,
  });

  image.dataset.displayRatio = size.ratio.toFixed(2);
  image.dataset.height = size.height.toFixed(2);
  image.dataset.origin = fullSize.height.toFixed(2);
  image.style.width = `${size.width}px`;
  image.style.maxWidth = '100%';
  image.style.height = 'auto';
  image.style.objectFit = 'contain';
}

function readImageRatio(image: HTMLImageElement): number {
  const displayRatio = Number(image.dataset.displayRatio);
  if (Number.isFinite(displayRatio) && displayRatio > 0) return displayRatio;

  const originHeight = Number(image.dataset.origin);
  const currentHeight = Number(image.dataset.height);
  if (Number.isFinite(originHeight) && originHeight > 0 && Number.isFinite(currentHeight)) {
    return currentHeight / originHeight;
  }

  return maxImageRatio;
}

function getImageAvailableWidth(image: HTMLImageElement): number {
  const blockWidth = image
    .closest<HTMLElement>(imageBlockSelector)
    ?.getBoundingClientRect().width;
  if (blockWidth && blockWidth > 0) return blockWidth;

  const editorWidth = image.closest<HTMLElement>('.ProseMirror')?.clientWidth;
  if (editorWidth && editorWidth > 0) return editorWidth;

  const parentWidth = image.parentElement?.getBoundingClientRect().width;
  if (parentWidth && parentWidth > 0) return parentWidth;

  return image.naturalWidth || image.getBoundingClientRect().width || 1;
}

async function writeImageToClipboard(image: HTMLImageElement): Promise<void> {
  const clipboard = navigator.clipboard;
  const ClipboardItemConstructor = globalThis.ClipboardItem;
  if (!clipboard?.write || !ClipboardItemConstructor) return;

  const source = image.currentSrc || image.src;
  if (!source) return;

  const response = await fetch(source);
  if (!response.ok) return;

  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) return;

  await clipboard.write([
    new ClipboardItemConstructor({
      [blob.type || 'image/png']: blob,
    }),
  ]);
}

function handleMarqueePointerDown(
  view: EditorView,
  event: PointerEvent,
): boolean {
  if (event.button !== 0) return false;
  if (
    !shouldStartMarqueeSelection(event.target, view.dom, {
      clientX: event.clientX,
      clientY: event.clientY,
    })
  ) {
    return false;
  }

  const startX = event.clientX;
  const startY = event.clientY;
  const editorRect = view.dom.getBoundingClientRect();
  let didMove = false;

  const marquee = document.createElement('div');
  marquee.className = 'editor-marquee-selection';
  view.dom.append(marquee);
  const highlights = document.createElement('div');
  highlights.className = 'editor-marquee-highlights';
  view.dom.append(highlights);

  const updateMarquee = (moveEvent: PointerEvent) => {
    const left = Math.min(startX, moveEvent.clientX) - editorRect.left;
    const top = Math.min(startY, moveEvent.clientY) - editorRect.top;
    const width = Math.abs(moveEvent.clientX - startX);
    const height = Math.abs(moveEvent.clientY - startY);
    didMove ||= width > 4 || height > 4;

    marquee.style.left = `${left}px`;
    marquee.style.top = `${top}px`;
    marquee.style.width = `${width}px`;
    marquee.style.height = `${height}px`;
    marquee.dataset.active = didMove ? 'true' : 'false';
    renderMarqueeHighlights(
      highlights,
      calculateMarqueeHighlightRects({
        editorRect,
        selectionRect: normalizeDomRect(startX, startY, moveEvent.clientX, moveEvent.clientY),
        lineRects: collectMarqueeLineRects(view.dom),
      }),
      didMove,
    );
  };

  const onPointerMove = (moveEvent: PointerEvent) => {
    updateMarquee(moveEvent);
  };

  const onPointerUp = (upEvent: PointerEvent) => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    marquee.remove();
    highlights.remove();
    if (!didMove) return;

    const selectionRect = normalizeDomRect(startX, startY, upEvent.clientX, upEvent.clientY);
    applyMarqueeSelection(view, selectionRect);
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function applyMarqueeSelection(view: EditorView, selectionRect: DOMRect): void {
  const blocks = Array.from(view.dom.children).filter((child) => {
    if (!(child instanceof HTMLElement)) return false;
    if (child.matches(`${marqueeSelector}, ${marqueeHighlightLayerSelector}`)) return false;
    return rectanglesIntersect(selectionRect, child.getBoundingClientRect());
  }) as HTMLElement[];

  if (!blocks.length) return;

  const firstBlock = blocks[0];
  const lastBlock = blocks[blocks.length - 1];
  if (!firstBlock || !lastBlock) return;

  if (blocks.length === 1 && firstBlock.matches(imageBlockSelector)) {
    const pos = findImageBlockPosition(view, firstBlock);
    if (pos === undefined) return;
    view.dispatch(
      view.state.tr
        .setSelection(NodeSelection.create(view.state.doc, pos))
        .scrollIntoView(),
    );
    return;
  }

  const from = findBlockStartPosition(view, firstBlock);
  const to = findBlockEndPosition(view, lastBlock);
  if (from === undefined || to === undefined || to <= from) return;

  const selection = TextSelection.between(
    view.state.doc.resolve(from),
    view.state.doc.resolve(to),
  );
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
}

function findImageBlockPosition(
  view: EditorView,
  block: HTMLElement,
): number | undefined {
  const selection = view.state.selection;
  if (
    selection instanceof NodeSelection &&
    selection.node.type.name === 'image-block'
  ) {
    return selection.from;
  }

  const domPosition = safePosAtDom(view, block, 0);
  if (domPosition === undefined) return undefined;

  for (const pos of [domPosition, domPosition - 1, domPosition + 1]) {
    if (pos < 0 || pos > view.state.doc.content.size) continue;
    if (view.state.doc.nodeAt(pos)?.type.name === 'image-block') return pos;
  }

  return undefined;
}

function findBlockStartPosition(
  view: EditorView,
  block: HTMLElement,
): number | undefined {
  const pos = safePosAtDom(view, block, 0);
  if (pos === undefined) return undefined;
  for (const candidate of [pos, pos - 1, pos + 1]) {
    if (candidate < 0 || candidate > view.state.doc.content.size) continue;
    if (view.state.doc.nodeAt(candidate)?.isBlock) return candidate;
  }
  return Math.max(0, Math.min(pos, view.state.doc.content.size));
}

function findBlockEndPosition(
  view: EditorView,
  block: HTMLElement,
): number | undefined {
  const start = findBlockStartPosition(view, block);
  if (start === undefined) return undefined;
  const node = view.state.doc.nodeAt(start);
  if (!node) return start;
  return Math.min(start + node.nodeSize, view.state.doc.content.size);
}

function safePosAtDom(
  view: EditorView,
  dom: HTMLElement,
  offset: number,
): number | undefined {
  try {
    return view.posAtDOM(dom, offset);
  } catch {
    return undefined;
  }
}

function parseResizeCorner(value: string | undefined): ResizeCorner | undefined {
  return resizeCorners.some(([corner]) => corner === value)
    ? (value as ResizeCorner)
    : undefined;
}

function normalizeDomRect(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): DOMRect {
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);
  return new DOMRect(left, top, width, height);
}

function rectanglesIntersect(a: DOMRect, b: DOMRect): boolean {
  return (
    a.left <= b.right &&
    a.right >= b.left &&
    a.top <= b.bottom &&
    a.bottom >= b.top
  );
}

function collectMarqueeLineRects(editorRoot: HTMLElement): DOMRect[] {
  const rects: DOMRect[] = [];
  for (const child of Array.from(editorRoot.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.matches(`${marqueeSelector}, ${marqueeHighlightLayerSelector}`)) {
      continue;
    }
    rects.push(...getElementLineRects(child));
  }
  return rects;
}

function getElementLineRects(element: HTMLElement): DOMRect[] {
  if (element.matches(imageBlockSelector)) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? [rect] : [];
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  const clientRects =
    typeof range.getClientRects === 'function'
      ? Array.from(range.getClientRects())
      : [];
  range.detach();

  const rects = clientRects.filter((rect) => rect.width > 0 && rect.height > 0);
  if (rects.length) return rects.map(domRectFromRect);

  const fallback = element.getBoundingClientRect();
  return fallback.width > 0 && fallback.height > 0 ? [fallback] : [];
}

function mergeLineRects(rects: DOMRect[]): DOMRect[] {
  const sorted = rects
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: DOMRect[] = [];

  for (const rect of sorted) {
    const existing = lines.find((line) => areRectsOnSameLine(line, rect));
    if (!existing) {
      lines.push(domRectFromRect(rect));
      continue;
    }

    const left = Math.min(existing.left, rect.left);
    const top = Math.min(existing.top, rect.top);
    const right = Math.max(existing.right, rect.right);
    const bottom = Math.max(existing.bottom, rect.bottom);
    const index = lines.indexOf(existing);
    lines[index] = new DOMRect(left, top, right - left, bottom - top);
  }

  return lines;
}

function areRectsOnSameLine(a: DOMRect, b: DOMRect): boolean {
  const centerA = a.top + a.height / 2;
  const centerB = b.top + b.height / 2;
  return Math.abs(centerA - centerB) <= Math.max(4, Math.min(a.height, b.height) / 2);
}

function renderMarqueeHighlights(
  layer: HTMLElement,
  rects: MarqueeHighlightRect[],
  active: boolean,
): void {
  layer.dataset.active = active && rects.length ? 'true' : 'false';
  layer.replaceChildren(
    ...rects.map((rect) => {
      const item = document.createElement('span');
      item.className = 'editor-marquee-highlight';
      item.style.left = `${rect.left}px`;
      item.style.top = `${rect.top}px`;
      item.style.width = `${rect.width}px`;
      item.style.height = `${rect.height}px`;
      return item;
    }),
  );
}

function domRectFromRect(rect: DOMRect | DOMRectReadOnly): DOMRect {
  return new DOMRect(rect.left, rect.top, rect.width, rect.height);
}

function getContentRect(element: HTMLElement): DOMRect | null {
  const range = document.createRange();
  range.selectNodeContents(element);
  const rangeRect =
    typeof range.getBoundingClientRect === 'function'
      ? range.getBoundingClientRect()
      : undefined;
  range.detach();

  if (rangeRect && rangeRect.width > 0 && rangeRect.height > 0) return rangeRect;

  const elementRect = element.getBoundingClientRect();
  if (elementRect.width > 0 && elementRect.height > 0) return elementRect;
  return null;
}

function isPointInsideRect(
  point: PointerPoint,
  rect: DOMRect,
  tolerance = 0,
): boolean {
  return (
    point.clientX >= rect.left - tolerance &&
    point.clientX <= rect.right + tolerance &&
    point.clientY >= rect.top - tolerance &&
    point.clientY <= rect.bottom + tolerance
  );
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundRatio(value: number): number {
  return Number.parseFloat(value.toFixed(2));
}
