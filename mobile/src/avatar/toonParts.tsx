// Parts of the toon avatar (see ToonAvatar.tsx for how they stack): a
// cartoon person with natural proportions, about five and a half heads
// tall, with a lidded almond eye, a shaded nose and real lips.
//
// Two coordinate systems:
// - The head is drawn in the soft avatar's head space (center 100,92), so
//   the hair and headwear art from softParts.tsx fits it after a small
//   horizontal squeeze (toon heads are narrower).
// - The body is drawn on the 200 x 440 full-body canvas. The head space
//   is placed on it by headTransform().

import React from 'react';
import { Circle, ClipPath, Defs, Ellipse, G, Path, Rect } from 'react-native-svg';
import { mix } from '../theme/tokens';
import { HEAD_CX, HEAD_CY, INK, WHITE, type FaceShape, type PartKit } from './softParts';
import type { AvatarConfig, Mood } from './types';

export interface ToonKit extends PartKit {
  /** Unique id for a clip path inside this avatar instance. */
  id: (name: string) => string;
}

const LIP = '#B8524E';
const GOLD_DARK = '#C9952B';

// ---------------------------------------------------------------- placement

export const CANVAS_W = 200;
export const CANVAS_H = 440;
/** Where the head center sits on the canvas, and the head's scale. */
export const HEAD_Y = 76;
export const HEAD_SCALE = 0.64;
/** Eye line in head space. */
export const EYE_Y = 98;
/** Shoulder line on the canvas. */
const SH = 128;
const HEM = 226;
const GROUND = 420;

export const FEET_Y: Record<AvatarConfig['height'], number> = {
  short: 382,
  medium: 398,
  tall: 412,
};

/** Vertical shift that stands every height on the same ground line. */
export function figureShift(height: AvatarConfig['height']): number {
  const feet = FEET_Y[height] ?? FEET_Y.medium;
  return GROUND - (feet + 10);
}

export function headTransform(): string {
  return `translate(100 ${HEAD_Y}) scale(${HEAD_SCALE}) translate(-${HEAD_CX} -${HEAD_CY})`;
}

/** Eye line on the canvas (before the figure shift). */
export const CANVAS_EYE_Y = HEAD_Y + (EYE_Y - HEAD_CY) * HEAD_SCALE;

// ---------------------------------------------------------------- head

const FACES: Record<string, FaceShape> = {
  oval: { rx: 46, ry: 56, top: 0.62, jaw: 0.5, jawDrop: 0.62 },
  round: { rx: 49, ry: 54, top: 0.64, jaw: 0.62, jawDrop: 0.6 },
  square: { rx: 48, ry: 55, top: 0.76, jaw: 0.72, jawDrop: 0.8 },
  heart: { rx: 48, ry: 55, top: 0.74, jaw: 0.32, jawDrop: 0.64 },
  diamond: { rx: 47, ry: 57, top: 0.42, jaw: 0.4, jawDrop: 0.55 },
  oblong: { rx: 43, ry: 59, top: 0.62, jaw: 0.55, jawDrop: 0.7 },
  triangle: { rx: 46, ry: 55, top: 0.44, jaw: 0.78, jawDrop: 0.76 },
  wide: { rx: 51, ry: 53, top: 0.66, jaw: 0.6, jawDrop: 0.62 },
};

export function toonFace(id: string): FaceShape {
  return FACES[id] ?? FACES.oval;
}

/** Horizontal squeeze that fits the soft hair art to a toon face. */
export function hairSqueeze(face: FaceShape): string {
  const sx = (face.rx + 3) / 57;
  return `translate(${HEAD_CX} 0) scale(${sx.toFixed(3)} 1) translate(-${HEAD_CX} 0)`;
}

export function Ears({ face, kit }: { face: FaceShape; kit: ToonKit }) {
  return (
    <G>
      {[-1, 1].map((side) => {
        const x = HEAD_CX + side * (face.rx + 1);
        return (
          <G key={side}>
            <Ellipse cx={x} cy={102} rx={8} ry={12} fill={kit.url('skin')} />
            <Path
              d={`M${x - side * 1},96 Q${x + side * 4},101 ${x},108`}
              stroke={kit.skin.shade}
              strokeWidth={2.4}
              strokeLinecap="round"
              fill="none"
            />
          </G>
        );
      })}
    </G>
  );
}

/** Soft cheek and jaw shading that gives the face some volume. */
export function FaceShading({ face, kit }: { face: FaceShape; kit: ToonKit }) {
  const chin = HEAD_CY + face.ry;
  return (
    <G>
      <Ellipse cx={HEAD_CX} cy={56} rx={face.rx * 0.55} ry={12} fill={WHITE} opacity={0.14} />
      <Path
        d={`M${HEAD_CX - face.rx + 3},104 C${HEAD_CX - face.rx + 8},${chin - 6} ${HEAD_CX - 14},${chin - 1} ${HEAD_CX},${chin - 1} C${HEAD_CX + 14},${chin - 1} ${HEAD_CX + face.rx - 8},${chin - 6} ${HEAD_CX + face.rx - 3},104 C${HEAD_CX + face.rx - 6},${chin - 2} ${HEAD_CX + 16},${chin + 1} ${HEAD_CX},${chin + 1} C${HEAD_CX - 16},${chin + 1} ${HEAD_CX - face.rx + 6},${chin - 2} ${HEAD_CX - face.rx + 3},104 Z`}
        fill={kit.skin.shade}
        opacity={0.35}
      />
    </G>
  );
}

