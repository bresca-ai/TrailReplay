export const CUSTOM_ANIMATION_PREFIX = 'trailreplay-animation:';
export const CUSTOM_MODEL_PREFIX = 'data:model/gltf-binary;base64,';
export const MAX_CUSTOM_SVG_BYTES = 1024 * 1024;
export const MAX_CUSTOM_GLB_BYTES = 5 * 1024 * 1024;
export const CUSTOM_ANIMATION_DURATION = 8000;

interface CustomAnimation { svg: string; sprite: string; duration: number }
const animations = new Map<string, CustomAnimation>();
const animationKeys = new Map<string, string>();

export function customAnimationKey(value: string): string {
  const cached = animationKeys.get(value);
  if (cached) return cached;
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  const key = `${value.length}-${hash >>> 0}`;
  if (animationKeys.size >= 20) animationKeys.delete(animationKeys.keys().next().value!);
  animationKeys.set(value, key);
  return key;
}
export function getCustomAnimation(value: string): CustomAnimation | undefined {
  if (!value.startsWith(CUSTOM_ANIMATION_PREFIX)) return undefined;
  const key = customAnimationKey(value);
  const cached = animations.get(key);
  if (cached) return cached;
  try {
    const data = JSON.parse(atob(value.slice(CUSTOM_ANIMATION_PREFIX.length))) as CustomAnimation;
    if (!data.svg?.startsWith('data:image/svg+xml,') || !data.sprite?.startsWith('data:image/png;base64,') || data.duration !== CUSTOM_ANIMATION_DURATION) return undefined;
    animations.set(key, data); return data;
  } catch { return undefined; }
}
export function customAnimationByKey(key: string): CustomAnimation | undefined { return animations.get(key); }

function hasExternalCssUrl(value: string): boolean {
  return [...value.matchAll(/url\s*\(([^)]*)\)/gi)].some(match => !match[1].trim().replace(/^['"]|['"]$/g, '').startsWith('#'));
}

/** Disallow active content and external resources before mounting SVG for frame sampling. */
export function sanitizeAnimatedSvg(source: string): SVGSVGElement {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('Invalid SVG');
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('Invalid SVG');
  const root = doc.documentElement;
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (['script', 'foreignobject', 'iframe', 'object', 'embed', 'image', 'audio', 'video', 'a', 'animate', 'animatemotion', 'animatetransform', 'set'].includes(element.localName.toLowerCase())) throw new Error('Unsupported SVG content');
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase(), value = attribute.value.trim();
      if (name.startsWith('on') || name === 'xml:base') throw new Error('Unsupported SVG content');
      if ((name === 'href' || name === 'xlink:href') && !value.startsWith('#')) throw new Error('External SVG resource');
      if (hasExternalCssUrl(value) || (name === 'style' && /\\|@import|expression\s*\(/i.test(value))) throw new Error('External SVG resource');
    }
    if (element.localName.toLowerCase() === 'style') {
      const css = element.textContent ?? '';
      if (/@import|@font-face|:host|::slotted|\\|expression\s*\(/i.test(css) || hasExternalCssUrl(css)) throw new Error('Unsupported SVG styles');
    }
  }
  return root as unknown as SVGSVGElement;
}

/** Freeze CSS animation samples into a compact sprite for deterministic video export. */
export async function prepareCustomAnimation(source: string): Promise<string> {
  const svg = sanitizeAnimatedSvg(source);
  const clean = new XMLSerializer().serializeToString(svg);
  const svgUrl = `data:image/svg+xml,${encodeURIComponent(clean)}`;
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', left: '-10000px', top: '0', width: '128px', height: '128px', pointerEvents: 'none' });
  const shadow = host.attachShadow({ mode: 'closed' });
  const live = document.importNode(svg, true);
  live.setAttribute('width', '128'); live.setAttribute('height', '128');
  shadow.appendChild(live); document.body.appendChild(host);
  try {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const animations = live.getAnimations({ subtree: true });
    if (!animations.length) throw new Error('SVG has no CSS animation');
    animations.forEach(animation => animation.pause());
    const nodes = [live, ...live.querySelectorAll('*')];
    const sheet = document.createElement('canvas'); sheet.width = 1536; sheet.height = 1280;
    const context = sheet.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    for (let frame = 0; frame < 120; frame++) {
      animations.forEach(animation => { animation.currentTime = frame * CUSTOM_ANIMATION_DURATION / 120; });
      const copy = live.cloneNode(true) as SVGSVGElement;
      const copies = [copy, ...copy.querySelectorAll('*')];
      nodes.forEach((node, index) => {
        const style = getComputedStyle(node);
        const target = copies[index] as SVGElement;
        for (const key of ['rotate', 'translate', 'scale', 'transform', 'opacity']) target.style.setProperty(key, style.getPropertyValue(key), 'important');
        target.style.setProperty('animation', 'none', 'important');
      });
      const frameUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }));
      try { const image = new Image(); image.src = frameUrl; await image.decode(); context.drawImage(image, frame % 12 * 128, Math.floor(frame / 12) * 128, 128, 128); }
      finally { URL.revokeObjectURL(frameUrl); }
    }
    const data: CustomAnimation = { svg: svgUrl, sprite: sheet.toDataURL('image/png'), duration: CUSTOM_ANIMATION_DURATION };
    return CUSTOM_ANIMATION_PREFIX + btoa(JSON.stringify(data));
  } finally { host.remove(); }
}

export function validateGlb(bytes: ArrayBuffer): void {
  const view = new DataView(bytes);
  if (bytes.byteLength > MAX_CUSTOM_GLB_BYTES || bytes.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) throw new Error('Invalid GLB');
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || 20 + length > bytes.byteLength) throw new Error('Invalid GLB');
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, length)).trim());
  for (const item of [...(json.buffers ?? []), ...(json.images ?? [])]) {
    if (typeof item.uri === 'string' && !/^data:(?:application\/octet-stream|image\/(?:png|jpeg|webp));base64,/i.test(item.uri)) throw new Error('External GLB resource');
  }
}
export function bytesToBase64(bytes: Uint8Array): string {
  let data = '';
  for (let i = 0; i < bytes.length; i += 0x8000) data += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(data);
}

/** Validate that the embedded glTF data can actually be opened and has visible geometry. */
export async function validateCustomModel(bytes: ArrayBuffer): Promise<void> {
  validateGlb(bytes);
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const model = await new GLTFLoader().parseAsync(bytes, '');
  let hasMesh = false;
  model.scene.traverse(item => {
    if (!('isMesh' in item) || !item.isMesh) return;
    hasMesh = true;
    const mesh = item as import('three').Mesh;
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      Object.values(material).forEach(value => { if (value && typeof value === 'object' && 'isTexture' in value && value.isTexture && 'dispose' in value && typeof value.dispose === 'function') value.dispose(); });
      material.dispose();
    }
  });
  if (!hasMesh) throw new Error('Empty 3D model');
}
