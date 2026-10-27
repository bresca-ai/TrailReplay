// The DOM marker's border is inside its diameter; MapLibre's stroke is outside
// its circle radius. Use matching outer dimensions in both comparison modes.
export const COMPARISON_MARKER_SIZE = 1.5;
export const COMPARISON_MARKER_BORDER = 2.5;
export const COMPARISON_MARKER_RADIUS = Math.round(14 * COMPARISON_MARKER_SIZE) / 2 - COMPARISON_MARKER_BORDER;
