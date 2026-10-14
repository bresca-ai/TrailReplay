import { useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { ElevationFocusSection } from './elevationSections';

interface ElevationSectionEditorProps {
  sections: ElevationFocusSection[];
  colors: Map<number, string>;
  onBoundaryChange: (
    section: ElevationFocusSection,
    edge: 'start' | 'end',
    progress: number,
  ) => void;
  onAdd: (progress: number) => void;
  onRemove: (section: ElevationFocusSection) => void;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function ElevationSectionEditor({
  sections,
  colors,
  onBoundaryChange,
  onAdd,
  onRemove,
}: ElevationSectionEditorProps) {
  const [isAdding, setIsAdding] = useState(false);
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

  const place = (event: MouseEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0) return;
    onAdd(clamp((event.clientX - bounds.left) / bounds.width));
    setIsAdding(false);
  };

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      data-elevation-section-editor
    >
      {isAdding && (
        <button
          type="button"
          aria-label="Place new zoom section"
          title="Click the profile to place a new zoom section"
          className="absolute inset-0 z-10 pointer-events-auto cursor-crosshair bg-white/5"
          onClick={place}
        />
      )}
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
            <button
              type="button"
              aria-label={`Remove section ${index + 1}`}
              title="Remove zoom section"
              className="absolute left-1/2 top-1 size-3.5 -translate-x-1/2 rounded-full border border-white/80 bg-black/70 text-[10px] font-bold leading-[10px] text-white shadow pointer-events-auto"
              onClick={() => onRemove(section)}
            >
              ×
            </button>
          </div>
        );
      })}
      <button
        type="button"
        aria-label={isAdding ? 'Cancel adding zoom section' : 'Add zoom section'}
        title={isAdding ? 'Cancel' : 'Add zoom section'}
        className="absolute bottom-0 right-0 z-20 size-6 rounded-full border border-white/80 bg-black/70 text-base font-bold leading-5 text-white shadow pointer-events-auto"
        onClick={() => setIsAdding((active) => !active)}
      >
        {isAdding ? '×' : '+'}
      </button>
    </div>
  );
}
