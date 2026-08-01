// SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-1
// lib/fleet/release-work-item.mjs — the shared work-item reset + the two-sample primitive.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  releaseWorkItemOnSessionEnd,
  sampleToolActivityTwice,
  isReleaseWorkItemResetEnabled,
  isQuickFixKey,
  PHASE_RESET_MAP,
} from './release-work-item.mjs';

// ---------------------------------------------------------------------------
// Supabase test doubles. The QF double RECORDS the predicate the UPDATE applied,
// so the tests assert the guard is in the WHERE clause rather than trusting a
// hand-written "matched" flag — the predicate IS the safety property here.
// ---------------------------------------------------------------------------
function qfClient({ matched = true, error = null } = {}) {
  const applied = { eq: {}, filter: {}, is: [] };
  const chain = {
    update: vi.fn(() => chain),
    eq: vi.fn((col, val) => { applied.eq[col] = val; return chain; }),
    filter: vi.fn((col, _op, val) => { applied.filter[col] = val; return chain; }),
    is: vi.fn((col, val) => { applied.is.push([col, val]); return chain; }),
    select: vi.fn(() => Promise.resolve({ data: matched ? [{ id: 'QF-X' }] : [], error })),
  };
  return { applied, from: vi.fn(() => chain) };
}

/**
 * SD-LEO-INFRA-RELEASE-WORK-ITEM-001 — RESHAPED, NOT EXTENDED, AND THE DISTINCTION IS THE POINT.
 *
 * This double used to terminate at `.update().eq()` — recording only {key, patch} and resolving
 * there. That is READ-THEN-WRITE SHAPED, so it could not observe a WHERE-clause predicate at all,
 * and a guard applied as a separate read would have looked identical to one applied atomically.
 * Extending it (the path of least resistance — add `.filter`, `.is`, `.select` passthroughs that
 * ignore their arguments) would have made the new tests pass against a NON-ATOMIC implementation:
 * the double would have validated exactly the defect the change exists to prevent.
 *
 * So it now mirrors qfClient and RECORDS THE PREDICATE, because for this fix the predicate IS the
 * safety property. The read leg is kept because the SD branch genuinely needs current_phase to pick
 * a reset target — the read is for deciding WHAT to write, while the guard stays in the WHERE clause.
 */
function sdClient({ row, updateError = null, matched = true } = {}) {
  const updates = [];
  const applied = { eq: {}, filter: {}, is: [] };
  const chain = {
    update: vi.fn((patch) => { updates.push({ patch }); return chain; }),
    eq: vi.fn((col, val) => { applied.eq[col] = val; return chain; }),
    filter: vi.fn((col, _op, val) => { applied.filter[col] = val; return chain; }),
    is: vi.fn((col, val) => { applied.is.push([col, val]); return chain; }),
    select: vi.fn(() => Promise.resolve({
      data: updateError ? null : (matched ? [{ sd_key: row && row.sd_key }] : []),
      error: updateError,
    })),
  };
  return {
    updates,
    applied,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }) })),
      })),
      update: chain.update,
    })),
  };
}

function sessionClient(values) {
  let i = 0;
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => {
            const v = values[Math.min(i, values.length - 1)];
            i += 1;
            if (v instanceof Error) return Promise.resolve({ data: null, error: { message: v.message } });
            return Promise.resolve({ data: { last_tool_at: v }, error: null });
          }),
        })),
      })),
    })),
  };
}

const noSleep = () => Promise.resolve();

