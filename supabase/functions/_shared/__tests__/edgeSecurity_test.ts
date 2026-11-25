import assert from 'node:assert/strict';
import { matchesConfiguredSecret } from '../configuredSecret.ts';
import { parseSearchInput } from '../../search-quests/input.ts';

Deno.test('privileged handlers require a configured secret and reject the retired default', () => {
  const retiredDefault = 'prayerlock-dev-cron-secret';
  assert.equal(matchesConfiguredSecret(retiredDefault, undefined), false);
  assert.equal(matchesConfiguredSecret(retiredDefault, retiredDefault), false);
  assert.equal(matchesConfiguredSecret('', ''), false);
  assert.equal(matchesConfiguredSecret(' ', ' '), false);
  assert.equal(matchesConfiguredSecret(null, 'fixture-secret'), false);
  assert.equal(matchesConfiguredSecret('fixture-secrex', 'fixture-secret'), false);
  assert.equal(matchesConfiguredSecret('fixture-secret', 'fixture-secret'), true);
});

Deno.test('quest search validates JSON shape and bounds before embedding', () => {
  for (const body of [null, [], 'walk', {}, { query: 2 }]) {
    assert.deepEqual(parseSearchInput(body), { error: 'invalid_body' });
  }
  assert.deepEqual(parseSearchInput({ query: ' x ' }), { error: 'query_too_short' });
  assert.deepEqual(parseSearchInput({ query: 'x'.repeat(201) }), { error: 'query_too_long' });
  for (const limit of [0, 21, 1.5, '5', null, Infinity]) {
    assert.deepEqual(parseSearchInput({ query: 'walk', limit }), { error: 'invalid_limit' });
  }
  assert.deepEqual(parseSearchInput({ query: ' walk ' }), { query: 'walk', limit: 5 });
  assert.deepEqual(parseSearchInput({ query: 'walk', limit: 20 }), { query: 'walk', limit: 20 });
});
