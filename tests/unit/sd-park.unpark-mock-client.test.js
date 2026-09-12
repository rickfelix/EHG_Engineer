/**
 * Mock-pg-client unit tests for lib/sd-park.js unpark()'s DB-interaction behavior
 * (the TOCTOU guard and zero-row throw) — runnable WITHOUT a real DB.
 *
 * SD-LEO-INFRA-DEFERRED-STATE-ENTRANCE-001 (SECURITY EXEC-TO-PLAN re-verification,
 * evidence 0de98dc6-8057-4845-90a1-f0a4a88a6fbb, residual D2): the real DB-tier
 * integration file (tests/integration/sd-park.test.js) reports 13 skipped in this
 * environment, so unpark()'s `WHERE sd_key=$1 AND status=$6` guard and its
 * throw-on-zero-rows behavior had zero runnable regression coverage. This file closes
 * that gap with a mock client instead of extracting more pure logic out of unpark()
 * itself (the DB write IS the thing under test here).
 */
import { describe, it, expect } from 'vitest';
import { unpark, checkUnparkHold, PARK_STATUS } from '../../lib/sd-park.js';

function makeMockClient({ selectResult, updateResult }) {
  const queries = [];
  return {
    queries,
    async query(sql, params) {
      queries.push({ sql, params });
      if (typeof sql === 'string' && sql.trim().toUpperCase().startsWith('SELECT')) {
        return { rows: selectResult };
      }
      // UPDATE
      return { rows: updateResult };
    },
  };
}

describe('unpark() — mock-client DB-interaction behavior (TOCTOU guard)', () => {
  it('the UPDATE query binds WHERE sd_key=$1 AND status=$6 with PARK_STATUS as the bound value', async () => {
    const client = makeMockClient({
      selectResult: [{ sd_key: 'SD-X', status: PARK_STATUS, metadata: { parked_from_status: 'active' } }],
      updateResult: [{ status: 'active' }],
    });

    await unpark(client, 'SD-X', { reason: 'r', actor: 'PLAN' });

    const updateCall = client.queries.find((q) => q.sql.trim().toUpperCase().startsWith('UPDATE'));
    expect(updateCall).toBeTruthy();
    expect(updateCall.sql).toMatch(/WHERE sd_key=\$1 AND status=\$6/);
    expect(updateCall.params[5]).toBe(PARK_STATUS);
    expect(updateCall.params[0]).toBe('SD-X');
  });

  it('throws when the UPDATE affects zero rows (row was no longer parked — TOCTOU race caught)', async () => {
    const client = makeMockClient({
      selectResult: [{ sd_key: 'SD-X', status: PARK_STATUS, metadata: { parked_from_status: 'active' } }],
      updateResult: [], // simulates a concurrent writer having changed status before this UPDATE ran
    });

    await expect(unpark(client, 'SD-X', { reason: 'r', actor: 'PLAN' })).rejects.toThrow(/no longer parked/i);
  });

  it('never issues an UPDATE at all when computeUnparkPlan itself refuses (e.g. missing parked_from_status)', async () => {
    const client = makeMockClient({
      selectResult: [{ sd_key: 'SD-X', status: PARK_STATUS, metadata: {} }],
      updateResult: [{ status: 'draft' }],
    });

    await expect(unpark(client, 'SD-X', { reason: 'r', actor: 'PLAN' })).rejects.toThrow(/--restore/);

    const updateCall = client.queries.find((q) => q.sql.trim().toUpperCase().startsWith('UPDATE'));
    expect(updateCall).toBeUndefined();
  });

  it('never issues an UPDATE when computeUnparkPlan refuses on an invalid --restore value', async () => {
    const client = makeMockClient({
      selectResult: [{ sd_key: 'SD-X', status: PARK_STATUS, metadata: {} }],
      updateResult: [{ status: 'completed' }],
    });

    await expect(
      unpark(client, 'SD-X', { reason: 'r', actor: 'PLAN', restoreStatus: 'completed' }),
    ).rejects.toThrow(/UNPARK_RESTORE_STATUS_INVALID|not a workable status/);

    const updateCall = client.queries.find((q) => q.sql.trim().toUpperCase().startsWith('UPDATE'));
    expect(updateCall).toBeUndefined();
  });

  it('reports the actual persisted status from RETURNING, not the requested target (edge-case truthful contract)', async () => {
    const client = makeMockClient({
      selectResult: [{ sd_key: 'SD-X', status: PARK_STATUS, metadata: { parked_from_status: 'in_progress', parked_progress_original: 100 } }],
      updateResult: [{ status: 'pending_approval' }], // auto_transition_status flipped it
    });

    const res = await unpark(client, 'SD-X', { reason: 'r', actor: 'PLAN' });
    expect(res.status).toBe('pending_approval');
    expect(res.requested).toBe('in_progress');
  });
});

describe('checkUnparkHold (QF-20260912-346) — is this hold someone else\'s to release?', () => {
  it('a park with no recorded session and no role-seat parked_by is nobody\'s in particular — not refused', () => {
    expect(checkUnparkHold({ metadata: { parked_from_status: 'active' } }, { writingSessionId: 'sess-a' }))
      .toEqual({ refused: false, reason: null });
  });

  it('a role-seat parked_by with no session recorded is refused', () => {
    const { refused, reason } = checkUnparkHold({ metadata: { parked_by: 'coordinator' } }, { writingSessionId: 'sess-a' });
    expect(refused).toBe(true);
    expect(reason).toMatch(/coordinator/);
  });

  it('the SAME session that parked it may unpark it, even with a role-seat parked_by string', () => {
    expect(checkUnparkHold(
      { metadata: { parked_by: 'coordinator', stamped_by_session: 'sess-a' } },
      { writingSessionId: 'sess-a' },
    )).toEqual({ refused: false, reason: null });
  });

  it('a DIFFERENT session\'s park is refused, regardless of parked_by', () => {
    const { refused, reason } = checkUnparkHold(
      { metadata: { parked_by: 'cli', stamped_by_session: 'sess-b' } },
      { writingSessionId: 'sess-a' },
    );
    expect(refused).toBe(true);
    expect(reason).toMatch(/sess-b/);
  });
});

describe('unpark() — hold refusal (QF-20260912-346)', () => {
  it('refuses a coordinator park without --force, issuing no UPDATE', async () => {
    const client = makeMockClient({
      selectResult: [{ sd_key: 'SD-X', status: PARK_STATUS, metadata: { parked_by: 'coordinator', parked_from_status: 'active' } }],
      updateResult: [{ status: 'active' }],
    });

    await expect(
      unpark(client, 'SD-X', { reason: 'r', actor: 'worker', writingSessionId: 'sess-a' }),
    ).rejects.toThrow(/UNPARK_HOLD_NOT_YOURS|not this caller/);
    expect(client.queries.some((q) => q.sql.trim().toUpperCase().startsWith('UPDATE'))).toBe(false);
  });

  it('--force overrides the refusal', async () => {
    const client = makeMockClient({
      selectResult: [{ sd_key: 'SD-X', status: PARK_STATUS, metadata: { parked_by: 'coordinator', parked_from_status: 'active' } }],
      updateResult: [{ status: 'active' }],
    });

    const res = await unpark(client, 'SD-X', { reason: 'r', actor: 'worker', writingSessionId: 'sess-a', force: true });
    expect(res.status).toBe('active');
  });
});
