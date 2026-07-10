import type { Crepe } from '@milkdown/crepe';
import { editorViewCtx, editorViewOptionsCtx } from '@milkdown/kit/core';
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
  hitAreaRect?: DOMRect;
}

export interface MarqueeHighlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface MarqueeBlockHitInput {
  selectionRect: DOMRect;
  fallbackRect: DOMRect;
  lineRects: DOMRect[];
  hitAreaRect: DOMRect;
}

export interface MarqueeHitInput {
  editorRoot: HTMLElement;
  editorRect: DOMRect;
  selectionRect: DOMRect;
  hitAreaRect?: DOMRect;
}

export interface MarqueeHit {
  block: HTMLElement;
  blockIndex: number;
  lineRects: DOMRect[];
  highlightRects: MarqueeHighlightRect[];
}

export interface MarqueeSelectionRange {
  from: number;
  to: number;
  selectNode: boolean;
}

export interface MarqueeDomBlockRangeInput {
  editorRoot: HTMLElement;
  block: HTMLElement;
  nodeSizes: number[];
  docSize: number;
}

export interface MarqueeDomBlockRange {
  from: number;
  to: number;
}

export interface MarqueeClearPositionInput {
  docSize: number;
  currentFrom: number;
  currentTo: number;
  clickPosition?: number;
}

export interface ImageInteractionOptions {
  getMarqueeRoot?: () => HTMLElement | null;
}

export function configureImageInteractions(
  crepe: Crepe,
  root: HTMLElement,
  options: ImageInteractionOptions = {},
): () => void {
  const cleanupImageHandles = observeImageBlocks(root);
  const pointerRoots = new Set<HTMLElement>([
    root,
    options.getMarqueeRoot?.() ?? root,
  ]);
  const handleOuterPointerDown = (event: PointerEvent) => {
    const view = getEditorView(crepe);
    if (!view) return;
    const interactionRoot = findOuterMarqueeRoot(
      event.target,
      pointerRoots,
    );
    if (!interactionRoot) return;
    if (!shouldHandleOuterMarqueePointerDown(event.target, view.dom, interactionRoot)) {
      return;
    }
    handleMarqueePointerDown(view, event, interactionRoot);
  };
  pointerRoots.forEach((pointerRoot) => {
    pointerRoot.addEventListener('pointerdown', handleOuterPointerDown);
  });

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

  return () => {
    pointerRoots.forEach((pointerRoot) => {
      pointerRoot.removeEventListener('pointerdown', handleOuterPointerDown);
    });
    cleanupImageHandles();
  };
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
  void point;
  if (!(target instanceof HTMLElement)) return false;
  if (!editorRoot.contains(target)) return false;
  if (
    target.closest(
      `${handleSelector}, button, input, textarea, select, a, img, ${imageBlockSelector}, .milkdown-code-block, .cm-editor`,
    )
  ) {
    return false;
  }
  if (target === editorRoot) return !isEditableRoot(editorRoot);

  const contentBlock = target.closest<HTMLElement>(
    'p, h1, h2, h3, h4, h5, li, blockquote, pre, table',
  );
  if (!contentBlock || !editorRoot.contains(contentBlock)) return true;

  return false;
}

export function shouldHandleOuterMarqueePointerDown(
  target: EventTarget | null,
  editorRoot: HTMLElement,
  interactionRoot: HTMLElement,
): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (!interactionRoot.contains(target)) return false;
  if (editorRoot.contains(target)) return false;
  return shouldStartMarqueeSelection(target, interactionRoot);
}

export function calculateMarqueeHighlightRects(
  input: MarqueeHighlightInput,
): MarqueeHighlightRect[] {
  const hitAreaRect = input.hitAreaRect ?? input.editorRect;
  return getMarqueeHitLineRects({
    selectionRect: input.selectionRect,
    fallbackRect: input.editorRect,
    lineRects: input.lineRects,
    hitAreaRect,
  }).map((rect) => marqueeHighlightRectFromLine(rect, input.editorRect));
}

export function isMarqueeBlockHit(input: MarqueeBlockHitInput): boolean {
  return getMarqueeHitLineRects(input).length > 0;
}

