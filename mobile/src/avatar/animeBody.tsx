// Full body of the anime avatar: a jointed skeleton (shoulders, elbows,
// wrists, hips, knees, ankles) with a natural weight shift, and every limb
// drawn as one smooth tapered shape through its joints. That is what gives
// the figure its flow: curved calves and forearms, hips that sit over one
// leg, shoulders that tilt the other way, and clothes that follow.
//
// Canvas: 200 x 440, the same as the toon body, so the head, neck and
// figure shift line up. Every AvatarConfig body field changes the drawing.

import React from 'react';
import { Circle, G, Path } from 'react-native-svg';
import { mix } from '../theme/tokens';
import { FEET_Y, type ToonKit } from './toonParts';
import type { AvatarConfig } from './types';

/** How much the body moves: the three looks offered to merill. */
export interface BodyFlow {
  id: string;
  label: string;
  /** Sideways shift of the hips over the standing leg. */
  sway: number;
  /** Shoulder and hip tilt, in canvas units, opposite to each other. */
  tilt: number;
  /** How far the free leg steps out and bends. */
  step: number;
  /** 0..1: how much hems, sleeves and jacket tails flare and ripple. */
  flow: number;
  /** Raises the hips: longer legs, taller look. */
  legs: number;
  /** Extra shoulder width (a V-shaped torso). */
  shoulders: number;
}

export const BODY_FLOWS: Record<string, BodyFlow> = {
  relaxed: { id: 'relaxed', label: 'Relaxed', sway: 3, tilt: 1.5, step: 0.2, flow: 0.25, legs: 0, shoulders: 0 },
  flowing: { id: 'flowing', label: 'Flowing', sway: 11, tilt: 4.5, step: 1.2, flow: 1, legs: 5, shoulders: 0 },
  heroic: { id: 'heroic', label: 'Heroic', sway: 5, tilt: 2.5, step: 1.5, flow: 0.6, legs: 14, shoulders: 7 },
};

export const DEFAULT_BODY_FLOW = 'flowing';

export function bodyFlow(id: string | undefined): BodyFlow {
  return BODY_FLOWS[id ?? ''] ?? BODY_FLOWS[DEFAULT_BODY_FLOW];
}

type P = [number, number];
interface J {
  x: number;
  y: number;
  /** Half width of the limb at this point. */
  w: number;
}

// ---------------------------------------------------------------- geometry

function smooth(points: P[]): string {
  // Catmull-Rom through every point, as cubic Beziers.
  let d = '';
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1: P = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: P = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function closedSmooth(points: P[]): string {
  const n = points.length;
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const c1: P = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: P = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return `${d} Z`;
}

function lerp(a: J, b: J, t: number): J {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t };
}

/** One smooth tapered shape through a chain of joints, rounded at the end. */
function limb(chain: J[], endCap = 1.1): string {
  const n = chain.length;
  const left: P[] = [];
  const right: P[] = [];
  const dirs: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = chain[Math.max(0, i - 1)];
    const b = chain[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    dirs.push([dx, dy]);
    left.push([chain[i].x - dy * chain[i].w, chain[i].y + dx * chain[i].w]);
    right.push([chain[i].x + dy * chain[i].w, chain[i].y - dx * chain[i].w]);
  }
  const end = chain[n - 1];
  const [ex, ey] = dirs[n - 1];
  const start = chain[0];
  const [sx, sy] = dirs[0];
  const tip: P = [end.x + ex * end.w * endCap, end.y + ey * end.w * endCap];
  const back: P = [start.x - sx * start.w * 0.9, start.y - sy * start.w * 0.9];
  const r = [...right].reverse();
  return [
    `M${left[0][0].toFixed(1)},${left[0][1].toFixed(1)}`,
    smooth(left),
    ` Q${tip[0].toFixed(1)},${tip[1].toFixed(1)} ${r[0][0].toFixed(1)},${r[0][1].toFixed(1)}`,
    smooth(r),
    ` Q${back[0].toFixed(1)},${back[1].toFixed(1)} ${left[0][0].toFixed(1)},${left[0][1].toFixed(1)}`,
    ' Z',
  ].join('');
}

