import { wrapText } from '@/components/map/annotationCardText';
import type { SideAnnotationTypography } from './sideAnnotationTypography';

interface SideAnnotationCopy {
  title: string;
  meta: string | null;
  description: string | null;
}

export interface SideAnnotationCanvasLines {
  title: string[];
  meta: string[];
  description: string[];
  panelHeight: number;
}

export type SideAnnotationTextRole = 'title' | 'meta' | 'description';

/**
 * Lay out exported side-panel copy before drawing its shade.
 *
 * The browser grows the live panel for all of its text. The canvas exporter
 * used to cap the title at three lines and the description at twelve, while
 * sizing the shade from the browser's independently wrapped panel. A long stop
 * could therefore use more canvas lines than the measured shade had room for.
 * Keeping every wrapped line and calculating the required height first makes
 * the canvas background grow with exactly what will be painted on it.
 */
export function layoutSideAnnotationCanvasText(
  copy: SideAnnotationCopy,
  typography: SideAnnotationTypography,
  maxWidth: number,
  measure: (role: SideAnnotationTextRole, text: string) => { width: number },
): SideAnnotationCanvasLines {
  const linesFor = (role: SideAnnotationTextRole, value: string | null) => value
    ? wrapText({ measureText: (text) => measure(role, text) }, value, maxWidth, Number.MAX_SAFE_INTEGER)
    : [];

  const title = linesFor('title', copy.title);
  const meta = linesFor('meta', copy.meta);
  const description = linesFor('description', copy.description);

  // Mirrors the live panel's vertical CSS: padding, 35px header, margins,
  // line heights, divider padding, and bottom padding.
  const panelHeight = 18 + 35
    + 12 + title.length * typography.titleSize * 1.25
    + (meta.length > 0 ? 10 + meta.length * typography.metaSize * 1.4 : 0)
    + (description.length > 0 ? 13 + 1 + 11 + description.length * typography.detailsSize * 1.55 : 0)
    + 18;

  return { title, meta, description, panelHeight };
}
