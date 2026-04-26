#!/usr/bin/env node
/**
 * PostToolUse hook — write claude_sessions.loop_state=awaiting_tick after
 * a successful ScheduleWakeup tool call.
 *
 * SD: SD-LEO-INFRA-LOOP-STATE-SIGNAL-001
 *
 * Hook contract:
 *   - matcher: "ScheduleWakeup" (set in .claude/settings.json) restricts firing
 *     to the right tool. We still verify CLAUDE_TOOL_NAME defensively in case
 *     the matcher is missing or the hook is invoked from a different settings
 *     entry.
 *   - Always exit 0 — observability writes MUST NOT block the tool call. Any
 *     failure is logged to stderr by the tracker module.
 *   - Feature-flag gate: setting LEO_LOOP_STATE_SIGNAL=off short-circuits the
 *     write entirely (no tracker import, no DB call) so an operator can
 *     disable the writer per-session without redeploying.
 */

const TOOL_NAME = process.env.CLAUDE_TOOL_NAME || '';

(async () => {
  try {
    if (TOOL_NAME !== 'ScheduleWakeup') return;

    const flag = (process.env.LEO_LOOP_STATE_SIGNAL || 'on').toLowerCase();
    if (flag === 'off' || flag === '0' || flag === 'false') return;

    const sessionId =
      process.env.CLAUDE_SESSION_ID ||
      process.env.SESSION_ID ||
      '';
    if (!sessionId) return;

    const {
      setLoopState,
      LOOP_STATE_AWAITING_TICK
    } = require('../lib/sessions/loop-state-tracker.cjs');

    await setLoopState(sessionId, LOOP_STATE_AWAITING_TICK);
  } catch (e) {
    process.stderr.write(`[post-tool-loop-state] ${e.message}\n`);
  } finally {
    process.exit(0);
  }
})();
