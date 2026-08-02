// Tests for SD-FDBK-ENH-FLEET-WORKER-ATTRITION-001 — stop-loop-wakeup-reminder.cjs
// shouldRemind() is the pure decision: block-and-remind ONLY when the reminder is enabled,
// the /loop worker is mid-iteration with no wakeup armed (loop_state='active'), and we have
// not already reminded this turn (stop_hook_active false). The hook wrapper is fail-open.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const HOOK_PATH = path.resolve(__dirname, '../stop-loop-wakeup-reminder.cjs');
const { shouldRemind, isFlagEnabled, REMINDER } = require(HOOK_PATH); // require.main guard → main() does NOT run

// SD-FDBK-INFRA-AUTO-PUSH-WIP-001 (FR-5c): static source-pin — the strand warning
// must offer the COMMIT-PRESERVING remediation (push WIP first), not just wakeup-arming.
describe('stop-loop-wakeup-reminder — REMINDER text (source-pin, shipped wording)', () => {
  it('is exported and instructs pushing WIP before arming the grace ScheduleWakeup', () => {
    expect(typeof REMINDER).toBe('string');
    expect(REMINDER).toMatch(/PUSH your WIP/i);
    // push-WIP must precede the grace-wakeup remediation
    expect(REMINDER.indexOf('PUSH your WIP')).toBeLessThan(REMINDER.indexOf('Arm a SHORT grace ScheduleWakeup'));
    expect(REMINDER).toMatch(/prepark-wip\.cjs/);
    expect(REMINDER).toMatch(/\/signal/); // wind-down handshake instruction present
  });
});

// SD-LEO-INFRA-TERMINAL-RITUAL-ENFORCEMENT-001 step A — REPLACES the windDownSignaled allow-path
// (SD-LEO-INFRA-LOOP-CONTINUITY-ENFORCE-001 FR-2). That path returned false for ANY session that
// merely SAID "winding down", which is precisely Charlie's false positive: a worker talks its way
// out of the arm requirement without the tool ever being called. Operator safety — the reason the
// allow-path existed — is now carried by the WORKER GATE instead, which is a claim or a live loop
// state rather than an announcement. Announcements are no longer load-bearing anywhere.
describe('step A — an ANNOUNCEMENT is not an arm (FR-3, Charlie\'s false positive)', () => {
  it('BLOCKS a claim-holding worker that announced a wind-down but never called the tool', () => {
    expect(shouldRemind({ armVerdict: 'unarmed', loopState: 'active', flagEnabled: true, hasActiveClaim: true })).toBe(true);
  });

  // The self-report the OLD predicate trusted. post-tool-loop-state.cjs sets awaiting_tick from
  // the worker's own claim about itself, so reading it asked the suspect for an alibi.
  it('BLOCKS a worker whose loop_state says awaiting_tick when the transcript says unarmed', () => {
    expect(shouldRemind({ armVerdict: 'unarmed', loopState: 'awaiting_tick', flagEnabled: true, hasActiveClaim: true })).toBe(true);
  });

  it('allows a worker with a REAL ScheduleWakeup tool_use in the current turn', () => {
    expect(shouldRemind({ armVerdict: 'armed', loopState: 'active', flagEnabled: true, hasActiveClaim: true })).toBe(false);
  });
});

describe('step A — worker gate keeps operators safe (FR-4)', () => {
  it('never blocks a claim-less, loop-less session even when unarmed', () => {
    expect(shouldRemind({ armVerdict: 'unarmed', loopState: null, flagEnabled: true, hasActiveClaim: false })).toBe(false);
    expect(shouldRemind({ armVerdict: 'unarmed', loopState: 'unknown', flagEnabled: true, hasActiveClaim: false })).toBe(false);
  });

  // The live defect FR-4 names: an operator that says "winding down" must not become blockable.
  // Under the old allow-path this same input was ALSO false, but for the wrong reason (the
  // announcement); it is false here because the session is not a worker.
  it('never blocks an operator that announced a wind-down', () => {
    expect(shouldRemind({ armVerdict: 'unarmed', loopState: null, flagEnabled: true, hasActiveClaim: false, windDownSignaled: true })).toBe(false);
  });

  it('blocks the same unarmed turn once a claim is held', () => {
    expect(shouldRemind({ armVerdict: 'unarmed', loopState: null, flagEnabled: true, hasActiveClaim: true })).toBe(true);
  });
});

