import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import type { OverlayFont } from '@/types';
import { OVERLAY_FONT_OPTIONS, overlayFontFamily } from '@/utils/typography';

interface OverlayFontPickerProps {
  id: string;
  value: OverlayFont;
  onChange: (font: OverlayFont) => void;
}

export function OverlayFontPicker({ id, value, onChange }: OverlayFontPickerProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedOption = OVERLAY_FONT_OPTIONS.find((option) => option.id === value) ?? OVERLAY_FONT_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [open]);

  const choose = (font: OverlayFont) => {
    onChange(font);
    setOpen(false);
    document.getElementById(id)?.focus();
  };

  return <div ref={rootRef} className="relative w-full">
    <button
      id={id}
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={`${id}-options`}
      onClick={() => setOpen((current) => !current)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          setOpen(true);
          const selectedIndex = OVERLAY_FONT_OPTIONS.findIndex((option) => option.id === value);
          const nextIndex = event.key === 'ArrowDown'
            ? (selectedIndex + 1) % OVERLAY_FONT_OPTIONS.length
            : (selectedIndex - 1 + OVERLAY_FONT_OPTIONS.length) % OVERLAY_FONT_OPTIONS.length;
          requestAnimationFrame(() => optionRefs.current[nextIndex]?.focus());
        } else if (event.key === 'Escape') {
          setOpen(false);
        }
      }}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--evergreen)]/20 bg-[var(--canvas)] px-3 py-2 text-left text-[var(--evergreen)] outline-none transition-colors hover:border-[var(--trail-orange)] focus-visible:border-[var(--trail-orange)] focus-visible:ring-2 focus-visible:ring-[var(--trail-orange)]/20"
    >
      <span className="min-w-0 truncate text-base" style={{ fontFamily: overlayFontFamily(value) }}>{t(selectedOption.labelKey)}</span>
      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
    {open && <div
      id={`${id}-options`}
      role="listbox"
      aria-label={t('annotations.fontLabel')}
      className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-[var(--evergreen)]/15 bg-[var(--canvas)] p-1.5 shadow-xl"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          setOpen(false);
          document.getElementById(id)?.focus();
        }
      }}
    >
      {OVERLAY_FONT_OPTIONS.map((option, index) => <button
        key={option.id}
        ref={(element) => { optionRefs.current[index] = element; }}
        type="button"
        role="option"
        aria-selected={option.id === value}
        onClick={() => choose(option.id)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          const nextIndex = (index + (event.key === 'ArrowDown' ? 1 : -1) + OVERLAY_FONT_OPTIONS.length) % OVERLAY_FONT_OPTIONS.length;
          optionRefs.current[nextIndex]?.focus();
        }}
        className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--evergreen)]/10 focus-visible:bg-[var(--evergreen)]/10 focus-visible:outline-none ${option.id === value ? 'bg-[var(--trail-orange)]/10 text-[var(--evergreen)]' : 'text-[var(--evergreen)]'}`}
      >
        <span className="min-w-0 truncate text-lg leading-7" style={{ fontFamily: overlayFontFamily(option.id) }}>{t(option.labelKey)}</span>
        {option.id === value && <Check className="h-4 w-4 shrink-0 text-[var(--trail-orange)]" aria-hidden="true" />}
      </button>)}
    </div>}
  </div>;
}
