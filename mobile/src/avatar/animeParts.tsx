// Head parts of the anime avatar (see AnimeAvatar.tsx for how they
// stack). Drawn in the shared head space (center 100,92, eye line y=98),
// the same space the toon avatar uses, so the body, hats and glasses from
// toonParts.tsx and softParts.tsx line up.
//
// The look: an angular jaw with a pointed chin, hard-edged cel shadows,
// sharp eyes under a heavy upper lash line, thick low brows, a nose drawn
// as one line and a shadow, and spiky locks of hair that fall over the
// forehead and cast their shadow on it.

import React from 'react';
import { Circle, ClipPath, Defs, G, Line, Path } from 'react-native-svg';
import { mix } from '../theme/tokens';
import { HEAD_CX, HEAD_CY, type FaceShape } from './softParts';
import { toonEye } from './toonParts';
import type { AnimeStyle } from './animeStyles';
import type { Mood } from './types';

export const EYE_Y = 98;

export interface AnimeKit {
  style: AnimeStyle;
  ink: string;
  skin: { base: string; shade: string };
  hair: string;
  hairShade: string;
  mood: Mood;
  id: (name: string) => string;
}

// ---------------------------------------------------------------- head

/** Angular anime head: round skull, straight cheeks, a pointed chin. */
export function animeHeadPath(face: FaceShape): string {
  const { rx, ry } = face;
  const cx = HEAD_CX;
  const cy = HEAD_CY;
  const t = cy - ry;
  const jawX = rx * (0.5 + face.jaw * 0.38);
  const jawY = cy + ry * (0.58 + face.jawDrop * 0.16);
  const chinW = 2.5 + face.jaw * 7;
  const chinY = cy + ry;
  return [
    `M${cx},${t}`,
    `C${cx + rx * face.top},${t} ${cx + rx},${cy - ry * 0.56} ${cx + rx},${cy - 2}`,
    `L${cx + rx * 0.96},${cy + ry * 0.3}`,
    `Q${cx + rx * 0.9},${cy + ry * 0.5} ${cx + jawX},${jawY}`,
    `L${cx + chinW},${chinY - 1}`,
    `Q${cx},${chinY + 1.5} ${cx - chinW},${chinY - 1}`,
    `L${cx - jawX},${jawY}`,
    `Q${cx - rx * 0.9},${cy + ry * 0.5} ${cx - rx * 0.96},${cy + ry * 0.3}`,
    `L${cx - rx},${cy - 2}`,
    `C${cx - rx},${cy - ry * 0.56} ${cx - rx * face.top},${t} ${cx},${t}`,
    'Z',
  ].join(' ');
}

export function AnimeEars({ face, kit }: { face: FaceShape; kit: AnimeKit }) {
  return (
    <G>
      {[-1, 1].map((side) => {
        const x = HEAD_CX + side * (face.rx - 1);
        return (
          <G key={side}>
            <Path
              d={`M${x},92 Q${x + side * 10},88 ${x + side * 9},100 Q${x + side * 8},110 ${x - side * 1},112 Z`}
              fill={side > 0 ? kit.skin.shade : kit.skin.base}
              stroke={kit.ink}
              strokeWidth={kit.style.line}
              strokeLinejoin="round"
            />
            <Path
              d={`M${x + side * 2},96 Q${x + side * 6},97 ${x + side * 4},106`}
              stroke={kit.ink}
              strokeWidth={kit.style.line * 0.6}
              fill="none"
              strokeLinecap="round"
            />
          </G>
        );
      })}
    </G>
  );
}

/**
 * Hard cel shadow: the far side of the face, the hair's shadow across the
 * forehead and eyes, and the cheekbone. Clipped to the head.
 */
