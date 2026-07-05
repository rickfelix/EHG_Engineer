/**
 * claim-boundary-probe.test.js — SD-LEO-INFRA-CLAIM-BOUNDARY-PRE-001 (TS-5, TS-6).
 *
 * Pure-predicate matrix + the T1 replay of the four historical freeze events
 * (2026-07-04→05). No DB, no clock reads — every input is explicit, which is the
 * whole point of the pure predicate: the replay feeds recorded signatures straight
 * through and asserts the probe would have caught all four.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  evaluateClaimBoundary,
  probeWindowMs,
  boundaryGraceMs,
  isProbeEnabled,
  DEFAULT_PROBE_WINDOW_MINUTES,
  CLOCK_SKEW_TOLERANCE_MS,
} = require('../../../lib/fleet/claim-boundary-probe.cjs');

const MIN = 60_000;
const T0 = 1_800_000_000_000; // fixed epoch base — no wall-clock reads anywhere

/** Baseline MISS-shaped input; tests override single fields to isolate each guard. */
function baseInput(overrides = {}) {
  return {
    nowMs: T0 + 9 * MIN,
    anchorMs: T0,
    anchorType: 'claim',
    lastToolAtMs: T0 + 5_000, // claim-executing tool call lands seconds after the anchor
    outboundSinceAnchor: 0,
    expectedSilenceUntilMs: null,
    currentToolExpectedEndMs: null,
    probeWindowMs: 8 * MIN,
    boundaryGraceMs: 120_000,
    ...overrides,
  };
}

describe('evaluateClaimBoundary — MISS direction', () => {
  it('flags the freeze signature: window elapsed, tools stopped at the boundary, zero outbound', () => {
    const r = evaluateClaimBoundary(baseInput());
    expect(r.verdict).toBe('MISS');
    expect(r.reason).toBe('zero_activity_since_boundary');
  });

  it('flags when last tool activity is entirely BEFORE the anchor (post-handoff freeze)', () => {
    const r = evaluateClaimBoundary(baseInput({ anchorType: 'handoff', lastToolAtMs: T0 - 3 * MIN }));
    expect(r.verdict).toBe('MISS');
  });

  it('evidence captures every input at decision time (AC-4 audit contract)', () => {
    const r = evaluateClaimBoundary(baseInput());
    expect(r.evidence).toMatchObject({
      anchor_ms: T0,
      anchor_type: 'claim',
      last_tool_at_ms: T0 + 5_000,
      outbound_since_anchor: 0,
      probe_window_ms: 8 * MIN,
      boundary_grace_ms: 120_000,
    });
  });
});

describe('evaluateClaimBoundary — PASS guards (TS-2 false-positive matrix)', () => {
  it('window not yet elapsed since anchor', () => {
    const r = evaluateClaimBoundary(baseInput({ nowMs: T0 + 7 * MIN }));
    expect(r).toMatchObject({ verdict: 'PASS', reason: 'window_not_elapsed' });
  });

  it('recent tool activity anywhere', () => {
    const r = evaluateClaimBoundary(baseInput({ lastToolAtMs: T0 + 6 * MIN }));
    expect(r).toMatchObject({ verdict: 'PASS', reason: 'recent_tool_activity' });
  });

  it('progressed past the boundary then went tool-quiet (long model turn mid-build ≠ boundary freeze)', () => {
    // Tools continued 30min past the anchor, then a long think. NOT the freeze class.
    const r = evaluateClaimBoundary(baseInput({
      nowMs: T0 + 40 * MIN,
      lastToolAtMs: T0 + 30 * MIN,
    }));
    expect(r).toMatchObject({ verdict: 'PASS', reason: 'progressed_past_boundary' });
  });

  it('declared silence window in the future (parked worker)', () => {
    const r = evaluateClaimBoundary(baseInput({ expectedSilenceUntilMs: T0 + 20 * MIN }));
    expect(r).toMatchObject({ verdict: 'PASS', reason: 'declared_silence_window' });
  });

  it('in-flight long tool (expected end in the future)', () => {
    const r = evaluateClaimBoundary(baseInput({ currentToolExpectedEndMs: T0 + 30 * MIN }));
    expect(r).toMatchObject({ verdict: 'PASS', reason: 'tool_in_flight' });
  });

  it('outbound comms since anchor (dual-signal guard: thinking sessions that signal stay alive)', () => {
    const r = evaluateClaimBoundary(baseInput({ outboundSinceAnchor: 1 }));
    expect(r).toMatchObject({ verdict: 'PASS', reason: 'outbound_comms_since_anchor' });
  });

  it('boundary edge: MISS begins exactly when the last tool call has been silent a full window', () => {
    // Dual condition: BOTH anchor-age ≥ window AND tool-silence ≥ window. The last
    // tool call landed at anchor+5s, so the true MISS edge is lastToolAt + window.
    const missEdge = T0 + 5_000 + 8 * MIN;
    expect(evaluateClaimBoundary(baseInput({ nowMs: missEdge })).verdict).toBe('MISS');
    expect(evaluateClaimBoundary(baseInput({ nowMs: missEdge - 1 })).verdict).toBe('PASS');
  });

  it('boundary-grace edge: last tool exactly at anchor+grace is still the freeze class; past it is not', () => {
    const grace = 120_000;
    expect(evaluateClaimBoundary(baseInput({
      nowMs: T0 + 20 * MIN, lastToolAtMs: T0 + grace,
    })).verdict).toBe('MISS');
    expect(evaluateClaimBoundary(baseInput({
      nowMs: T0 + 20 * MIN, lastToolAtMs: T0 + grace + 1,
    })).verdict).toBe('PASS');
  });
});

