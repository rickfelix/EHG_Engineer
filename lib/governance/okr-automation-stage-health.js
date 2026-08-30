/**
 * OKR automation stage-health recomputer (QF-20260830-086).
 *
 * KR-GOV-3.3 ("Monthly OKR automation operational") measures 3 shipped stages: draft OKR
 * generation (day 1-5, okr_generation_log), chairman review scheduling (day 15,
 * eva_scheduler_metrics), and the day-28 hard-stop decision surface (chairman_decisions). It was
 * frozen at a 2026-06-10 manual read (current_value=0) while the underlying scheduler advanced its
 * OWN job_last_runs stamps under observe_only=true — that stamp is NOT evidence of real execution
 * (_runDueJobs in eva-master-scheduler.js sets it on the OBSERVE branch too, without calling the
 * handler). This module measures the REAL per-stage artifact instead: does a genuine completed
 * row exist within that stage's own declared cadence window? Built but not producing a fresh row
 * within cadence FAILS the stage — code presence is never credited (mirrors
 * lib/governance/cascade-layer-health.js's anti-inflation shape for KR-GOV-3.1).
 *
 * PURE-CORE: checkStageHealth/computeOkrStageHealth/recomputeKrGov33 take injectable deps
 * (supabase, now) so the predicate + recomputer are deterministically unit-testable.
 */

export const KR_CODE = 'KR-GOV-3.3';
export const TARGET_STAGES = 3;
export const RECOMPUTE_WRITER = 'OKR-STAGE-RECOMPUTE';

const STAGE_LABELS = {
  draft_generation: 'draft OKR generation',
  chairman_review: 'chairman review scheduling',
  day28_hardstop: 'day-28 hard-stop',
};

/**
 * The 3 automation stages, each with its own real-artifact table/timestamp/filter and the
 * cadence (days) within which a fresh row counts as "currently running".
 */
export const OKR_STAGES = [
  {
    key: 'draft_generation',
    table: 'okr_generation_log',
    timestampCol: 'created_at',
    filter: (q) => q.in('status', ['completed', 'pending_chairman_acceptance']),
    cadenceDays: 30,
  },
  {
    key: 'chairman_review',
    table: 'eva_scheduler_metrics',
    timestampCol: 'occurred_at',
    filter: (q) => q.eq('event_type', 'okr.mid_month_review.completed'),
    cadenceDays: 15,
  },
  {
    key: 'day28_hardstop',
    table: 'chairman_decisions',
    timestampCol: 'created_at',
    filter: (q) => q.eq('decision_type', 'okr_month_close_review'),
    cadenceDays: 30,
  },
];

/**
 * Health for one stage: does the most recent real artifact row fall within the stage's own
 * cadence window? Any query error or absent row FAILS the stage (conservative, never inflates).
 * @returns {Promise<{stage:string, lastAt:(string|null), ageDays:(number|null), running:boolean}>}
 */
export async function checkStageHealth(stage, { supabase, now }) {
  try {
    let q = supabase.from(stage.table).select(stage.timestampCol).limit(1);
    q = stage.filter(q);
    q = q.order(stage.timestampCol, { ascending: false });
    const { data, error } = await q;
    if (error || !data || data.length === 0) return { stage: stage.key, lastAt: null, ageDays: null, running: false };
    const lastAt = data[0][stage.timestampCol];
    const ageDays = (now.getTime() - new Date(lastAt).getTime()) / 86400000;
    return { stage: stage.key, lastAt, ageDays: Math.round(ageDays * 10) / 10, running: ageDays <= stage.cadenceDays };
  } catch {
    return { stage: stage.key, lastAt: null, ageDays: null, running: false };
  }
}

/** Compute health for all 3 stages. passingCount = number currently running (within cadence). */
export async function computeOkrStageHealth({ supabase, now }) {
  const stages = [];
  for (const stage of OKR_STAGES) stages.push(await checkStageHealth(stage, { supabase, now }));
  return { stages, passingCount: stages.filter((s) => s.running).length };
}

/** Derive the KR description from the SAME per-stage result the number comes from. */
export function buildKrGov33Description(stages, passingCount) {
  const running = stages.filter((s) => s.running).map((s) => STAGE_LABELS[s.stage]);
  const stale = stages
    .filter((s) => !s.running)
    .map((s) => (s.lastAt ? `${STAGE_LABELS[s.stage]} (last ${String(s.lastAt).slice(0, 10)}, ${s.ageDays}d ago)` : `${STAGE_LABELS[s.stage]} (never)`));
  const base = 'Auto-generate draft OKRs (day 1-5), schedule Chairman review meeting (day 15), hard-stop SD creation (day 28).';
  const activeNote = `Currently ${passingCount} of ${stages.length} automation stages running (${running.join(', ') || 'none'})`;
  const staleNote = stale.length ? `; stale: ${stale.join('; ')}` : '';
  return `${base} ${activeNote}${staleNote}.`;
}

/**
 * Derive KR-GOV-3.3 current_value from honest per-stage health and (when apply) write it via the
 * canonical key_results update. Dry-run by default. Idempotent: a re-run writes the same value.
 * @param {{supabase:Object, apply?:boolean, now?:string}} opts
 * @returns {Promise<{before:(number|null), passingCount:number, status:string, perStage:Array, wrote:boolean}>}
 */
export async function recomputeKrGov33(opts) {
  const { supabase, apply = false } = opts;
  const nowDate = opts.now ? new Date(opts.now) : new Date();
  const nowIso = opts.now || nowDate.toISOString();

  const health = await computeOkrStageHealth({ supabase, now: nowDate });
  const passingCount = health.passingCount;
  const status = passingCount >= TARGET_STAGES ? 'achieved' : 'at_risk';

  let before = null;
  try {
    const { data } = await supabase.from('key_results').select('current_value').eq('code', KR_CODE).maybeSingle();
    before = data ? data.current_value : null;
  } catch { before = null; }

  let wrote = false;
  if (apply) {
    const { error } = await supabase
      .from('key_results')
      .update({
        current_value: passingCount, status, last_updated_by: RECOMPUTE_WRITER, updated_at: nowIso,
        description: buildKrGov33Description(health.stages, passingCount),
      })
      .eq('code', KR_CODE);
    if (error) throw new Error(`KR-GOV-3.3 write failed: ${error.message}`);
    wrote = true;
  }

  return { before, passingCount, status, perStage: health.stages, wrote };
}

export default { OKR_STAGES, checkStageHealth, computeOkrStageHealth, buildKrGov33Description, recomputeKrGov33, KR_CODE, TARGET_STAGES };
