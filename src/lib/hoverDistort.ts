/**
 * Légère distorsion au survol des vignettes de la galerie des saisons.
 *
 * Un unique contexte WebGL, déplacé d'une vignette à l'autre plutôt que
 * multiplié par quinze : le rendu 3D reste un décor discret posé sur la vraie
 * image, jamais un substitut. Sans WebGL, sans survol (tactile) ou sans
 * mouvement autorisé, cette fonction n'est simplement jamais appelée — voir
 * motionEngine.ts — et les vignettes restent de simples images.
 */
import * as THREE from 'three';

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Une ondulation unique, centrée sur le curseur, corrigée de l'aspect de la
// vignette pour rester circulaire, et dont l'amplitude (0.018 en espace UV)
// reste délibérément discrète.
const FRAGMENT = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec2 uMouse;
  uniform vec2 uResolution;
  uniform float uHover;
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    float aspect = uResolution.x / uResolution.y;
    vec2 centered = (vUv - uMouse) * vec2(aspect, 1.0);
    float dist = length(centered);
    float ripple = sin(dist * 24.0 - uTime * 5.0) * 0.018;
    float falloff = smoothstep(0.55, 0.0, dist);
    vec2 direction = dist > 0.0001 ? centered / dist : vec2(0.0);
    vec2 offset = direction * ripple * falloff * uHover / vec2(aspect, 1.0);
    gl_FragColor = texture2D(uTexture, vUv + offset);
  }
`;

interface Uniforms {
  uTexture: { value: THREE.Texture | null };
  uMouse: { value: THREE.Vector2 };
  uResolution: { value: THREE.Vector2 };
  uHover: { value: number };
  uTime: { value: number };
}

let renderer: THREE.WebGLRenderer | undefined;
let scene: THREE.Scene | undefined;
let camera: THREE.Camera | undefined;
let mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | undefined;
let canvas: HTMLCanvasElement | undefined;
let startTime = 0;
let rafId = 0;
let activeCard: HTMLElement | null = null;
let hoverTarget = 0;
let hoverCurrent = 0;

function uniforms(): Uniforms {
  return (mesh as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>).material
    .uniforms as unknown as Uniforms;
}

function ensureRenderer(): boolean {
  if (renderer) return true;
  try {
    canvas = document.createElement('canvas');
    canvas.className = 'filmstrip__canvas';
    canvas.setAttribute('aria-hidden', 'true');

    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    scene = new THREE.Scene();
    camera = new THREE.Camera();
    startTime = performance.now();

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: null },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uHover: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
    });
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);
    return true;
  } catch {
    // Contexte WebGL refusé (pilote, économie de batterie, quota de contextes
    // atteint) : on renonce silencieusement, l'image seule suffit.
    renderer = undefined;
    return false;
  }
}

function loop(): void {
  rafId = requestAnimationFrame(loop);
  if (!renderer || !scene || !camera || !mesh) return;

  hoverCurrent += (hoverTarget - hoverCurrent) * 0.12;
  const u = uniforms();
  u.uHover.value = hoverCurrent;
  u.uTime.value = (performance.now() - startTime) / 1000;
  renderer.render(scene, camera);

  if (hoverTarget === 0 && hoverCurrent < 0.003 && canvas) {
    canvas.classList.remove('filmstrip__canvas--active');
  }
}

function activate(card: HTMLElement): void {
  if (!renderer || !canvas || !mesh) return;
  const art = card.querySelector<HTMLElement>('[data-filmstrip-art]');
  const img = card.querySelector<HTMLImageElement>('img');
  if (!art || !img) return;

  if (!img.complete || img.naturalWidth === 0) {
    img.addEventListener('load', () => activate(card), { once: true });
    return;
  }

  if (activeCard !== card) {
    activeCard = card;
    art.appendChild(canvas);

    const rect = art.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);

    const texture = new THREE.Texture(img);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    const u = uniforms();
    u.uResolution.value.set(rect.width, rect.height);
    u.uTexture.value?.dispose();
    u.uTexture.value = texture;
  }

  canvas.classList.add('filmstrip__canvas--active');
  hoverTarget = 1;
}

function deactivate(): void {
  hoverTarget = 0;
}

function updateMouse(card: HTMLElement, event: PointerEvent): void {
  if (!mesh) return;
  const art = card.querySelector<HTMLElement>('[data-filmstrip-art]');
  if (!art) return;
  const rect = art.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = 1 - (event.clientY - rect.top) / rect.height;
  uniforms().uMouse.value.set(x, y);
}

export function attachHoverDistort(cards: HTMLElement[]): void {
  if (!ensureRenderer()) return;
  loop();

  cards.forEach((card) => {
    card.addEventListener('pointerenter', (event) => {
      if ((event as PointerEvent).pointerType !== 'mouse') return;
      activate(card);
    });
    card.addEventListener('pointermove', (event) => {
      if ((event as PointerEvent).pointerType !== 'mouse') return;
      updateMouse(card, event as PointerEvent);
    });
    card.addEventListener('pointerleave', deactivate);
    card.addEventListener('blur', deactivate);
  });

  window.addEventListener(
    'pagehide',
    () => {
      cancelAnimationFrame(rafId);
      renderer?.dispose();
    },
    { once: true },
  );
}
