// Parts of the soft 3D avatar (see SoftAvatar.tsx for how they stack).
// Every AvatarConfig field maps to a visible difference here, so each
// choice in the avatar editor changes the preview the moment it is tapped.
//
// Canvas: 200 x 240. Head centered at (100, 92), eye line y=100, body from
// y=154, feet at y=232. Left/right are the viewer's left/right.

import React from 'react';
import { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { mix } from '../theme/tokens';
import type { AvatarConfig, Mood } from './types';

export const HEAD_CX = 100;
export const HEAD_CY = 92;
export const EYE_Y = 100;
export const WHITE = '#FFFFFF';
export const INK = '#2A1E18';
const BLUSH = '#FF8A80';
const LIP = '#C0605A';
const TONGUE = '#FF8C8C';
const GOLD = '#F2C14E';
const GOLD_DARK = '#C9952B';

/** Fill references and colors shared by every part. */
export interface PartKit {
  url: (name: 'skin' | 'hair' | 'top' | 'bottom' | 'iris' | 'shoes') => string;
  skin: { base: string; shade: string };
  hair: string;
  top: { value: string; shade: string };
  shoes: string;
  mood: Mood;
}

// ---------------------------------------------------------------- head

interface FaceShape {
  rx: number;
  ry: number;
  /** Bezier handle factors: upper half (forehead) and lower half (jaw). */
  top: number;
  jaw: number;
  /** How far down the jaw handle sits (0.55 = ellipse, higher = squarer). */
  jawDrop: number;
}

const FACES: Record<string, FaceShape> = {
  oval: { rx: 55, ry: 55, top: 0.56, jaw: 0.56, jawDrop: 0.56 },
  round: { rx: 59, ry: 55, top: 0.6, jaw: 0.62, jawDrop: 0.6 },
  square: { rx: 57, ry: 54, top: 0.78, jaw: 0.74, jawDrop: 0.82 },
  heart: { rx: 58, ry: 55, top: 0.74, jaw: 0.3, jawDrop: 0.66 },
  diamond: { rx: 58, ry: 56, top: 0.36, jaw: 0.36, jawDrop: 0.5 },
  oblong: { rx: 51, ry: 59, top: 0.6, jaw: 0.6, jawDrop: 0.66 },
  triangle: { rx: 56, ry: 55, top: 0.38, jaw: 0.82, jawDrop: 0.76 },
  wide: { rx: 62, ry: 52, top: 0.62, jaw: 0.62, jawDrop: 0.6 },
};

export function faceShape(id: string): FaceShape {
  return FACES[id] ?? FACES.oval;
}

/** Closed path of the head outline for a face shape. */
export function headPath(face: FaceShape, shrink = 0): string {
  const rx = face.rx - shrink;
  const ry = face.ry - shrink;
  const cx = HEAD_CX;
  const cy = HEAD_CY;
  const t = cy - ry;
  const b = cy + ry;
  const k = 0.56;
  return [
    `M${cx},${t}`,
    `C${cx + rx * face.top},${t} ${cx + rx},${cy - ry * k} ${cx + rx},${cy}`,
    `C${cx + rx},${cy + ry * face.jawDrop} ${cx + rx * face.jaw},${b} ${cx},${b}`,
    `C${cx - rx * face.jaw},${b} ${cx - rx},${cy + ry * face.jawDrop} ${cx - rx},${cy}`,
    `C${cx - rx},${cy - ry * k} ${cx - rx * face.top},${t} ${cx},${t}`,
    'Z',
  ].join(' ');
}

// ---------------------------------------------------------------- eyes

interface EyeSpec {
  /** Distance from the face center to each eye center. */
  dx: number;
  rx: number;
  ry: number;
  /** Degrees; positive lifts the outer corners. */
  tilt: number;
  /** Share of the eye (from the top) covered by the upper lid. */
  lid: number;
  crease: boolean;
}

const EYES: Record<string, EyeSpec> = {
  almond: { dx: 22, rx: 10.5, ry: 11.5, tilt: 4, lid: 0, crease: false },
  round: { dx: 22, rx: 11.5, ry: 13, tilt: 0, lid: 0, crease: false },
  upturned: { dx: 22, rx: 10.5, ry: 11, tilt: 12, lid: 0.05, crease: false },
  downturned: { dx: 22, rx: 10.5, ry: 11, tilt: -11, lid: 0.12, crease: false },
  narrow: { dx: 22, rx: 11, ry: 8, tilt: 2, lid: 0, crease: false },
  wide: { dx: 27, rx: 10.5, ry: 11.5, tilt: 0, lid: 0, crease: false },
  close: { dx: 18, rx: 10, ry: 11.5, tilt: 0, lid: 0, crease: false },
  deep: { dx: 22, rx: 10, ry: 11, tilt: 0, lid: 0.16, crease: true },
  monolid: { dx: 22, rx: 11, ry: 9, tilt: 4, lid: 0.28, crease: false },
  hooded: { dx: 22, rx: 10.5, ry: 11.5, tilt: -2, lid: 0.36, crease: true },
};

export function eyeSpec(id: string): EyeSpec {
  return EYES[id] ?? EYES.almond;
}

export function Eyes({ style, kit }: { style: string; kit: PartKit }) {
  const e = eyeSpec(style);
  const lid = Math.min(0.62, e.lid + (kit.mood === 'tired' ? 0.38 : 0));
  return (
    <G>
      {[-1, 1].map((side) => {
        const x = HEAD_CX + side * e.dx;
        const y = EYE_Y;
        const iris = Math.min(e.rx, e.ry) * 0.8;
        const lidY = y - e.ry + e.ry * 2 * lid;
        return (
          <G key={side} transform={`rotate(${-side * e.tilt} ${x} ${y})`}>
            <Ellipse cx={x} cy={y} rx={e.rx} ry={e.ry} fill={WHITE} />
            <Circle cx={x} cy={y + 1.5} r={iris} fill={kit.url('iris')} />
            <Circle cx={x} cy={y + 2} r={iris * 0.5} fill="#140C08" />
            <Circle cx={x - iris * 0.36} cy={y - iris * 0.3} r={iris * 0.36} fill={WHITE} />
            <Circle cx={x + iris * 0.34} cy={y + iris * 0.5} r={iris * 0.15} fill={WHITE} opacity={0.85} />
            {lid > 0 ? (
              <Path
                d={`M${x - e.rx - 1.5},${y - e.ry - 1} L${x + e.rx + 1.5},${y - e.ry - 1} L${x + e.rx + 1.5},${lidY} Q${x},${lidY + 3} ${x - e.rx - 1.5},${lidY} Z`}
                fill={kit.skin.base}
              />
            ) : null}
            {/* lash line along the lid edge */}
            <Path
              d={
                lid > 0
                  ? `M${x - e.rx - 1},${lidY} Q${x},${lidY + 3} ${x + e.rx + 1},${lidY}`
                  : `M${x - e.rx - 0.5},${y - 2} Q${x},${y - e.ry - 4.5} ${x + e.rx + 0.5},${y - 2}`
              }
              stroke={INK}
              strokeWidth={2.4}
              strokeLinecap="round"
              fill="none"
            />
            {e.crease ? (
              <Path
                d={`M${x - e.rx + 1},${y - e.ry - 4} Q${x},${y - e.ry - 9} ${x + e.rx - 1},${y - e.ry - 4}`}
                stroke={kit.skin.shade}
                strokeWidth={1.8}
                strokeLinecap="round"
                fill="none"
              />
            ) : null}
          </G>
        );
      })}
    </G>
  );
}

// ---------------------------------------------------------------- brows

interface BrowSpec {
  width: number;
  /** How high the arch rises above the ends. */
  arch: number;
  /** 'curve' is a smooth arch, 'angle' peaks toward the outer end. */
  kind: 'curve' | 'angle';
  double?: boolean;
}

const BROWS: Record<string, BrowSpec> = {
  natural: { width: 3.4, arch: 5, kind: 'curve' },
  thick: { width: 5.2, arch: 4, kind: 'curve' },
  thin: { width: 2, arch: 5, kind: 'curve' },
  arched: { width: 3.2, arch: 10, kind: 'curve' },
  straight: { width: 3.6, arch: 0.5, kind: 'curve' },
  angled: { width: 3.6, arch: 6, kind: 'angle' },
  rounded: { width: 4, arch: 8, kind: 'curve' },
  bushy: { width: 6.2, arch: 4, kind: 'curve', double: true },
};

export function Brows({ style, eyes, kit }: { style: string; eyes: string; kit: PartKit }) {
  const b = BROWS[style] ?? BROWS.natural;
  const e = eyeSpec(eyes);
  const lift = kit.mood === 'glowing' ? -2.5 : kit.mood === 'tired' ? 2.5 : 0;
  const y = EYE_Y - e.ry - 8 + lift;
  const color = mix(kit.hair, INK, 0.2);
  return (
    <G>
      {[-1, 1].map((side) => {
        const x = HEAD_CX + side * e.dx;
        const inner = x - side * 9;
        const outer = x + side * 11;
        const d =
          b.kind === 'angle'
            ? `M${inner},${y + 1} L${x + side * 4},${y - b.arch} L${outer},${y + 2}`
            : `M${inner},${y + 1} Q${x},${y - b.arch * 1.6} ${outer},${y + 1.5}`;
        return (
          <G key={side}>
            <Path d={d} stroke={color} strokeWidth={b.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            {b.double ? (
              <Path d={d} stroke={color} strokeWidth={b.width * 0.55} strokeLinecap="round" fill="none" opacity={0.6} transform={`translate(0 -2.4)`} />
            ) : null}
          </G>
        );
      })}
    </G>
  );
}

// ---------------------------------------------------------------- nose

export function Nose({ style, kit }: { style: string; kit: PartKit }) {
  const shade = kit.skin.shade;
  switch (style) {
    case 'button':
      return (
        <G>
          <Circle cx={100} cy={113} r={4.6} fill={shade} opacity={0.55} />
          <Circle cx={98.6} cy={111.4} r={1.8} fill={WHITE} opacity={0.55} />
        </G>
      );
    case 'wide':
      return (
        <G>
          <Ellipse cx={100} cy={114} rx={8} ry={4} fill={shade} opacity={0.55} />
          <Circle cx={96} cy={115} r={1.3} fill={INK} opacity={0.35} />
          <Circle cx={104} cy={115} r={1.3} fill={INK} opacity={0.35} />
        </G>
      );
    case 'pointed':
      return (
        <G>
          <Path d="M99,103 Q104,112 104.5,115 Q100,117.5 95.5,115 Q97,110 99,103 Z" fill={shade} opacity={0.5} />
          <Ellipse cx={100.5} cy={112} rx={1.6} ry={1} fill={WHITE} opacity={0.5} />
        </G>
      );
    case 'roman':
      return (
        <G>
          <Path d="M101,97 Q104,106 103.5,112" stroke={shade} strokeWidth={2.6} strokeLinecap="round" fill="none" opacity={0.6} />
          <Ellipse cx={100} cy={114} rx={5.6} ry={3.8} fill={shade} opacity={0.55} />
        </G>
      );
    case 'snub':
      return (
        <G>
          <Ellipse cx={100} cy={112} rx={4.6} ry={3} fill={shade} opacity={0.5} />
          <Circle cx={97.6} cy={113.2} r={1.1} fill={INK} opacity={0.35} />
          <Circle cx={102.4} cy={113.2} r={1.1} fill={INK} opacity={0.35} />
        </G>
      );
    default:
      return (
        <G>
          <Ellipse cx={100} cy={114} rx={5} ry={3.8} fill={shade} opacity={0.55} />
          <Ellipse cx={99} cy={112.5} rx={2} ry={1.2} fill={WHITE} opacity={0.5} />
        </G>
      );
  }
}

// ---------------------------------------------------------------- mouth

const MOOD_CURVE: Record<Mood, number> = {
  tired: 0.15,
  neutral: 0.6,
  happy: 1,
  glowing: 1.2,
};

export function Mouth({ style, kit }: { style: string; kit: PartKit }) {
  const k = MOOD_CURVE[kit.mood];
  const y = 127;
  const lip = mix(kit.skin.shade, LIP, 0.45);
  const line = (d: string, w = 2.8) => (
    <Path d={d} stroke={INK} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  );
  const grin = (half: number, depth: number, teeth: boolean) => (
    <G>
      <Path d={`M${100 - half},${y - 2} Q100,${y + depth} ${100 + half},${y - 2} Q100,${y + 3} ${100 - half},${y - 2} Z`} fill={INK} />
      {teeth ? (
        <Path d={`M${100 - half + 4},${y} Q100,${y + 3} ${100 + half - 4},${y} L${100 + half - 5},${y + 2.5} Q100,${y + 5} ${100 - half + 5},${y + 2.5} Z`} fill={WHITE} />
      ) : null}
      <Path d={`M${100 - half * 0.5},${y + depth * 0.55} Q100,${y + depth * 0.82} ${100 + half * 0.5},${y + depth * 0.55} Q100,${y + depth * 0.95} ${100 - half * 0.5},${y + depth * 0.55} Z`} fill={TONGUE} />
    </G>
  );

  if (kit.mood === 'tired') {
    // A tired day flattens every mouth into a small, slightly low line.
    return line(`M92,${y + 2} Q100,${y + 1} 108,${y + 2}`, 2.6);
  }

  switch (style) {
    case 'big-smile':
      return grin(17, 16 * k + 4, true);
    case 'neutral':
      return line(`M90,${y + 1} Q100,${y + 1 + 3 * k} 110,${y + 1}`);
    case 'smirk':
      return line(`M88,${y + 2} Q101,${y + 3 + 4 * k} 113,${y - 4 - 2 * k}`);
    case 'open':
      return (
        <G>
          <Ellipse cx={100} cy={y + 3} rx={8} ry={5 + 3 * k} fill={INK} />
          <Ellipse cx={100} cy={y + 5 + 2 * k} rx={5} ry={2.4 + k} fill={TONGUE} />
        </G>
      );
    case 'small':
      return line(`M94,${y} Q100,${y + 5 * k} 106,${y}`, 2.6);
    case 'full':
      return (
        <G>
          <Ellipse cx={100} cy={y + 3.5} rx={9.5} ry={3.6} fill={lip} />
          <Path d={`M89,${y} Q94.5,${y - 3} 100,${y - 1} Q105.5,${y - 3} 111,${y} Q100,${y + 2} 89,${y} Z`} fill={mix(lip, INK, 0.15)} />
          {line(`M89,${y + 0.5} Q100,${y + 1 + 5 * k} 111,${y + 0.5}`, 2)}
        </G>
      );
    case 'calm':
      return line(`M91,${y + 1} Q100,${y + 1 + 6 * k} 109,${y + 1}`, 2.3);
    default:
      // soft-smile: a closed smile that opens up on a great day.
      return k >= 1 ? grin(13, 12 * k, false) : line(`M88,${y} Q100,${y + 10 * k} 112,${y}`);
  }
}

export function Blush({ face, kit }: { face: FaceShape; kit: PartKit }) {
  const o = kit.mood === 'tired' ? 0.1 : kit.mood === 'glowing' ? 0.36 : 0.26;
  const dx = face.rx * 0.6;
  return (
    <G>
      <Ellipse cx={100 - dx} cy={120} rx={10} ry={6.5} fill={BLUSH} opacity={o} />
      <Ellipse cx={100 + dx} cy={120} rx={10} ry={6.5} fill={BLUSH} opacity={o} />
    </G>
  );
}

// ---------------------------------------------------------------- facial hair & glasses

export function FacialHair({ style, face, kit }: { style: string; face: FaceShape; kit: PartKit }) {
  const color = mix(kit.hair, kit.skin.base, 0.12);
  const jaw = face.rx - 6;
  const chin = HEAD_CY + face.ry;
  switch (style) {
    case 'stubble':
      return (
        <Path
          d={`M${100 - jaw},112 C${100 - jaw + 4},${chin - 4} ${100 - 18},${chin + 1} 100,${chin + 1} C${100 + 18},${chin + 1} ${100 + jaw - 4},${chin - 4} ${100 + jaw},112 C${100 + jaw - 8},${chin - 14} 112,${chin - 12} 100,${chin - 12} C88,${chin - 12} ${100 - jaw + 8},${chin - 14} ${100 - jaw},112 Z`}
          fill={kit.hair}
          opacity={0.16}
        />
      );
    case 'mustache':
      return <Path d="M85,123 C91,117 98,120 100,122 C102,120 109,117 115,123 C109,126 104,125 100,124 C96,125 91,126 85,123 Z" fill={color} />;
    case 'goatee':
      return (
        <G fill={color}>
          <Path d="M88,123 C93,119 98,121 100,122 C102,121 107,119 112,123 C107,125 103,124.5 100,124 C97,124.5 93,125 88,123 Z" />
          <Path d={`M91,${chin - 9} C93,${chin + 3} 107,${chin + 3} 109,${chin - 9} C105,${chin - 5} 95,${chin - 5} 91,${chin - 9} Z`} />
        </G>
      );
    case 'beard':
      return (
        <Path
          d={`M${100 - face.rx + 4},100 C${100 - face.rx + 6},${chin - 2} ${100 - 22},${chin + 8} 100,${chin + 8} C${100 + 22},${chin + 8} ${100 + face.rx - 6},${chin - 2} ${100 + face.rx - 4},100 C${100 + face.rx - 12},124 118,134 112,134 C108,127 92,127 88,134 C82,134 ${100 - face.rx + 12},124 ${100 - face.rx + 4},100 Z`}
          fill={color}
        />
      );
    default:
      return null;
  }
}

export function Glasses({ style, eyes }: { style: string; eyes: string }) {
  if (style === 'none') return null;
  const e = eyeSpec(eyes);
  const lx = HEAD_CX - e.dx;
  const rx = HEAD_CX + e.dx;
  const bridge = `M${lx + 14},${EYE_Y - 1} Q100,${EYE_Y - 5} ${rx - 14},${EYE_Y - 1}`;
  switch (style) {
    case 'square':
      return (
        <G stroke={INK} strokeWidth={2.6} fill={WHITE} fillOpacity={0.12}>
          <Rect x={lx - 15} y={EYE_Y - 12} width={30} height={24} rx={7} />
          <Rect x={rx - 15} y={EYE_Y - 12} width={30} height={24} rx={7} />
          <Path d={bridge} fill="none" />
        </G>
      );
    case 'aviator':
      return (
        <G stroke={GOLD_DARK} strokeWidth={2.2} fill="#6B8BA4" fillOpacity={0.28}>
          {[lx, rx].map((x) => (
            <Path key={x} d={`M${x - 15},${EYE_Y - 10} L${x + 15},${EYE_Y - 10} C${x + 16},${EYE_Y + 6} ${x + 8},${EYE_Y + 15} ${x},${EYE_Y + 15} C${x - 8},${EYE_Y + 15} ${x - 16},${EYE_Y + 6} ${x - 15},${EYE_Y - 10} Z`} />
          ))}
          <Path d={`M${lx + 15},${EYE_Y - 9} L${rx - 15},${EYE_Y - 9}`} fill="none" />
        </G>
      );
    case 'reading':
      // Half-rim readers: a frame along the bottom of each lens only.
      return (
        <G stroke={INK} strokeWidth={2.4} fill="none">
          {[lx, rx].map((x) => (
            <Path key={x} d={`M${x - 14},${EYE_Y + 1} L${x - 14},${EYE_Y + 6} Q${x - 14},${EYE_Y + 12} ${x - 8},${EYE_Y + 12} L${x + 8},${EYE_Y + 12} Q${x + 14},${EYE_Y + 12} ${x + 14},${EYE_Y + 6} L${x + 14},${EYE_Y + 1} Z`} fill={WHITE} fillOpacity={0.12} />
          ))}
          <Path d={`M${lx + 14},${EYE_Y + 3} Q100,${EYE_Y} ${rx - 14},${EYE_Y + 3}`} />
        </G>
      );
    default:
      return (
        <G stroke={INK} strokeWidth={2.6} fill={WHITE} fillOpacity={0.12}>
          <Circle cx={lx} cy={EYE_Y} r={15} />
          <Circle cx={rx} cy={EYE_Y} r={15} />
          <Path d={bridge} fill="none" />
        </G>
      );
  }
}

// ---------------------------------------------------------------- hair

/** Hair drawn behind the head and body (long hair, afro, hijab drape). */
export function HairBack({ style, kit }: { style: string; kit: PartKit }) {
  const fill = kit.url('hair');
  switch (style) {
    case 'long-straight':
      return <Path d="M38,98 C34,44 66,24 100,24 C134,24 166,44 162,98 L166,170 C166,182 150,186 140,178 L138,120 L62,120 L60,178 C50,186 34,182 34,170 Z" fill={fill} />;
    case 'waves-medium':
      return <Path d="M40,98 C36,44 66,26 100,26 C134,26 164,44 160,98 C166,118 160,134 164,146 C156,156 144,152 140,144 L138,118 L62,118 L60,144 C56,152 44,156 36,146 C40,134 34,118 40,98 Z" fill={fill} />;
    case 'braids':
      return (
        <G fill={fill}>
          <Path d="M40,98 C36,44 66,26 100,26 C134,26 164,44 160,98 L150,120 L50,120 Z" />
          {[-1, 1].map((side) =>
            [0, 1, 2, 3, 4].map((i) => (
              <Ellipse key={`${side}${i}`} cx={100 + side * 52} cy={120 + i * 14} rx={8.5} ry={8} />
            )),
          )}
        </G>
      );
    case 'locs':
      return (
        <G>
          <Path d="M38,98 C34,44 66,24 100,24 C134,24 166,44 162,98 L60,110 Z" fill={fill} />
          {[40, 50, 60, 140, 150, 160].map((x, i) => (
            <Path key={x} d={`M${x},92 L${x + (i < 3 ? -2 : 2)},${166 + (i % 2) * 8}`} stroke={fill} strokeWidth={9} strokeLinecap="round" />
          ))}
        </G>
      );
    case 'ponytail':
      return <Path d="M150,70 C176,82 180,128 168,160 C164,170 154,168 154,158 C160,128 156,100 144,86 Z" fill={fill} />;
    case 'curly-afro':
      return (
        <G fill={fill}>
          <Circle cx={100} cy={78} r={72} />
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
            const a = Math.PI * (0.95 + i * 0.1375);
            return <Circle key={i} cx={100 + Math.cos(a) * 70} cy={80 + Math.sin(a) * 68} r={16} />;
          })}
        </G>
      );
    case 'hijab':
      return <Path d="M100,26 C148,26 170,60 168,104 C166,136 156,156 150,170 C168,176 172,196 170,206 L30,206 C28,196 32,176 50,170 C44,156 34,136 32,104 C30,60 52,26 100,26 Z" fill={fill} />;
    default:
      return null;
  }
}

