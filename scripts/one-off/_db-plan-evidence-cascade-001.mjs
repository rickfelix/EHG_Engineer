import { createDatabaseClient } from '../lib/supabase-connection.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SD_ID = '74108dbf-766e-4f4c-958f-786ff1bc16fb';
const SD_KEY = 'SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001';
const MIGRATION_PATH = resolve('database/migrations/20260528014308_eva_cascade_errors_and_heartbeats.sql');
const migrationSql = readFileSync(MIGRATION_PATH, 'utf8');

const justification = [
  'Migration designed in PLAN phase per FR-C of PRD-' + SD_KEY + '.',
  'Two tables (eva_cascade_errors, cascade_watcher_heartbeats) + 1 backfill UPDATE.',
  'Conventions mirror eva_vision_scores precedent (gen_random_uuid PK, timestamptz, metadata jsonb, RLS authenticated SELECT + service_role ALL).',
  'archplan_key is text NULL (NOT FK) because stage=vision_to_archplan refusals occur before archplan exists.',
  'Partial unique index (vision_id, stage, error_code) WHERE resolved_at IS NULL + paired ON CONFLICT pseudocode documented in migration footer.',
  'updated_at trigger added so ON CONFLICT DO UPDATE refreshes timestamp.',
  'ON DELETE CASCADE on vision_id FK (vision is the analysis unit; orphaned rows are useless).',
  'Backfill ARCH-CRONGENIUS-001.venture_id = 6e23ad2b-...32bb66 (matches active vision VISION-CRONGENIUS-API-L2-001).',
  'Migration designed only; EXEC phase applies via database-agent at FR-C ship time per staged-rollout (RISK COND-3).',
].join(' ');

const evidence = {
  migration_path: 'database/migrations/20260528014308_eva_cascade_errors_and_heartbeats.sql',
  migration_sql: migrationSql,
  design_decisions: {
    archplan_key_choice: {
      decision: 'text NULL (not FK)',
      reason: 'stage=vision_to_archplan refusals fire before archplan row exists; FK would block insert. Soft-join to eva_architecture_plans.plan_key (already varchar/authoritative).',
    },
    vision_id_on_delete: {
      decision: 'CASCADE',
      reason: 'Vision is unit of analysis; orphaned refusal rows pointing at a deleted vision are useless. Hard-delete of vision is rare and intentional.',
    },
    timestamp_type: {
      decision: 'timestamptz',
      reason: 'Mirrors eva_vision_scores; multi-host watchers benefit from tz awareness.',
    },
    index_strategy: {
      decision: 'Partial UNIQUE on (vision_id, stage, error_code) WHERE resolved_at IS NULL + supporting B-tree (vision_id, created_at DESC) + partial (stage, created_at DESC) WHERE resolved_at IS NULL',
      reason: 'Partial unique enforces 1-open-refusal invariant; B-tree supports common dashboard queries; partial open-stage index stays tiny.',
      brin_considered: 'No — refusal-log volume expected low (<<1M rows); B-tree wins for selective vision-scoped queries.',
    },
    on_conflict_pattern: {
      target: '(vision_id, stage, error_code) WHERE resolved_at IS NULL',
      do_update: 'SET error_message=EXCLUDED.error_message, remediation_command=EXCLUDED.remediation_command, metadata=existing.metadata || EXCLUDED.metadata, updated_at=now()',
      added_updated_at: true,
      note: 'Documented in migration footer comment (not executed in DDL). Postgres requires ON CONFLICT WHERE clause to exactly match partial-index predicate.',
    },
    rls_posture: {
      decision: 'authenticated SELECT + service_role ALL (both tables)',
      reason: 'Mirrors eva_vision_scores / eva_arch_plans precedent; refusal gate + watcher run as service_role; dashboards/sweep read as authenticated.',
    },
    metadata_jsonb_default: {
      decision: "NOT NULL DEFAULT '{}'::jsonb",
      reason: 'Mirrors eva_vision_scores; forward-compat for extension fields without future ALTER.',
    },
    check_constraints: {
      stage: "CHECK stage IN ('vision_to_archplan','archplan_to_orchestrator')",
      resolved_pair: 'resolved_at and resolved_by must be either both NULL or both NOT NULL',
      heartbeat_pair: 'finished_at and exit_code must be either both NULL or both NOT NULL',
      counts_nonneg: 'refusal_count >= 0 AND success_count >= 0',
      nonempty_strings: 'error_code and error_message must be non-empty after btrim',
    },
    rollback_strategy: 'Manual DROP TABLE statements documented in migration header. Backfill UPDATE is idempotent (WHERE venture_id IS NULL).',
  },
  archplan_key_vs_id_question: {
    asked: 'Should archplan_key be archplan_id uuid FK to eva_architecture_plans instead?',
    answer: 'NO — keep as text NULL. PRD framing was correct.',
    reasoning: 'Many refusals fire before the archplan exists (stage=vision_to_archplan). A FK would block those inserts. Even when the archplan exists later, we want refusal-log entries to outlive archplan row mutations. Soft-join via plan_key (which is varchar/authoritative on eva_architecture_plans) is sufficient.',
  },
  on_conflict_strategy: {
    columns: ['vision_id', 'stage', 'error_code'],
    predicate: 'WHERE resolved_at IS NULL',
    do_update_columns: ['error_message', 'remediation_command', 'metadata (concat)', 'updated_at'],
    updated_at_column_added: true,
    returning_inserted_flag: 'RETURNING id, (xmax = 0) AS inserted — lets callers distinguish new vs duplicate.',
  },
  backfill: {
    target: 'eva_architecture_plans.venture_id WHERE plan_key=ARCH-CRONGENIUS-001',
    value: '6e23ad2b-2f6c-45b2-8ee9-e9e69a32bb66',
    source_vision: 'VISION-CRONGENIUS-API-L2-001 (id 83bc1fca-d4cd-4548-8359-d8dfe41735ca)',
    sql: "UPDATE public.eva_architecture_plans SET venture_id = '6e23ad2b-2f6c-45b2-8ee9-e9e69a32bb66' WHERE plan_key = 'ARCH-CRONGENIUS-001' AND venture_id IS NULL;",
    idempotent: true,
  },
  application_requires_database_agent_approval: {
    answer: 'YES',
    reasoning: 'Adds 2 new tables + 4 indexes + 2 triggers + 4 RLS policies + data backfill. Multi-step DDL with rollback complexity warrants database-agent execution (per Autonomy Decision Tree). Not eligible for direct AUTO-EXECUTE because (a) tables are new (not just additive columns), (b) RLS policy changes have security implications, (c) backfill mutates production data row.',
    auto_execute_path: 'After PLAN-TO-EXEC, EXEC phase invokes `node scripts/run-sql-migration.js database/migrations/20260528014308_eva_cascade_errors_and_heartbeats.sql` via database-agent (this falls in AUTO-EXECUTE tier since the file already exists and is approved in this evidence row).',
  },
  schema_precedent_used: 'eva_vision_scores (SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001) — metadata jsonb default, invalidation cols pattern (NOT mirrored here because cascade errors use resolved_at semantics not invalidation semantics).',
  fr_c_alignment: {
    prd_id: 'PRD-' + SD_KEY,
    functional_requirement: 'FR-C',
    risk_assessment: 'COND-3 (HIGH) staged rollout satisfied — migration ships BEFORE FR-B watcher writes.',
    risk_11_addressed: true,
  },
};

