import {
  arcPoint,
  DURATION,
  originVector,
  rubberBand,
  staggerDelay,
  stretchScale,
} from '../motion';

describe('motion rules', () => {
  it('keeps everyday durations under 300 ms', () => {
    for (const ms of Object.values(DURATION)) expect(ms).toBeLessThanOrEqual(300);
  });

  it('staggers rows but caps the wait', () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(2)).toBe(70);
    expect(staggerDelay(50)).toBe(staggerDelay(6));
    expect(staggerDelay(1, 40, 6, 100)).toBe(140);
    expect(staggerDelay(-3)).toBe(0);
  });

  it('rubber bands: resists more the further you pull, never past the limit', () => {
    expect(rubberBand(0, 60)).toBe(0);
    const a = rubberBand(20, 60);
    const b = rubberBand(200, 60);
    const c = rubberBand(5000, 60);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(20);
    expect(b).toBeGreaterThan(a);
    expect(b - a).toBeLessThan(200 - 20);
    expect(c).toBeLessThan(60);
    expect(rubberBand(-200, 60)).toBeCloseTo(-b);
    expect(rubberBand(Number.NaN, 60)).toBe(0);
  });

  it('stretches along the motion and squashes across it', () => {
    expect(stretchScale(0, 60)).toEqual([1, 1]);
    const [along, across] = stretchScale(60, 60);
    expect(along).toBeCloseTo(1.18);
    expect(across).toBeLessThan(1);
    expect(stretchScale(600, 60)[0]).toBeCloseTo(1.18);
  });

  it('flies in an arc: same ends as a straight line, bowed in the middle', () => {
    expect(arcPoint(200, 0, 1)).toEqual({ x: 200, y: expect.closeTo(0, 6) });
    expect(arcPoint(200, 0, 0)).toEqual({ x: 0, y: expect.closeTo(0, 6) });
    const mid = arcPoint(200, 0, 0.5);
    expect(mid.x).toBeCloseTo(100);
    // Sideways flights bulge upward (negative y).
    expect(mid.y).toBeLessThan(-10);
    // Lift is capped.
    expect(Math.abs(arcPoint(4000, 0, 0.5).y)).toBeLessThanOrEqual(90);
    expect(arcPoint(0, 0, 0.5)).toEqual({ x: 0, y: 0 });
  });

  it('points toward the pillar a list belongs to', () => {
    expect(originVector(0, 10)).toEqual({ x: 10, y: 0 });
    expect(originVector(-90, 10)).toEqual({ x: 0, y: -10 });
    expect(originVector(198, 10).x).toBeLessThan(0);
  });
});
