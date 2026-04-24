// Tests for leo-create-sd.js FR3 helpers — SD-LEO-INFRA-CREATION-PARSER-HARDENING-001.
// Covers AC-3a through AC-3d from the PRD. --priority CLI flag and priority threading
// are exercised end-to-end by the round-trip integration test (scripts/__tests__/sd-creation-roundtrip.test.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDependencyForDisplay } from './leo-create-sd.js';

// ---------- formatDependencyForDisplay (FR3, AC-3) ----------

test('formatDependencyForDisplay: AC-3a — canonical {type, dependency, dependency_id} shape', () => {
  const dep = { type: 'sd', dependency: 'SD-X-001', dependency_id: '11111111-2222-3333-4444-555555555555' };
  assert.equal(formatDependencyForDisplay(dep), 'SD-X-001');
});

test('formatDependencyForDisplay: AC-3b — legacy {sd_id} shape preserved', () => {
  assert.equal(formatDependencyForDisplay({ sd_id: 'SD-Y-002' }), 'SD-Y-002');
});

test('formatDependencyForDisplay: sd_key shape', () => {
  assert.equal(formatDependencyForDisplay({ sd_key: 'SD-Z-003' }), 'SD-Z-003');
});

test('formatDependencyForDisplay: id (UUID) shape', () => {
  assert.equal(formatDependencyForDisplay({ id: 'uuid-1234' }), 'uuid-1234');
});

test('formatDependencyForDisplay: AC-3c — malformed object uses JSON.stringify, NEVER "[object Object]"', () => {
  const out = formatDependencyForDisplay({ foo: 'bar' });
  assert.equal(out, '{"foo":"bar"}');
  assert.notEqual(out, '[object Object]');
});

test('formatDependencyForDisplay: priority order — dependency > sd_key > sd_id > id', () => {
  const full = { dependency: 'D', sd_key: 'K', sd_id: 'S', id: 'I' };
  assert.equal(formatDependencyForDisplay(full), 'D');
  const noDep = { sd_key: 'K', sd_id: 'S', id: 'I' };
  assert.equal(formatDependencyForDisplay(noDep), 'K');
  const sdIdOnly = { sd_id: 'S', id: 'I' };
  assert.equal(formatDependencyForDisplay(sdIdOnly), 'S');
  const idOnly = { id: 'I' };
  assert.equal(formatDependencyForDisplay(idOnly), 'I');
});

test('formatDependencyForDisplay: bare string input passes through', () => {
  assert.equal(formatDependencyForDisplay('SD-PLAIN-001'), 'SD-PLAIN-001');
});

test('formatDependencyForDisplay: null/undefined safe', () => {
  assert.equal(formatDependencyForDisplay(null), 'null');
  assert.equal(formatDependencyForDisplay(undefined), 'null');
});

test('formatDependencyForDisplay: empty object falls to JSON.stringify', () => {
  assert.equal(formatDependencyForDisplay({}), '{}');
});

test('formatDependencyForDisplay: does NOT produce "[object Object]" for any reasonable input', () => {
  const shapes = [
    { type: 'sd', dependency: 'A', dependency_id: 'x' },
    { sd_key: 'B' },
    { sd_id: 'C' },
    { id: 'D' },
    { random_field: 'E' },
    { nested: { a: 1 } },
  ];
  for (const s of shapes) {
    const out = formatDependencyForDisplay(s);
    assert.notEqual(out, '[object Object]', `input ${JSON.stringify(s)} must not produce "[object Object]"`);
  }
});
