// SD-LEO-INFRA-WORKER-WIND-DOWN-001 — the Stop hook's wind-down path previously parked a finisher
// (an SD just completed, no active claim) without ever looking at the belt again: the worker /loop
// exits and directed assignments queue until the NEXT checkin. Measured specimen: three finisher
// seats sat idle-no-claim for ~40 minutes beside two claim-ready drafts until the coordinator
// manually dispatched. This SD is the worker-side fix: attempt ONE same-turn next-claim, through
// the EXISTING canonical checkin resolution path, before parking.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const HOOK_PATH = path.resolve(__dirname, '../../../scripts/hooks/stop-loop-wakeup-reminder.cjs');
const {
  isSameTurnClaimEnabled,
  shouldAttemptSameTurnClaim,
  attemptSameTurnNextClaim,
  recordSameTurnClaimAttempt,
  formatCoordinatorMessagesForBlock,
} = require(HOOK_PATH);

describe('isSameTurnClaimEnabled (default-on kill switch)', () => {
  it('defaults to enabled when unset', () => {
    const prev = process.env.LEO_SAME_TURN_NEXT_CLAIM;
    delete process.env.LEO_SAME_TURN_NEXT_CLAIM;
    try {
      expect(isSameTurnClaimEnabled()).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.LEO_SAME_TURN_NEXT_CLAIM;
      else process.env.LEO_SAME_TURN_NEXT_CLAIM = prev;
    }
  });

  it('is disableable via off/0/false without a redeploy', () => {
    const prev = process.env.LEO_SAME_TURN_NEXT_CLAIM;
    try {
      for (const v of ['off', '0', 'false', 'OFF']) {
        process.env.LEO_SAME_TURN_NEXT_CLAIM = v;
        expect(isSameTurnClaimEnabled()).toBe(false);
      }
      process.env.LEO_SAME_TURN_NEXT_CLAIM = 'on';
      expect(isSameTurnClaimEnabled()).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.LEO_SAME_TURN_NEXT_CLAIM;
      else process.env.LEO_SAME_TURN_NEXT_CLAIM = prev;
    }
  });
});

describe('shouldAttemptSameTurnClaim (SD-LEO-INFRA-WORKER-WIND-DOWN-001)', () => {
  it('attempts a claim for a worker-shaped session holding NO active claim (the finisher case)', () => {
    expect(shouldAttemptSameTurnClaim({ hasActiveClaim: false, workerShaped: true })).toBe(true);
  });

  it('never attempts when the session already holds an active claim — never grab a second SD', () => {
    expect(shouldAttemptSameTurnClaim({ hasActiveClaim: true, workerShaped: true })).toBe(false);
  });

  it('never attempts for a non-worker-shaped session (nothing to protect against stranding)', () => {
    expect(shouldAttemptSameTurnClaim({ hasActiveClaim: false, workerShaped: false })).toBe(false);
  });

  it('is false on empty/undefined input (fail-closed on the attempt, not the park)', () => {
    expect(shouldAttemptSameTurnClaim({})).toBe(false);
    expect(shouldAttemptSameTurnClaim()).toBe(false);
  });
});

