import type { ReactNode } from 'react';

/** Keep the recorder mounted when the user hides the sidebar during export. */
export function ExportAwareSidebar({ open, exporting, children }: { open: boolean; exporting: boolean; children: ReactNode }) {
  if (!open && !exporting) return null;
  return (
    <div hidden={!open} className={open ? 'w-80 h-full flex-shrink-0 border-r-2 border-[var(--evergreen)] overflow-hidden' : 'hidden'}>
      {children}
    </div>
  );
}
