#!/usr/bin/env node
/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G — Explore breadth search at LEAD-TO-PLAN.
 *
 * Records the findings from the Explore sub-agent run (Task tool, subagent_type=Explore)
 * into sub_agent_execution_results, satisfying GATE_SUBAGENT_EVIDENCE's "Explore"
 * requirement -- the Explore agent itself does not write this row.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) throw sdErr;

const results = {
  verdict: 'PASS',
  confidence: 88,
  phase: 'LEAD',
  execution_time_ms: 0,
  summary: "Mapped the full write/read surface this SD must extend for venture_artifacts provenance. WRITE SIDE: lib/eva/artifact-persistence-service.js's writeArtifact() (function starts ~line 97, INSERT row at lines 186-197) writes {venture_id, lifecycle_stage, artifact_type, title, artifact_data, content, is_current, source, quality_score, validation_status} -- source is a free-text producing-module label (54 distinct live values), never a producer identity or hash. venture_artifacts has 28 live columns confirmed via database/schema-reference-snapshot.json; NONE of producer/run_id/content_hash exist as top-level columns. The dedup-UPDATE branch at lines 158-177 rewrites content and artifact_data on a re-produced artifact but NOT metadata -- if a content_hash lives in metadata (the recommended storage), every re-run leaves a stale hash. The graceful-degradation retry at lines 255-267 silently strips unknown top-level columns and re-inserts, so a new top-level column added without a real (chairman-gated) migration would be silently dropped on write -- this plus the DDL-gate cost is why metadata-JSONB storage is the only viable path, not new columns. SCOPE BOUND: lib/eva/reality-gates.js's per-stage required_artifacts list (from venture_stages.required_artifacts, 26 stages) takes PRIORITY over BOUNDARY_CONFIG/isGatedBoundary (lines 278-285, 574-577) -- the true operative 'every gate-read artifact type' scope is 45 distinct types (not the 12-type gate_boundary_config set, not the 73-type live-corpus set, not the 103-type artifact-types.js registry, not the 131-type DB CHECK constraint). READ SIDE: 6 call sites read venture_artifacts with zero provenance checking today -- reality-gates.js:343, stage-23-launch-readiness.js:160-165, exit-gate-verifiers.js:659-674, stage-artifact-precondition.js, artifact-integrity-checker.js:50-67, acceptance-artifact-gate.js:142 (hasProvenance: row?.source != null -- a near-vacuous presence check, explicitly self-disclaimed in its own header lines 98-103 as not doing producer-independence or hash verification; this gate is opt-in, 0/4919 SDs use it, observe-only unless ACCEPTANCE_ARTIFACT_GATE_BINDING=true). LEGACY CORPUS: live-measured 7972 total venture_artifacts rows / 0 with any provenance field; is_current subset = 1102 rows, still 0 provenanced; AltifyAI alone = 6772 rows / 52 types, 100% unprovenanced. IN-DOMAIN PRECEDENTS: lib/eva/artifact-versioning.js's computeContentHash already writes metadata.content_hash on SOME paths (lines 58/127, verifies at 234) -- the correct in-domain reuse template, NOT lib/sub-agent-executor/evidence-provenance.js's PRODUCER_ALLOWLIST (['sub_agent_executor','task_hook']), which would 100%-false-refuse every venture_artifacts row since its 54 live source values are stage labels, not producer identities (same failure mode measured at acceptance-artifact-gate.js:26-31). Cutover-boundary precedents in-repo: PROVENANCE_CUTOVER_AT (evidence-provenance.js:72), DELIVERABLES_PROVENANCE_CUTOVER (semantic-gate-utils.js:95-96), and the 'historical NULLs stand, no backfill' policy documented at artifact-persistence-service.js:410. launch_uat_report is a venture_artifacts.artifact_type enum value (artifact-types.js:137, written by stage-23-dedicated-venture-uat.js:63-69), not a separate table -- its 'run row' to hash-link is uat_test_runs (unique run_id); a hash-predicate precedent exists at acceptance-artifact-gate.js:150 (metadata.evidence_hash). COORDINATION FLAGS: SD-LEO-INFRA-VENTURE-FACTORY-HANDOFF-001-C (draft, same day) adds a DIFFERENT editorial/claims-provenance concept to marketing_proof_point artifacts in the SAME table/metadata envelope -- needs distinct metadata-key namespacing. CAPA-001-I (sibling, already merged to main) already touched stage-23-launch-readiness.js and stage-24 REQUIRED inputs -- this SD naturally rebases on top.",
  critical_issues: [],
  warnings: [
    "The dedup-UPDATE write path (artifact-persistence-service.js:158-177) does not rewrite metadata -- must be fixed in the same PR as the provenance stamp, or every re-produced artifact carries a permanently stale content_hash.",
    "100% of the live venture_artifacts corpus (7972 rows, all of AltifyAI) has zero provenance -- an explicit lenient cutover boundary is required, not optional, or every existing venture instantly regresses to ABSENT on every gate read.",
  ],
  recommendations: [
    "PLAN: store provenance under a distinct metadata key (e.g. metadata.machine_provenance) namespaced against -FACTORY-HANDOFF-001-C's editorial/claims-provenance fields in the same envelope.",
    "PLAN: bound 'every gate-read artifact type' to the 45-type set derivable from venture_stages.required_artifacts across all 26 stages -- this is the set reality-gates.js actually enforces, not any of the other 3 candidate counts found.",
    "EXEC: fix the dedup-UPDATE metadata-preservation defect in the same PR as the stamping feature, with a regression test simulating a stage re-run through that path.",
    "EXEC: reuse artifact-versioning.js's computeContentHash pattern; do not reuse evidence-provenance.js's PRODUCER_ALLOWLIST values verbatim -- derive a venture_artifacts-specific allowlist from a live query of the 54 source values.",
  ],
  detailed_analysis: {
    searched_identifiers: ['writeArtifact', 'content_hash', 'PROVENANCE_CUTOVER_AT', 'DELIVERABLES_PROVENANCE_CUTOVER', 'hasProvenance', 'required_artifacts', 'BOUNDARY_CONFIG', 'launch_uat_report', 'uat_test_runs', 'computeContentHash', 'PRODUCER_ALLOWLIST'],
    searched_paths: [
      'lib/eva/artifact-persistence-service.js',
      'lib/eva/reality-gates.js',
      'lib/eva/artifact-types.js',
      'lib/eva/artifact-versioning.js',
      'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js',
      'lib/eva/stage-templates/analysis-steps/stage-23-dedicated-venture-uat.js',
      'lib/eva/lifecycle/exit-gate-verifiers.js',
      'lib/eva/checklists/stage-artifact-precondition.js',
      'lib/eva/checklists/artifact-integrity-checker.js',
      'lib/eva/checklists/acceptance-artifact-gate.js',
      'lib/sub-agent-executor/evidence-provenance.js',
      'lib/utils/semantic-gate-utils.js',
      'database/schema-reference-snapshot.json',
    ],
    forty_five_type_bound_source: 'venture_stages.required_artifacts, unioned across all 26 stages -- takes priority over BOUNDARY_CONFIG/isGatedBoundary in reality-gates.js (lines 278-285, 574-577)',
    legacy_corpus_measurement: '7972 total venture_artifacts rows / 0 provenanced; 1102 is_current rows / 0 provenanced; AltifyAI 6772 rows across 52 types / 0 provenanced',
  },
  metadata: {
    breadth_search: true,
    exhaustive: true,
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sdRow.id,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'EXPLORE',
  probeExistsRelative: 'scripts/one-off/capa-001-g-explore-lead-to-plan.mjs',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('EXPLORE', sdRow.id, { code: 'EXPLORE', name: 'Explore' }, results, {
  sdKey: SD_KEY,
  phase: 'LEAD',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
