// Full-body avatar parts. Body space extends the existing 200x200 head
// stack downward: the body occupies y=196..420 of a "0 0 200 420" canvas.
// Original geometry — same coordinate system as parts-face/parts-outfit.

import React from 'react';
import { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import type { AvatarConfig, BodyBuild, BodyHeight, BodyPose, ShoeStyle } from './types';
import { hairColor, outfitColor, pantsColor, shoesColor, skinTone } from './palettes';

const CX = 100;
const SHOULDER_Y = 196;
const HIP_BOTTOM = 285;

interface BuildDims {
  shoulder: number;
  waist: number;
  hip: number;
}

const BUILDS: Record<BodyBuild, BuildDims> = {
  slim: { shoulder: 36, waist: 28, hip: 33 },
  athletic: { shoulder: 46, waist: 30, hip: 35 },
  average: { shoulder: 41, waist: 35, hip: 38 },
  curvy: { shoulder: 39, waist: 29, hip: 47 },
  broad: { shoulder: 47, waist: 43, hip: 45 },
};

function legAnkle(height: BodyHeight): number {
  switch (height) {
    case 'short':
      return 388;
    case 'tall':
      return 416;
    default:
      return 404;
  }
}

function waistY(build: BodyBuild): number {
  return build === 'curvy' ? 252 : 246;
}

export function Torso({
  build,
  height,
  outfit,
  pants,
}: {
  build: BodyBuild;
  height: BodyHeight;
  outfit: { value: string; shade: string };
  pants: { value: string; shade: string };
}) {
  const d = BUILDS[build];
  const wy = waistY(build);
  const shoulderL = CX - d.shoulder;
  const shoulderR = CX + d.shoulder;
  const waistL = CX - d.waist;
  const waistR = CX + d.waist;
  const hipL = CX - d.hip;
  const hipR = CX + d.hip;

  return (
    <G>
      {/* chest/abdomen in outfit color */}
      <Path
        d={`M${shoulderL},${SHOULDER_Y}
            C${shoulderL - 3},${SHOULDER_Y + 22} ${waistL - 2},${wy - 18} ${waistL},${wy}
            C${waistL + 2},${wy + 14} ${hipL - 3},${HIP_BOTTOM - 22} ${hipL},${HIP_BOTTOM}
            L${hipR},${HIP_BOTTOM}
            C${hipR + 3},${HIP_BOTTOM - 22} ${waistR - 2},${wy + 14} ${waistR},${wy}
            C${waistR + 2},${wy - 18} ${shoulderR + 3},${SHOULDER_Y + 22} ${shoulderR},${SHOULDER_Y}
            Z`}
        fill={outfit.value}
      />
      {/* subtle center shading for depth */}
      <Path
        d={`M${CX},${SHOULDER_Y + 6} L${CX},${HIP_BOTTOM - 8}`}
        stroke={outfit.shade}
        strokeWidth={2}
        opacity={0.35}
      />
      {/* pelvis block in pants color */}
      <Path
        d={`M${waistL},${wy + 8}
            C${waistL + 2},${wy + 20} ${hipL - 2},${HIP_BOTTOM - 12} ${hipL},${HIP_BOTTOM}
            L${hipR},${HIP_BOTTOM}
            C${hipR + 2},${HIP_BOTTOM - 12} ${waistR - 2},${wy + 20} ${waistR},${wy + 8}
            Z`}
        fill={pants.value}
      />
      {height === 'short' ? null : null}
    </G>
  );
}

export function Arms({
  skin,
  sleeve,
  pose,
  build,
}: {
  skin: { base: string; shade: string };
  sleeve: string;
  pose: BodyPose;
  build: BodyBuild;
}) {
  const d = BUILDS[build];
  const shoulderLX = CX - d.shoulder + 4;
  const shoulderRX = CX + d.shoulder - 4;

  function hangingArm(side: 'left' | 'right') {
    const sx = side === 'left' ? shoulderLX : shoulderRX;
    const dir = side === 'left' ? -1 : 1;
    const handX = sx + dir * 10;
    return (
      <G key={side}>
        {/* sleeve */}
        <Path
          d={`M${sx},${SHOULDER_Y + 2} C${sx + dir * 8},${SHOULDER_Y + 16} ${sx + dir * 10},${SHOULDER_Y + 34} ${handX},${SHOULDER_Y + 52} L${handX + dir * 12},${SHOULDER_Y + 50} C${sx + dir * 18},${SHOULDER_Y + 30} ${sx + dir * 12},${SHOULDER_Y + 8} ${sx + dir * 6},${SHOULDER_Y - 2} Z`}
          fill={sleeve}
        />
        {/* forearm + hand */}
        <Path
          d={`M${handX},${SHOULDER_Y + 50} L${handX + dir * 4},${HIP_BOTTOM + 6}`}
          stroke={skin.base}
          strokeWidth={11}
          strokeLinecap="round"
        />
        <Circle cx={handX + dir * 4} cy={HIP_BOTTOM + 12} r={7.4} fill={skin.base} />
      </G>
    );
  }

  function handOnHip() {
    return (
      <G>
        {/* left arm bent, hand resting at the waist */}
        <Path
          d={`M${shoulderLX},${SHOULDER_Y + 2}
              C${shoulderLX - 14},${SHOULDER_Y + 30} ${CX - BUILDS[build].waist - 18},${waistY(build) + 2} ${CX - BUILDS[build].waist - 6},${waistY(build) + 10}`}
          stroke={sleeve}
          strokeWidth={13}
          strokeLinecap="round"
          fill="none"
        />
        <Circle cx={CX - BUILDS[build].waist - 4} cy={waistY(build) + 12} r={7.4} fill={skin.base} />
        {hangingArm('right')}
      </G>
    );
  }

  function armsCrossed() {
    const wy = SHOULDER_Y + 42;
    return (
      <G>
        {/* sleeves angled down toward the chest */}
        <Path
          d={`M${shoulderLX},${SHOULDER_Y + 2} L${CX - 18},${wy}`}
          stroke={sleeve}
          strokeWidth={13}
          strokeLinecap="round"
        />
        <Path
          d={`M${shoulderRX},${SHOULDER_Y + 2} L${CX + 18},${wy}`}
          stroke={sleeve}
          strokeWidth={13}
          strokeLinecap="round"
        />
        {/* forearms crossing the torso */}
        <Path
          d={`M${CX - 20},${wy} L${CX + 26},${wy + 14}`}
          stroke={skin.base}
          strokeWidth={11}
          strokeLinecap="round"
        />
        <Path
          d={`M${CX + 20},${wy} L${CX - 26},${wy + 14}`}
          stroke={skin.shade}
          strokeWidth={11}
          strokeLinecap="round"
        />
        <Circle cx={CX + 28} cy={wy + 15} r={6.6} fill={skin.base} />
        <Circle cx={CX - 28} cy={wy + 15} r={6.6} fill={skin.shade} />
      </G>
    );
  }

  function wavingArm() {
    return (
      <G>
        {/* left arm hangs, right arm raised ~45° */}
        {hangingArm('left')}
        <Path
          d={`M${shoulderRX},${SHOULDER_Y + 2} C${shoulderRX + 16},${SHOULDER_Y - 18} ${shoulderRX + 28},${SHOULDER_Y - 34} ${shoulderRX + 34},${SHOULDER_Y - 52}`}
          stroke={sleeve}
          strokeWidth={13}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d={`M${shoulderRX + 34},${SHOULDER_Y - 52} L${shoulderRX + 44},${SHOULDER_Y - 84}`}
          stroke={skin.base}
          strokeWidth={11}
          strokeLinecap="round"
        />
        <Circle cx={shoulderRX + 46} cy={SHOULDER_Y - 90} r={8.2} fill={skin.base} />
        <Path
          d={`M${shoulderRX + 42},${SHOULDER_Y - 96} L${shoulderRX + 38},${SHOULDER_Y - 106} M${shoulderRX + 48},${SHOULDER_Y - 98} L${shoulderRX + 48},${SHOULDER_Y - 109} M${shoulderRX + 53},${SHOULDER_Y - 95} L${shoulderRX + 57},${SHOULDER_Y - 104}`}
          stroke={skin.base}
          strokeWidth={3.4}
          strokeLinecap="round"
        />
      </G>
    );
  }

  switch (pose) {
    case 'hip':
      return handOnHip();
    case 'arms-crossed':
      return armsCrossed();
    case 'wave':
      return wavingArm();
    default:
      return (
        <G>
          {hangingArm('left')}
          {hangingArm('right')}
        </G>
      );
  }
}

export function Legs({
  skin,
  pants,
  height,
  build,
}: {
  skin: { base: string; shade: string };
  pants: { value: string; shade: string };
  height: BodyHeight;
  build: BodyBuild;
}) {
  const d = BUILDS[build];
  const ankle = legAnkle(height);
  const legL = CX - d.hip / 2 - 6;
  const legR = CX + d.hip / 2 + 6;
  const pantsEnd = ankle - 44; // mid-calf; skin below
  const legW = d.hip / 2 + 2;

  return (
    <G>
      {(['left', 'right'] as const).map((side) => {
        const x = side === 'left' ? legL : legR;
        return (
          <G key={side}>
            <Rect
              x={x - legW / 2}
              y={HIP_BOTTOM - 4}
              width={legW}
              height={pantsEnd - HIP_BOTTOM + 4}
              rx={legW / 3}
              fill={pants.value}
            />
            <Rect
              x={x - legW / 2 + 2}
              y={pantsEnd - 6}
              width={legW - 4}
              height={ankle - pantsEnd + 10}
              rx={(legW - 4) / 3}
              fill={skin.base}
            />
          </G>
        );
      })}
    </G>
  );
}

export function Shoes({
  style,
  color,
  skin,
  height,
  build,
}: {
  style: ShoeStyle;
  color: { value: string; shade: string };
  skin: { base: string; shade: string };
  height: BodyHeight;
  build: BodyBuild;
}) {
  const d = BUILDS[build];
  const ankle = legAnkle(height);
  const footY = ankle + 6;
  const legL = CX - d.hip / 2 - 6;
  const legR = CX + d.hip / 2 + 6;
  const footW = d.hip / 2 + 9;

  if (style === 'barefoot') {
    return (
      <G>
        {[legL, legR].map((x, i) => (
          <Ellipse key={i} cx={x + 3} cy={footY + 3} rx={footW / 2} ry={7} fill={skin.base} />
        ))}
      </G>
    );
  }

  if (style === 'sandals') {
    return (
      <G>
        {[legL, legR].map((x, i) => (
          <G key={i}>
            <Rect x={x - footW / 2} y={footY + 4} width={footW} height={6} rx={3} fill={color.shade} />
            <Path d={`M${x - footW / 2 + 3},${footY + 4} L${x + 2},${footY - 4} M${x + footW / 2 - 3},${footY + 4} L${x + 2},${footY - 4}`} stroke={color.value} strokeWidth={3} />
          </G>
        ))}
      </G>
    );
  }

  if (style === 'boots') {
    return (
      <G>
        {[legL, legR].map((x, i) => (
          <G key={i}>
            <Rect x={x - footW / 2 + 2} y={footY - 14} width={footW - 4} height={24} rx={4} fill={color.value} />
            <Rect x={x - footW / 2} y={footY + 4} width={footW + 6} height={8} rx={3} fill={color.shade} />
          </G>
        ))}
      </G>
    );
  }

  // sneakers
  return (
    <G>
      {[legL, legR].map((x, i) => (
        <G key={i}>
          <Rect x={x - footW / 2} y={footY - 4} width={footW} height={12} rx={6} fill={color.value} />
          <Rect x={x - footW / 2 - 2} y={footY + 6} width={footW + 6} height={5} rx={2.5} fill="#F4EFE2" />
        </G>
      ))}
    </G>
  );
}

/** Hijab robe: extends the head wrap into a full-length cover to the knees. */
function Robe({ color, height }: { color: string; height: BodyHeight }) {
  const hem = Math.min(legAnkle(height) - 46, 348);
  return (
    <Path
      d={`M60,${SHOULDER_Y - 8}
          C52,${SHOULDER_Y + 60} 48,${hem - 60} 50,${hem}
          C70,${hem + 10} 130,${hem + 10} 150,${hem}
          C152,${hem - 60} 148,${SHOULDER_Y + 60} 140,${SHOULDER_Y - 8}
          C128,${SHOULDER_Y + 10} 72,${SHOULDER_Y + 10} 60,${SHOULDER_Y - 8} Z`}
      fill={color}
    />
  );
}

/** Body composer: draws torso, legs, shoes, (robe), arms in z-order. */
export function Body({ config }: { config: AvatarConfig }) {
  const skin = skinTone(config.skin);
  const outfit = outfitColor(config.outfitColor);
  const pants = pantsColor(config.pantsColor);
  const shoesCol = shoesColor(config.shoesColor);
  const robeColor = hairColor(config.hairColor);
  const isHijab = config.hair === 'hijab';

  return (
    <G>
      <Torso build={config.bodyBuild} height={config.height} outfit={outfit} pants={pants} />
      <Legs skin={skin} pants={pants} height={config.height} build={config.bodyBuild} />
      <Shoes
        style={config.shoes}
        color={shoesCol}
        skin={skin}
        height={config.height}
        build={config.bodyBuild}
      />
      {isHijab ? <Robe color={robeColor} height={config.height} /> : null}
      <Arms skin={skin} sleeve={isHijab ? robeColor : outfit.value} pose={config.pose} build={config.bodyBuild} />
    </G>
  );
}
