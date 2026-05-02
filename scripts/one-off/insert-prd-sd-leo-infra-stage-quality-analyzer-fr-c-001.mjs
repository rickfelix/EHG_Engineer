#!/usr/bin/env node
/**
 * Insert PRD row for SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-C-001
 *
 * INLINE_LLM_MODE flow — `add-prd-to-database.js` printed the generation prompt
 * and exited; this script authors + inserts the PRD row directly.
 *
 * SD source: read in advance, content mapped from key_changes (5 FRs),
 * smoke_test_steps + success_criteria (5 test scenarios), and risks JSONB.
 * Constraints respected: ≥3 functional_requirements, ≥1 acceptance_criteria,
 * ≥1 test_scenarios, status enum, document_type='prd'.
 */
import { createDatabaseClient } from '../lib/supabase-connection.js';

const PRD_ID = 'PRD-SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-C-001';
const SD_ID = 'SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-C-001';
const SD_UUID = 'a8df4623-2999-4d51-b5f6-bfeb3401573c';
const TITLE = "Per-finding SD generator: auto-create remediation SDs from FAIL/WARN venture_quality_findings rows (FR-C′ from SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-001 follow-up tail)";

// 5 functional requirements mapped 1:1 from SD's key_changes + scope detail
const functional_requirements = [
  {
    id: "FR-1",
    requirement: "Generator module with venture-scoped and batch entrypoints",
    description: "Author lib/eva/quality-findings/sd-generator.js exposing generateRemediationSdsForVenture(ventureId, options) and generateRemediationSdsBatch(options). ESM, Node 22, no new external dependencies beyond @supabase/supabase-js and the existing scripts/modules/sd-key-generator.js helper. Reads venture_quality_findings WHERE status='pending' and severity IN ('FAIL','WARN'). Writes DRAFT SDs whose status='draft' and current_phase='LEAD'. Updates source findings.status='sd_filed' with finding_metadata.filed_sd_id reference and sd_filed_at timestamp set to NOW(). Maps to SD strategic_objectives #1 (close lifecycle-loop) and #2 (DRAFT-only output).",
    acceptance_criteria: [
      "Module exports both generateRemediationSdsForVenture and generateRemediationSdsBatch as named ESM exports; default export is undefined",
      "Generator selects only rows where status='pending' AND severity IN ('FAIL','WARN'); informational/PASS rows are skipped",
      "Every inserted SD row satisfies status='draft' AND current_phase='LEAD' AND metadata.generated_by='fr-c-prime-generator' (assertable via SELECT)",
      "Each processed finding row transitions to status='sd_filed' with finding_metadata.filed_sd_id populated and sd_filed_at = transaction NOW()",
      "Module loads under Node 22 with no new package.json dependencies; vitest unit suite imports it without errors"
    ]
  },
  {
    id: "FR-2",
    requirement: "Cron polling driver with idempotency lock",
    description: "Wire the generator into the repo's existing cron-style scheduling pattern (NOT a database trigger — keeps generator failures from blocking analyzer commits, per SD strategic_objective #4). Default poll interval = 1 hour, override via env var FR_C_POLL_INTERVAL_SEC. Concurrent invocations are serialized via a Postgres advisory lock keyed on hashtext('fr_c_generator'); a second cron tick that arrives mid-run no-ops with audit_log event='lock_held' and exits zero. Maps to SD strategic_objective #4 (decouple generator failures from analyzer commits).",
    acceptance_criteria: [
      "Cron entrypoint script lives alongside existing scheduling pattern in the repo (not a fresh systemd unit, not a DB trigger); README change documents how to enable",
      "Env var FR_C_POLL_INTERVAL_SEC overrides the default 3600s when set; values <60 are rejected with a startup error",
      "pg_advisory_lock(hashtext('fr_c_generator')) is acquired before any read of venture_quality_findings; pg_advisory_unlock is called in a finally block",
      "Concurrent second invocation observes the lock as held, writes audit_log event='lock_held' with current timestamp, and exits with code 0 (not an error)",
      "Generator exception is caught at the entrypoint boundary; lock is released; failure surfaces via audit_log event='generator_failed' with error message; cron exit code propagates so external monitoring can alert"
    ]
  },
  {
    id: "FR-3",
    requirement: "Composite-key dedup via metadata.source_finding_ids array membership",
    description: "For each candidate finding, check whether an OPEN-status remediation SD (status IN ('draft','in_progress','planning','approved')) already exists whose metadata.source_finding_ids[] array contains a finding row sharing the same (venture_id, finding_type, severity) tuple. If yes: append the new finding_id to that SD's source_finding_ids array (jsonb concatenation), set the finding row's status='sd_filed' pointing at the EXISTING SD, and write audit_log event='dedup_hit' with both finding_ids and the matched SD id. If no: create a new SD as per FR-1 and write audit_log event='dedup_miss'. Maps to SD strategic_objective #3 (make deduplication observable).",
    acceptance_criteria: [
      "Dedup query matches only OPEN-status SDs (closed/rejected/cancelled SDs do not absorb new findings)",
      "Append path uses jsonb_set or || array concat operator preserving existing source_finding_ids[] contents (no overwrite)",
      "Every dedup decision writes exactly one audit_log row: event='dedup_hit' OR event='dedup_miss' with venture_id, finding_type, severity, candidate finding_id, and matched_sd_id (null on miss) in event_data",
      "Test: insert finding A; cron run #1 creates SD; insert finding B with same (venture,type,severity); cron run #2 leaves SD count = 1 with source_finding_ids[]=[A,B] and finding B status='sd_filed' pointing at the SD",
      "Test: insert finding C in different (venture,type,severity) tuple; cron creates a SECOND SD (dedup_miss path)"
    ]
  },
  {
    id: "FR-4",
    requirement: "Forward-only status machine on venture_quality_findings",
    description: "Schema migration adds CHECK constraint status IN ('pending','sd_filed','resolved','cancelled') and timestamp columns sd_filed_at, resolved_at, cancelled_at (TIMESTAMPTZ nullable). Allowed transitions are forward-only: pending→sd_filed (generator), sd_filed→resolved (LEAD when remediation SD completes), sd_filed→cancelled (LEAD when remediation SD cancelled), pending→cancelled (LEAD direct cancel without filing). Backward transitions (e.g., sd_filed→pending) are rejected. Enforcement implemented as a BEFORE UPDATE trigger that raises an exception on disallowed transitions; the migration is forward-compatible (existing rows default to 'pending'). Maps to SD risk #3 mitigation (status machine prevents silent finding loss).",
    acceptance_criteria: [
      "Migration file added under database/migrations/ with date-prefixed name; idempotent (uses IF NOT EXISTS / DO blocks); includes rollback SQL in trailing comment",
      "CHECK constraint named venture_quality_findings_status_chk rejects any value outside the four-element enum",
      "BEFORE UPDATE trigger raises 'invalid status transition: % -> %' on backward moves; allowed forward transitions succeed",
      "Each transition sets the corresponding timestamp column (sd_filed_at, resolved_at, cancelled_at) atomically in the same UPDATE; trigger guarantees the timestamp is set when the matching status change occurs",
      "Vitest integration test (HAS_REAL_DB sentinel) seeds a finding, walks pending→sd_filed→resolved, and asserts each timestamp is non-null and monotonically increasing"
    ]
  },
  {
    id: "FR-5",
    requirement: "Per-venture daily SD-creation rate limit",
    description: "Default ceiling 20 SDs per venture per UTC day, configurable via env var FR_C_RATE_LIMIT_PER_VENTURE_PER_DAY. Counts the SDs created today by SELECT COUNT(*) FROM strategic_directives_v2 WHERE metadata->>'generated_by'='fr-c-prime-generator' AND venture_id=? AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC'). When the count is at or above the ceiling for a candidate venture, leave matching findings at status='pending', write audit_log event='rate_limit_triggered' with venture_id and current count, and continue to the next venture. Subsequent cron cycles retry naturally as the day rolls over. Maps to SD risk #1 mitigation (flood protection) and strategic_objective #2 (bounded output).",
    acceptance_criteria: [
      "Env var FR_C_RATE_LIMIT_PER_VENTURE_PER_DAY accepts a positive integer; absent or invalid value falls back to 20 with a warning to stderr",
      "Rate-limit count query uses date_trunc('day', NOW() AT TIME ZONE 'UTC'); a venture that just rolled over the day boundary is allowed to create again",
      "On rate-limit hit, candidate findings stay status='pending' (no partial state), and audit_log event='rate_limit_triggered' is written exactly once per venture per cron cycle (not per skipped finding)",
      "Test: insert 50 findings for one venture across multiple (finding_type, severity) tuples; cron run produces ≤20 SDs; 30+ findings remain at status='pending'; subsequent same-day runs add zero new SDs for that venture",
      "Test: a different venture in the same cron cycle is unaffected by the first venture's rate limit and proceeds normally"
    ]
  }
];

