import { lazy, Suspense } from 'react';

const InfoPanel = lazy(() => import('./InfoPanel').then(module => ({ default: module.InfoPanel })));

export function AnimatedInfoPanel({ open, mounted, onClose }: { open: boolean; mounted: boolean; onClose: () => void }) {
  return (
    <div
      className={`h-full shrink-0 overflow-hidden transition-[width] duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${open ? 'w-80' : 'w-0'}`}
    >
      {mounted && <div className="h-full w-80" inert={!open} aria-hidden={!open}>
        <Suspense fallback={<div className="h-full bg-[var(--canvas)]" />}>
          <InfoPanel onClose={onClose} />
        </Suspense>
      </div>}
    </div>
  );
}
