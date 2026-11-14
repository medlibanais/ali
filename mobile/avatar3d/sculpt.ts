// Sculpting the VRoid model from sliders (src/avatar/custom.ts).
//
// VRoid bakes its own face and body sliders into the mesh when it exports,
// so a .vrm carries no "nose width" shape. Instead we move the mesh
// ourselves: every slider is a smooth, local deformation of the vertices in
// bind space (the pose the model was modeled in), measured from landmarks
// found on the mesh itself (eye, mouth and nose positions), so it works for
// any VRoid model, not only the sample. Body proportions are bone scales.
//
// All deformations start again from the original vertices each render, so
// sliders never accumulate.

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { sv, type Sliders } from '../src/avatar/custom';

type Kind = 'skin' | 'eyewhite' | 'iris' | 'highlight' | 'eyeline' | 'brow' | 'mouth' | 'other';

interface FacePart {
  mesh: THREE.Mesh;
  kind: Kind;
  base: Float32Array;
  pos: THREE.BufferAttribute;
}

interface Side {
  eye: THREE.Vector3;
  iris: THREE.Vector3;
  brow: THREE.Vector3;
  browInner: number;
}

export interface FaceRig {
  parts: FacePart[];
  /** +1 if the face looks toward +z in bind space. */
  front: number;
  eyeY: number;
  chinY: number;
  seamY: number;
  halfW: number;
  mouth: THREE.Vector3;
  nose: THREE.Vector3;
  left: Side;
  right: Side;
  key: string;
}

function kindOf(name: string): Kind {
  const n = name.toLowerCase();
  if (n.startsWith('face_') || (n.includes('face') && n.includes('skin'))) return 'skin';
  if (n.includes('eyewhite')) return 'eyewhite';
  if (n.includes('eyeiris')) return 'iris';
  if (n.includes('eyehighlight')) return 'highlight';
  if (n.includes('eyeline')) return 'eyeline';
  if (n.includes('brow')) return 'brow';
  if (n.includes('mouth')) return 'mouth';
  return 'other';
}

function matName(mesh: THREE.Mesh): string {
  return ([] as THREE.Material[]).concat(mesh.material)[0]?.name ?? '';
}

function bbox(parts: FacePart[], kinds: Kind[], side: number): THREE.Box3 {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const part of parts) {
    if (!kinds.includes(part.kind)) continue;
    const b = part.base;
    for (let i = 0; i < b.length; i += 3) {
      if (side !== 0 && b[i] * side <= 0) continue;
      box.expandByPoint(v.set(b[i], b[i + 1], b[i + 2]));
    }
  }
  return box;
}

