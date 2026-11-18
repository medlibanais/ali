// "Make it look like me": the server's id lists match the editor, an AI
// answer lands on the right fields, and polling stops when it should.

import {
  extractJson,
  parseSelfieResult,
  randomSelfieResult,
  SELFIE_OPTIONS,
  SELFIE_SYSTEM_PROMPT,
} from '../../../../supabase/functions/_shared/avatarSelfie';
import { VALID_OPTION_IDS } from '../options';
import { applySelfieResult, pollJob, readSelfieResult, resultNote, type JobRow, type SelfieResult } from '../selfie';
import { DEFAULT_AVATAR, type AvatarConfig } from '../types';

const FIELD_TO_EDITOR = {
  sex: 'sex',
  skinTone: 'skin',
  hairStyle: 'hair',
  hairColor: 'hairColor',
  eyeColor: 'eyeColor',
  glasses: 'glasses',
} as const;

describe('server catalog matches the editor', () => {
  it.each(Object.entries(FIELD_TO_EDITOR))('%s ids exist in the editor', (field, editorKey) => {
    const ids = SELFIE_OPTIONS[field as keyof typeof FIELD_TO_EDITOR].map((o) => o.id);
    for (const id of ids) expect(VALID_OPTION_IDS[editorKey]).toContain(id);
  });

  it('offers every hairstyle, skin tone and pair of glasses the editor has', () => {
    expect(SELFIE_OPTIONS.hairStyle.map((o) => o.id).sort()).toEqual([...VALID_OPTION_IDS.hair].sort());
    expect(SELFIE_OPTIONS.skinTone.map((o) => o.id).sort()).toEqual([...VALID_OPTION_IDS.skin].sort());
    expect(SELFIE_OPTIONS.glasses.map((o) => o.id).sort()).toEqual([...VALID_OPTION_IDS.glasses].sort());
  });

  it('asks for the interface fields in the prompt', () => {
    for (const key of ['skinTone', 'hairStyle', 'hairColor', 'glasses', 'facialHair']) expect(SELFIE_SYSTEM_PROMPT).toContain(key);
  });
});

describe('parsing the model answer', () => {
  const good = { sex: 'male', skinTone: 'olive', hairStyle: 'short04', hairColor: 'black', eyeColor: 'brown', glasses: 'glasses_slim', facialHair: 'beard' };

  it('reads JSON wrapped in prose or code fences', () => {
    expect(extractJson('Here you go:\n```json\n' + JSON.stringify(good) + '\n```')).toEqual(good);
    expect(extractJson('no json here')).toBeNull();
  });

  it('keeps valid ids and accepts labels in place of ids', () => {
    expect(parseSelfieResult(good)).toEqual(good);
    expect(parseSelfieResult({ ...good, hairStyle: 'Cropped' })?.hairStyle).toBe('short04');
  });

  it('defaults bad optional fields and rejects missing core fields', () => {
    const r = parseSelfieResult({ ...good, eyeColor: 'purple-ish', glasses: 'monocle', facialHair: 'goatee' });
    expect(r).toMatchObject({ eyeColor: 'brown', glasses: 'none', facialHair: 'none' });
    expect(parseSelfieResult({ ...good, hairStyle: 'mohawk' })).toBeNull();
    expect(parseSelfieResult({ error: 'no_face' })).toBeNull();
    expect(parseSelfieResult(null)).toBeNull();
  });

  it('random fallback only uses valid ids', () => {
    for (let i = 0; i < 200; i += 1) {
      const r = randomSelfieResult();
      expect(parseSelfieResult(r)).toEqual(r);
    }
  });
});