describe('attemptSameTurnNextClaim (SD-LEO-INFRA-WORKER-WIND-DOWN-001)', () => {
  it('SC-1: a claim-ready self-claim resolution is attempted and succeeds through the canonical path', async () => {
    const resolveCheckinFn = vi.fn().mockResolvedValue({ action: 'self_claimed', sd: 'SD-DEMO-001', message: 'Run: node scripts/sd-start.js SD-DEMO-001' });
    const result = await attemptSameTurnNextClaim({ resolveCheckinFn, sb: {}, sessionId: 'sess-1', timeoutMs: 5000 });
    expect(resolveCheckinFn).toHaveBeenCalledTimes(1);
    expect(resolveCheckinFn).toHaveBeenCalledWith({}, 'sess-1');
    expect(result.outcome).toBe('claimed');
    expect(result.key).toBe('SD-DEMO-001');
  });

  it('SC-2: a directed assignment resolution reports claimed via the SAME single call — self-claim is never separately attempted', async () => {
    // resolveCheckin's own step ladder resolves directed-assignment-priority internally; this
    // function delegates exactly once and must not layer any additional self-claim logic on top.
    const resolveCheckinFn = vi.fn().mockResolvedValue({ action: 'claimed_assignment', sd: 'SD-DIRECTED-001', message: 'directed' });
    const result = await attemptSameTurnNextClaim({ resolveCheckinFn, sb: {}, sessionId: 'sess-1', timeoutMs: 5000 });
    expect(resolveCheckinFn).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('claimed');
    expect(result.key).toBe('SD-DIRECTED-001');
  });

  it('reports claimed for a QF self-claim, keyed off .qf not .sd', async () => {
    const resolveCheckinFn = vi.fn().mockResolvedValue({ action: 'self_claimed_qf', qf: 'QF-20260101-001' });
    const result = await attemptSameTurnNextClaim({ resolveCheckinFn, sb: {}, sessionId: 'sess-1', timeoutMs: 5000 });
    expect(result.outcome).toBe('claimed');
    expect(result.key).toBe('QF-20260101-001');
  });

  it('SC-3: nothing claim-ready (idle) reports none-claimable, not an error', async () => {
    const resolveCheckinFn = vi.fn().mockResolvedValue({ action: 'idle', message: 'nothing claimable' });
    const result = await attemptSameTurnNextClaim({ resolveCheckinFn, sb: {}, sessionId: 'sess-1', timeoutMs: 5000 });
    expect(result.outcome).toBe('none-claimable');
    expect(result.key).toBeNull();
  });

  it('an error resolution reports none-claimable (denylisted terminal, never fabricate a claim)', async () => {
    const resolveCheckinFn = vi.fn().mockResolvedValue({ action: 'error', error: 'boom' });
    const result = await attemptSameTurnNextClaim({ resolveCheckinFn, sb: {}, sessionId: 'sess-1', timeoutMs: 5000 });
    expect(result.outcome).toBe('none-claimable');
  });

  it("an 'idle_fable_propose' resolution is denylisted as non-claim", async () => {
    const resolveCheckinFn = vi.fn().mockResolvedValue({ action: 'idle_fable_propose' });
    const result = await attemptSameTurnNextClaim({ resolveCheckinFn, sb: {}, sessionId: 'sess-1', timeoutMs: 5000 });
    expect(result.outcome).toBe('none-claimable');
  });

  // REGRESSION (VALIDATION finding 0e479a8d, 2026-08-29): the ORIGINAL implementation used an
  // ALLOWLIST of 3 claim actions and silently misclassified these two live, unconditionally-
  // reachable ladder rungs (lib/checkin/steps/recover-stranded-final.cjs rung 5.7 and
  // adopt-orphan.cjs rung 5.8 — neither gates on ctx.mySd) as 'none-claimable', which would have
  // let a session take a real claim via resolveCheckin and then immediately park itself as idle,
  // manufacturing a fresh orphan while the instrument reported the opposite of what happened.
  it("REGRESSION: 'resume_final' (stranded pending_approval/LEAD_FINAL recovery) is classified as claimed", async () => {
    const resolveCheckinFn = vi.fn().mockResolvedValue({ action: 'resume_final', sd: 'SD-STRANDED-001', message: 'auto-chains LEAD-FINAL' });
    const result = await attemptSameTurnNextClaim({ resolveCheckinFn, sb: {}, sessionId: 'sess-1', timeoutMs: 5000 });
    expect(result.outcome).toBe('claimed');
    expect(result.key).toBe('SD-STRANDED-001');
  });

  it("REGRESSION: 'resume_orphan' (adopted in_progress orphan) is classified as claimed", async () => {
    const resolveCheckinFn = vi.fn().mockResolvedValue({ action: 'resume_orphan', sd: 'SD-ORPHAN-001', message: 're-attach and continue' });
    const result = await attemptSameTurnNextClaim({ resolveCheckinFn, sb: {}, sessionId: 'sess-1', timeoutMs: 5000 });
    expect(result.outcome).toBe('claimed');
    expect(result.key).toBe('SD-ORPHAN-001');
  });

  it('a hypothetical FUTURE ladder action not yet denylisted is claimed-by-default, not silently dropped', async () => {
    const resolveCheckinFn = vi.fn().mockResolvedValue({ action: 'some_future_claim_action', sd: 'SD-FUTURE-001' });
    const result = await attemptSameTurnNextClaim({ resolveCheckinFn, sb: {}, sessionId: 'sess-1', timeoutMs: 5000 });
    expect(result.outcome).toBe('claimed');
    expect(result.key).toBe('SD-FUTURE-001');
  });

  it('a slow resolution past timeoutMs is treated as none-claimable — no busy-wait, one attempt only', async () => {
    const resolveCheckinFn = vi.fn(() => new Promise((r) => setTimeout(() => r({ action: 'self_claimed', sd: 'SD-TOO-LATE' }), 50)));
    const result = await attemptSameTurnNextClaim({ resolveCheckinFn, sb: {}, sessionId: 'sess-1', timeoutMs: 5 });
    expect(result.outcome).toBe('none-claimable');
    expect(result.key).toBeNull();
  });

  it('timeoutMs<=0 (budget exhausted) skips the attempt entirely without calling resolveCheckinFn', async () => {
    const resolveCheckinFn = vi.fn();
    const result = await attemptSameTurnNextClaim({ resolveCheckinFn, sb: {}, sessionId: 'sess-1', timeoutMs: 0 });
    expect(resolveCheckinFn).not.toHaveBeenCalled();
    expect(result.outcome).toBe('none-claimable');
  });

  it('a throwing resolution fails open to none-claimable — never traps a worker mid-wind-down', async () => {
    const resolveCheckinFn = vi.fn().mockRejectedValue(new Error('db unavailable'));
    const result = await attemptSameTurnNextClaim({ resolveCheckinFn, sb: {}, sessionId: 'sess-1', timeoutMs: 5000 });
    expect(result.outcome).toBe('none-claimable');
  });
});