/** Find the face meshes and their landmarks once per model. */
export function prepareFace(vrm: VRM): FaceRig | null {
  const parts: FacePart[] = [];
  vrm.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const kind = kindOf(matName(mesh));
    const name = matName(mesh).toLowerCase();
    // Only the head's own meshes: the body skin is not part of the face.
    if (kind === 'other' || (kind === 'skin' && !name.startsWith('face'))) return;
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    parts.push({ mesh, kind, pos, base: (pos.array as Float32Array).slice() });
  });
  const skin = parts.find((p) => p.kind === 'skin');
  if (!skin || !parts.some((p) => p.kind === 'eyewhite')) return null;

  const sideOf = (s: number): Side => {
    const eye = bbox(parts, ['eyewhite'], s).getCenter(new THREE.Vector3());
    const iris = bbox(parts, ['iris'], s).getCenter(new THREE.Vector3());
    const browBox = bbox(parts, ['brow'], s);
    return {
      eye,
      iris: Number.isFinite(iris.x) ? iris : eye.clone(),
      brow: browBox.isEmpty() ? eye.clone().add(new THREE.Vector3(0, 0.035, 0)) : browBox.getCenter(new THREE.Vector3()),
      browInner: browBox.isEmpty() ? eye.x : s > 0 ? browBox.min.x : browBox.max.x,
    };
  };
  const left = sideOf(1);
  const right = sideOf(-1);
  const skinBox = bbox(parts, ['skin'], 0);
  const center = skinBox.getCenter(new THREE.Vector3());
  const front = (left.eye.z + right.eye.z) / 2 >= center.z ? 1 : -1;
  const eyeY = (left.eye.y + right.eye.y) / 2;
  const mouthBox = bbox(parts, ['mouth'], 0);
  const mouth = mouthBox.isEmpty()
    ? new THREE.Vector3(0, eyeY - 0.055, skinBox.max.z)
    : mouthBox.getCenter(new THREE.Vector3());

  // Nose tip: the front-most skin point on the midline between eyes and mouth.
  const b = skin.base;
  const nose = new THREE.Vector3(0, (eyeY + mouth.y) / 2, -Infinity);
  let noseZ = -Infinity;
  for (let i = 0; i < b.length; i += 3) {
    if (Math.abs(b[i]) > 0.004 || b[i + 1] > eyeY || b[i + 1] < mouth.y) continue;
    if (b[i + 2] * front > noseZ) {
      noseZ = b[i + 2] * front;
      nose.set(0, b[i + 1], b[i + 2]);
    }
  }
  // Chin: the lowest midline point still near the front of the face.
  let chinY = mouth.y - 0.02;
  for (let i = 0; i < b.length; i += 3) {
    if (Math.abs(b[i]) > 0.004 || b[i + 1] > mouth.y) continue;
    if (b[i + 2] * front > noseZ - 0.026 && b[i + 1] < chinY) chinY = b[i + 1];
  }
  return {
    parts,
    front,
    eyeY,
    chinY,
    seamY: skinBox.min.y,
    halfW: Math.max(0.05, (skinBox.max.x - skinBox.min.x) / 2),
    mouth,
    nose,
    left,
    right,
    key: '',
  };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
function smooth(a: number, b: number, x: number) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
const bump = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2));

const FACE_KEYS = [
  'faceWidth', 'faceLength', 'jawWidth', 'jawAngle', 'chinWidth', 'chinLength', 'cheekbones', 'cheekFull',
  'eyeSize', 'eyeWidth', 'eyeHeight', 'eyeSpacing', 'eyeTilt', 'eyeY', 'irisSize',
  'browY', 'browSpacing', 'browTilt', 'browThick', 'browLength',
  'noseLength', 'noseWidth', 'noseBridge', 'noseTip', 'noseProjection',
  'mouthWidth', 'mouthHeight', 'mouthY',
] as const;

