interface Frame {
  containerRect: DOMRect;
  cropX: number;
  cropY: number;
  scaleX: number;
  scaleY: number;
}

/** Read the live layout, but paint changing ranks and gaps on every video frame. */
export function drawComparisonLeaderboard(context: CanvasRenderingContext2D, element: HTMLElement | null, frame: Frame) {
  if (!element) return;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const x = (rect.left - frame.containerRect.left - frame.cropX) * frame.scaleX;
  const y = (rect.top - frame.containerRect.top - frame.cropY) * frame.scaleY;
  const scale = rect.width / (element.offsetWidth || rect.width);
  const panel = element.dataset.leaderboardBackground !== 'transparent';
  context.save();
  if (panel) {
    context.fillStyle = 'rgba(9,14,19,0.9)';
    context.beginPath();
    context.roundRect(x, y, rect.width * frame.scaleX, rect.height * frame.scaleY, 12 * scale * frame.scaleX);
    context.fill();
  } else {
    context.shadowColor = 'rgba(0,0,0,0.95)';
    context.shadowBlur = 4 * scale * frame.scaleY;
    context.shadowOffsetY = scale * frame.scaleY;
  }
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  for (const text of element.querySelectorAll<HTMLElement>('[data-leaderboard-text]')) {
    const bounds = text.getBoundingClientRect();
    const style = getComputedStyle(text);
    context.font = `${style.fontWeight || '400'} ${parseFloat(style.fontSize) * scale * frame.scaleY}px ${getComputedStyle(element).fontFamily}`;
    context.letterSpacing = `${(parseFloat(style.letterSpacing) || 0) * scale * frame.scaleX}px`;
    context.fillStyle = style.color || '#ffffff';
    let value = text.textContent ?? '';
    if (style.textTransform === 'uppercase') value = value.toUpperCase();
    if (style.textTransform === 'lowercase') value = value.toLowerCase();
    const width = bounds.width * frame.scaleX;
    if (context.measureText(value).width > width) {
      while (value.length && context.measureText(`${value}…`).width > width) value = value.slice(0, -1);
      value += '…';
    }
    context.fillText(value, (bounds.left - frame.containerRect.left - frame.cropX) * frame.scaleX, (bounds.top + bounds.height / 2 - frame.containerRect.top - frame.cropY) * frame.scaleY);
  }
  for (const dot of element.querySelectorAll<HTMLElement>('[data-leaderboard-color]')) {
    const bounds = dot.getBoundingClientRect();
    context.fillStyle = dot.dataset.leaderboardColor!;
    context.beginPath();
    context.arc((bounds.left + bounds.width / 2 - frame.containerRect.left - frame.cropX) * frame.scaleX, (bounds.top + bounds.height / 2 - frame.containerRect.top - frame.cropY) * frame.scaleY, bounds.width / 2 * frame.scaleX, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}
