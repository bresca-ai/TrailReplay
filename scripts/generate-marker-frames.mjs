import { chromium } from 'playwright';
import { readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('app/public/media/images');
const output = resolve(root, 'animated-marker-frames');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:5173/');
for (const name of (await readdir(resolve(root, 'animated-markers'))).filter(x => x.endsWith('.svg'))) {
  const durationMs = name.includes('-tired') ? 8000 : /-(finish|summit)/.test(name) ? 5000 : ({ 'runner-steady.svg': 3840, 'hiker-steady.svg': 4400, 'swimmer-steady.svg': 3900, 'skier-steady.svg': 4400, 'snowboarder-steady.svg': 4800 }[name] ?? 4000);
  const base64 = await page.evaluate(async ({ name, durationMs }) => {
    const response = await fetch(`/media/images/animated-markers/${name}`);
    const svg = new DOMParser().parseFromString(await response.text(), 'image/svg+xml').documentElement;
    Object.assign(svg.style, { position: 'fixed', left: '-1000px', top: '0', width: '128px', height: '128px' });
    document.body.appendChild(svg);
    const animations = svg.getAnimations({ subtree: true });
    animations.forEach(a => a.pause());
    const nodes = [svg, ...svg.querySelectorAll('*')];
    const canvas = document.createElement('canvas');
    canvas.width = 128 * 12; canvas.height = 128 * 10;
    const ctx = canvas.getContext('2d');
    for (let frame = 0; frame < 120; frame++) {
      animations.forEach(a => { a.currentTime = frame * durationMs / 120; });
      const clone = svg.cloneNode(true);
      const copies = [clone, ...clone.querySelectorAll('*')];
      nodes.forEach((node, index) => {
        const style = getComputedStyle(node);
        for (const key of ['rotate', 'translate', 'scale', 'transform', 'opacity']) {
          copies[index].style.setProperty(key, style.getPropertyValue(key), 'important');
        }
        copies[index].style.setProperty('animation', 'none', 'important');
      });
      clone.style.removeProperty('position'); clone.style.removeProperty('left'); clone.style.removeProperty('top');
      const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image(); img.src = url; await img.decode();
      ctx.drawImage(img, (frame % 12) * 128, Math.floor(frame / 12) * 128, 128, 128);
      URL.revokeObjectURL(url);
    }
    svg.remove();
    return canvas.toDataURL('image/png').split(',')[1];
  }, { name, durationMs });
  await writeFile(resolve(output, name.replace(/\.svg$/, '.png')), Buffer.from(base64, 'base64'));
  console.log(name);
}
await browser.close();