describe('step A — guards and escapes', () => {
  const worker = { armVerdict: 'unarmed', loopState: 'active', flagEnabled: true, hasActiveClaim: true };

  it('flag-off, second-stop and loop_state=exited all win over the arm requirement', () => {
    expect(shouldRemind({ ...worker, flagEnabled: false })).toBe(false);
    expect(shouldRemind({ ...worker, stopHookActive: true })).toBe(false);
    expect(shouldRemind({ ...worker, loopState: 'exited' })).toBe(false);
  });

  // FR-2: the runtime switch must be able to stop a LIVE seat enforcing, with no merge/restart.
  it('the kill switch disables the block outright', () => {
    expect(shouldRemind({ ...worker, enforcementDisabled: true })).toBe(false);
  });

  // Absence of evidence is not evidence of absence — an unreadable transcript must not trap.
  it("'unknown' and a missing verdict both fail OPEN", () => {
    expect(shouldRemind({ ...worker, armVerdict: 'unknown' })).toBe(false);
    expect(shouldRemind({ ...worker, armVerdict: undefined })).toBe(false);
  });
});

// SD-LEO-INFRA-LOOP-CONTINUITY-ENFORCE-001 (FR-3): no new loop_state value — the DB CHECK
// constraint pins claude_sessions.loop_state to exactly 4 values; the hook reads the tracker's
// constants (single source), so there is no writer/consumer asymmetry.
describe('loop_state coherence (FR-3, no-new-state)', () => {
  const tracker = require(path.resolve(__dirname, '../../lib/sessions/loop-state-tracker.cjs'));
  it('the tracker exposes exactly the 4 DB-pinned states (no 5th added)', () => {
    expect(tracker.VALID_STATES).toEqual(expect.arrayContaining(['active', 'awaiting_tick', 'exited', 'unknown']));
    expect(tracker.VALID_STATES.length).toBe(4);
    expect(tracker.LOOP_STATE_ACTIVE).toBe('active');
  });
});

// The original TS-1..TS-9, carried forward onto the arm-evidence basis. Each case keeps its
// ORIGINAL INTENT; only the signal standing in for "no wakeup armed" changed — from
// loop_state='active' (a self-report) to armVerdict='unarmed' (transcript evidence).
describe('stop-loop-wakeup-reminder — shouldRemind (pure)', () => {
  const unarmedWorker = { armVerdict: 'unarmed', loopState: 'active', stopHookActive: false, flagEnabled: true };

  it('TS-1: returns false when the flag is disabled, even for an unarmed /loop worker', () => {
    expect(shouldRemind({ ...unarmedWorker, flagEnabled: false })).toBe(false);
  });

  it('TS-2: returns true when enabled, unarmed, in-loop, and first stop', () => {
    expect(shouldRemind(unarmedWorker)).toBe(true);
  });

  it('TS-3: returns false when a wakeup was genuinely armed this turn', () => {
    expect(shouldRemind({ ...unarmedWorker, armVerdict: 'armed' })).toBe(false);
  });

  it('TS-4: returns false on the second pass (stop_hook_active true) — never block twice', () => {
    expect(shouldRemind({ ...unarmedWorker, stopHookActive: true })).toBe(false);
  });

  it('TS-5: returns false for exited, and for null/unknown loop_state WITHOUT a claim (operator-safe)', () => {
    expect(shouldRemind({ ...unarmedWorker, loopState: 'exited' })).toBe(false);
    for (const loopState of [null, undefined, 'unknown']) {
      expect(shouldRemind({ ...unarmedWorker, loopState, hasActiveClaim: false })).toBe(false);
    }
  });

  // Coverage-gap (operator 2026-06-10): a worker holding a live SD claim whose loop_state
  // never entered the machine ('unknown'/null) is still about to go silent → remind.
  it('TS-7: returns true for unknown/null loop_state WHEN the session holds an active SD claim', () => {
    for (const loopState of ['unknown', null]) {
      expect(shouldRemind({ ...unarmedWorker, loopState, hasActiveClaim: true })).toBe(true);
    }
  });

  // CHANGED DELIBERATELY. TS-8 used to assert awaiting_tick was an escape even for a claim-holder.
  // It is not any more: awaiting_tick is the worker's OWN self-report, and honouring it is exactly
  // the hole step A closes. 'exited' remains an escape — it is an explicit, deliberate loop
  // termination, not a claim about having armed.
  it('TS-8: awaiting_tick is NO LONGER an escape; exited still is', () => {
    expect(shouldRemind({ ...unarmedWorker, loopState: 'awaiting_tick', hasActiveClaim: true })).toBe(true);
    expect(shouldRemind({ ...unarmedWorker, loopState: 'exited', hasActiveClaim: true })).toBe(false);
  });

  it('TS-9: a claim is ignored when the flag is off or already reminded this turn', () => {
    expect(shouldRemind({ ...unarmedWorker, loopState: 'unknown', hasActiveClaim: true, flagEnabled: false })).toBe(false);
    expect(shouldRemind({ ...unarmedWorker, loopState: 'unknown', hasActiveClaim: true, stopHookActive: true })).toBe(false);
  });
});