const acceptance_criteria = [
  {
    criterion: "Manual venture_quality_findings INSERT in staging triggers DRAFT SD creation in next cron cycle",
    measure: "Insert FAIL row; observe DRAFT SD appear within poll-interval; SD metadata.source_finding_ids[] contains inserted row id"
  },
  {
    criterion: "Dedup test — insert same finding twice, only 1 SD created",
    measure: "Insert finding row A; cron run 1; insert finding row A duplicate; cron run 2; assert COUNT(SDs)=1 with both finding_ids in source_finding_ids[]"
  },
  {
    criterion: "Rate-limit test — insert 50 findings for 1 venture, generator rate-limited",
    measure: "Per-venture rate limit blocks SD creation past N=20/day; remaining findings stay status=pending; audit_log shows rate_limit_triggered event"
  },
  {
    criterion: "All generated SDs are DRAFT/LEAD",
    measure: "SELECT status, current_phase FROM strategic_directives_v2 WHERE metadata->>'generated_by' = 'fr-c-prime-generator' returns 100% draft/LEAD"
  },
  {
    criterion: "Generator failure does not corrupt findings status machine",
    measure: "Inject DB error into generator; assert findings remain status=pending (not stuck in intermediate state); next cron retries cleanly"
  }
];

const test_scenarios = [
  {
    id: "TS-1",
    name: "End-to-end finding → DRAFT SD round-trip",
    type: "integration",
    gating: "HAS_REAL_DB sentinel-gated",
    steps: [
      "Seed venture_quality_findings row with status='pending', severity='FAIL', valid venture_id",
      "Invoke generateRemediationSdsBatch() once",
      "SELECT id, status, current_phase, metadata FROM strategic_directives_v2 WHERE metadata->>'generated_by'='fr-c-prime-generator' AND created_at > seed_start"
    ],
    expected: "Exactly 1 SD row returned with status='draft', current_phase='LEAD', metadata.source_finding_ids array contains the seeded finding id; finding row now has status='sd_filed' and finding_metadata.filed_sd_id matches"
  },
  {
    id: "TS-2",
    name: "Dedup hit — duplicate finding rolls up under existing SD",
    type: "integration",
    gating: "HAS_REAL_DB sentinel-gated",
    steps: [
      "Seed finding A (venture=V1, finding_type=T1, severity=FAIL); run generator → SD #1 created",
      "Seed finding B with identical (venture, finding_type, severity); run generator a second time",
      "SELECT COUNT(*) FROM strategic_directives_v2 WHERE metadata->>'generated_by'='fr-c-prime-generator' AND venture_id='V1'",
      "SELECT metadata->'source_finding_ids' FROM the same SD",
      "SELECT event FROM audit_log WHERE event IN ('dedup_hit','dedup_miss') ORDER BY created_at DESC LIMIT 2"
    ],
    expected: "COUNT = 1 (no new SD created); source_finding_ids contains both A and B finding ids; audit_log shows one dedup_miss (for A) and one dedup_hit (for B); finding B status='sd_filed' pointing at SD #1"
  },
  {
    id: "TS-3",
    name: "Rate-limit ceiling enforced per venture per UTC day",
    type: "integration",
    gating: "HAS_REAL_DB sentinel-gated; sets FR_C_RATE_LIMIT_PER_VENTURE_PER_DAY=5 for test brevity",
    steps: [
      "Seed 12 distinct findings for venture V1 spanning 12 distinct (finding_type, severity) tuples (so dedup does not absorb them)",
      "Run generator once",
      "SELECT COUNT(*) FROM strategic_directives_v2 WHERE metadata->>'generated_by'='fr-c-prime-generator' AND venture_id='V1' AND created_at::date = CURRENT_DATE",
      "SELECT COUNT(*) FROM venture_quality_findings WHERE venture_id='V1' AND status='pending'",
      "SELECT event_data FROM audit_log WHERE event='rate_limit_triggered' AND event_data->>'venture_id'='V1' ORDER BY created_at DESC LIMIT 1"
    ],
    expected: "SD count ≤ 5; remaining ≥7 findings still status='pending'; audit_log row present with venture_id='V1' and count fields populated; second run on same day produces zero additional SDs for V1"
  },
  {
    id: "TS-4",
    name: "Generator failure isolation — findings remain pending on exception",
    type: "unit + integration",
    gating: "Unit: vi.mock supabase to throw on insert; Integration: HAS_REAL_DB sentinel + invalid foreign key payload",
    steps: [
      "Force the insert into strategic_directives_v2 to throw (mocked or via FK violation)",
      "Invoke generator entrypoint",
      "SELECT status, finding_metadata FROM venture_quality_findings WHERE id = test_finding_id"
    ],
    expected: "Finding row status remains 'pending'; finding_metadata.filed_sd_id is NULL; audit_log records event='generator_failed' with error message; advisory lock is released (SELECT pg_try_advisory_lock(hashtext('fr_c_generator')) returns true after generator exits)"
  },
  {
    id: "TS-5",
    name: "Status-machine forward-only enforcement",
    type: "integration",
    gating: "HAS_REAL_DB sentinel-gated",
    steps: [
      "Seed finding row at status='pending'",
      "UPDATE venture_quality_findings SET status='sd_filed', sd_filed_at=NOW() WHERE id=...",
      "Attempt UPDATE venture_quality_findings SET status='pending' WHERE id=... (backward transition)",
      "UPDATE venture_quality_findings SET status='resolved', resolved_at=NOW() WHERE id=...",
      "Attempt UPDATE venture_quality_findings SET status='sd_filed' WHERE id=... (backward transition)"
    ],
    expected: "Forward transitions succeed; both backward UPDATE attempts raise the trigger exception 'invalid status transition' and the row remains at the prior valid state; sd_filed_at and resolved_at columns are populated and monotonically increasing"
  },
  {
    id: "TS-6",
    name: "Concurrent cron tick observes advisory lock and no-ops",
    type: "integration",
    gating: "HAS_REAL_DB sentinel-gated",
    steps: [
      "Open psql session A; SELECT pg_advisory_lock(hashtext('fr_c_generator'))",
      "Invoke cron entrypoint in session B",
      "Capture session B exit code and audit_log writes",
      "Session A: SELECT pg_advisory_unlock(hashtext('fr_c_generator'))"
    ],
    expected: "Session B exits with code 0 (not an error); audit_log contains exactly one event='lock_held' row written by session B; no findings were processed by session B; subsequent invocation after unlock proceeds normally"
  }
];

