// Painted details. Facial hair, freckles, blush, under-eye circles, beauty
// marks and scars are painted into the face's skin texture, and clothing
// patterns into the clothes' textures. Each triangle is drawn in texture
// space and every pixel is colored from its 3D position on the original
// mesh, so a stripe is level across the chest and a beard follows the jaw
// whatever the texture layout. Results are cached by what changes them.

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { sv, type Sliders } from '../src/avatar/custom';
import type { FaceRig } from './sculpt';

export interface PaintCommand {
  /** Facial hair id (custom.ts FACIAL_HAIR_3D). */
  beard?: string;
  /** Beauty mark or scar id (custom.ts BEAUTY_MARKS). */
  mark?: string;
  /** Pattern ids (custom.ts PATTERNS) and their second colors. */
  topPattern?: string;
  top2?: string;
  bottomPattern?: string;
  bottom2?: string;
}

interface Surface {
  mat: THREE.Material & { map?: THREE.Texture | null; shadeMultiplyTexture?: THREE.Texture | null; color?: THREE.Color; shadeColorFactor?: THREE.Color };
  pos: Float32Array;
  uv: Float32Array;
  index: ArrayLike<number> | null;
  /** Source pixels (the original map or its grayscale copy) at paint size. */
  src: ImageData | null;
  /** The map before any painting, to put back when nothing is painted. */
  plain: THREE.Texture | null;
  canvas: HTMLCanvasElement | null;
  tex: THREE.CanvasTexture | null;
  key: string;
}

export interface PaintRig {
  face: Surface | null;
  top: Surface | null;
  bottom: Surface | null;
  landmarks: FaceRig | null;
}

type Mat = Surface['mat'];

function surfaceFor(vrm: VRM, test: (name: string) => boolean): Surface | null {
  let found: Surface | null = null;
  vrm.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (found || !mesh.isMesh) return;
    const mat = ([] as THREE.Material[]).concat(mesh.material)[0] as Mat;
    if (!mat || !test(mat.name.toLowerCase())) return;
    const g = mesh.geometry;
    const pos = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    if (!pos || !uv) return;
    found = {
      mat,
      // Paint from the shape as modeled, before any slider moves it.
      pos: (pos.array as Float32Array).slice(),
      uv: (uv.array as Float32Array).slice(),
      index: g.index ? (g.index.array as ArrayLike<number>) : null,
      src: null,
      plain: mat.map ?? null,
      canvas: null,
      tex: null,
      key: '',
    };
  });
  return found;
}

export function preparePaint(vrm: VRM, face: FaceRig | null): PaintRig {
  return {
    face: face ? surfaceFor(vrm, (n) => n.startsWith('face_') && n.includes('skin')) : null,
    top: surfaceFor(vrm, (n) => n.includes('top')),
    bottom: surfaceFor(vrm, (n) => n.includes('bottom')),
    landmarks: face,
  };
}

/** Read a texture's pixels, scaled to at most `max` on the long side. */
function pixels(tex: THREE.Texture, max: number): ImageData | null {
  const img = tex.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img || !img.width) return null;
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * k);
  cv.height = Math.round(img.height * k);
  const g = cv.getContext('2d')!;
  g.drawImage(img, 0, 0, cv.width, cv.height);
  return g.getImageData(0, 0, cv.width, cv.height);
}

type Rgba = [number, number, number, number];
type Shader = (x: number, y: number, z: number, src: Rgba) => Rgba | null;

/**
 * Draw every triangle into `out` in texture space. `shade` gets the 3D
 * point and the source color, and returns the new color or null (keep).
 * Triangles grow by half a pixel so seams leave no gaps.
 */
