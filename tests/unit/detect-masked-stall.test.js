/**
 * SD-FDBK-INFRA-STALL-AFTER-COMPLETION-001 — detectMaskedStall + maskedStallSessionIds.
 * The confirmed (dead-tick) subset of STALLED_LOOP: a fresh heartbeat (live parent) masking a dead
 * loop (stale process_alive_at), holding no claim while ranked work waits. Must never flag a healthy
 * or parked worker (the action is operator escalation, never reaping a live-parent session).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { detectMaskedStall, maskedStallSessionIds, DEFAULT_MASKED_STALL_PROCESS_STALE_MS } =
  require('../../lib/coordinator/detectors.cjs');

const NOW = 1_000_000_000_000;
const ago = (ms) => new Date(NOW - ms).toISOString();
const FRESH = 30 * 1000;            // 30s — fresh
const STALE_TICK = 30 * 60 * 1000;  // 30m — tick dead

// A masked-stalled worker: parent alive (fresh hb), tick dead (stale process_alive_at), active loop, no claim.
const masked = (over = {}) => ({
  session_id: 'sess-masked', loop_state: 'active', sd_key: null,
  heartbeat_at: ago(FRESH), process_alive_at: ago(STALE_TICK), expected_silence_until: null, ...over,
});
const base = (sessions, over = {}) => ({ sessions, unclaimedItems: 3, now: NOW, ...over });

describe('detectMaskedStall — matches the confirmed dead-tick stall', () => {
  it('flags fresh-heartbeat + stale-process_alive + active + no-claim + work', () => {
    const r = detectMaskedStall(base([masked()]));
    expect(r.matched).toBe(true);
    expect(r.reason).toMatch(/masks_dead_loop/);
    expect(r.evidence.samples[0].session_id).toBe('sess-masked');
  });

  it('maskedStallSessionIds returns the flagged id', () => {
    const ids = maskedStallSessionIds(base([masked()]));
    expect(ids.has('sess-masked')).toBe(true);
  });
});

describe('detectMaskedStall — never flags healthy / parked / claimed (no fleet self-harm)', () => {
  it('does NOT flag a healthy worker (BOTH heartbeat and process_alive fresh)', () => {
    expect(detectMaskedStall(base([masked({ process_alive_at: ago(FRESH) })])).matched).toBe(false);
  });

  it('does NOT flag when heartbeat is stale (parent not proven alive — sweep territory, not a MASKED stall)', () => {
    expect(detectMaskedStall(base([masked({ heartbeat_at: ago(20 * 60 * 1000) })])).matched).toBe(false);
  });

  it('does NOT flag a worker holding a claim', () => {
    expect(detectMaskedStall(base([masked({ sd_key: 'SD-X' })])).matched).toBe(false);
  });

  it('does NOT flag a non-active loop_state (awaiting_tick / exited)', () => {
    expect(detectMaskedStall(base([masked({ loop_state: 'awaiting_tick' })])).matched).toBe(false);
    expect(detectMaskedStall(base([masked({ loop_state: 'exited' })])).matched).toBe(false);
  });

  it('does NOT flag a legitimately parked worker (future expected_silence_until)', () => {
    expect(detectMaskedStall(base([masked({ expected_silence_until: new Date(NOW + 60_000).toISOString() })])).matched).toBe(false);
  });
});

describe('detectMaskedStall — belt-empty + fail-open guards', () => {
  it('returns no_unclaimed_work when the belt is empty (no false positive on an idle fleet)', () => {
    const r = detectMaskedStall(base([masked()], { unclaimedItems: 0 }));
    expect(r).toMatchObject({ matched: false, reason: 'no_unclaimed_work' });
  });

  it('fail-open: skips a session missing process_alive_at', () => {
    expect(detectMaskedStall(base([masked({ process_alive_at: null })])).matched).toBe(false);
  });

  it('fail-open: skips a session missing heartbeat_at', () => {
    expect(detectMaskedStall(base([masked({ heartbeat_at: null })])).matched).toBe(false);
  });

  it('respects a custom processStaleMs threshold', () => {
    // tick 2m stale; default 5m threshold → fresh-enough → not flagged
    const r1 = detectMaskedStall(base([masked({ process_alive_at: ago(2 * 60 * 1000) })]));
    expect(r1.matched).toBe(false);
    // with a 1m threshold the same 2m-stale tick IS dead → flagged
    const r2 = detectMaskedStall(base([masked({ process_alive_at: ago(2 * 60 * 1000) })], { processStaleMs: 60 * 1000 }));
    expect(r2.matched).toBe(true);
  });

  it('exposes a sane default tick-dead threshold', () => {
    expect(DEFAULT_MASKED_STALL_PROCESS_STALE_MS).toBe(5 * 60 * 1000);
  });
});
