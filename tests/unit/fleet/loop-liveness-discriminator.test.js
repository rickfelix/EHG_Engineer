/**
 * SD-LEO-INFRA-LOOP-LIVENESS-DISCRIMINATOR-001 FR-1 — the shared loop-liveness discriminator.
 *
 * classifyLoopLiveness (fail-open, 4-state, for alarm consumers) and
 * classifyLoopLivenessStrict (non-fail-open, exposes classifySeat's raw verdict, for
 * singleton-actuation consumers) are both additive exports on lib/fleet/genuine-worker.mjs,
 * composed from the already-shipped isKnownWedged/classifySeat rather than a new classifier.
 */
import { describe, it, expect } from 'vitest';
import { classifyLoopLiveness, classifyLoopLivenessStrict } from '../../../lib/fleet/genuine-worker.mjs';

const CUT = 60; // minutes, explicit (classifySeat has no default and refuses to run without one)
const NOW = Date.parse('2026-09-06T00:00:00Z');
const minutesAgo = (m) => new Date(NOW - m * 60 * 1000).toISOString();

describe('classifyLoopLiveness (fail-open, alarm-appropriate)', () => {
  it('DEAD-LOOP: loop_state=active, tool-silent past the cut', () => {
    const s = { session_id: 'a', loop_state: 'active', last_tool_at: minutesAgo(90) };
    expect(classifyLoopLiveness(s, { nowMs: NOW, cutMinutes: CUT })).toBe('DEAD-LOOP');
  });

  it('DEAD-LOOP: loop_state=awaiting_tick, tool-silent past the cut, wake armed_overdue', () => {
    const s = {
      session_id: 'b', loop_state: 'awaiting_tick', last_tool_at: minutesAgo(90),
      metadata: { expected_wake_at: minutesAgo(10) },
    };
    expect(classifyLoopLiveness(s, { nowMs: NOW, cutMinutes: CUT })).toBe('DEAD-LOOP');
  });

  // The already-corrected defect (isKnownWedged's own docstring "CORRECTED DEFECT #1"):
  // a parked seat whose wakeup deadline was never recorded (or is still pending) must stay
  // LIVE, not DEAD-LOOP, even though the tool clock alone reads stuck.
  it('NOT DEAD-LOOP: loop_state=awaiting_tick, tool-silent past the cut, but wake not_recorded (parked, not dead)', () => {
    const s = { session_id: 'c', loop_state: 'awaiting_tick', last_tool_at: minutesAgo(90) };
    expect(classifyLoopLiveness(s, { nowMs: NOW, cutMinutes: CUT })).not.toBe('DEAD-LOOP');
    expect(['LIVE-ENGAGED', 'LIVE-IDLE']).toContain(classifyLoopLiveness(s, { nowMs: NOW, cutMinutes: CUT }));
  });

  it('NOT DEAD-LOOP: loop_state=awaiting_tick, wake armed_pending (deadline not yet due)', () => {
    const s = {
      session_id: 'c2', loop_state: 'awaiting_tick', last_tool_at: minutesAgo(90),
      metadata: { expected_wake_at: minutesAgo(-10) }, // 10 min in the future
    };
    expect(classifyLoopLiveness(s, { nowMs: NOW, cutMinutes: CUT })).not.toBe('DEAD-LOOP');
  });

  it('LIVE-ENGAGED: healthy (tool recent), claimed', () => {
    const s = { session_id: 'd', loop_state: 'active', last_tool_at: minutesAgo(1) };
    expect(classifyLoopLiveness(s, { isClaimed: () => true, nowMs: NOW, cutMinutes: CUT })).toBe('LIVE-ENGAGED');
  });

  it('LIVE-IDLE: healthy (tool recent), not claimed', () => {
    const s = { session_id: 'e', loop_state: 'active', last_tool_at: minutesAgo(1) };
    expect(classifyLoopLiveness(s, { isClaimed: () => false, nowMs: NOW, cutMinutes: CUT })).toBe('LIVE-IDLE');
  });

  it('LIVE-IDLE: no isClaimed supplied at all defaults to idle, never a crash', () => {
    const s = { session_id: 'f', loop_state: 'active', last_tool_at: minutesAgo(1) };
    expect(classifyLoopLiveness(s, { nowMs: NOW, cutMinutes: CUT })).toBe('LIVE-IDLE');
  });

  it('UNKNOWN: missing last_tool_at (never silently coerced to a live state)', () => {
    const s = { session_id: 'g', loop_state: 'active', last_tool_at: null };
    expect(classifyLoopLiveness(s, { isClaimed: () => true, nowMs: NOW, cutMinutes: CUT })).toBe('UNKNOWN');
  });

  it('UNKNOWN: missing loop_state entirely', () => {
    const s = { session_id: 'h', last_tool_at: minutesAgo(1) };
    expect(classifyLoopLiveness(s, { isClaimed: () => true, nowMs: NOW, cutMinutes: CUT })).toBe('UNKNOWN');
  });

  it('UNKNOWN: null/undefined session (fail-open toward UNKNOWN, never a crash)', () => {
    expect(classifyLoopLiveness(null, { nowMs: NOW })).toBe('UNKNOWN');
    expect(classifyLoopLiveness(undefined, { nowMs: NOW })).toBe('UNKNOWN');
  });
});

describe('classifyLoopLivenessStrict (non-fail-open, actuation-appropriate)', () => {
  it('agrees with classifyLoopLiveness on the raw verdict direction for a confirmed dead loop', () => {
    const s = { session_id: 'i', loop_state: 'active', last_tool_at: minutesAgo(90) };
    expect(classifyLoopLivenessStrict(s, NOW, CUT)).toBe('STUCK');
    expect(classifyLoopLiveness(s, { nowMs: NOW, cutMinutes: CUT })).toBe('DEAD-LOOP');
  });

  it('returns HEALTHY for a live session (does not require loop_state -- classifySeat itself never reads it)', () => {
    const s = { session_id: 'j', last_tool_at: minutesAgo(1) };
    expect(classifyLoopLivenessStrict(s, NOW, CUT)).toBe('HEALTHY');
  });

  it('returns UNKNOWN, never a fabricated verdict, when last_tool_at is unreadable', () => {
    const s = { session_id: 'k', last_tool_at: null };
    expect(classifyLoopLivenessStrict(s, NOW, CUT)).toBe('UNKNOWN');
  });

  it('STUCK even on the parked-arm case that classifyLoopLiveness reports as live -- the two views deliberately disagree on OUTPUT VOCABULARY, never on the underlying raw signal', () => {
    const s = { session_id: 'l', loop_state: 'awaiting_tick', last_tool_at: minutesAgo(90) };
    expect(classifyLoopLivenessStrict(s, NOW, CUT)).toBe('STUCK');
  });
});
