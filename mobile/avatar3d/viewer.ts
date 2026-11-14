// 3D avatar viewer. Runs inside a WebView (native) or an iframe (web) and
// draws the realistic human (avatar3d/human.ts): a body shaped by the
// sliders, with skin, eyes, hair and clothes, under soft studio light.
// Built into assets/avatar3d/viewer.html by scripts/build-avatar3d.mjs;
// the app talks to it with JSON messages:
//
//   in:  { type: 'render', model, targets, skin, parts, eyeColor, pose,
//          mode, yaw, zoom, bare, colors, snapshot }
//   out: { type: 'ready' } | { type: 'rendered' } | { type: 'snapshot', data }
//        | { type: 'error', message }

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Human, type MeshOut, type Pose, type ProxyHeader } from './human';

interface PartCommand {
  /** Mesh id in the model file. */
  id: string;
  /** Tint, for meshes stored in gray (hair, brows, plain clothes). */
  color?: string;
  /** Metres to push the surface outward, so one garment sits over another. */
  grow?: number;
}

interface RenderCommand {
  type: 'render';
  /** URL of human.bin. */
  model: string;
  /** Shape target weights, already worked out by the app. */
  targets: Record<string, number>;
  skin: { id: string; color: string };
  parts: PartCommand[];
  eyeColor?: string;
  pose: string;
  mode: 'head' | 'full-body';
  bare: boolean;
  colors: { bgFrom: string; bgTo: string };
  snapshot: boolean;
  /** Camera turn around the avatar in radians. */
  yaw?: number;
  /** Head mode only: 1 is the bust, about 2 a close-up of the face. */
  zoom?: number;
}

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (data: string) => void };
    avatarCommand?: (json: string) => void;
  }
}

function post(msg: unknown) {
  const data = JSON.stringify(msg);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(data);
  else if (window.parent !== window) window.parent.postMessage(data, '*');
}

const c = (hex: string) => new THREE.Color(hex);

// ---------------------------------------------------------------- scene

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
(window as unknown as { avatarScene: THREE.Scene }).avatarScene = scene;
const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 30);