export function FaceShadow({
  face,
  hair,
  kit,
}: {
  face: FaceShape;
  hair: string;
  kit: AnimeKit;
}) {
  const clip = kit.id('faceClip');
  const { rx, ry } = face;
  const fringe = fringeFor(hair);
  const side = `M${HEAD_CX + rx * 0.42},${HEAD_CY - ry - 4} C${HEAD_CX + rx * 0.3},${HEAD_CY - 10} ${HEAD_CX + rx * 0.62},${HEAD_CY + 10} ${HEAD_CX + rx * 0.5},${HEAD_CY + ry * 0.55} L${HEAD_CX + 3},${HEAD_CY + ry + 4} L${HEAD_CX + rx + 12},${HEAD_CY + ry + 4} L${HEAD_CX + rx + 12},${HEAD_CY - ry - 4} Z`;
  return (
    <G>
      <Defs>
        <ClipPath id={clip}>
          <Path d={animeHeadPath(face)} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clip})`}>
        <Path d={side} fill={kit.skin.shade} />
        {fringe ? (
          <G transform={`${hairSqueezeFor(face)} translate(3 ${fringe.shadow})`}>
            <Path d={fringePath(fringe)} fill={kit.skin.shade} />
          </G>
        ) : null}
        {kit.style.hatching ? (
          <G>
            <Defs>
              <ClipPath id={kit.id('hatchClip')}>
                <Path d={side} />
              </ClipPath>
            </Defs>
            <G clipPath={`url(#${kit.id('hatchClip')})`}>
              <Hatching x={HEAD_CX} y={HEAD_CY - ry - 4} w={rx + 14} h={ry * 2 + 10} kit={kit} />
            </G>
          </G>
        ) : null}
        {kit.style.rim ? (
          <Path
            d={`M${HEAD_CX + rx - 1.5},${HEAD_CY - 14} L${HEAD_CX + rx * 0.94},${HEAD_CY + ry * 0.3} Q${HEAD_CX + rx * 0.88},${HEAD_CY + ry * 0.5} ${HEAD_CX + rx * (0.5 + face.jaw * 0.38) - 1},${HEAD_CY + ry * (0.58 + face.jawDrop * 0.16) - 1}`}
            stroke={kit.style.rim}
            strokeWidth={2.4}
            strokeLinecap="round"
            fill="none"
            opacity={0.85}
          />
        ) : null}
      </G>
    </G>
  );
}

/** Diagonal screentone lines over the shadow side. */
export function Hatching({ x, y, w, h, kit }: { x: number; y: number; w: number; h: number; kit: AnimeKit }) {
  const lines: string[] = [];
  for (let i = -h; i < w; i += 3.2) {
    lines.push(`M${x + i},${y + h} L${x + i + h * 0.5},${y}`);
  }
  return <Path d={lines.join(' ')} stroke={kit.ink} strokeWidth={0.6} opacity={0.32} />;
}

// ---------------------------------------------------------------- eyes