/** Reshape the face from its sliders. Cheap to call when nothing changed. */
export function sculptFace(rig: FaceRig, sliders: Sliders, eyesClosed = false) {
  // The blink shape was made for the eye as modeled: draw the blink frame
  // at that size so the lids meet.
  if (eyesClosed) sliders = { ...sliders, eyeSize: 0, eyeWidth: 0, eyeHeight: 0 };
  const key = FACE_KEYS.map((k) => sv(sliders, k)).join(',');
  if (key === rig.key) return;
  rig.key = key;
  const g = (k: (typeof FACE_KEYS)[number]) => sv(sliders, k);
  const F = rig.front;
  const span = rig.eyeY - rig.chinY;

  // Head shape: applies to every face part so eyes and mouth ride along.
  const shape = (x: number, y: number, z: number, out: THREE.Vector3) => {
    const below = clamp01((rig.eyeY - y) / span);
    const fade = smooth(rig.seamY + 0.002, rig.seamY + 0.022, y);
    const ax = Math.min(1, Math.abs(x) / rig.halfW);
    let sx = 1;
    sx += 0.08 * g('faceWidth') * smooth(-0.15, 0.35, below);
    sx += 0.11 * g('jawWidth') * smooth(0.3, 0.85, below);
    sx += 0.08 * g('jawAngle') * bump(below, 0.75, 0.18) * smooth(0.3, 0.8, ax);
    sx += 0.18 * g('chinWidth') * smooth(0.65, 1, below) * (1 - ax);
    sx += 0.05 * g('cheekbones') * bump(below, 0.2, 0.14) * smooth(0.45, 0.85, ax);
    sx += 0.06 * g('cheekFull') * bump(below, 0.55, 0.2) * smooth(0.35, 0.85, ax);
    sx = 1 + (Math.max(0.86, Math.min(1.2, sx)) - 1) * fade;
    let ny = y;
    // Shortening is gentler than lengthening: the chin must never rise
    // past the skin under it.
    const fl = g('faceLength');
    const cl = g('chinLength');
    if (below > 0) ny = rig.eyeY - (rig.eyeY - y) * (1 + (fl > 0 ? 0.1 : 0.05) * fl * fade);
    ny -= (cl > 0 ? 0.01 : 0.004) * cl * smooth(0.6, 1, below) * fade;
    let nz = z;
    nz += F * 0.004 * g('cheekbones') * bump(below, 0.2, 0.14) * smooth(0.4, 0.8, ax) * fade;
    nz += F * 0.004 * g('cheekFull') * bump(below, 0.55, 0.2) * smooth(0.3, 0.8, ax) * fade;
    out.set(x * sx, ny, nz);
  };

  // Nose: a soft region around the tip, and the ridge up to the eyes.
  const nose = (x: number, y: number, z: number, out: THREE.Vector3) => {
    const n = rig.nose;
    const front = (z - n.z) * F; // 0 at the tip, negative behind it
    const d = Math.hypot(x / 1.3, y - n.y);
    const tip = bump(d, 0, 0.012) * smooth(-0.025, -0.005, front);
    const ridge = smooth(0.012, 0.004, Math.abs(x)) * smooth(n.y, n.y + 0.006, y) * smooth(rig.eyeY, rig.eyeY - 0.012, y) * smooth(-0.02, -0.006, front);
    out.set(
      x * (1 + 0.45 * g('noseWidth') * tip),
      y - 0.004 * g('noseLength') * tip + 0.003 * g('noseTip') * tip,
      z + F * (0.004 * g('noseProjection') * tip + 0.003 * g('noseBridge') * ridge - 0.002 * g('noseTip') * tip),
    );
  };

  const tmp = new THREE.Vector3();
  for (const part of rig.parts) {
    const b = part.base;
    const a = part.pos.array as Float32Array;
    for (let i = 0; i < b.length; i += 3) {
      let x = b[i];
      let y = b[i + 1];
      let z = b[i + 2];
      const s = x >= 0 ? 1 : -1;
      const side = s > 0 ? rig.left : rig.right;
      if (part.kind === 'iris' || part.kind === 'highlight') {
        const k = 1 + 0.25 * g('irisSize');
        x = side.iris.x + (x - side.iris.x) * k;
        y = side.iris.y + (y - side.iris.y) * k;
      }
      if (part.kind !== 'brow' && part.kind !== 'mouth' && part.kind !== 'other') {
        // Each eye scales and turns about its own center. The skin around
        // it (the socket the eye sits in) moves with it, fading out with
        // distance, so the opening always matches the eye.
        const c = side.eye;
        const dx = x - c.x;
        const dy = y - c.y;
        const w = part.kind === 'skin' ? smooth(0.05, 0.03, Math.hypot(dx, dy * 1.25)) * smooth(-0.02, 0, (z - c.z) * F + 0.02) : 1;
        if (w > 0) {
          const size = 1 + 0.2 * g('eyeSize');
          const ex = dx * size * (1 + 0.16 * g('eyeWidth'));
          const ey = dy * size * (1 + 0.25 * g('eyeHeight'));
          const t = s * 0.2 * g('eyeTilt');
          const nx = c.x + ex * Math.cos(t) - ey * Math.sin(t) + s * 0.006 * g('eyeSpacing');
          const ny = c.y + ex * Math.sin(t) + ey * Math.cos(t) + 0.005 * g('eyeY');
          // Follow the face's curve as the eye grows or moves outward.
          z += -F * 0.3 * (Math.abs(nx) - Math.abs(x)) * w;
          x += (nx - x) * w;
          y += (ny - y) * w;
        }
      }
      if (part.kind === 'brow') {
        const c = side.brow;
        let dx = x - c.x;
        let dy = y - c.y;
        // Length grows from the inner end outward.
        const inner = side.browInner - c.x;
        dx = inner + (dx - inner) * (1 + 0.3 * g('browLength'));
        dy *= 1 + 0.6 * g('browThick');
        const t = s * 0.3 * g('browTilt');
        const rx = dx * Math.cos(t) - dy * Math.sin(t);
        const ry = dx * Math.sin(t) + dy * Math.cos(t);
        x = c.x + rx + s * 0.006 * g('browSpacing');
        y = c.y + ry + 0.008 * g('browY');
        z += -F * 0.25 * Math.max(0, Math.abs(x) - Math.abs(b[i]));
      }
      if (part.kind === 'mouth' || part.kind === 'skin') {
        // The lips are part of the skin: warp it around the mouth, with
        // the mouth's inside riding along.
        const c = rig.mouth;
        const dx = x - c.x;
        const dy = y - c.y;
        const w = part.kind === 'skin' ? smooth(0.024, 0.012, Math.hypot(dx / 1.7, dy)) * smooth(-0.045, -0.02, (z - rig.nose.z) * F) : 1;
        if (w > 0) {
          x += dx * 0.3 * g('mouthWidth') * w;
          y += (dy * 0.45 * g('mouthHeight') + 0.005 * g('mouthY')) * w;
        }
      }
      if (part.kind === 'skin') {
        nose(x, y, z, tmp);
        x = tmp.x;
        y = tmp.y;
        z = tmp.z;
      }
      shape(x, y, z, tmp);
      a[i] = tmp.x;
      a[i + 1] = tmp.y;
      a[i + 2] = tmp.z;
    }
    part.pos.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- hair

interface HairPart {
  pos: THREE.BufferAttribute;
  base: Float32Array;
}

export interface HairRig {
  parts: HairPart[];
  centerY: number;
  earY: number;
  key: string;
}

export function prepareHair(vrm: VRM, eyeY: number): HairRig {
  const parts: HairPart[] = [];
  vrm.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !matName(mesh).toLowerCase().includes('hair')) return;
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    parts.push({ pos, base: (pos.array as Float32Array).slice() });
  });
  return { parts, centerY: eyeY + 0.03, earY: eyeY - 0.03, key: '' };
}