const risks = [
  {
    risk: "Generator floods queue if FR-B′ produces many findings on first run, overwhelming LEAD review capacity",
    severity: "high",
    mitigation: "Per-venture rate limit (default 20/day) implemented in FR-5 plus LEAD batch-approval ceremony for first-run backlog; ceiling configurable via FR_C_RATE_LIMIT_PER_VENTURE_PER_DAY env var"
  },
  {
    risk: "Duplicate detection misses (different finding payload but same root cause) yields redundant SDs LEAD must triage",
    severity: "medium",
    mitigation: "Composite key (venture_id, finding_type, severity) per FR-3 plus audit_log of every dedup decision so misses are diagnosable; LEAD can manually merge SDs and bump dedup version when patterns emerge"
  },
  {
    risk: "Generator failures silently lose findings (status stuck at pending forever or transitions partially)",
    severity: "high",
    mitigation: "Status machine on findings rows per FR-4 with forward-only trigger guards plus generator-side exception handler that releases the advisory lock and writes audit_log event='generator_failed'; subsequent cron cycles naturally retry"
  },
  {
    risk: "FR-B′ is not yet shipped, so this work cannot be smoke-tested end-to-end against real findings rows until the upstream lands",
    severity: "medium",
    mitigation: "Integration tests use seeded venture_quality_findings rows under the HAS_REAL_DB sentinel; once FR-B′ ships, run a coordinated staging smoke per the smoke_test_steps; SD is correctly tagged blocked-by FR-B′ in metadata.blocked_by_sd_key for cadence visibility"
  }
];