export function AnimeEyes({ style, kit }: { style: string; kit: AnimeKit }) {
  const e = toonEye(style);
  const s = kit.style;
  const lid = Math.min(0.62, e.lid + (kit.mood === 'tired' ? 0.32 : 0) - (kit.mood === 'glowing' ? 0.06 : 0));
  const irisColor = s.iris ?? '#4A2E1E';
  const w = e.w + 1.2;
  // Anime eyes sit a little lower and narrower than they are wide.
  const h = e.h * 0.92;
  return (
    <G>
      {[-1, 1].map((side) => {
        const x = HEAD_CX + side * e.dx;
        const y = EYE_Y + 1;
        const inner = x - side * w;
        const outer = x + side * w;
        const top = y - h * 1.25 + h * 2 * lid;
        // Upper lid: a sharp line from the inner corner over the eye to a
        // long flick past the outer corner.
        const upper = `M${inner},${y + 0.6} Q${x - side * w * 0.35},${top} ${x + side * w * 0.45},${top + 0.6} L${outer + side * 2.6},${y - h * 0.35}`;
        const lower = `M${outer + side * 0.8},${y - h * 0.2} Q${x + side * w * 0.2},${y + h * 0.95} ${inner + side * 1.2},${y + h * 0.35}`;
        const opening = `${upper} L${outer + side * 0.8},${y - h * 0.2} Q${x + side * w * 0.2},${y + h * 0.95} ${inner + side * 1.2},${y + h * 0.35} Z`;
        const clip = kit.id(side < 0 ? 'aeyeL' : 'aeyeR');
        const iris = s.intenseEyes ? h * 0.82 : h * 1.02;
        const ix = x + side * 0.5;
        const iy = y + 0.4;
        return (
          <G key={side} transform={`rotate(${-side * (e.tilt + 3)} ${x} ${y})`}>
            <Defs>
              <ClipPath id={clip}>
                <Path d={opening} />
              </ClipPath>
            </Defs>
            <Path d={opening} fill="#EFE9DE" />
            <G clipPath={`url(#${clip})`}>
              {s.intenseEyes ? (
                <Circle cx={ix} cy={iy} r={iris + 1.6} fill={kit.ink} />
              ) : null}
              <Circle cx={ix} cy={iy} r={iris} fill={irisColor} />
              <Circle cx={ix} cy={iy} r={iris * 0.68} fill={mix(irisColor, kit.ink, 0.35)} />
              {s.intenseEyes ? (
                <Circle cx={ix} cy={iy} r={iris * 0.68} fill="none" stroke={mix(irisColor, '#FFFFFF', 0.25)} strokeWidth={0.8} />
              ) : null}
              <Circle cx={ix} cy={iy} r={iris * 0.32} fill={kit.ink} />
              <Circle cx={ix - iris * 0.4} cy={iy - iris * 0.38} r={iris * 0.2} fill="#FFFFFF" opacity={0.9} />
              {/* shadow the lid casts on the eyeball */}
              <Path d={upper} stroke={kit.ink} strokeOpacity={0.28} strokeWidth={4} fill="none" transform="translate(0 1.8)" />
            </G>
            {/* heavy lash line, thickest toward the outer corner */}
            <Path d={upper} stroke={kit.ink} strokeWidth={s.line + 1.1} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <Path
              d={`M${x + side * w * 0.2},${top + 1.6} L${outer + side * 2.6},${y - h * 0.35}`}
              stroke={kit.ink}
              strokeWidth={s.line + 1.8}
              strokeLinecap="round"
            />
            {/* the lower lid is only drawn at the outer half */}
            <Path d={`M${outer + side * 0.8},${y - h * 0.2} Q${x + side * w * 0.5},${y + h * 0.8} ${x - side * w * 0.1},${y + h * 0.88}`} stroke={kit.ink} strokeWidth={s.line * 0.7} strokeLinecap="round" fill="none" />
            {/* crease above the lid */}
            {e.crease ? (
              <Path d={`M${inner + side * 2},${top - 2.4} Q${x},${top - 4.8} ${outer + side * 1},${top - 1}`} stroke={kit.ink} strokeWidth={s.line * 0.55} strokeLinecap="round" fill="none" opacity={0.8} />
            ) : null}
            {s.rugged || kit.mood === 'tired' ? (
              <Path
                d={`M${x - side * w * 0.6},${y + h * 1.55} Q${x},${y + h * 1.9} ${x + side * w * 0.75},${y + h * 1.3} M${x - side * w * 0.2},${y + h * 2.2} L${x + side * w * 0.5},${y + h * 1.95}`}
                stroke={kit.ink}
                strokeWidth={s.line * 0.5}
                strokeLinecap="round"
                fill="none"
                opacity={0.7}
              />
            ) : null}
          </G>
        );
      })}
    </G>
  );
}

// ---------------------------------------------------------------- brows

const BROWS: Record<string, { width: number; arch: number; drop: number }> = {
  natural: { width: 3.2, arch: 2.4, drop: 2.5 },
  thick: { width: 4.6, arch: 2, drop: 3 },
  thin: { width: 2, arch: 2.4, drop: 2 },
  arched: { width: 3, arch: 5, drop: 1 },
  straight: { width: 3.4, arch: 0.4, drop: 1.5 },
  angled: { width: 3.6, arch: 3.6, drop: 4.5 },
  rounded: { width: 3.2, arch: 4, drop: 1.5 },
  bushy: { width: 5.4, arch: 2.4, drop: 3.5 },
};

/** Tapered wedges that sit low over the eyes and dip toward the nose. */
export function AnimeBrows({ style, eyes, kit }: { style: string; eyes: string; kit: AnimeKit }) {
  const b = BROWS[style] ?? BROWS.natural;
  const e = toonEye(eyes);
  const lift = kit.mood === 'glowing' ? -2 : kit.mood === 'happy' ? -1 : kit.mood === 'tired' ? 1.5 : 0;
  const drop = kit.mood === 'glowing' ? b.drop * 0.3 : b.drop;
  const y = EYE_Y - e.h - 6 + lift;
  const color = mix(kit.hair, kit.ink, 0.55);
  return (
    <G>
      {[-1, 1].map((side) => {
        const x = HEAD_CX + side * e.dx;
        const inner = x - side * 10;
        const outer = x + side * 12;
        const peak = x + side * 3;
        const d = [
          `M${inner},${y + drop}`,
          `L${inner},${y + drop - b.width}`,
          `Q${peak - side * 2},${y - b.arch - b.width * 0.9} ${peak},${y - b.arch - b.width * 0.6}`,
          `L${outer},${y + 1}`,
          `Q${peak},${y - b.arch + b.width * 0.5} ${inner},${y + drop}`,
          'Z',
        ].join(' ');
        return <Path key={side} d={d} fill={color} stroke={kit.ink} strokeWidth={0.6} strokeLinejoin="round" />;
      })}
    </G>
  );
}

