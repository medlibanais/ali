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
(window as unknown as { avatarScene: THREE.Scene }).avatarScene = scene;
const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 20);
// Ronin light: one low ember key from the side, so half the face falls
// into a clean cel shadow, and very little fill.
const key = new THREE.DirectionalLight(0xffd4ae, Math.PI * 0.85);
key.position.set(-3, 0.6, 0.15);
scene.add(key);
scene.add(new THREE.AmbientLight(0x2a2230, 0.25));

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
      prepareTightTop(vrm);
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
  matcapFactor?: THREE.Color;
  rimLightingMixFactor?: number;
  userData: Record<string, unknown>;
}

/**
 * Anime face shading: point the face's normals out from a center behind
 * it, like a ball, so light splits the face into one clean lit half and one
 * shadow half instead of blotches from the nose and cheeks.
 */
function sphereNormals(mesh: THREE.Mesh) {
  const g = mesh.geometry;
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  if (!pos || !nrm) return;
  g.computeBoundingBox();
  const box = g.boundingBox!;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  // Model faces +z after rotateVRM0 in bind space for VRM 1.0 (-z for 0.x);
  // pick the side the face's own normals mostly point to.
  let zSum = 0;
  for (let i = 0; i < nrm.count; i++) zSum += nrm.getZ(i);
  const front = zSum >= 0 ? 1 : -1;
  center.z -= front * size.z * 0.9;
  center.y -= size.y * 0.1;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(center).normalize();
    nrm.setXYZ(i, v.x, v.y, v.z);
  }
  nrm.needsUpdate = true;
}

function prepareMaterials(vrm: VRM) {
  vrm.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    const mats = ([] as THREE.Material[]).concat(mesh.material);
    if (mats[0]?.name.toLowerCase().startsWith('face_')) sphereNormals(mesh);
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
      const n = m.name.toLowerCase();
      const face = n.endsWith('_face') || n.endsWith('_eye');
      // Ronin look: hard toon edge, deep shadow, a thin ember rim on the lit
      // edge only, and a thin dark ink outline.
      m.shadingToonyFactor = 1;
      // The face gets a little more light so the nose throws no blotch,
      // leaving one clean split between its lit and shadow halves.
      m.shadingShiftFactor = n.startsWith('face_') ? 0.1 : part === 'skin' ? 0.05 : 0;
      m.matcapFactor?.set(0, 0, 0);
      m.parametricRimColorFactor?.set(part === 'hair' ? 0x6a2c12 : part === 'skin' ? 0xc0582a : 0x8a3a18);
      m.parametricRimFresnelPowerFactor = 6;
      m.parametricRimLiftFactor = 0;
      m.rimLightingMixFactor = 1;
      m.outlineWidthMode = face ? 'none' : 'screenCoordinates';
      m.outlineWidthFactor = part === 'skin' ? 0.0035 : 0.005;
      m.outlineColorFactor?.set(0x120a08);
      m.needsUpdate = true;
    }
  });
}

/**
 * The sample top hangs loose, several centimeters in front of the belly,
 * so crossed forearms sink into it. Keep a second copy of its shape with the
 * front pulled in close to the body (never inside it) for that pose.
 */
function prepareTightTop(vrm: VRM) {
  const meshes: THREE.Mesh[] = [];
  vrm.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  const named = (re: RegExp) => meshes.filter((m) => re.test(([] as THREE.Material[]).concat(m.material)[0].name));
  // The body and the shorts: the top must stay outside both.
  const under = named(/^Body_\d+_SKIN|Bottoms/);
  if (!under.length) return;
  // Front-most body surface per 2 cm cell, in the shared bind space.
  const cell = 0.02;
  const front = new Map<string, number>();
  for (const m of under) {
    const bp = m.geometry.getAttribute('position');
    for (let i = 0; i < bp.count; i++) {
      const k = `${Math.round(bp.getX(i) / cell)},${Math.round(bp.getY(i) / cell)}`;
      const z = bp.getZ(i);
      if (!(front.get(k)! >= z)) front.set(k, z);
    }
  }
  const frontAt = (x: number, y: number) => {
    let best = -Infinity;
    const cx = Math.round(x / cell);
    const cy = Math.round(y / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) best = Math.max(best, front.get(`${cx + dx},${cy + dy}`) ?? -Infinity);
    return best;
  };
  for (const top of named(/Tops/)) {
    const pos = top.geometry.getAttribute('position') as THREE.BufferAttribute;
    const loose = (pos.array as Float32Array).slice();
    const tight = (pos.array as Float32Array).slice();
    for (let i = 0; i < pos.count; i++) {
      const x = loose[i * 3];
      const y = loose[i * 3 + 1];
      const z = loose[i * 3 + 2];
      const f = frontAt(x, y);
      if (!Number.isFinite(f) || z <= f) continue;
      const rest = f + TOP_MARGIN;
      if (z > rest) tight[i * 3 + 2] = rest + (z - rest) * TOP_KEEP;
    }
    top.userData.loose = loose;
    top.userData.tight = tight;
    top.userData.positions = pos;
  }
}
const TOP_MARGIN = 0.012;
const TOP_KEEP = 0.35;

