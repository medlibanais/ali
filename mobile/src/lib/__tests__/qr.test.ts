import { inFinder, qrMatrix } from '../qr';

describe('qrMatrix', () => {
  it('builds a square matrix with the three finder patterns', () => {
    const m = qrMatrix('prayerlock://add-friend?code=AB12CD');
    const n = m.length;
    expect(n).toBeGreaterThanOrEqual(21);
    expect((n - 17) % 4).toBe(0); // QR sizes are 17 + 4 * version
    m.forEach((row) => expect(row).toHaveLength(n));
    // Finder: dark outer ring, light ring, dark 3x3 center.
    for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      expect(m[r0][c0]).toBe(true);
      expect(m[r0 + 1][c0 + 1]).toBe(false);
      expect(m[r0 + 3][c0 + 3]).toBe(true);
    }
  });

  it('changes with the encoded text', () => {
    expect(qrMatrix('code=AAAA')).not.toEqual(qrMatrix('code=BBBB'));
  });
});

describe('inFinder', () => {
  it('marks only the three corners', () => {
    expect(inFinder(0, 0, 25)).toBe(true);
    expect(inFinder(6, 24, 25)).toBe(true);
    expect(inFinder(24, 6, 25)).toBe(true);
    expect(inFinder(24, 24, 25)).toBe(false);
    expect(inFinder(12, 12, 25)).toBe(false);
  });
});
