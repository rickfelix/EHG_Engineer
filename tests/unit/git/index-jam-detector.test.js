/**
 * SD-LEO-INFRA-JAMMED-GIT-INDEX-001 — jammed-index detector core.
 *
 * The load-bearing property is that PRESENCE IS NOT PERSISTENCE. Measured at PLAN: six back-to-back
 * healthy `git add`s left a lock present at 12 of 12 ticks across FOUR distinct identities, and all
 * six completed exit 0. A presence-only classifier reports JAMMED there. TS-17a is the negative
 * control for exactly that and a presence-only implementation provably fails it.
 *
 * FILE EXTENSION IS LOAD-BEARING: this must be .test.js. The unit vitest project admits .test.mjs
 * only under tests/unit/org/ and tests/unit/venture-email/, so naming it .test.mjs would make it
 * CI-unreachable and SILENTLY GREEN — the same zero-coverage trap the `db` project represents.
 */
import { describe, it, expect } from 'vitest';
import {
  VERDICT, DEFAULT_DWELL_MS, classifyIndexHealth, lockIdentityOf, exitCodeFor, formatVerdict,
} from '../../../lib/git/index-jam-detector.js';

const T0 = Date.parse('2026-07-28T00:00:00.000Z');
const SEC = 1000;
const present = (id) => ({ lockPresent: true, lockIdentity: id });
const absent = { lockPresent: false, lockIdentity: null };

/** Drive a tick sequence through the classifier, threading state exactly as the cron does. */
function runTicks(observations, { startMs = T0, tickMs = 30 * SEC, dwellMs = DEFAULT_DWELL_MS } = {}) {
  let state; const out = [];
  observations.forEach((obs, i) => {
    const r = classifyIndexHealth(obs, startMs + i * tickMs, state, { dwellMs });
    state = r.nextState; out.push(r.verdict);
  });
  return out;
}

describe('classifyIndexHealth — no lock', () => {
  it('reports HEALTHY and holds no carry-over state', () => {
    const r = classifyIndexHealth(absent, T0, undefined);
    expect(r.verdict).toBe(VERDICT.HEALTHY);
    expect(r.nextState.firstBlockedAtMs).toBeNull();
  });

  it('an absent lock RESETS an accumulated counter (TS-12, FR-1 AC-6)', () => {
    // Blocked long enough to be JAMMED, then the lock clears: must not latch.
    const seq = runTicks([present('A'), present('A'), present('A'), present('A'), absent]);
    expect(seq[3]).toBe(VERDICT.JAMMED);
    expect(seq[4]).toBe(VERDICT.HEALTHY);
  });
});

describe('classifyIndexHealth — a single lock persisting (TS-3)', () => {
  it('is HEALTHY under the dwell floor and JAMMED once it is crossed', () => {
    // 30s ticks, 90s floor: blocked at t=0 -> JAMMED first at t=90s, the 4th tick.
    expect(runTicks([present('A'), present('A'), present('A'), present('A')]))
      .toEqual([VERDICT.HEALTHY, VERDICT.HEALTHY, VERDICT.HEALTHY, VERDICT.JAMMED]);
  });

  it('reports the duration it was actually held, not the tick count (TS-11, FR-2 AC-3)', () => {
    let s;
    let r = classifyIndexHealth(present('A'), T0, s); s = r.nextState;
    r = classifyIndexHealth(present('A'), T0 + 120 * SEC, s);
    expect(r.verdict).toBe(VERDICT.JAMMED);
    expect(r.jammedForMs).toBe(120 * SEC);
  });

  it('crosses exactly AT the floor, not one tick late', () => {
    let s;
    let r = classifyIndexHealth(present('A'), T0, s); s = r.nextState;
    const justUnder = classifyIndexHealth(present('A'), T0 + DEFAULT_DWELL_MS - 1, s);
    const exactly = classifyIndexHealth(present('A'), T0 + DEFAULT_DWELL_MS, s);
    expect(justUnder.verdict).toBe(VERDICT.HEALTHY);
    expect(exactly.verdict).toBe(VERDICT.JAMMED);
  });
});

describe('TS-17a — PRESENCE IS NOT PERSISTENCE (the primary negative control)', () => {
  it('sustained healthy churn stays HEALTHY though a lock is present at EVERY tick', () => {
    // Mirrors the measurement: lock present at every tick, identity changing as each add finishes.
    // Ten ticks at 30s spans 270s, far beyond the 90s floor — a presence-only classifier reports
    // JAMMED here and fails. This is the assertion that distinguishes this detector.
    const seq = runTicks([
      present('A'), present('A'), present('B'), present('B'),
      present('C'), present('C'), present('D'), present('D'),
      present('E'), present('E'),
    ]);
    expect(seq).toEqual(Array(10).fill(VERDICT.HEALTHY));
  });

  it('a changed identity RESETS the counter even mid-accumulation (FR-1 AC-7)', () => {
    const seq = runTicks([present('A'), present('A'), present('A'), present('B'), present('B')]);
    expect(seq[2]).toBe(VERDICT.HEALTHY);
    expect(seq[3]).toBe(VERDICT.HEALTHY); // B is a new lock — clock restarts
    expect(seq[4]).toBe(VERDICT.HEALTHY);
  });

  it('one long-lived lock JAMS while the same number of ticks of churn does NOT', () => {
    // Same tick count, same elapsed time — the ONLY variable is identity stability.
    const jammed = runTicks([present('A'), present('A'), present('A'), present('A')]);
    const churn = runTicks([present('A'), present('B'), present('C'), present('D')]);
    expect(jammed).toContain(VERDICT.JAMMED);
    expect(churn).not.toContain(VERDICT.JAMMED);
  });

  it('a null identity is never treated as sameness', () => {
    // Two observations that both fail to yield an identity must not be assumed to be one lock.
    const seq = runTicks([present(null), present(null), present(null), present(null)]);
    expect(seq).not.toContain(VERDICT.JAMMED);
  });
});