describe('evaluateClaimBoundary — UNKNOWN never releases (TS-3, TS-6)', () => {
  it('NULL last_tool_at (pre-rollout hook) → UNKNOWN, never MISS', () => {
    const r = evaluateClaimBoundary(baseInput({ lastToolAtMs: null }));
    expect(r).toMatchObject({ verdict: 'UNKNOWN', reason: 'last_tool_at_never_written' });
  });

  it('future last_tool_at beyond skew tolerance (SECURITY clock-skew condition) → UNKNOWN', () => {
    const r = evaluateClaimBoundary(baseInput({
      lastToolAtMs: T0 + 9 * MIN + CLOCK_SKEW_TOLERANCE_MS + 1,
    }));
    expect(r).toMatchObject({ verdict: 'UNKNOWN', reason: 'last_tool_at_in_future' });
  });

  it('missing anchor → UNKNOWN', () => {
    const r = evaluateClaimBoundary(baseInput({ anchorMs: null }));
    expect(r).toMatchObject({ verdict: 'UNKNOWN', reason: 'anchor_missing' });
  });

  it('failed outbound count (null) → UNKNOWN — a broken count query must not become a release', () => {
    const r = evaluateClaimBoundary(baseInput({ outboundSinceAnchor: null }));
    expect(r).toMatchObject({ verdict: 'UNKNOWN', reason: 'outbound_count_unavailable' });
  });

  it('missing nowMs → UNKNOWN', () => {
    const r = evaluateClaimBoundary(baseInput({ nowMs: undefined }));
    expect(r.verdict).toBe('UNKNOWN');
  });

  it('verdict set is closed: every ambiguous input lands in UNKNOWN/PASS, never MISS', () => {
    const ambiguous = [
      baseInput({ lastToolAtMs: null }),
      baseInput({ anchorMs: NaN }),
      baseInput({ outboundSinceAnchor: undefined }),
      baseInput({ nowMs: NaN }),
    ];
    for (const input of ambiguous) {
      expect(evaluateClaimBoundary(input).verdict).not.toBe('MISS');
    }
  });
});

