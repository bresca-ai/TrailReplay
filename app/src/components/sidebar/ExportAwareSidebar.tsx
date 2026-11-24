import { useContext, type ReactNode } from 'react';
import { MenuDesignContext } from './menuDesign';
import { useDesktopSidebar } from './useDesktopSidebar';

/** Keep the recorder mounted when the user hides the sidebar during export. */
export function ExportAwareSidebar({ open, exporting, children }: { open: boolean; exporting: boolean; children: ReactNode }) {
  const desktop = useDesktopSidebar();
  const newMenu = useContext(MenuDesignContext) === 'new';
  if (!open && !exporting && !desktop && !newMenu) return null;
  return (
    <div hidden={!open && (exporting || (!desktop && !newMenu))} className={`${exporting ? "max-lg:invisible" : ""} ${newMenu ? "absolute inset-x-0 bottom-0 z-40 flex-shrink-0 lg:relative lg:inset-auto lg:z-10 lg:h-full lg:border-r-2 lg:border-[var(--evergreen)]" : "absolute inset-y-0 left-0 z-40 w-80 max-w-full border-r-2 border-[var(--evergreen)] overflow-hidden lg:relative lg:z-10 lg:h-full lg:flex-shrink-0"}`}>
      {children}
    </div>
  );
}
