import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const SD = 'SD-LEO-INFRA-PRE-PLAN-CRITIQUE-PRD-TRUNCATION-001';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 92,
  execution_time_ms: 0,
  summary:
    'Schema-impact analysis for plan_critiques (LEAD, pre-PRD). Recommended shape: TIER-1 auto-appliable ' +
    'ALTER TABLE adding metadata jsonb + content_hash text (both nullable, no default), NO new index. ' +
    'CONDITIONAL on one design blocker: FR-B as scoped (short-TTL cache) does not achieve its stated goal ' +
    'of making findActiveOverride bind, because the human override round-trip outlives the cache TTL.',
  findings: [
    { severity: 'HIGH', area: 'design', issue: 'Short-TTL content-hash cache does not fix the override fingerprint binding: the human runs critique-override.js minutes-to-days after the block, by which time the cache has expired, so the next run makes a fresh LLM call, produces a new findings composition, and the override still fails to match. Recommend binding the override to content_hash (deterministic) instead of/in addition to findingsFingerprint (stochastic).' },
    { severity: 'MEDIUM', area: 'security', issue: 'If cache reuse copies findings across runs without a content_hash equality filter in findActiveOverride, one audited override silently widens to excuse every run in the cache window — a re-run of SECURITY MEDIUM-1 (evidence e77d1c4b), gated on cache duration instead of 14 days flat.' },
    { severity: 'LOW', area: 'performance', issue: 'Measured: no new index justified. Table is 6 pages / 96 kB / 237 rows; idx_plan_critiques_sd_id already narrows to <=17 rows and the residual filter runs in 0.065-0.097 ms. idx_plan_critiques_severity (233/237 rows are block) and the BRIN on created_at both show 0 scans in pg_stat_user_indexes.' },
    { severity: 'LOW', area: 'correctness', issue: 'findActiveOverride uses .limit(10) with no content filter; SDs show bursts up to 17 critiques. A matching override can fall outside the limit-10 window. A content_hash equality filter narrows before the limit and fixes this incidentally.' },
    { severity: 'INFO', area: 'schema', issue: 'RLS is ENABLED (relforcerowsecurity=false). Both policies are column-agnostic (plan_critiques_service_all ALL/service_role USING true; plan_critiques_select_authenticated SELECT/authenticated USING true). ADD COLUMN needs NO policy change. No INSERT policy exists for anon/authenticated despite table-level grants, so the writer must remain service_role.' },
    { severity: 'INFO', area: 'compat', issue: 'Existing readers are NULL-safe by construction: critique-catch-rate-monitor.js uses head:true count-only queries; critique-override.js and findActiveOverride use explicit column lists. No dependent views. 237 rows will read metadata/content_hash as NULL.' },
  ],
  recommendations: [
    'Migration: single file in database/migrations/ (NOT chairman-gated) — ALTER TABLE plan_critiques ADD COLUMN IF NOT EXISTS metadata jsonb; ADD COLUMN IF NOT EXISTS content_hash text; + two COMMENT ON COLUMN. Verified TIER-1 by executing classifyMigration().',
    'Do NOT add an index in this migration; document the deferred TIER-1 follow-up if the table exceeds ~10k rows.',
    'Use a dedicated content_hash text column, not metadata->>content_hash: the jsonb-expression-index escape hatch classifies TIER-2 (chairman ceremony), verified by execution.',
    'PRD must reconcile the two matching windows explicitly: short cache TTL = cost optimization; 14-day override lookback = audited human decision validity. They serve different purposes and should NOT be unified.',
    'Include the critic prompt/model version in the hashed input so improving the critic invalidates cached critiques.',
  ],
  detailed_analysis:
    'LIVE MEASUREMENTS (pooler, 2026-08-16): plan_critiques has 10 columns, 237 rows (brief said 217 — stale), ' +
    '233 block / 26 in last 14d / 6 overridden. relrowsecurity=true. Indexes: pkey, btree(sd_id) 16569 scans, ' +
    'btree(overall_severity) 0 scans, BRIN(created_at) 0 scans. relpages=6. No triggers, no dependent views. ' +
    'CHECK constraint ALREADY includes could_not_check, so migration 20260810 is applied and the gate comment at ' +
    'pre-plan-critique.js:213-217 is stale. ' +
    'TIER CLASSIFIER (executed, not read): metadata-only=TIER-1; metadata+content_hash+plain btree+COMMENTs=TIER-1; ' +
    'jsonb expression index=TIER-2 (unrecognized_or_unsafe_statement); partial index WHERE=TIER-2; backfill UPDATE=TIER-2. ' +
    'tierGateEnabled() executed LIVE = true, so TIER-2 genuinely defers to the chairman gate — note database/chairman-gated/README.md ' +
    'is STALE on this point (it claims the gate is inert; polarity is inverted and it fails closed).',
  metadata: { analysis_scope: 'schema_impact_pre_prd', table: 'plan_critiques', phase: 'LEAD' },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'DATABASE',
  fallback: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: true });

const out = await storeSubAgentResults('DATABASE', SD, { code: 'DATABASE', name: 'Principal Database Architect' }, results, { sdKey: SD, phase: 'LEAD' });
console.log('STORED:', JSON.stringify(out)?.slice(0, 400));
console.log('metadata.repo_path =', results.metadata.repo_path);
console.log('metadata.executed_from_cwd =', results.metadata.executed_from_cwd);
