// 3D avatar viewer. Runs inside a WebView (native) or an iframe (web) and
// draws a VRM anime model with toon (MToon) shading in the Ronin look:
// warm ember key light from one side, deep cel shadows, ink outlines and
// an ember rim. Built into assets/avatar3d/viewer.html by
// scripts/build-avatar3d.mjs; the app talks to it with JSON messages:
//
//   in:  { type: 'render', model, config, mood, mode, bare, animated, snapshot }
//   out: { type: 'ready' } | { type: 'rendered' } | { type: 'snapshot', data }
//        | { type: 'error', message }

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';

interface AvatarColors {
  skin: string;
  hair: string;
  top: string;
  bottom: string;
  shoes: string;
  bgFrom: string;
  bgTo: string;
}

interface RenderCommand {
  type: 'render';
  model: string;
  colors: AvatarColors;
  pose: string;
  build: string;
  height: string;
  mood: string;
  mode: 'head' | 'full-body';
  bare: boolean;
  animated: boolean;
  snapshot: boolean;
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

// ---------------------------------------------------------------- colors

const c = (hex: string) => new THREE.Color(hex);

function mixHex(a: string, b: string, t: number): THREE.Color {
  return c(a).lerp(c(b), t);
}

/** The Ronin grade used by the 2D avatar: a little desaturated, warmed. */
function grade(hex: string): THREE.Color {
  const col = c(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);
  col.setHSL(hsl.h, hsl.s * 0.75, hsl.l);
  return col.lerp(c('#3A2418'), 0.18);
}

// ---------------------------------------------------------------- scene

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 20);
const key = new THREE.DirectionalLight(0xffc89a, Math.PI * 0.75);
key.position.set(-2.2, 1.2, 0.9);
scene.add(key);
scene.add(new THREE.AmbientLight(0x3a2a3a, 0.35));

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
  const center = grade(to).lerp(c('#B4541F'), 0.6);
  const edge = grade(from).lerp(c('#140D0B'), 0.82);
  const grd = g.createRadialGradient(150, 165, 10, 140, 190, 260);
  grd.addColorStop(0, `#${center.getHexString()}`);
  grd.addColorStop(0.4, `#${center.clone().lerp(edge, 0.55).getHexString()}`);
  grd.addColorStop(1, `#${edge.getHexString()}`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 384);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- model

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));
const models = new Map<string, Promise<VRM>>();
let current: VRM | null = null;

function loadModel(url: string): Promise<VRM> {
  let p = models.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((gltf) => {
      const vrm = gltf.userData.vrm as VRM;
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.rotateVRM0(vrm);
      prepareMaterials(vrm);
      return vrm;
    });
    models.set(url, p);
  }
  return p;
}

type Part = 'skin' | 'hair' | 'top' | 'bottom' | 'shoes' | null;

/** Which config color drives a material, from VRoid's material names. */
function partOf(name: string): Part {
  const n = name.toLowerCase();
  if (n.includes('hair')) return 'hair';
  if (n.includes('skin')) return 'skin';
  if (n.includes('top') || n.includes('onepiece') || n.includes('tops')) return 'top';
  if (n.includes('bottom')) return 'bottom';
  if (n.includes('shoe')) return 'shoes';
  return null;
}

/**
 * Hair and clothes: replace the texture with a brightened grayscale copy so
 * the material color can make it any color, light or dark.
 */
function grayscale(tex: THREE.Texture): THREE.Texture {
  const img = tex.image as CanvasImageSource & { width: number; height: number };
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  const g = cv.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, cv.width, cv.height);
  const d = data.data;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    count++;
  }
  const scale = count ? 225 / (sum / count) : 1;
  for (let i = 0; i < d.length; i += 4) {
    const y = Math.min(255, (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * scale);
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  g.putImageData(data, 0, 0);
  const out = new THREE.CanvasTexture(cv);
  out.colorSpace = tex.colorSpace;
  out.flipY = tex.flipY;
  out.wrapS = tex.wrapS;
  out.wrapT = tex.wrapT;
  return out;
}

interface MToonLike extends THREE.Material {
  isMToonMaterial?: boolean;
  map?: THREE.Texture | null;
  shadeMultiplyTexture?: THREE.Texture | null;
  color?: THREE.Color;
  shadeColorFactor?: THREE.Color;
  parametricRimColorFactor?: THREE.Color;
  parametricRimFresnelPowerFactor?: number;
  parametricRimLiftFactor?: number;
  shadingToonyFactor?: number;
  shadingShiftFactor?: number;
  outlineWidthMode?: string;
  outlineWidthFactor?: number;
  outlineColorFactor?: THREE.Color;
  userData: Record<string, unknown>;
}

function prepareMaterials(vrm: VRM) {
  vrm.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    for (const mat of ([] as THREE.Material[]).concat(mesh.material)) {
      const m = mat as MToonLike;
      if (!m.isMToonMaterial) continue;
      const part = partOf(m.name);
      m.userData.part = part;
      if (part && part !== 'skin' && m.map) {
        const gray = grayscale(m.map);
        m.map = gray;
        if (m.shadeMultiplyTexture) m.shadeMultiplyTexture = gray;
      }
      // Ronin look: hard toon edge, deep shadow, ember rim, dark ink outline.
      m.shadingToonyFactor = 0.95;
      m.shadingShiftFactor = -0.05;
      m.parametricRimColorFactor?.set(0xe07a3a);
      m.parametricRimFresnelPowerFactor = 3.5;
      m.parametricRimLiftFactor = 0.05;
      m.outlineWidthMode = 'screenCoordinates';
      m.outlineWidthFactor = 0.004;
      m.outlineColorFactor?.set(0x1a100c);
      m.needsUpdate = true;
    }
  });
}

