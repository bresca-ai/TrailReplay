import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CUSTOM_MODEL_PREFIX, validateGlb } from '@/utils/customMarker';

export async function createCustomModelRenderer(canvas: HTMLCanvasElement, value: string) {
  const binary = atob(value.slice(CUSTOM_MODEL_PREFIX.length));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  validateGlb(bytes.buffer);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer, '');
  const object = gltf.scene;
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxSize) || maxSize <= 0) throw new Error('Empty 3D model');
  const center = box.getCenter(new THREE.Vector3());
  object.position.set(-center.x, -box.min.y, -center.z);
  const normalization = new THREE.Group(); normalization.add(object); normalization.scale.setScalar(2 / maxSize);
  // glTF's front is +Z; the built-in renderer uses +X.
  normalization.rotation.y = Math.PI / 2;
  const root = new THREE.Group(); root.add(normalization);
  const scene = new THREE.Scene(); scene.add(root);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6f7867, 2));
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(3, 6, 4); scene.add(sun);
  const mixer = new THREE.AnimationMixer(object);
  const clip = gltf.animations.find(item => /run|walk|drive|cycle/i.test(item.name)) ?? gltf.animations[0];
  if (clip) mixer.clipAction(clip).play();
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setClearColor(0x000000, 0); renderer.setSize(256, 256, false);
  const camera = new THREE.OrthographicCamera(-1.75, 1.75, 2.6, -0.9, 0.1, 100);
  let previewFramed = false;
  function render(timeMs: number, heading: number, mapBearing: number, pitch: number, _color?: string, preview = false) {
    if (preview && !previewFramed) {
      // Give the turning character room on every side without changing map framing.
      const extent = (camera.right - camera.left) * 0.68;
      camera.left = camera.bottom = -extent;
      camera.right = camera.top = extent;
      camera.updateProjectionMatrix();
      previewFramed = true;
    }
    mixer.setTime(Math.max(0, timeMs) / 1000);
    root.rotation.y = Math.PI / 2 - THREE.MathUtils.degToRad(heading);
    const bearing = THREE.MathUtils.degToRad(mapBearing), inclination = THREE.MathUtils.degToRad(Math.max(1, Math.min(85, pitch)));
    camera.position.set(-8 * Math.sin(bearing) * Math.sin(inclination), 8 * Math.cos(inclination) + 1, 8 * Math.cos(bearing) * Math.sin(inclination));
    camera.up.set(0, 1, 0); camera.lookAt(0, 1, 0); renderer.render(scene, camera);
  }
  function dispose() {
    mixer.stopAllAction();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    object.traverse(item => {
      if (!(item instanceof THREE.Mesh)) return;
      geometries.add(item.geometry);
      for (const material of Array.isArray(item.material) ? item.material : [item.material]) {
        materials.add(material);
        Object.values(material).forEach(prop => { if (prop instanceof THREE.Texture) textures.add(prop); });
      }
    });
    geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); textures.forEach(item => item.dispose()); renderer.dispose();
  }
  return { render, dispose };
}
