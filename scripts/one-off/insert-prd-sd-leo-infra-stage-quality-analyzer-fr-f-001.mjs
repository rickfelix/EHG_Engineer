#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = '1419495b-c991-46b1-bd55-09c2201aa951';
const SD_KEY = 'SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-F-001';
const PRD_ID = `PRD-${SD_KEY}`;

const prd = {
  id: PRD_ID,
  sd_id: SD_UUID,
  directive_id: SD_KEY,
  title: 'PRD: Cross-venture quality findings aggregator scheduled job (FR-F prime)',
  version: '1.0.0',
  status: 'approved',
  category: 'infrastructure',
  priority: 'low',
  document_type: 'prd',
  phase: 'PLAN',
  progress: 0,

  executive_summary:
    'Ship a cron-driven cross-venture quality-findings aggregator that reuses the already-shipped `aggregateFindings()` and `upsertPatterns()` from `lib/eva/quality-findings/aggregator.js`. The new entrypoint adds (1) scheduled execution modeled on `scripts/cron/fr-c-generator.mjs` with `pg_advisory_lock` concurrency control, (2) a configurable lookback window via env (`LEO_QUALITY_AGGREGATOR_LOOKBACK_DAYS`, default 7), (3) per-run `audit_log` rows under a new `event_type=quality_aggregator_run` event, and (4) idempotent writes to the existing `quality_finding_patterns` table that the chairman-visibility surface consumes. Net new code targets ~150-200 LOC: cron entrypoint + lookback filter + audit emission + 1 package.json script entry. No schema migration required (consumer table and audit_log already exist).',

  business_context:
    'Per-venture findings hide cross-cutting patterns (e.g., "3 ventures share failing error_capture_wired check"). The chairman needs a daily roll-up surface to identify portfolio-level remediations without scanning each venture individually. Filed within the 72h cadence window of the parent retrospective; cadence deadline 2026-05-04T23:30Z.',

  technical_context:
    'Existing infrastructure: `lib/eva/quality-findings/aggregator.js` exports `aggregateFindings(findings, {minVentureCount=3})` and `upsertPatterns(supabase, patterns)`; `quality_finding_patterns` table is the consumer surface (verified to exist); `scripts/cron/fr-c-generator.mjs` is the canonical cron pattern with `pg_advisory_lock`, `--daemon` mode, `audit_log` emission. `scripts/aggregate-quality-findings.js` is a one-shot manual CLI that does NOT have lookback filtering, cron scheduling, or audit emission. This SD adds the scheduling + observability + lookback delta and avoids reimplementing aggregation logic.',

  functional_requirements: [
    {
      id: 'FR-1',
      title: 'Cron entrypoint module',
      description: 'Create `scripts/cron/quality-findings-aggregator.mjs` modeled on `scripts/cron/fr-c-generator.mjs`. Supports default mode (single batch then exit), `--daemon` mode (loop with sleep), `--dry-run` mode (acquire lock + validate env, skip aggregator), and `--help`. Must be invokable from existing scheduling mechanism (GitHub Actions cron or process manager).',
      priority: 'high',
      acceptance_criteria: ['Direct invocation runs one batch and exits 0', '--daemon loops with configured interval', '--dry-run completes without invoking aggregateFindings', '--help prints flag/env documentation']
    },
    {
      id: 'FR-2',
      title: 'pg_advisory_lock concurrency control',
      description: 'Acquire `pg_advisory_lock(hashtext(\'quality_aggregator\'))` before any read of venture_quality_findings; release in finally block. Second concurrent invocation observes lock as held, writes audit_log event=lock_held, and exits 0 (graceful no-op, NOT an error). Lock release survives crashes via try/finally + connection close.',
      priority: 'high',
      acceptance_criteria: ['Concurrent invocation #2 exits 0 with audit_log lock_held row', 'Lock released even on aggregator exception', 'Lock key is deterministic across runs']
    },
    {
      id: 'FR-3',
      title: 'Reuse aggregateFindings with lookback filter',
      description: 'Read `venture_quality_findings` rows with `created_at >= NOW() - lookback_days * INTERVAL 1 day` and `status = open`, then call `aggregateFindings(findings, {minVentureCount})` from existing aggregator.js. UPSERT result via existing `upsertPatterns(supabase, patterns)`. Do NOT reimplement grouping, pattern_id hashing, or upsert logic — those are the existing aggregator.js contract.',
      priority: 'high',
      acceptance_criteria: ['Findings older than lookback window are excluded from aggregation input', 'aggregateFindings is imported from lib/eva/quality-findings/aggregator.js (not redefined)', 'upsertPatterns is the only write path to quality_finding_patterns']
    },
    {
      id: 'FR-4',
      title: 'audit_log emission per run with structured payload',
      description: 'Emit one `audit_log` row per run with `event_type=quality_aggregator_run`, `entity_type=quality_aggregator_run`, `entity_id=run-id`, and payload `{run_id, lookback_days, started_at, finished_at, wall_clock_ms, ventures_scanned, findings_read, patterns_inserted, patterns_updated, errors[]}`. Failure path writes severity=error with error message + stack (truncated 1000 chars). Lock-held no-op writes severity=info with `event_type=quality_aggregator_lock_held`.',
      priority: 'high',
      acceptance_criteria: ['Successful run produces 1 audit_log row with event_type=quality_aggregator_run severity=info', 'Failure path produces 1 audit_log row with severity=error including error message', 'Lock-held no-op produces 1 audit_log row with event_type=quality_aggregator_lock_held severity=info', 'audit_log entity_id is non-null in all paths (defends prior FR-C audit_log NOT NULL incident)']
    },
    {
      id: 'FR-5',
      title: 'Configurable lookback window via environment',
      description: 'Lookback window read from `LEO_QUALITY_AGGREGATOR_LOOKBACK_DAYS` env, default 7 days. Anchored in UTC (NOW() AT TIME ZONE \'UTC\'). Below-minimum (<1) or non-integer values rejected at startup with clear error before opening DB connection (mirrors fr-c-generator FR_C_POLL_INTERVAL_SEC validation pattern). Lookback value persisted in audit_log payload for re-runnability and audit trail.',
      priority: 'medium',
      acceptance_criteria: ['Default 7 days when env unset', 'Custom value accepted via env override', 'Invalid values (<1 or non-integer) rejected at startup with non-zero exit', 'Audit log payload includes the lookback_days value used']
    },
    {
      id: 'FR-6',
      title: 'package.json script entry + documentation',
      description: 'Add `quality:aggregate:cron` script entry in package.json invoking the new entrypoint. Update the existing `scripts/aggregate-quality-findings.js` header comment to reference the new cron entrypoint as the scheduled-cadence wrapper (the manual CLI remains for ad-hoc runs).',
      priority: 'medium',
      acceptance_criteria: ['npm run quality:aggregate:cron invokes the new entrypoint', 'scripts/aggregate-quality-findings.js header notes the cron sibling']
    }
  ],

  non_functional_requirements: [
    { id: 'NFR-1', title: 'Read-only against venture_quality_findings', description: 'No INSERT/UPDATE/DELETE against venture_quality_findings — only SELECT.' },
    { id: 'NFR-2', title: 'Daily cadence sufficient', description: 'Real-time or sub-daily cadence is explicitly out of scope. Daily run is the contract.' },
    { id: 'NFR-3', title: 'Idempotent re-runs', description: 'Running aggregator twice with identical input produces identical quality_finding_patterns state (relies on existing upsertPatterns deterministic pattern_id).' }
  ],

  technical_requirements: [
    { id: 'TR-1', title: 'Reuse existing aggregator library', description: 'Import aggregateFindings and upsertPatterns from lib/eva/quality-findings/aggregator.js. Do not duplicate grouping logic.' },
    { id: 'TR-2', title: 'Reuse pg_advisory_lock pattern', description: 'Model lock acquisition/release after scripts/cron/fr-c-generator.mjs (tryAcquireLock, releaseLock, resolveLockKey functions).' },
    { id: 'TR-3', title: 'Build with native ES modules (.mjs)', description: 'Match the .mjs convention used by fr-c-generator.mjs and aggregate-quality-findings.js. Use top-level await where appropriate.' },
    { id: 'TR-4', title: 'Vitest test coverage', description: 'Unit tests cover: lookback filter SQL builder, env validation (default/custom/invalid), audit-log payload shape, lock-held no-op path, failure-path audit emission.' }
  ],

  system_architecture: 'Cron tick (GitHub Actions or process manager) -> scripts/cron/quality-findings-aggregator.mjs main() -> readEnvLookbackDays() (validate >=1, integer) -> connect pg + supabase clients -> resolveLockKey(hashtext quality_aggregator) -> tryAcquireLock() -> [if held: writeAuditLog(lock_held, info) + exit 0] -> [if acquired: try { fetch findings WHERE created_at >= NOW() - lookback_days INTERVAL AND status=open -> aggregateFindings(findings) -> upsertPatterns(supabase, patterns) -> writeAuditLog(quality_aggregator_run, info, full payload) } catch (err) { writeAuditLog(quality_aggregator_run, error, {error, stack}) + exit 1 } finally { releaseLock() + pgClient.end() }] -> exit 0. Consumer surface: chairman-facing dashboard reads from quality_finding_patterns (existing table). Telemetry surface: observability tools query audit_log WHERE event_type IN (quality_aggregator_run, quality_aggregator_lock_held).',

  data_model: {
    reads: [
      { table: 'venture_quality_findings', columns: ['id', 'venture_id', 'finding_category', 'severity', 'check_name', 'created_at', 'status'], filter: 'status=open AND created_at >= NOW() - lookback_days * INTERVAL 1 day' }
    ],
    writes: [
      { table: 'quality_finding_patterns', operation: 'UPSERT via upsertPatterns()', conflict_key: 'pattern_id' },
      { table: 'audit_log', operation: 'INSERT', event_types: ['quality_aggregator_run', 'quality_aggregator_lock_held'] }
    ],
    new_tables: [],
    new_columns: []
  },

  acceptance_criteria: [
    { id: 'AC-1', criterion: 'Manual invocation produces summary', measure: 'Seed >=10 venture_quality_findings rows across 3+ ventures sharing one (category, severity, check_name); run aggregator manually; assert quality_finding_patterns has UPSERTed row with venture_count >= 3.' },
    { id: 'AC-2', criterion: 'Lookback window respected', measure: 'Seed findings dated 10 days ago + findings dated 1 day ago; run with LEO_QUALITY_AGGREGATOR_LOOKBACK_DAYS=7; assert old findings excluded from aggregation input (pattern row reflects only recent ventures).' },
    { id: 'AC-3', criterion: 'audit_log row written per run', measure: 'After successful run, SELECT FROM audit_log WHERE event_type=quality_aggregator_run returns >=1 row with run_id, lookback_days, ventures_scanned, findings_read, wall_clock_ms populated and entity_id non-null.' },
    { id: 'AC-4', criterion: 'Read-only against source table', measure: 'Snapshot venture_quality_findings rows (count + checksum) before run; run aggregator; assert post-run snapshot byte-equal.' },
    { id: 'AC-5', criterion: 'Idempotent re-run', measure: 'Run aggregator twice in succession with identical input; assert quality_finding_patterns row count stable (no duplicates), and second run audit_log shows patterns_updated >0 patterns_inserted=0.' },
    { id: 'AC-6', criterion: 'pg_advisory_lock concurrency safety', measure: 'Hold lock externally (psql connection); invoke aggregator; assert exit 0, audit_log row event_type=quality_aggregator_lock_held severity=info present.' },
    { id: 'AC-7', criterion: 'Failure path emits audit row + non-zero exit', measure: 'Force aggregator exception (e.g., point at unreachable supabase); assert exit code 1, audit_log row event_type=quality_aggregator_run severity=error with error message + truncated stack.' },
    { id: 'AC-8', criterion: 'Env validation rejects invalid lookback', measure: 'LEO_QUALITY_AGGREGATOR_LOOKBACK_DAYS=0 -> startup error non-zero exit; LEO_QUALITY_AGGREGATOR_LOOKBACK_DAYS=abc -> startup error non-zero exit; LEO_QUALITY_AGGREGATOR_LOOKBACK_DAYS unset -> uses 7.' }
  ],

  test_scenarios: [
    { id: 'T-1', type: 'unit', name: 'readEnvLookbackDays defaults and validation', description: 'Vitest: default 7 when unset; accepts integer; rejects 0/negative/non-integer with clear message.' },
    { id: 'T-2', type: 'unit', name: 'buildLookbackFilter SQL shape', description: 'Vitest: helper builds correct supabase filter chain using gte and the correct UTC ISO timestamp.' },
    { id: 'T-3', type: 'unit', name: 'audit_log payload shape', description: 'Vitest: success payload has all required keys; failure payload has error + truncated stack; lock_held payload has lock_name + lock_key.' },
    { id: 'T-4', type: 'unit', name: 'Lock-held path is graceful no-op', description: 'Vitest: stub tryAcquireLock to return false; assert main returns exitCode 0 and writeAuditLog called with quality_aggregator_lock_held event_type.' },
    { id: 'T-5', type: 'unit', name: 'Failure-path audit emission', description: 'Vitest: stub aggregateFindings to throw; assert main returns exitCode 1, releaseLock called, audit_log severity=error with error message.' },
    { id: 'T-6', type: 'integration', name: 'End-to-end against test supabase', description: 'Seed venture_quality_findings fixtures; run main(); assert quality_finding_patterns rows match expected aggregation; assert audit_log row present.' },
    { id: 'T-7', type: 'integration', name: 'Lookback window exclusion', description: 'Seed mix of old + new findings; run with lookback_days=3; assert only ventures with recent findings appear in patterns output.' }
  ],

  implementation_approach:
    '1. Create scripts/cron/quality-findings-aggregator.mjs (entrypoint, ~120 LOC): copy fr-c-generator.mjs scaffolding (parseArgs, buildSupabase, buildPgClient, resolveLockKey, tryAcquireLock, releaseLock); replace generator-specific imports with imports from lib/eva/quality-findings/aggregator.js (aggregateFindings, upsertPatterns); replace runOneBatch body with: read findings filtered by lookback, call aggregateFindings, call upsertPatterns. 2. Add small helper readEnvLookbackDays() with strict integer validation (~15 LOC). 3. Add writeAggregatorAuditLog() helper for the new event_type with the agreed payload schema (~25 LOC). 4. Add quality:aggregate:cron entry to package.json scripts (~1 LOC). 5. Update scripts/aggregate-quality-findings.js header comment to point at the new cron sibling (~3 LOC). 6. Vitest tests in tests/unit/cron/quality-findings-aggregator.test.js covering T-1 through T-5 (~150 LOC). T-6/T-7 are deferred to manual integration verification using existing seed fixtures from FR-B/C work. Total estimate ~150-200 LOC source + ~150 LOC tests.',

  technology_stack: ['Node.js (ESM .mjs)', '@supabase/supabase-js', 'pg (pg_advisory_lock)', 'vitest'],

  dependencies: [
    { type: 'sd', id: 'SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-B-001', status: 'completed', note: 'Provides venture_quality_findings rows that the aggregator reads.' },
    { type: 'lib', id: 'lib/eva/quality-findings/aggregator.js', status: 'shipped', note: 'Provides aggregateFindings + upsertPatterns. Do not modify.' },
    { type: 'pattern', id: 'scripts/cron/fr-c-generator.mjs', status: 'shipped', note: 'Cron pattern template.' },
    { type: 'table', id: 'quality_finding_patterns', status: 'exists', note: 'Consumer surface for chairman-facing dashboard.' },
    { type: 'table', id: 'audit_log', status: 'exists', note: 'Telemetry surface; new event_type quality_aggregator_run added.' }
  ],

  risks: [
    {
      id: 'R-1',
      title: 'Lookback semantics drift between local time and UTC',
      severity: 'medium',
      mitigation: 'Anchor lookback comparison in UTC explicitly (NOW() AT TIME ZONE \'UTC\' or supabase ISO timestamp). Document the UTC anchor in code header. Persist computed lookback_window in audit_log payload so historical audit can reproduce the exact window used.'
    },
    {
      id: 'R-2',
      title: 'audit_log NOT NULL entity_id violation on lock_held / failure paths',
      severity: 'medium',
      mitigation: 'Mirror the FR-C generator audit_log fix (audit_log.entity_id NOT NULL caught mid-ship for FR-C per recent retro). Always pass entity_id (use run_id or static lock_name as appropriate); add a unit test asserting payload non-null entity_id.'
    },
    {
      id: 'R-3',
      title: 'pg connection leak on crash leaves advisory lock held',
      severity: 'low',
      mitigation: 'Use try/finally for pgClient.end(); pg server releases session-scoped advisory locks on connection close. Test crash path manually before LEAD-FINAL-APPROVAL.'
    },
    {
      id: 'R-4',
      title: 'Risk-agent false-positive flagged security and data-migration risk',
      severity: 'low',
      mitigation: 'No auth/authorization changes (cron read-only, service-role key only — same posture as fr-c-generator). No new tables/triggers/views (uses existing quality_finding_patterns + audit_log). Risk-agent regex matched literal terms in SD prose; superseded by this PRD which documents the actual surface.'
    }
  ],

  constraints: [
    'No real-time / sub-daily cadence',
    'No auto-remediation actions (FR-C generator territory)',
    'No new SD creation from aggregated patterns (FR-C territory)',
    'Single-tenant (no cross-org aggregation)',
    'Read-only against venture_quality_findings'
  ],

  assumptions: [
    'venture_quality_findings table is populated by FR-B writers (status=open is the in-scope subset)',
    'quality_finding_patterns table schema matches what upsertPatterns expects (verified by FR-F sibling SD shipping aggregator.js)',
    'GitHub Actions cron or equivalent process manager is available for daily scheduling',
    'audit_log accepts custom event_type strings (no enum constraint — verified by existing usage)'
  ],

  metadata: {
    sub_agent_evidence: { LEAD: 'e43e9550-b350-4d8e-82ed-baf2d5ecbbe6' },
    prd_authored_by: 'claude-code-inline-mode',
    prd_authored_at: new Date().toISOString(),
    derived_from_lead_evaluation: {
      reuse_existing_aggregator: 'lib/eva/quality-findings/aggregator.js',
      reuse_cron_pattern: 'scripts/cron/fr-c-generator.mjs',
      net_new_loc_estimate: '150-200 source + ~150 tests',
      validation_agent_lock_downs: ['lookback UTC anchoring', 'audit_log event_type contract', 'chairman-visibility surface = existing quality_finding_patterns']
    },
    scope_amendment_rationale: 'LEAD audit found aggregateFindings() already implemented in lib/eva/quality-findings/aggregator.js attributed to SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-F (different SD family). This SD adds the scheduling/observability/lookback delta — not a duplicate. Validation-agent confirmed (score 92, evidence id e43e9550).',
    risk_agent_overrides: { security: 'false positive (no auth, service-role read only)', data_migration: 'false positive (no schema changes)', performance: 'overstated (real-time excluded by SD scope)' }
  }
};

