import type { ReactNode } from 'react';
import { useDesktopSidebar } from './useDesktopSidebar';

/** Keep the recorder mounted when the user hides the sidebar during export. */
export function ExportAwareSidebar({ open, exporting, children }: { open: boolean; exporting: boolean; children: ReactNode }) {
  const desktop = useDesktopSidebar();
  if (!open && !exporting && !desktop) return null;
  return (
    <div hidden={!open && !desktop} className="w-80 lg:w-auto h-full flex-shrink-0 border-r-2 border-[var(--evergreen)] overflow-hidden">
      {children}
    </div>
  );
}
