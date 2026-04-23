// SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-001: unit tests for the cumulative
// range coverage helpers in sd-key-generator.js (replaces the legacy
// readCount >= 3 heuristic with a precise ≥95% coverage check).

import test from 'node:test';
import assert from 'node:assert/strict';
import { unionRangeCoverage } from '../../scripts/modules/sd-key-generator.js';

test('unionRangeCoverage: two non-overlapping ranges covering 100%', () => {
  const r = unionRangeCoverage(
    [{ offset: 1, limit: 500 }, { offset: 501, limit: 500 }],
    1000
  );
  assert.equal(r.covered, 1000);
  assert.equal(r.uncovered.length, 0);
});

test('unionRangeCoverage: overlapping ranges dedup correctly', () => {
  const r = unionRangeCoverage(
    [{ offset: 1, limit: 600 }, { offset: 401, limit: 600 }],
    1000
  );
  assert.equal(r.covered, 1000);
  assert.equal(r.uncovered.length, 0);
});

test('unionRangeCoverage: partial coverage reports uncovered tail', () => {
  const r = unionRangeCoverage([{ offset: 1, limit: 400 }], 1000);
  assert.equal(r.covered, 400);
  assert.deepEqual(r.uncovered, [{ from: 401, to: 1000 }]);
});

test('unionRangeCoverage: empty ranges → 0% coverage', () => {
  const r = unionRangeCoverage([], 1000);
  assert.equal(r.covered, 0);
  assert.deepEqual(r.uncovered, [{ from: 1, to: 1000 }]);
});

test('unionRangeCoverage: gap in the middle is reported', () => {
  const r = unionRangeCoverage(
    [{ offset: 1, limit: 200 }, { offset: 501, limit: 500 }],
    1000
  );
  assert.equal(r.covered, 700);
  assert.deepEqual(r.uncovered, [{ from: 201, to: 500 }]);
});

test('unionRangeCoverage: range extends past totalLines is clipped', () => {
  const r = unionRangeCoverage([{ offset: 900, limit: 500 }], 1000);
  assert.equal(r.covered, 101); // lines 900..1000 inclusive
});

test('unionRangeCoverage: null/undefined inputs degrade safely', () => {
  const r1 = unionRangeCoverage(null, 1000);
  assert.equal(r1.covered, 0);
  const r2 = unionRangeCoverage([{ offset: 1, limit: 500 }], 0);
  assert.equal(r2.covered, 0);
});

test('unionRangeCoverage: adjacent ranges merge (no double-count)', () => {
  const r = unionRangeCoverage(
    [{ offset: 1, limit: 500 }, { offset: 500, limit: 500 }],
    1000
  );
  // offset=500 + limit=500 → lines 500..999; merged with 1..500 → 1..999
  assert.equal(r.covered, 999);
});

test('unionRangeCoverage: offset 0 is treated as line 1', () => {
  const r = unionRangeCoverage([{ offset: 0, limit: 500 }], 1000);
  assert.equal(r.covered, 500);
});

test('unionRangeCoverage: real scenario — 2 partial reads on CLAUDE_CORE.md (1419 lines)', () => {
  // Simulates: Read(offset=1, limit=800) then Read(offset=800, limit=1200)
  // Expected: 100% coverage of the 1419-line file (overlaps + extends past end).
  const r = unionRangeCoverage(
    [{ offset: 1, limit: 800 }, { offset: 800, limit: 1200 }],
    1419
  );
  assert.equal(r.covered, 1419);
  assert.equal(r.uncovered.length, 0);
});