function rasterize(s: Surface, out: ImageData, shade: Shader, keep?: (x: number, y: number, z: number) => boolean) {
  const W = out.width;
  const H = out.height;
  const src = s.src!.data;
  const dst = out.data;
  const done = new Uint8Array(W * H);
  const P = s.pos;
  const U = s.uv;
  const n = s.index ? s.index.length : P.length / 3;
  const at = (k: number) => (s.index ? s.index[k] : k);
  const col: Rgba = [0, 0, 0, 255];
  for (let t = 0; t < n; t += 3) {
    const a = at(t);
    const b = at(t + 1);
    const c = at(t + 2);
    if (keep && !keep(P[a * 3], P[a * 3 + 1], P[a * 3 + 2]) && !keep(P[b * 3], P[b * 3 + 1], P[b * 3 + 2]) && !keep(P[c * 3], P[c * 3 + 1], P[c * 3 + 2])) continue;
    const ax = U[a * 2] * W, ay = U[a * 2 + 1] * H;
    const bx = U[b * 2] * W, by = U[b * 2 + 1] * H;
    const cx = U[c * 2] * W, cy = U[c * 2 + 1] * H;
    const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(det) < 1e-9) continue;
    const pad = 0.75;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - pad));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx) + pad));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - pad));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy) + pad));
    // Barycentric tolerance worth about half a pixel at this size.
    const eps = pad / Math.max(1, Math.sqrt(Math.abs(det)));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const i = py * W + px;
        if (done[i]) continue;
        const qx = px + 0.5;
        const qy = py + 0.5;
        const w1 = ((qx - ax) * (cy - ay) - (cx - ax) * (qy - ay)) / det;
        const w2 = ((bx - ax) * (qy - ay) - (qx - ax) * (by - ay)) / det;
        const w0 = 1 - w1 - w2;
        if (w0 < -eps || w1 < -eps || w2 < -eps) continue;
        done[i] = 1;
        const x = w0 * P[a * 3] + w1 * P[b * 3] + w2 * P[c * 3];
        const y = w0 * P[a * 3 + 1] + w1 * P[b * 3 + 1] + w2 * P[c * 3 + 1];
        const z = w0 * P[a * 3 + 2] + w1 * P[b * 3 + 2] + w2 * P[c * 3 + 2];
        const o = i * 4;
        col[0] = src[o];
        col[1] = src[o + 1];
        col[2] = src[o + 2];
        col[3] = src[o + 3];
        const r = shade(x, y, z, col);
        if (!r) continue;
        dst[o] = r[0];
        dst[o + 1] = r[1];
        dst[o + 2] = r[2];
        dst[o + 3] = r[3];
      }
    }
  }
}

/** Show `img` as the material's map (and shade map), reusing one canvas. */
function show(s: Surface, img: ImageData, like: THREE.Texture) {
  if (!s.canvas || s.canvas.width !== img.width || s.canvas.height !== img.height) {
    s.canvas = document.createElement('canvas');
    s.canvas.width = img.width;
    s.canvas.height = img.height;
    s.tex?.dispose();
    s.tex = new THREE.CanvasTexture(s.canvas);
    s.tex.colorSpace = like.colorSpace;
    s.tex.flipY = like.flipY;
    s.tex.wrapS = like.wrapS;
    s.tex.wrapT = like.wrapT;
  }
  s.canvas.getContext('2d')!.putImageData(img, 0, 0);
  s.tex!.needsUpdate = true;
  s.mat.map = s.tex;
  if ('shadeMultiplyTexture' in s.mat && s.mat.shadeMultiplyTexture !== undefined) s.mat.shadeMultiplyTexture = s.tex;
  s.mat.needsUpdate = true;
}

function restore(s: Surface, base: THREE.Texture | null) {
  if (!base || s.mat.map === base) return;
  s.mat.map = base;
  if (s.mat.shadeMultiplyTexture !== undefined) s.mat.shadeMultiplyTexture = base;
  s.mat.needsUpdate = true;
}

// ---------------------------------------------------------------- helpers

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
function smooth(a: number, b: number, x: number) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
/** Stable pseudo-random number in [0,1) for integer cell coordinates. */
function hash(i: number, j: number, k = 0): number {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const h = (a: number, b: number, c: number) => hash(xi + a, yi + b, zi + c);
  return l(
    l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v),
    l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v),
    w,
  );
}

function mixInto(c: Rgba, r: number, g: number, b: number, a: number): Rgba {
  return [c[0] + (r - c[0]) * a, c[1] + (g - c[1]) * a, c[2] + (b - c[2]) * a, c[3]];
}