const userStories = [
  {
    story_key: `${SD_KEY}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    title: 'As a chairman I want a daily cross-venture pattern roll-up so that I can identify portfolio-level remediations without scanning each venture',
    user_role: 'Chairman',
    user_want: 'a daily cross-venture aggregation of quality findings into the patterns table',
    user_benefit: 'I can prioritize portfolio-level fixes from one surface instead of N venture views',
    story_points: 3,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      'Patterns table refreshed at least once per day',
      'Each pattern shows venture_count >=3 (configurable)',
      'audit_log shows the run telemetry I can verify if patterns look stale'
    ],
    definition_of_done: ['AC-1, AC-3, AC-5 pass', 'Vitest T-1..T-5 green', 'Manual smoke against seeded fixtures'],
    technical_notes: 'Reuses aggregateFindings() from lib/eva/quality-findings/aggregator.js. Cron pattern from scripts/cron/fr-c-generator.mjs. New event_type quality_aggregator_run in audit_log.',
    implementation_approach: 'Cron entrypoint scripts/cron/quality-findings-aggregator.mjs imports aggregateFindings + upsertPatterns and runs daily.',
    test_scenarios: ['T-1', 'T-3', 'T-6'],
    implementation_context: { reuses: ['lib/eva/quality-findings/aggregator.js', 'scripts/cron/fr-c-generator.mjs'], new_files: ['scripts/cron/quality-findings-aggregator.mjs', 'tests/unit/cron/quality-findings-aggregator.test.js'], audit_event_types: ['quality_aggregator_run', 'quality_aggregator_lock_held'] }
  },
  {
    story_key: `${SD_KEY}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    title: 'As an SRE I want the cron entrypoint to be safe under concurrent invocation so that two ticks do not double-aggregate',
    user_role: 'SRE',
    user_want: 'pg_advisory_lock concurrency control on the cron entrypoint',
    user_benefit: 'I can run the cron from multiple schedulers without corrupting patterns or audit_log',
    story_points: 2,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: [
      'Concurrent invocation #2 exits 0 with lock_held audit row',
      'Lock released on aggregator exception',
      'Connection close releases lock as defense in depth'
    ],
    definition_of_done: ['AC-6 passes', 'Vitest T-4 + T-5 green'],
    technical_notes: 'Mirror tryAcquireLock + releaseLock pattern from fr-c-generator.mjs. Lock key hashtext(\'quality_aggregator\').',
    implementation_approach: 'Lock acquisition in main() before any findings read; release in finally block.',
    test_scenarios: ['T-4', 'T-5'],
    implementation_context: { reuses: ['scripts/cron/fr-c-generator.mjs lock pattern'], lock_key_name: 'quality_aggregator', concurrency_test: 'manual psql lock + cron invoke' }
  }
];

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const s = createClient(url, key);

  // Insert PRD
  const { error: prdErr } = await s.from('product_requirements_v2').upsert(prd, { onConflict: 'id' });
  if (prdErr) {
    console.error('PRD insert failed:', prdErr.message);
    process.exit(1);
  }
  console.log('PRD inserted:', PRD_ID);

  // Insert user stories
  for (const us of userStories) {
    const { error: usErr } = await s.from('user_stories').upsert(us, { onConflict: 'story_key' });
    if (usErr) {
      console.error(`User story ${us.story_key} insert failed:`, usErr.message);
      process.exit(1);
    }
    console.log('User story inserted:', us.story_key);
  }

  console.log('PRD + user stories committed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
