/**
 * QF-20260720-911 (RCA a4587e48) — adoptOrphanInProgress had no arbitration against a directed
 * WORK_ASSIGNMENT dispatched for the same SD: a random worker could steal a just-cleared,
 * just-dispatched orphan before the assignee attached, and the adopter re-parking it
 * (requires_human_action=true) re-fenced the SD before the real assignee ever landed — a
 * silent no-land loop (live incident: SD-LEO-INFRA-FLEET-REGISTRY-MANIFEST-001).
 *
 * pendingDirectedAssignmentBlocksAdoption checks a narrow, independently-verifiable signal
 * (an unread, non-expired WORK_ASSIGNMENT genuinely targeting this SD) — deliberately NOT the
 * coordinatorReservation/ctx.reservations fence mechanism, since drain-reservations.cjs's own
 * header documents that step running AFTER adopt-orphan specifically so orphan recovery stays
 * unaffected by that fence.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { pendingDirectedAssignmentBlocksAdoption } = require('../../scripts/worker-checkin.cjs');

function makeSb(rows) {
  return {
    from(table) {
      if (table !== 'session_coordination') throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            is: () => ({
              or: () => ({
                order: () => ({
                  limit: async () => ({ data: rows }),
                }),
              }),
            }),
          }),
        }),
      };
    },
  };
}

describe('pendingDirectedAssignmentBlocksAdoption (QF-20260720-911)', () => {
  it('blocks adoption when a live, unread WORK_ASSIGNMENT targets this SD', async () => {
    const sb = makeSb([{ id: 'row-1', expires_at: null }]);
    expect(await pendingDirectedAssignmentBlocksAdoption(sb, 'SD-X-001')).toBe(true);
  });

  it('does not block when no matching rows exist (the common case)', async () => {
    const sb = makeSb([]);
    expect(await pendingDirectedAssignmentBlocksAdoption(sb, 'SD-X-001')).toBe(false);
  });

  it('does not block when the only matching row has already expired', async () => {
    const sb = makeSb([{ id: 'row-1', expires_at: new Date(Date.now() - 60_000).toISOString() }]);
    expect(await pendingDirectedAssignmentBlocksAdoption(sb, 'SD-X-001')).toBe(false);
  });

  it('blocks when at least one of several candidate rows is still active', async () => {
    const sb = makeSb([
      { id: 'expired', expires_at: new Date(Date.now() - 60_000).toISOString() },
      { id: 'active', expires_at: new Date(Date.now() + 60_000).toISOString() },
    ]);
    expect(await pendingDirectedAssignmentBlocksAdoption(sb, 'SD-X-001')).toBe(true);
  });

  it('fails open: a thrown query error never blocks adoption', async () => {
    const sb = { from: () => { throw new Error('boom'); } };
    expect(await pendingDirectedAssignmentBlocksAdoption(sb, 'SD-X-001')).toBe(false);
  });
});

describe('adoptOrphanInProgress wiring — static pin (guard placed before the claim attempt)', () => {
  it('calls pendingDirectedAssignmentBlocksAdoption inside the orphan guard loop, before tryClaim', () => {
    const { readFileSync } = require('node:fs');
    const src = readFileSync(require.resolve('../../scripts/worker-checkin.cjs'), 'utf8');
    const fnStart = src.indexOf('async function adoptOrphanInProgress');
    const fnEnd = src.indexOf('\n}', src.indexOf('const claimed = await tryClaim', fnStart));
    const body = src.slice(fnStart, fnEnd);
    const guardIdx = body.indexOf('pendingDirectedAssignmentBlocksAdoption');
    const claimIdx = body.indexOf('const claimed = await tryClaim');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(claimIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(claimIdx);
  });
});