export function sculptHair(rig: HairRig, sliders: Sliders) {
  const vol = sv(sliders, 'hairVolume');
  const len = sv(sliders, 'hairLength');
  const key = `${vol},${len}`;
  if (key === rig.key) return;
  rig.key = key;
  for (const part of rig.parts) {
    const b = part.base;
    const a = part.pos.array as Float32Array;
    for (let i = 0; i < b.length; i += 3) {
      const y = b[i + 1];
      // Volume: out from the head's center, more toward the ends.
      const k = 1 + 0.1 * vol * smooth(rig.centerY + 0.1, rig.centerY - 0.05, y);
      a[i] = b[i] * k;
      a[i + 2] = b[i + 2] * k;
      a[i + 1] = y < rig.earY ? rig.earY - (rig.earY - y) * (1 + 0.4 * len) : y;
    }
    part.pos.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- clothes

/** Looser or tighter clothes: push the cloth out from the body's axis. */
export function fitCloth(vrm: VRM, sliders: Sliders) {
  const top = sv(sliders, 'topFit');
  const bottom = sv(sliders, 'bottomFit');
  vrm.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const n = matName(mesh).toLowerCase();
    const amt = n.includes('top') ? top : n.includes('bottom') ? bottom : 0;
    if (!n.includes('top') && !n.includes('bottom')) return;
    const d = mesh.userData as { fitOrig?: Float32Array; loose?: Float32Array };
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    if (!d.fitOrig) d.fitOrig = a.slice();
    // The top was just rewritten by fitTop (viewer.ts, loose or the
    // arms-crossed shape): start from that. Others start from the original.
    const src = d.loose ? a.slice() : d.fitOrig;
    if (!d.loose) a.set(src);
    pos.needsUpdate = true;
    if (!amt) return;
    const k = 1 + (amt > 0 ? 0.09 : 0.05) * amt;
    for (let i = 0; i < src.length; i += 3) {
      a[i] = src[i] * k;
      a[i + 2] = src[i + 2] * k;
    }
  });
}

