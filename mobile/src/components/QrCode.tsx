// QrCode: draws a QR code with react-native-svg. Data modules are one
// path; the three corner finders are drawn as rounded squares, which
// phone cameras read as well as square ones.

import React, { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { inFinder, qrMatrix } from '../lib/qr';

export interface QrCodeProps {
  value: string;
  size: number;
  color: string;
  background: string;
}

const QUIET = 2;

export function QrCode({ value, size, color, background }: QrCodeProps) {
  const matrix = useMemo(() => qrMatrix(value), [value]);
  const n = matrix.length;
  const d = useMemo(() => {
    const parts: string[] = [];
    matrix.forEach((row, r) =>
      row.forEach((dark, c) => {
        if (dark && !inFinder(r, c, n)) parts.push(`M${c + QUIET},${r + QUIET}h1v1h-1z`);
      }),
    );
    return parts.join('');
  }, [matrix, n]);
  const total = n + QUIET * 2;
  const finders: [number, number][] = [
    [QUIET, QUIET],
    [QUIET + n - 7, QUIET],
    [QUIET, QUIET + n - 7],
  ];
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${total} ${total}`} accessibilityLabel="QR code">
      <Rect x={0} y={0} width={total} height={total} rx={2} fill={background} />
      <Path d={d} fill={color} />
      {finders.map(([x, y]) => (
        <React.Fragment key={`${x}${y}`}>
          <Rect x={x} y={y} width={7} height={7} rx={2} fill={color} />
          <Rect x={x + 1} y={y + 1} width={5} height={5} rx={1.4} fill={background} />
          <Rect x={x + 2} y={y + 2} width={3} height={3} rx={0.9} fill={color} />
        </React.Fragment>
      ))}
    </Svg>
  );
}

export default QrCode;
