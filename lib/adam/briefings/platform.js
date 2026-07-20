/**
 * Platform briefing — read-only signal scan over the EHG 26-stage SSOT and
 * cross-venture gate-failure / stall clustering. SD-LEO-INFRA-ADAM-OPPORTUNITY-SCAN-001.
 *
 * Anchors to O-GOV-3 + the SSOT invariant (there is NO per-stage KR, so the
 * platform scope never fabricates one). Cross-venture clustering claims are
 * gated by the liveness guard (class-B): below K=3 live ventures they are
 * suppressed. Empty tables = "no signal".
 */
import { crossVentureAdvisoryAllowed } from '../liveness-guard.js';
import { fetchAllPaginated } from '../../db/fetch-all-paginated.mjs';

export function summarizePlatform({ stages = [], gateFailures = [], blockedWork = [], liveVentureCount = 0 } = {}) {
  const clusters = {};
  for (const r of gateFailures) {
    const k = `stage_${r.stage_number}`;
    clusters[k] = (clusters[k] || 0) + 1;
  }
  const guard = crossVentureAdvisoryAllowed(liveVentureCount);
  const signals = {
    ssot_stage_count: stages.length,
    cross_venture_gate_failures: gateFailures.length,
    blocked_stage_work: blockedWork.length,
    failure_clusters: clusters,
  };
  // Cross-venture clustering is the only candidate source here, and it is
  // class-B — suppressed entirely while the live venture corpus is below K.
  return { scope_key: 'platform', signals, liveness: guard, candidates: [], gaps: [] };
}

async function safe(fn) {
  try {
    const r = await fn();
    return Array.isArray(r) ? r : [];
  } catch {
    return [];
  }
}

export async function briefPlatform(supabase, { liveVentureCount = 0 } = {}) {
  const stages = await safe(async () =>
    (await supabase.from('venture_stages').select('stage_number')).data
  );
  const gateFailures = await safe(async () =>
    (await supabase.from('eva_stage_gate_results').select('stage_number, gate_type, passed').eq('passed', false).limit(500)).data
  );
  const blockedWork = await safe(() =>
    fetchAllPaginated(() => supabase.from('venture_stage_work').select('lifecycle_stage, stage_status').eq('stage_status', 'blocked')
      .order('id', { ascending: true })) // unique tiebreaker: stable page boundaries (FR-6)
  );
  return summarizePlatform({ stages, gateFailures, blockedWork, liveVentureCount });
}