// ---------------------------------------------------------------- body

type V3 = [number, number, number];

/** Per humanoid bone: [width (x), length (along the bone), depth (z)] factors. */
function bodyFactors(sl: Sliders): Record<string, V3> {
  const g = (k: Parameters<typeof sv>[1]) => sv(sl, k);
  const f: Record<string, V3> = {};
  const mul = (bone: string, w: number, l: number, d: number) => {
    const cur = f[bone] ?? [1, 1, 1];
    f[bone] = [cur[0] * w, cur[1] * l, cur[2] * d];
  };
  const both = (bone: string, w: number, l: number, d: number) => {
    mul(`left${bone}`, w, l, d);
    mul(`right${bone}`, w, l, d);
  };
  const m = g('muscle');
  const fat = g('bodyFat');
  const mp = m > 0 ? m : m * 0.6;
  // Width and depth of the torso.
  mul('upperChest', 1 + 0.08 * g('shoulders') + 0.05 * g('chest') + 0.04 * mp, 1, 1 + 0.1 * g('chest') + 0.06 * mp + 0.04 * fat);
  mul('chest', 1 + 0.05 * g('waist') + 0.03 * fat, 1, 1 + 0.05 * g('chest') + 0.06 * fat);
  mul('spine', 1 + 0.12 * g('waist') + 0.12 * fat, 1, 1 + 0.1 * g('waist') + 0.16 * fat);
  mul('hips', 1 + 0.1 * g('hips') + 0.06 * fat, 1, 1 + 0.05 * g('hips') + 0.08 * fat);
  // Lengths.
  const torso = 1 + 0.07 * g('torsoLength');
  mul('spine', 1, torso, 1);
  mul('chest', 1, torso, 1);
  mul('upperChest', 1, torso, 1);
  mul('neck', 1 + 0.15 * g('neckThick') + 0.06 * mp + 0.05 * fat, 1 + 0.35 * g('neckLength'), 1 + 0.15 * g('neckThick') + 0.06 * mp + 0.05 * fat);
  both('Shoulder', 1, 1 + 0.3 * g('shoulders') + 0.08 * mp, 1);
  const arm = 1 + 0.1 * g('armLength');
  const armT = 1 + 0.16 * mp + 0.1 * fat;
  both('UpperArm', armT, arm, armT);
  both('LowerArm', 1 + 0.1 * mp + 0.05 * fat, arm, 1 + 0.1 * mp + 0.05 * fat);
  const leg = 1 + 0.1 * g('legLength');
  both('UpperLeg', 1 + 0.08 * mp + 0.1 * fat + 0.04 * g('hips'), leg, 1 + 0.08 * mp + 0.1 * fat);
  both('LowerLeg', 1 + 0.07 * mp + 0.05 * fat, leg, 1 + 0.07 * mp + 0.05 * fat);
  return f;
}