describe('T1 replay — the four 2026-07-04→05 freeze events (TS-5, AC-5)', () => {
  // Recorded signatures: process alive + heartbeat fresh in ALL four (deliberately
  // NOT predicate inputs — the tick lies), zero tool calls after the boundary, zero
  // outbound, no declared silence, no in-flight tool. Three phase-points across
  // three windows; one window froze twice (fresh claim, re-claim after manual fence).
  const replayWindow = DEFAULT_PROBE_WINDOW_MINUTES * MIN;
  const EVENTS = [
    {
      label: 'freeze#1 fresh-claim LEAD entry (window A)',
      anchorType: 'claim',
      anchorMs: T0,
      lastToolAtMs: T0 + 8_000,        // the claim-executing checkin Bash call
      probeAtMs: T0 + replayWindow + 60_000,
    },
    {
      label: 'freeze#2 resumed PLAN_VERIFICATION entry (window B) — EXEC-TO-PLAN handoff just accepted',
      anchorType: 'handoff',
      anchorMs: T0 + 50 * MIN,
      lastToolAtMs: T0 + 50 * MIN + 20_000, // handoff.js Bash call returned, then silence
      probeAtMs: T0 + 50 * MIN + replayWindow + 2 * MIN,
    },
    {
      label: 'freeze#3 post-handoff (window C)',
      anchorType: 'handoff',
      anchorMs: T0 + 120 * MIN,
      lastToolAtMs: T0 + 120 * MIN + 45_000,
      probeAtMs: T0 + 120 * MIN + replayWindow + 5 * MIN,
    },
    {
      label: 'freeze#4 re-claim after manual fence (window A again)',
      anchorType: 'claim',
      anchorMs: T0 + 300 * MIN,
      lastToolAtMs: T0 + 300 * MIN + 4_000,
      probeAtMs: T0 + 300 * MIN + replayWindow + 60_000,
    },
  ];

  it.each(EVENTS)('$label → MISS within the default window', (ev) => {
    const r = evaluateClaimBoundary({
      nowMs: ev.probeAtMs,
      anchorMs: ev.anchorMs,
      anchorType: ev.anchorType,
      lastToolAtMs: ev.lastToolAtMs,
      outboundSinceAnchor: 0,
      expectedSilenceUntilMs: null,
      currentToolExpectedEndMs: null,
    });
    expect(r.verdict).toBe('MISS');
    expect(r.reason).toBe('zero_activity_since_boundary');
  });
});

describe('config parsing (TR-2 fail-open)', () => {
  it('window: default 8min, env override, garbage falls back', () => {
    expect(probeWindowMs({})).toBe(8 * MIN);
    expect(probeWindowMs({ CLAIM_BOUNDARY_PROBE_MINUTES: '12' })).toBe(12 * MIN);
    expect(probeWindowMs({ CLAIM_BOUNDARY_PROBE_MINUTES: 'nope' })).toBe(8 * MIN);
    expect(probeWindowMs({ CLAIM_BOUNDARY_PROBE_MINUTES: '-3' })).toBe(8 * MIN);
  });

  it('grace: default 120s, env override', () => {
    expect(boundaryGraceMs({})).toBe(120_000);
    expect(boundaryGraceMs({ CLAIM_BOUNDARY_PROBE_BOUNDARY_GRACE_SECONDS: '60' })).toBe(60_000);
  });

  it('kill-switch: enabled by default; false/0/off disable; anything else stays on', () => {
    expect(isProbeEnabled({})).toBe(true);
    expect(isProbeEnabled({ CLAIM_BOUNDARY_PROBE_ENABLED: 'false' })).toBe(false);
    expect(isProbeEnabled({ CLAIM_BOUNDARY_PROBE_ENABLED: '0' })).toBe(false);
    expect(isProbeEnabled({ CLAIM_BOUNDARY_PROBE_ENABLED: 'off' })).toBe(false);
    expect(isProbeEnabled({ CLAIM_BOUNDARY_PROBE_ENABLED: 'true' })).toBe(true);
    expect(isProbeEnabled({ CLAIM_BOUNDARY_PROBE_ENABLED: 'weird' })).toBe(true);
  });
});

describe('single-writer contract canary (SECURITY condition 1)', () => {
  it('last_tool_at is allowlisted in writeTelemetry but NOT writeTelemetryAwait (session-tick path)', () => {
    // Contract check by construction: the fire-and-forget writeTelemetry (PostToolUse
    // hooks) must accept last_tool_at; the awaitable variant — session-tick's path —
    // must silently DROP it, or the tick would re-create the exact contamination that
    // broke heartbeat_at/process_alive_at. We assert against the source because the
    // writers are fire-and-forget HTTP with no injectable transport seam.
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../scripts/hooks/lib/session-telemetry-writer.cjs'), 'utf8');
    const fireAndForget = src.slice(src.indexOf('function writeTelemetry('), src.indexOf('async function writeTelemetryAwait('));
    const awaitVariant = src.slice(src.indexOf('async function writeTelemetryAwait('));
    expect(fireAndForget).toContain("'last_tool_at'");
    expect(awaitVariant).not.toContain("'last_tool_at'");
  });
});