export function collectMarqueeHits(input: MarqueeHitInput): MarqueeHit[] {
  const hitAreaRect = input.hitAreaRect ?? input.editorRect;
  return getMarqueeSelectableChildren(input.editorRoot).flatMap(
    (block, blockIndex) => {
      const fallbackRect = block.getBoundingClientRect();
      if (fallbackRect.width <= 0 || fallbackRect.height <= 0) return [];

      const lineRects = getMarqueeHitLineRects({
        selectionRect: input.selectionRect,
        fallbackRect,
        lineRects: getElementLineRects(block),
        hitAreaRect,
      });
      if (!lineRects.length) return [];

      return [
        {
          block,
          blockIndex,
          lineRects,
          highlightRects: lineRects.map((rect) =>
            marqueeHighlightRectFromLine(rect, input.editorRect),
          ),
        },
      ];
    },
  );
}

export function resolveMarqueeDomBlockRange(
  input: MarqueeDomBlockRangeInput,
): MarqueeDomBlockRange | undefined {
  const children = getMarqueeSelectableChildren(input.editorRoot);
  if (children.length !== input.nodeSizes.length) return undefined;

  const blockIndex = children.findIndex((child) => child === input.block);
  if (blockIndex < 0) return undefined;

  const from = input.nodeSizes
    .slice(0, blockIndex)
    .reduce((total, size) => total + size, 0);
  const to = Math.min(from + input.nodeSizes[blockIndex], input.docSize);
  if (to <= from) return undefined;

  return { from, to };
}

export function resolveMarqueeSelectionRange(
  view: EditorView,
  hits: MarqueeHit[],
): MarqueeSelectionRange | undefined {
  if (!hits.length) return undefined;

  const firstHit = hits[0];
  const lastHit = hits[hits.length - 1];
  if (!firstHit || !lastHit) return undefined;

  if (hits.length === 1 && isImageBlockElement(firstHit.block)) {
    const range = findBlockRangeByDomIndex(view, firstHit.block);
    const pos = range?.from ?? findImageBlockPosition(view, firstHit.block);
    const to = range?.to ?? pos;
    if (pos === undefined || to === undefined || to <= pos) return undefined;
    return { from: pos, to, selectNode: true };
  }

  const from = findMarqueeHitStartPosition(view, firstHit);
  const to = findMarqueeHitEndPosition(view, lastHit);
  if (from === undefined || to === undefined || to <= from) return undefined;

  return { from, to, selectNode: false };
}

export function resolveMarqueeClearPosition(
  input: MarqueeClearPositionInput,
): number | undefined {
  if (input.currentFrom === input.currentTo) return undefined;
  const position = input.clickPosition ?? input.currentTo;
  return Math.max(0, Math.min(position, input.docSize));
}