/** Point a share of the way along a joint chain. */
function along(chain: J[], t: number): { at: J; index: number } {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < chain.length - 1; i++) {
    const l = Math.hypot(chain[i + 1].x - chain[i].x, chain[i + 1].y - chain[i].y);
    lengths.push(l);
    total += l;
  }
  let target = total * t;
  for (let i = 0; i < lengths.length; i++) {
    if (target <= lengths[i]) return { at: lerp(chain[i], chain[i + 1], target / lengths[i]), index: i };
    target -= lengths[i];
  }
  return { at: chain[chain.length - 1], index: chain.length - 2 };
}

/** The chain up to share t, widened by `extra`. */
function cut(chain: J[], t: number, extra = 0, flare = 0): J[] {
  const { at, index } = along(chain, t);
  const out = chain.slice(0, index + 1).map((j) => ({ ...j, w: j.w + extra }));
  out.push({ ...at, w: at.w + extra + flare });
  return out;
}

// ---------------------------------------------------------------- skeleton

const BUILD: Record<AvatarConfig['bodyBuild'], { s: number; waist: number; hip: number; limb: number }> = {
  slim: { s: 29, waist: 19, hip: 22, limb: 0.9 },
  athletic: { s: 35, waist: 21, hip: 23, limb: 1.1 },
  average: { s: 32, waist: 22, hip: 25, limb: 1 },
  curvy: { s: 29, waist: 19, hip: 30, limb: 1 },
  broad: { s: 37, waist: 27, hip: 29, limb: 1.15 },
};

interface Skeleton {
  sL: P;
  sR: P;
  waist: P;
  hips: P;
  hipL: P;
  hipR: P;
  legL: J[];
  legR: J[];
  armL: J[];
  armR: J[];
  /** Hand direction (unit vector from the wrist). */
  handL: P;
  handR: P;
  build: (typeof BUILD)['average'];
  feetY: number;
  hemY: number;
}