/** Hair and hats drawn over the head. */
export function HairFront({ style, kit }: { style: string; kit: PartKit }) {
  const fill = kit.url('hair');
  const capFill = kit.url('top');
  switch (style) {
    case 'bald':
      return <Ellipse cx={84} cy={50} rx={16} ry={7} fill={WHITE} opacity={0.22} />;
    case 'buzz':
      return <Path d="M46,88 C46,52 70,36 100,36 C130,36 154,52 154,88 C140,68 122,60 100,60 C78,60 60,68 46,88 Z" fill={fill} opacity={0.82} />;
    case 'side-part':
      return <Path d="M44,98 C38,50 66,28 102,28 C138,28 162,50 156,98 C152,82 146,72 136,66 C118,60 94,68 74,58 C60,66 50,80 44,98 Z" fill={fill} />;
    case 'slick-back':
      return (
        <G>
          <Path d="M45,90 C42,48 68,28 100,28 C132,28 158,48 155,90 C148,70 128,56 100,56 C72,56 52,70 45,90 Z" fill={fill} />
          <Path d="M70,40 C84,34 116,34 130,40 M66,48 C84,42 116,42 134,48" stroke={WHITE} strokeOpacity={0.2} strokeWidth={2} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'fringe':
      return <Path d="M44,102 C38,50 66,30 100,30 C134,30 162,50 156,102 C152,86 146,78 140,76 C120,82 80,82 60,76 C54,80 48,90 44,102 Z" fill={fill} />;
    case 'messy':
      return (
        <G fill={fill}>
          <Path d="M44,98 C38,52 64,30 100,30 C136,30 162,52 156,98 C150,80 140,68 128,64 C116,74 92,76 70,66 C58,74 50,84 44,98 Z" />
          <Path d="M70,40 L62,20 L84,34 Z M96,32 L98,12 L110,32 Z M120,36 L136,20 L132,42 Z" />
        </G>
      );
    case 'curly-short':
    case 'coils': {
      const small = style === 'coils';
      const steps = small ? [160, 142, 124, 106, 88, 70, 52, 34, 20] : [150, 128, 106, 84, 62, 40];
      return (
        <G fill={fill}>
          <Path d="M46,92 C42,52 68,32 100,32 C132,32 158,52 154,92 C146,72 126,62 100,62 C74,62 54,72 46,92 Z" />
          {steps.map((deg) => {
            const a = (-deg * Math.PI) / 180;
            return <Circle key={deg} cx={100 + Math.cos(a) * 50} cy={86 + Math.sin(a) * 48} r={small ? 10.5 : 15} />;
          })}
        </G>
      );
    }
    case 'curly-afro':
      return <Path d="M46,96 C44,60 70,44 100,44 C130,44 156,60 154,96 C142,76 124,68 100,68 C76,68 58,76 46,96 Z" fill={fill} />;
    case 'long-straight':
    case 'waves-medium':
    case 'braids':
    case 'locs':
      return <Path d="M44,104 C38,52 66,28 100,30 C134,28 162,52 156,104 C150,82 130,62 100,58 C70,62 50,82 44,104 Z" fill={fill} />;
    case 'ponytail':
      return <Path d="M44,98 C38,52 66,32 100,32 C134,32 162,52 156,98 C148,78 128,62 100,60 C72,62 52,78 44,98 Z" fill={fill} />;
    case 'bun':
      return (
        <G fill={fill}>
          <Circle cx={100} cy={30} r={20} />
          <Path d="M44,98 C38,52 66,32 100,32 C134,32 162,52 156,98 C148,78 128,64 100,62 C72,64 52,78 44,98 Z" />
        </G>
      );
    case 'hijab':
      // Soft band framing the face, over the forehead edge.
      return <Path d="M48,100 C46,58 72,40 100,40 C128,40 154,58 152,100 C148,74 128,58 100,58 C72,58 52,74 48,100 Z" fill={fill} />;
    case 'cap':
      return (
        <G>
          <Path d="M44,98 C40,74 50,64 60,62 L140,62 C150,64 160,74 156,98 C150,84 130,76 100,76 C70,76 50,84 44,98 Z" fill={fill} />
          <Path d="M46,74 C46,40 70,26 100,26 C130,26 154,40 154,74 Z" fill={capFill} />
          <Path d="M40,76 Q100,58 160,76 Q100,94 40,76 Z" fill={kit.top.shade} />
          <Circle cx={100} cy={28} r={4} fill={kit.top.shade} />
        </G>
      );
    case 'beanie':
      return (
        <G>
          <Path d="M46,78 C46,42 70,28 100,28 C130,28 154,42 154,78 Z" fill={capFill} />
          <Rect x={42} y={66} width={116} height={20} rx={10} fill={kit.top.shade} />
          <Circle cx={100} cy={24} r={11} fill={mix(kit.top.value, WHITE, 0.7)} />
        </G>
      );
    case 'turban':
      return (
        <G>
          <Path d="M42,86 C38,44 66,22 100,22 C134,22 162,44 158,86 C140,70 120,64 100,64 C80,64 60,70 42,86 Z" fill={capFill} />
          <Path d="M52,70 C70,40 120,34 150,64 M60,52 C84,34 122,34 142,50" stroke={kit.top.shade} strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.6} />
        </G>
      );
    default:
      // short-wave
      return (
        <G>
          <Path d="M44,98 C38,52 66,30 100,30 C134,30 162,52 156,98 C150,78 140,66 128,62 C116,72 92,74 70,66 C58,72 50,82 44,98 Z" fill={fill} />
          <Path d="M70,42 Q78,36 86,42 Q94,36 102,42 Q110,36 118,42" stroke={WHITE} strokeOpacity={0.18} strokeWidth={2} fill="none" strokeLinecap="round" />
        </G>
      );
  }
}

