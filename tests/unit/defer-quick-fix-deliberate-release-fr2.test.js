/**
 * SD-LEO-INFRA-CHECKIN-DISPATCH-READ-001 (FR-2) — a deliberate QF release must WRITE the
 * structured marker, and a deliberate release recorded without one must FAIL LOUDLY.
 *
 * THE MECHANISM THIS CLOSES: a worker records a blocking rationale as prose
 * (verification_notes) and never invokes the structured verb; the stale-claim sweep later
 * clears the claim MECHANICALLY, writing no marker (correctly — a swept claim is not a
 * deliberate release); the QF returns to status='open' with every marker column NULL and is
 * re-handed to a seat that also cannot satisfy the blocking condition. Measured fleet-wide by
 * the coordinator: dozens of QFs with all-NULL markers.
 *
 * TWO-SIDED THROUGHOUT: each guard is proven to FIRE on the positive control and to NOT fire
 * on the negative control, so a writer that refuses every release cannot pass. The positive
 * controls are proven against the REAL hand-time reader (isAutoStartableQF), not a re-derived
 * predicate — the whole point is that the written marker is one the live guard actually reads.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { deferQuickFix, classifyDeliberateHoldMarker } from '../../scripts/defer-quick-fix.js';
import { clearAndReopenQf } from '../../lib/fleet/best-effort-release.mjs';
import { releaseWorkItemOnSessionEnd } from '../../lib/fleet/release-work-item.mjs';

const require_ = createRequire(import.meta.url);
const { isAutoStartableQF } = require_('../../scripts/worker-checkin.cjs');

const NOW = Date.now();
const inHours = (h) => new Date(NOW + h * 3600_000).toISOString();

/** A row the hand-time guard would HAND OUT absent any hold marker (the two-sided baseline). */
function claimableRow(extra = {}) {
  return {
    id: 'QF-FR2-SPECIMEN', status: 'open', pr_url: null, commit_sha: null,
    factory_lane: false, routing_tier: 1,
    title: 'tidy the belt summary copy', description: 'wording only',
    created_at: new Date(NOW - 3600_000).toISOString(),
    not_before: null, owner: null, release_condition: null,
    ...extra,
  };
}

function makeSupabaseStub(returnData, returnError = null) {
  const update = vi.fn().mockReturnThis();
  const eq = vi.fn().mockReturnThis();
  const select = vi.fn().mockReturnThis();
  const single = vi.fn().mockResolvedValue({ data: returnData, error: returnError });
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const insert = vi.fn().mockResolvedValue({ error: null });
  return {
    client: { from: () => ({ update, eq, select, single, maybeSingle, insert }) },
    update, eq, select, single, insert,
  };
}

describe('FR-2 baseline — the specimen row IS claimable without markers (two-sided anchor)', () => {
  it('the hand-time guard hands out the unmarked row', () => {
    // Without this control the positive cases below could pass on a row the guard refuses for
    // an unrelated reason (age, tier, risk keywords) — proving nothing about the marker.
    expect(isAutoStartableQF(claimableRow(), NOW)).toBe(true);
  });

  it('prose in verification_notes is INVISIBLE to the guard — by design, not omission', () => {
    // The defect in one line: the rationale as prose excludes nothing. Only the structured
    // marker does. This pins the no-prose-parser boundary from the READ side.
    const row = claimableRow({ verification_notes: 'BLOCKED: needs the chairman apply first' });
    expect(isAutoStartableQF(row, NOW)).toBe(true);
  });
});

describe('FR-2 positive controls — a deliberate release persists a marker the guard reads', () => {
  it('time-gated: reason + not_before is written, and isAutoStartableQF refuses the result', async () => {
    const stub = makeSupabaseStub({ id: 'QF-X', status: 'open', not_before: inHours(24) });
    await deferQuickFix('QF-X', inHours(24), {
      reason: 'needs a clean 24h observation window', owner: 'worker', releaseCondition: null,
      supabaseClient: stub.client,
    });
    const written = stub.update.mock.calls[0][0];
    expect(written).toMatchObject({ claiming_session_id: null, reason: 'needs a clean 24h observation window' });
    expect(written.not_before).toBeTruthy();
    expect(isAutoStartableQF(claimableRow({ not_before: written.not_before }), NOW)).toBe(false);
  });

  it('event-gated: owner=chairman + release_condition + reason, NO timestamp, is written and refused by the guard', async () => {
    const stub = makeSupabaseStub({ id: 'QF-X', status: 'open', owner: 'chairman', release_condition: 'EU send planned' });
    await deferQuickFix('QF-X', null, {
      reason: 'apply is chairman-gated', owner: 'chairman', releaseCondition: 'EU send planned',
      supabaseClient: stub.client,
    });
    const written = stub.update.mock.calls[0][0];
    expect(written).toMatchObject({
      claiming_session_id: null, owner: 'chairman',
      release_condition: 'EU send planned', reason: 'apply is chairman-gated',
    });
    expect(written.not_before).toBeUndefined();
    expect(isAutoStartableQF(claimableRow({ owner: written.owner, release_condition: written.release_condition }), NOW)).toBe(false);
  });
});