// ---------------------------------------------------------------- nose & mouth

const NOSES: Record<string, { len: number; tip: number; width: number }> = {
  straight: { len: 15, tip: 4, width: 5 },
  button: { len: 6, tip: 3, width: 4.5 },
  wide: { len: 12, tip: 4, width: 7.5 },
  pointed: { len: 17, tip: 5.5, width: 4.5 },
  roman: { len: 17, tip: 4.5, width: 5.5 },
  snub: { len: 7, tip: 3, width: 4 },
};

/** The bridge as one ink line on the shadow side and a small shadow under the tip. */
export function AnimeNose({ style, kit }: { style: string; kit: AnimeKit }) {
  const n = NOSES[style] ?? NOSES.straight;
  const tipY = 115;
  const top = tipY - n.len;
  const bridge = style === 'roman'
    ? `M102.5,${top} Q106.5,${top + n.len * 0.4} 104.5,${tipY - 1.5}`
    : `M102,${top} Q104.5,${top + n.len * 0.6} 104,${tipY - 1}`;
  return (
    <G>
      <Path d={`M${100 - n.width * 0.2},${tipY + 1} L${100 + n.width},${tipY - 0.5} L${100 + n.width * 0.7},${tipY + 2.8} Z`} fill={kit.skin.shade} />
      {n.len > 8 ? <Path d={bridge} stroke={kit.ink} strokeWidth={kit.style.line * 0.7} strokeLinecap="round" fill="none" /> : null}
      <Path
        d={`M${100 - n.width},${tipY} L${100 - n.width * 0.3},${tipY + 1.6} M${100 + n.width * 0.3},${tipY + 1.6} L${100 + n.width},${tipY - 0.4}`}
        stroke={kit.ink}
        strokeWidth={kit.style.line * 0.8}
        strokeLinecap="round"
      />
      {n.tip > 4 ? <Line x1={104} y1={tipY - 1} x2={100 + n.tip * 0.4} y2={tipY + 1.2} stroke={kit.ink} strokeWidth={kit.style.line * 0.6} strokeLinecap="round" /> : null}
    </G>
  );
}

const MOOD_CURVE: Record<Mood, number> = { tired: -0.8, neutral: 0, happy: 1.4, glowing: 2.4 };

