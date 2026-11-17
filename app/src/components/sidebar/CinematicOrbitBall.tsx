import { useId, useRef } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { orbitPoseFromDrag } from '@/utils/cinematicOrbitInteraction';

interface CinematicOrbitBallProps {
  bearingDeg: number;
  pitchDeg: number;
  routeHeadingDeg: number | null;
  onChange: (next: { bearingDeg: number; pitchDeg: number }) => void;
}

const SIZE = 192;
const CENTER = SIZE / 2;
const RADIUS = 76;

function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Project compass and up axes into a small orientation indicator, not terrain. */
function projectAxis(east: number, north: number, up: number, bearingDeg: number, pitchDeg: number) {
  const bearing = bearingDeg * Math.PI / 180;
  const pitch = pitchDeg * Math.PI / 180;
  const x = east * Math.cos(bearing) - north * Math.sin(bearing);
  const forward = east * Math.sin(bearing) + north * Math.cos(bearing);
  const y = -forward * Math.cos(pitch) - up * Math.sin(pitch);
  const depth = up * Math.cos(pitch) - forward * Math.sin(pitch);
  return { x: CENTER + x * RADIUS * 0.7, y: CENTER + y * RADIUS * 0.7, depth };
}

export function CinematicOrbitBall({ bearingDeg, pitchDeg, onChange }: CinematicOrbitBallProps) {
  const { t } = useI18n();
  const gradientId = useId();
  const dragRef = useRef<{ x: number; y: number; bearing: number; pitch: number; pointerId: number } | null>(null);

  const axes = [
    { name: 'N', ...projectAxis(0, 1, 0, bearingDeg, pitchDeg) },
    { name: 'E', ...projectAxis(1, 0, 0, bearingDeg, pitchDeg) },
    { name: '↑', ...projectAxis(0, 0, 1, bearingDeg, pitchDeg) },
  ].sort((a, b) => a.depth - b.depth);

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <svg
        width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragRef.current = { x: event.clientX, y: event.clientY, bearing: bearingDeg, pitch: pitchDeg, pointerId: event.pointerId };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          onChange(orbitPoseFromDrag(drag.bearing, drag.pitch, event.clientX - drag.x, event.clientY - drag.y));
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return;
          dragRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { dragRef.current = null; }}
        onLostPointerCapture={() => { dragRef.current = null; }}
        className="h-auto w-full max-w-[192px] touch-none cursor-grab select-none rounded-full active:cursor-grabbing"
        role="img"
        aria-label={t('settings.cinematicCamera.orbitBallValue', { bearing: Math.round(normalizeAngle(bearingDeg)), pitch: Math.round(pitchDeg) })}
      >
        <defs>
          <radialGradient id={gradientId} cx="35%" cy="25%" r="75%">
            <stop offset="0%" stopColor="var(--canvas)" />
            <stop offset="100%" stopColor="#b5c4ae" stopOpacity="0.55" />
          </radialGradient>
        </defs>
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={`url(#${gradientId})`} stroke="var(--evergreen)" strokeOpacity="0.25" />
        <ellipse cx={CENTER} cy={CENTER} rx={RADIUS} ry={RADIUS * 0.35} fill="none" stroke="var(--evergreen)" strokeOpacity="0.13" />
        <ellipse cx={CENTER} cy={CENTER} rx={RADIUS * 0.4} ry={RADIUS} fill="none" stroke="var(--evergreen)" strokeOpacity="0.13" />
        {axes.map((axis) => (
          <g key={axis.name} opacity={axis.depth < 0 ? 0.5 : 1}>
            <line x1={CENTER} y1={CENTER} x2={axis.x} y2={axis.y} stroke="var(--evergreen)" strokeOpacity="0.45" strokeWidth="1.5" />
            <circle cx={axis.x} cy={axis.y} r="12" fill={axis.name === 'N' ? 'var(--trail-orange)' : 'var(--canvas)'} stroke="var(--evergreen)" strokeOpacity="0.3" />
            <text x={axis.x} y={axis.y} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="700" fill={axis.name === 'N' ? 'white' : 'var(--evergreen)'}>{axis.name}</text>
          </g>
        ))}
        <circle cx={CENTER} cy={CENTER} r="3" fill="var(--evergreen)" />
      </svg>
      <p className="max-w-[230px] text-center text-[11px] leading-relaxed text-[var(--evergreen-60)]">
        {t('settings.cinematicCamera.orbitBallHint')}
      </p>
    </div>
  );
}
