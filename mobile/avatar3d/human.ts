// The realistic human the viewer draws: a MakeHuman base body (CC0) that
// is shaped by blending "targets" (stored vertex offsets), dressed with
// meshes fitted to that body (eyes, hair, clothes) and posed with its
// skeleton. Everything here is plain array maths with no three.js, so
// it runs the same in the WebView and in a test.
//
// The data comes from assets/avatar3d/models/human.bin, built by
// tools/human/build.py.

type ViewType = 'f32' | 'u16' | 'u32' | 'i16' | 'u8';
interface View {
  o: number;
  n: number;
  t: ViewType;
}
interface TextureView extends View {
  mime: string;
  alpha: boolean;
  w: number;
  h: number;
}
interface TargetData {
  i: View;
  d: View;
  s: number;
}
export interface ProxyHeader {
  kind: string;
  n: number;
  bind: View;
  bindW: View;
  bindO: View;
  scale: Partial<Record<'x' | 'y' | 'z', [number, number, number]>>;
  src: View;
  uv: View;
  tris: View;
  skinIndex: View;
  skinWeight: View;
  color: [number, number, number];
  transparent: boolean;
  depth: number;
  map?: number;
  normalMap?: number;
  hide?: View;
  tint?: boolean;
}
interface Header {
  version: number;
  scale: number;
  nVerts: number;
  base: { pos: View; src: View; uv: View; tris: View };
  skeleton: {
    bones: string[];
    parents: number[];
    jointVerts: View;
    jointRanges: View;
    skinIndex: View;
    skinWeight: View;
  };
  targets: Record<string, TargetData>;
  proxies: Record<string, ProxyHeader>;
  skins: Record<string, { map: number; for: string; tone: [number, number, number] }>;
  textures: TextureView[];
}

type Num = Float32Array | Uint16Array | Uint32Array | Int16Array | Uint8Array;

/** A rotation about the world axes, in radians, applied at a bone's head. */
export type Rot = [number, number, number];
export type Pose = Record<string, Rot>;

export interface MeshOut {
  /** Positions of the render vertices, metres, feet on the ground. */
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  index: Uint16Array | Uint32Array;
}

/** 3x4 matrices, row-major: [r00 r01 r02 tx, r10 ...]. */
function matMul(a: Float32Array, ao: number, b: Float32Array, bo: number, out: Float32Array, oo: number) {
  for (let r = 0; r < 3; r++) {
    const a0 = a[ao + r * 4];
    const a1 = a[ao + r * 4 + 1];
    const a2 = a[ao + r * 4 + 2];
    out[oo + r * 4] = a0 * b[bo] + a1 * b[bo + 4] + a2 * b[bo + 8];
    out[oo + r * 4 + 1] = a0 * b[bo + 1] + a1 * b[bo + 5] + a2 * b[bo + 9];
    out[oo + r * 4 + 2] = a0 * b[bo + 2] + a1 * b[bo + 6] + a2 * b[bo + 10];
    out[oo + r * 4 + 3] = a0 * b[bo + 3] + a1 * b[bo + 7] + a2 * b[bo + 11] + a[ao + r * 4 + 3];
  }
}

