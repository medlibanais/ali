// QR matrix for a string (error correction M), as rows of booleans where
// true is a dark module. Rendering lives in components/QrCode.tsx.

import { create } from 'qrcode';

export function qrMatrix(text: string): boolean[][] {
  const { modules } = create(text, { errorCorrectionLevel: 'M' });
  const rows: boolean[][] = [];
  for (let r = 0; r < modules.size; r += 1) {
    const row: boolean[] = [];
    for (let c = 0; c < modules.size; c += 1) row.push(Boolean(modules.get(r, c)));
    rows.push(row);
  }
  return rows;
}

/** True for modules inside one of the three 7x7 corner finder patterns. */
export function inFinder(row: number, col: number, size: number): boolean {
  const near = (i: number) => i < 7;
  const far = (i: number) => i >= size - 7;
  return (near(row) && near(col)) || (near(row) && far(col)) || (far(row) && near(col));
}
