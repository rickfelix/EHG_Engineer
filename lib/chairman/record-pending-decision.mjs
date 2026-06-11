/**
 * lib/chairman/record-pending-decision.mjs — durable proxy for ephemeral
 * chairman questions. SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-001 FR-4.
 *
 * Inserts a chairman_decisions row (status='pending') so a question that today
 * only lives in an AskUserQuestion prompt / coordinator escalation also lands
 * in the unified decision queue (chairman_unified_decisions branch 4).
 *
 * CONSTITUTIONAL: this RECORDS a pending decision; it never decides one.
 *
 * Schema notes (probed live 2026-06-11):
 *   NOT NULL without default: lifecycle_stage (int), decision, decision_type,
 *     status (default 'pending'). venture_id becomes nullable with the
 *     20260611_chairman_decision_queue migration (session questions are
 *     ventureless) — pre-migration, pass options.ventureId or the insert fails.
 *   CHECK constraints: decision must be in the allowed list ('pending' is
 *     valid); recommendation column only allows proceed/pivot/fix/kill/pause —
 *     free-text recommendations therefore go into brief_data, and the column is
 *     only set when the value is one of the allowed enums.
 */

const COLUMN_RECOMMENDATIONS = new Set(['proceed', 'pivot', 'fix', 'kill', 'pause']);

/**
 * Record a pending chairman decision.
 * @param {Object} supabase - supabase client (service role)
 * @param {Object} opts
 * @param {string} opts.title - short question/title (stored in summary + brief_data.title)
 * @param {string} [opts.decisionType='session_question']
 * @param {Object|string} [opts.context] - context pack, stored as brief_data
 * @param {string} [opts.recommendation] - display-only default answer
 * @param {boolean} [opts.blocking=false]
 * @param {string} [opts.ventureId] - optional; session questions are ventureless
 * @param {number} [opts.lifecycleStage=0] - 0 = not a venture lifecycle decision
 * @returns {Promise<{recorded: boolean, id?: string, error?: string}>}
 */
export async function recordPendingDecision(supabase, {
  title,
  decisionType = 'session_question',
  context,
  recommendation,
  blocking = false,
  ventureId = null,
  lifecycleStage = 0,
} = {}) {
  if (!supabase) return { recorded: false, error: 'supabase client is required' };
  if (!title) return { recorded: false, error: 'title is required' };

  const briefData = {
    title,
    ...(recommendation ? { recommendation } : {}),
    context: context ?? null,
    recorded_via: 'record-pending-decision',
  };

  const row = {
    venture_id: ventureId,
    lifecycle_stage: lifecycleStage,
    decision: 'pending',           // NOT NULL; 'pending' is in the CHECK list
    decision_type: decisionType,   // NOT NULL, no CHECK — free text
    status: 'pending',
    summary: title,
    brief_data: briefData,
    blocking: !!blocking,
  };
  if (recommendation && COLUMN_RECOMMENDATIONS.has(recommendation)) {
    row.recommendation = recommendation; // column CHECK only allows these five
  }

  const res = await supabase.from('chairman_decisions').insert(row).select('id');
  if (res.error) {
    return { recorded: false, error: res.error.message };
  }
  return { recorded: true, id: res.data?.[0]?.id };
}