/** Rotation X then Y then Z about a pivot, as a 3x4 matrix. */
function pivotRotation(rot: Rot, px: number, py: number, pz: number, out: Float32Array) {
  const [x, y, z] = rot;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  // R = Rz * Ry * Rx
  const m = [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
  for (let r = 0; r < 3; r++) {
    out[r * 4] = m[r * 3];
    out[r * 4 + 1] = m[r * 3 + 1];
    out[r * 4 + 2] = m[r * 3 + 2];
    const p = r === 0 ? px : r === 1 ? py : pz;
    out[r * 4 + 3] = p - (m[r * 3] * px + m[r * 3 + 1] * py + m[r * 3 + 2] * pz);
  }
}

export class Human {
  readonly header: Header;
  private readonly buf: ArrayBuffer;
  private readonly start: number;
  private readonly cache = new Map<View, Num>();
  readonly nVerts: number;
  /** Shaped body, MakeHuman units, before the pose. */
  readonly coords: Float32Array;
  /** Bone head and tail positions for the shaped body. */
  readonly heads: Float32Array;
  readonly tails: Float32Array;
  private readonly mats: Float32Array;
  private ground = 0;

  constructor(buf: ArrayBuffer) {
    const len = new DataView(buf).getUint32(0, true);
    const text = new TextDecoder().decode(new Uint8Array(buf, 4, len));
    this.header = JSON.parse(text) as Header;
    this.buf = buf;
    this.start = 4 + len;
    this.nVerts = this.header.nVerts;
    this.coords = new Float32Array(this.nVerts * 3);
    const nb = this.header.skeleton.bones.length;
    this.heads = new Float32Array(nb * 3);
    this.tails = new Float32Array(nb * 3);
    this.mats = new Float32Array(nb * 12);
  }

  arr(v: View): Num {
    let a = this.cache.get(v);
    if (!a) {
      const o = this.start + v.o;
      a =
        v.t === 'f32'
          ? new Float32Array(this.buf, o, v.n)
          : v.t === 'u16'
            ? new Uint16Array(this.buf, o, v.n)
            : v.t === 'u32'
              ? new Uint32Array(this.buf, o, v.n)
              : v.t === 'i16'
                ? new Int16Array(this.buf, o, v.n)
                : new Uint8Array(this.buf, o, v.n);
      this.cache.set(v, a);
    }
    return a;
  }

  textureBlob(i: number): Blob {
    const t = this.header.textures[i];
    return new Blob([new Uint8Array(this.buf, this.start + t.o, t.n)], { type: t.mime });
  }

  /** Blend the targets into the base body and find the joints. */
  shape(weights: Record<string, number>) {
    const c = this.coords;
    c.set(this.arr(this.header.base.pos) as Float32Array);
    for (const name in weights) {
      const w = weights[name];
      const t = this.header.targets[name];
      if (!t || !w) continue;
      const idx = this.arr(t.i) as Uint16Array;
      const d = this.arr(t.d) as Int16Array;
      const s = t.s * w;
      for (let k = 0; k < idx.length; k++) {
        const o = idx[k] * 3;
        c[o] += d[k * 3] * s;
        c[o + 1] += d[k * 3 + 1] * s;
        c[o + 2] += d[k * 3 + 2] * s;
      }
    }
    const sk = this.header.skeleton;
    const jv = this.arr(sk.jointVerts) as Uint16Array;
    const jr = this.arr(sk.jointRanges) as Uint16Array;
    for (let b = 0; b < sk.bones.length; b++) {
      for (let end = 0; end < 2; end++) {
        const from = jr[(b * 2 + end) * 2];
        const n = jr[(b * 2 + end) * 2 + 1];
        let x = 0;
        let y = 0;
        let z = 0;
        for (let k = 0; k < n; k++) {
          const o = jv[from + k] * 3;
          x += c[o];
          y += c[o + 1];
          z += c[o + 2];
        }
        const out = end === 0 ? this.heads : this.tails;
        out[b * 3] = x / n;
        out[b * 3 + 1] = y / n;
        out[b * 3 + 2] = z / n;
      }
    }
  }

  bone(name: string): number {
    return this.header.skeleton.bones.indexOf(name);
  }

  /** Bone matrices for a pose. Parents always come before children. */
  pose(pose: Pose) {
    const sk = this.header.skeleton;
    const local = new Float32Array(12);
    const m = this.mats;
    for (let b = 0; b < sk.bones.length; b++) {
      const rot = pose[sk.bones[b]];
      const p = sk.parents[b];
      if (rot) pivotRotation(rot, this.heads[b * 3], this.heads[b * 3 + 1], this.heads[b * 3 + 2], local);
      if (p < 0) {
        if (rot) m.set(local, b * 12);
        else m.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], b * 12);
      } else if (rot) matMul(m, p * 12, local, 0, m, b * 12);
      else m.copyWithin(b * 12, p * 12, p * 12 + 12);
    }
    // Feet on the ground: the lowest body vertex after the pose.
    const posed = this.skin(this.coords, this.arr(sk.skinIndex) as Uint8Array, this.arr(sk.skinWeight) as Uint8Array);
    let low = Infinity;
    const src = this.arr(this.header.base.src) as Uint16Array;
    for (let k = 0; k < src.length; k += 7) low = Math.min(low, posed[src[k] * 3 + 1]);
    this.ground = low;
    return posed;
  }

  /** Where a bone's head ends up after the pose, in metres. */
  posedHead(name: string): [number, number, number] {
    const b = this.bone(name);
    const m = this.mats;
    const x = this.heads[b * 3];
    const y = this.heads[b * 3 + 1];
    const z = this.heads[b * 3 + 2];
    const s = this.header.scale;
    const o = b * 12;
    return [
      (m[o] * x + m[o + 1] * y + m[o + 2] * z + m[o + 3]) * s,
      (m[o + 4] * x + m[o + 5] * y + m[o + 6] * z + m[o + 7] - this.ground) * s,
      (m[o + 8] * x + m[o + 9] * y + m[o + 10] * z + m[o + 11]) * s,
    ];
  }

  private skin(coords: Float32Array, si: Uint8Array, sw: Uint8Array): Float32Array {
    const n = coords.length / 3;
    const out = new Float32Array(n * 3);
    const m = this.mats;
    for (let v = 0; v < n; v++) {
      const x = coords[v * 3];
      const y = coords[v * 3 + 1];
      const z = coords[v * 3 + 2];
      let ox = 0;
      let oy = 0;
      let oz = 0;
      let total = 0;
      for (let k = 0; k < 4; k++) {
        const w = sw[v * 4 + k];
        if (!w) continue;
        const o = si[v * 4 + k] * 12;
        ox += w * (m[o] * x + m[o + 1] * y + m[o + 2] * z + m[o + 3]);
        oy += w * (m[o + 4] * x + m[o + 5] * y + m[o + 6] * z + m[o + 7]);
        oz += w * (m[o + 8] * x + m[o + 9] * y + m[o + 10] * z + m[o + 11]);
        total += w;
      }
      if (total) {
        out[v * 3] = ox / total;
        out[v * 3 + 1] = oy / total;
        out[v * 3 + 2] = oz / total;
      } else {
        out[v * 3] = x;
        out[v * 3 + 1] = y;
        out[v * 3 + 2] = z;
      }
    }
    return out;
  }

  private finish(posed: Float32Array, src: Uint16Array, uv: Float32Array, index: Uint16Array | Uint32Array): MeshOut {
    const n = posed.length / 3;
    const normals = new Float32Array(n * 3);
    for (let t = 0; t < index.length; t += 3) {
      const a = src[index[t]] * 3;
      const b = src[index[t + 1]] * 3;
      const c = src[index[t + 2]] * 3;
      const ux = posed[b] - posed[a];
      const uy = posed[b + 1] - posed[a + 1];
      const uz = posed[b + 2] - posed[a + 2];
      const vx = posed[c] - posed[a];
      const vy = posed[c + 1] - posed[a + 1];
      const vz = posed[c + 2] - posed[a + 2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      for (const o of [a, b, c]) {
        normals[o] += nx;
        normals[o + 1] += ny;
        normals[o + 2] += nz;
      }
    }
    const s = this.header.scale;
    const position = new Float32Array(src.length * 3);
    const normal = new Float32Array(src.length * 3);
    for (let r = 0; r < src.length; r++) {
      const o = src[r] * 3;
      position[r * 3] = posed[o] * s;
      position[r * 3 + 1] = (posed[o + 1] - this.ground) * s;
      position[r * 3 + 2] = posed[o + 2] * s;
      const l = Math.hypot(normals[o], normals[o + 1], normals[o + 2]) || 1;
      normal[r * 3] = normals[o] / l;
      normal[r * 3 + 1] = normals[o + 1] / l;
      normal[r * 3 + 2] = normals[o + 2] / l;
    }
    return { position, normal, uv, index };
  }

  /** The body, without the faces that worn clothes cover. */
  body(posed: Float32Array, worn: string[]): MeshOut {
    const base = this.header.base;
    const src = this.arr(base.src) as Uint16Array;
    let index = this.arr(base.tris) as Uint16Array | Uint32Array;
    const masks = worn.map((id) => this.header.proxies[id]?.hide).filter((h): h is View => !!h);
    if (masks.length) {
      const hidden = new Uint8Array(this.nVerts);
      for (const h of masks) {
        const bits = this.arr(h) as Uint8Array;
        for (let v = 0; v < this.nVerts; v++) if (bits[v >> 3] & (1 << (v & 7))) hidden[v] = 1;
      }
      const kept: number[] = [];
      for (let t = 0; t < index.length; t += 3) {
        if (hidden[src[index[t]]] && hidden[src[index[t + 1]]] && hidden[src[index[t + 2]]]) continue;
        kept.push(index[t], index[t + 1], index[t + 2]);
      }
      index = new Uint16Array(kept);
    }
    return this.finish(posed, src, this.arr(base.uv) as Float32Array, index);
  }

  /** A fitted mesh (eyes, hair, clothes) on the shaped, posed body. */
  proxy(id: string): MeshOut | null {
    const p = this.header.proxies[id];
    if (!p) return null;
    const c = this.coords;
    const bind = this.arr(p.bind) as Uint16Array;
    const bw = this.arr(p.bindW) as Float32Array;
    const bo = this.arr(p.bindO) as Float32Array;
    const scale = [1, 1, 1];
    (['x', 'y', 'z'] as const).forEach((axis, k) => {
      const s = p.scale[axis];
      if (s && s[2]) scale[k] = Math.abs(c[s[0] * 3 + k] - c[s[1] * 3 + k]) / s[2];
    });
    const fitted = new Float32Array(p.n * 3);
    for (let v = 0; v < p.n; v++) {
      const a = bind[v * 3] * 3;
      const b = bind[v * 3 + 1] * 3;
      const d = bind[v * 3 + 2] * 3;
      const wa = bw[v * 3];
      const wb = bw[v * 3 + 1];
      const wd = bw[v * 3 + 2];
      for (let k = 0; k < 3; k++) fitted[v * 3 + k] = wa * c[a + k] + wb * c[b + k] + wd * c[d + k] + bo[v * 3 + k] * scale[k];
    }
    const posed = this.skin(fitted, this.arr(p.skinIndex) as Uint8Array, this.arr(p.skinWeight) as Uint8Array);
    return this.finish(posed, this.arr(p.src) as Uint16Array, this.arr(p.uv) as Float32Array, this.arr(p.tris) as Uint16Array | Uint32Array);
  }
}