describe('FR1-FLAG: LEO_RELEASE_WORKITEM_RESET is opt-in, never truthy-by-accident', () => {
  it('is OFF when unset, OFF for any other value, ON only for exactly "on"', () => {
    expect(isReleaseWorkItemResetEnabled({})).toBe(false);
    expect(isReleaseWorkItemResetEnabled({ LEO_RELEASE_WORKITEM_RESET: '' })).toBe(false);
    // 'true'/'1' are truthy strings — a truthiness check would wrongly enable conversion.
    expect(isReleaseWorkItemResetEnabled({ LEO_RELEASE_WORKITEM_RESET: 'true' })).toBe(false);
    expect(isReleaseWorkItemResetEnabled({ LEO_RELEASE_WORKITEM_RESET: '1' })).toBe(false);
    expect(isReleaseWorkItemResetEnabled({ LEO_RELEASE_WORKITEM_RESET: 'on' })).toBe(true);
  });
});

describe('FR1-DISPATCH: QF- prefix selects the quick-fix branch', () => {
  it('classifies keys', () => {
    expect(isQuickFixKey('QF-20260727-259')).toBe(true);
    expect(isQuickFixKey('SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001')).toBe(false);
    expect(isQuickFixKey(null)).toBe(false);
  });
});

describe('FR1-QF: a stranded quick-fix is returned to the open pool', () => {
  it('QF-1: reopens an item with no claimant, no pr_url and no commit_sha', async () => {
    const sb = qfClient({ matched: true });
    const r = await releaseWorkItemOnSessionEnd(sb, 'QF-20260726-175', 'SESSION_END');
    expect(r.ok).toBe(true);
    expect(r.action).toBe('qf_reopened');
  });

  it('QF-2: THE GUARD IS IN THE WHERE CLAUSE — all four columns are constrained', async () => {
    // This is the criterion that matters: the reset must be unable to touch an item
    // carrying real work, structurally, rather than by a caller remembering to check.
    const sb = qfClient({ matched: true });
    await releaseWorkItemOnSessionEnd(sb, 'QF-20260726-175', 'SESSION_END');
    expect(sb.applied.eq.id).toBe('QF-20260726-175');
    expect(sb.applied.filter.status).toBe('in_progress');
    expect(sb.applied.is).toEqual([
      ['claiming_session_id', null],
      ['pr_url', null],
      ['commit_sha', null],
    ]);
  });

  it('QF-3: an item carrying real work is left untouched (predicate matches nothing)', async () => {
    const sb = qfClient({ matched: false });
    const r = await releaseWorkItemOnSessionEnd(sb, 'QF-20260726-423', 'SESSION_END');
    expect(r.ok).toBe(true);
    expect(r.action).toBe('qf_untouched');
  });

  it('QF-4: a DB error surfaces as a verdict, never as a throw', async () => {
    const sb = qfClient({ matched: false, error: { message: 'db down' } });
    const r = await releaseWorkItemOnSessionEnd(sb, 'QF-1', 'SESSION_END');
    expect(r.ok).toBe(false);
    expect(r.action).toBe('error');
    expect(r.detail).toContain('db down');
  });
});

