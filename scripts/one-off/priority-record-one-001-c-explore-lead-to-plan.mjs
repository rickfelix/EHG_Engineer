#!/usr/bin/env node
/**
 * SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-C — Explore breadth pass at LEAD-TO-PLAN.
 *
 * Read-only confirmation of the extraction targets named in the SD's own LEAD
 * investigation (metadata.leverage_criticality_schema_research), plus resolution
 * of the one open design question it left for PLAN: what "leverage" means for a
 * QF item itself (vs. the QF-sourced axis added to an SD's leverage).
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-C';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) throw sdErr;

const results = {
  verdict: 'PASS',
  confidence: 85,
  phase: 'LEAD',
  execution_time_ms: 0,
  summary: 'Read-only breadth pass confirming the two extraction targets and their real data sources. (1) unlockScore() at scripts/coordinator-backlog-rank.mjs:261-271 is a cycle-safe DFS over a `dependents` map built at :252-259 from blockerKeysFor(d) (scripts/lib/claimable-leaves.mjs:28-33), which unions strategic_directives_v2.dependencies (parsed via lib/utils/parse-sd-dependencies.cjs parseSdDependencies, format-heterogeneous per the SD\'s own metadata research) with metadata.blocked_by_sd_key (checkMetadataDependency, scripts/modules/sd-next/dependency-resolver.js:161-179). Both are extractable pure functions with no client-construction side effects (claimable-leaves.mjs takes the client as a parameter). (2) risk_assessments (database/migrations/009_bmad_risk_assessment.sql:13-46) is FK\'d as sd_id TEXT REFERENCES strategic_directives_v2(id) -- confirmed live: a sample of 5 rows all key on the UUID `id`, never `sd_key` (e.g. sd_id=9dc52372-7a6e-4cfa-935f-db21d942c14d), and the same SD can carry multiple phase-scoped rows (2 rows each for 2 of the 5 sampled SDs, LEAD_PRE_APPROVAL + PLAN_PRD) confirming the "most-recent-per-sd_id" read the SD description already anticipated. (3) quick_fixes.escalated_to_sd_id (database/migrations/20251117_create_quick_fixes_table.sql:30) is also `TEXT REFERENCES strategic_directives_v2(id)` -- live sample of 5 escalated rows all store the SD\'s UUID, confirming the QF-side reverse read must join on sd.id, the same key risk_assessments uses (never sd_key). (4) quick_fixes.severity (same migration, line 13) shares the identical 4-value enum as strategic_directives_v2.priority (critical/high/medium/low), so one shared weight map can serve both item types\' severity component. (5) quick_fixes.status live distribution (2084 rows, full table): completed=1563, cancelled=186, closed=207, escalated=7, in_progress=1, open=120 -- terminal set is {completed,closed,cancelled}, matching the terminal-status exclusion already used elsewhere in this codebase (coordinator-backlog-rank.mjs\'s own SD-side `.not(\'status\',\'in\',...)` filter names the same three).',
  critical_issues: [],
  warnings: [
    {
      id: 'EXP-1',
      severity: 'MEDIUM',
      issue: 'The SD\'s own description text is ambiguous about which item type the "QF-side axis" scores',
      evidence: 'metadata.leverage_criticality_schema_research and the SD description both say the LEVERAGE component needs "a QF-side axis via the existing reverse quick_fixes.escalated_to_sd_id foreign key," and success_criteria #3 says a fixture must prove leverage ordering "for an SD (via the dependency graph) and for a QF (via reverse escalated_to_sd_id)." Read literally, the second clause implies a QF ITEM gets its own leverage score computed by reversing escalated_to_sd_id -- but escalated_to_sd_id is a column ON quick_fixes pointing FORWARD to strategic_directives_v2; nothing in the schema points backward INTO a quick_fixes row (grepped: no column anywhere named qf_id/originating_qf_id/escalated_from on strategic_directives_v2). The only query "reverse escalated_to_sd_id" can mean is `quick_fixes WHERE escalated_to_sd_id = <sd.id>` -- which can only ever be evaluated FROM an SD, not from a QF. RESOLUTION (carried into the PRD, not left open): the "QF-side axis" is an axis of the SD\'s own leverage score, sourced from quick_fixes data -- count of non-terminal QFs (status NOT IN completed/closed/cancelled) whose escalated_to_sd_id equals this SD\'s id, added to the SD\'s transitive unlockScore. A QF item itself has no structural "something waits on me" signal anywhere in the schema, so a QF\'s own leverage reads UNSCORED -- consistent with the parent SD\'s own key_principle ("a missing input reads UNSCORED and visible, never silently zero"), not a gap this child is failing to close.',
      location: 'strategic_directives_v2.metadata.leverage_criticality_schema_research; success_criteria[2]',
    },
  ],
  recommendations: [
    'PLAN: state the EXP-1 resolution explicitly in the PRD\'s functional requirements so the PRD (not just this Explore note) is the durable record of what "QF axis" means.',
    'PLAN: lib/priority/leverage.js should export the pure dependents/unlockScore pair (parameterized over an already-fetched `sds` array, mirroring claimable-leaves.mjs\'s client-free design) plus a separate escalatedQfCountFor(sdId, quickFixes) so coordinator-backlog-rank.mjs can import both without behavior change (parity test compares old vs new unlockScore in isolation; the QF axis is additive and net-new, so it has no "old" output to reproduce).',
    'PLAN: lib/priority/criticality.js needs a shared SEVERITY_W weight map (critical=3/high=2/medium=1/low=0, matching PRIORITY_W in coordinator-backlog-rank.mjs:241) plus a most-recent-risk_assessments-row-per-sd_id query for the SD blast-radius axis, and an explicit UNSCORED sentinel (not 0) for both (a) QF blast-radius (no risk_assessments equivalent exists for QFs) and (b) any SD with zero risk_assessments rows.',
  ],
  detailed_analysis: {
    searched_identifiers: ['unlockScore', 'blockerKeysFor', 'dependents', 'parseSdDependencies', 'checkMetadataDependency', 'risk_assessments', 'overall_risk_score', 'escalated_to_sd_id', 'quick_fixes.severity', 'quick_fixes.status'],
    searched_paths: ['scripts/coordinator-backlog-rank.mjs', 'scripts/lib/claimable-leaves.mjs', 'lib/utils/parse-sd-dependencies.cjs', 'scripts/modules/sd-next/dependency-resolver.js', 'database/migrations/009_bmad_risk_assessment.sql', 'database/migrations/20251117_create_quick_fixes_table.sql'],
    risk_assessments_live_sample_keys_on: 'strategic_directives_v2.id (uuid), never sd_key',
    escalated_to_sd_id_live_sample_keys_on: 'strategic_directives_v2.id (uuid), never sd_key',
    quick_fixes_status_distribution_2084_rows: { completed: 1563, cancelled: 186, closed: 207, escalated: 7, in_progress: 1, open: 120 },
    lib_priority_dir_exists: false,
  },
  metadata: {
    breadth_search: true,
    exhaustive: false,
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sdRow.id,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'EXPLORE',
  probeExistsRelative: 'scripts/one-off/priority-record-one-001-c-explore-lead-to-plan.mjs',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('EXPLORE', sdRow.id, { code: 'EXPLORE', name: 'Explore' }, results, {
  sdKey: SD_KEY,
  phase: 'LEAD',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
