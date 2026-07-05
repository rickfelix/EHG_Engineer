/**
 * claim-boundary-probe.cjs — pure predicate for the claim-boundary pre-flight probe.
 * SD-LEO-INFRA-CLAIM-BOUNDARY-PRE-001 (FR-2).
 *
 * THE FAILURE CLASS: a window-level interactive prompt (session-limit / trust /
 * updater dialog) blocks the harness exactly at a claim/transition boundary — the
 * first heavy tool burst after idle. Signature: process alive, heartbeat fresh
 * (session-tick keeps PATCHing it), ZERO tool calls after the boundary. Four such
 * freezes across three windows on 2026-07-04→05, each costing a worker for hours.
 *
 * WHY THESE INPUTS (signal-source verification, LEAD 2026-07-05):
 *   - last_tool_at is the ONLY tick-immune activity clock (written solely by the
 *     every-tool PostToolUse hook). heartbeat_at has 3 tool-driven writers PLUS the
 *     30s session-tick; process_alive_at is tick-written and freezes on Windows.
 *     Neither can distinguish "prompt-blocked" from "working".
 *   - The claim itself lands via a Bash tool call, so last_tool_at moves a few
 *     seconds AFTER claimed_at — a strict lastToolAt < anchor test would miss every
 *     fresh-claim freeze. Hence BOUNDARY GRACE: the freeze signature is "last tool
 *     activity within a small neighborhood of the boundary, then silence", not
 *     "no activity at all".
 *
 * VERDICTS (closed set):
 *   MISS    — probe failed: the session froze at the boundary; caller releases.
 *   PASS    — activity/precedence evidence says leave it alone.
 *   UNKNOWN — an input is missing/ambiguous; NEVER release on UNKNOWN (fail-open:
 *             pre-rollout sessions whose hook never wrote last_tool_at, clock skew,
 *             absent anchor). Unknown fails safe to no-action, never to release.
 *
 * All time inputs are epoch milliseconds; the function does no I/O and never reads
 * the wall clock (callers pass nowMs), so the T1 replay test feeds the four
 * historical freeze signatures straight through.
 */

'use strict';

/** Probe window: how long the boundary may stay tool-silent before MISS. */
const DEFAULT_PROBE_WINDOW_MINUTES = 8;
/**
 * Boundary neighborhood: last tool activity at most this far after the anchor
 * still reads as "stopped AT the boundary". Covers the claim/handoff-executing
 * tool call itself (lands seconds after the anchor timestamp) without opening
 * the probe to mid-build long-think false positives (a worker 40 min past its
 * boundary with stale tools is NOT this failure class and stays untouched).
 */
const DEFAULT_BOUNDARY_GRACE_SECONDS = 120;
/** Tolerated forward clock skew before a future last_tool_at reads as UNKNOWN. */
const CLOCK_SKEW_TOLERANCE_MS = 5_000;

/** Env-derived probe window (ms). Fail-open to the default on any parse issue. */
function probeWindowMs(env = process.env) {
  const n = Number(env.CLAIM_BOUNDARY_PROBE_MINUTES);
  return Number.isFinite(n) && n > 0 ? n * 60_000 : DEFAULT_PROBE_WINDOW_MINUTES * 60_000;
}

/** Env-derived boundary grace (ms). Fail-open to the default on any parse issue. */
function boundaryGraceMs(env = process.env) {
  const n = Number(env.CLAIM_BOUNDARY_PROBE_BOUNDARY_GRACE_SECONDS);
  return Number.isFinite(n) && n > 0 ? n * 1_000 : DEFAULT_BOUNDARY_GRACE_SECONDS * 1_000;
}

/** Kill-switch: enabled unless explicitly 'false'/'0'/'off'. */
function isProbeEnabled(env = process.env) {
  const v = String(env.CLAIM_BOUNDARY_PROBE_ENABLED ?? '').toLowerCase().trim();
  return !(v === 'false' || v === '0' || v === 'off');
}

/**
 * @param {Object} input
 * @param {number} input.nowMs                       — caller's clock (never read here)
 * @param {number|null} input.anchorMs               — GREATEST(claimed_at, latest handoff created_at)
 * @param {string} [input.anchorType]                — 'claim' | 'handoff' (evidence only)
 * @param {number|null} input.lastToolAtMs           — claude_sessions.last_tool_at (null = never written)
 * @param {number} input.outboundSinceAnchor         — session_coordination rows sent since anchor
 * @param {number|null} [input.expectedSilenceUntilMs]   — declared park/silence window end
 * @param {number|null} [input.currentToolExpectedEndMs] — in-flight long-tool expected end
 * @param {number} [input.probeWindowMs]
 * @param {number} [input.boundaryGraceMs]
 * @returns {{verdict:'MISS'|'PASS'|'UNKNOWN', reason:string, evidence:Object}}
 */