/** A firm line for a mouth, a short stroke for the lower lip. */
export function AnimeMouth({ style, kit }: { style: string; kit: AnimeKit }) {
  const k = MOOD_CURVE[kit.mood];
  const y = 128;
  const lw = kit.style.line;
  const line = (half: number, curve: number, lower = true, lip = 4) => (
    <G>
      <Path d={`M${100 - half},${y - curve * 0.6} Q100,${y + curve} ${100 + half},${y - curve * 0.6}`} stroke={kit.ink} strokeWidth={lw + 0.3} strokeLinecap="round" fill="none" />
      {lower ? <Path d={`M${100 - lip},${y + 5} Q100,${y + 5.8} ${100 + lip},${y + 5}`} stroke={kit.ink} strokeWidth={lw * 0.5} strokeLinecap="round" fill="none" opacity={0.35} /> : null}
    </G>
  );
  const open = (half: number, depth: number, teeth: boolean) => (
    <G>
      <Path d={`M${100 - half},${y - 1} L${100 + half},${y - 1.5} Q${100 + half * 0.4},${y + depth} 100,${y + depth} Q${100 - half * 0.6},${y + depth} ${100 - half},${y - 1} Z`} fill="#2A0E0C" stroke={kit.ink} strokeWidth={lw} strokeLinejoin="round" />
      {teeth ? <Path d={`M${100 - half + 1.5},${y - 0.6} L${100 + half - 1.5},${y - 1} L${100 + half - 3},${y + 2} L${100 - half + 3},${y + 2.2} Z`} fill="#F2EEE6" /> : null}
    </G>
  );
  if (kit.mood === 'tired') return line(8, -0.6);
  switch (style) {
    case 'big-smile':
      return open(11, 6 + k * 1.5, true);
    case 'open':
      return open(7, 6 + k, false);
    case 'smirk':
      return (
        <G>
          <Path d={`M93,${y + 0.5} L103,${y} Q108,${y - 1} 111,${y - 3.5 - k}`} stroke={kit.ink} strokeWidth={lw + 0.3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Path d={`M97,${y + 5} Q100,${y + 5.8} 103,${y + 5}`} stroke={kit.ink} strokeWidth={lw * 0.5} strokeLinecap="round" fill="none" opacity={0.35} />
        </G>
      );
    case 'small':
      return line(5, k * 0.6, true, 3);
    case 'full':
      return line(9, k * 0.8, true, 6);
    case 'neutral':
    case 'calm':
      return line(8, k * 0.5);
    default:
      // soft-smile: a firm line that lifts into an open grin on a great day.
      return kit.mood === 'glowing' ? open(10, 6, true) : line(9, k);
  }
}

/** Stubble as short ink ticks; fuller beards are solid locks with a jagged edge. */
export function AnimeFacialHair({ style, face, kit }: { style: string; face: FaceShape; kit: AnimeKit }) {
  const chin = HEAD_CY + face.ry;
  const L = HEAD_CX - face.rx;
  const R = HEAD_CX + face.rx;
  const color = kit.hair;
  const ticks = (n: number) => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i * 137.5) % 360;
      const r = (i * 7.3) % 1;
      const x = HEAD_CX + Math.cos((a * Math.PI) / 180) * face.rx * 0.62 * (0.4 + r * 0.6);
      const yy = chin - 12 + Math.sin((a * Math.PI) / 180) * 9;
      if (yy > chin - 2 || (Math.abs(x - 100) < 9 && yy < chin - 14)) continue;
      out.push(`M${x.toFixed(1)},${yy.toFixed(1)} l0.4,1.4`);
    }
    return out.join(' ');
  };
  const mustache = `M87,124 L93,120.5 L100,122 L107,120.5 L113,124 L107,123 L100,124.4 L93,123 Z`;
  const jag = (y: number) => {
    const pts: string[] = [];
    for (let i = 0; i <= 8; i++) {
      const x = HEAD_CX - 22 + i * 5.5;
      pts.push(`L${x},${y + (i % 2 ? 5 : 0) + Math.sin(i) * 1.5}`);
    }
    return pts;
  };
  switch (style) {
    case 'stubble':
      return <Path d={ticks(70)} stroke={kit.ink} strokeWidth={0.8} strokeLinecap="round" opacity={0.55} />;
    case 'mustache':
      return <Path d={mustache} fill={color} stroke={kit.ink} strokeWidth={kit.style.line * 0.6} strokeLinejoin="round" />;
    case 'goatee':
      return (
        <G fill={color} stroke={kit.ink} strokeWidth={kit.style.line * 0.6} strokeLinejoin="round">
          <Path d={mustache} />
          <Path d={`M92,${chin - 13} L100,${chin - 10} L108,${chin - 13} L106,${chin + 2} L100,${chin + 5} L94,${chin + 2} Z`} />
        </G>
      );
    case 'beard':
      return (
        <G>
          <Path
            d={[`M${L + 2},96`, `L${L + 7},96`, `Q${L + 9},114 ${HEAD_CX - 12},117`, `L${HEAD_CX + 12},117`, `Q${R - 9},114 ${R - 7},96`, `L${R - 2},96`, `L${R - 6},${chin - 10}`, `L${HEAD_CX + 22},${chin + 2}`, ...jag(chin + 2).reverse(), `L${L + 6},${chin - 10}`, 'Z'].join(' ')}
            fill={color}
            stroke={kit.ink}
            strokeWidth={kit.style.line * 0.7}
            strokeLinejoin="round"
          />
          <Path d={mustache} fill={color} stroke={kit.ink} strokeWidth={kit.style.line * 0.6} strokeLinejoin="round" />
        </G>
      );
    default:
      return kit.style.rugged ? <Path d={ticks(26)} stroke={kit.ink} strokeWidth={0.7} strokeLinecap="round" opacity={0.35} /> : null;
  }
}

/** Fine ink lines that make the face look lived-in (rugged styles). */
export function RuggedLines({ face, kit }: { face: FaceShape; kit: AnimeKit }) {
  if (!kit.style.rugged) return null;
  return (
    <Path
      d={`M${HEAD_CX - 4},80 L${HEAD_CX - 2},86 M${HEAD_CX + 4},80 L${HEAD_CX + 2},86`}
      stroke={kit.ink}
      strokeWidth={kit.style.line * 0.45}
      strokeLinecap="round"
      opacity={0.6}
    />
  );
}

