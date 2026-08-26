// SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A -- PLAN-phase round-3 ratification.
// Ratifies 3 decisions flagged consistently by DESIGN/DATABASE/STORIES sub-agents:
// (1) event_type enum value 'conversion_event' -> 'custom_event' (generic sink, not
//     AltifyAI-specific vocab; free to rename now, table doesn't exist yet).
// (2) Add optional 6th RPC param p_occurred_at (DEFAULT NULL) to resolve the
//     internal contradiction between "app-generated created_at, no DB default"
//     and a fixed 5-param signature.
// (3) stage_artifact_requirements ruled out for the CORRECT reason (RPC has no
//     legacy fallback at all; JS fallback is unreachable while the canonical
//     array is non-empty -- not the reason originally stated).
// (4) Bakes in the producer-parity fix (RPC self-produces the venture_artifacts
//     row) and the dedicated rate-limit substrate (precedent's limiters count
//     FROM feedback, blind to usage events) found by DATABASE sub-agent.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A';

const { data: current, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, scope, risks, metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) { console.error('FETCH_FAILED', fetchErr); process.exit(1); }

const scope = current.scope
  .replace(
    "event_type is a closed CHECK enum (page_view, conversion_event)",
    "event_type is a closed CHECK enum (page_view, custom_event) -- 'custom_event' not 'conversion_event': the table is venture-agnostic infrastructure, not AltifyAI-specific, and the rename is free pre-apply (table does not exist yet, zero rows, CHECK not chairman-gated-applied)"
  )
  .replace(
    "(2) fn_submit_venture_usage_event(p_venture_id UUID, p_ingest_secret TEXT, p_event_type TEXT, p_event_name TEXT, p_properties JSONB) SECURITY DEFINER RPC",
    "(2) fn_submit_venture_usage_event(p_venture_id UUID, p_ingest_secret TEXT, p_event_type TEXT, p_event_name TEXT, p_properties JSONB, p_occurred_at TIMESTAMPTZ DEFAULT NULL) SECURITY DEFINER RPC -- the 6th optional param resolves the internal contradiction between an app-generated created_at with no DB default and a fixed signature; the RPC internally splits caller-supplied created_at (data axis, defaults to now() if omitted) from a server-only ingested_at (security/rate-limit axis, never caller-controlled)"
  )
  + " RATE LIMITING IS A DEDICATED NEW SUBSTRATE, NOT A REUSE OF THE PRECEDENT'S: fn_venture_ingest_prior_hour_count/fn_anon_ingress_prior_hour_count count FROM public.feedback and would be blind to venture_usage_events rows entirely (DATABASE sub-agent finding, confirmed via pg_get_functiondef) -- this SD adds its own in-body per-venture count against venture_usage_events.ingested_at plus an O(1) tumbling-hour-bucket counter table for the global cap (a naive count(*)-over-window would be quadratic in traffic). PRODUCER-PARITY CLOSED WITHIN THIS SD'S OWN SCOPE: fn_submit_venture_usage_event upserts a venture_artifacts row (artifact_type='launch_usage_signal', idempotent, same transaction, no exception handler swallowing failures) on successful ingestion, so the Stage-23 required_artifacts entry this SD adds is self-satisfying and never enforced-but-unsatisfiable (closing the exact truth_demand_thesis-class outage this repo's tests/unit/eva/artifact-type-producer-parity.test.js exists to prevent). stage_artifact_requirements (legacy fallback table) is confirmed NOT a conflict for a corrected reason: the new RPC has no legacy-fallback read path at all, and stage-artifact-precondition.js's JS-side legacy fallback is unreachable in practice because LEO_S22_GATES_ENABLED has zero rows, keeping the canonical_with_fallback_available path active whenever the canonical required_artifacts array is non-empty (which it already is).";

const risks = [...current.risks];
const staleRiskIdx = risks.findIndex((r) => typeof r.risk === 'string' && r.risk.includes('legacy stage_artifact_requirements table'));
if (staleRiskIdx >= 0) {
  risks[staleRiskIdx] = {
    risk: 'stage_artifact_requirements (legacy fallback table, id=159) could appear to be a second, disagreeing source of truth for Stage 23 required artifacts if read naively.',
    impact: 'low',
    likelihood: 'low',
    mitigation: 'Ruled out by design: fn_submit_venture_usage_event has no legacy-fallback read path at all, and stage-artifact-precondition.js only falls back to this table when LEO_S22_GATES_ENABLED has rows AND the canonical required_artifacts array is empty -- neither condition holds once this SD ships (0 flag rows; canonical array already non-empty). No update to this table is needed; PRD records the divergence explicitly rather than leaving it implicit.',
  };
}
risks.push({
  risk: 'A fresh public-schema table on this Supabase instance inherits anon read+write ACLs by default (pg_default_acl grants anon arwdDxtm from postgres/supabase_admin) -- venture_usage_events would be directly anon-writable, bypassing the ingest-secret RPC entirely, unless explicitly revoked.',
  impact: 'critical',
  likelihood: 'high',
  mitigation: 'Explicit REVOKE ALL FROM PUBLIC/anon/authenticated + RLS enabled with zero policies (deny-by-absence) + a DO $verify$ block asserting all four privilege states (anon: no table access, EXECUTE only on the RPC) before COMMIT -- mandatory, not inherited from the precedent pattern (DATABASE sub-agent finding).',
});

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ scope, risks })
  .eq('id', current.id);
if (updateErr) { console.error('UPDATE_FAILED', updateErr); process.exit(1); }

console.log('UPDATED_ROUND3', SD_KEY);