const technical_requirements = {
  language: "Node.js 22 (ESM only)",
  dependencies_added: "None — uses existing @supabase/supabase-js and scripts/modules/sd-key-generator.js",
  observability: "All write paths and dedup decisions emit audit_log rows via the existing eva-orchestrator audit pattern (event + event_data JSONB); cron entrypoint logs start/finish/lock state to stdout for cron capture",
  idempotency: "Composite-key dedup per FR-3 plus pg_advisory_lock per FR-2 ensure repeated cron ticks produce zero new side effects when the underlying findings have not changed",
  failure_isolation: "Generator runs out-of-band of analyzer write path per FR-2 (cron polling, not DB trigger); generator exceptions never block analyzer commits; advisory lock release is in a finally block",
  testing_framework: "vitest; integration tests gated by HAS_REAL_DB sentinel per the convention set by SD-LEO-INFRA-COVERAGE-CI-TRIAGE-001",
  schema_changes: "One forward-only migration adding CHECK constraint and three TIMESTAMPTZ columns to venture_quality_findings, plus a BEFORE UPDATE trigger function; rollback SQL provided in trailing migration comment"
};

const system_architecture = `
## Components

1. **venture_quality_findings table** (already extant from FR-A′/FR-B′)
   - Source rows with status IN ('pending','sd_filed','resolved','cancelled')
   - This SD's FR-4 adds the CHECK constraint, three timestamp columns, and the forward-only trigger

2. **lib/eva/quality-findings/sd-generator.js** (new — FR-1)
   - Exports generateRemediationSdsForVenture(ventureId, options)
   - Exports generateRemediationSdsBatch(options)
   - Reads pending FAIL/WARN findings, applies dedup (FR-3), enforces rate limit (FR-5), writes DRAFT SDs

3. **Cron polling driver** (new — FR-2)
   - Scheduled at FR_C_POLL_INTERVAL_SEC (default 3600s)
   - Acquires pg_advisory_lock(hashtext('fr_c_generator')) before any read
   - Calls generateRemediationSdsBatch() then releases the lock
   - Wired into the repo's existing scheduling pattern (NOT a DB trigger)

4. **strategic_directives_v2** (existing target)
   - Receives DRAFT SD inserts via existing leo-create-sd helpers
   - All inserted rows have status='draft', current_phase='LEAD', metadata.generated_by='fr-c-prime-generator', metadata.source_finding_ids[]

5. **audit_log** (existing observability sink)
   - Receives event rows for: dedup_hit, dedup_miss, rate_limit_triggered, generator_failed, lock_held
   - event_data JSONB carries venture_id, finding_ids, sd_id, error message as appropriate

## Data flow (one cron tick)

\`\`\`
cron tick
  → acquire pg_advisory_lock(hashtext('fr_c_generator'))
    → if lock not acquired: write audit_log event='lock_held', exit 0
    → else: SELECT * FROM venture_quality_findings WHERE status='pending' AND severity IN ('FAIL','WARN')
      → group candidates by venture_id
        → for each venture:
          → SELECT COUNT(*) of today's SDs for this venture
          → if at/over rate limit: write audit_log event='rate_limit_triggered'; skip venture; continue
          → for each (finding_type, severity) bucket within venture:
            → search for OPEN remediation SD with matching tuple in metadata.source_finding_ids[]
              → hit: append finding_id to existing SD's source_finding_ids; write audit_log event='dedup_hit'
              → miss: insert new DRAFT SD via leo-create-sd helpers; write audit_log event='dedup_miss'
            → UPDATE finding rows SET status='sd_filed', sd_filed_at=NOW(), finding_metadata=jsonb_set(...,'filed_sd_id',...)
      → release pg_advisory_unlock; exit 0
  → on any unhandled exception: release lock in finally; write audit_log event='generator_failed'; exit non-zero
\`\`\`

## Failure-isolation boundary

The cron driver is the only caller of the generator module. Analyzer commit paths (FR-A′/FR-B′) never invoke the generator. A generator exception cannot block analyzer writes; the worst outcome is that affected findings remain at status='pending' and are picked up on the next cron tick. The advisory lock guarantees at-most-one concurrent generator run regardless of cron concurrency or operator-triggered manual invocations.
`.trim();