function makeSessionsSupabase({ sessionsRow = { metadata: {} } } = {}) {
  const calls = { update: [] };
  return {
    calls,
    from(table) {
      if (table !== 'claude_sessions') throw new Error(`unexpected table: ${table}`);
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: sessionsRow, error: null }),
        update(payload) {
          calls.update.push(payload);
          return { eq: async () => ({ data: null, error: null }) };
        },
      };
    },
  };
}

describe('recordSameTurnClaimAttempt (SD-LEO-INFRA-WORKER-WIND-DOWN-001, SC-4 dashboard observability)', () => {
  it('merges same_turn_claim_attempt={outcome,key,at} into metadata, preserving sibling keys', async () => {
    const supabase = makeSessionsSupabase({ sessionsRow: { metadata: { other_key: 'kept' } } });
    await recordSameTurnClaimAttempt(supabase, 'sess-1', { outcome: 'claimed', key: 'SD-DEMO-001' });
    expect(supabase.calls.update).toHaveLength(1);
    const metadata = supabase.calls.update[0].metadata;
    expect(metadata.other_key).toBe('kept');
    expect(metadata.same_turn_claim_attempt.outcome).toBe('claimed');
    expect(metadata.same_turn_claim_attempt.key).toBe('SD-DEMO-001');
    expect(typeof metadata.same_turn_claim_attempt.at).toBe('string');
  });

  it('records key:null for a none-claimable outcome', async () => {
    const supabase = makeSessionsSupabase();
    await recordSameTurnClaimAttempt(supabase, 'sess-1', { outcome: 'none-claimable' });
    expect(supabase.calls.update[0].metadata.same_turn_claim_attempt).toMatchObject({ outcome: 'none-claimable', key: null });
  });

  it('fails open (never throws) on a DB error', async () => {
    const supabase = {
      from() {
        return { select() { return this; }, eq() { return this; }, maybeSingle: async () => { throw new Error('db down'); } };
      },
    };
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await expect(recordSameTurnClaimAttempt(supabase, 'sess-1', { outcome: 'none-claimable' })).resolves.toBeUndefined();
      expect(stderrSpy.mock.calls.some((c) => c[0].includes('same-turn-claim metadata'))).toBe(true);
    } finally {
      stderrSpy.mockRestore();
    }
  });
});

