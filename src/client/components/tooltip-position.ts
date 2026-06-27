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

export interface TooltipPosition {
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
      : Math.min(
          viewport.height - tooltip.height - edge,
          target.top + target.height + gap,
        );

  return { left, top, placement };
}