function skeleton(config: AvatarConfig, f: BodyFlow): Skeleton {
  const b = BUILD[config.bodyBuild] ?? BUILD.average;
  const feet = FEET_Y[config.height] ?? FEET_Y.medium;
  const k = b.limb;
  const s = b.s + f.shoulders;
  // Weight on the viewer's left leg: that hip rises, the shoulders tilt the other way.
  const sL: P = [100 - s, 131 + f.tilt];
  const sR: P = [100 + s, 131 - f.tilt];
  const hipY = 212 - f.legs;
  const hips: P = [100 + f.sway, hipY];
  const waist: P = [100 + f.sway * 0.45, (131 + hipY) / 2 + 6];
  const hipL: P = [hips[0] - b.hip * 0.52, hipY + 8 - f.tilt];
  const hipR: P = [hips[0] + b.hip * 0.52, hipY + 8 + f.tilt];

  const ankle = feet - 5;
  // Standing leg: almost straight, foot under the neck.
  const legL: J[] = [
    { x: hipL[0], y: hipL[1], w: 14 * k },
    { x: hipL[0] - 1, y: hipL[1] + (ankle - hipL[1]) * 0.24, w: 13 * k },
    { x: 100 - 9, y: hipL[1] + (ankle - hipL[1]) * 0.5, w: 8.6 * k },
    { x: 100 - 10.5, y: hipL[1] + (ankle - hipL[1]) * 0.68, w: 9.4 * k },
    { x: 100 - 9.5, y: ankle, w: 5 * k },
  ];
  // Free leg: steps out, knee turned in a little.
  const out = 14 + 10 * f.step;
  const legR: J[] = [
    { x: hipR[0], y: hipR[1], w: 14 * k },
    { x: hipR[0] + 1, y: hipR[1] + (ankle - hipR[1]) * 0.24, w: 13 * k },
    { x: 100 + 9 + 2 * f.step, y: hipR[1] + (ankle - hipR[1]) * 0.5, w: 8.6 * k },
    { x: 100 + 10 + 6 * f.step, y: hipR[1] + (ankle - hipR[1]) * 0.7, w: 9.4 * k },
    { x: 100 + out, y: ankle - 2 * f.step, w: 5 * k },
  ];

  const arm = (sh: P, elbow: P, wrist: P): J[] => [
    { x: sh[0], y: sh[1] + 3, w: 7.5 * k },
    { x: sh[0] + (elbow[0] - sh[0]) * 0.45, y: sh[1] + (elbow[1] - sh[1]) * 0.45, w: 7 * k },
    { x: elbow[0], y: elbow[1], w: 5 * k },
    { x: elbow[0] + (wrist[0] - elbow[0]) * 0.35, y: elbow[1] + (wrist[1] - elbow[1]) * 0.35, w: 5.6 * k },
    { x: wrist[0], y: wrist[1], w: 3.6 * k },
  ];
  const hang = (side: -1 | 1, sh: P): { a: J[]; hand: P } => {
    const spread = side === 1 ? 1 + f.flow * 0.6 : 1;
    const elbow: P = [sh[0] + side * (4 + 3 * spread), sh[1] + 46];
    const wrist: P = [sh[0] + side * (5 + 4 * spread) - side * 2 * f.flow, sh[1] + 88];
    return { a: arm(sh, elbow, wrist), hand: [side * 0.12, 1] };
  };

  let armL = hang(-1, sL);
  let armR = hang(1, sR);
  switch (config.pose) {
    case 'hip': {
      const elbow: P = [sR[0] + 24, sR[1] + 38];
      const wrist: P = [hipR[0] + 8, hipY - 6];
      armR = { a: arm(sR, elbow, wrist), hand: [-0.8, 0.5] };
      break;
    }
    case 'wave': {
      const elbow: P = [sR[0] + 24, sR[1] + 18];
      const wrist: P = [sR[0] + 30, sR[1] - 28];
      armR = { a: arm(sR, elbow, wrist), hand: [0.15, -1] };
      break;
    }
    case 'arms-crossed': {
      armL = { a: arm(sL, [sL[0] - 2, sL[1] + 50], [100 + 20, sL[1] + 40]), hand: [1, -0.2] };
      armR = { a: arm(sR, [sR[0] + 2, sR[1] + 54], [100 - 22, sR[1] + 46]), hand: [-1, -0.2] };
      break;
    }
    default:
      break;
  }

  const thobe = config.outfit === 'thobe';
  const hemY = thobe ? feet - 4 : config.outfit === 'jacket' ? hipY + 26 : hipY + 12;
  return {
    sL, sR, waist, hips, hipL, hipR, legL, legR,
    armL: armL.a, armR: armR.a, handL: armL.hand, handR: armR.hand,
    build: b, feetY: feet, hemY,
  };
}

// ---------------------------------------------------------------- parts

function wave(x0: number, x1: number, y: number, amp: number, n: number): P[] {
  const pts: P[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([x0 + (x1 - x0) * t, y + Math.sin(t * Math.PI * 2.5 + 0.6) * amp]);
  }
  return pts;
}

/** Torso outline (shirt), from the neckline round to the hem. */
function torsoPath(sk: Skeleton, f: BodyFlow, hem: number, flare: number): string {
  const { sL, sR, waist, hips, build } = sk;
  const hw = build.hip + flare;
  const ww = build.waist;
  const left: P[] = [
    [sL[0] - 6, sL[1] + 4],
    [sL[0] - 1, sL[1] + 24],
    [waist[0] - ww - 1, waist[1]],
    [hips[0] - hw - 1, Math.min(hem - 4, hips[1] + 2) - f.tilt],
  ];
  const right: P[] = [
    [hips[0] + hw + 1, Math.min(hem - 4, hips[1] + 2) + f.tilt],
    [waist[0] + ww + 1, waist[1]],
    [sR[0] + 1, sR[1] + 24],
    [sR[0] + 6, sR[1] + 4],
  ];
  const bottom = wave(hips[0] - hw - 2, hips[0] + hw + 2, hem, 1.2 + 2 * f.flow * (flare > 6 ? 1.6 : 1), 6);
  const top: P[] = [
    [sR[0] - 2, sR[1] - 5],
    [112, 124],
    [100, 129],
    [88, 124],
    [sL[0] + 2, sL[1] - 5],
  ];
  return closedSmooth([...left, ...bottom, ...right, ...top]);
}