// Studio light: a soft room all around, a warm key from the upper left
// that casts the only shadow, and a cool rim from behind.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.42;
const key = new THREE.DirectionalLight(0xfff1e2, 2.5);
key.position.set(-1.6, 2.9, 2.6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.bias = -0.0015;
key.shadow.normalBias = 0.012;
key.shadow.radius = 5;
const sc = key.shadow.camera;
sc.left = -1.1;
sc.right = 1.1;
sc.top = 2.1;
sc.bottom = -0.2;
sc.near = 0.5;
sc.far = 8;
scene.add(key);
scene.add(key.target);
const rim = new THREE.DirectionalLight(0xcfe0ff, 1.1);
rim.position.set(2.2, 2.2, -2.4);
scene.add(rim);
const fill = new THREE.DirectionalLight(0xffe6d8, 0.35);
fill.position.set(2.4, 0.8, 2.2);
scene.add(fill);

function resize() {
  const w = window.innerWidth || 300;
  const h = window.innerHeight || 300;
  renderer.setSize(w, h, false);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function backdrop(from: string, to: string): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 384;
  const g = cv.getContext('2d')!;
  const grd = g.createRadialGradient(128, 150, 10, 128, 190, 280);
  grd.addColorStop(0, `#${c(to).getHexString()}`);
  grd.addColorStop(1, `#${c(from).getHexString()}`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 384);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- model

interface Loaded {
  human: Human;
  images: Map<number, Promise<HTMLImageElement>>;
  textures: Map<string, THREE.Texture>;
  meshes: Map<string, THREE.Mesh>;
}

const models = new Map<string, Promise<Loaded>>();
const root = new THREE.Group();
scene.add(root);

function loadModel(url: string): Promise<Loaded> {
  let p = models.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`model ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => ({ human: new Human(buf), images: new Map(), textures: new Map(), meshes: new Map() }));
    models.set(url, p);
    p.catch(() => models.delete(url));
  }
  return p;
}

function image(m: Loaded, i: number): Promise<HTMLImageElement> {
  let p = m.images.get(i);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(m.human.textureBlob(i));
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => reject(new Error(`texture ${i}`));
      img.src = url;
    });
    m.images.set(i, p);
  }
  return p;
}

function asTexture(source: HTMLImageElement | HTMLCanvasElement, color = true): THREE.Texture {
  const t = source instanceof HTMLCanvasElement ? new THREE.CanvasTexture(source) : new THREE.Texture(source);
  t.flipY = false;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

async function texture(m: Loaded, i: number, color = true): Promise<THREE.Texture> {
  const k = `t${i}`;
  let t = m.textures.get(k);
  if (!t) {
    t = asTexture(await image(m, i), color);
    m.textures.set(k, t);
  }
  return t;
}

/** The eye texture with the iris recoloured; the white and the pupil are left alone. */
async function eyeTexture(m: Loaded, i: number, hex: string | undefined): Promise<THREE.Texture> {
  if (!hex) return texture(m, i);
  const k = `eye${i}:${hex}`;
  let t = m.textures.get(k);
  if (t) return t;
  const img = await image(m, i);
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  const g = cv.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, cv.width, cv.height);
  const d = px.data;
  // The two irises sit at fixed places in MakeHuman's eye texture.
  // Real irises are duller than a colour swatch: mute it a little.
  const want = c(hex);
  const out = { r: 0, g: 0, b: 0 };
  want.getRGB(out, THREE.SRGBColorSpace);
  const gray = out.r * 0.3 + out.g * 0.59 + out.b * 0.11;
  out.r += (gray - out.r) * 0.3;
  out.g += (gray - out.g) * 0.3;
  out.b += (gray - out.b) * 0.3;
  const w = cv.width;
  const hgt = cv.height;
  for (const [ux, uy] of [[0.705, 0.2975], [0.2925, 0.6975]]) {
    const cx = ux * w;
    const cy = uy * hgt;
    const outer = 0.116 * w;
    const pupil = 0.036 * w;
    for (let y = Math.floor(cy - outer); y <= cy + outer; y++) {
      for (let x = Math.floor(cx - outer); x <= cx + outer; x++) {
        const r = Math.hypot(x - cx, y - cy);
        // Full strength across the iris, fading into the pupil and the white.
        const amount = Math.min(1, Math.max(0, (outer - r) / (0.02 * w))) * Math.min(1, Math.max(0, (r - pupil * 0.8) / (0.012 * w)));
        if (amount <= 0) continue;
        const p = (y * w + x) * 4;
        // Keep the iris's own streaks and dark rim as light and dark.
        const lum = (d[p] * 0.3 + d[p + 1] * 0.59 + d[p + 2] * 0.11) / 150;
        const shade = Math.min(1.25, 0.12 + lum * 0.8);
        d[p] += (Math.min(255, out.r * 255 * shade) - d[p]) * amount;
        d[p + 1] += (Math.min(255, out.g * 255 * shade) - d[p + 1]) * amount;
        d[p + 2] += (Math.min(255, out.b * 255 * shade) - d[p + 2]) * amount;
      }
    }
  }
  g.putImageData(px, 0, 0);
  t = asTexture(cv);
  m.textures.set(k, t);
  return t;
}

function setGeometry(mesh: THREE.Mesh, out: MeshOut) {
  const g = mesh.geometry;
  g.setAttribute('position', new THREE.BufferAttribute(out.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(out.normal, 3));
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(out.uv, 2));
  g.setIndex(new THREE.BufferAttribute(out.index, 1));
  g.computeBoundingSphere();
}

function meshFor(m: Loaded, id: string, make: () => THREE.Material): THREE.Mesh {
  let mesh = m.meshes.get(id);
  if (!mesh) {
    mesh = new THREE.Mesh(new THREE.BufferGeometry(), make());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    m.meshes.set(id, mesh);
  }
  return mesh;
}

/** How each kind of fitted mesh is shaded. */
function proxyMaterial(p: ProxyHeader): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    roughness: p.kind === 'eyes' ? 0.08 : p.kind === 'hair' ? 0.48 : p.kind === 'teeth' ? 0.35 : 0.85,
    metalness: 0,
    side: p.kind === 'eyes' || p.kind === 'teeth' || p.kind === 'tongue' ? THREE.FrontSide : THREE.DoubleSide,
  });
  if (p.kind === 'brows' || p.kind === 'lashes') {
    // Thin layers lying on the skin: plain blending, nothing to sort.
    mat.transparent = true;
    mat.depthWrite = false;
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -2;
  } else if (p.kind === 'hair') {
    // The solid part of each strand card; soft tips come from a second,
    // blended pass (see softPass).
    mat.alphaTest = 0.5;
  } else if (p.kind === 'glasses') {
    // Lenses are see-through; frames are solid in the same texture.
    mat.transparent = true;
    mat.depthWrite = false;
    mat.roughness = 0.25;
  } else if (p.transparent) {
    mat.alphaTest = 0.5;
  }
  if (p.kind === 'eyes') mat.envMapIntensity = 1.5;
  return mat;
}

/** Hair's second pass: the wispy, half-transparent ends over the solid part. */
function softPass(m: Loaded, id: string, solid: THREE.Mesh): THREE.Mesh {
  const key = `${id}#soft`;
  let mesh = m.meshes.get(key);
  if (!mesh) {
    const mat = (solid.material as THREE.MeshStandardMaterial).clone();
    mat.alphaTest = 0;
    mat.transparent = true;
    mat.depthWrite = false;
    mesh = new THREE.Mesh(solid.geometry, mat);
    mesh.frustumCulled = false;
    m.meshes.set(key, mesh);
  }
  const mat = mesh.material as THREE.MeshStandardMaterial;
  const from = solid.material as THREE.MeshStandardMaterial;
  mat.map = from.map;
  mat.color.copy(from.color);
  mat.needsUpdate = true;
  mesh.renderOrder = solid.renderOrder + 1;
  return mesh;
}

// ---------------------------------------------------------------- poses

const d = Math.PI / 180;
type Side = Record<string, [number, number, number]>;
/** Mirror a right-side pose to both sides. */
function both(right: Side): Pose {
  const out: Pose = {};
  for (const k in right) {
    const [x, y, z] = right[k];
    out[`${k}.R`] = [x * d, y * d, z * d];
    out[`${k}.L`] = [x * d, -y * d, -z * d];
  }
  return out;
}
function one(side: 'L' | 'R', right: Side): Pose {
  const out: Pose = {};
  for (const k in right) {
    const [x, y, z] = right[k];
    out[`${k}.${side}`] = side === 'R' ? [x * d, y * d, z * d] : [x * d, -y * d, -z * d];
  }
  return out;
}
const deg = (x: number, y: number, z: number): [number, number, number] => [x * d, y * d, z * d];

// Angles are about the world axes, in the model's own open-armed stance:
// for the right arm, +z brings it down and -z raises it; -x swings a
// limb forward. A child bone's turn is applied before its parent's.
const LEGS = both({ upperleg01: [0, 0, 4.5], foot: [0, 0, -4.5] });
const REST: Pose = { ...LEGS, ...both({ upperarm01: [0, 0, 36], lowerarm01: [-8, 0, 3] }) };
const POSES: Record<string, Pose> = {
  relaxed: {},
  confident: { ...both({ upperarm01: [0, 0, 30], lowerarm01: [-10, 0, 4], upperleg01: [0, 0, 0], foot: [0, 0, 0] }), spine02: deg(-4, 0, 0), head: deg(-3, 0, 0) },
  'arms-raised': { ...both({ upperarm01: [0, 0, -100], lowerarm01: [0, 0, -18] }), head: deg(-8, 0, 0), spine02: deg(-4, 0, 0) },
  walk: {
    ...one('R', { upperleg01: [-16, 0, 4.5], lowerleg01: [10, 0, 0], foot: [6, 0, -4.5], upperarm01: [14, 0, 36], lowerarm01: [-6, 0, 3] }),
    ...one('L', { upperleg01: [12, 0, 4.5], lowerleg01: [14, 0, 0], foot: [-10, 0, -4.5], upperarm01: [-16, 0, 36], lowerarm01: [-22, 0, 3] }),
  },
  'look-side': { neck01: deg(0, 14, 0), head: deg(0, 16, 0) },
  'look-up': { neck01: deg(-8, 0, 0), head: deg(-12, 0, 0), spine02: deg(-3, 0, 0) },
};

function poseFor(id: string): Pose {
  return { ...REST, ...(POSES[id] ?? {}) };
}

// ---------------------------------------------------------------- render

function frame(m: Loaded, mode: 'head' | 'full-body', yaw = 0.3, zoom = 1) {
  const head = m.human.posedHead('head');
  const top = m.human.posedHead('head')[1] + 0.2;
  if (mode === 'head') {
    camera.fov = 18;
    // Head and the top of the shoulders; zooming in moves toward the eyes.
    const z = Math.max(1, Math.min(2.6, zoom));
    const cy = head[1] + 0.05 - (z - 1) * 0.03;
    const dist = 1.25 / z;
    camera.position.set(head[0] + Math.sin(yaw) * dist, cy + 0.02, head[2] + 0.03 + Math.cos(yaw) * dist);
    camera.lookAt(head[0], cy, head[2] + 0.03);
  } else {
    camera.fov = 24;
    const mid = top * 0.5;
    const dist = (top / 1.75) * 4.75 * Math.max(1, 0.62 / Math.min(1, camera.aspect / 0.62));
    camera.position.set(Math.sin(yaw) * dist, mid + 0.12, Math.cos(yaw) * dist);
    camera.lookAt(0, mid, 0);
  }
  camera.updateProjectionMatrix();
}

let lastCmd: RenderCommand | null = null;

async function render(cmd: RenderCommand) {
  try {
    lastCmd = cmd;
    const m = await loadModel(cmd.model);
    const h = m.human;
    const parts = cmd.parts.filter((p) => h.header.proxies[p.id]);
    // Textures first, so the picture never shows a half-dressed frame.
    const skin = h.header.skins[cmd.skin.id];
    const skinMap = skin ? await texture(m, skin.map) : null;
    const maps = await Promise.all(
      parts.map((p) => {
        const ph = h.header.proxies[p.id];
        if (ph.map === undefined) return null;
        return ph.kind === 'eyes' ? eyeTexture(m, ph.map, cmd.eyeColor) : texture(m, ph.map);
      }),
    );
    if (lastCmd !== cmd) return;

    h.shape(cmd.targets);
    const posed = h.pose(poseFor(cmd.pose));
    root.clear();

    const body = meshFor(m, '#body', () => new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0 }));
    setGeometry(body, h.body(posed, parts.map((p) => p.id)));
    const bm = body.material as THREE.MeshStandardMaterial;
    bm.map = skinMap;
    if (skin) {
      // Tint the photographed skin toward the chosen tone.
      const want = c(cmd.skin.color);
      const have = new THREE.Color().setRGB(skin.tone[0], skin.tone[1], skin.tone[2], THREE.SRGBColorSpace);
      bm.color.setRGB(Math.min(1.45, want.r / have.r), Math.min(1.45, want.g / have.g), Math.min(1.45, want.b / have.b));
    } else bm.color.copy(c(cmd.skin.color));
    bm.needsUpdate = true;
    root.add(body);

    parts.forEach((p, i) => {
      const ph = h.header.proxies[p.id];
      const out = h.proxy(p.id);
      if (!out) return;
      const mesh = meshFor(m, p.id, () => proxyMaterial(ph));
      if (p.grow) for (let k = 0; k < out.position.length; k++) out.position[k] += out.normal[k] * p.grow;
      setGeometry(mesh, out);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.map = maps[i];
      if (p.color) mat.color.copy(c(p.color));
      else mat.color.setRGB(ph.color[0], ph.color[1], ph.color[2], THREE.SRGBColorSpace);
      if (maps[i]) {
        if (!p.color) mat.color.set(0xffffff);
      }
      mat.needsUpdate = true;
      mesh.renderOrder = ph.depth;
      mesh.castShadow = ph.kind !== 'lashes' && ph.kind !== 'brows' && ph.kind !== 'eyes';
      if (ph.kind === 'eyes' && !p.color) mat.color.setScalar(0.8);
      root.add(mesh);
      if (ph.kind === 'hair') root.add(softPass(m, p.id, mesh));
    });

    scene.background = cmd.bare ? null : backdrop(cmd.colors.bgFrom, cmd.colors.bgTo);
    resize();
    frame(m, cmd.mode, cmd.yaw, cmd.zoom);
    const head = h.posedHead('head');
    key.target.position.set(0, cmd.mode === 'head' ? head[1] : head[1] * 0.55, 0);
    renderer.render(scene, camera);
    post({ type: 'rendered' });
    if (cmd.snapshot) post({ type: 'snapshot', data: canvas.toDataURL('image/png') });
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
}

function onMessage(raw: unknown) {
  try {
    const cmd = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (cmd?.type === 'render') void render(cmd as RenderCommand);
  } catch {
    // ignore messages that are not ours
  }
}

window.avatarCommand = (json: string) => onMessage(json);
window.addEventListener('message', (e) => onMessage(e.data));
document.addEventListener('message', (e) => onMessage((e as MessageEvent).data));
post({ type: 'ready' });
