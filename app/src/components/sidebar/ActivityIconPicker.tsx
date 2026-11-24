import { useEffect, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, ImagePlus, X } from 'lucide-react';
import { Marker3DPreview } from './Marker3DPreview';
import { bytesToBase64, CUSTOM_ANIMATION_PREFIX, CUSTOM_MODEL_PREFIX, MAX_CUSTOM_GLB_BYTES, MAX_CUSTOM_SVG_BYTES, prepareCustomAnimation, validateCustomModel } from '@/utils/customMarker';
import { useI18n } from '@/i18n/useI18n';
import { ACTIVITY_ICONS, getActivityIconOption, is3DActivityIcon, isSingleEmoji, renderActivityIcon } from '@/utils/activityIcons';

type Category = 'emoji' | 'svg' | 'animated' | '3d' | 'upload';
const copy = {
  en: ['Emojis', 'Icons', 'Animated', 'Custom', 'Enter or paste any emoji', 'Use emoji', 'Choose a PNG image', 'Choose a valid PNG image under 5 MB.', 'The image could not be loaded.'],
  ca: ['Emojis', 'Icones', 'Animades', 'Personalitzat', 'Escriu o enganxa qualsevol emoji', 'Utilitza l’emoji', 'Tria una imatge PNG', 'Tria una imatge PNG vàlida de menys de 5 MB.', 'No s’ha pogut carregar la imatge.'],
  es: ['Emojis', 'Iconos', 'Animados', 'Personalizado', 'Escribe o pega cualquier emoji', 'Usar emoji', 'Elige una imagen PNG', 'Elige una imagen PNG válida de menos de 5 MB.', 'No se pudo cargar la imagen.'],
  fr: ['Emojis', 'Icônes', 'Animées', 'Personnel', 'Saisissez ou collez un emoji', 'Utiliser l’emoji', 'Choisir une image PNG', 'Choisissez une image PNG valide de moins de 5 Mo.', 'Impossible de charger l’image.'],
  de: ['Emojis', 'Symbole', 'Animiert', 'Eigenes', 'Emoji eingeben oder einfügen', 'Emoji verwenden', 'PNG-Bild auswählen', 'Wähle ein gültiges PNG unter 5 MB.', 'Das Bild konnte nicht geladen werden.'],
  'zh-TW': ['表情符號', '圖示', '動畫', '自訂', '輸入或貼上任何表情符號', '使用表情符號', '選擇 PNG 圖片', '請選擇小於 5 MB 的有效 PNG 圖片。', '無法載入圖片。'],
} as const;

const pickerCopy = {
  en: ['Use marker', 'Previous', 'Next', 'Choose a file to preview', 'Selected marker', 'Drag to rotate'],
  ca: ['Utilitza el marcador', 'Anterior', 'Següent', 'Tria un fitxer per previsualitzar-lo', 'Marcador seleccionat', 'Arrossega per girar'],
  es: ['Usar marcador', 'Anterior', 'Siguiente', 'Elige un archivo para previsualizarlo', 'Marcador seleccionado', 'Arrastra para girar'],
  fr: ['Utiliser le marqueur', 'Précédent', 'Suivant', 'Choisissez un fichier à prévisualiser', 'Marqueur sélectionné', 'Faites glisser pour tourner'],
  de: ['Markierung verwenden', 'Zurück', 'Weiter', 'Datei für Vorschau auswählen', 'Ausgewählte Markierung', 'Zum Drehen ziehen'],
  'zh-TW': ['使用標記', '上一個', '下一個', '選擇檔案以預覽', '已選標記', '拖曳旋轉'],
} as const;

