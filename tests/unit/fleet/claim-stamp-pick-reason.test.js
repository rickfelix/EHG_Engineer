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
import { stampClaim, buildPickReason, UNSCORED_PICK_REASON, QF_ID_RE } from '../../../lib/fleet/claim-stamp.cjs';

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
  it('TS-2: pick_reason reads UNSCORED when comparator.cjs is not present (default path, no injection)', async () => {
    const row = { id: SD_ID, sd_key: 'SD-TEST-PICK-001', metadata: {} };
    const { client, calls } = mockSupabase(row);
    const entry = await stampClaim(client, 'SD-TEST-PICK-001', 'sess-new', 'env', makeMergeFn(row, calls));
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
    await stampClaim(client, 'SD-TEST-PICK-004', 'sess-new', 'env', makeMergeFn(row, calls));
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
    const entry = await stampClaim(client, 'QF-20260906-1', 'sess-qf', 'env', null, { mergeQfMetadataFn });
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