// ---------------------------------------------------------------- hair

/**
 * Spiky fringe for a hairstyle: points along the hairline. Each lock runs
 * from a notch high on the forehead down to a sharp tip. Drawn in the soft
 * hair art's space (44..156 wide) inside the same squeeze.
 */
interface Fringe {
  tips: [number, number][];
  notch: number;
  /** Sideways bend of every lock. */
  sweep: number;
  /** How far down its shadow falls on the face. */
  shadow: number;
  /** Spikes on the crown, beyond the rounded top of the hair art. */
  crown?: boolean;
}

const CURTAIN: Fringe = {
  tips: [[44, 112], [52, 96], [64, 86], [76, 92], [88, 78], [98, 70], [102, 70], [112, 78], [124, 92], [136, 86], [148, 96], [156, 112]],
  notch: 60,
  sweep: 0,
  shadow: 7,
};

const FRINGES: Record<string, Fringe> = {
  'short-wave': {
    tips: [[44, 102], [52, 90], [62, 96], [72, 84], [84, 94], [96, 82], [108, 92], [120, 84], [132, 94], [144, 86], [156, 100]],
    notch: 62,
    sweep: 3,
    shadow: 8,
    crown: true,
  },
  messy: {
    tips: [[42, 106], [50, 88], [60, 100], [70, 82], [82, 98], [92, 80], [102, 96], [114, 80], [126, 94], [138, 82], [150, 98], [158, 106]],
    notch: 60,
    sweep: -4,
    shadow: 9,
    crown: true,
  },
  fringe: {
    tips: [[44, 104], [52, 94], [62, 90], [72, 94], [82, 88], [92, 93], [102, 87], [112, 93], [122, 88], [132, 94], [142, 90], [150, 96], [156, 104]],
    notch: 64,
    sweep: 1,
    shadow: 8,
    crown: true,
  },
  'side-part': {
    tips: [[44, 98], [52, 80], [60, 72], [76, 82], [92, 86], [108, 90], [122, 92], [136, 90], [146, 100], [156, 106]],
    notch: 58,
    sweep: 7,
    shadow: 7,
    crown: true,
  },
  'long-straight': CURTAIN,
  'waves-medium': { ...CURTAIN, sweep: 2 },
  braids: { ...CURTAIN, tips: CURTAIN.tips.map(([x, y]) => [x, y - 4] as [number, number]) },
  locs: { ...CURTAIN, sweep: -2 },
  ponytail: {
    tips: [[44, 102], [54, 88], [66, 80], [82, 86], [96, 76], [110, 84], [124, 78], [138, 88], [150, 92], [156, 102]],
    notch: 60,
    sweep: 4,
    shadow: 6,
  },
  bun: {
    tips: [[44, 104], [54, 90], [64, 82], [78, 88], [92, 76], [108, 76], [122, 88], [136, 82], [146, 90], [156, 104]],
    notch: 60,
    sweep: 0,
    shadow: 6,
  },
  cap: {
    tips: [[44, 100], [50, 90], [58, 96], [66, 86], [134, 86], [142, 96], [150, 90], [156, 100]],
    notch: 74,
    sweep: 0,
    shadow: 5,
  },
  beanie: {
    tips: [[44, 102], [52, 92], [62, 98], [74, 88], [88, 96], [100, 90], [112, 96], [126, 88], [138, 98], [148, 92], [156, 102]],
    notch: 78,
    sweep: 2,
    shadow: 5,
  },
};

export function fringeFor(hair: string): Fringe | null {
  return FRINGES[hair] ?? null;
}

/** Squeeze matching toonParts.hairSqueeze, so the fringe fits the face. */
export function hairSqueezeFor(face: FaceShape): string {
  const sx = (face.rx + 3) / 57;
  return `translate(${HEAD_CX} 0) scale(${sx.toFixed(3)} 1) translate(-${HEAD_CX} 0)`;
}

