jest.mock('../../../lib/supabase', () => ({ supabase: {} }));

// eslint-disable-next-line import/first
import {
  BAND_LABEL,
  explainPrediction,
  mapPrediction,
  predictionA11yLabel,
  streakBand,
} from '../streakPrediction';

const detail = {
  days: 30,
  active7: 5,
  window7: 7,
  active30: 20,
  weekdayActive: 3,
  weekdayTotal: 4,
  weekday: 1,
  activeToday: true,
};

describe('streakBand', () => {
  it('maps the probability to red / yellow / green bands', () => {
    expect(streakBand(null)).toBe('no_data');
    expect(streakBand(0)).toBe('high_risk');
    expect(streakBand(29)).toBe('high_risk');
    expect(streakBand(30)).toBe('moderate');
    expect(streakBand(69)).toBe('moderate');
    expect(streakBand(70)).toBe('on_track');
    expect(streakBand(100)).toBe('on_track');
    expect(streakBand(Number.NaN)).toBe('no_data');
  });

  it('uses the requested labels', () => {
    expect(BAND_LABEL.high_risk).toBe('High Risk');
    expect(BAND_LABEL.moderate).toBe('Moderate');
    expect(BAND_LABEL.on_track).toBe('On Track');
    expect(BAND_LABEL.no_data).toBe('Not enough data');
  });
});

describe('mapPrediction', () => {
  it('handles a missing row and a malformed detail', () => {
    expect(mapPrediction(null)).toEqual({ probability: null, forDay: null, updatedAt: null, detail: null });
    const m = mapPrediction({
      streak_probability: 42,
      streak_prediction_for: '2026-11-16',
      streak_prediction_at: '2026-11-15T22:35:00Z',
      streak_prediction_detail: { days: 'x' },
    });
    expect(m.probability).toBe(42);
    expect(m.detail).toBeNull();
  });
});

describe('explainPrediction', () => {
  it('explains a prediction in plain words', () => {
    const lines = explainPrediction({ probability: 81, forDay: '2026-11-16', updatedAt: null, detail });
    expect(lines).toEqual([
      'Active 5 of the last 7 days.',
      'Mondays: 3 of 4.',
      'Already done something today.',
    ]);
  });

  it('counts down to the first prediction', () => {
    const lines = explainPrediction({
      probability: null,
      forDay: null,
      updatedAt: null,
      detail: { ...detail, days: 4 },
    });
    expect(lines[1]).toBe('3 more days to go.');
    expect(explainPrediction({ probability: null, forDay: null, updatedAt: null, detail: null })[1]).toBe(
      '7 more days to go.',
    );
  });

  it('gives screen readers the number and the band', () => {
    expect(predictionA11yLabel({ probability: 12, forDay: null, updatedAt: null, detail: null })).toContain(
      '12 percent',
    );
    expect(predictionA11yLabel({ probability: 12, forDay: null, updatedAt: null, detail: null })).toContain(
      'High Risk',
    );
    expect(predictionA11yLabel({ probability: null, forDay: null, updatedAt: null, detail: null })).toContain(
      'not enough data',
    );
  });
});
