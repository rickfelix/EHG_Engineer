#!/usr/bin/env node
/**
 * PostToolUse hook — write claude_sessions.loop_state=awaiting_tick after
 * a successful ScheduleWakeup tool call.
 *
 * SD: SD-LEO-INFRA-LOOP-STATE-SIGNAL-001
 *
 * Hook contract:
 *   - matcher: "ScheduleWakeup" (set in .claude/settings.json) restricts firing
 *     to the right tool. We still verify the tool name defensively in case the
 *     matcher is missing or the hook is invoked from a different settings entry.
 *     SD-LEO-INFRA-PARK-VISIBILITY-LOOP-STATE-001: the tool name MUST be read
 *     from the stdin payload (payload.tool_name) with CLAUDE_TOOL_NAME as a
 *     fallback only — Claude Code does NOT set CLAUDE_TOOL_NAME for hooks (RCA
 *     #2 2026-05-04, same class pre-tool-enforce.cjs fixed), so the previous
 *     env-only guard exited silently on EVERY harness invocation. That single
 *     guard is why claude_sessions.loop_state read 'unknown' fleet-wide all day
 *     2026-06-10 and parked workers were indistinguishable from stalled ones.
 *   - Always exit 0 — observability writes MUST NOT block the tool call. Any
 *     failure is logged to stderr by the tracker module.
 *   - Feature-flag gate: setting LEO_LOOP_STATE_SIGNAL=off short-circuits the
 *     write entirely (no tracker import, no DB call) so an operator can
 *     disable the writer per-session without redeploying.
 *
 * SD-FDBK-INFRA-AUTO-PUSH-WIP-001 (FR-2): the SAME deterministic ScheduleWakeup
 * edge also auto-arms a capped claude_sessions.expected_silence_until so a parked
 * /loop worker gets the claim-sweep inflight-protection automatically — the
 * shipped park-worker.cjs writer was a MANUAL CLI nothing in the loop path
 * invoked. We reuse park-worker.cjs's pre-clamped computeSilenceMinutes and the
 * canonical writeTelemetryAwait IN-PROCESS (we cannot shell out to park-worker.cjs:
 * its main() reads process.env.CLAUDE_SESSION_ID, which Claude Code does not
 * propagate to PostToolUse subprocesses). Independently gated by
 * LEO_PARK_SILENCE_ARM and fully best-effort (its own try/catch).
 */

function isOff(v) {
  const f = String(v == null ? 'on' : v).toLowerCase();
  return f === 'off' || f === '0' || f === 'false';
}

(async () => {
  try {
    if (isOff(process.env.LEO_LOOP_STATE_SIGNAL)) return;

    // Read the FULL stdin payload ONCE — we need tool_name, session_id AND
    // tool_input.delaySeconds, and stdin can only be consumed once. The tool
    // guard runs AFTER this read: payload-first, env fallback (the env var is
    // not set by the harness — see header).
    const sidLib = require('../../lib/hooks/session-id.cjs');
    const payload = await sidLib.readHookStdinPayload();

    const toolName = (payload && payload.tool_name) || process.env.CLAUDE_TOOL_NAME || '';
    if (toolName !== 'ScheduleWakeup') return;

    let sessionId = payload && sidLib.isValidSessionId(payload.session_id) ? payload.session_id : '';
    if (!sessionId && sidLib.isValidSessionId(process.env.CLAUDE_SESSION_ID)) sessionId = process.env.CLAUDE_SESSION_ID;
    if (!sessionId && sidLib.isValidSessionId(process.env.SESSION_ID)) sessionId = process.env.SESSION_ID;
    if (!sessionId) {
      // stdin/env fallbacks exhausted — these resolvers do NOT touch stdin.
      const m = sidLib.readSessionIdFromIdentityMarker({}) || sidLib.readLatestMarkerByMtime();
      if (sidLib.isValidSessionId(m)) sessionId = m;
    }
    if (!sessionId) return;

    const {
      setLoopState,
      LOOP_STATE_AWAITING_TICK
    } = require('../lib/sessions/loop-state-tracker.cjs');
    await setLoopState(sessionId, LOOP_STATE_AWAITING_TICK);

    // FR-2: arm a capped expected_silence_until on the same edge (best-effort).
    if (!isOff(process.env.LEO_PARK_SILENCE_ARM)) {
      try {
        const delaySeconds = payload && payload.tool_input && Number(payload.tool_input.delaySeconds);
        const wakeMinutes = Number.isFinite(delaySeconds) && delaySeconds > 0 ? delaySeconds / 60 : undefined;
        // computeSilenceMinutes is pre-clamped to lib/fleet/silence-cap.cjs
        // SILENCE_HARD_CAP_MIN (writer<=reader); undefined wake => safe DEFAULT, still capped.
        const { computeSilenceMinutes } = require('../park-worker.cjs');
        const { writeTelemetryAwait } = require('./lib/session-telemetry-writer.cjs');
        const silenceMin = computeSilenceMinutes(wakeMinutes);
        const nowMs = Date.now();
        await writeTelemetryAwait(sessionId, {
          heartbeat_at: new Date(nowMs).toISOString(),
          expected_silence_until: new Date(nowMs + silenceMin * 60000).toISOString(),
          last_activity_kind: 'idle',
        });
      } catch (e2) {
        process.stderr.write(`[post-tool-loop-state] silence-arm (non-fatal): ${e2.message}\n`);
      }
    }
  } catch (e) {
    process.stderr.write(`[post-tool-loop-state] ${e.message}\n`);
  } finally {
    process.exit(0);
  }
})();