// SC-4 / wire-not-just-ends: main() itself cannot be exercised hermetically without a real DB
// session (a 'nonexistent' spawnSync session id resolves loopState=null/hasActiveClaim=false,
// which is workerShaped=false and never reaches this branch — the same reason the pre-existing
// spawn suite in scripts/hooks/__tests__/stop-loop-wakeup-reminder.test.js only source-pins its
// own budget invariants rather than driving main() end-to-end). Source-pin the WIRING instead:
// that the new functions are actually called from inside the workerShaped branch, gated by the
// kill switch, log exactly once, and route a successful claim through the SAME block-decision
// mechanism the wakeup reminder already uses — so a future refactor cannot silently detach the
// call site from the functions these unit tests otherwise prove correct in isolation.
// SECURITY finding 4711ebbc (EXEC_TO_PLAN review): resolveCheckin's roll-call step CONSUMES
// (acks) an already-delivered advisory coordinator message as a side effect of merely reading
// it. attemptSameTurnNextClaim's caller must surface whatever resolveCheckin returned, or that
// delivery is permanently lost -- the row reads acknowledged in the DB, but the worker never saw
// the content and parked instead of acting on it.
describe('formatCoordinatorMessagesForBlock (SD-LEO-INFRA-WORKER-WIND-DOWN-001, SECURITY finding 4711ebbc)', () => {
  it('returns empty string for no messages, undefined, or a non-array', () => {
    expect(formatCoordinatorMessagesForBlock([])).toBe('');
    expect(formatCoordinatorMessagesForBlock(undefined)).toBe('');
    expect(formatCoordinatorMessagesForBlock(null)).toBe('');
    expect(formatCoordinatorMessagesForBlock('not-an-array')).toBe('');
  });

  it('formats a plain advisory message with kind and subject', () => {
    const out = formatCoordinatorMessagesForBlock([{ kind: 'work_assignment', subject: 'Build SD-X', body: 'please pick this up' }]);
    expect(out).toMatch(/WORK_ASSIGNMENT/);
    expect(out).toMatch(/Build SD-X/);
    expect(out).toMatch(/please pick this up/);
  });

  it('tags a chairman directive distinctly regardless of its raw kind', () => {
    const out = formatCoordinatorMessagesForBlock([{ kind: 'chairman_directive', chairman_directive: true, body: 'stand down' }]);
    expect(out).toMatch(/CHAIRMAN DIRECTIVE/);
    expect(out).toMatch(/stand down/);
  });

  it('numbers multiple messages in order', () => {
    const out = formatCoordinatorMessagesForBlock([{ kind: 'info', body: 'first' }, { kind: 'info', body: 'second' }]);
    expect(out.indexOf('1.')).toBeLessThan(out.indexOf('2.'));
    expect(out).toMatch(/first/);
    expect(out).toMatch(/second/);
  });

  it('tolerates a message with no subject/body (kind-only)', () => {
    const out = formatCoordinatorMessagesForBlock([{ kind: 'roll_call' }]);
    expect(out).toMatch(/ROLL_CALL/);
  });

  // REGRESSION (SECURITY re-verify R1, 6c86b2e1): kind/subject/body are jsonb fields any fleet
  // writer can populate with a non-string — a bare .toUpperCase() call threw on these inputs,
  // which would have escaped to main()'s outer catch and silently dropped the ENTIRE block
  // (including the just-claimed-SD continuation instruction on the claimed branch), for both
  // outcomes, while the message row was already permanently marked acknowledged.
  it('REGRESSION: a non-string kind never throws — coerced via String(), not a bare .toUpperCase()', () => {
    expect(() => formatCoordinatorMessagesForBlock([{ kind: 5 }])).not.toThrow();
    expect(() => formatCoordinatorMessagesForBlock([{ kind: { a: 1 } }])).not.toThrow();
    expect(formatCoordinatorMessagesForBlock([{ kind: 5 }])).toMatch(/\[5\]/);
  });

  it('REGRESSION: a null/non-object entry in the array never throws — filtered out, not dereferenced', () => {
    expect(() => formatCoordinatorMessagesForBlock([null])).not.toThrow();
    expect(formatCoordinatorMessagesForBlock([null])).toBe('');
    expect(() => formatCoordinatorMessagesForBlock(['not-an-object'])).not.toThrow();
    // A mix of one malformed and one valid entry must still surface the valid one.
    const out = formatCoordinatorMessagesForBlock([null, { kind: 'info', body: 'still delivered' }]);
    expect(out).toMatch(/still delivered/);
  });
});