describe('applying a result to the editor', () => {
  const result: SelfieResult = {
    sex: 'male', skinTone: 'deep-1', hairStyle: 'spiky', hairColor: 'near-black', eyeColor: 'dark-brown',
    glasses: 'glasses_bold', facialHair: 'beard', source: 'ai',
  };

  it('changes only what the photo can tell and fits clothes to the body', () => {
    const base: AvatarConfig = { ...DEFAULT_AVATAR, sliders: { muscle: 0.4 } };
    const next = applySelfieResult(base, result);
    expect(next).toMatchObject({ sex: 'male', skin: 'deep-1', hair: 'spiky', hairColor: 'near-black', eyeColor: 'dark-brown', glasses: 'glasses_bold' });
    expect(next.sliders).toEqual({ muscle: 0.4 });
    expect(next.pose).toBe(base.pose);
    for (const key of ['outfit', 'top', 'bottom', 'shoes', 'bodyType'] as const) expect(VALID_OPTION_IDS[key]).toContain(next[key]);
  });

  it('never writes an unknown id', () => {
    const next = applySelfieResult(DEFAULT_AVATAR, { ...result, sex: 'robot', hairStyle: 'mohawk' });
    expect(next.sex).toBe(DEFAULT_AVATAR.sex);
    expect(next.hair).toBe(DEFAULT_AVATAR.hair);
    expect(next.skin).toBe('deep-1');
  });

  it('reads stored JSON safely and explains limits', () => {
    expect(readSelfieResult('nope')).toBeNull();
    expect(readSelfieResult({ ...result, facialHair: 'x', source: 'other' })).toMatchObject({ facialHair: 'none', source: 'random' });
    expect(resultNote(result, null)).toContain('cannot show a beard');
    expect(resultNote(null, 'timeout')).toContain('random start');
    expect(resultNote({ ...result, source: 'random' }, 'groq_rate_limited')).toContain('busy');
  });
});

describe('polling the job', () => {
  function fakeClock() {
    let t = 0;
    return { now: () => t, sleep: async (ms: number) => { t += ms; } };
  }

  it('polls every 3 seconds until completed, and kicks the function once if still pending', async () => {
    const clock = fakeClock();
    const rows: JobRow[] = [
      { id: 'j', status: 'pending', result_config: null, error: null },
      { id: 'j', status: 'pending', result_config: null, error: null },
      { id: 'j', status: 'pending', result_config: null, error: null },
      { id: 'j', status: 'processing', result_config: null, error: null },
      { id: 'j', status: 'completed', result_config: { sex: 'female', source: 'ai' }, error: null },
    ];
    const seenAt: number[] = [];
    const kick = jest.fn(async () => undefined);
    const out = await pollJob('j', { fetchJob: async () => { seenAt.push(clock.now()); return rows.shift() ?? null; }, kick, ...clock });
    expect(out.kind).toBe('completed');
    expect(seenAt).toEqual([0, 3000, 6000, 9000, 12000]);
    expect(kick).toHaveBeenCalledTimes(1);
  });

  it('gives up after 60 seconds', async () => {
    const clock = fakeClock();
    const out = await pollJob('j', { fetchJob: async () => ({ id: 'j', status: 'processing', result_config: null, error: null }), kick: async () => undefined, ...clock });
    expect(out.kind).toBe('timeout');
    expect(clock.now()).toBe(60000);
  });

  it('survives a dropped poll, reports failure, and stops when cancelled', async () => {
    const clock = fakeClock();
    let calls = 0;
    const failed = await pollJob('j', {
      fetchJob: async () => {
        calls += 1;
        if (calls === 1) throw new Error('offline');
        return { id: 'j', status: 'failed', result_config: null, error: 'internal' };
      },
      kick: async () => undefined,
      ...clock,
    });
    expect(failed).toEqual({ kind: 'failed', error: 'internal' });

    let cancelled = false;
    const out = await pollJob('j', {
      fetchJob: async () => { cancelled = true; return { id: 'j', status: 'pending', result_config: null, error: null }; },
      kick: async () => undefined,
      ...clock,
    }, { isCancelled: () => cancelled });
    expect(out.kind).toBe('cancelled');
  });
});
