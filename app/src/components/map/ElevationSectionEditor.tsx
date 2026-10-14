import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ElevationFocusSection } from './elevationSections';

interface ElevationSectionEditorProps {
  sections: ElevationFocusSection[];
  colors: Map<number, string>;
  onBoundaryChange: (
    section: ElevationFocusSection,
    edge: 'start' | 'end',
    progress: number,
  ) => void;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function ElevationSectionEditor({
  sections,
  colors,
  onBoundaryChange,
}: ElevationSectionEditorProps) {
  const drag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const move = (
    section: ElevationFocusSection,
    edge: 'start' | 'end',
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const bounds = event.currentTarget.parentElement?.parentElement?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return;
    onBoundaryChange(section, edge, clamp((event.clientX - bounds.left) / bounds.width));
  };

  return (
    <div
      className="absolute inset-x-0 top-0 h-4 pointer-events-none"
      data-elevation-section-editor
    >
      {sections.map((section, index) => {
        const left = section.startProgress * 100;
        const width = Math.max(0.4, (section.endProgress - section.startProgress) * 100);
        const color = colors.get(section.segmentIndex) ?? '#f3b133';
        return (
          <div
            key={section.id}
            className="absolute top-0 h-1 rounded-full pointer-events-auto"
            style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color }}
            data-elevation-section-range={section.id}
          >
            {(['start', 'end'] as const).map((edge) => (
              <button
                key={edge}
                type="button"
                aria-label={`Adjust section ${index + 1} ${edge}`}
                title={`Drag to adjust section ${edge}`}
                className={`absolute top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-white shadow-md pointer-events-auto touch-none cursor-ew-resize ${
                  edge === 'start' ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2'
                }`}
                style={{ backgroundColor: color }}
                onPointerDown={drag}
                onPointerMove={(event) => move(section, edge, event)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
