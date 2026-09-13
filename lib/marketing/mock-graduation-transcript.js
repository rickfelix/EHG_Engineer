/**
 * @wire-check-exempt: foundation shared library — the graduation-transcript primitive for
 * Part B's mock-run executor, same exemption reasoning as mock-outreach-executor.js. Called
 * today only from tests/unit/marketing/mock-graduation-transcript.test.js; wired when the
 * mock-run orchestrating SD lands. Available infrastructure with no production runtime
 * caller yet, by design.
 *
 * Mock graduation transcript — SD-LEO-INFRA-DEMAND-ENGINE-PART-001 FR-7, FR-9.
 *
 * Proves the safety boundary end-to-end: a mock run's ledger activity can earn a
 * graduation-worthy streak through the IDENTICAL evaluateGraduation() code path a real
 * channel's outcomes run through (FR-9 — "not a parallel/duplicated mock-only
 * implementation"), while the real venture_channel_autonomy row for the same venture/channel
 * is never written.
 *
 * venture_channel_autonomy has NO execution_mode dimension (SD-LEO-INFRA-PUBLISH-OUTCOME-
 * OBSERVER-001 SECURITY finding SEC-2) — evaluateGraduation() already refuses to write it for
 * any mode other than 'live' or omitted. Calling it with mode:'mock' therefore:
 *   (a) computes cleanStreak via the SAME streak-walking logic a real evaluation uses, scoped
 *       to execution_mode='mock' rows only (query-level isolation), and
 *   (b) returns `autonomyWriteSkipped` instead of writing venture_channel_autonomy.
 * "Graduates" for a mock-tracked row means (a): the mock run's own activity independently earns
 * a streak >= requiredStreak through that identical logic. (b) is the proof that earning it
 * never touches the real per-(venture,channel) state — this module asserts both, plus that a
 * live-tracked row for the SAME venture/channel (if one exists) is byte-identical before/after.
 */
import { evaluateGraduation } from './autonomy-gate.js';

/**
 * @param {object} params
 * @param {{from: Function}} params.supabase
 * @param {string} params.ventureId
 * @param {string} params.channelType
 * @param {number} [params.requiredStreak]
 * @returns {Promise<{
 *   graduationEarned: boolean,
 *   cleanStreak: number,
 *   autonomyWriteSkipped: string|undefined,
 *   liveRowUntouched: boolean,
 *   liveRowBefore: object|null,
 *   liveRowAfter: object|null,
 * }|{error:string}>}
 */
export async function runMockGraduationTranscript({ supabase, ventureId, channelType, requiredStreak = 5 }) {
  // Snapshot the real (live-tracked) autonomy row BEFORE the mock evaluation runs, so the
  // transcript can prove it is untouched, not merely assume it.
  const before = await supabase
    .from('venture_channel_autonomy')
    .select('venture_id, channel_type, autonomy_state, clean_streak, graduated_at')
    .eq('venture_id', ventureId)
    .eq('channel_type', channelType)
    .maybeSingle();
  if (before.error) return { error: `LIVE_ROW_SNAPSHOT_FAILED: ${before.error.message}` };

  // FR-9: the IDENTICAL evaluateGraduation() code path, with mode:'mock' so its own
  // query-level isolation (mode && query.eq('execution_mode', mode)) scopes the candidate
  // window to mock rows only, and its own write-skip guard (mode !== 'live' && mode !==
  // undefined) refuses the venture_channel_autonomy write.
  const evaluation = await evaluateGraduation({ supabase, ventureId, channelType, requiredStreak, mode: 'mock' });
  if (!evaluation.success) return { error: `MOCK_EVALUATION_FAILED: ${evaluation.error}` };

  const after = await supabase
    .from('venture_channel_autonomy')
    .select('venture_id, channel_type, autonomy_state, clean_streak, graduated_at')
    .eq('venture_id', ventureId)
    .eq('channel_type', channelType)
    .maybeSingle();
  if (after.error) return { error: `LIVE_ROW_RECHECK_FAILED: ${after.error.message}` };

  const liveRowUntouched = JSON.stringify(before.data) === JSON.stringify(after.data);

  return {
    graduationEarned: evaluation.cleanStreak >= requiredStreak,
    cleanStreak: evaluation.cleanStreak,
    autonomyWriteSkipped: evaluation.autonomyWriteSkipped,
    liveRowUntouched,
    liveRowBefore: before.data,
    liveRowAfter: after.data,
  };
}

export default { runMockGraduationTranscript };