describe('stop-loop-wakeup-reminder — isFlagEnabled (env)', () => {
  const orig = process.env.LEO_LOOP_WAKEUP_REMINDER;
  const restore = () => { if (orig === undefined) delete process.env.LEO_LOOP_WAKEUP_REMINDER; else process.env.LEO_LOOP_WAKEUP_REMINDER = orig; };

  it('defaults OFF when unset', () => {
    delete process.env.LEO_LOOP_WAKEUP_REMINDER;
    expect(isFlagEnabled()).toBe(false);
    restore();
  });

  it('is ON for on / 1 / true (case-insensitive)', () => {
    for (const v of ['on', '1', 'true', 'ON', 'True']) {
      process.env.LEO_LOOP_WAKEUP_REMINDER = v;
      expect(isFlagEnabled()).toBe(true);
    }
    restore();
  });

  it('is OFF for off / 0 / false / garbage', () => {
    for (const v of ['off', '0', 'false', 'maybe', '']) {
      process.env.LEO_LOOP_WAKEUP_REMINDER = v;
      expect(isFlagEnabled()).toBe(false);
    }
    restore();
  });
});

describe('stop-loop-wakeup-reminder — wrapper fail-open (TS-6, spawn)', () => {
  function runHook(stdinPayload, env = {}) {
    const { spawnSync } = require('node:child_process');
    const r = spawnSync('node', [HOOK_PATH], {
      input: typeof stdinPayload === 'string' ? stdinPayload : JSON.stringify(stdinPayload),
      env: { ...process.env, ...env },
      encoding: 'utf8',
      timeout: 15000,
    });
    return r;
  }

  it('flag OFF → exits 0 and emits no block decision (allows stop)', () => {
    const r = runHook({ stop_hook_active: false, session_id: 'nonexistent' }, { LEO_LOOP_WAKEUP_REMINDER: 'off' });
    expect(r.status).toBe(0);
    expect(r.stdout || '').not.toMatch(/"decision"\s*:\s*"block"/);
  });

  it('flag ON but stop_hook_active=true → exits 0, no block (never block twice)', () => {
    const r = runHook({ stop_hook_active: true, session_id: 'nonexistent' }, { LEO_LOOP_WAKEUP_REMINDER: 'on' });
    expect(r.status).toBe(0);
    expect(r.stdout || '').not.toMatch(/"decision"\s*:\s*"block"/);
  });

  it('flag ON but unparseable stdin → exits 0 (fail-open, never throws/hangs)', () => {
    // Force no resolvable session id so the wrapper fail-opens without touching the DB (hermetic).
    const r = runHook('not-json-at-all', { LEO_LOOP_WAKEUP_REMINDER: 'on', CLAUDE_SESSION_ID: '', SESSION_ID: '' });
    expect(r.status).toBe(0);
    expect(r.stdout || '').not.toMatch(/"decision"\s*:\s*"block"/);
  });

  // SD-LEO-INFRA-TERMINAL-RITUAL-ENFORCEMENT-001 (step 0) — the pending-wake print shares the
  // stdout channel Claude Code parses as the Stop DECISION. "It goes to stderr" is an intention;
  // what is enforceable is the emitted BYTES. On every allow path stdout must be EXACTLY empty —
  // not merely free of a block decision, since any stray byte risks the decision parse on the one
  // hook every seat traverses every turn.
  it('allow paths emit ZERO bytes on stdout (decision channel untouched)', () => {
    const cases = [
      [{ stop_hook_active: false, session_id: 'nonexistent' }, { LEO_LOOP_WAKEUP_REMINDER: 'off' }],
      [{ stop_hook_active: true, session_id: 'nonexistent' }, { LEO_LOOP_WAKEUP_REMINDER: 'on' }],
      ['not-json-at-all', { LEO_LOOP_WAKEUP_REMINDER: 'on', CLAUDE_SESSION_ID: '', SESSION_ID: '' }],
    ];
    for (const [payload, env] of cases) {
      const r = runHook(payload, env);
      expect(r.stdout).toBe('');
    }
  });

  // A Stop hook that TIMES OUT returns NO decision — the enforcement silently disappears exactly
  // when the machine is loaded. Registered timeout is 10s against 3-5 DB round-trips plus a 2.5s
  // stabilisation re-read, so the hermetic path must stay well clear of it.
  it('stays under the 6s wall-clock ceiling (10s registered timeout)', () => {
    const t0 = Date.now();
    runHook({ stop_hook_active: false, session_id: 'nonexistent' }, { LEO_LOOP_WAKEUP_REMINDER: 'on' });
    expect(Date.now() - t0).toBeLessThan(6000);
  });
});
