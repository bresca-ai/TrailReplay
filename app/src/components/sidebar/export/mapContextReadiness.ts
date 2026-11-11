/** Fail an export instead of silently recording blank frames after GPU loss. */
export function assertMapContextAvailable(canvas: Pick<HTMLCanvasElement, 'getContext'>): void {
  const context = canvas.getContext('webgl2');
  if (!context || context.isContextLost()) {
    throw new Error('The map graphics context was lost. Reload the map and retry the export.');
  }
}