/** Bones that are not humanoid but carry skin weights follow a humanoid segment. */
function segmentOf(name: string): string | null {
  const side = /_L_/.test(name) ? 'left' : /_R_/.test(name) ? 'right' : null;
  if (!side) return null;
  if (/Bust/.test(name)) return 'upperChest';
  if (/UpperArm/.test(name)) return `${side}UpperArm`;
  if (/LowerArm|Elbow|Hand/.test(name)) return `${side}LowerArm`;
  if (/UpperLeg/.test(name)) return `${side}UpperLeg`;
  if (/LowerLeg|Knee/.test(name)) return `${side}LowerLeg`;
  if (/Shoulder/.test(name)) return `${side}Shoulder`;
  return null;
}

const HUMAN_BONES = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
  'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
];

/**
 * Scale the raw bones. three-vrm copies only rotations from the normalized
 * rig, so scale on raw bones stays. A child inherits its parent's scale, so
 * each bone's own scale is what it wants divided by what it inherits (in
 * its own axes); that keeps every slider local to its body part.
 */
export function applyBody(vrm: VRM, sliders: Sliders, headScale: number) {
  const h = vrm.humanoid;
  const byNode = new Map<THREE.Object3D, string>();
  for (const name of HUMAN_BONES) {
    const node = h.getRawBoneNode(name as never);
    if (node) byNode.set(node, name);
  }
  const hips = h.getRawBoneNode('hips' as never);
  if (!hips) return;
  const factors = bodyFactors(sliders);
  const head = headScale * (1 + 0.1 * sv(sliders, 'headSize'));

  // The axis a bone runs along: toward its first humanoid child.
  const axisOf = (node: THREE.Object3D): number => {
    for (const child of node.children) {
      if (byNode.has(child)) {
        const p = child.position;
        const a = [Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)];
        return a.indexOf(Math.max(...a));
      }
    }
    return 1;
  };
  const desired = new Map<THREE.Object3D, THREE.Vector3>();
  const want = (node: THREE.Object3D, parentEff: THREE.Vector3): THREE.Vector3 => {
    const name = byNode.get(node) ?? segmentOf(node.name);
    if (name === 'head') return new THREE.Vector3(head, head, head);
    const fac = name ? factors[name] : undefined;
    if (!fac) {
      // Feet, hands and helper bones keep their parent's size, except
      // non-uniform stretch is dropped so hands and feet never warp.
      if (byNode.has(node)) return new THREE.Vector3(1, 1, 1);
      return parentEff.clone();
    }
    const [w, l, d] = fac;
    const axis = axisOf(node);
    if (axis === 0) return new THREE.Vector3(l, (w + d) / 2, (w + d) / 2);
    if (axis === 2) return new THREE.Vector3(w, d, l);
    return new THREE.Vector3(w, l, d);
  };

  const m = new THREE.Matrix3();
  const walk = (node: THREE.Object3D, parentEff: THREE.Vector3) => {
    const eff = want(node, parentEff);
    desired.set(node, eff);
    // Inherited scale seen in this bone's axes: diag(Rᵀ S R).
    m.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(node.quaternion));
    const e = m.elements; // column-major
    const inh = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      // diag_i = Σ_k R[k][i]² · S[k]
      inh[i] = e[i * 3] ** 2 * parentEff.x + e[i * 3 + 1] ** 2 * parentEff.y + e[i * 3 + 2] ** 2 * parentEff.z;
    }
    node.scale.set(eff.x / inh[0], eff.y / inh[1], eff.z / inh[2]);
    for (const child of node.children) walk(child, eff);
  };
  walk(hips, new THREE.Vector3(1, 1, 1));
}

/** Height scale for the whole model. */
export function heightScale(sliders: Sliders, legacy: string): number {
  const v = sv(sliders, 'height');
  if (v) return 1 + 0.07 * v;
  return { short: 0.95, medium: 1, tall: 1.05 }[legacy] ?? 1;
}