describe('FR1-SD: phase rewind, with the accepted-handoff guard CARRIED', () => {
  // The gate is stubbed EXPLICITLY in every SD test. It is a real collaborator with its
  // own DB reads, so leaving it live would make these tests assert the stub-fidelity of
  // a supabase double rather than the rewind logic under test.
  async function loadWithGate(gateImpl) {
    vi.resetModules();
    vi.doMock('../exec-context-guard.mjs', () => ({ assertSweepHandoffGate: vi.fn(gateImpl) }));
    const mod = await import('./release-work-item.mjs');
    return mod.releaseWorkItemOnSessionEnd;
  }
  const WORKTREE_WITH_COMMITS = process.cwd();
const allow = async () => ({ ok: true });
  const rejectWith = (code, message) => async () => { const e = new Error(message); e.code = code; throw e; };

  afterEach(() => { vi.doUnmock('../exec-context-guard.mjs'); });

  it('SD-0: THE REWIND IS OPT-IN — default leaves the phase alone for resume', async () => {
    // Defaulting this ON would make every future call site silently inherit a policy that
    // several paths explicitly forbid (coordinator-cold-recovery: "PRESERVES current_phase +
    // progress (resume, not restart)"), and would do so invisibly — the SD would just come
    // back a phase earlier. Only the sweep asks for the rewind.
    const release = await loadWithGate(allow);
    const sb = sdClient({ row: { sd_key: 'SD-X', current_phase: 'EXEC', status: 'in_progress' } });
    const r = await release(sb, 'SD-X', 'SESSION_END');
    // *** THIS ASSERTION USED TO ENCODE THE DEFECT. *** It expected sd_no_reset and ZERO updates —
    // i.e. that a default release touches nothing — while the detail string claimed "claim
    // released". The claim was never released: status stayed in_progress and the claim path filters
    // on status, so the row became permanently unofferable. The rewind is STILL opt-in (phase
    // untouched below); what changed is that returning the item to the pool no longer depends on it.
    expect(r.action).toBe('sd_status_reset');
    expect(r.detail).toMatch(/in_progress → active/);
    expect(sb.updates).toHaveLength(1);
    expect(sb.updates[0].patch).toEqual({ status: 'active' });
    expect(sb.updates[0].patch.current_phase).toBeUndefined(); // phase preserved for resume
  });

  it('SD-1: rewinds a mid-phase SD to its safe boundary when ASKED and the gate allows', async () => {
    const release = await loadWithGate(allow);
    const sb = sdClient({ row: { sd_key: 'SD-X', current_phase: 'EXEC', status: 'in_progress' } });
    const r = await release(sb, 'SD-X', 'SESSION_END', { rewindPhase: true });
    expect(r.action).toBe('sd_phase_reset');
    // ONE update carrying BOTH writes. status is unconditional; current_phase rides along only
    // because the rewind was requested, mapped and un-blocked.
    expect(sb.updates).toEqual([{ patch: { status: 'active', current_phase: 'PLAN_PRD' } }]);
    // THE GUARD IS IN THE WHERE CLAUSE — the property the whole race-safety argument rests on,
    // asserted the way the QF side asserts it (QF-2) rather than inferred from an outcome.
    expect(sb.applied.eq).toEqual({ sd_key: 'SD-X' });
    expect(sb.applied.filter).toEqual({ status: 'in_progress' });
    expect(sb.applied.is).toEqual([['claiming_session_id', null]]);
    expect(PHASE_RESET_MAP.EXEC).toBe('PLAN_PRD');
  });

  it('SD-1b: a QF hand-back is unaffected by rewindPhase — the open pool has no ambiguity', async () => {
    const sb = qfClient({ matched: true });
    const r = await releaseWorkItemOnSessionEnd(sb, 'QF-1', 'SESSION_END');
    expect(r.action).toBe('qf_reopened'); // no rewindPhase passed, still reopens
  });

  it('SD-2: an SD already at a safe boundary is not rewound', async () => {
    const release = await loadWithGate(allow);
    const sb = sdClient({ row: { sd_key: 'SD-X', current_phase: 'PLAN_PRD', status: 'in_progress' } });
    const r = await release(sb, 'SD-X', 'SESSION_END', { rewindPhase: true });
    // No phase to rewind (already a safe boundary) — but the row must STILL return to the pool.
    // Gating the status revert on the phase map is another way a released SD stays unreachable for
    // a reason that has nothing to do with any claim.
    expect(r.action).toBe('sd_status_reset');
    expect(sb.updates[0].patch).toEqual({ status: 'active' });
  });

  it('SD-3: a vanished SD is a no-op, not an error', async () => {
    const release = await loadWithGate(allow);
    const sb = sdClient({ row: null });
    const r = await release(sb, 'SD-GONE', 'SESSION_END', { rewindPhase: true });
    expect(r.ok).toBe(true);
    expect(r.action).toBe('sd_no_reset');
  });

  it('SD-4: THE CARRIED GUARD BLOCKS a rewind past an accepted handoff', async () => {
    // The whole point of carrying assertSweepHandoffGate out of the sweep: an accepted
    // handoff past the target phase must stop ANY release path, not just the sweep.
    const release = await loadWithGate(rejectWith('ACCEPTED_HANDOFF_OVERRIDE', 'accepted handoff past PLAN_PRD exists'));
    const sb = sdClient({ row: { sd_key: 'SD-X', current_phase: 'EXEC', status: 'in_progress' } });
    const logs = [];
    const r = await release(sb, 'SD-X', 'SESSION_END', { rewindPhase: true, onLog: (m) => logs.push(m) });
    // *** THE HANDOFF GATE IS A PHASE GATE, SO IT BLOCKS THE PHASE AND NOTHING ELSE. ***
    // It answers one question: would rewinding past this boundary override an ALREADY-ACCEPTED
    // handoff? That is a statement about phase, not about reachability. Letting it also suppress the
    // status revert would recreate the exact unreachability this SD fixes, by a second route — the
    // row would stay in_progress forever because a PHASE concern vetoed a POOL decision.
    expect(r.action).toBe('sd_status_reset');
    expect(sb.updates).toHaveLength(1);
    expect(sb.updates[0].patch).toEqual({ status: 'active' });
    expect(sb.updates[0].patch.current_phase).toBeUndefined(); // the rewind really was blocked
    expect(logs.join('\n')).toContain('SKIP_PHASE_REWIND');
    expect(logs.join('\n')).toContain('ACCEPTED_HANDOFF_OVERRIDE');
  });

  it('SD-5: a guard that cannot answer does NOT authorise the write', async () => {
    const release = await loadWithGate(rejectWith('SCHEMA_ERROR', 'schema exploded'));
    const sb = sdClient({ row: { sd_key: 'SD-X', current_phase: 'EXEC', status: 'in_progress' } });
    const r = await release(sb, 'SD-X', 'SESSION_END', { rewindPhase: true });
    // A gate that cannot answer still does not authorise the PHASE write — unchanged, and the
    // assertion below proves it. What it must NOT do is veto the pool decision as collateral: an
    // unreadable PHASE guard says nothing about whether the item should be claimable.
    expect(r.action).toBe('sd_status_reset');
    expect(sb.updates[0].patch.current_phase).toBeUndefined();
  });

  it('SD-6: unpushed commits are REAL WORK — the row is not reverted', async () => {
    // The advisory layer's whole justification: branch-ahead sees UNPUSHED commits, which pr_url
    // never could, and unpushed-with-no-PR was the actual state of one of the two stranded
    // branches. A pr_url-shaped signal would have missed exactly the case that motivated it.
    const release = await loadWithGate(allow);
    const sb = sdClient({ row: { sd_key: 'SD-X', current_phase: 'EXEC', status: 'in_progress' } });
    const r = await release(sb, 'SD-X', 'SESSION_END', { worktreePath: WORKTREE_WITH_COMMITS });
    expect(r.action).toBe('sd_no_reset');
    expect(r.detail).toMatch(/unpushed commit/);
    expect(sb.updates).toHaveLength(0);
  });

  it('SD-7: a pre-flight that CANNOT DETERMINE branch state skips — it does not permit', async () => {
    /**
     * *** THE FAIL DIRECTION IS THE POINT, AND countAhead GETS IT BACKWARDS FOR THIS CALLER. ***
     * countAhead collapses every failure — missing or archived worktree, deleted ref, no git,
     * timeout — to a bare 0, and its docstring calls that "fail-closed". True for prepark-wip, which
     * runs INSIDE the worktree it measures so 0 really means nothing-ahead. INVERTED here: 0 reads
     * as "no work, safe to revert", so an unreadable probe would silently authorise the destructive
     * branch — and an ended session's worktree is routinely archived, making unreadable the NORMAL
     * case rather than the exotic one.
     *
     * Killing mutation: use countAhead's raw return instead of probeAhead and this fails, because a
     * nonexistent path yields 0 and the row gets reverted. SD-6 alone would NOT catch that — it only
     * exercises the git-succeeds path.
     */
    const release = await loadWithGate(allow);
    const sb = sdClient({ row: { sd_key: 'SD-X', current_phase: 'EXEC', status: 'in_progress' } });
    const r = await release(sb, 'SD-X', 'SESSION_END', { worktreePath: '/nonexistent/worktree/path' });
    expect(r.action).toBe('sd_no_reset');
    expect(r.detail).toMatch(/could not determine branch state/);
    expect(sb.updates).toHaveLength(0);
  });

  it('SD-8: NO worktreePath means no advisory layer — the atomic guard still applies', async () => {
    // Absence of a path is NOT "could not determine": the caller simply did not offer the signal.
    // Treating those the same would make every existing call site — none of which pass a path — skip
    // forever, which is the unreachability this SD fixes wearing a safety costume.
    const release = await loadWithGate(allow);
    const sb = sdClient({ row: { sd_key: 'SD-X', current_phase: 'EXEC', status: 'in_progress' } });
    const r = await release(sb, 'SD-X', 'SESSION_END');
    expect(r.action).toBe('sd_status_reset');
    expect(sb.applied.filter).toEqual({ status: 'in_progress' });
    expect(sb.applied.is).toEqual([['claiming_session_id', null]]);
  });
});