function evaluateClaimBoundary(input) {
  const windowMs = Number.isFinite(input?.probeWindowMs) && input.probeWindowMs > 0
    ? input.probeWindowMs : probeWindowMs();
  const graceMs = Number.isFinite(input?.boundaryGraceMs) && input.boundaryGraceMs > 0
    ? input.boundaryGraceMs : boundaryGraceMs();

  // Number(null) coerces to 0 (a valid epoch!) — every nullable time input must
  // null-check BEFORE coercion or a missing value silently becomes 1970.
  const nowMs = input?.nowMs == null ? NaN : Number(input.nowMs);
  const anchorMs = input?.anchorMs == null ? NaN : Number(input.anchorMs);
  const lastToolAtMs = input?.lastToolAtMs == null ? null : Number(input.lastToolAtMs);

  // Evidence snapshot: every input at decision time, for the audit row (AC-4).
  const evidence = {
    now_ms: nowMs,
    anchor_ms: Number.isFinite(anchorMs) ? anchorMs : null,
    anchor_type: input?.anchorType || null,
    last_tool_at_ms: Number.isFinite(lastToolAtMs) ? lastToolAtMs : null,
    outbound_since_anchor: input?.outboundSinceAnchor,
    expected_silence_until_ms: input?.expectedSilenceUntilMs ?? null,
    current_tool_expected_end_ms: input?.currentToolExpectedEndMs ?? null,
    probe_window_ms: windowMs,
    boundary_grace_ms: graceMs,
  };
  const verdict = (v, reason) => ({ verdict: v, reason, evidence });

  if (!Number.isFinite(nowMs)) return verdict('UNKNOWN', 'now_missing');
  // No anchor = nothing to probe against (claimed_at absent on the row).
  if (!Number.isFinite(anchorMs)) return verdict('UNKNOWN', 'anchor_missing');
  // NULL last_tool_at: pre-rollout session/worktree running the old hook. UNKNOWN,
  // never MISS — the gap self-resolves as trees refresh (TS-3).
  if (lastToolAtMs === null || !Number.isFinite(lastToolAtMs)) {
    return verdict('UNKNOWN', 'last_tool_at_never_written');
  }
  // Clock-skew hardening (SECURITY condition 2): a future timestamp is corrupt
  // input, not proof of activity.
  if (lastToolAtMs > nowMs + CLOCK_SKEW_TOLERANCE_MS) {
    return verdict('UNKNOWN', 'last_tool_at_in_future');
  }

  // Boundary not yet due: the window hasn't elapsed since the anchor.
  if (nowMs - anchorMs < windowMs) return verdict('PASS', 'window_not_elapsed');

  // Recent tool activity anywhere = alive (also covers anchor-age ≥ window with
  // ongoing work).
  if (nowMs - lastToolAtMs < windowMs) return verdict('PASS', 'recent_tool_activity');

  // Session got PAST the boundary (tool calls continued beyond the grace
  // neighborhood) and only later went tool-quiet — a long model turn mid-build,
  // not the boundary-freeze class. Structural false-positive guard.
  if (lastToolAtMs > anchorMs + graceMs) return verdict('PASS', 'progressed_past_boundary');

  // Declared silence window in the future wins (parked worker) — precedence
  // parity with the sweep's ALIVE_SOURCE_SIDE. NOTE: process_alive_at is
  // deliberately NOT an input; the tick lies during a prompt block.
  const silenceMs = input?.expectedSilenceUntilMs == null ? null : Number(input.expectedSilenceUntilMs);
  if (Number.isFinite(silenceMs) && silenceMs > nowMs) {
    return verdict('PASS', 'declared_silence_window');
  }

  // In-flight long tool/agent (PreToolUse stamped an expected end) wins.
  const toolEndMs = input?.currentToolExpectedEndMs == null ? null : Number(input.currentToolExpectedEndMs);
  if (Number.isFinite(toolEndMs) && toolEndMs > nowMs) {
    return verdict('PASS', 'tool_in_flight');
  }

  // Dual-signal requirement: outbound comms since the anchor prove the model is
  // alive even with zero tool calls. A missing count (null/undefined — the count
  // query failed) is UNKNOWN, never a release; Number(null) coerces to 0, so the
  // null check must precede coercion.
  const outbound = input?.outboundSinceAnchor == null ? NaN : Number(input.outboundSinceAnchor);
  if (!Number.isFinite(outbound)) return verdict('UNKNOWN', 'outbound_count_unavailable');
  if (outbound > 0) return verdict('PASS', 'outbound_comms_since_anchor');

  // Window elapsed + tool activity stopped inside the boundary neighborhood +
  // zero outbound + no declared silence + no in-flight tool: the freeze signature.
  return verdict('MISS', 'zero_activity_since_boundary');
}

module.exports = {
  evaluateClaimBoundary,
  probeWindowMs,
  boundaryGraceMs,
  isProbeEnabled,
  DEFAULT_PROBE_WINDOW_MINUTES,
  DEFAULT_BOUNDARY_GRACE_SECONDS,
  CLOCK_SKEW_TOLERANCE_MS,
};