const executive_summary = `Ship the lifecycle-loop closer for the parent stage-quality analyzer (SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-001): an automated, bounded, deduplicated path from FAIL/WARN venture_quality_findings rows to DRAFT remediation SDs that LEAD reviews and approves. Five functional requirements deliver: (1) the generator module with venture-scoped + batch entrypoints, (2) cron polling with advisory-lock idempotency to keep the generator decoupled from analyzer commits, (3) composite-key dedup so finding storms roll up rather than fan out, (4) a forward-only status machine on venture_quality_findings to prevent silent finding loss, and (5) a per-venture daily ceiling (default 20 SDs/venture/day) so LEAD review capacity is never overwhelmed. Generator output is strictly DRAFT — the generator never auto-approves any SD. Blocked-by FR-B′ (SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-B-001), which must ship findings persistence first; cadence deadline 2026-05-04T23:30Z.`;

const business_context = `The parent stage-quality analyzer detects FAIL/WARN conditions today but has no systematic mechanism to file remediation work for the venture team. Manual SD filing creates a queue-management burden and risks findings being silently dropped. This SD closes that loop, with explicit safeguards (DRAFT-only output, per-venture rate limit, composite-key dedup) so that automation-driven SD volume does not exceed LEAD review capacity. The work is bounded — chairman approval workflow, automated triage, and the FR-F′ aggregator all stay out of scope.`;