const rgb = (col: THREE.Color): [number, number, number] => {
  const s = col.clone().convertLinearToSRGB();
  return [s.r * 255, s.g * 255, s.b * 255];
};

// ---------------------------------------------------------------- face

/** How much facial hair covers a point, 0..1, before stubble noise. */
function beardCover(style: string, f: FaceRig, x: number, y: number, z: number): number {
  const F = f.front;
  if ((z - f.nose.z) * F < -0.075) return 0; // never the back of the head
  const ax = Math.abs(x);
  const span = f.eyeY - f.chinY;
  const below = (f.eyeY - y) / span;
  const m = f.mouth;
  const mouthHalf = 0.022;
  const lipTop = m.y + 0.0045;
  const lipBottom = m.y - 0.0045;
  const edge = 0.0025;
  // Building blocks: soft-edged rounded shapes, not boxes.
  const ell = (cx: number, cy: number, rx: number, ry: number) => smooth(1.2, 0.8, Math.hypot((ax - cx) / rx, (y - cy) / ry));
  const chinMid = (lipBottom + f.chinY) / 2 - 0.003;
  const chinRy = (lipBottom - f.chinY) / 2 + 0.006;
  // The mustache droops a little toward its ends.
  const mustache = ell(0, lipTop + 0.0065 - ax * 0.12, mouthHalf + 0.007, 0.0055) * smooth(lipTop - 0.001, lipTop + 0.0015, y);
  const pencil = ell(0, lipTop + 0.004 - ax * 0.1, mouthHalf + 0.002, 0.0026) * smooth(lipTop - 0.001, lipTop + 0.001, y);
  const chin = ell(0, chinMid, 0.015, chinRy) * smooth(lipBottom + 0.001, lipBottom - 0.002, y);
  const wideChin = ell(0, chinMid, 0.027, chinRy) * smooth(lipBottom + 0.001, lipBottom - 0.002, y);
  const soul = ell(0, lipBottom - 0.0075, 0.0045, 0.005);
  const lower = smooth(0.42, 0.52, below);
  // The lip line itself (drawn in the skin a little under the mouth's center) stays clear.
  const notLips = 1 - smooth(0.019, 0.015, ax) * smooth(0.0026, 0.0012, Math.abs(y - (m.y - 0.004)));
  const full = Math.max(lower, mustache) * notLips;
  const cheekLine = smooth(0.3, 0.45, below);
  const sides = smooth(0.62, 0.78, ax / f.halfW);
  const jawEdge = Math.max(sides * smooth(0.35, 0.5, below), smooth(f.chinY + 0.012, f.chinY + 0.004, y) * smooth(0.6, 0.85, below));
  // Bars from the mustache's ends down past the mouth corners.
  const corners = ell(mouthHalf + 0.0055, (lipTop + chinMid) / 2, 0.0042, (lipTop - chinMid) / 2 + 0.004);
  switch (style) {
    case 'stubble-light':
    case 'stubble':
    case 'stubble-heavy':
    case 'beard':
      return Math.max(full, cheekLine * sides) * notLips;
    case 'short-beard':
      return full;
    case 'boxed':
      return Math.max(full * (1 - sides * smooth(0.45, 0.35, below)), mustache);
    case 'faded':
      return Math.max(full * smooth(0.45, 0.9, below), mustache);
    case 'goatee':
      return Math.max(chin, mustache);
    case 'extended-goatee':
      return Math.max(wideChin, mustache);
    case 'van-dyke':
      return Math.max(chin * smooth(lipBottom - 0.004, lipBottom - 0.007, y), mustache * smooth(lipTop, lipTop + 0.003, y));
    case 'anchor':
      return Math.max(chin * smooth(lipBottom - 0.004, lipBottom - 0.008, y), pencil, soul);
    case 'balbo':
      return Math.max(wideChin * smooth(lipBottom - 0.002, lipBottom - 0.005, y), mustache * smooth(lipTop + 0.001, lipTop + 0.004, y));
    case 'circle':
      return Math.max(chin, mustache, corners);
    case 'chin-strap':
      return jawEdge;
    case 'mutton-chops':
      return Math.max(sides * smooth(0.05, 0.2, below) * smooth(0.9, 0.75, below), mustache);
    case 'mustache':
      return mustache;
    case 'pencil':
      return pencil;
    case 'horseshoe':
      return Math.max(mustache, corners);
    case 'chevron':
      return ell(0, lipTop + 0.0075 - ax * 0.16, mouthHalf + 0.009, 0.0068) * smooth(lipTop - 0.001, lipTop + 0.0015, y);
    case 'soul-patch':
      return soul;
    default:
      return 0;
  }
}