describe('UNAVAILABLE — never health, never a reset (TS-4, TS-18, FR-1 AC-9)', () => {
  it('an observation error reports UNAVAILABLE rather than HEALTHY', () => {
    const r = classifyIndexHealth({ error: 'EACCES: permission denied' }, T0, undefined);
    expect(r.verdict).toBe(VERDICT.UNAVAILABLE);
    expect(r.verdict).not.toBe(VERDICT.HEALTHY);
    expect(r.reason).toMatch(/EACCES/);
  });

  it('PRESERVES the counter through a blip: BLOCKED -> UNAVAILABLE -> BLOCKED still jams', () => {
    // Without this, recurring transient stat failures mean a real jam is never reported.
    let s;
    let r = classifyIndexHealth(present('A'), T0, s); s = r.nextState;
    r = classifyIndexHealth({ error: 'EBUSY' }, T0 + 30 * SEC, s); s = r.nextState;
    expect(r.verdict).toBe(VERDICT.UNAVAILABLE);
    r = classifyIndexHealth(present('A'), T0 + 120 * SEC, s);
    expect(r.verdict).toBe(VERDICT.JAMMED);
    expect(r.jammedForMs).toBe(120 * SEC); // clock ran from the ORIGINAL block, not the recovery
  });

  it('is not counted as a jam for exit-code purposes', () => {
    expect(exitCodeFor(VERDICT.UNAVAILABLE)).toBe(0);
  });
});

describe('lockIdentityOf', () => {
  it('is stable for one lock and distinct between locks', () => {
    expect(lockIdentityOf({ mtimeMs: 100, ino: 7 })).toBe(lockIdentityOf({ mtimeMs: 100, ino: 7 }));
    expect(lockIdentityOf({ mtimeMs: 100, ino: 7 })).not.toBe(lockIdentityOf({ mtimeMs: 101, ino: 7 }));
    expect(lockIdentityOf({ mtimeMs: 100, ino: 7 })).not.toBe(lockIdentityOf({ mtimeMs: 100, ino: 8 }));
  });

  it('does NOT derive identity from birthtime — NTFS file tunneling makes it non-unique', () => {
    // Measured: three files created ~1.2s apart with DIFFERENT inodes reported an IDENTICAL
    // birthtimeMs. A birthtime-based identity collapses distinct locks into one and rebuilds the
    // presence-only false positive.
    const a = { mtimeMs: 100, ino: 7, birthtimeMs: 5000 };
    const b = { mtimeMs: 200, ino: 8, birthtimeMs: 5000 }; // same birthtime, different lock
    expect(lockIdentityOf(a)).not.toBe(lockIdentityOf(b));
  });

  it('returns null for a missing stat rather than a fabricated token', () => {
    expect(lockIdentityOf(null)).toBeNull();
  });
});

describe('exit code contract (TS-8)', () => {
  it('only JAMMED is non-zero', () => {
    expect(exitCodeFor(VERDICT.JAMMED)).toBe(1);
    expect(exitCodeFor(VERDICT.HEALTHY)).toBe(0);
    expect(exitCodeFor(VERDICT.UNAVAILABLE)).toBe(0);
  });
});

describe('TS-7 — the detector is not itself an undrained detector (FR-4)', () => {
  it('has a DRAIN_DESCRIPTORS entry naming a consumer, a closing path and a predicate', async () => {
    // PURE structural assertion — no database. drain-inventory.mjs is DB-dependent and the db
    // vitest project resolves to ZERO files, so a DB-tier test here would never execute.
    const { DRAIN_DESCRIPTORS } = await import('../../../lib/governance/gauge-registry.js');
    const d = DRAIN_DESCRIPTORS['index-jam-detector'];
    expect(d, 'the detector must be declared or the drain inventory flags it NO_CONSUMER').toBeTruthy();
    expect(d.consumer).toBeTruthy();
    expect(d.closingPath).toBeTruthy();
    expect(d.predicate).toMatch(/persist/i);
    // The shape contract must point readers at the exit code, not at parsing the message.
    expect(d.shapeContract).toMatch(/exit code/i);
    // And it must record that lock presence is NOT the signal — the measured correction.
    expect(d.fieldQuestion).toMatch(/lock presence is a false signal|does NOT answer/i);
  });
});

describe('formatVerdict (FR-2)', () => {
  it('names the tree and the duration, and says it is a shared-resource condition', () => {
    const msg = formatVerdict('C:/repo', { verdict: VERDICT.JAMMED, jammedForMs: 189 * 60 * SEC });
    expect(msg).toContain('C:/repo');
    expect(msg).toContain('189.0 min');
    expect(msg).toMatch(/SHARED-RESOURCE/i);
    expect(msg).toMatch(/not a fault in your command/i);
  });

  it('does not present UNAVAILABLE as a health verdict', () => {
    const msg = formatVerdict('C:/repo', { verdict: VERDICT.UNAVAILABLE, reason: 'EACCES' });
    expect(msg).toMatch(/UNAVAILABLE/);
    expect(msg).toMatch(/Not a health verdict/i);
  });
});
