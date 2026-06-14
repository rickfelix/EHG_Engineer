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

// SD-LEO-INFRA-LOOP-CONTINUITY-ENFORCE-001 (FR-2 allow-path): a worker that announced its
// wind-down via /signal must NOT be blocked (false-positive guard), while an un-announced
// premature stop STILL blocks.
describe('stop-loop-wakeup-reminder — wind-down allow-path', () => {
  it('does NOT block when windDownSignaled, even for an active worker', () => {
    expect(shouldRemind({ loopState: 'active', stopHookActive: false, flagEnabled: true, windDownSignaled: true })).toBe(false);
  });
  it('does NOT block a claim-holder that announced wind-down (unknown state + claim)', () => {
    expect(shouldRemind({ loopState: 'unknown', stopHookActive: false, flagEnabled: true, hasActiveClaim: true, windDownSignaled: true })).toBe(false);
  });
  it('STILL blocks an active worker that did NOT announce wind-down', () => {
    expect(shouldRemind({ loopState: 'active', stopHookActive: false, flagEnabled: true, windDownSignaled: false })).toBe(true);
  });
  it('flag-off and stop_hook_active guards still win over everything', () => {
    expect(shouldRemind({ loopState: 'active', stopHookActive: false, flagEnabled: false, windDownSignaled: false })).toBe(false);
    expect(shouldRemind({ loopState: 'active', stopHookActive: true, flagEnabled: true, windDownSignaled: false })).toBe(false);
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

describe('stop-loop-wakeup-reminder — shouldRemind (pure)', () => {
  it('TS-1: returns false when the flag is disabled, even for an active /loop worker', () => {
    expect(shouldRemind({ loopState: 'active', stopHookActive: false, flagEnabled: false })).toBe(false);
  });

  it('TS-2: returns true when enabled, loop_state=active, and first stop (no wakeup armed)', () => {
    expect(shouldRemind({ loopState: 'active', stopHookActive: false, flagEnabled: true })).toBe(true);
  });

  it('TS-3: returns false when a wakeup is already armed (loop_state=awaiting_tick)', () => {
    expect(shouldRemind({ loopState: 'awaiting_tick', stopHookActive: false, flagEnabled: true })).toBe(false);
  });

  it('TS-4: returns false on the second pass (stop_hook_active true) — never block twice', () => {
    expect(shouldRemind({ loopState: 'active', stopHookActive: true, flagEnabled: true })).toBe(false);
  });

  it('TS-5: returns false for exited / null / unknown loop_state WITHOUT a claim (operator-safe)', () => {
    expect(shouldRemind({ loopState: 'exited', stopHookActive: false, flagEnabled: true })).toBe(false);
    expect(shouldRemind({ loopState: null, stopHookActive: false, flagEnabled: true })).toBe(false);
    expect(shouldRemind({ loopState: undefined, stopHookActive: false, flagEnabled: true })).toBe(false);
    expect(shouldRemind({ loopState: 'unknown', stopHookActive: false, flagEnabled: true })).toBe(false);
  });

  // Coverage-gap (operator 2026-06-10): a worker holding a live SD claim whose loop_state
  // never entered the machine ('unknown'/null) is still about to go silent → remind.
  it('TS-7: returns true for unknown/null loop_state WHEN the session holds an active SD claim', () => {
    expect(shouldRemind({ loopState: 'unknown', stopHookActive: false, flagEnabled: true, hasActiveClaim: true })).toBe(true);
    expect(shouldRemind({ loopState: null, stopHookActive: false, flagEnabled: true, hasActiveClaim: true })).toBe(true);
  });

  it('TS-8: a claim does NOT override the awaiting_tick (wakeup armed) or exited escapes', () => {
    expect(shouldRemind({ loopState: 'awaiting_tick', stopHookActive: false, flagEnabled: true, hasActiveClaim: true })).toBe(false);
    expect(shouldRemind({ loopState: 'exited', stopHookActive: false, flagEnabled: true, hasActiveClaim: true })).toBe(false);
  });

  it('TS-9: a claim is ignored when the flag is off or already reminded this turn', () => {
    expect(shouldRemind({ loopState: 'unknown', stopHookActive: false, flagEnabled: false, hasActiveClaim: true })).toBe(false);
    expect(shouldRemind({ loopState: 'unknown', stopHookActive: true, flagEnabled: true, hasActiveClaim: true })).toBe(false);
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
});