const BEARD_ALPHA: Record<string, number> = { 'stubble-light': 0.22, stubble: 0.36, 'stubble-heavy': 0.5 };

function paintFace(s: Surface, f: FaceRig, cmd: PaintCommand, sliders: Sliders, hair: THREE.Color, skin: THREE.Color) {
  const beard = cmd.beard && cmd.beard !== 'none' ? cmd.beard : '';
  const mark = cmd.mark && cmd.mark !== 'none' ? cmd.mark : '';
  const freckles = sv(sliders, 'freckles');
  const blush = sv(sliders, 'blush');
  const under = sv(sliders, 'underEye');
  const key = [beard, mark, freckles, blush, under, hair.getHexString(), skin.getHexString()].join('|');
  if (key === s.key) return;
  s.key = key;
  if (!beard && !mark && !freckles && !blush && !under) {
    restore(s, s.plain);
    return;
  }
  if (!s.src && s.plain) s.src = pixels(s.plain, 1024);
  if (!s.src) return;
  const out = new ImageData(new Uint8ClampedArray(s.src.data), s.src.width, s.src.height);
  const F = f.front;
  // The material multiplies the texture by the skin tone; divide it out so
  // painted colors come out as meant.
  const div = (c: [number, number, number]): [number, number, number] => [
    Math.min(255, c[0] / Math.max(0.2, skin.r)),
    Math.min(255, c[1] / Math.max(0.2, skin.g)),
    Math.min(255, c[2] / Math.max(0.2, skin.b)),
  ];
  const hairRgb = div(rgb(hair));
  const blushRgb: [number, number, number] = [236, 120, 118];
  const shadowRgb: [number, number, number] = [150, 105, 130];
  const freckleRgb: [number, number, number] = [150, 85, 52];
  const markRgb: [number, number, number] = [70, 40, 30];
  const scarRgb: [number, number, number] = [250, 205, 195];
  const beardA = BEARD_ALPHA[beard] ?? 0.9;
  const stubble = beard.startsWith('stubble');

  const shade: Shader = (x, y, z, c) => {
    if ((z - f.nose.z) * F < -0.07) return null;
    let out = c;
    const ax = Math.abs(x);
    const side = x >= 0 ? f.left : f.right;
    if (blush) {
      const d = Math.hypot((ax - Math.abs(side.eye.x) - 0.004) / 1.3, y - (side.eye.y - 0.03));
      const a = blush * 0.42 * Math.exp(-((d / 0.016) ** 2));
      if (a > 0.004) out = mixInto(out, ...blushRgb, a);
    }
    if (under) {
      const d = Math.hypot((ax - Math.abs(side.eye.x)) / 1.6, (y - (side.eye.y - 0.019)) * 1.4);
      const a = under * 0.45 * Math.exp(-((d / 0.011) ** 2));
      if (a > 0.004) out = mixInto(out, ...shadowRgb, a);
    }
    if (freckles) {
      const region = Math.exp(-(((ax - 0.018) / 0.04) ** 2) - ((y - (f.eyeY - 0.027)) / 0.016) ** 2);
      if (region > 0.05) {
        const cell = 0.0032;
        const ci = Math.floor(x / cell);
        const cj = Math.floor(y / cell);
        for (let di = -1; di <= 1; di++) {
          for (let dj = -1; dj <= 1; dj++) {
            const h = hash(ci + di, cj + dj, 7);
            if (h > (0.18 + 0.55 * freckles) * region) continue;
            const fx = (ci + di + hash(ci + di, cj + dj, 1)) * cell;
            const fy = (cj + dj + hash(ci + di, cj + dj, 2)) * cell;
            const r = 0.0006 + 0.0006 * hash(ci + di, cj + dj, 3);
            const d = Math.hypot(x - fx, y - fy);
            if (d < r) out = mixInto(out, ...freckleRgb, 0.55 * smooth(r, r * 0.5, d));
          }
        }
      }
    }
    if (beard) {
      let a = beardCover(beard, f, x, y, z);
      if (a > 0.001) {
        // Hair grain: fine noise so it reads as hair, not paint.
        const grain = noise3(x * 2600, y * 2600, z * 2600);
        a *= stubble ? beardA * (0.55 + 0.9 * grain) : beardA * (0.8 + 0.25 * grain);
        out = mixInto(out, ...hairRgb, clamp01(a));
      }
    }
    if (mark) {
      const L = f.left;
      const spot = (px: number, py: number, r: number) => {
        const d = Math.hypot(x - px, y - py);
        if (d < r * 1.3) out = mixInto(out, ...markRgb, 0.85 * smooth(r * 1.3, r * 0.7, d));
      };
      const scar = (x0: number, y0: number, x1: number, y1: number, w: number) => {
        const vx = x1 - x0, vy = y1 - y0;
        const t = clamp01(((x - x0) * vx + (y - y0) * vy) / (vx * vx + vy * vy));
        const d = Math.hypot(x - (x0 + vx * t), y - (y0 + vy * t));
        if (d < w * 2) {
          out = mixInto(out, ...div(scarRgb), 0.8 * smooth(w, w * 0.4, d));
          out = mixInto(out, 190, 110, 100, 0.35 * smooth(w * 2, w, d) * smooth(w * 0.4, w, d));
        }
      };
      switch (mark) {
        case 'cheek': spot(L.eye.x + 0.006, L.eye.y - 0.04, 0.0017); break;
        case 'cheekbone': spot(L.eye.x + 0.014, L.eye.y - 0.018, 0.0016); break;
        case 'lip': spot(f.mouth.x + 0.014, f.mouth.y + 0.011, 0.0015); break;
        case 'chin': spot(f.mouth.x + 0.008, f.chinY + 0.012, 0.0016); break;
        case 'eye': spot(L.eye.x + 0.012, L.eye.y - 0.016, 0.0014); break;
        case 'scar-cheek': scar(L.eye.x - 0.004, L.eye.y - 0.022, L.eye.x + 0.012, L.eye.y - 0.045, 0.0014); break;
        case 'scar-brow': scar(L.brow.x - 0.004, L.brow.y + 0.008, L.brow.x + 0.002, L.brow.y - 0.008, 0.0013); break;
        case 'scar-chin': scar(f.mouth.x - 0.006, f.chinY + 0.004, f.mouth.x + 0.006, f.chinY + 0.014, 0.0013); break;
        default: break;
      }
    }
    return out === c ? null : out;
  };
  rasterize(s, out, shade, (x, y, z) => (z - f.nose.z) * F > -0.08 && y < f.eyeY + 0.06);
  show(s, out, s.plain!);
}