// Reference skin the model's texture was painted with; config skin tones
// are applied as a multiply relative to it.
const MODEL_SKIN = c('#F6DCCB');

function applyColors(vrm: VRM, colors: AvatarColors) {
  vrm.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const mat of ([] as THREE.Material[]).concat(mesh.material)) {
      const m = mat as MToonLike;
      if (!m.isMToonMaterial || !m.color) continue;
      const part = m.userData.part as Part;
      if (!part) continue;
      if (part === 'skin') {
        const s = grade(colors.skin);
        const f = new THREE.Color(
          Math.min(1, s.r / MODEL_SKIN.r),
          Math.min(1, s.g / MODEL_SKIN.g),
          Math.min(1, s.b / MODEL_SKIN.b),
        );
        m.color.copy(f);
        m.shadeColorFactor?.copy(f).multiplyScalar(0.55).lerp(c('#3A1A10'), 0.15);
      } else {
        const col = grade(colors[part]);
        m.color.copy(col);
        m.shadeColorFactor?.copy(col).multiplyScalar(0.42);
      }
    }
  });
}

// ---------------------------------------------------------------- pose

type Rot = [number, number, number];
const BASE: Record<string, Rot> = {
  hips: [0, 0.12, 0.05],
  spine: [0, -0.05, -0.06],
  chest: [0, -0.05, -0.03],
  neck: [0.05, 0, 0.02],
  head: [0.05, -0.12, 0.05],
  leftUpperLeg: [0, 0, 0.05],
  rightUpperLeg: [-0.12, 0, -0.1],
  rightLowerLeg: [0.22, 0, 0],
  leftUpperArm: [0, 0, -1.38],
  rightUpperArm: [0, 0, 1.33],
  leftLowerArm: [0, -0.25, 0],
  rightLowerArm: [0, 0.3, 0],
};
const POSES: Record<string, Record<string, Rot>> = {
  standing: {},
  hip: { rightUpperArm: [0, 0.2, 0.85], rightLowerArm: [0, 0.4, 1.75], rightHand: [0, 0, 0.3] },
  wave: { rightUpperArm: [0, 0, -0.35], rightLowerArm: [0, 0, -1.4], rightHand: [0, 0, -0.2] },
  'arms-crossed': {
  },
};

/**
 * Poses that are easier to say as "point this bone at that spot": targets
 * are in units of shoulder width from the chest, x to the model's left,
 * y up, z forward.
 */
const AIMS: Record<string, [string, string, [number, number, number]][]> = {
  'arms-crossed': [
    ['leftUpperArm', 'leftLowerArm', [0.62, -0.75, 0.42]],
    ['rightUpperArm', 'rightLowerArm', [-0.62, -0.8, 0.44]],
    ['leftLowerArm', 'leftHand', [-0.45, -0.42, 0.62]],
    ['rightLowerArm', 'rightHand', [0.45, -0.38, 0.66]],
  ],
};

function aim(vrm: VRM, boneName: string, childName: string, target: THREE.Vector3) {
  const h = vrm.humanoid;
  const bone = h.getNormalizedBoneNode(boneName as never);
  const child = h.getNormalizedBoneNode(childName as never);
  if (!bone || !child || !bone.parent) return;
  vrm.scene.updateMatrixWorld(true);
  const rest = child.position.clone().normalize();
  const from = bone.getWorldPosition(new THREE.Vector3());
  const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  const want = target.clone().sub(from).normalize().applyQuaternion(parentQ.invert());
  bone.quaternion.setFromUnitVectors(rest, want);
}

const BUILD_SCALE: Record<string, [number, number]> = {
  // [shoulders/chest width, hips width]
  slim: [0.94, 0.95],
  athletic: [1.07, 1.0],
  average: [1, 1],
  curvy: [0.97, 1.08],
  broad: [1.12, 1.06],
};
const HEIGHT_SCALE: Record<string, number> = { short: 0.95, medium: 1, tall: 1.05 };