const customCopy = {
  en: ['Choose PNG, animated SVG or GLB', 'PNG / GLB: 5 MB · SVG: 1 MB · SVG video loop: 8 s', 'Preparing animation…', 'Could not open this file. Use a valid, self-contained PNG, CSS-animated SVG or GLB within the size limit.', 'Have a marker that would look great in TrailReplay?', 'Add a comment with your file for review. Attach PNG or SVG directly; put GLB files in a ZIP first.', 'Suggest a marker'],
  ca: ['Tria un PNG, SVG animat o GLB', 'PNG / GLB: 5 MB · SVG: 1 MB · bucle de vídeo SVG: 8 s', 'Preparant l’animació…', 'No es pot obrir el fitxer. Fes servir un PNG, SVG animat amb CSS o GLB autònom i dins del límit.', 'Tens un marcador que quedaria bé a TrailReplay?', 'Afegeix un comentari amb el fitxer perquè el revisem. Adjunta PNG o SVG directament; posa els GLB en un ZIP.', 'Proposa un marcador'],
  es: ['Elige un PNG, SVG animado o GLB', 'PNG / GLB: 5 MB · SVG: 1 MB · bucle de vídeo SVG: 8 s', 'Preparando la animación…', 'No se pudo abrir el archivo. Usa un PNG, SVG animado con CSS o GLB autónomo dentro del límite.', '¿Tienes un marcador que quedaría bien en TrailReplay?', 'Añade un comentario con tu archivo para revisarlo. Adjunta PNG o SVG directamente; pon los GLB en un ZIP.', 'Proponer un marcador'],
  fr: ['Choisir un PNG, SVG animé ou GLB', 'PNG / GLB : 5 Mo · SVG : 1 Mo · boucle vidéo SVG : 8 s', 'Préparation de l’animation…', 'Impossible d’ouvrir le fichier. Utilisez un PNG, SVG animé en CSS ou GLB autonome dans la limite indiquée.', 'Un marqueur qui irait bien dans TrailReplay ?', 'Ajoutez un commentaire avec votre fichier. Joignez les PNG ou SVG directement et placez les GLB dans un ZIP.', 'Proposer un marqueur'],
  de: ['PNG, animiertes SVG oder GLB wählen', 'PNG / GLB: 5 MB · SVG: 1 MB · SVG-Videoschleife: 8 s', 'Animation wird vorbereitet…', 'Datei konnte nicht geöffnet werden. Verwende ein gültiges PNG, CSS-animiertes SVG oder eigenständiges GLB innerhalb des Limits.', 'Hast du eine passende Markierung für TrailReplay?', 'Schreibe einen Kommentar mit deiner Datei. PNG und SVG kannst du direkt anhängen; GLB bitte als ZIP.', 'Markierung vorschlagen'],
  'zh-TW': ['選擇 PNG、動畫 SVG 或 GLB', 'PNG / GLB：5 MB · SVG：1 MB · SVG 影片循環：8 秒', '正在準備動畫…', '無法開啟檔案。請使用大小限制內的有效 PNG、CSS 動畫 SVG 或獨立 GLB。', '有適合 TrailReplay 的標記嗎？', '在討論中留言並附上檔案供審核。PNG 和 SVG 可直接附加；GLB 請先壓縮為 ZIP。', '推薦標記'],
} as const;