function fitTop(vrm: VRM, tight: boolean) {
  vrm.scene.traverse((o) => {
    const d = o.userData as { loose?: Float32Array; tight?: Float32Array; positions?: THREE.BufferAttribute };
    if (!d.positions || !d.loose || !d.tight) return;
    (d.positions.array as Float32Array).set(tight ? d.tight : d.loose);
    d.positions.needsUpdate = true;
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
  wave: { rightUpperArm: [0, -0.3, 0.35], rightLowerArm: [0, 0, -2.0], rightHand: [0, 0, -0.15] },
  // Wrists bend back so the fists tuck in against the upper arms.
  'arms-crossed': {},
};

/**
 * Poses that are easier to say as "point this bone at that spot": targets
 * are in units of shoulder width from the chest, x to the model's left,
 * y up, z forward.
 */
const AIMS: Record<string, [string, string, [number, number, number]][]> = {
  'arms-crossed': [
    // One forearm rests on top of the other, not through it: the top arm
    // sits high and forward, the lower arm crosses under it, and their
    // centerlines stay about 7 cm apart (forearms are about 6 cm thick).
    ['leftUpperArm', 'leftLowerArm', [0.55, -0.65, 0.55]],
    ['rightUpperArm', 'rightLowerArm', [-0.55, -0.92, 0.45]],
    ['leftLowerArm', 'leftHand', [-0.55, -0.32, 1.0]],
    ['rightLowerArm', 'rightHand', [0.55, -0.9, 0.75]],
    // A gentle wrist turn so each hand wraps the other arm.
    ['leftHand', 'leftMiddleProximal', [-0.85, -0.42, 0.5]],
    ['rightHand', 'rightMiddleProximal', [0.85, -0.9, 0.45]],
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
const HEAD_SCALE = 0.9;
const HEIGHT_SCALE: Record<string, number> = { short: 0.95, medium: 1, tall: 1.05 };

/**
 * Body proportions. three-vrm copies only rotations from the normalized rig
 * to the model, so scale goes on the raw bones. A parent's scale passes to
 * its children, so each child undoes it: only that body part changes.
 */
function applyProportions(vrm: VRM, build: string) {
  const h = vrm.humanoid;
  const [cw, hw] = BUILD_SCALE[build] ?? BUILD_SCALE.average;
  const cd = Math.sqrt(cw);
  const scales: Record<string, [number, number, number]> = {
    hips: [hw, 1, hw],
    spine: [1 / hw, 1, 1 / hw],
    leftUpperLeg: [1 / hw, 1, 1 / hw],
    rightUpperLeg: [1 / hw, 1, 1 / hw],
    chest: [cw, 1, cd],
    neck: [1 / cw, 1, 1 / cd],
    leftShoulder: [1 / cw, 1, 1 / cd],
    rightShoulder: [1 / cw, 1, 1 / cd],
    // Seinen proportions: a slightly smaller head than the moe default.
    head: [HEAD_SCALE, HEAD_SCALE, HEAD_SCALE],
  };
  for (const [bone, [x, y, z]] of Object.entries(scales)) {
    h.getRawBoneNode(bone as never)?.scale.set(x, y, z);
  }
}

const FINGERS = ['Index', 'Middle', 'Ring', 'Little'];
const SEGMENTS = ['Proximal', 'Intermediate', 'Distal'];
/** How far each hand closes: 0 open, 1 a loose fist. */
const GRIP: Record<string, [number, number]> = {
  standing: [0.55, 0.55],
  hip: [0.55, 0.8],
  wave: [0.55, 0.1],
  'arms-crossed': [0.5, 0.5],
};

// Sign that closes the hand for this rig's finger bones.
const FINGER_DIR = -1;

function curlFingers(vrm: VRM, pose: string) {
  const h = vrm.humanoid;
  const [l, r] = GRIP[pose] ?? GRIP.standing;
  for (const [side, amt, sign] of [['left', l, 1], ['right', r, -1]] as const) {
    FINGERS.forEach((f, i) => {
      SEGMENTS.forEach((seg, j) => {
        const node = h.getNormalizedBoneNode(`${side}${f}${seg}` as never);
        // Outer fingers close a little more, like a relaxed hand.
        if (node) node.rotation.set(0, 0, sign * amt * (j === 0 ? 1.0 : 1.2) * (1 + i * 0.08) * FINGER_DIR);
      });
    });
    const tp = h.getNormalizedBoneNode(`${side}ThumbProximal` as never);
    if (tp) tp.rotation.set(0, sign * -amt * 0.5 * FINGER_DIR, 0);
    const td = h.getNormalizedBoneNode(`${side}ThumbDistal` as never);
    if (td) td.rotation.set(0, sign * -amt * 0.6 * FINGER_DIR, 0);
  }
}

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
  curlFingers(vrm, pose);
  applyProportions(vrm, build);
  fitTop(vrm, pose === 'arms-crossed');
  vrm.scene.scale.setScalar(HEIGHT_SCALE[height] ?? 1);
}

const MOODS: Record<string, Record<string, number>> = {
  tired: { relaxed: 0.6, sad: 0.25 },
  neutral: { angry: 0.4 },
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

const HEAD_FRAME = { y: 0.08, dist: 1.65 };

function frame(vrm: VRM, mode: 'head' | 'full-body') {
  vrm.update(0);
  const head = vrm.humanoid.getNormalizedBoneNode('head' as never)!.getWorldPosition(new THREE.Vector3());
  const yaw = 0.3;
  if (mode === 'head') {
    camera.fov = 18;
    // Whole head and the top of the shoulders, like the 2D portrait.
    const cy = head.y + HEAD_FRAME.y;
    camera.position.set(Math.sin(yaw) * HEAD_FRAME.dist, cy + 0.02, Math.cos(yaw) * HEAD_FRAME.dist);
    camera.lookAt(0, cy, 0);
  } else {
    camera.fov = 24;
    const mid = head.y * 0.52;
    const dist = 4.7 * vrm.scene.scale.y * Math.max(1, 0.62 / Math.min(1, camera.aspect / 0.62));
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