function Hand({ at, dir, fill, shade }: { at: J; dir: P; fill: string; shade: string }) {
  const angle = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI - 90;
  return (
    <G transform={`translate(${at.x.toFixed(1)} ${at.y.toFixed(1)}) rotate(${angle.toFixed(1)})`}>
      <Path d="M-4.2,-1 C-5.4,4 -4.6,9.5 -1.2,11.4 C1.6,12.6 4.4,10.6 4.8,6 C5.1,2.4 4.4,0 3.8,-1.2 Z" fill={fill} />
      <Path d="M4.2,1 C6.6,2.6 7,5.6 5.4,7.2" stroke={shade} strokeWidth={1.4} strokeLinecap="round" fill="none" />
    </G>
  );
}

function Foot({ ankle, side, style, kit, skin, sole }: { ankle: J; side: -1 | 1; style: string; kit: ToonKit; skin: string; sole: string }) {
  const x = ankle.x + side * 1.5;
  const y = ankle.y;
  const grow = `translate(${x} ${y}) scale(1.25) translate(${-x} ${-y})`;
  const shoe = kit.url('shoes');
  const footShape = `M${x - 5},${y} C${x - 7},${y + 6} ${x - 9 + side * -2},${y + 12} ${x + side * 2 - 9},${y + 14} L${x + side * 2 + 9},${y + 14} C${x + 9},${y + 12} ${x + 7},${y + 6} ${x + 5},${y} Z`;
  return <G transform={grow}>{footArt()}</G>;
  function footArt() {
  switch (style) {
    case 'boots':
      return (
        <G>
          <Path d={`M${x - 6},${y - 30} L${x + 6},${y - 30} L${x + 7},${y + 2} C${x + 11},${y + 7} ${x + 12},${y + 11} ${x + 11 + side * 2},${y + 14.5} L${x - 11 + side * 2},${y + 14.5} C${x - 12},${y + 11} ${x - 11},${y + 7} ${x - 7},${y + 2} Z`} fill={shoe} />
          <Path d={`M${x - 11.5 + side * 2},${y + 14.5} L${x + 11.5 + side * 2},${y + 14.5}`} stroke={sole} strokeWidth={2.6} strokeLinecap="round" />
          <Path d={`M${x - 7.5},${y - 24} L${x + 7.5},${y - 26} M${x - 7.4},${y - 16} L${x + 7.4},${y - 18}`} stroke={sole} strokeOpacity={0.5} strokeWidth={1} />
        </G>
      );
    case 'sandals':
      return (
        <G>
          <Path d={footShape} fill={skin} />
          <Path d={`M${x - 10 + side * 2},${y + 14.5} L${x + 10 + side * 2},${y + 14.5}`} stroke={sole} strokeWidth={2.4} strokeLinecap="round" />
          <Path d={`M${x - 7},${y + 7} Q${x},${y + 3} ${x + 7},${y + 7}`} stroke={kit.shoes} strokeWidth={2.6} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'barefoot':
      return <Path d={footShape} fill={skin} />;
    default:
      // sneakers
      return (
        <G>
          <Path d={`M${x - 6.5},${y - 3} C${x - 9},${y + 4} ${x - 12},${y + 9} ${x - 11 + side * 2},${y + 13} L${x + 11 + side * 2},${y + 13} C${x + 12},${y + 9} ${x + 9},${y + 4} ${x + 6.5},${y - 3} Z`} fill={shoe} />
          <Path d={`M${x - 12 + side * 2},${y + 13} L${x + 12 + side * 2},${y + 13}`} stroke={sole} strokeWidth={3.4} strokeLinecap="round" />
          <Path d={`M${x - 3.5},${y + 3} L${x + 3.5},${y + 3} M${x - 4.5},${y + 6.5} L${x + 4.5},${y + 6.5}`} stroke={sole} strokeWidth={1.1} strokeLinecap="round" />
        </G>
      );
  }
  }
}

const LONG_SLEEVES = new Set(['hoodie', 'turtleneck', 'jacket', 'thobe']);

/** Ink fold lines: elbows, waist, knees, where cloth bunches. */
function Folds({ sk, ink, line, config }: { sk: Skeleton; ink: string; line: number; config: AvatarConfig }) {
  const d: string[] = [];
  const longSleeve = LONG_SLEEVES.has(config.outfit);
  if (longSleeve) {
    for (const a of [sk.armL, sk.armR]) {
      const e = a[2];
      d.push(`M${e.x - 3},${e.y - 2} q2,2 4,1.5 M${e.x - 2},${e.y + 3} q2,1.4 4,0.5`);
    }
  }
  d.push(`M${sk.waist[0] - sk.build.waist + 4},${sk.waist[1] + 4} q6,4 12,3 M${sk.waist[0] + sk.build.waist - 4},${sk.waist[1] - 2} q-5,6 -11,7`);
  if (config.bottoms === 'pants' || config.bottoms === 'joggers') {
    for (const l of [sk.legL, sk.legR]) {
      const kn = l[2];
      d.push(`M${kn.x - 4},${kn.y - 3} q3,2 7,0 M${kn.x - 3},${kn.y + 4} q3,1.5 5,-0.5`);
    }
    d.push(`M${sk.hips[0] - 2},${sk.hips[1] + 14} q-3,10 -8,16 M${sk.hips[0] + 2},${sk.hips[1] + 14} q4,8 9,12`);
  }
  return <Path d={d.join(' ')} stroke={ink} strokeWidth={line * 0.45} strokeLinecap="round" fill="none" opacity={0.55} />;
}

// ---------------------------------------------------------------- body

export function FluidBodyBack({ config, kit, flowId }: { config: AvatarConfig; kit: ToonKit; flowId?: string }) {
  const f = bodyFlow(flowId);
  const sk = skeleton(config, f);
  const top = kit.url('top');
  return (
    <G>
      {config.outfit === 'hoodie' ? (
        <Path d={`M74,${sk.sL[1] - 2} Q70,104 100,102 Q130,104 126,${sk.sR[1] - 2} Z`} fill={kit.top.shade} />
      ) : null}
      {config.outfit === 'jacket' && f.flow > 0.5 ? (
        // jacket tail lifting behind the free leg
        <Path d={`M${sk.hips[0] + 8},${sk.hips[1]} Q${sk.hips[0] + 40},${sk.hips[1] + 18} ${sk.hips[0] + 46},${sk.hemY + 10} L${sk.hips[0] + 18},${sk.hemY} Z`} fill={top} />
      ) : null}
    </G>
  );
}

export function FluidBody({
  config,
  kit,
  flowId,
  ink,
  line,
  silhouette = false,
}: {
  config: AvatarConfig;
  kit: ToonKit;
  flowId?: string;
  ink: string;
  line: number;
  /** Solid ink copy for the outline pass. */
  silhouette?: boolean;
}) {
  const f = bodyFlow(flowId);
  const sk = skeleton(config, f);
  const skinFill = kit.url('skin');
  const topFill = kit.url('top');
  const botFill = kit.url('bottom');
  const sole = silhouette ? ink : mix(kit.shoes, '#FFFFFF', 0.75);
  const thobe = config.outfit === 'thobe';
  const longSleeve = LONG_SLEEVES.has(config.outfit);
  const bottoms = config.bottoms;
  const legs = [sk.legL, sk.legR];

  const skinLegs = legs.map((l, i) => <Path key={`l${i}`} d={limb(l, 0.6)} fill={skinFill} />);
  const feet = legs.map((l, i) => (
    <Foot key={`f${i}`} ankle={l[l.length - 1]} side={i === 0 ? -1 : 1} style={config.shoes} kit={kit} skin={skinFill} sole={sole} />
  ));

  let pants: React.ReactNode = null;
  if (!thobe) {
    if (bottoms === 'pants' || bottoms === 'joggers') {
      const jog = bottoms === 'joggers';
      pants = (
        <G>
          {legs.map((l, i) => {
            const chain = l.map((j, n) => ({ ...j, w: j.w + (n === l.length - 1 ? (jog ? 2.5 : 4.5) : n === 2 ? 3.5 : 2.5) }));
            return <Path key={i} d={limb(chain.slice(0, -1).concat({ ...chain[chain.length - 1], y: chain[chain.length - 1].y - 1 }), 0.2)} fill={botFill} />;
          })}
          <Path d={`M${sk.hips[0] - sk.build.hip},${sk.hips[1] - 10} L${sk.hips[0] + sk.build.hip},${sk.hips[1] - 10} L${sk.hipR[0] + 12},${sk.hipR[1] + 6} L${sk.hips[0]},${sk.hips[1] + 24} L${sk.hipL[0] - 12},${sk.hipL[1] + 6} Z`} fill={botFill} />
          {jog
            ? legs.map((l, i) => {
                const a = l[l.length - 1];
                return (
                  <G key={`c${i}`}>
                    <Path d={`M${a.x - 8.5},${a.y - 9} L${a.x + 8.5},${a.y - 9} L${a.x + 7.5},${a.y - 1} L${a.x - 7.5},${a.y - 1} Z`} fill={kit.url('bottom')} />
                    <Path d={`M${a.x - 8.5},${a.y - 9} L${a.x + 8.5},${a.y - 9} M${a.x - 7},${a.y - 6.5} L${a.x - 7},${a.y - 2} M${a.x - 3},${a.y - 6.5} L${a.x - 3},${a.y - 2} M${a.x + 1},${a.y - 6.5} L${a.x + 1},${a.y - 2} M${a.x + 5},${a.y - 6.5} L${a.x + 5},${a.y - 2}`} stroke={ink} strokeWidth={line * 0.4} opacity={0.6} />
                  </G>
                );
              })
            : null}
        </G>
      );
    } else if (bottoms === 'shorts') {
      pants = (
        <G>
          {legs.map((l, i) => <Path key={i} d={limb(cut(l, 0.36, 3.5, 1.5), 0.2)} fill={botFill} />)}
          <Path d={`M${sk.hips[0] - sk.build.hip},${sk.hips[1] - 10} L${sk.hips[0] + sk.build.hip},${sk.hips[1] - 10} L${sk.hipR[0] + 12},${sk.hipR[1] + 8} L${sk.hips[0]},${sk.hips[1] + 22} L${sk.hipL[0] - 12},${sk.hipL[1] + 8} Z`} fill={botFill} />
        </G>
      );
    } else {
      // skirt: flares from the waist and ripples at the hem
      const top = sk.hips[1] - 10;
      const hem = sk.hips[1] + 70 + 6 * f.flow;
      const spread = sk.build.hip + 14 + 10 * f.flow;
      const hemPts = wave(sk.hips[0] + spread + 4 * f.flow, sk.hips[0] - spread, hem, 2 + 3 * f.flow, 8);
      pants = (
        <Path
          d={closedSmooth([[sk.hips[0] - sk.build.hip - 2, top], [sk.hips[0] + sk.build.hip + 2, top], [sk.hips[0] + sk.build.hip + 8, top + 30], ...hemPts, [sk.hips[0] - sk.build.hip - 8, top + 30]])}
          fill={botFill}
        />
      );
    }
  }

  // Torso and shirt.
  const hem = sk.hemY;
  const flare = thobe ? 14 + 10 * f.flow : config.outfit === 'jacket' ? 3 + 4 * f.flow : 1;
  const torso = <Path d={torsoPath(sk, f, hem, flare)} fill={topFill} />;

  const arms = [
    { a: sk.armL, hand: sk.handL },
    { a: sk.armR, hand: sk.handR },
  ].map(({ a, hand }, i) => {
    const sleeve = longSleeve
      ? limb(cut(a, 0.93, 2.6, 1.6 + 2.5 * f.flow), 0.25)
      : limb(cut(a, 0.32, 2.8, 1 + 2 * f.flow), 0.2);
    return (
      <G key={`a${i}`}>
        <Path d={limb(a, 0.5)} fill={skinFill} />
        <Path d={sleeve} fill={topFill} />
        <Hand at={a[a.length - 1]} dir={hand} fill={skinFill} shade={kit.skin.shade} />
      </G>
    );
  });

  const detail = (() => {
    const light = mix(kit.top.value, '#FFFFFF', 0.65);
    const sh = kit.top.shade;
    const nx = 100;
    switch (config.outfit) {
      case 'hoodie':
        return (
          <G>
            <Path d={`M86,123 Q100,137 114,123 Q100,130 86,123 Z`} fill={sh} />
            <Path d={`M95,131 Q94,146 95.5,158 M105,131 Q106,146 104.5,158`} stroke={light} strokeWidth={1.6} strokeLinecap="round" fill="none" />
            <Path d={`M${sk.hips[0] - 16},${hem - 8} Q${sk.hips[0] - 14},${hem - 26} ${sk.hips[0] - 4},${hem - 27} L${sk.hips[0] + 4},${hem - 27} Q${sk.hips[0] + 14},${hem - 26} ${sk.hips[0] + 16},${hem - 8}`} stroke={sh} strokeWidth={1.4} fill="none" />
          </G>
        );
      case 'collar':
        return (
          <G>
            <Path d={`M86,121 L100,134 L95,140 L83,127 Z M114,121 L100,134 L105,140 L117,127 Z`} fill={light} />
            <Path d={`M100,134 Q${nx + f.sway * 0.3},170 ${sk.hips[0]},${hem - 2}`} stroke={sh} strokeWidth={1.3} fill="none" />
            {[146, 160, 174].map((y) => (
              <Circle key={y} cx={100 + (sk.waist[0] - 100) * ((y - 134) / 50)} cy={y} r={1.4} fill={light} />
            ))}
          </G>
        );
      case 'thobe':
        return (
          <G>
            <Path d={`M90,124 Q100,131 110,124`} stroke={sh} strokeWidth={1.8} fill="none" />
            <Path d={`M100,129 L${100 + (sk.waist[0] - 100) * 1.2},176`} stroke={sh} strokeWidth={1.4} />
            <Path d={`M${sk.hips[0] - 6},${sk.hips[1] + 20} Q${sk.hips[0] - 12},${hem - 60} ${sk.hips[0] - 16},${hem - 4} M${sk.hips[0] + 8},${sk.hips[1] + 16} Q${sk.hips[0] + 18},${hem - 70} ${sk.hips[0] + 26 + 6 * f.flow},${hem - 2}`} stroke={sh} strokeWidth={1.4} fill="none" opacity={0.7} />
          </G>
        );
      case 'turtleneck':
        return (
          <G>
            <Path d={`M87,112 Q100,108 113,112 L114,128 Q100,133 86,128 Z`} fill={topFill} />
            {[92, 97, 103, 108].map((x) => (
              <Path key={x} d={`M${x},114 L${x},128`} stroke={sh} strokeWidth={1} opacity={0.55} />
            ))}
          </G>
        );
      case 'jacket':
        return (
          <G>
            <Path d={`M90,124 Q100,131 110,124 L${sk.waist[0] + 6},${sk.waist[1]} L${sk.hips[0] + 5},${hem - 1} L${sk.hips[0] - 5},${hem - 1} L${sk.waist[0] - 6},${sk.waist[1]} Z`} fill={silhouette ? ink : '#EEE8DE'} />
            <Path d={`M88,122 L${sk.waist[0] - 6},${sk.waist[1]} L${sk.hips[0] - 5},${hem} M112,122 L${sk.waist[0] + 6},${sk.waist[1]} L${sk.hips[0] + 5},${hem}`} stroke={sh} strokeWidth={2.2} strokeLinejoin="round" fill="none" />
            <Path d={`M84,125 L95,152 L90,157 Z M116,125 L105,152 L110,157 Z`} fill={sh} />
          </G>
        );
      default:
        return <Path d={`M88,123 Q100,135 112,123 Q100,129 88,123 Z`} fill={kit.top.shade} />;
    }
  })();

  return (
    <G>
      {skinLegs}
      {feet}
      {pants}
      {torso}
      {detail}
      {arms}
      {silhouette ? null : <Folds sk={sk} ink={ink} line={line} config={config} />}
    </G>
  );
}
