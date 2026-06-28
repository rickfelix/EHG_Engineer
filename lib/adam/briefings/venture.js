/**
 * Venture briefing — read-only signal scan over a single live venture.
 * SD-LEO-INFRA-ADAM-OPPORTUNITY-SCAN-001.
 *
 * Per-venture anchoring requires a chairman-approved L2 vision + a LIVE metric;
 * if that is absent, the briefing does NOT fabricate a KR — it surfaces the gap
 * as a DRAFT-SD proposal to bootstrap the data layer (chairman decision; fix
 * once, unlock all ventures). Sources: competitors, venture_stage_work
 * (health + advisory_data), venture_separability_scores, L2 eva_vision_documents.
 * Empty tables = "no signal", not "missing".
 */
export function summarizeVenture({ ventureId, competitors = [], stageWork = [], separability = [], visionDocs = [], currentStage = null } = {}) {
  // SD-LEO-INFRA-HEALTH-ROLLUP-CORRECTNESS-001 FR-3: ignore phantom future-stage rows
  // (lifecycle_stage > the venture's current_lifecycle_stage) so a held-below-stage venture's
  // health rollup is not poisoned. Defensive: rows without a lifecycle_stage are kept.
  const scopedStageWork = currentStage == null
    ? stageWork
    : stageWork.filter((w) => w && (w.lifecycle_stage == null || w.lifecycle_stage <= currentStage));
  const blocked = scopedStageWork.filter((w) => w && (w.stage_status === 'blocked' || w.health_score === 'red'));
  const hasL2Vision = visionDocs.some((v) => v && v.level === 'L2' && v.chairman_approved);
  const signals = {
    competitors: competitors.length,
    stage_work_rows: scopedStageWork.length,
    blocked_or_red: blocked.length,
    separability_scored: separability.length,
    l2_vision_present: hasL2Vision,
  };

  // Data-gap DRAFT-SD proposals — surfaced (not fabricated signal) when the pipes are dry.
  const gaps = [];
  if (competitors.length === 0) {
    gaps.push({
      kind: 'data_gap',
      area: 'competitive_intel',
      proposal: `Bootstrap competitor intelligence ingestion for venture ${ventureId} (competitive deltas are dry).`,
    });
  }
  if (!hasL2Vision) {
    gaps.push({
      kind: 'data_gap',
      area: 'l2_vision',
      proposal: `Author/approve a chairman L2 vision for venture ${ventureId} so per-venture rationale anchoring is possible.`,
    });
  }

  // No live KR exists per-venture today, so we never fabricate a scoreable
  // candidate. The honest output is signals + data-gap proposals -> ADAM_OK.
  return { scope_key: `venture:${ventureId}`, signals, candidates: [], gaps };
}

async function safe(fn) {
  try {
    const r = await fn();
    return Array.isArray(r) ? r : [];
  } catch {
    return [];
  }
}

export async function briefVenture(supabase, ventureId) {
  const competitors = await safe(async () =>
    (await supabase.from('competitors').select('id').eq('venture_id', ventureId)).data
  );
  // SD-LEO-INFRA-HEALTH-ROLLUP-CORRECTNESS-001 FR-3: bound the stage-work read to stages the venture
  // has actually reached, so phantom future-stage rows can never enter the rollup.
  const ventureRow = await safe(async () =>
    [(await supabase.from('ventures').select('current_lifecycle_stage').eq('id', ventureId).maybeSingle()).data]
  );
  const currentStage = ventureRow?.[0]?.current_lifecycle_stage ?? null;
  const stageWork = await safe(async () => {
    let q = supabase.from('venture_stage_work').select('lifecycle_stage, stage_status, health_score').eq('venture_id', ventureId);
    if (currentStage != null) q = q.lte('lifecycle_stage', currentStage);
    return (await q).data;
  });
  const separability = await safe(async () =>
    (await supabase.from('venture_separability_scores').select('overall_score').eq('venture_id', ventureId).order('scored_at', { ascending: false }).limit(1)).data
  );
  const visionDocs = await safe(async () =>
    (await supabase.from('eva_vision_documents').select('level, chairman_approved').eq('venture_id', ventureId).eq('level', 'L2')).data
  );
  return summarizeVenture({ ventureId, competitors, stageWork, separability, visionDocs, currentStage });
}