// ---------------------------------------------------------------- clothes

/** 0 = main color, 1 = second color, in between = a mix. */
function patternAt(id: string, x: number, y: number, z: number): number {
  const ax = Math.abs(x);
  switch (id) {
    case 'stripes': return Math.floor(y / 0.022) % 2 === 0 ? 1 : 0;
    case 'wide-stripes': return Math.floor((y + 0.02) / 0.06) % 2 === 0 ? 1 : 0;
    case 'pinstripe': {
      const u = ((x + z * 0.4) / 0.014) % 1;
      return Math.abs(u < 0 ? u + 1 : u) < 0.12 ? 1 : 0;
    }
    case 'checks': return (Math.floor(x / 0.04) + Math.floor(y / 0.04) + Math.floor(z / 0.04)) % 2 === 0 ? 1 : 0;
    case 'gingham': {
      const a = Math.floor(y / 0.016) % 2 === 0 ? 1 : 0;
      const b = Math.floor((x + z) / 0.016) % 2 === 0 ? 1 : 0;
      return (a + b) / 2;
    }
    case 'dots': {
      const cell = 0.03;
      const i = Math.floor(x / cell), j = Math.floor(y / cell), k = Math.floor(z / cell);
      const odd = j % 2 === 0 ? 0 : 0.5;
      const cx = (i + 0.5 + odd) * cell, cy = (j + 0.5) * cell, cz = (k + 0.5) * cell;
      return Math.hypot(x - cx, y - cy, (z - cz) * 0.4) < cell * 0.22 ? 1 : 0;
    }
    case 'camo': {
      const n = noise3(x * 22, y * 22, z * 22) * 0.65 + noise3(x * 55, y * 55, z * 55) * 0.35;
      return n > 0.6 ? 1 : n > 0.45 ? 0.5 : 0;
    }
    case 'colorblock': return y > 1.12 ? 1 : 0;
    case 'raglan': return ax > 0.16 ? 1 : 0;
    default: return 0;
  }
}