describe('FR-2 fail-loud — a rationale without a guard-visible marker is refused, naming columns', () => {
  it('reason alone (no marker at all) is refused before any DB write, naming not_before and release_condition', async () => {
    const stub = makeSupabaseStub({ id: 'QF-X' });
    await expect(deferQuickFix('QF-X', null, {
      reason: 'blocked on sibling PR', supabaseClient: stub.client,
    })).rejects.toThrow(/not_before[\s\S]*release_condition/);
    expect(stub.update).not.toHaveBeenCalled();
  });

  it('a marker combination the guard CANNOT SEE (owner=worker + release_condition) is refused, not written', async () => {
    // The sharp edge: this LOOKS structured, but isAutoStartableQF only excludes
    // owner='chairman' holds — writing it would feel like a hold while excluding nothing.
    const stub = makeSupabaseStub({ id: 'QF-X' });
    await expect(deferQuickFix('QF-X', null, {
      reason: 'blocked', owner: 'worker', releaseCondition: 'sibling merges',
      supabaseClient: stub.client,
    })).rejects.toMatchObject({ code: 'DELIBERATE_RELEASE_MARKER_MISSING' });
    expect(stub.update).not.toHaveBeenCalled();
    // ...and the refusal is honest about WHY: the guard genuinely would not exclude that row.
    expect(isAutoStartableQF(claimableRow({ owner: 'worker', release_condition: 'sibling merges' }), NOW)).toBe(true);
  });

  it('event-gated without a structured reason is refused, naming the reason column', async () => {
    const stub = makeSupabaseStub({ id: 'QF-X' });
    await expect(deferQuickFix('QF-X', null, {
      owner: 'chairman', releaseCondition: 'EU send planned', supabaseClient: stub.client,
    })).rejects.toThrow(/missing column: reason/);
    expect(stub.update).not.toHaveBeenCalled();
  });

  it('classifier verdicts carry the refusal code so callers can branch without string-matching', () => {
    expect(classifyDeliberateHoldMarker({})).toMatchObject({ valid: false, code: 'DELIBERATE_RELEASE_MARKER_MISSING' });
    expect(classifyDeliberateHoldMarker({ notBefore: inHours(2) })).toMatchObject({ valid: true, mode: 'time_gated' });
    expect(classifyDeliberateHoldMarker({ owner: 'chairman', releaseCondition: 'x' })).toMatchObject({ valid: true, mode: 'event_gated' });
  });
});

describe('FR-2 negative controls — markerless paths that must KEEP succeeding', () => {
  it('ordinary hand-back (clearAndReopenQf) still succeeds with no marker columns at all', async () => {
    const updates = [];
    const chain = {
      update(payload) { updates.push(payload); return this; },
      eq() { return this; }, filter() { return this; }, is() { return this; },
      select: async () => ({ data: [{ id: 'QF-HB' }], error: null }),
    };
    const sb = { from: () => chain };
    const res = await clearAndReopenQf(sb, 'QF-HB');
    expect(res).toMatchObject({ changed: true, reason: 'reopened' });
    expect(updates[0]).toEqual({ status: 'open', claiming_session_id: null });
    for (const col of ['not_before', 'owner', 'release_condition', 'reason']) {
      expect(updates[0]).not.toHaveProperty(col);
    }
  });

  it('SWEEP BOUNDARY: the mechanical work-item reset still reopens a dead claim with no marker', async () => {
    // A swept stale claim is NOT a deliberate release. Requiring a marker here would strand
    // every genuinely-dead claim — the load-bearing boundary the PRD names.
    const updates = [];
    const chain = {
      update(payload) { updates.push(payload); return this; },
      eq() { return this; }, filter() { return this; }, is() { return this; },
      select: async () => ({ data: [{ id: 'QF-SWEPT' }], error: null }),
    };
    const sb = { from: () => chain };
    const res = await releaseWorkItemOnSessionEnd(sb, 'QF-SWEPT', 'stale_session_sweep');
    expect(res).toMatchObject({ ok: true, kind: 'qf', action: 'qf_reopened' });
    expect(updates[0]).toEqual({ status: 'open' });
  });
});

describe('FR-2 no-prose-parser boundary (write side)', () => {
  it('the deliberate-release writer never reads verification_notes as guard state', () => {
    // Comments may NAME the column while explaining the defect; CODE must never touch it.
    const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const src = stripComments(readFileSync(new URL('../../scripts/defer-quick-fix.js', import.meta.url), 'utf8'));
    expect(src.includes('verification_notes'), 'defer-quick-fix.js must not consult prose').toBe(false);
    const gate = stripComments(readFileSync(new URL('../../lib/fleet/qf-gated-hold.cjs', import.meta.url), 'utf8'));
    expect(gate.includes('verification_notes'), 'the gated-hold predicate must not consult prose').toBe(false);
  });
});