export function Headwear({ style, kit }: { style: string; kit: PartKit }) {
  switch (style) {
    case 'kufi':
      return (
        <G>
          <Path d="M60,54 C62,30 138,30 140,54 Q100,46 60,54 Z" fill="#F4EFE2" />
          {[72, 86, 100, 114, 128].map((x) => (
            <Circle key={x} cx={x} cy={44} r={1.6} fill="#D8CFAF" />
          ))}
        </G>
      );
    case 'headband':
      return <Path d="M46,72 C70,56 130,56 154,72 L152,82 C128,68 72,68 48,82 Z" fill={kit.top.value} />;
    case 'crown':
      return <Path d="M72,40 L76,18 L88,32 L100,12 L112,32 L124,18 L128,40 Z" fill={GOLD} stroke={GOLD_DARK} strokeWidth={1.5} strokeLinejoin="round" />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------- body

interface BuildSpec {
  /** Half-widths of the torso at the shoulders and at the hem. */
  shoulder: number;
  hip: number;
}

const BUILDS: Record<AvatarConfig['bodyBuild'], BuildSpec> = {
  slim: { shoulder: 27, hip: 34 },
  athletic: { shoulder: 37, hip: 36 },
  average: { shoulder: 32, hip: 40 },
  curvy: { shoulder: 29, hip: 46 },
  broad: { shoulder: 39, hip: 45 },
};

export const LEG_LENGTH: Record<AvatarConfig['height'], number> = {
  short: 18,
  medium: 26,
  tall: 34,
};

const TORSO_TOP = 154;
const HEM = 214;
const LEG_TOP = 204;

export function Body({ config, kit }: { config: AvatarConfig; kit: PartKit }) {
  const b = BUILDS[config.bodyBuild] ?? BUILDS.average;
  const legs = LEG_LENGTH[config.height] ?? LEG_LENGTH.medium;
  const thobe = config.outfit === 'thobe';
  const feetY = LEG_TOP + legs;
  const hem = thobe ? feetY - 4 : HEM;
  const s = b.shoulder;
  const h = thobe ? b.hip + 4 : b.hip;
  const torso = `M${100 - h},${hem} C${100 - h - 4},${hem - 32} ${100 - s - 6},${TORSO_TOP} 100,${TORSO_TOP} C${100 + s + 6},${TORSO_TOP} ${100 + h + 4},${hem - 32} ${100 + h},${hem} C${100 + h - 1},${hem + 8} ${100 + h - 8},${hem + 10} ${100 + h - 16},${hem + 10} L${100 - h + 16},${hem + 10} C${100 - h + 8},${hem + 10} ${100 - h + 1},${hem + 8} ${100 - h},${hem} Z`;
  const shoulderL = 100 - s - 2;
  const shoulderR = 100 + s + 2;

  return (
    <G>
      {thobe ? null : (
        <G>
          <Rect x={78} y={LEG_TOP} width={19} height={legs + 2} rx={9.5} fill={kit.url('bottom')} />
          <Rect x={103} y={LEG_TOP} width={19} height={legs + 2} rx={9.5} fill={kit.url('bottom')} />
        </G>
      )}
      <Shoes style={config.shoes} feetY={feetY} kit={kit} />
      <Path d={torso} fill={kit.url('top')} />
      <Outfit style={config.outfit} kit={kit} hem={hem} />
      <Arms pose={config.pose} left={shoulderL} right={shoulderR} kit={kit} />
    </G>
  );
}

function Shoes({ style, feetY, kit }: { style: string; feetY: number; kit: PartKit }) {
  const feet = [86, 114];
  switch (style) {
    case 'boots':
      return (
        <G>
          {feet.map((x) => (
            <G key={x}>
              <Rect x={x - 11} y={feetY - 14} width={22} height={18} rx={7} fill={kit.url('shoes')} />
              <Rect x={x - 13} y={feetY + 1} width={26} height={6} rx={3} fill={mix(kit.shoes, INK, 0.45)} />
            </G>
          ))}
        </G>
      );
    case 'sandals':
      return (
        <G>
          {feet.map((x) => (
            <G key={x}>
              <Ellipse cx={x} cy={feetY + 3} rx={13} ry={4} fill={mix(kit.shoes, INK, 0.3)} />
              <Ellipse cx={x} cy={feetY} rx={11} ry={5.5} fill={kit.skin.base} />
              <Path d={`M${x - 9},${feetY - 1} Q${x},${feetY - 6} ${x + 9},${feetY - 1}`} stroke={kit.shoes} strokeWidth={3.4} strokeLinecap="round" fill="none" />
            </G>
          ))}
        </G>
      );
    case 'barefoot':
      return (
        <G>
          {feet.map((x) => (
            <G key={x}>
              <Ellipse cx={x} cy={feetY + 0.5} rx={11.5} ry={6} fill={kit.url('skin')} />
              <Ellipse cx={x - 3} cy={feetY - 2} rx={4} ry={1.5} fill={WHITE} opacity={0.3} />
            </G>
          ))}
        </G>
      );
    default:
      // sneakers: colored upper on a white sole
      return (
        <G>
          {feet.map((x) => (
            <G key={x}>
              <Ellipse cx={x} cy={feetY + 2.5} rx={13.5} ry={5} fill={WHITE} />
              <Ellipse cx={x} cy={feetY - 0.5} rx={12.5} ry={6.5} fill={kit.url('shoes')} />
              <Ellipse cx={x - 3} cy={feetY - 3} rx={5} ry={1.8} fill={WHITE} opacity={0.3} />
            </G>
          ))}
        </G>
      );
  }
}

function Outfit({ style, kit, hem }: { style: string; kit: PartKit; hem: number }) {
  const { top } = kit;
  switch (style) {
    case 'hoodie':
      return (
        <G>
          <Path d="M72,160 C80,178 120,178 128,160 C120,168 80,168 72,160 Z" fill={top.shade} opacity={0.6} />
          <Path d="M94,174 L92,190 M106,174 L108,190" stroke={mix(top.value, WHITE, 0.6)} strokeWidth={2.2} strokeLinecap="round" />
          <Path d="M82,196 L118,196 L114,210 L86,210 Z" fill={top.shade} opacity={0.35} />
        </G>
      );
    case 'collar':
      return (
        <G>
          <Path d="M86,158 L100,174 L114,158 L108,155 L100,166 L92,155 Z" fill={WHITE} opacity={0.95} />
          <Path d={`M100,174 L100,${hem}`} stroke={top.shade} strokeWidth={1.6} opacity={0.6} />
          {[184, 196].map((y) => (
            <Circle key={y} cx={100} cy={y} r={1.6} fill={mix(top.value, WHITE, 0.7)} />
          ))}
        </G>
      );
    case 'thobe':
      return (
        <G>
          <Path d="M92,156 Q100,162 108,156" stroke={top.shade} strokeWidth={2} fill="none" />
          <Path d={`M100,160 L100,190`} stroke={top.shade} strokeWidth={1.6} opacity={0.5} />
        </G>
      );
    case 'turtleneck':
      return (
        <G>
          <Rect x={84} y={146} width={32} height={16} rx={8} fill={kit.url('top')} />
          {[90, 96, 102, 108].map((x) => (
            <Path key={x} d={`M${x},149 L${x},159`} stroke={top.shade} strokeWidth={1.2} opacity={0.5} />
          ))}
        </G>
      );
    case 'jacket':
      return (
        <G>
          <Path d="M90,156 L100,186 L110,156 Z" fill={mix(top.value, WHITE, 0.8)} />
          <Path d="M84,158 L100,190 L92,160 Z M116,158 L100,190 L108,160 Z" fill={top.shade} />
          <Path d={`M100,190 L100,${hem}`} stroke={top.shade} strokeWidth={1.6} />
        </G>
      );
    default:
      // crewneck
      return <Path d="M88,157 Q100,166 112,157" stroke={top.shade} strokeWidth={2.4} fill="none" strokeLinecap="round" />;
  }
}

function Arms({ pose, left, right, kit }: { pose: string; left: number; right: number; kit: PartKit }) {
  const sleeve = kit.url('top');
  const skin = kit.url('skin');
  const arm = (d: string) => (
    <Path d={d} stroke={sleeve} strokeWidth={17} strokeLinecap="round" fill="none" />
  );
  if (pose === 'arms-crossed') {
    return (
      <G>
        <Rect x={left} y={184} width={right - left} height={22} rx={11} fill={kit.top.shade} />
        <Rect x={left} y={182} width={right - left} height={20} rx={10} fill={sleeve} />
        <Circle cx={left + 7} cy={192} r={8} fill={skin} />
        <Circle cx={right - 7} cy={192} r={8} fill={skin} />
      </G>
    );
  }
  const leftArm = (
    <G>
      {arm(`M${left},172 C${left - 10},182 ${left - 14},198 ${left - 12},210`)}
      <Circle cx={left - 11} cy={213} r={8.5} fill={skin} />
    </G>
  );
  if (pose === 'wave') {
    return (
      <G>
        {leftArm}
        {arm(`M${right},172 C${right + 12},166 ${right + 18},152 ${right + 16},136`)}
        <Circle cx={right + 16} cy={130} r={9} fill={skin} />
      </G>
    );
  }
  if (pose === 'hip') {
    return (
      <G>
        {leftArm}
        {arm(`M${right},172 C${right + 22},184 ${right + 18},198 ${right - 2},202`)}
        <Circle cx={right - 4} cy={202} r={8} fill={skin} />
      </G>
    );
  }
  return (
    <G>
      {leftArm}
      {arm(`M${right},172 C${right + 10},182 ${right + 14},198 ${right + 12},210`)}
      <Circle cx={right + 11} cy={213} r={8.5} fill={skin} />
    </G>
  );
}