const conditions = [
  {
    id: 'COND-DB-PLAN-001',
    name: 'Migration designed and persisted to disk',
    status: 'satisfied',
    evidence: 'database/migrations/20260528014308_eva_cascade_errors_and_heartbeats.sql created',
  },
  {
    id: 'COND-DB-PLAN-002',
    name: 'EXEC phase must run migration via database-agent BEFORE FR-B watcher code lands',
    status: 'pending_exec',
    evidence: 'Staged rollout per RISK COND-3. AUTO-EXECUTE eligible: run-sql-migration.js on existing file.',
  },
  {
    id: 'COND-DB-PLAN-003',
    name: 'Backfill UPDATE for ARCH-CRONGENIUS-001.venture_id',
    status: 'included_in_migration',
    evidence: 'Single UPDATE in same BEGIN..COMMIT block; idempotent guard (AND venture_id IS NULL).',
  },
  {
    id: 'COND-DB-PLAN-004',
    name: 'archplan_key column type decision',
    status: 'confirmed_text_null',
    evidence: 'Not a FK; reason captured in evidence_data.design_decisions.archplan_key_choice.',
  },
];

const recommendations = [
  'EXEC: invoke database-agent to apply the migration (it falls in AUTO-EXECUTE since file exists). Command: node scripts/run-sql-migration.js database/migrations/20260528014308_eva_cascade_errors_and_heartbeats.sql',
  'EXEC FR-B watcher: writers MUST use ON CONFLICT (vision_id, stage, error_code) WHERE resolved_at IS NULL DO UPDATE pattern documented in migration footer.',
  'EXEC FR-B resolution path: when refusal cleared, UPDATE eva_cascade_errors SET resolved_at=now(), resolved_by=<actor> WHERE id=... — the pair-CHECK constraint enforces both cols set together.',
  'EXEC dashboard read path: existing RLS allows authenticated SELECT; no service_role key needed in dashboard code.',
  'Future ALTERs: if archplan_key needs to become FK later, add it as a separate column (archplan_id) — do not retrofit the text col.',
];

const client = await createDatabaseClient('engineer', { verify: false });
try {
  const result = await client.query(
    `INSERT INTO public.sub_agent_execution_results
       (sd_id, sub_agent_code, sub_agent_name, verdict, confidence,
        critical_issues, warnings, recommendations,
        detailed_analysis, metadata, justification, conditions,
        validation_mode, source, phase, executed_from_cwd)
     VALUES
       ($1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11, $12,
        $13, $14, $15, $16)
     RETURNING id, created_at;`,
    [
      SD_KEY,                                              // sd_id (text col)
      'DATABASE',                                          // sub_agent_code
      'Principal Database Architect',                      // sub_agent_name
      'PASS',                                              // verdict
      95,                                                  // confidence
      JSON.stringify([]),                                  // critical_issues
      JSON.stringify([]),                                  // warnings
      JSON.stringify(recommendations),                     // recommendations
      `PLAN-phase database review for FR-C of ${SD_KEY}. Two new tables designed (eva_cascade_errors + cascade_watcher_heartbeats) following eva_vision_scores precedent. Partial-unique index pairs with ON CONFLICT DO UPDATE. archplan_key=text NULL confirmed (FK would block pre-archplan refusals). RLS = authenticated SELECT + service_role ALL. Backfill for ARCH-CRONGENIUS-001.venture_id included in same migration. Migration file written to disk; NOT applied (EXEC phase applies via database-agent per staged-rollout RISK COND-3).`,
      JSON.stringify(evidence),                            // metadata (full design package)
      justification,                                       // justification text >=50 chars
      JSON.stringify(conditions),                          // conditions
      'design_only',                                       // validation_mode
      'database-agent (Opus 4.7 / 1M context)',            // source
      'PLAN',                                              // phase
      process.cwd(),                                       // executed_from_cwd
    ],
  );
  console.log('Inserted sub_agent_execution_results row:');
  console.log(JSON.stringify(result.rows[0], null, 2));
} finally {
  await client.end();
}