const technical_context = `Built on existing infrastructure: leo-create-sd helpers for SD insertion, scripts/modules/sd-key-generator.js for SD key minting, eva-orchestrator audit pattern for audit_log writes, the repo's existing cron-style scheduling pattern, and Supabase via the standard scripts/lib/supabase-connection.js client. No new external dependencies. Schema delta limited to one migration (CHECK constraint + three timestamp columns + forward-only trigger on venture_quality_findings). Generator is failure-isolated from analyzer writes via cron polling (NOT a DB trigger) plus pg_advisory_lock at the cron-entrypoint boundary. Test framework is vitest; integration tests gate on the HAS_REAL_DB sentinel per the convention set by the just-merged SD-LEO-INFRA-COVERAGE-CI-TRIAGE-001.`;

const implementation_approach = `Phase 1: Land the schema migration (FR-4) — additive only, default existing rows to status='pending'. Phase 2: Implement the generator module (FR-1) with vitest unit suite using vi.mock for supabase. Phase 3: Implement dedup (FR-3) and rate limit (FR-5) inside the generator with unit tests. Phase 4: Wire the cron driver (FR-2) and add the advisory-lock integration test (TS-6). Phase 5: Run the staging smoke per the SD's smoke_test_steps once FR-B′ has shipped findings rows to consume. Each phase ships as a small commit; total estimated source LOC is in the 200-400 range plus tests, with the schema migration scoped as its own commit for rollback hygiene.`;

const metadata = {
  sd_uuid_id: SD_UUID,
  sd_key: SD_ID,
  generated_by: "inline_llm_mode",
  generated_at: new Date().toISOString(),
  precedent_prd: "PRD-SD-LEO-INFRA-COVERAGE-CI-TRIAGE-001",
  blocked_by_sd_key: "SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-B-001",
  cadence_deadline: "2026-05-04T23:30:00Z",
  fr_to_objective_trace: {
    "FR-1": ["close lifecycle-loop", "DRAFT-only output"],
    "FR-2": ["decouple generator failures from analyzer commits"],
    "FR-3": ["make deduplication observable"],
    "FR-4": ["risk-3 mitigation: status machine prevents silent loss"],
    "FR-5": ["risk-1 mitigation: bounded output via rate limit"]
  }
};

