/**
 * Harness briefing — read-only signal scan over EHG_Engineer governance tables.
 * SD-LEO-INFRA-ADAM-OPPORTUNITY-SCAN-001.
 *
 * Anchors to the O-GOV objectives/KRs. Sources: feedback(harness_backlog),
 * retrospectives, gate-tuning recommendations, pending EVA recommendations.
 * Empty tables are reported as "no signal", never as an error.
 *
 * Today there is no programmatic live-KR feed wired here, so the briefing
 * surfaces SIGNAL COUNTS only and emits NO fabricated candidate — the rationale
 * bar would (correctly) keep it silent without a cited live KR.
 */
export function summarizeHarness({ backlog = [], retros = [], gateRecs = [], evaRecs = [] } = {}) {
  const signals = {
    open_harness_backlog: backlog.length,
    recent_retros: retros.length,
    gate_tuning_recs: gateRecs.length,
    pending_eva_recs: evaRecs.length,
  };
  return { scope_key: 'harness', signals, candidates: [], gaps: [] };
}

async function safe(fn) {
  try {
    const r = await fn();
    return Array.isArray(r) ? r : [];
  } catch {
    return [];
  }
}

export async function briefHarness(supabase) {
  const backlog = await safe(async () =>
    (await supabase.from('feedback').select('id').eq('category', 'harness_backlog').eq('status', 'new')).data
  );
  const retros = await safe(async () =>
    (await supabase.from('retrospectives').select('id').order('created_at', { ascending: false }).limit(20)).data
  );
  const gateRecs = await safe(async () =>
    (await supabase.from('v_ai_quality_tuning_recommendations').select('sd_type')).data
  );
  const evaRecs = await safe(async () =>
    (await supabase.from('eva_consultant_recommendations').select('id').eq('status', 'pending').limit(50)).data
  );
  return summarizeHarness({ backlog, retros, gateRecs, evaRecs });
}
