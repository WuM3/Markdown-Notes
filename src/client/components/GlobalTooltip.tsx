import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface SizeLike {
  width: number;
  height: number;
}

interface ViewportLike {
  width: number;
  height: number;
}

interface TooltipPosition {
  left: number;
  top: number;
  placement: 'top' | 'bottom';
}

export function computeTooltipPosition(
  target: RectLike,
  tooltip: SizeLike,
  viewport: ViewportLike,
): TooltipPosition {
  const gap = 8;
  const edge = 8;
  const placement = target.top >= tooltip.height + gap + edge ? 'top' : 'bottom';
  const preferredLeft = target.left + target.width / 2 - tooltip.width / 2;
  const left = Math.min(
    Math.max(edge, preferredLeft),
    Math.max(edge, viewport.width - tooltip.width - edge),
  );
  const top =
    placement === 'top'
      ? target.top - tooltip.height - gap
      : Math.min(viewport.height - tooltip.height - edge, target.top + target.height + gap);

  return { left, top, placement };
}

export function GlobalTooltip() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [label, setLabel] = useState('');
  const [position, setPosition] = useState<TooltipPosition>({
    left: 0,
    top: 0,
    placement: 'top',
  });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const showFor = (candidate: EventTarget | null) => {
      const element =
        candidate instanceof Element
          ? candidate.closest<HTMLElement>('[data-tooltip]')
          : null;
      if (!element?.dataset.tooltip) return;

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setTarget(element);
        setLabel(element.dataset.tooltip ?? '');
      }, 300);
    };

    const hide = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = undefined;
      setTarget(null);
      setLabel('');
    };

    const handlePointerOver = (event: PointerEvent) => showFor(event.target);
    const handlePointerOut = (event: PointerEvent) => {
      const from =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-tooltip]')
          : null;
      const to =
        event.relatedTarget instanceof Element
          ? event.relatedTarget.closest<HTMLElement>('[data-tooltip]')
          : null;
      if (from !== to) hide();
    };
    const handleFocusIn = (event: FocusEvent) => showFor(event.target);
    const handleFocusOut = (event: FocusEvent) => {
      if (
        event.relatedTarget instanceof Element &&
        event.relatedTarget.closest('[data-tooltip]') ===
          (event.target instanceof Element
            ? event.target.closest('[data-tooltip]')
            : null)
      ) {
        return;
      }
      hide();
    };

    document.addEventListener('pointerover', handlePointerOver);
    document.addEventListener('pointerout', handlePointerOut);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);

    return () => {
      hide();
      document.removeEventListener('pointerover', handlePointerOver);
      document.removeEventListener('pointerout', handlePointerOut);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, []);

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    if (!target || !tooltip) return;
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    setPosition(
      computeTooltipPosition(
        targetRect,
        tooltipRect,
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [label, target]);

  if (!target || !label) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      role="tooltip"
      className="global-tooltip"
      data-placement={position.placement}
      style={{ left: position.left, top: position.top }}
    >
      {label}
    </div>,
    document.body,
  );
}

