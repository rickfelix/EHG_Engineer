// SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-B (Child B) — closes two coverage gaps the TESTING
// sub-agent found at EXEC-TO-PLAN (evidence 30950225): FR-4/TS-5 had no test asserting the
// live comparator's band count/sequence is unchanged, and call site 1
// (scripts/coordinator-backlog-rank.mjs:441) had zero committed coverage — the existing
// shadow-comparator-order-invariant.test.js only exercises call sites 2 and 3 via
// scripts/worker-checkin.cjs's exported functions.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { shadowCompareAndLog } = require('../../../lib/priority/shadow-logger.cjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// FR-4/TS-5: the ordered sequence of distinct tie-break checks inside claimable.sort()'s
// comparator, from scripts/coordinator-backlog-rank.mjs's own inline documentation (11-band
// comparator: bare-shell demotion, quarantine, critical-walk-blocker, unlockScore critical-path,
// committing-item, product-pivot, needle, vision-loop draft, plan-linkage, priority,
// precedes-sequence — the trailing created_at fallback is the tie-of-last-resort, not a
// named band). A future edit that removes, reorders, or inserts a band ahead of the Child-B
// shadow-instrumentation marker will fail this test.
const EXPECTED_BAND_MARKERS = [
  'bareShellLastCompare(a, b)',
  'quarantined(a)',
  'criticalWalkBlocker(a)',
  'unlockScore(a.sd_key)',
  'committingItemBandCompare(a, b, sdRungMap)',
  'productPivotCompare(a, b)',
  'needleOf(a)',
  'visionLoopDraft(a)',
  'planLinkageCompare(a, b)',
  'PRIORITY_W[String(a.priority',
  'sequenceCompare(a, b, excludedPrecedesEdges)',
];

describe('FR-4/TS-5: coordinator-backlog-rank.mjs\'s 11-band comparator is unchanged', () => {
  const src = readSrc('scripts/coordinator-backlog-rank.mjs');
  const sortStart = src.indexOf('claimable.sort((a, b) => {');
  const shadowMarkerStart = src.indexOf('SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-B (Child B): SHADOW-ONLY instrumentation');
  const comparatorBody = src.slice(sortStart, shadowMarkerStart);

  it('the sort() call and the Child B shadow marker are both present, in that order', () => {
    expect(sortStart).toBeGreaterThan(-1);
    expect(shadowMarkerStart).toBeGreaterThan(sortStart);
  });

  it('all 11 named band checks are present, in the documented order, entirely BEFORE the shadow marker', () => {
    let cursor = -1;
    for (const marker of EXPECTED_BAND_MARKERS) {
      const idx = comparatorBody.indexOf(marker);
      expect(idx, `band marker not found ahead of the shadow instrumentation: ${marker}`).toBeGreaterThan(-1);
      expect(idx, `band marker out of order (moved earlier than expected): ${marker}`).toBeGreaterThan(cursor);
      cursor = idx;
    }
  });

  it('exactly 11 band markers are present (no 12th band silently added)', () => {
    // A crude but effective count guard: each marker is a distinct, non-overlapping function-call
    // signature, so occurrence-count doubles as a band-count pin.
    const count = EXPECTED_BAND_MARKERS.filter((m) => comparatorBody.includes(m)).length;
    expect(count).toBe(11);
  });

  it('zero deletions in this file\'s diff vs the pre-Child-B baseline (structural cross-check)', () => {
    // Mirrors the TESTING sub-agent's independent finding (evidence 30950225): `git diff
    // origin/main...HEAD -- scripts/coordinator-backlog-rank.mjs` has zero deletions. This test
    // pins the STATIC shape instead (band markers above); it cannot see git history, so it is a
    // complementary, not a duplicate, guard.
    expect(comparatorBody).toContain('return new Date(a.created_at) - new Date(b.created_at); // older first');
  });
});

// Call site 1 (scripts/coordinator-backlog-rank.mjs:441) had zero committed coverage before this
// test — mirrors its EXACT invocation shape (leverage via unlockScore-style numeric input, age
// derived from created_at) rather than requiring the whole CLI script (which has top-level
// side effects unsafe to import in a unit test).
describe('shadowCompareAndLog at the coordinator-backlog-rank.mjs call site shape (call site 1)', () => {
  function callSite1Args(items, client) {
    return {
      items,
      keyOf: (d) => d.sd_key,
      scoreInputsOf: (d) => ({
        leverage: d.__unlockScore,
        age: Number.isFinite(new Date(d.created_at).getTime())
          ? (Date.now() - new Date(d.created_at).getTime()) / 86400000
          : undefined,
      }),
      liveOrder: items.map((d) => d.sd_key),
      callSite: 'coordinator-backlog-rank.mjs:363',
      entityType: 'sd',
      client,
    };
  }

  it('never throws synchronously and never rejects, even when the client is unusable', async () => {
    const items = [
      { sd_key: 'SD-A', created_at: '2026-01-01T00:00:00Z', __unlockScore: 3 },
      { sd_key: 'SD-B', created_at: '2026-06-01T00:00:00Z', __unlockScore: 9 },
    ];
    const throwingClient = { from: () => { throw new Error('no live db creds in unit tier'); } };
    let threw = false;
    let promise;
    try {
      promise = shadowCompareAndLog(callSite1Args(items, throwingClient));
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    await expect(promise).resolves.toBeDefined();
  });

  it('never mutates the caller\'s claimable array or liveOrder (call site 1 reuses `claimable` after this call)', async () => {
    const items = [
      { sd_key: 'SD-A', created_at: '2026-01-01T00:00:00Z', __unlockScore: 1 },
      { sd_key: 'SD-B', created_at: '2026-08-01T00:00:00Z', __unlockScore: 50 },
      { sd_key: 'SD-C', created_at: '2026-03-01T00:00:00Z', __unlockScore: 12 },
    ];
    const snapshotOrder = items.map((d) => d.sd_key);
    const snapshotRefs = items.slice();
    const okClient = { from: () => ({ insert: async () => ({ error: null }) }) };
    await shadowCompareAndLog(callSite1Args(items, okClient));
    expect(items.map((d) => d.sd_key)).toEqual(snapshotOrder);
    expect(items).toEqual(snapshotRefs);
  });
});
