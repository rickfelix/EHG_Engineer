// One-off: update PRD with database-agent corrections.
// Adds FR-0 (Phase 0 migrations), fixes FR-2 (dedicated sd_refs column), FR-5 (decision_log columns),
// FR-3 (partial index predicates), FR-6 (COALESCE handling), TR-2 (acknowledge migrations).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C';

const { data: prd } = await supabase.from('product_requirements_v2').select('*').eq('id', PRD_ID).single();
if (!prd) { console.error('PRD not found'); process.exit(1); }

// NEW FR-0: ship migrations first
const fr0 = {
  id: 'FR-0',
  requirement: 'Phase 0: Two additive non-breaking migrations land before any code work (per DATABASE deep review evidence row 64396c27).',
  description: 'Migration 1: ALTER TABLE eva_todoist_intake ADD COLUMN sd_refs jsonb NOT NULL DEFAULT \'[]\'::jsonb (dedicated column — target_aspects is a JSONB array of strings, NOT an object, so jsonb_set on a named key would fail). Migration 2: ALTER TABLE eva_support_decision_log ADD COLUMN decision_kind text NOT NULL CHECK (decision_kind IN (\'sd_recommendation\',\'reader_disabled\',\'reader_error\',\'render_crashed\',\'skipped_duplicate\')) and ADD COLUMN metadata jsonb NOT NULL DEFAULT \'{}\'::jsonb. Both migrations are forward-compatible: eva_todoist_intake has 304 rows; eva_support_decision_log has 0 rows. DATABASE sub-agent (a0e846be) reviewed schema and DATABASE deep review (64396c27) authored the recommendations.',
  priority: 'CRITICAL',
  acceptance_criteria: [
    'Migration files exist under database/migrations/YYYYMMDD_eva-support-sd-refs-column.sql and YYYYMMDD_eva-support-decision-log-decision-kind-metadata.sql, applied via database-agent.',
    'Post-migration query confirms eva_todoist_intake has column sd_refs (jsonb, NOT NULL, default []).',
    'Post-migration query confirms eva_support_decision_log has columns decision_kind (text NOT NULL with 5-value CHECK) and metadata (jsonb NOT NULL, default {}).',
    'All existing eva_todoist_intake rows (304) have sd_refs = []::jsonb after migration (DEFAULT applied).',
    'Both migrations use IF NOT EXISTS guards per CLAUDE_CORE.md "Migration Safety — IF EXISTS".',
    'Migrations are rollback-safe: dropping the columns is non-breaking because no code depends on them prior to FR-2 and FR-5 EXEC work.',
  ],
};

// Replace FR-2 (cross-ref) with dedicated-column approach
const fr2 = {
  id: 'FR-2',
  requirement: 'Cross-reference SD↔Todoist via dedicated eva_todoist_intake.sd_refs column (NEW from Phase 0 migration; NOT target_aspects.sd_refs[]).',
  description: 'eva_todoist_intake.sd_refs is a jsonb array (added in FR-0 Migration 1). Each entry: { sd_id, source, confidence, evidence_substring, status }. Writes use UPDATE eva_todoist_intake SET sd_refs = sd_refs || jsonb_build_object(...)::jsonb where evidence_substring length is enforced server-side via CHECK constraint or application-level validation. PostgreSQL row-level lock during UPDATE serializes concurrent writers. Never auto-collapse multi-ref to a primary.',
  priority: 'HIGH',
  acceptance_criteria: [
    'Insert pattern uses jsonb concatenation (sd_refs = sd_refs || new_entry::jsonb) — never full-row replace.',
    'Each sd_refs entry includes evidence_substring (≥5 chars) and confidence (0-100); rows without evidence_substring fail validation.',
    'E2E test asserts that an intake row with 2+ sd_refs renders ALL of them in EVA reply — no auto-promote-to-primary.',
    'Schema check: eva_todoist_intake.sd_refs column exists with type jsonb NOT NULL DEFAULT \'[]\' (FR-0 migration applied).',
    'Concurrent-write safety: two parallel EVA invocations adding sd_refs entries to the same intake row both succeed without either being clobbered (manual test or vitest with promise.all + 2 writes).',
    'Defensive null-handling: UPDATE uses jsonb_set(COALESCE(sd_refs, \'[]\'::jsonb), ...) in case future migration ever makes the column nullable.',
  ],
};