export function Blush({ face, kit }: { face: FaceShape; kit: ToonKit }) {
  const o = kit.mood === 'tired' ? 0.06 : kit.mood === 'glowing' ? 0.22 : 0.14;
  const dx = face.rx * 0.58;
  return (
    <G>
      <Ellipse cx={HEAD_CX - dx} cy={116} rx={9} ry={5.5} fill="#FF7B6E" opacity={o} />
      <Ellipse cx={HEAD_CX + dx} cy={116} rx={9} ry={5.5} fill="#FF7B6E" opacity={o} />
    </G>
  );
}

// ---------------------------------------------------------------- eyes

interface EyeSpec {
  dx: number;
  /** Half width and half height of the eye opening. */
  w: number;
  h: number;
  /** Degrees; positive lifts the outer corners. */
  tilt: number;
  /** Share of the opening covered by the upper lid. */
  lid: number;
  crease: boolean;
}

const EYES: Record<string, EyeSpec> = {
  almond: { dx: 17, w: 10.1, h: 6.3, tilt: 3, lid: 0.1, crease: true },
  round: { dx: 17, w: 9.6, h: 7.8, tilt: 0, lid: 0, crease: true },
  upturned: { dx: 17, w: 10.1, h: 5.8, tilt: 9, lid: 0.06, crease: true },
  downturned: { dx: 17, w: 10.1, h: 6.0, tilt: -8, lid: 0.16, crease: true },
  narrow: { dx: 17, w: 10.5, h: 4.7, tilt: 2, lid: 0.05, crease: false },
  wide: { dx: 20, w: 10.1, h: 6.3, tilt: 0, lid: 0.08, crease: true },
  close: { dx: 14.5, w: 9.4, h: 6.3, tilt: 0, lid: 0.08, crease: true },
  deep: { dx: 17, w: 9.6, h: 6.0, tilt: 0, lid: 0.2, crease: true },
  monolid: { dx: 17, w: 10.5, h: 4.9, tilt: 4, lid: 0.3, crease: false },
  hooded: { dx: 17, w: 10.1, h: 6.0, tilt: -2, lid: 0.36, crease: true },
};

export function toonEye(id: string): EyeSpec {
  return EYES[id] ?? EYES.almond;
}

function eyeOutline(x: number, y: number, w: number, h: number): string {
  return `M${x - w},${y} C${x - w * 0.5},${y - h * 1.36} ${x + w * 0.5},${y - h * 1.36} ${x + w},${y} C${x + w * 0.5},${y + h * 1.12} ${x - w * 0.5},${y + h * 1.12} ${x - w},${y} Z`;
}