describe('main() wiring (source-pin — SC-4, "chose to exit" vs "never looked" must be observable)', () => {
  const src = require('node:fs').readFileSync(HOOK_PATH, 'utf8');

  it('gates the attempt on both the kill switch and the same predicate this file exports', () => {
    expect(src).toMatch(/isSameTurnClaimEnabled\(\)\s*&&\s*shouldAttemptSameTurnClaim\(/);
  });

  it('delegates to the canonical checkin resolution path, not a hand-rolled claim query', () => {
    expect(src).toMatch(/resolveCheckinFn:\s*require\(['"]\.\.\/worker-checkin\.cjs['"]\)\.resolveCheckin/);
  });

  it('emits exactly one same-turn-next-claim stderr line per allow-path traversal', () => {
    const matches = src.match(/process\.stderr\.write\(`\[same-turn-next-claim\]/g) || [];
    expect(matches.length).toBe(1);
  });

  it('routes a successful claim through decision:"block" (same mechanism as the wakeup reminder)', () => {
    expect(src).toMatch(/outcome === 'claimed'[\s\S]{0,200}emitDecision\(\{ decision: 'block'/);
  });

  it('falls through to the pre-existing park+recordWindDown path when nothing was claimed', () => {
    // The park call must appear textually AFTER the same-turn-claim block, still inside the same
    // `if (workerShaped)` body — i.e. the fix is additive, not a replacement of the existing path.
    const sameTurnIdx = src.indexOf('SAME-TURN NEXT-CLAIM: claimed');
    const parkIdx = src.indexOf('await parkSessionRecoverable(sessionId, { armVerdict });');
    expect(sameTurnIdx).toBeGreaterThan(-1);
    expect(parkIdx).toBeGreaterThan(sameTurnIdx);
  });

  // SECURITY finding 4711ebbc: a consumed coordinator message must be surfaced even on the
  // none-claimable branch, ahead of the fall-through to a silent park.
  it('surfaces consumed coordinator messages before falling through to a silent park', () => {
    const messagesIdx = src.indexOf('formatCoordinatorMessagesForBlock(pendingMessages)');
    const noneClaimableBlockIdx = src.indexOf('SAME-TURN CHECKIN: nothing claimable');
    const parkIdx = src.indexOf('await parkSessionRecoverable(sessionId, { armVerdict });');
    expect(messagesIdx).toBeGreaterThan(-1);
    expect(noneClaimableBlockIdx).toBeGreaterThan(messagesIdx);
    expect(parkIdx).toBeGreaterThan(noneClaimableBlockIdx);
  });
});