// Update FR-3 to use the partial index predicates exactly
const fr3 = {
  id: 'FR-3',
  requirement: 'SD blocker surface (lib/eva-support/sd-blocker-surface.js) — uses idx_sd_phase_handoffs_unresolved covering index via exact-predicate query.',
  description: 'Joins strategic_directives_v2 (via active-sd-predicate) to sd_phase_handoffs. The JOIN predicate uses the partial-index columns verbatim: handoff_type, status, resolved_at IS NULL, status IN (\'rejected\',\'failed\',\'blocked\') — the predicate set that idx_sd_phase_handoffs_unresolved indexes (per DATABASE deep review 64396c27). Emits a string per SD: "{sd_key}: {blocker_reason} (depends on {parent_sd_key})". Module size <150 LOC.',
  priority: 'HIGH',
  acceptance_criteria: [
    'Query plan inspection (EXPLAIN ANALYZE) confirms the join uses idx_sd_phase_handoffs_unresolved (partial index) — NOT a sequential scan or non-partial btree.',
    'Predicates exact match: WHERE resolved_at IS NULL AND status IN (\'rejected\', \'failed\', \'blocked\') (verbatim from the partial-index definition).',
    'Unit test seeds 3 SDs (1 blocked via rejected handoff, 1 blocked via incomplete dep, 1 unblocked) and asserts exactly 2 blocker strings returned.',
    'Module uses lib/sd/active-sd-predicate.js for the active-SD filter (not inlined).',
    'No SELECT *; explicit column list per FR-1 pattern.',
  ],
};

// Replace FR-5 to point to new decision_log columns
const fr5 = {
  id: 'FR-5',
  requirement: 'SD recommendation emitter (lib/eva-support/sd-recommendation-emitter.js) — writes to eva_support_decision_log with decision_kind + metadata columns (added in FR-0 Migration 2).',
  description: 'Outputs a copy-pasteable /leo create command preview + confidence score (0-100) + counterfactual reason NOT to create + top-3 dup-candidate sd_keys. Counterfactual semantics: if an existing SD covers ≥80% of the intent (via dup-candidate query), surface the existing sd_key and skip command emission. Writes decision-log row with decision_kind in {sd_recommendation, reader_disabled, reader_error, render_crashed, skipped_duplicate} and metadata jsonb capturing outcome-specific fields (override_reason, dup_sd_key, error_message, eva_invocation_id, recommended_sd_key). Wrapped in try/finally so a render crash still leaves the audit trail.',
  priority: 'CRITICAL',
  acceptance_criteria: [
    'Emitter NEVER calls child_process, execa, spawn, or exec (verified by T1).',
    'Decision-log row is written BEFORE render output via try/finally — verified by T6 call-order spy.',
    'Decision-log row uses the new columns: decision_kind = \'sd_recommendation\' (or one of the 5 enum values) and metadata jsonb captures outcome-specific fields.',
    'If approve, chairman must provide override_reason ≥12 chars in a follow-up prompt; decision-log captures override_reason verbatim inside metadata.override_reason.',
    'If counterfactual applies (existing SD covers ≥80% intent), emitter outputs the existing sd_key + decision-log entry with decision_kind=\'sd_recommendation\', metadata.outcome=\'skipped_duplicate\', metadata.dup_sd_key set.',
    'Render crash leaves audit row: outer try writes log first; render runs inside its own try whose catch updates metadata.outcome=\'render_crashed\' + metadata.error_message before rethrow.',
    'Decline action is rendered with equal-or-greater prominence as Approve (UI inspection in code review).',
  ],
};