export function Eyes({ style, kit }: { style: string; kit: ToonKit }) {
  const e = toonEye(style);
  const lid = Math.min(0.6, e.lid + (kit.mood === 'tired' ? 0.34 : 0));
  return (
    <G>
      {[-1, 1].map((side) => {
        const x = HEAD_CX + side * e.dx;
        const y = EYE_Y;
        const outline = eyeOutline(x, y, e.w, e.h);
        const clip = kit.id(side < 0 ? 'eyeL' : 'eyeR');
        const iris = Math.max(4.4, e.h * 0.98);
        // The lid edge: a curve through both corners whose peak sits at lidY.
        const lidY = y - e.h + e.h * 2 * lid;
        const ctrl = 2 * lidY - y;
        return (
          <G key={side} transform={`rotate(${-side * e.tilt} ${x} ${y})`}>
            <Defs>
              <ClipPath id={clip}>
                <Path d={outline} />
              </ClipPath>
            </Defs>
            <Path d={outline} fill={WHITE} />
            <G clipPath={`url(#${clip})`}>
              <Circle cx={x} cy={y + 0.6} r={iris} fill={kit.url('iris')} />
              <Circle cx={x} cy={y + 0.8} r={iris * 0.46} fill="#120A06" />
              <Circle cx={x - iris * 0.38} cy={y - iris * 0.32} r={iris * 0.3} fill={WHITE} />
              {lid > 0 ? (
                <Path
                  d={`M${x - e.w - 1},${y - e.h * 2} L${x + e.w + 1},${y - e.h * 2} L${x + e.w + 1},${y} Q${x},${ctrl} ${x - e.w - 1},${y} Z`}
                  fill={kit.skin.base}
                />
              ) : null}
              {/* shadow the lid casts on the eyeball */}
              <Path
                d={`M${x - e.w},${y} Q${x},${ctrl} ${x + e.w},${y}`}
                stroke={INK}
                strokeOpacity={0.18}
                strokeWidth={3}
                fill="none"
                transform="translate(0 1.4)"
              />
            </G>
            {/* lash line along the lid edge, with a small flick at the outer corner */}
            <Path
              d={`M${x - e.w - 0.5},${y + 0.4} Q${x},${ctrl} ${x + e.w + 0.5},${y + 0.4}`}
              stroke={INK}
              strokeWidth={2}
              strokeLinecap="round"
              fill="none"
            />
            <Path
              d={`M${x + side * (e.w - 0.5)},${y - 0.2} l${side * 2.6},${-1.6}`}
              stroke={INK}
              strokeWidth={1.6}
              strokeLinecap="round"
            />
            <Path
              d={`M${x - e.w * 0.7},${y + e.h * 0.95} Q${x},${y + e.h * 1.25} ${x + e.w * 0.7},${y + e.h * 0.95}`}
              stroke={kit.skin.shade}
              strokeWidth={1.2}
              strokeLinecap="round"
              fill="none"
            />
            {e.crease ? (
              <Path
                d={`M${x - e.w * 0.8},${lidY - 3.2} Q${x},${lidY - 6.4} ${x + e.w * 0.85},${lidY - 3}`}
                stroke={kit.skin.shade}
                strokeWidth={1.4}
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

const BROWS: Record<string, { width: number; arch: number; kind: 'curve' | 'angle'; double?: boolean }> = {
  natural: { width: 3, arch: 3.4, kind: 'curve' },
  thick: { width: 4.4, arch: 3, kind: 'curve' },
  thin: { width: 1.7, arch: 3.4, kind: 'curve' },
  arched: { width: 2.8, arch: 6.5, kind: 'curve' },
  straight: { width: 3.2, arch: 0.5, kind: 'curve' },
  angled: { width: 3.2, arch: 4.2, kind: 'angle' },
  rounded: { width: 3.4, arch: 5.4, kind: 'curve' },
  bushy: { width: 5.2, arch: 3, kind: 'curve', double: true },
};

export function Brows({ style, eyes, kit }: { style: string; eyes: string; kit: ToonKit }) {
  const b = BROWS[style] ?? BROWS.natural;
  const e = toonEye(eyes);
  const lift = kit.mood === 'glowing' ? -1.6 : kit.mood === 'tired' ? 1.6 : 0;
  const y = EYE_Y - e.h - 7.5 + lift;
  const color = mix(kit.hair, INK, 0.25);
  return (
    <G>
      {[-1, 1].map((side) => {
        const x = HEAD_CX + side * e.dx;
        const inner = x - side * 8.5;
        const outer = x + side * 10.5;
        const d =
          b.kind === 'angle'
            ? `M${inner},${y + 1} L${x + side * 4},${y - b.arch} L${outer},${y + 2}`
            : `M${inner},${y + 1} Q${x + side * 1.5},${y - b.arch * 1.6} ${outer},${y + 1.8}`;
        return (
          <G key={side}>
            <Path d={d} stroke={color} strokeWidth={b.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            {/* a heavier inner end keeps the brow from looking drawn on */}
            <Circle cx={inner + side * 1.2} cy={y + 1} r={b.width * 0.62} fill={color} />
            {b.double ? (
              <Path d={d} stroke={color} strokeWidth={b.width * 0.5} strokeLinecap="round" fill="none" opacity={0.55} transform="translate(0 -2)" />
            ) : null}
          </G>
        );
      })}
    </G>
  );
}

// ---------------------------------------------------------------- nose

export function Nose({ style, kit }: { style: string; kit: ToonKit }) {
  const shade = kit.skin.shade;
  const line = (d: string, w = 1.8, o = 0.9) => (
    <Path d={d} stroke={shade} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={o} />
  );
  const tip = (rx: number, ry: number, y: number) => (
    <G>
      <Ellipse cx={HEAD_CX} cy={y} rx={rx} ry={ry} fill={shade} opacity={0.32} />
      <Ellipse cx={HEAD_CX - 1} cy={y - ry * 0.45} rx={rx * 0.38} ry={ry * 0.3} fill={WHITE} opacity={0.35} />
    </G>
  );
  switch (style) {
    case 'button':
      return (
        <G>
          {tip(4.6, 3.6, 112)}
          {line('M96,115.5 Q100,117.5 104,115.5', 1.6)}
        </G>
      );
    case 'wide':
      return (
        <G>
          {line('M103,100 Q106,108 105,112', 1.6, 0.7)}
          {tip(6.5, 4, 113)}
          {line('M91,113 Q92.5,117.5 96.5,116.5 Q100,118 103.5,116.5 Q107.5,117.5 109,113', 1.8)}
        </G>
      );
    case 'pointed':
      return (
        <G>
          {line('M102.5,97 Q106,109 104.5,115', 1.7, 0.75)}
          {tip(4, 3.4, 114)}
          {line('M95,116 Q100,119.5 105,116', 1.7)}
        </G>
      );
    case 'roman':
      return (
        <G>
          {line('M102,96 Q106.5,103 105.5,108 Q105,112 104.5,114', 2, 0.8)}
          {tip(5, 3.8, 113)}
          {line('M94.5,115.5 Q100,119 105.5,115.5', 1.8)}
        </G>
      );
    case 'snub':
      return (
        <G>
          {tip(4.4, 3.2, 110.5)}
          {line('M96,113 Q100,115.5 104,113', 1.6)}
        </G>
      );
    default:
      // straight
      return (
        <G>
          {line('M103,99 Q106,108 104.5,113', 1.6, 0.75)}
          {tip(5, 3.6, 112.5)}
          {line('M94.5,115 Q96.5,118 99,116.8 M101,116.8 Q103.5,118 105.5,115', 1.8)}
        </G>
      );
  }
}

// ---------------------------------------------------------------- mouth

const MOOD_CURVE: Record<Mood, number> = {
  tired: 0.1,
  neutral: 0.55,
  happy: 1,
  glowing: 1.15,
};

export function Mouth({ style, kit }: { style: string; kit: ToonKit }) {
  const k = MOOD_CURVE[kit.mood];
  const y = 127;
  const lip = mix(kit.skin.base, LIP, 0.38);
  const lipLine = mix(lip, INK, 0.45);
  const closed = (half: number, curve: number, fullness = 1) => (
    <G>
      {/* lower lip */}
      <Path
        d={`M${100 - half * 0.8},${y + curve * 0.6 + 0.6} Q100,${y + curve + 5.5 * fullness} ${100 + half * 0.8},${y + curve * 0.6 + 0.6} Q100,${y + curve + 1.5} ${100 - half * 0.8},${y + curve * 0.6 + 0.6} Z`}
        fill={lip}
      />
      <Ellipse cx={100} cy={y + curve + 2.6 * fullness} rx={half * 0.28} ry={0.9} fill={WHITE} opacity={0.3} />
      {/* upper lip */}
      <Path
        d={`M${100 - half},${y} Q${100 - half * 0.45},${y - 3 * fullness} 100,${y - 1.6 * fullness} Q${100 + half * 0.45},${y - 3 * fullness} ${100 + half},${y} Q100,${y + curve} ${100 - half},${y} Z`}
        fill={mix(lip, INK, 0.12)}
      />
      <Path
        d={`M${100 - half - 0.5},${y - 0.6} Q100,${y + curve * 1.15} ${100 + half + 0.5},${y - 0.6}`}
        stroke={lipLine}
        strokeWidth={1.7}
        strokeLinecap="round"
        fill="none"
      />
    </G>
  );
  const grin = (half: number, depth: number) => (
    <G>
      <Path
        d={`M${100 - half},${y - 1} Q100,${y + depth} ${100 + half},${y - 1} Q100,${y + 1.5} ${100 - half},${y - 1} Z`}
        fill="#3A1712"
      />
      <Path
        d={`M${100 - half + 2},${y - 0.2} Q100,${y + 2.4} ${100 + half - 2},${y - 0.2} L${100 + half - 3.4},${y + depth * 0.32} Q100,${y + depth * 0.5} ${100 - half + 3.4},${y + depth * 0.32} Z`}
        fill={WHITE}
      />
      <Path
        d={`M${100 - half * 0.5},${y + depth * 0.7} Q100,${y + depth * 0.95} ${100 + half * 0.5},${y + depth * 0.7} Q100,${y + depth * 0.58} ${100 - half * 0.5},${y + depth * 0.7} Z`}
        fill="#E46F6F"
      />
      <Path
        d={`M${100 - half + 1},${y - 1} Q100,${y + depth + 3.4} ${100 + half - 1},${y - 1}`}
        stroke={lip}
        strokeWidth={2.2}
        strokeLinecap="round"
        fill="none"
        opacity={0.9}
      />
      <Path d={`M${100 - half - 1.4},${y - 2.2} l1.6,1.4 M${100 + half + 1.4},${y - 2.2} l-1.6,1.4`} stroke={kit.skin.shade} strokeWidth={1.4} strokeLinecap="round" />
    </G>
  );

  if (kit.mood === 'tired') return closed(9, 0.6);

  switch (style) {
    case 'big-smile':
      return grin(13, 9 + 4 * k);
    case 'neutral':
      return closed(9.5, 1.2 * k);
    case 'smirk':
      return (
        <G>
          {closed(9.5, 1.4 * k)}
          <Path d={`M107,${y - 0.6} Q110.5,${y - 2.2 - 1.2 * k} 112,${y - 4 - k}`} stroke={lipLine} strokeWidth={1.7} strokeLinecap="round" fill="none" />
        </G>
      );
    case 'open':
      return (
        <G>
          <Ellipse cx={100} cy={y + 2} rx={6.5} ry={3.8 + 2 * k} fill="#3A1712" />
          <Rect x={95.5} y={y - 1.4} width={9} height={2.4} rx={1} fill={WHITE} />
          <Ellipse cx={100} cy={y + 3.5 + k} rx={4} ry={1.8 + 0.6 * k} fill="#E46F6F" />
          <Path d={`M93,${y + 2} Q100,${y + 9 + 2.6 * k} 107,${y + 2}`} stroke={lip} strokeWidth={2} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'small':
      return closed(6.5, 2.4 * k);
    case 'full':
      return closed(10.5, 2.6 * k, 1.5);
    case 'calm':
      return closed(9, 2.2 * k);
    default:
      // soft-smile: closed lips that open into a grin on a great day.
      return k >= 1 ? grin(12, 8 * k) : closed(10, 4 * k);
  }
}

// ---------------------------------------------------------------- facial hair & glasses

export function FacialHair({ style, face, kit }: { style: string; face: FaceShape; kit: ToonKit }) {
  const color = mix(kit.hair, kit.skin.base, 0.08);
  const chin = HEAD_CY + face.ry;
  const L = HEAD_CX - face.rx;
  const R = HEAD_CX + face.rx;
  const mustache = (
    <Path d="M86.5,123.5 C90,118 97,118.5 100,120.5 C103,118.5 110,118 113.5,123.5 C108,122.5 104,123 100,123.6 C96,123 92,122.5 86.5,123.5 Z" fill={color} />
  );
  switch (style) {
    case 'stubble':
      return (
        <Path
          d={`M${L + 2},100 C${L + 3},${chin - 6} ${HEAD_CX - 20},${chin + 1} ${HEAD_CX},${chin + 1} C${HEAD_CX + 20},${chin + 1} ${R - 3},${chin - 6} ${R - 2},100 L${R - 7},100 C${R - 10},114 112,118.5 100,118.5 C88,118.5 ${L + 10},114 ${L + 7},100 Z`}
          fill={kit.hair}
          opacity={0.2}
        />
      );
    case 'mustache':
      return mustache;
    case 'goatee':
      return (
        <G>
          {mustache}
          <Path d={`M90,${chin - 15} C91,${chin + 1} 109,${chin + 1} 110,${chin - 15} C106,${chin - 10} 94,${chin - 10} 90,${chin - 15} Z`} fill={color} />
        </G>
      );
    case 'beard':
      return (
        <G>
          <Path
            d={`M${L + 1},96 C${L + 1},${chin - 4} ${HEAD_CX - 22},${chin + 7} ${HEAD_CX},${chin + 7} C${HEAD_CX + 22},${chin + 7} ${R - 1},${chin - 4} ${R - 1},96 L${R - 6},96 C${R - 8},110 ${HEAD_CX + 16},116 ${HEAD_CX},116 C${HEAD_CX - 16},116 ${L + 8},110 ${L + 6},96 Z`}
            fill={color}
          />
          {/* texture so the beard reads as hair, not a mask */}
          <Path
            d={`M${L + 9},112 q3,4 1,8 M${R - 9},112 q-3,4 -1,8 M${HEAD_CX - 14},${chin} q2,3 0,6 M${HEAD_CX + 14},${chin} q-2,3 0,6`}
            stroke={mix(color, WHITE, 0.18)}
            strokeWidth={1.4}
            strokeLinecap="round"
            fill="none"
            opacity={0.6}
          />
          {mustache}
        </G>
      );
    default:
      return null;
  }
}

export function Glasses({ style, eyes, face }: { style: string; eyes: string; face: FaceShape }) {
  if (style === 'none') return null;
  const e = toonEye(eyes);
  const lx = HEAD_CX - e.dx;
  const rx = HEAD_CX + e.dx;
  const y = EYE_Y;
  const arms = (color: string, w: number) => (
    <Path
      d={`M${lx - 12.5},${y - 3} L${HEAD_CX - face.rx + 1},${y - 5} M${rx + 12.5},${y - 3} L${HEAD_CX + face.rx - 1},${y - 5}`}
      stroke={color}
      strokeWidth={w}
      strokeLinecap="round"
    />
  );
  switch (style) {
    case 'square':
      return (
        <G>
          {arms(INK, 2.2)}
          <G stroke={INK} strokeWidth={2.6} fill={WHITE} fillOpacity={0.12}>
            <Rect x={lx - 12.5} y={y - 9.5} width={25} height={18} rx={4.5} />
            <Rect x={rx - 12.5} y={y - 9.5} width={25} height={18} rx={4.5} />
          </G>
          <Path d={`M${lx + 12.5},${y - 3} Q100,${y - 6} ${rx - 12.5},${y - 3}`} stroke={INK} strokeWidth={2.4} fill="none" />
        </G>
      );
    case 'aviator':
      // tinted sunglasses with a thin gold frame
      return (
        <G>
          {arms(GOLD_DARK, 1.8)}
          {[lx, rx].map((x) => (
            <Path
              key={x}
              d={`M${x - 12.5},${y - 8} L${x + 12.5},${y - 8} C${x + 13.5},${y + 4} ${x + 7},${y + 11} ${x},${y + 11} C${x - 7},${y + 11} ${x - 13.5},${y + 4} ${x - 12.5},${y - 8} Z`}
              fill="#1C232B"
              fillOpacity={0.88}
              stroke={GOLD_DARK}
              strokeWidth={1.8}
            />
          ))}
          {[lx, rx].map((x) => (
            <Path key={`g${x}`} d={`M${x - 8},${y - 5} L${x - 3},${y - 5} L${x - 8},${y + 2} Z`} fill={WHITE} opacity={0.18} />
          ))}
          <Path d={`M${lx + 12.5},${y - 7} L${rx - 12.5},${y - 7}`} stroke={GOLD_DARK} strokeWidth={1.8} />
        </G>
      );
    case 'reading':
      return (
        <G>
          {arms(INK, 2)}
          <G stroke={INK} strokeWidth={2.2} fill="none">
            {[lx, rx].map((x) => (
              <Path key={x} d={`M${x - 12},${y + 1} L${x - 12},${y + 4} Q${x - 12},${y + 9} ${x - 7},${y + 9} L${x + 7},${y + 9} Q${x + 12},${y + 9} ${x + 12},${y + 4} L${x + 12},${y + 1}`} />
            ))}
            <Path d={`M${lx + 12},${y + 2} Q100,${y - 1} ${rx - 12},${y + 2}`} />
          </G>
        </G>
      );
    default:
      // round
      return (
        <G>
          {arms(INK, 2.2)}
          <G stroke={INK} strokeWidth={2.4} fill={WHITE} fillOpacity={0.12}>
            <Circle cx={lx} cy={y} r={11.5} />
            <Circle cx={rx} cy={y} r={11.5} />
          </G>
          <Path d={`M${lx + 11.5},${y - 2} Q100,${y - 6} ${rx - 11.5},${y - 2}`} stroke={INK} strokeWidth={2.2} fill="none" />
        </G>
      );
  }
}

// ---------------------------------------------------------------- body

interface Build {
  /** Half widths: shoulders, waist, hips. */
  s: number;
  w: number;
  h: number;
}

const BUILDS: Record<AvatarConfig['bodyBuild'], Build> = {
  slim: { s: 38, w: 29, h: 31 },
  athletic: { s: 46, w: 33, h: 33 },
  average: { s: 42, w: 34, h: 35 },
  curvy: { s: 38, w: 29, h: 42 },
  broad: { s: 49, w: 40, h: 40 },
};

const LONG_SLEEVES = new Set(['hoodie', 'turtleneck', 'jacket', 'thobe']);

type Pt = [number, number];

/** Drawn behind the neck and head (hood). */
export function BodyBack({ config, kit }: { config: AvatarConfig; kit: ToonKit }) {
  if (config.outfit !== 'hoodie') return null;
  return (
    <Path
      d={`M72,${SH + 6} Q70,${SH - 20} 100,${SH - 18} Q130,${SH - 20} 128,${SH + 6} Z`}
      fill={kit.top.shade}
    />
  );
}

export function Body({ config, kit }: { config: AvatarConfig; kit: ToonKit }) {
  const b = BUILDS[config.bodyBuild] ?? BUILDS.average;
  const feet = FEET_Y[config.height] ?? FEET_Y.medium;
  const thobe = config.outfit === 'thobe';
  const hem = thobe ? feet - 2 : HEM;
  const flare = thobe ? 12 : 0;
  const { s, w } = b;
  const h = b.h + flare;
  const torso = [
    `M88,${SH - 3}`,
    `L${100 - s + 9},${SH}`,
    `Q${100 - s},${SH + 2} ${100 - s},${SH + 13}`,
    `L${100 - s + 4},${SH + 42}`,
    `C${100 - w - 1},${SH + 52} ${100 - w},${SH + 70} ${100 - h - 1},${hem}`,
    `Q100,${hem + 5} ${100 + h + 1},${hem}`,
    `C${100 + w},${SH + 70} ${100 + w + 1},${SH + 52} ${100 + s - 4},${SH + 42}`,
    `L${100 + s},${SH + 13}`,
    `Q${100 + s},${SH + 2} ${100 + s - 9},${SH}`,
    `L112,${SH - 3}`,
    `Q100,${SH + 5} 88,${SH - 3}`,
    'Z',
  ].join(' ');

  return (
    <G>
      {/* neck, with the chin's shadow */}
      <Rect x={91} y={100} width={18} height={SH - 96} rx={6} fill={kit.url('skin')} />
      <Ellipse cx={100} cy={112} rx={10} ry={5} fill={kit.skin.shade} opacity={0.7} />
      {thobe ? null : <Bottoms config={config} kit={kit} hips={b.h} feet={feet} />}
      <Shoes style={config.shoes} feet={feet} kit={kit} />
      <Path d={torso} fill={kit.url('top')} />
      <OutfitDetail style={config.outfit} kit={kit} hem={hem} />
      <Arms config={config} build={b} kit={kit} />
    </G>
  );
}

function Bottoms({ config, kit, hips, feet }: { config: AvatarConfig; kit: ToonKit; hips: number; feet: number }) {
  const fill = kit.url('bottom');
  const style = config.bottoms;
  const skinLegs = (from: number) => (
    <G>
      {[-1, 1].map((side) => (
        <Path
          key={side}
          d={`M${100 + side * 3},${from} L${100 + side * 27},${from} C${100 + side * 28},${from + 40} ${100 + side * 25},${feet - 40} ${100 + side * 23},${feet} L${100 + side * 9},${feet} C${100 + side * 8},${feet - 40} ${100 + side * 4},${from + 40} ${100 + side * 3},${from} Z`}
          fill={kit.url('skin')}
        />
      ))}
    </G>
  );
  if (style === 'shorts') {
    return (
      <G>
        {skinLegs(270)}
        <Path
          d={`M${100 - hips},216 L${100 + hips},216 C${100 + hips + 2},248 ${100 + hips + 4},276 ${100 + hips + 4},298 L103,298 L100,256 L97,298 L${100 - hips - 4},298 C${100 - hips - 4},276 ${100 - hips - 2},248 ${100 - hips},216 Z`}
          fill={fill}
        />
      </G>
    );
  }
  if (style === 'skirt') {
    return (
      <G>
        {skinLegs(280)}
        <Path
          d={`M${100 - hips},214 L${100 + hips},214 L${100 + hips + 17},304 Q100,312 ${100 - hips - 17},304 Z`}
          fill={fill}
        />
        <Path d={`M100,222 L100,306 M${100 - hips + 6},226 L${100 - hips - 6},304 M${100 + hips - 6},226 L${100 + hips + 6},304`} stroke={WHITE} strokeOpacity={0.12} strokeWidth={2} />
      </G>
    );
  }
  const ankleOut = style === 'joggers' ? 25 : 27;
  const ankleIn = style === 'joggers' ? 7 : 5;
  return (
    <G>
      <Path
        d={`M${100 - hips},216 L${100 + hips},216 C${100 + hips + 1},262 ${100 + 31},${feet - 80} ${100 + ankleOut},${feet + 1} L${100 + ankleIn},${feet + 1} C${100 + ankleIn},${feet - 60} 103,282 100,252 C97,282 ${100 - ankleIn},${feet - 60} ${100 - ankleIn},${feet + 1} L${100 - ankleOut},${feet + 1} C${100 - 31},${feet - 80} ${100 - hips - 1},262 ${100 - hips},216 Z`}
        fill={fill}
      />
      {/* a crease down each leg */}
      <Path d={`M84,236 L${100 - 16},${feet - 6} M116,236 L${100 + 16},${feet - 6}`} stroke={WHITE} strokeOpacity={0.1} strokeWidth={2} />
      {style === 'joggers' ? (
        <G>
          <Rect x={100 - ankleOut} y={feet - 7} width={ankleOut - ankleIn} height={8} rx={3} fill={fill} />
          <Rect x={100 + ankleIn} y={feet - 7} width={ankleOut - ankleIn} height={8} rx={3} fill={fill} />
          <Path d={`M${100 - ankleOut},${feet - 7} L${100 - ankleIn},${feet - 7} M${100 + ankleIn},${feet - 7} L${100 + ankleOut},${feet - 7}`} stroke={INK} strokeOpacity={0.2} strokeWidth={1.2} />
        </G>
      ) : null}
    </G>
  );
}

function Shoes({ style, feet, kit }: { style: string; feet: number; kit: ToonKit }) {
  return (
    <G>
      {[-1, 1].map((side) => {
        const x = 100 + side * 17;
        switch (style) {
          case 'boots':
            return (
              <G key={side}>
                <Path d={`M${x - 10},${feet - 16} L${x + 10},${feet - 16} L${x + 11},${feet + 3} C${x + 14},${feet + 3} ${x + 14},${feet + 9} ${x + 12},${feet + 9} L${x - 12},${feet + 9} C${x - 14},${feet + 9} ${x - 14},${feet + 3} ${x - 11},${feet + 3} Z`} fill={kit.url('shoes')} />
                <Rect x={x - 13.5} y={feet + 6} width={27} height={4.5} rx={2} fill={mix(kit.shoes, INK, 0.5)} />
                <Path d={`M${x - 10},${feet - 12} L${x + 10},${feet - 12}`} stroke={WHITE} strokeOpacity={0.2} strokeWidth={1.6} />
              </G>
            );
          case 'sandals':
            return (
              <G key={side}>
                <Path d={`M${x - 11},${feet + 7} Q${x - 12},${feet - 5} ${x},${feet - 6} Q${x + 12},${feet - 5} ${x + 11},${feet + 7} Z`} fill={kit.url('skin')} />
                <Rect x={x - 13} y={feet + 6} width={26} height={4} rx={2} fill={mix(kit.shoes, INK, 0.25)} />
                <Path d={`M${x - 10},${feet + 1} Q${x},${feet - 4} ${x + 10},${feet + 1}`} stroke={kit.shoes} strokeWidth={3.6} strokeLinecap="round" fill="none" />
              </G>
            );
          case 'barefoot':
            return (
              <G key={side}>
                <Path d={`M${x - 11},${feet + 9} Q${x - 12.5},${feet - 5} ${x},${feet - 6} Q${x + 12.5},${feet - 5} ${x + 11},${feet + 9} Z`} fill={kit.url('skin')} />
                <Path d={`M${x - 6},${feet + 7} l0,2 M${x - 2},${feet + 7.5} l0,1.6 M${x + 2},${feet + 7.5} l0,1.6 M${x + 6},${feet + 7} l0,2`} stroke={kit.skin.shade} strokeWidth={1.2} strokeLinecap="round" />
              </G>
            );
          default:
            // sneakers: colored upper, white sole, laces
            return (
              <G key={side}>
                <Path d={`M${x - 14},${feet + 3} Q${x - 14.5},${feet + 10} ${x - 9},${feet + 10} L${x + 9},${feet + 10} Q${x + 14.5},${feet + 10} ${x + 14},${feet + 3} Z`} fill="#F5F3EF" />
                <Path d={`M${x - 14},${feet + 7.6} L${x + 14},${feet + 7.6}`} stroke={INK} strokeOpacity={0.12} strokeWidth={1} />
                <Path d={`M${x - 13},${feet + 4} C${x - 13.5},${feet - 4} ${x - 8},${feet - 7} ${x},${feet - 7} C${x + 8},${feet - 7} ${x + 13.5},${feet - 4} ${x + 13},${feet + 4} Z`} fill={kit.url('shoes')} />
                <Path d={`M${x - 4},${feet - 3} L${x + 4},${feet - 3} M${x - 4.5},${feet} L${x + 4.5},${feet}`} stroke={WHITE} strokeWidth={1.4} strokeLinecap="round" opacity={0.85} />
              </G>
            );
        }
      })}
    </G>
  );
}

function OutfitDetail({ style, kit, hem }: { style: string; kit: ToonKit; hem: number }) {
  const { top } = kit;
  const light = mix(top.value, WHITE, 0.65);
  switch (style) {
    case 'hoodie':
      return (
        <G>
          <Path d={`M86,${SH - 2} Q100,${SH + 12} 114,${SH - 2} Q100,${SH + 4} 86,${SH - 2} Z`} fill={top.shade} />
          <Path d={`M95,${SH + 6} L94,${SH + 34} M105,${SH + 6} L106,${SH + 34}`} stroke={light} strokeWidth={1.8} strokeLinecap="round" />
          <Path d={`M80,192 L120,192 L117,216 L83,216 Z`} fill={top.shade} opacity={0.35} />
          <Rect x={70} y={hem - 9} width={60} height={9} fill={top.shade} opacity={0.3} />
        </G>
      );
    case 'collar':
      return (
        <G>
          <Path d={`M86,${SH - 4} L100,${SH + 9} L95,${SH + 15} L83,${SH + 2} Z M114,${SH - 4} L100,${SH + 9} L105,${SH + 15} L117,${SH + 2} Z`} fill={light} />
          <Path d={`M100,${SH + 9} L100,${SH + 32}`} stroke={top.shade} strokeWidth={1.6} />
          {[SH + 18, SH + 27].map((y) => (
            <Circle key={y} cx={100} cy={y} r={1.5} fill={light} />
          ))}
        </G>
      );
    case 'thobe':
      return (
        <G>
          <Path d={`M90,${SH - 2} Q100,${SH + 6} 110,${SH - 2}`} stroke={top.shade} strokeWidth={2} fill="none" />
          <Path d={`M100,${SH + 4} L100,${SH + 50}`} stroke={top.shade} strokeWidth={1.6} opacity={0.6} />
          {[SH + 14, SH + 26, SH + 38].map((y) => (
            <Circle key={y} cx={100} cy={y} r={1.4} fill={top.shade} />
          ))}
          <Path d={`M86,${SH + 90} L80,${hem - 4} M114,${SH + 90} L120,${hem - 4}`} stroke={top.shade} strokeOpacity={0.35} strokeWidth={1.6} />
        </G>
      );
    case 'turtleneck':
      return (
        <G>
          <Rect x={87} y={110} width={26} height={SH - 104} rx={7} fill={kit.url('top')} />
          {[92, 97, 103, 108].map((x) => (
            <Path key={x} d={`M${x},113 L${x},${SH + 2}`} stroke={top.shade} strokeWidth={1.2} opacity={0.55} />
          ))}
        </G>
      );
    case 'jacket':
      return (
        <G>
          <Path d={`M90,${SH - 2} Q100,${SH + 6} 110,${SH - 2} L107,${hem + 1} L93,${hem + 1} Z`} fill="#F3EFE7" />
          <Path d={`M90,${SH - 3} Q100,${SH + 5} 110,${SH - 3}`} stroke="#D9D2C4" strokeWidth={1.6} fill="none" />
          <Path d={`M88,${SH - 4} L97,${SH + 38} L93,${hem} M112,${SH - 4} L103,${SH + 38} L107,${hem}`} stroke={top.shade} strokeWidth={2.4} strokeLinejoin="round" fill="none" />
          <Path d={`M84,${SH} L95,${SH + 26} L90,${SH + 30} Z M116,${SH} L105,${SH + 26} L110,${SH + 30} Z`} fill={top.shade} />
        </G>
      );
    default:
      // crewneck tee
      return (
        <G>
          <Path d={`M88,${SH - 3} Q100,${SH + 8} 112,${SH - 3} Q100,${SH + 3} 88,${SH - 3} Z`} fill={top.shade} />
          <Path d={`M${100 - 30},${hem - 2} Q100,${hem + 2} ${100 + 30},${hem - 2}`} stroke={top.shade} strokeOpacity={0.4} strokeWidth={1.4} fill="none" />
        </G>
      );
  }
}

function Hand({ at, toward, kit, open = false }: { at: Pt; toward: Pt; kit: ToonKit; open?: boolean }) {
  // Rotate so the hand's +y axis points from the wrist toward `toward`.
  const dx = toward[0] - at[0];
  const dy = toward[1] - at[1];
  const angle = (Math.atan2(-dx, dy) * 180) / Math.PI;
  const thumbSide = at[0] < 100 ? 1 : -1;
  return (
    <G transform={`translate(${at[0]} ${at[1]}) rotate(${angle.toFixed(1)})`}>
      {open ? (
        <G>
          {[-4.5, -1.5, 1.5, 4.5].map((fx, i) => (
            <Path key={fx} d={`M${fx * 0.8},6 L${fx * 1.25},${15 + (i === 1 || i === 2 ? 1.5 : 0)}`} stroke={kit.url('skin')} strokeWidth={3.2} strokeLinecap="round" />
          ))}
          <Ellipse cx={-thumbSide * 6} cy={5} rx={2.2} ry={4.2} fill={kit.url('skin')} transform={`rotate(${thumbSide * 35} ${-thumbSide * 6} 5)`} />
        </G>
      ) : null}
      <Ellipse cx={0} cy={6} rx={6} ry={7.4} fill={kit.url('skin')} />
      {open ? null : (
        <Ellipse cx={thumbSide * 4.6} cy={4} rx={2.3} ry={4} fill={kit.skin.shade} opacity={0.9} transform={`rotate(${-thumbSide * 20} ${thumbSide * 4.6} 4)`} />
      )}
    </G>
  );
}

function Arms({ config, build, kit }: { config: AvatarConfig; build: Build; kit: ToonKit }) {
  const long = LONG_SLEEVES.has(config.outfit);
  const { s } = build;
  const arm = (side: -1 | 1, elbow: Pt, wrist: Pt, hand: Pt, open = false) => {
    const shoulder: Pt = [100 + side * (s - 7), SH + 14];
    const sleeveEnd: Pt = [shoulder[0] + (elbow[0] - shoulder[0]) * 0.62, shoulder[1] + (elbow[1] - shoulder[1]) * 0.62];
    const d = `M${shoulder[0]},${shoulder[1]} L${elbow[0]},${elbow[1]} L${wrist[0]},${wrist[1]}`;
    return (
      <G key={side}>
        <Path d={d} stroke={kit.url('skin')} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {long ? (
          <G>
            <Path d={d} stroke={kit.url('top')} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <Circle cx={wrist[0]} cy={wrist[1]} r={7.6} fill={kit.top.shade} />
          </G>
        ) : (
          <Path d={`M${shoulder[0]},${shoulder[1]} L${sleeveEnd[0]},${sleeveEnd[1]}`} stroke={kit.url('top')} strokeWidth={19} strokeLinecap="round" />
        )}
        <Hand at={wrist} toward={hand} kit={kit} open={open} />
      </G>
    );
  };
  const hanging = (side: -1 | 1) =>
    arm(side, [100 + side * (s + 2), SH + 60], [100 + side * (s + 3), SH + 104], [100 + side * (s + 3), SH + 140]);

  switch (config.pose) {
    case 'hip':
      return (
        <G>
          {hanging(-1)}
          {arm(1, [100 + s + 24, SH + 58], [100 + build.w + 9, HEM - 16], [100 + build.w - 10, HEM - 4])}
        </G>
      );
    case 'wave':
      return (
        <G>
          {hanging(-1)}
          {arm(1, [100 + s + 22, SH + 40], [100 + s + 26, SH - 10], [100 + s + 28, SH - 40], true)}
        </G>
      );
    case 'arms-crossed':
      return (
        <G>
          {arm(-1, [100 - s - 3, SH + 58], [100 + 22, SH + 50], [100 + 40, SH + 46])}
          {arm(1, [100 + s + 3, SH + 62], [100 - 24, SH + 56], [100 - 42, SH + 52])}
        </G>
      );
    default:
      return (
        <G>
          {hanging(-1)}
          {hanging(1)}
        </G>
      );
  }
}