export function ActivityIconPicker({ value, color, onSelect, onClose }: {
  value: string; color: string; onSelect: (value: string) => void; onClose: () => void;
}) {
  const { t, language } = useI18n();
  const labels = copy[language] ?? copy.en;
  const pickerLabels = pickerCopy[language] ?? pickerCopy.en;
  const customLabels = customCopy[language] ?? customCopy.en;
  const isCustom = (item: string) => item.startsWith('data:image/png;base64,') || item.startsWith(CUSTOM_ANIMATION_PREFIX) || item.startsWith(CUSTOM_MODEL_PREFIX);
  const initial = isCustom(value) ? 'upload' : ACTIVITY_ICONS.find((icon) => icon.value === value)?.kind ?? 'emoji';
  const [category, setCategory] = useState<Category>(initial);
  const [emoji, setEmoji] = useState('');
  const [selected, setSelected] = useState(value);
  const [uploaded, setUploaded] = useState(isCustom(value) ? value : '');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const categories: Category[] = ['emoji', 'svg', 'animated', '3d', 'upload'];
  const categoryItems = ACTIVITY_ICONS.filter(icon => icon.kind === category);
  const choices = category === 'emoji' && isSingleEmoji(selected) && !categoryItems.some(icon => icon.value === selected)
    ? [...categoryItems, { value: selected, labelKey: '', kind: 'emoji' as const, content: selected }]
    : categoryItems;
  const selectedIndex = choices.findIndex(icon => icon.value === selected);
  const firstVisible = Math.max(0, Math.min(Math.max(0, choices.length - 5), Math.max(0, selectedIndex - 2)));
  const visibleChoices = choices.slice(firstVisible, firstVisible + 5);
  const selectedOption = getActivityIconOption(selected);
  const canApply = !processing && (category === 'upload' ? !!uploaded && selected === uploaded : selectedIndex >= 0);
  const selectedName = category === 'upload' ? labels[3] : selectedOption ? (selectedOption.label ?? t(selectedOption.labelKey)) : selected;
  function chooseCategory(next: Category) {
    setCategory(next); setError('');
    if (next === 'upload') { setSelected(uploaded); return; }
    const current = getActivityIconOption(selected);
    if (current?.kind === next || (next === 'emoji' && isSingleEmoji(selected))) return;
    setSelected(ACTIVITY_ICONS.find(icon => icon.kind === next)?.value ?? '');
  }
  function moveSelection(step: number) {
    if (!choices.length) return;
    setSelected(choices[(Math.max(0, selectedIndex) + step + choices.length) % choices.length].value);
  }
  const previews: Record<Exclude<Category, 'upload'>, string> = {
    emoji: '🏃', svg: 'svg-running', animated: 'animated-runner-steady', '3d': '3d-runner',
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(''); setProcessing(true);
    try {
      const name = file.name.toLowerCase();
      let result: string;
      if (name.endsWith('.svg')) {
        if (file.size > MAX_CUSTOM_SVG_BYTES) throw new Error('SVG too large');
        result = await prepareCustomAnimation(await file.text());
      } else if (name.endsWith('.glb')) {
        if (file.size > MAX_CUSTOM_GLB_BYTES) throw new Error('GLB too large');
        const data = await file.arrayBuffer();
        await validateCustomModel(data);
        result = CUSTOM_MODEL_PREFIX + bytesToBase64(new Uint8Array(data));
      } else if (name.endsWith('.png') && file.size <= MAX_CUSTOM_GLB_BYTES) {
        const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
        if (bytes.join(',') !== '137,80,78,71,13,10,26,10') throw new Error('Invalid PNG');
        const image = await createImageBitmap(file);
        const scale = Math.min(1, 256 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unavailable');
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
        result = canvas.toDataURL('image/png');
      } else throw new Error('Unsupported file');
      setUploaded(result); setSelected(result);
    } catch { setError(customLabels[3]); }
    finally { setProcessing(false); }
  }

  return createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10231b]/65 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="marker-picker-title">
    <div className="flex max-h-[min(90vh,680px)] w-full max-w-[740px] flex-col overflow-hidden rounded-2xl border border-[var(--evergreen)]/20 bg-[var(--canvas)] shadow-[0_24px_80px_rgba(14,31,23,0.35)]">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--evergreen)]/15 px-5 py-4 sm:px-7 sm:py-5">
        <div className="min-w-0">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--trail-orange)]">TrailReplay</div>
          <h3 id="marker-picker-title" className="text-lg font-bold leading-tight text-[var(--evergreen)] sm:text-xl">{t('annotations.selectIcon')}</h3>
        </div>
        <button type="button" onClick={onClose} aria-label={t('common.cancel')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--evergreen)] hover:bg-[var(--evergreen)]/10"><X size={20} /></button>
      </header>

      <div className="flex min-h-0 flex-1">
        <div role="tablist" aria-label={t('annotations.selectIcon')} className="w-[108px] shrink-0 space-y-1 overflow-y-auto border-r border-[var(--evergreen)]/15 bg-[var(--evergreen)]/[0.035] p-2 sm:w-[205px] sm:p-3">
          {categories.map((item, index) => <button key={item} type="button" role="tab" disabled={processing} aria-selected={category === item} onClick={() => chooseCategory(item)} className={`flex min-h-[68px] w-full flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition-colors sm:min-h-[66px] sm:flex-row sm:justify-start sm:gap-3 sm:px-3 sm:text-left ${category === item ? 'border-[var(--trail-orange)]/40 bg-[var(--trail-orange-15)] text-[var(--evergreen)] shadow-sm' : 'border-transparent text-[var(--evergreen)]/75 hover:bg-white/70'}`}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/80 sm:h-10 sm:w-10">{item === 'upload' ? <ImagePlus size={21} /> : renderActivityIcon(previews[item], { size: 28, color: 'var(--evergreen)' })}</span>
            <span className="min-w-0 break-words text-[10px] font-bold leading-tight [overflow-wrap:anywhere] sm:text-xs">{item === '3d' ? '3D' : labels[index > 3 ? index - 1 : index]}</span>
          </button>)}
        </div>

        <section role="tabpanel" className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--evergreen)]/10 pb-3">
            <h4 className="text-base font-bold text-[var(--evergreen)] sm:text-lg">{category === '3d' ? '3D' : labels[categories.indexOf(category) > 3 ? categories.indexOf(category) - 1 : categories.indexOf(category)]}</h4>
            {category !== 'upload' && <span className="rounded-full bg-[var(--evergreen)]/[0.07] px-2.5 py-1 text-[11px] font-semibold text-[var(--evergreen)]/65">{ACTIVITY_ICONS.filter(icon => icon.kind === category).length}</span>}
          </div>
          <div className="relative flex min-h-[205px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-[var(--evergreen)]/10 bg-gradient-to-b from-white/80 to-[#e9e7dc] px-4 py-4 sm:min-h-[250px]">
            <div aria-hidden="true" className="absolute bottom-7 h-3 w-32 rounded-[100%] bg-[var(--evergreen)]/10 blur-sm" />
            {canApply ? (is3DActivityIcon(selected)
              ? <Marker3DPreview key={selected} value={selected} color={color} label={pickerLabels[5]} />
              : <div className="relative flex h-44 items-center justify-center sm:h-48">{renderActivityIcon(selected, { size: category === 'emoji' ? 115 : 160, color })}</div>)
              : <div className="flex h-44 flex-col items-center justify-center gap-3 text-center text-sm text-[var(--evergreen)]/60"><ImagePlus size={36} />{processing ? customLabels[2] : pickerLabels[3]}</div>}
          </div>
          {canApply && is3DActivityIcon(selected) && <p className="mt-2 text-center text-[11px] text-[var(--evergreen)]/60">{pickerLabels[5]}</p>}
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--evergreen)]/50">{pickerLabels[4]}</p><p className="truncate text-sm font-bold text-[var(--evergreen)]" aria-live="polite">{canApply ? selectedName : '—'}</p></div>
            {choices.length > 0 && <span className="text-xs tabular-nums text-[var(--evergreen)]/55">{selectedIndex + 1} / {choices.length}</span>}
          </div>
          {category !== 'upload' && <>
            <div className="mt-3 flex items-center gap-1.5 sm:gap-2">
              <button type="button" aria-label={pickerLabels[1]} onClick={() => moveSelection(-1)} className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--evergreen)]/20 text-[var(--evergreen)] hover:bg-white"><ChevronLeft size={18} /></button>
              <div className="grid min-w-0 flex-1 grid-cols-5 gap-1.5 sm:gap-2">
                {visibleChoices.map(icon => <button key={icon.value} type="button" title={icon.label ?? (icon.labelKey ? t(icon.labelKey) : icon.value)} aria-label={icon.label ?? (icon.labelKey ? t(icon.labelKey) : icon.value)} aria-pressed={selected === icon.value} onClick={() => setSelected(icon.value)} className={`relative flex aspect-square min-w-0 items-center justify-center rounded-lg border transition-colors ${selected === icon.value ? 'border-[var(--trail-orange)] bg-[var(--trail-orange-15)] ring-1 ring-[var(--trail-orange)]' : 'border-[var(--evergreen)]/15 bg-white/60 hover:border-[var(--trail-orange)]/60'}`}>
                  <span className="flex h-[82%] w-[82%] items-center justify-center [&>*]:max-h-full [&>*]:max-w-full">{renderActivityIcon(icon.value, { size: 40, color })}</span>
                  {selected === icon.value && <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--trail-orange)] text-white"><Check size={11} /></span>}
                </button>)}
              </div>
              <button type="button" aria-label={pickerLabels[2]} onClick={() => moveSelection(1)} className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--evergreen)]/20 text-[var(--evergreen)] hover:bg-white"><ChevronRight size={18} /></button>
            </div>
            {category === 'emoji' && <div className="mt-4 border-t border-[var(--evergreen)]/10 pt-3">
              <label htmlFor="marker-emoji" className="mb-2 block text-xs font-bold text-[var(--evergreen)]">{labels[4]}</label>
              <div className="flex flex-wrap gap-2"><input id="marker-emoji" aria-label={labels[4]} placeholder="🏃 🚴 🥾" value={emoji} onChange={(e) => setEmoji(e.target.value)} className="min-w-[110px] flex-1 rounded-lg border border-[var(--evergreen)]/25 bg-white/75 px-3 py-2 text-sm outline-none focus:border-[var(--trail-orange)]" /><button type="button" className="tr-btn tr-btn-secondary text-sm" disabled={!isSingleEmoji(emoji)} onClick={() => setSelected(emoji.trim())}>{labels[5]}</button></div>
            </div>}
          </>}
          {category === 'upload' && <div className="mt-4 text-center">
            <label className="tr-btn tr-btn-secondary inline-flex cursor-pointer text-sm" htmlFor="marker-png">{customLabels[0]}</label>
            <input id="marker-png" type="file" accept="image/png,.png,image/svg+xml,.svg,model/gltf-binary,.glb" disabled={processing} onChange={upload} className="sr-only" />
            <span className="mt-2 block text-xs text-[var(--evergreen)]/60">{customLabels[1]}</span>
            {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
            <div className="mt-5 border-t border-[var(--evergreen)]/15 pt-4 text-left">
              <p className="text-sm font-bold text-[var(--evergreen)]">{customLabels[4]}</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--evergreen)]/70">{customLabels[5]}</p>
              <a href="https://github.com/bresca-ai/TrailReplay/discussions/276" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-bold text-[var(--trail-orange)] underline">{customLabels[6]} ↗</a>
            </div>
          </div>}
        </section>
      </div>
      <footer className="flex justify-end gap-2 border-t border-[var(--evergreen)]/15 px-5 py-3 sm:px-7"><button type="button" onClick={onClose} className="tr-btn tr-btn-secondary text-sm">{t('common.cancel')}</button><button type="button" disabled={!canApply} onClick={() => onSelect(selected)} className="tr-btn tr-btn-primary text-sm disabled:opacity-40">{pickerLabels[0]}</button></footer>
    </div>
  </div>, document.body);
}
