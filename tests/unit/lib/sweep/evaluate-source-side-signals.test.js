// SD-ARCH-HOTSPOT-SWEEP-001 (PRD FR-2 / TS-3): evaluateSourceSideSignals was promoted
// from a main()-local closure to a module-level pure helper in
// scripts/stale-session-sweep.cjs. This is the CRITICAL boundary risk-agent flagged:
// it is a classification INPUT (feeds the ALIVE_SOURCE_SIDE branch of the session
// status ladder), never an ordered registry pass running after classification — if it
// ran post-classification, a source-side-alive worker would already be misclassified
// dormant/dead by the time it ran, causing a false claim release.
//
// This test asserts the promoted function still derives ALIVE_SOURCE_SIDE correctly
// from a source-side-alive telemetry fixture, proving the promotion preserved behavior.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { evaluateSourceSideSignals, TICK_ALIVE_WINDOW_MS } = require('../../../../scripts/stale-session-sweep.cjs');

describe('evaluateSourceSideSignals (SD-ARCH-HOTSPOT-SWEEP-001 / TS-3)', () => {
  it('is a pure function taking telemetryMap explicitly (not a closure)', () => {
    expect(typeof evaluateSourceSideSignals).toBe('function');
    expect(evaluateSourceSideSignals.length).toBe(3); // (telemetryMap, sessionId, nowMs)
  });

  it('returns alive=true when process_alive_at is within TICK_ALIVE_WINDOW_MS', () => {
    const nowMs = Date.parse('2026-07-09T12:00:00.000Z');
    const telemetryMap = new Map([
      ['sess-1', { process_alive_at: new Date(nowMs - 10_000).toISOString() }],
    ]);
    const result = evaluateSourceSideSignals(telemetryMap, 'sess-1', nowMs);
    expect(result).not.toBeNull();
    expect(result.alive).toBe(true);
    expect(result.reason).toMatch(/tick alive/);
  });

  it('returns null (not alive) when process_alive_at is older than TICK_ALIVE_WINDOW_MS', () => {
    const nowMs = Date.parse('2026-07-09T12:00:00.000Z');
    const telemetryMap = new Map([
      ['sess-1', { process_alive_at: new Date(nowMs - (TICK_ALIVE_WINDOW_MS + 5_000)).toISOString() }],
    ]);
    const result = evaluateSourceSideSignals(telemetryMap, 'sess-1', nowMs);
    expect(result).toBeNull();
  });

  it('returns alive=true when expected_silence_until is in the future (within the shared hard cap)', () => {
    const nowMs = Date.parse('2026-07-09T12:00:00.000Z');
    const telemetryMap = new Map([
      ['sess-1', { expected_silence_until: new Date(nowMs + 60_000).toISOString() }],
    ]);
    const result = evaluateSourceSideSignals(telemetryMap, 'sess-1', nowMs);
    expect(result).not.toBeNull();
    expect(result.alive).toBe(true);
    expect(result.reason).toMatch(/silent until/);
  });

  it('returns alive=true when a tool is expected to still be running', () => {
    const nowMs = Date.parse('2026-07-09T12:00:00.000Z');
    const telemetryMap = new Map([
      ['sess-1', { current_tool_expected_end_at: new Date(nowMs + 30_000).toISOString(), current_tool: 'Bash' }],
    ]);
    const result = evaluateSourceSideSignals(telemetryMap, 'sess-1', nowMs);
    expect(result).not.toBeNull();
    expect(result.alive).toBe(true);
    expect(result.reason).toMatch(/tool Bash expected until/);
  });

  it('returns null when the session has no telemetry row at all', () => {
    const nowMs = Date.parse('2026-07-09T12:00:00.000Z');
    const telemetryMap = new Map();
    expect(evaluateSourceSideSignals(telemetryMap, 'sess-unknown', nowMs)).toBeNull();
  });

  it('returns null when all three signals are absent or expired', () => {
    const nowMs = Date.parse('2026-07-09T12:00:00.000Z');
    const telemetryMap = new Map([
      ['sess-1', { expected_silence_until: new Date(nowMs - 60_000).toISOString(), process_alive_at: null, current_tool_expected_end_at: null }],
    ]);
    expect(evaluateSourceSideSignals(telemetryMap, 'sess-1', nowMs)).toBeNull();
  });
});