async function main() {
  // Set DISABLE_SSL_VERIFY=true at process scope before importing the connection module
  // (the import already happened at top, but the createDatabaseClient reads env at call time).
  if (!process.env.DISABLE_SSL_VERIFY) {
    process.env.DISABLE_SSL_VERIFY = 'true';
  }

  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    // Pre-flight: ensure no existing PRD row for this id or sd_id
    const existing = await client.query(
      `SELECT id, sd_id FROM product_requirements_v2 WHERE id = $1 OR sd_id = $2 OR sd_id = $3`,
      [PRD_ID, SD_ID, SD_UUID]
    );
    if (existing.rows.length > 0) {
      console.error(`[ERROR] PRD already exists for id=${PRD_ID} or sd_id=${SD_ID}:`);
      console.error(JSON.stringify(existing.rows, null, 2));
      process.exit(1);
    }

    // Insert the PRD row
    const insertResult = await client.query(
      `INSERT INTO product_requirements_v2 (
        id, sd_id, directive_id, title, status, phase, category, priority,
        document_type, created_by, executive_summary, business_context,
        technical_context, system_architecture, implementation_approach,
        functional_requirements, technical_requirements, acceptance_criteria,
        test_scenarios, risks, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12,
        $13, $14, $15,
        $16::jsonb, $17::jsonb, $18::jsonb,
        $19::jsonb, $20::jsonb, $21::jsonb
      ) RETURNING id, sd_id, status, phase, created_at`,
      [
        PRD_ID,                                // 1 id
        SD_UUID,                               // 2 sd_id (varchar id — FK to strategic_directives_v2.id; for newer SDs id is UUID-shaped, sd_key is human-readable)
        SD_ID,                                 // 3 directive_id (sd_key form per LEO convention; no FK)
        TITLE,                                 // 4 title
        'in_progress',                         // 5 status (LEAD-TO-PLAN already accepted)
        'plan',                                // 6 phase
        'infrastructure',                      // 7 category
        'medium',                              // 8 priority (mirrors SD priority)
        'prd',                                 // 9 document_type
        'PLAN',                                // 10 created_by
        executive_summary,                     // 11
        business_context,                      // 12
        technical_context,                     // 13
        system_architecture,                   // 14
        implementation_approach,               // 15
        JSON.stringify(functional_requirements), // 16
        JSON.stringify(technical_requirements),  // 17
        JSON.stringify(acceptance_criteria),     // 18
        JSON.stringify(test_scenarios),          // 19
        JSON.stringify(risks),                   // 20
        JSON.stringify(metadata)                 // 21
      ]
    );

    console.log('[OK] PRD inserted:');
    console.log(JSON.stringify(insertResult.rows[0], null, 2));

    // Verification SELECT
    const verify = await client.query(
      `SELECT id, sd_id, directive_id, title, status, phase, category, priority,
              document_type, created_by,
              jsonb_array_length(functional_requirements) AS fr_count,
              jsonb_array_length(acceptance_criteria) AS ac_count,
              jsonb_array_length(test_scenarios) AS ts_count,
              jsonb_array_length(risks) AS risks_count,
              jsonb_typeof(technical_requirements) AS tech_type,
              jsonb_typeof(metadata) AS metadata_type,
              length(executive_summary) AS exec_len,
              length(system_architecture) AS sysarch_len
       FROM product_requirements_v2 WHERE id = $1`,
      [PRD_ID]
    );
    console.log('[OK] Verification:');
    console.log(JSON.stringify(verify.rows[0], null, 2));
  } catch (err) {
    console.error('[ERROR] Insert failed:');
    console.error(`  message: ${err.message}`);
    if (err.code) console.error(`  code: ${err.code}`);
    if (err.constraint) console.error(`  constraint: ${err.constraint}`);
    if (err.column) console.error(`  column: ${err.column}`);
    if (err.detail) console.error(`  detail: ${err.detail}`);
    process.exit(2);
  } finally {
    await client.end();
  }
}

main();
