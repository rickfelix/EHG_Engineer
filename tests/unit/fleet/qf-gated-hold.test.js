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
      select() { return updateChain; },
      single() { return Promise.resolve({ data: { id: row.id, status: row.status, owner: null, release_condition: null }, error: null }); },
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
});