// Update FR-6 to specify COALESCE handling for nullable is_active
const fr6 = {
  id: 'FR-6',
  requirement: 'Shared lib/sd/active-sd-predicate.js (uses COALESCE for nullable is_active) + parity retrofit into lib/governance/resolve-feedback.js.',
  description: 'Single source of truth for the "active SD" definition: status IN (draft, in_progress, active) AND COALESCE(is_active, true) = true AND archived_at IS NULL. NOTE: is_active is a NULLABLE boolean DEFAULT true (confirmed by DATABASE deep review 64396c27) — bare `is_active = true` would exclude historical NULL rows. The COALESCE wrapper preserves parity with historical data. Retrofit into resolve-feedback.js (lower blast than generate-retrospective.js per testing-agent recommendation). Parity test asserts identical row sets from both call sites.',
  priority: 'CRITICAL',
  acceptance_criteria: [
    'Predicate exports two helpers: getActiveSDFilter(supabaseQuery) → query builder, and isActiveSD(sdRow) → boolean. Both use COALESCE(is_active, true) = true (or equivalent JS-side: row.is_active === null || row.is_active === true).',
    'resolve-feedback.js imports getActiveSDFilter and replaces its inline filter (diff includes BOTH the old delete and the new import).',
    'Parity test seeds 10 SDs across all (status, is_active null/true/false, archived_at null/set) combinations; both consumers MUST return identical {sd_key} sets, including the NULL-is_active edge case.',
    'PR template/CODEOWNERS gating: any change to active-sd-predicate.js requires re-running parity test (CI-blocked).',
    'Unit test explicitly seeds at least 1 row with is_active=NULL and asserts it IS included in the active set.',
  ],
};

// Update TR-2 to acknowledge migrations
const tr2 = {
  id: 'TR-2',
  requirement: 'Two additive non-breaking database migrations: (a) eva_todoist_intake.sd_refs column; (b) eva_support_decision_log.decision_kind + metadata columns. Both ship in FR-0 Phase 0 before any code.',
  rationale: 'DATABASE deep review (evidence row 64396c27) flagged target_aspects shape mismatch (array of strings, not object — jsonb_set with named-key path would fail) and missing decision_kind/metadata columns. Both migrations are additive (ADD COLUMN with DEFAULT) and rollback-safe. The original PRD assumption "no new migrations" was incorrect; corrected without scope creep — these were always implied by FR-2 and FR-5. Per CLAUDE_CORE.md "Migration Safety — IF EXISTS" — both migrations use defensive guards.',
};

const oldFRs = prd.functional_requirements || [];
const replacedFRs = oldFRs.map(fr => {
  if (fr.id === 'FR-2') return fr2;
  if (fr.id === 'FR-3') return fr3;
  if (fr.id === 'FR-5') return fr5;
  if (fr.id === 'FR-6') return fr6;
  return fr;
});
const newFRs = [fr0, ...replacedFRs];

const oldTRs = prd.technical_requirements || [];
const newTRs = oldTRs.map(tr => tr.id === 'TR-2' ? tr2 : tr);

// Add migration test scenarios
const oldTSs = prd.test_scenarios || [];
const tsMig1 = {
  id: 'TS-M1',
  scenario: 'Migration 1 — eva_todoist_intake.sd_refs column added without breaking existing rows',
  test_type: 'integration',
  given: '304 existing rows in eva_todoist_intake; column sd_refs does not yet exist.',
  when: 'Run migration database/migrations/YYYYMMDD_eva-support-sd-refs-column.sql via database-agent.',
  then: 'Migration completes; SELECT COUNT(*) FROM eva_todoist_intake WHERE sd_refs IS NULL → 0; SELECT pg_typeof(sd_refs) → jsonb. All 304 rows have sd_refs = []::jsonb (DEFAULT applied). No row count change.',
};
const tsMig2 = {
  id: 'TS-M2',
  scenario: 'Migration 2 — eva_support_decision_log decision_kind + metadata columns added; CHECK constraint enforces enum',
  test_type: 'integration',
  given: 'eva_support_decision_log has 0 rows; columns decision_kind and metadata do not yet exist.',
  when: 'Run migration via database-agent; then INSERT a row with decision_kind=\'invalid_kind\'.',
  then: 'Migration completes; decision_kind column type=text NOT NULL; metadata column type=jsonb NOT NULL DEFAULT {}; the INSERT with invalid kind FAILS with CHECK constraint violation; INSERT with decision_kind=\'sd_recommendation\' SUCCEEDS.',
};
const tsPredicate = {
  id: 'TS-12',
  scenario: 'Active-SD predicate includes is_active=NULL rows (COALESCE handling)',
  test_type: 'unit',
  given: 'Seed strategic_directives_v2 with 3 rows: (A) is_active=true status=draft, (B) is_active=NULL status=draft, (C) is_active=false status=draft.',
  when: 'Call getActiveSDFilter(...) via both sd-reader.js and resolve-feedback.js.',
  then: 'Both consumers return {A, B} — the NULL-is_active row IS included (COALESCE defaults to true). Row C is excluded. Identical row sets across both call sites.',
};
const newTSs = [tsMig1, tsMig2, ...oldTSs, tsPredicate];