export function isSuspiciousMarqueeStartPosition(input: {
  editorRoot: HTMLElement;
  block: HTMLElement;
  start: number;
}): boolean {
  if (input.start !== 0) return false;
  const blockIndex = getMarqueeSelectableChildren(input.editorRoot).findIndex(
    (child) => child === input.block,
  );
  return blockIndex > 0;
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
  overlayHost: HTMLElement = view.dom,
): boolean {
  if (event.button !== 0) return false;
  if (
    overlayHost === view.dom &&
    !shouldStartMarqueeSelection(event.target, view.dom, {
      clientX: event.clientX,
      clientY: event.clientY,
    })
  ) {
    return false;
  }

  const startX = event.clientX;
  const startY = event.clientY;
  const overlayRect = overlayHost.getBoundingClientRect();
  let didMove = false;
  let currentHits: MarqueeHit[] = [];

  const marquee = document.createElement('div');
  marquee.className = 'editor-marquee-selection';
  overlayHost.append(marquee);
  const highlights = document.createElement('div');
  highlights.className = 'editor-marquee-highlights';
  overlayHost.append(highlights);

  const updateMarquee = (moveEvent: PointerEvent) => {
    const left = Math.min(startX, moveEvent.clientX) - overlayRect.left;
    const top = Math.min(startY, moveEvent.clientY) - overlayRect.top;
    const width = Math.abs(moveEvent.clientX - startX);
    const height = Math.abs(moveEvent.clientY - startY);
    didMove ||= width > 4 || height > 4;

    marquee.style.left = `${left}px`;
    marquee.style.top = `${top}px`;
    marquee.style.width = `${width}px`;
    marquee.style.height = `${height}px`;
    marquee.dataset.active = didMove ? 'true' : 'false';
    currentHits = collectMarqueeHits({
      editorRoot: view.dom,
      editorRect: overlayRect,
      selectionRect: normalizeDomRect(startX, startY, moveEvent.clientX, moveEvent.clientY),
      hitAreaRect: overlayRect,
    });
    renderMarqueeHighlights(
      highlights,
      currentHits.flatMap((hit) => hit.highlightRects),
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
    if (!didMove) {
      clearMarqueeSelection(view, {
        clientX: upEvent.clientX,
        clientY: upEvent.clientY,
      });
      return;
    }

    const selectionRect = normalizeDomRect(startX, startY, upEvent.clientX, upEvent.clientY);
    const hits = collectMarqueeHits({
      editorRoot: view.dom,
      editorRect: overlayRect,
      selectionRect,
      hitAreaRect: overlayRect,
    });
    applyMarqueeSelection(view, hits.length ? hits : currentHits);
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function getEditorView(crepe: Crepe): EditorView | undefined {
  try {
    return crepe.editor.action((ctx) => ctx.get(editorViewCtx));
  } catch {
    return undefined;
  }
}

function findOuterMarqueeRoot(
  target: EventTarget | null,
  roots: Set<HTMLElement>,
): HTMLElement | undefined {
  if (!(target instanceof HTMLElement)) return undefined;
  return [...roots]
    .filter((root) => root.contains(target))
    .sort((a, b) => getElementDepth(b) - getElementDepth(a))[0];
}

function getElementDepth(element: HTMLElement): number {
  let depth = 0;
  let current: HTMLElement | null = element;
  while (current.parentElement) {
    depth += 1;
    current = current.parentElement;
  }
  return depth;
}

function applyMarqueeSelection(
  view: EditorView,
  hits: MarqueeHit[],
): void {
  const range = resolveMarqueeSelectionRange(view, hits);
  if (!range) return;

  if (range.selectNode) {
    view.focus();
    view.dispatch(
      view.state.tr
        .setSelection(NodeSelection.create(view.state.doc, range.from))
        .scrollIntoView(),
    );
    return;
  }

  view.focus();
  const selection = TextSelection.between(
    view.state.doc.resolve(range.from),
    view.state.doc.resolve(range.to),
  );
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
}

function clearMarqueeSelection(view: EditorView, point: PointerPoint): void {
  const clearPosition = resolveMarqueeClearPosition({
    docSize: view.state.doc.content.size,
    currentFrom: view.state.selection.from,
    currentTo: view.state.selection.to,
    clickPosition: findPointDocumentPosition(view, point),
  });
  if (clearPosition === undefined) return;

  try {
    const selection = TextSelection.near(
      view.state.doc.resolve(clearPosition),
      -1,
    );
    view.dispatch(view.state.tr.setSelection(selection));
    view.focus();
  } catch {
    // Some atom-only documents may not have a nearby text cursor position.
  }
}

function findPointDocumentPosition(
  view: EditorView,
  point: PointerPoint,
): number | undefined {
  try {
    return view.posAtCoords({
      left: point.clientX,
      top: point.clientY,
    })?.pos;
  } catch {
    return undefined;
  }
}

function getMarqueeSelectableChildren(editorRoot: HTMLElement): HTMLElement[] {
  return Array.from(editorRoot.children).filter((child) => {
    if (!(child instanceof HTMLElement)) return false;
    return !child.matches(`${marqueeSelector}, ${marqueeHighlightLayerSelector}`);
  }) as HTMLElement[];
}

function findImageBlockPosition(
  view: EditorView,
  block: HTMLElement,
): number | undefined {
  const blockRange = findBlockRangeByDomIndex(view, block);
  if (
    blockRange !== undefined &&
    view.state.doc.nodeAt(blockRange.from)?.type.name === 'image-block'
  ) {
    return blockRange.from;
  }

  const image = block.querySelector<HTMLElement>(imageSelector);
  const candidates = [
    ...findElementCoordinatePositions(view, block),
    safePosAtDom(view, block, 0),
    safePosAtDom(view, block, block.childNodes.length),
    image ? safePosAtDom(view, image, 0) : undefined,
  ];

  for (const pos of candidates) {
    const imagePos = findImageBlockStartAtPosition(view, pos);
    if (
      imagePos !== undefined &&
      isSuspiciousMarqueeStartPosition({
        editorRoot: view.dom,
        block,
        start: imagePos,
      })
    ) {
      continue;
    }
    if (imagePos !== undefined) return imagePos;
  }

  return undefined;
}

function findBlockStartPosition(
  view: EditorView,
  block: HTMLElement,
): number | undefined {
  const blockRange = findBlockRangeByDomIndex(view, block);
  if (blockRange !== undefined) return blockRange.from;

  const candidates = [
    ...findElementCoordinatePositions(view, block),
    safePosAtDom(view, block, 0),
    safePosAtDom(view, block, block.childNodes.length),
  ];

  for (const pos of candidates) {
    const start = findTopLevelBlockStartAtPosition(view, pos);
    if (
      start !== undefined &&
      isSuspiciousMarqueeStartPosition({
        editorRoot: view.dom,
        block,
        start,
      })
    ) {
      continue;
    }
    if (start !== undefined) return start;
  }

  return undefined;
}

function findBlockEndPosition(
  view: EditorView,
  block: HTMLElement,
): number | undefined {
  const blockRange = findBlockRangeByDomIndex(view, block);
  if (blockRange !== undefined) return blockRange.to;

  const start = findBlockStartPosition(view, block);
  if (start === undefined) return undefined;
  const node = view.state.doc.nodeAt(start);
  if (!node) return start;
  return Math.min(start + node.nodeSize, view.state.doc.content.size);
}

function findMarqueeHitStartPosition(
  view: EditorView,
  hit: MarqueeHit,
): number | undefined {
  if (shouldUseWholeBlockForMarqueeSelection(hit.block)) {
    return findBlockStartPosition(view, hit.block);
  }

  const line = hit.lineRects[0];
  const linePosition = line
    ? findLineEdgePosition(view, hit.block, line, 'start')
    : undefined;
  return linePosition ?? findBlockStartPosition(view, hit.block);
}

function findMarqueeHitEndPosition(
  view: EditorView,
  hit: MarqueeHit,
): number | undefined {
  if (shouldUseWholeBlockForMarqueeSelection(hit.block)) {
    return findBlockEndPosition(view, hit.block);
  }

  const line = hit.lineRects[hit.lineRects.length - 1];
  const linePosition = line
    ? findLineEdgePosition(view, hit.block, line, 'end')
    : undefined;
  return linePosition ?? findBlockEndPosition(view, hit.block);
}

function shouldUseWholeBlockForMarqueeSelection(block: HTMLElement): boolean {
  return isImageBlockElement(block) || block.matches('.milkdown-code-block');
}

function findLineEdgePosition(
  view: EditorView,
  block: HTMLElement,
  line: DOMRect,
  edge: 'start' | 'end',
): number | undefined {
  const y = line.top + line.height / 2;
  const x = edge === 'start' ? line.left + 1 : line.right + 1;
  const fallbackX = edge === 'start' ? line.left + 1 : line.right - 1;
  const pos =
    findPointDocumentPosition(view, { clientX: x, clientY: y }) ??
    findPointDocumentPosition(view, { clientX: fallbackX, clientY: y });
  if (pos === undefined) return undefined;

  const range = findBlockRangeByDomIndex(view, block);
  if (!range) return pos;

  const inlineFrom = Math.min(range.to, range.from + 1);
  const inlineTo = Math.max(inlineFrom, range.to - 1);
  return clamp(pos, inlineFrom, inlineTo);
}

function findBlockRangeByDomIndex(
  view: EditorView,
  block: HTMLElement,
): MarqueeDomBlockRange | undefined {
  const ranges = getTopLevelDomRanges(view);
  const range = ranges.find((item) => item.dom === block);
  if (range) return { from: range.from, to: range.to };

  const domChildren = getMarqueeSelectableChildren(view.dom);
  if (
    ranges.length !== view.state.doc.childCount ||
    ranges.some((item, index) => item.dom !== domChildren[index])
  ) {
    return undefined;
  }

  return resolveMarqueeDomBlockRange({
    editorRoot: view.dom,
    block,
    nodeSizes: ranges.map((range) => range.to - range.from),
    docSize: view.state.doc.content.size,
  });
}

function getTopLevelDomRanges(view: EditorView): Array<MarqueeDomBlockRange & {
  dom: HTMLElement;
}> {
  const ranges: Array<MarqueeDomBlockRange & { dom: HTMLElement }> = [];
  view.state.doc.forEach((node, offset) => {
    const nodeDOM = view.nodeDOM(offset);
    const element =
      nodeDOM instanceof HTMLElement ? nodeDOM : nodeDOM?.parentElement;
    const dom = element ? closestDirectChild(view.dom, element) : undefined;
    if (!dom) return;

    ranges.push({
      dom,
      from: offset,
      to: Math.min(offset + node.nodeSize, view.state.doc.content.size),
    });
  });
  return ranges;
}

function closestDirectChild(
  root: HTMLElement,
  element: HTMLElement,
): HTMLElement | undefined {
  let current: HTMLElement | null = element;
  while (current && current.parentElement !== root) {
    current = current.parentElement;
  }
  return current?.parentElement === root ? current : undefined;
}

function findElementCoordinatePositions(
  view: EditorView,
  element: HTMLElement,
): number[] {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return [];

  const points = [
    {
      left: rect.left + Math.min(8, Math.max(1, rect.width / 2)),
      top: rect.top + Math.min(12, Math.max(1, rect.height / 2)),
    },
    { left: rect.left + rect.width / 2, top: rect.top + rect.height / 2 },
    {
      left: rect.right - Math.min(8, Math.max(1, rect.width / 2)),
      top: rect.bottom - Math.min(12, Math.max(1, rect.height / 2)),
    },
  ];

  return points
    .map((point) => {
      try {
        return view.posAtCoords(point)?.pos;
      } catch {
        return undefined;
      }
    })
    .filter((pos): pos is number => pos !== undefined);
}

function findImageBlockStartAtPosition(
  view: EditorView,
  pos: number | undefined,
): number | undefined {
  if (pos === undefined) return undefined;

  const start = findTopLevelBlockStartAtPosition(view, pos);
  if (start !== undefined && isImageBlockNodeAt(view, start)) return start;

  const center = clampDocPosition(view, pos);
  const from = Math.max(0, center - 8);
  const to = Math.min(view.state.doc.content.size, center + 8);
  for (let candidate = from; candidate <= to; candidate += 1) {
    if (isImageBlockNodeAt(view, candidate)) return candidate;
  }

  return undefined;
}

function findTopLevelBlockStartAtPosition(
  view: EditorView,
  pos: number | undefined,
): number | undefined {
  if (pos === undefined) return undefined;

  const doc = view.state.doc;
  const clamped = clampDocPosition(view, pos);
  if (doc.nodeAt(clamped)?.isBlock) return clamped;

  const resolved = doc.resolve(clamped);
  for (let depth = 1; depth <= resolved.depth; depth += 1) {
    if (resolved.node(depth).isBlock) return resolved.before(depth);
  }

  const from = Math.max(0, clamped - 8);
  const to = Math.min(doc.content.size, clamped + 8);
  for (let candidate = from; candidate <= to; candidate += 1) {
    if (doc.nodeAt(candidate)?.isBlock) return candidate;
  }

  return undefined;
}

function isImageBlockNodeAt(view: EditorView, pos: number): boolean {
  return view.state.doc.nodeAt(pos)?.type.name === 'image-block';
}

function clampDocPosition(view: EditorView, pos: number): number {
  return Math.max(0, Math.min(pos, view.state.doc.content.size));
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

function isMarqueeRowHit(
  selectionRect: DOMRect,
  rowRect: DOMRect,
  hitAreaRect: DOMRect,
): boolean {
  const left = Math.max(
    hitAreaRect.left,
    Math.min(rowRect.left, hitAreaRect.right),
  );
  const right = Math.max(left, hitAreaRect.right);
  const rowBand = new DOMRect(
    left,
    rowRect.top,
    Math.max(1, right - left),
    rowRect.height,
  );
  return rectanglesIntersect(selectionRect, rowBand);
}

function getMarqueeHitLineRects(input: MarqueeBlockHitInput): DOMRect[] {
  const lineRects = mergeLineRects(input.lineRects);
  const hitRects = lineRects.length ? lineRects : [input.fallbackRect];
  return hitRects.filter((rect) =>
    isMarqueeRowHit(input.selectionRect, rect, input.hitAreaRect),
  );
}

function marqueeHighlightRectFromLine(
  lineRect: DOMRect,
  editorRect: DOMRect,
): MarqueeHighlightRect {
  return {
    left: Math.round(lineRect.left - editorRect.left),
    top: Math.round(lineRect.top - editorRect.top),
    width: Math.round(lineRect.width),
    height: Math.round(lineRect.height),
  };
}

function getElementLineRects(element: HTMLElement): DOMRect[] {
  if (isImageBlockElement(element)) {
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

function isImageBlockElement(element: HTMLElement): boolean {
  return element.matches(imageBlockSelector) || Boolean(element.querySelector(imageSelector));
}

function isEditableRoot(element: HTMLElement): boolean {
  return (
    element.classList.contains('ProseMirror') ||
    element.getAttribute('contenteditable') === 'true'
  );
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