describe('FR1-SAMPLE: sampleToolActivityTwice — one primitive, two opposite polarities', () => {
  it('SAMPLE-1: advancing last_tool_at => alive (FR-2 polarity)', async () => {
    const sb = sessionClient(['2026-07-27T10:00:00Z', '2026-07-27T10:05:00Z']);
    const r = await sampleToolActivityTwice(sb, 's1', { intervalMs: 10, sleep: noSleep });
    expect(r.ok).toBe(true);
    expect(r.advancing).toBe(true);
    expect(r.identical).toBe(false);
  });

  it('SAMPLE-2: identical last_tool_at => not advancing (FR-5 leg B polarity)', async () => {
    const sb = sessionClient(['2026-07-27T10:00:00Z', '2026-07-27T10:00:00Z']);
    const r = await sampleToolActivityTwice(sb, 's1', { intervalMs: 10, sleep: noSleep });
    expect(r.identical).toBe(true);
    expect(r.advancing).toBe(false);
  });

  it('SAMPLE-3: a session that has NEVER run a tool is not advancing', async () => {
    const sb = sessionClient([null, null]);
    const r = await sampleToolActivityTwice(sb, 'ghost', { intervalMs: 10, sleep: noSleep });
    expect(r.identical).toBe(true);
    expect(r.advancing).toBe(false);
  });

  it('SAMPLE-4: A FAILED SAMPLE AUTHORISES NOTHING — neither kill nor reap', async () => {
    // advancing gates the kill; identical gates the reap. A read failure must set BOTH
    // false so an unreadable sample can never be mistaken for an answer in either direction.
    const sb = sessionClient([new Error('db down')]);
    const r = await sampleToolActivityTwice(sb, 's1', { intervalMs: 10, sleep: noSleep });
    expect(r.ok).toBe(false);
    expect(r.advancing).toBe(false);
    expect(r.identical).toBe(false);
  });

  it('SAMPLE-5: it really samples TWICE, waiting in between', async () => {
    const sb = sessionClient(['2026-07-27T10:00:00Z', '2026-07-27T10:05:00Z']);
    const sleep = vi.fn(() => Promise.resolve());
    await sampleToolActivityTwice(sb, 's1', { intervalMs: 600_000, sleep });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(600_000);
  });

  it('SAMPLE-6: defaults to a 10-minute interval (FR-5 requires >= 10 min)', async () => {
    const sb = sessionClient(['a', 'a']);
    const sleep = vi.fn(() => Promise.resolve());
    const r = await sampleToolActivityTwice(sb, 's1', { sleep });
    expect(r.intervalMs).toBe(600_000);
    expect(sleep).toHaveBeenCalledWith(600_000);
  });
});