// Update acceptance_criteria to include migrations
const oldACs = prd.acceptance_criteria || [];
const newACs = [
  'Migration 1 (eva_todoist_intake.sd_refs column) applied and verified before any FR-2 code lands.',
  'Migration 2 (eva_support_decision_log decision_kind + metadata columns) applied and verified before any FR-5 code lands.',
  ...oldACs,
];

// Update implementation_approach with Phase 0
const oldImpl = prd.implementation_approach || {};
const newPhases = [
  {
    phase: 'Phase 0: Migrations (NEW — added per DATABASE deep review)',
    description: 'Ship two additive non-breaking migrations FIRST: (1) ALTER TABLE eva_todoist_intake ADD COLUMN sd_refs jsonb NOT NULL DEFAULT \'[]\'::jsonb; (2) ALTER TABLE eva_support_decision_log ADD COLUMN decision_kind text NOT NULL CHECK (decision_kind IN (...5 values...)) + ADD COLUMN metadata jsonb NOT NULL DEFAULT \'{}\'::jsonb. Apply via database-agent. ≤30 LOC SQL total.',
    deliverables: [
      'database/migrations/YYYYMMDD_eva-support-sd-refs-column.sql',
      'database/migrations/YYYYMMDD_eva-support-decision-log-decision-kind-metadata.sql',
      'Migration test rows: TS-M1, TS-M2 pass.',
      'Post-apply verification: sd_refs column exists with default []; decision_kind + metadata columns exist with CHECK constraint and default {}.',
    ],
  },
  ...(oldImpl.phases || []),
];

// Update integration_operationalization data_contracts to reflect new column shapes
const oldIO = prd.integration_operationalization || {};
const newContracts = (oldIO.data_contracts || []).map(c => {
  if (c.contract_name?.includes('sd_refs[] entry shape')) {
    return {
      contract_name: 'sd_refs entry shape (eva_todoist_intake.sd_refs — NEW DEDICATED COLUMN per Phase 0 Migration 1)',
      schema: '{ sd_id: string (UUID), source: "eva_cross_ref" | "chairman_manual", confidence: number 0-100, evidence_substring: string min 5 chars, status?: "active" | "rejected" }',
      validation: 'Pre-write validation in sd-cross-ref-store: required fields present, evidence_substring ≥5 chars, confidence in [0, 100]. Column is jsonb NOT NULL DEFAULT [] (added in Phase 0 Migration 1).',
      versioning: 'No schema_version field needed — array-of-objects is forward-compatible; existing entries without status default to "active".',
    };
  }
  if (c.contract_name?.includes('decision_log row (kind=sd_recommendation)')) {
    return {
      contract_name: 'eva_support_decision_log row (decision_kind=\'sd_recommendation\') — uses NEW columns from Phase 0 Migration 2',
      schema: '{ decision_kind: \'sd_recommendation\', metadata: { eva_invocation_id: UUID, intent_text: string, recommended_sd_key: string OR existing_sd_key, confidence: number 0-100, counterfactual: string, outcome: "approved" | "declined" | "skipped_duplicate" | "render_crashed", override_reason?: string ≥12 chars, error_message?: string } }',
      validation: 'Server-side: decision_kind CHECK constraint enforces enum; if metadata.outcome=approved, metadata.override_reason MUST be present and ≥12 chars (application-level).',
      versioning: 'decision_kind enum is forward-extensible via CHECK constraint update; new kinds can be added without breaking readers. metadata jsonb is schemaless and forward-compatible.',
    };
  }
  if (c.contract_name?.includes('reader_disabled')) {
    return {
      contract_name: 'eva_support_decision_log row (decision_kind=\'reader_disabled\') — uses NEW columns from Phase 0 Migration 2',
      schema: '{ decision_kind: \'reader_disabled\', metadata: { eva_invocation_id: UUID, flag_value: "false" | "unset", invoked_at: ISO timestamp } }',
      validation: 'One row per EVA invocation when flag is off.',
      versioning: 'Stable; covers fail-safe disabled state and explicit-disable.',
    };
  }
  return c;
});
const newIO = { ...oldIO, data_contracts: newContracts };

