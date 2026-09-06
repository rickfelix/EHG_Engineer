/**
 * SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E (Child E) — pick_reason on stampClaim.
 *
 * TS-1: numeric-score path via an injected computePriorityScoreFn (comparator.cjs need not
 *       exist for this to pass — testing-agent finding e21a99e7, G2).
 * TS-2: UNSCORED fallback when no scoring function is available.
 * TS-6/AC-3: additive-only — existing entry keys (session_id, claimed_at, identity_source)
 *       are untouched; this file does NOT modify the 3 pre-existing claim_history suites.
 * TS-11: a NaN or thrown scoring function degrades to UNSCORED, never NaN/null in the JSON.
 * TS-13: legacy (no-pick_reason) entries are left untouched by a new stamp.
 * AC-6 / QF auto-detect: a QF-shaped ref routes through the QF-side merge, never the SD path.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampClaim, buildPickReason, UNSCORED_PICK_REASON, QF_ID_RE } from '../../../lib/fleet/claim-stamp.cjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SD_ID = 'bb4692db-732b-4719-ad79-595a5aa45f8e';

function mockSupabase(row) {
  const calls = { updates: [] };
  const client = {
    from(table) {
      return {
        select() {
          return { eq() { return { maybeSingle: async () => ({ data: row, error: null }) }; } };
        },
        update(payload) {
          calls.updates.push({ table, payload });
          return { eq: async () => ({ error: null }) };
        }
      };
    }
  };
  return { client, calls };
}

function makeMergeFn(row, calls) {
  return async (_sdKey, patch) => {
    row.metadata = { ...(row.metadata || {}), ...patch };
    calls.updates.push({ table: 'strategic_directives_v2', payload: { metadata: row.metadata } });
    return { merged: true };
  };
}

describe('QF_ID_RE', () => {
  it('matches QF-shaped refs only', () => {
    expect(QF_ID_RE.test('QF-20260906-123')).toBe(true);
    expect(QF_ID_RE.test('SD-LEO-INFRA-FOO-001')).toBe(false);
    expect(QF_ID_RE.test('bb4692db-732b-4719-ad79-595a5aa45f8e')).toBe(false);
  });
});

describe('buildPickReason', () => {
  it('returns UNSCORED_PICK_REASON when no scoring function is supplied', () => {
    expect(buildPickReason(null, { id: 'x' })).toEqual(UNSCORED_PICK_REASON);
    expect(buildPickReason(undefined, { id: 'x' })).toEqual(UNSCORED_PICK_REASON);
  });

  it('TS-1: builds a numeric score + components from an injected scoring function', () => {
    const fakeScoreFn = () => ({ score: 7.5, components: { criticality: 8, age: 3 }, comparatorVersion: '1.0.0' });
    const result = buildPickReason(fakeScoreFn, { id: 'x' });
    expect(result).toEqual({ score: 7.5, components: { criticality: 8, age: 3 }, comparatorVersion: '1.0.0' });
  });

  it('TS-2/TS-11: a scoring function returning a NaN score/component degrades to UNSCORED, never NaN or null', () => {
    const fakeScoreFn = () => ({ score: NaN, components: { criticality: NaN, age: 5 }, comparatorVersion: '1.0.0' });
    const result = buildPickReason(fakeScoreFn, { id: 'x' });
    expect(result.score).toBe('UNSCORED');
    expect(result.components.criticality).toBe('UNSCORED');
    expect(result.components.age).toBe(5);
    expect(JSON.stringify(result)).not.toMatch(/NaN|null.*criticality/);
  });

  it('TS-11: a throwing scoring function degrades to UNSCORED, never throws', () => {
    const throwingFn = () => { throw new Error('boom'); };
    expect(buildPickReason(throwingFn, { id: 'x' })).toEqual(UNSCORED_PICK_REASON);
  });

  it('a malformed (non-object) result degrades to UNSCORED', () => {
    expect(buildPickReason(() => null, { id: 'x' })).toEqual(UNSCORED_PICK_REASON);
    expect(buildPickReason(() => 42, { id: 'x' })).toEqual(UNSCORED_PICK_REASON);
  });
});

describe('stampClaim — pick_reason on the SD path', () => {
  // TESTING-AGENT FINDING (Child B CI run, 2026-09-06): this test originally asserted
  // "comparator.cjs is not present" by relying on it being ABSENT from the filesystem — true
  // only in the transient window before Child B (lib/priority/comparator.cjs) merged. Once
  // Child B ships, the DEFAULT (no-injection) path legitimately resolves the real module and
  // calls computePriorityScore(row, {}) with empty inputs, which is a DIFFERENT (but still
  // all-UNSCORED) shape than the frozen UNSCORED_PICK_REASON sentinel (real comparatorVersion,
  // real component keys, not an empty {}). Derives the expected shape from the real module so
  // this test tracks whatever comparator.cjs actually returns for empty inputs, rather than
  // re-encoding its internals as a second, driftable copy.
  it('TS-2: pick_reason reads all-UNSCORED via the real comparator.cjs when no leverage/criticality/alignment/age inputs are wired (default path, no injection)', async () => {
    const { computePriorityScore } = require('../../../lib/priority/comparator.cjs');
    const expectedShape = computePriorityScore({}, {});
    const row = { id: SD_ID, sd_key: 'SD-TEST-PICK-001', metadata: {} };
    const { client, calls } = mockSupabase(row);
    const entry = await stampClaim(client, 'SD-TEST-PICK-001', 'sess-new', 'env', makeMergeFn(row, calls));
    expect(entry).not.toBeNull();
    expect(entry.pick_reason).toEqual({
      score: expectedShape.score,
      components: expectedShape.components,
      comparatorVersion: expectedShape.comparatorVersion,
    });
  });

  it('TS-2 (defensive degrade): pick_reason falls back to the frozen UNSCORED_PICK_REASON sentinel when comparator.cjs genuinely cannot be resolved', async () => {
    const row = { id: SD_ID, sd_key: 'SD-TEST-PICK-001B', metadata: {} };
    const { client, calls } = mockSupabase(row);
    // Force the "module unavailable" branch deterministically (rather than relying on ambient
    // filesystem absence, which is no longer guaranteed once Child B has shipped) by injecting a
    // scoring function that itself behaves exactly like a failed resolution: buildPickReason's
    // contract is "no function supplied -> UNSCORED_PICK_REASON", and resolveScoreFn returns
    // exactly that shape when its dynamic import throws. A thrown scoreFn call collapses to the
    // same UNSCORED_PICK_REASON output via buildPickReason's own catch, exercising the identical
    // degrade path a genuinely-missing module would hit.
    const unresolvable = () => { throw new Error('MODULE_NOT_FOUND (simulated)'); };
    const entry = await stampClaim(
      client, 'SD-TEST-PICK-001B', 'sess-new', 'env', makeMergeFn(row, calls),
      { computePriorityScoreFn: unresolvable }
    );
    expect(entry).not.toBeNull();
    expect(entry.pick_reason).toEqual(UNSCORED_PICK_REASON);
  });

  it('TS-1: pick_reason carries a numeric score when a computePriorityScoreFn is injected via opts', async () => {
    const row = { id: SD_ID, sd_key: 'SD-TEST-PICK-002', metadata: {} };
    const { client, calls } = mockSupabase(row);
    const fakeScoreFn = () => ({ score: 6, components: { criticality: 6 }, comparatorVersion: '1.0.0' });
    const entry = await stampClaim(
      client, 'SD-TEST-PICK-002', 'sess-new', 'env', makeMergeFn(row, calls),
      { computePriorityScoreFn: fakeScoreFn }
    );
    expect(entry.pick_reason).toEqual({ score: 6, components: { criticality: 6 }, comparatorVersion: '1.0.0' });
  });

  it('AC-3: existing entry keys (session_id, claimed_at, identity_source) are unaffected by the additive pick_reason', async () => {
    const row = { id: SD_ID, sd_key: 'SD-TEST-PICK-003', metadata: {} };
    const { client, calls } = mockSupabase(row);
    const entry = await stampClaim(client, 'SD-TEST-PICK-003', 'sess-x', 'pointer_fallback', makeMergeFn(row, calls));
    expect(entry).toMatchObject({ session_id: 'sess-x', identity_source: 'pointer_fallback' });
    expect(entry.claimed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('TS-13: a legacy claim_history entry with no pick_reason is left untouched by a new stamp', async () => {
    const legacyEntry = { session_id: 'old-sess', claimed_at: '2026-06-01T00:00:00Z' };
    const row = { id: SD_ID, sd_key: 'SD-TEST-PICK-004', metadata: { claim_history: [legacyEntry] } };
    const { client, calls } = mockSupabase(row);
    // This test is about legacy-entry preservation, not comparator resolution -- inject a fixed
    // no-op scoring function so its expectation is decoupled from whether comparator.cjs happens
    // to exist on disk (Child B ships it as a real, permanent module going forward).
    await stampClaim(client, 'SD-TEST-PICK-004', 'sess-new', 'env', makeMergeFn(row, calls), { computePriorityScoreFn: () => null });
    const md = calls.updates[0].payload.metadata;
    expect(md.claim_history[0]).toEqual(legacyEntry); // untouched, no backfilled pick_reason
    expect(md.claim_history[1].pick_reason).toEqual(UNSCORED_PICK_REASON);
  });
});

describe('stampClaim — QF-shaped ref auto-detect (AC-6)', () => {
  it('routes a QF-shaped sdRef through the injected mergeQfMetadataFn, never touching the SD table', async () => {
    let sdTableTouched = false;
    const client = {
      from() { sdTableTouched = true; return { select() { return { eq() { return { maybeSingle: async () => ({ data: null, error: null }) }; } }; } }; }
    };
    let mergeCallArgs = null;
    const mergeQfMetadataFn = async (qfId, sessionId, entry) => {
      mergeCallArgs = { qfId, sessionId, entry };
      return { merged: true };
    };
    // This test is about QF-shaped routing, not comparator resolution -- inject a fixed no-op
    // scoring function so its expectation is decoupled from whether comparator.cjs happens to
    // exist on disk (Child B ships it as a real, permanent module going forward).
    const entry = await stampClaim(client, 'QF-20260906-1', 'sess-qf', 'env', null, { mergeQfMetadataFn, computePriorityScoreFn: () => null });
    expect(sdTableTouched).toBe(false);
    expect(entry).not.toBeNull();
    expect(entry.pick_reason).toEqual(UNSCORED_PICK_REASON);
    expect(mergeCallArgs.qfId).toBe('QF-20260906-1');
    expect(mergeCallArgs.sessionId).toBe('sess-qf');
  });

  it('returns null (fail-soft) when the QF-side merge reports column_absent (42703)', async () => {
    const client = {};
    const mergeQfMetadataFn = async () => ({ merged: false, reason: 'column_absent' });
    const entry = await stampClaim(client, 'QF-20260906-2', 'sess-qf', 'env', null, { mergeQfMetadataFn });
    expect(entry).toBeNull();
  });

  it('returns null (fail-soft) when the QF-side merge loses the compare-and-swap (TS-10)', async () => {
    const client = {};
    const mergeQfMetadataFn = async () => ({ merged: false, reason: 'cas_lost' });
    const entry = await stampClaim(client, 'QF-20260906-3', 'sess-qf', 'env', null, { mergeQfMetadataFn });
    expect(entry).toBeNull();
  });
});

// SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E (Child E) TS-7/AC-7 — testing-agent finding (evidence
// 77f22659): a behavioural test cannot exercise these two top-level scripts (real DB side
// effects, process.exit calls). Matching the repo's own established convention for exactly this
// situation (tests/unit/claim-liveness-fence-qf-surfaces-order.test.js's docblock), these are
// SOURCE-ORDER assertions — deliberately weaker than a behavioural test, but they DO catch the
// regression that matters: a future refactor silently deleting the stampClaim call at either site
// (dead-by-construction, invisible to every other test in the repo before this addition).
describe('stampClaim call sites are present and correctly ordered (TS-7/AC-7)', () => {
  it('lib/sd-creation/source-adapters/qf.js calls stampClaim in the born-claim success branch, after claim_sd', () => {
    const src = readSrc('lib/sd-creation/source-adapters/qf.js');
    const rpcIdx = src.indexOf("supabase.rpc('claim_sd'");
    const stampIdx = src.indexOf('stampClaim(supabase, sdKey, qfSession', rpcIdx);
    expect(rpcIdx, 'claim_sd call not found').toBeGreaterThan(-1);
    expect(stampIdx, 'stampClaim call not found after claim_sd').toBeGreaterThan(-1);
    expect(stampIdx, 'stampClaim must be called after claim_sd succeeds, never before or in place of it')
      .toBeGreaterThan(rpcIdx);
  });

  it('scripts/qf-start.js calls stampClaim after a successful claim_sd, before the claim is reported', () => {
    const src = readSrc('scripts/qf-start.js');
    const rpcIdx = src.indexOf("supabase.rpc('claim_sd'");
    const stampIdx = src.indexOf('stampClaim(supabase, qfId, sessionId', rpcIdx);
    const reportedIdx = src.indexOf('Quick-fix ${qfId} claimed', stampIdx);
    expect(rpcIdx, 'claim_sd call not found').toBeGreaterThan(-1);
    expect(stampIdx, 'stampClaim call not found after claim_sd').toBeGreaterThan(-1);
    expect(reportedIdx, 'success message not found after stampClaim').toBeGreaterThan(-1);
    expect(stampIdx, 'stampClaim must run after claim_sd succeeds').toBeGreaterThan(rpcIdx);
    expect(reportedIdx, 'stampClaim must run before the success message, matching the fail-soft try/catch placement')
      .toBeGreaterThan(stampIdx);
  });

  it('both scripts require lib/fleet/claim-stamp.cjs', () => {
    expect(readSrc('lib/sd-creation/source-adapters/qf.js')).toContain("require('../../fleet/claim-stamp.cjs')");
    expect(readSrc('scripts/qf-start.js')).toContain("'../lib/fleet/claim-stamp.cjs'");
  });
});