function applyPose(vrm: VRM, pose: string, build: string, height: string) {
  const h = vrm.humanoid;
  const all = { ...BASE, ...(POSES[pose] ?? {}) };
  for (const [bone, r] of Object.entries(all)) {
    const node = h.getNormalizedBoneNode(bone as never);
    if (node) node.rotation.set(r[0], r[1], r[2]);
  }
  const aims = AIMS[pose];
  if (aims) {
    vrm.update(0);
    vrm.scene.updateMatrixWorld(true);
    const chest = h.getNormalizedBoneNode('upperChest' as never) ?? h.getNormalizedBoneNode('chest' as never);
    const l = h.getNormalizedBoneNode('leftUpperArm' as never)!.getWorldPosition(new THREE.Vector3());
    const r = h.getNormalizedBoneNode('rightUpperArm' as never)!.getWorldPosition(new THREE.Vector3());
    const unit = l.distanceTo(r);
    const origin = chest!.getWorldPosition(new THREE.Vector3());
    // Model's left is +x in VRM 1.0 space after rotateVRM0.
    const sideSign = l.x > r.x ? 1 : -1;
    for (const [bone, child, [x, y, z]] of aims) {
      const t = origin.clone().add(new THREE.Vector3(x * unit * sideSign, y * unit, z * unit));
      aim(vrm, bone, child, t);
    }
  }
  const [chestW, hipW] = BUILD_SCALE[build] ?? BUILD_SCALE.average;
  h.getNormalizedBoneNode('chest' as never)?.scale.set(chestW, 1, Math.sqrt(chestW));
  h.getNormalizedBoneNode('hips' as never)?.scale.set(hipW, 1, hipW);
  vrm.scene.scale.setScalar(HEIGHT_SCALE[height] ?? 1);
}

const MOODS: Record<string, Record<string, number>> = {
  tired: { relaxed: 0.6, sad: 0.25 },
  neutral: {},
  happy: { relaxed: 0.35, happy: 0.25 },
  glowing: { happy: 0.6 },
};

function applyMood(vrm: VRM, mood: string) {
  const em = vrm.expressionManager;
  if (!em) return;
  for (const name of ['happy', 'relaxed', 'sad', 'angry', 'surprised', 'blink']) em.setValue(name, 0);
  for (const [name, v] of Object.entries(MOODS[mood] ?? {})) em.setValue(name, v);
}

// ---------------------------------------------------------------- render

function frame(vrm: VRM, mode: 'head' | 'full-body') {
  vrm.update(0);
  const head = vrm.humanoid.getNormalizedBoneNode('head' as never)!.getWorldPosition(new THREE.Vector3());
  const yaw = 0.3;
  if (mode === 'head') {
    camera.fov = 18;
    camera.position.set(Math.sin(yaw) * 1.25, head.y + 0.02, Math.cos(yaw) * 1.25);
    camera.lookAt(0, head.y - 0.03, 0);
  } else {
    camera.fov = 24;
    const mid = head.y * 0.52;
    const dist = 4.7 * Math.max(1, 0.62 / Math.min(1, camera.aspect / 0.62));
    camera.position.set(Math.sin(yaw) * dist, mid + 0.15, Math.cos(yaw) * dist);
    camera.lookAt(0, mid, 0);
  }
  camera.updateProjectionMatrix();
}

let animating = false;
let lastCmd: RenderCommand | null = null;
const clock = new THREE.Clock();

function loop() {
  if (!animating || !current || !lastCmd) return;
  const t = clock.getElapsedTime();
  const vrm = current;
  const chest = vrm.humanoid.getNormalizedBoneNode('chest' as never);
  if (chest) chest.rotation.x = Math.sin(t * 1.6) * 0.015;
  const head = vrm.humanoid.getNormalizedBoneNode('head' as never);
  if (head) head.rotation.z = 0.05 + Math.sin(t * 0.7) * 0.02;
  const em = vrm.expressionManager;
  if (em) {
    const p = t % 4.3;
    em.setValue('blink', p < 0.12 ? Math.sin((p / 0.12) * Math.PI) : 0);
  }
  vrm.update(clock.getDelta());
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

async function render(cmd: RenderCommand) {
  try {
    lastCmd = cmd;
    const vrm = await loadModel(cmd.model);
    if (lastCmd !== cmd) return;
    if (current && current !== vrm) scene.remove(current.scene);
    if (current !== vrm) scene.add(vrm.scene);
    current = vrm;
    applyColors(vrm, cmd.colors);
    applyPose(vrm, cmd.pose, cmd.build, cmd.height);
    applyMood(vrm, cmd.mood);
    scene.background = cmd.bare ? null : backdrop(cmd.colors.bgFrom, cmd.colors.bgTo);
    resize();
    frame(vrm, cmd.mode);
    renderer.render(scene, camera);
    post({ type: 'rendered' });
    if (cmd.snapshot) post({ type: 'snapshot', data: canvas.toDataURL('image/png') });
    const wasAnimating = animating;
    animating = cmd.animated;
    if (animating && !wasAnimating) {
      clock.start();
      requestAnimationFrame(loop);
    }
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