function fringePath(f: Fringe): string {
  const parts: string[] = [];
  const first = f.tips[0];
  parts.push(`M${first[0] - 2},${f.notch - 6}`);
  parts.push(`L${first[0]},${first[1]}`);
  for (let i = 1; i < f.tips.length; i++) {
    const [px, py] = f.tips[i - 1];
    const [tx, ty] = f.tips[i];
    const nx = (px + tx) / 2 + f.sweep * 0.6;
    const ny = f.notch + Math.abs(py - ty) * 0.15 + (Math.min(py, ty) - f.notch) * 0.35;
    parts.push(`Q${px + f.sweep * 0.3},${(py + ny) / 2} ${nx},${ny}`);
    parts.push(`Q${tx - f.sweep},${(ny + ty) / 2} ${tx},${ty}`);
  }
  const last = f.tips[f.tips.length - 1];
  parts.push(`L${last[0] + 2},${f.notch - 6}`);
  parts.push(`Q100,${f.notch - 30} ${first[0] - 2},${f.notch - 6}`);
  parts.push('Z');
  return parts.join(' ');
}

/** Ink lines that split the fringe into locks. */
function strandLines(f: Fringe): string {
  const out: string[] = [];
  for (let i = 1; i < f.tips.length - 1; i++) {
    const [tx, ty] = f.tips[i];
    const len = Math.min(18, (ty - f.notch) * 0.7);
    if (len < 6) continue;
    out.push(`M${tx},${ty - 2} Q${tx - f.sweep * 0.8 + 1},${ty - len * 0.6} ${tx - f.sweep * 1.2 + 2},${ty - len}`);
  }
  return out.join(' ');
}

export function Fringe({ hair, fill }: { hair: string; fill: string }) {
  const f = fringeFor(hair);
  if (!f) return null;
  return <Path d={fringePath(f)} fill={fill} />;
}

export function FringeLines({ hair, kit }: { hair: string; kit: AnimeKit }) {
  const f = fringeFor(hair);
  if (!f) return null;
  return (
    <Path d={strandLines(f)} stroke={kit.ink} strokeWidth={kit.style.line * 0.55} strokeLinecap="round" fill="none" opacity={0.8} />
  );
}

/** Big swept locks that break the rounded top of the hair, drawn behind it. */
const CROWN_LOCKS: [number, number, number][] = [
  // angle (deg, -90 = straight up), length, base half-width
  [-170, 14, 9],
  [-150, 18, 10],
  [-131, 15, 9],
  [-112, 20, 11],
  [-92, 15, 10],
  [-72, 19, 11],
  [-52, 14, 9],
  [-32, 17, 9],
  [-12, 12, 8],
];

export function CrownSpikes({ hair, fill }: { hair: string; fill: string }) {
  const f = fringeFor(hair);
  if (!f?.crown) return null;
  const cx = 100;
  const cy = 84;
  const r = 52;
  const d = CROWN_LOCKS.map(([deg, len, half]) => {
    const a = (deg * Math.PI) / 180;
    const b1 = a - half / r;
    const b2 = a + half / r;
    const bend = (f.sweep >= 0 ? 1 : -1) * 0.22;
    const tipA = a + bend;
    const p = (ang: number, rad: number) => `${(cx + Math.cos(ang) * rad * 1.04).toFixed(1)},${(cy + Math.sin(ang) * rad).toFixed(1)}`;
    return `M${p(b1, r - 10)} Q${p(a - 0.05, r + len * 0.6)} ${p(tipA, r + len)} Q${p(a + 0.12, r + len * 0.35)} ${p(b2, r - 10)} Z`;
  }).join(' ');
  return <Path d={d} fill={fill} />;
}

/** Sharp highlight band across the hair, or wet streaks in the rain. */
export function HairShine({ hair, kit }: { hair: string; kit: AnimeKit }) {
  if (['bald', 'hijab', 'cap', 'beanie', 'turban'].includes(hair)) return null;
  if (kit.style.rain) {
    return (
      <Path
        d="M72,44 Q70,62 74,78 M88,38 Q86,58 90,70 M114,40 Q116,56 112,74 M130,48 Q132,62 128,80 M60,66 Q58,80 62,92"
        stroke="#E8EEF4"
        strokeWidth={1.1}
        strokeLinecap="round"
        fill="none"
        opacity={0.85}
      />
    );
  }
  const light = mix(kit.hair, '#FFFFFF', 0.3);
  return (
    <Path
      d="M70,48 L80,40 L76,50 Z M86,44 L98,36 L92,47 Z M104,42 L116,36 L110,46 Z"
      fill={light}
      opacity={0.6}
    />
  );
}
