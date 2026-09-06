/**
 * Unit tests for the chairman-gated QF hold: marker predicate, worker-lane exclusion,
 * and the release path.
 * SD: SD-LEO-INFRA-EXCLUDE-CHAIRMAN-GATED-001
 *
 * Chairman-gated QFs (owner='chairman' + release_condition — the QF-508/QF-970 class)
 * sat in the worker-facing open-QF lane as false open work; every idle worker burned a
 * claim/triage cycle re-concluding "blocked on chairman". These tests pin:
 *   - isChairmanGatedQF: case-insensitive owner + non-empty condition; fail-open on
 *     missing/null columns (TS-3, TR-2/TR-3),
 *   - loadOpenQuickFixes excludes marked rows, returns unmarked ones (TS-2),
 *   - releaseChairmanGatedQf clears the marker + stamps who/when/why, and REFUSES an
 *     unmarked row (TS-4/TS-5).
 * (worker-checkin's isAutoStartableQF clause reuses the same predicate module —
 * single-source parity is the design, pinned here via the predicate tests.)
 */
import { describe, test, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { isChairmanGatedQF, GATED_HOLD_COLUMNS } = require('../../../lib/fleet/qf-gated-hold.cjs');
import { loadOpenQuickFixes } from '../../../scripts/modules/sd-next/data-loaders.js';
import { releaseChairmanGatedQf } from '../../../scripts/release-chairman-gated-qf.js';

describe('isChairmanGatedQF (FR-1 marker predicate)', () => {
  test('matches owner case variants with a non-empty condition (TS-3)', () => {
    for (const owner of ['CHAIRMAN', 'chairman', 'Chairman', ' chairman ']) {
      expect(isChairmanGatedQF({ owner, release_condition: 'EU-send-planned' })).toBe(true);
    }
  });

  test('fail-open: missing/empty owner or condition is NOT gated (TR-3)', () => {
    expect(isChairmanGatedQF({ owner: 'chairman', release_condition: null })).toBe(false);
    expect(isChairmanGatedQF({ owner: 'chairman', release_condition: '   ' })).toBe(false);
    expect(isChairmanGatedQF({ owner: null, release_condition: 'x' })).toBe(false);
    expect(isChairmanGatedQF({ owner: 'coordinator', release_condition: 'x' })).toBe(false);
    expect(isChairmanGatedQF({})).toBe(false);
    expect(isChairmanGatedQF(null)).toBe(false);
    expect(isChairmanGatedQF(undefined)).toBe(false);
  });

  test('GATED_HOLD_COLUMNS names the columns the predicate reads', () => {
    expect(GATED_HOLD_COLUMNS).toEqual(['owner', 'release_condition']);
  });
});

describe('loadOpenQuickFixes worker-lane exclusion (FR-2 / TS-2)', () => {
  function mockSupabase(rows) {
    const chain = {
      select() { return chain; },
      in() { return chain; },
      is() { return chain; },
      order() { return chain; },
      limit() { return Promise.resolve({ data: rows, error: null }); },
    };
    return { from() { return chain; } };
  }

  test('marked rows excluded; unmarked rows returned', async () => {
    const rows = [
      { id: 'QF-GATED', status: 'open', owner: 'CHAIRMAN', release_condition: 'EU send planned' },
      { id: 'QF-NORMAL', status: 'open', owner: null, release_condition: null },
      { id: 'QF-OWNED-NO-COND', status: 'open', owner: 'chairman', release_condition: null },
    ];
    const result = await loadOpenQuickFixes(mockSupabase(rows));
    const ids = result.map((r) => r.id);
    expect(ids).not.toContain('QF-GATED');
    expect(ids).toContain('QF-NORMAL');
    expect(ids).toContain('QF-OWNED-NO-COND'); // no condition -> not gated (fail-open)
  });
});

describe('releaseChairmanGatedQf (FR-4 / TS-4, TS-5)', () => {
  function mockSupabase(row) {
    const updates = [];
    const readChain = {
      select() { return readChain; },
      eq() { return readChain; },
      maybeSingle() { return Promise.resolve({ data: row, error: null }); },
    };
    const updateChain = {
      update(p) { updates.push(p); return updateChain; },
      eq() { return updateChain; },
      // Concurrency guard (adversarial fix): the update is conditioned on the marker still
      // being present via .not('release_condition','is',null).
      not() { return updateChain; },
      select() { return updateChain; },
      maybeSingle() { return Promise.resolve({ data: { id: row.id, status: row.status, owner: null, release_condition: null }, error: null }); },
    };
    let call = 0;
    return {
      from() { call += 1; return call === 1 ? readChain : updateChain; },
      _updates: updates,
    };
  }

  test('clears the marker and stamps who/when/why into verification_notes (TS-4)', async () => {
    const client = mockSupabase({
      id: 'QF-X', status: 'open', owner: 'CHAIRMAN',
      release_condition: 'EU send planned', verification_notes: 'prior notes',
    });
    const result = await releaseChairmanGatedQf('QF-X', {
      reason: 'chairman approved (verbal)', releasingSessionId: 'sess-123', supabaseClient: client,
    });
    expect(result.owner).toBe(null);
    expect(result.release_condition).toBe(null);
    expect(client._updates).toHaveLength(1);
    const u = client._updates[0];
    expect(u.owner).toBe(null);
    expect(u.release_condition).toBe(null);
    expect(u.verification_notes).toContain('prior notes');
    expect(u.verification_notes).toContain('GATED-RELEASE');
    expect(u.verification_notes).toContain('sess-123');
    expect(u.verification_notes).toContain('chairman approved (verbal)');
  });

  test('refuses an unmarked row — no silent no-op (TS-5)', async () => {
    const client = mockSupabase({ id: 'QF-Y', status: 'open', owner: null, release_condition: null });
    await expect(releaseChairmanGatedQf('QF-Y', { reason: 'x', supabaseClient: client }))
      .rejects.toThrow(/does not carry the chairman-gated-hold marker/);
    expect(client._updates).toHaveLength(0);
  });

  test('refuses a missing --reason — the stamp is the audit trail', async () => {
    const client = mockSupabase({ id: 'QF-Z', status: 'open', owner: 'chairman', release_condition: 'c' });
    await expect(releaseChairmanGatedQf('QF-Z', { supabaseClient: client }))
      .rejects.toThrow(/--reason/);
  });

  // VALIDATION finding V-1 (SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001): isChairmanGatedQF is
  // prefix-agnostic and accepted that SD's oracle_read_pending marker (also owner='chairman'),
  // releasing it with none of that marker's own rules (bounded wait, consult-row citation).
  test('V-1: refuses an oracle_read_pending-marked row, routing the caller to release-oracle-hold.js instead', async () => {
    const client = mockSupabase({
      id: 'QF-ORACLE', status: 'open', owner: 'chairman',
      release_condition: '[oracle_read_pending] review_at=2026-09-01T00:00:00Z :: batch mint detected',
    });
    await expect(releaseChairmanGatedQf('QF-ORACLE', { reason: 'x', supabaseClient: client }))
      .rejects.toThrow(/release-oracle-hold\.js/);
    expect(client._updates).toHaveLength(0);
  });
});

// SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E (Child E) FR-4 / AC-9, AC-10: a chairman-label/
// provenance field (metadata.claim_history[].pick_reason, added by lib/fleet/claim-stamp.cjs +
// lib/fleet/qf-metadata-merge.mjs) must never alter isChairmanGatedQF's existing hard-exclusion
// -- this is a proof of NON-INTERFERENCE, not a new tripwire. The review_by/"review_at passed with
// no dispatch" check named in the parent SD's original success criteria is explicitly OUT OF
// SCOPE for this child (validation-agent 787c567b, Q8 deletion audit) and is deliberately absent
// from this file.
describe('isChairmanGatedQF non-interference with new provenance fields (Child E FR-4)', () => {
  const PROVENANCE = {
    metadata: {
      claim_history: [
        { session_id: 'sess-1', claimed_at: '2026-09-06T00:00:00.000Z', identity_source: 'env',
          pick_reason: { score: 'UNSCORED', components: {}, comparatorVersion: null } },
      ],
    },
  };

  // Representative shapes of the 3 live chairman-gated QF fixtures (owner casing varies).
  const GATED_FIXTURES = [
    { id: 'QF-20260713-970', owner: 'CHAIRMAN', release_condition: 'Chairman approves (verbal suffices) -> apply migration 031' },
    { id: 'QF-20260905-884', owner: 'chairman', release_condition: '[oracle_read_pending] review_at=2026-09-06T01:27:08.595Z consult=6155ae63 :: batch mint detected (group size 6)' },
    { id: 'QF-20260905-631', owner: 'chairman', release_condition: '[oracle_read_pending] review_at=2026-09-06T01:27:08.595Z consult=6155ae63 :: batch mint detected (group size 6)' },
  ];

  test('AC-9: all 3 live chairman-gated fixtures still gate identically with and without pick_reason/provenance present', () => {
    for (const fixture of GATED_FIXTURES) {
      const without = isChairmanGatedQF(fixture);
      const withProvenance = isChairmanGatedQF({ ...fixture, ...PROVENANCE });
      expect(without).toBe(true);
      expect(withProvenance).toBe(true);
      expect(withProvenance).toBe(without); // byte-identical verdict
    }
  });

  test('AC-10: a non-gated QF stays non-gated regardless of a provenance field', () => {
    const nonGated = { id: 'QF-NORMAL', owner: null, release_condition: null };
    expect(isChairmanGatedQF(nonGated)).toBe(false);
    expect(isChairmanGatedQF({ ...nonGated, ...PROVENANCE })).toBe(false);
  });

  test('AC-11: no review_by/review_at tripwire is exported by this module (explicitly out of scope)', () => {
    const require2 = require;
    const mod = require2('../../../lib/fleet/qf-gated-hold.cjs');
    expect(Object.keys(mod).sort()).toEqual(['GATED_HOLD_COLUMNS', 'isChairmanGatedQF']);
  });
});