// Update metadata to record migration finding
const newMetadata = {
  ...(prd.metadata || {}),
  sub_agent_evidence: {
    ...((prd.metadata && prd.metadata.sub_agent_evidence) || {}),
    database_deep: { row_id: '64396c27-ed9c-43f3-a040-517a9e4d7cc8', verdict: 'CONDITIONAL_PASS', confidence: 88, note: '2 SEV-HIGH migrations + 1 SEV-MEDIUM (COALESCE)' },
    stories: { row_id: '68ad8d94-3482-469d-8c3a-3eebe20fc701', verdict: 'PASS', confidence: 95, note: '10 stories, 100% impl_context coverage' },
  },
  prd_corrections_log: [
    {
      at: new Date().toISOString(),
      source: 'database-agent deep review (64396c27)',
      corrections: [
        'FR-0 added: 2 additive non-breaking migrations ship in Phase 0 before any code.',
        'FR-2 corrected: uses dedicated sd_refs column (NOT target_aspects.sd_refs[]); target_aspects is JSONB array, not object — jsonb_set with named key would fail.',
        'FR-3 corrected: query predicates match idx_sd_phase_handoffs_unresolved partial index exactly to hit covering index.',
        'FR-5 corrected: uses new decision_log columns (decision_kind text NOT NULL CHECK, metadata jsonb NOT NULL DEFAULT {}); replaces non-existent kind column.',
        'FR-6 corrected: predicate uses COALESCE(is_active, true)=true (is_active is nullable; bare equality would exclude historical NULL rows).',
        'TR-2 rewritten: explicitly acknowledges 2 migrations (was incorrectly "no new migrations").',
        'Test scenarios: TS-M1 + TS-M2 added for migrations; TS-12 added for NULL-is_active edge case.',
        'Implementation phases: Phase 0 added; downstream phases shift by 1.',
      ],
    },
  ],
};

const { error } = await supabase
  .from('product_requirements_v2')
  .update({
    functional_requirements: newFRs,
    technical_requirements: newTRs,
    test_scenarios: newTSs,
    acceptance_criteria: newACs,
    implementation_approach: { ...oldImpl, phases: newPhases },
    integration_operationalization: newIO,
    metadata: newMetadata,
    updated_at: new Date().toISOString(),
  })
  .eq('id', PRD_ID);

if (error) { console.error('UPDATE FAILED:', error.message); process.exit(1); }

const { data: verify } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, test_scenarios, acceptance_criteria')
  .eq('id', PRD_ID).single();

console.log('=== PRD UPDATED WITH DATABASE-AGENT CORRECTIONS ===');
console.log('functional_requirements:', verify.functional_requirements.length);
console.log('test_scenarios:', verify.test_scenarios.length);
console.log('acceptance_criteria:', verify.acceptance_criteria.length);
console.log('FR-0 (NEW migrations phase):', verify.functional_requirements[0].id);
console.log('FR-2 corrected:', verify.functional_requirements.find(f => f.id === 'FR-2').description.slice(0, 100));
