import { describe, it, expect } from 'vitest';
import { stampReleaseRequest } from '../../../lib/coordinator/dispatch.cjs';

// FR-2 (SD-LEO-INFRA-FULL-UTILISATION-RECOVERY-001). resume.cjs short-circuits above every
// acquisition tier, so a directed assignment to a BUSY seat is only surfaced as prose and no claim
// lands. A preempt dispatch must instead write metadata.release_request on the SD that seat holds,
// so the existing position-4.5 consumer frees it at the next boundary.
describe('FR-2 stampReleaseRequest', () => {
  const SEAT = 'sess-busy';
  const HELD = 'SD-HELD-001';
  const ASSIGNED = 'SD-ASSIGNED-002';

  /** @param {{heldSdKey?: string|null, heldMetadata?: object}} o */
  function fakeSb(o = {}) {
    const updates = [];
    const sb = {
      updates,
      from(table) {
        if (table === 'claude_sessions') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { sd_key: 'heldSdKey' in o ? o.heldSdKey : HELD } }) }) }) };
        }
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'held-row', metadata: o.heldMetadata || {} } }) }) }),
          update: (patch) => ({ eq: async (_c, _v) => { updates.push(patch); return {}; } }),
        };
      },
    };
    return sb;
  }

  // resolveAssignmentTargetKey's 'dispatchStamp' profile reads payload.assigned_sd (then
  // payload.sd_key, then top.target_sd) — NOT a top-level assigned_sd.
  const rowFor = (payload) => ({
    message_type: 'WORK_ASSIGNMENT',
    target_session: SEAT,
    payload: { assigned_sd: ASSIGNED, ...payload },
  });

  it('writes release_request on the held SD for a PREEMPT dispatch to a busy seat', async () => {
    const sb = fakeSb();
    const row = rowFor({ preempt: true });
    await stampReleaseRequest(sb, row, { warn() {} });
    expect(sb.updates).toHaveLength(1);
    expect(sb.updates[0].metadata.release_request).toMatchObject({
      requested_by: 'coordinator:preempt_dispatch',
      ttl_minutes: 60,
    });
    expect(row.payload.release_requested_on).toBe(HELD);
  });

  // The scoping is the safety property: an unscoped producer would cause routine involuntary
  // releases of in-flight work — the exact harm the resume short-circuit exists to prevent.
  it('does NOTHING for a routine (non-preempt) dispatch', async () => {
    const sb = fakeSb();
    const row = rowFor({});
    await stampReleaseRequest(sb, row, { warn() {} });
    expect(sb.updates).toHaveLength(0);
    expect(row.payload.release_requested_on).toBeUndefined();
  });

  it('does nothing when the seat is already free — the normal path already works', async () => {
    const sb = fakeSb({ heldSdKey: null });
    await stampReleaseRequest(sb, rowFor({ preempt: true }), { warn() {} });
    expect(sb.updates).toHaveLength(0);
  });

  it('does nothing when the seat already holds the assigned SD', async () => {
    const sb = fakeSb({ heldSdKey: ASSIGNED });
    await stampReleaseRequest(sb, rowFor({ preempt: true }), { warn() {} });
    expect(sb.updates).toHaveLength(0);
  });

  // Re-stamping would reset requested_at and extend a TTL the coordinator already set.
  it('never overwrites a release_request that is already pending', async () => {
    const sb = fakeSb({ heldMetadata: { release_request: { requested_at: '2026-07-31T00:00:00Z' } } });
    await stampReleaseRequest(sb, rowFor({ preempt: true }), { warn() {} });
    expect(sb.updates).toHaveLength(0);
  });

  it('is fail-soft: a lookup error leaves the dispatch unchanged', async () => {
    const boom = { from() { throw new Error('db down'); } };
    const row = rowFor({ preempt: true });
    await expect(stampReleaseRequest(boom, row, { warn() {} })).resolves.toBeUndefined();
    expect(row.payload.release_requested_on).toBeUndefined();
  });
});