function paintCloth(s: Surface, pattern: string, main: THREE.Color, second: THREE.Color) {
  const key = [pattern, main.getHexString(), second.getHexString()].join('|');
  if (key === s.key) return;
  s.key = key;
  const gray = (s.mat.userData.gray as THREE.Texture | undefined) ?? s.plain;
  if (!pattern || pattern === 'plain') {
    restore(s, gray);
    return;
  }
  if (!s.src && gray) s.src = pixels(gray, 1024);
  if (!s.src) return;
  const out = new ImageData(new Uint8ClampedArray(s.src.data), s.src.width, s.src.height);
  const a = rgb(main);
  const b = rgb(second);
  const camoDark: [number, number, number] = [a[0] * 0.55 + b[0] * 0.2, a[1] * 0.55 + b[1] * 0.2, a[2] * 0.55 + b[2] * 0.2];
  const shade: Shader = (x, y, z, c) => {
    const t = patternAt(pattern, x, y, z);
    let col: [number, number, number];
    if (pattern === 'camo' && t === 0.5) col = camoDark;
    else col = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const lum = c[0] / 255;
    return [col[0] * lum, col[1] * lum, col[2] * lum, c[3]];
  };
  rasterize(s, out, shade);
  show(s, out, gray!);
  // The colors are in the texture now.
  s.mat.color?.setRGB(1, 1, 1);
  s.mat.shadeColorFactor?.setRGB(0.42, 0.42, 0.42);
}

/**
 * Paint everything for this render. `tint` turns a config hex into the
 * graded color the rest of the model uses; `skin` is the face's multiply.
 */
export function paintAvatar(
  rig: PaintRig,
  cmd: PaintCommand,
  sliders: Sliders,
  colors: { hair: string; top: string; bottom: string; skin: string },
  tint: (hex: string) => THREE.Color,
  skinFactor: THREE.Color,
) {
  if (rig.face && rig.landmarks) paintFace(rig.face, rig.landmarks, cmd, sliders, tint(colors.hair), skinFactor);
  if (rig.top) {
    paintCloth(rig.top, cmd.topPattern ?? 'plain', tint(colors.top), tint(cmd.top2 ?? '#E8DFC8'));
    // A plain top keeps the color applyColors gave it; a patterned one has
    // its colors baked in, so keep the material white every render.
    if (cmd.topPattern && cmd.topPattern !== 'plain') {
      rig.top.mat.color?.setRGB(1, 1, 1);
      rig.top.mat.shadeColorFactor?.setRGB(0.42, 0.42, 0.42);
    }
  }
  if (rig.bottom) {
    paintCloth(rig.bottom, cmd.bottomPattern ?? 'plain', tint(colors.bottom), tint(cmd.bottom2 ?? '#E8DFC8'));
    if (cmd.bottomPattern && cmd.bottomPattern !== 'plain') {
      rig.bottom.mat.color?.setRGB(1, 1, 1);
      rig.bottom.mat.shadeColorFactor?.setRGB(0.42, 0.42, 0.42);
    }
  }
}
