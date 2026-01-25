#!/usr/bin/env node

/**
 * Create Hardening V1 Strategic Directives
 *
 * Creates parent SD (SD-HARDENING-V1-000) and 6 child SDs based on
 * the Three-Way AI Assessment (Claude Opus 4.5 + OpenAI GPT-4 + Google Gemini).
 *
 * Phase 1: Security (001, 002) - CRITICAL
 * Phase 2: Correctness (003, 004) - HIGH
 * Phase 3: Stability (005, 006) - MEDIUM
 *
 * Analysis Sources:
 * - Claude Opus 4.5: Initial assessment (confirmed by Gemini)
 * - OpenAI GPT-4: EHG_Engineer repo deep dive (RLS, migrations)
 * - Google Gemini: ehg repo verification (N+1, type safety)
 *
 * Key Discovery: Two-Repo Architecture
 * - EHG_Engineer: Infrastructure, migrations, tooling
 * - ehg: Next.js app, APIs, services
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';

const SDS = [
  // ═══════════════════════════════════════════════════════════════════════════
  // PARENT SD
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'SD-HARDENING-V1-000',
    sd_key: 'SD-HARDENING-V1-000',
    title: 'Hardening V1: Post-Assessment Security & Stability',
    description: `Security and stability hardening based on three-way AI assessment.

THREE-WAY ANALYSIS SOURCES:
- Claude Opus 4.5: Initial codebase review
- OpenAI GPT-4: EHG_Engineer repo deep analysis
- Google Gemini: ehg repo verification

KEY DISCOVERY: Two-Repo Architecture
- .: Infrastructure, migrations, tooling, LEO Protocol
- ../ehg (c:\\_EHG\\ehg): Next.js app, APIs, chairman services

CRITICAL FINDINGS (All 3 AIs Agree):
1. RLS policies use USING(true) - anyone can read/modify critical tables
2. Decision table split-brain (UI writes venture_decisions, state machine reads chairman_decisions)
3. Function naming mismatch (fn_advance_venture_stage vs advance_venture_stage)
4. N+1 query pattern in decisions API (CONFIRMED by Gemini)
5. Unsafe 'as any' casts in evidence service (CONFIRMED by Gemini)

CORRECTION: Stage 1-6 limitation is RESOLVED (Gemini verified stages 1-25 now mapped)

This parent SD orchestrates 3 phases of security and stability hardening.`,
    rationale: `Three independent AI analyses converged on critical security and stability issues.
OpenAI's deep dive into EHG_Engineer found dangerous RLS policies granting anon reads.
Gemini's verification of the ehg repo confirmed performance and type safety issues.
Claude's initial assessment was validated by both, with one correction (stage mapping).`,
    scope: `IN SCOPE:
- RLS policy hardening (both repos)
- Decision table unification (split-brain fix)
- Database function naming standardization
- N+1 query optimization in decisions API
- Type safety improvements in evidence service

OUT OF SCOPE:
- New features
- Blueprint generation
- EVA directive execution (covered by SD-FOUNDATION-V3-005)
- Stage crew mapping (already complete per Gemini)`,
    category: 'security',
    sd_type: 'infrastructure',
    priority: 'critical',
    status: 'draft',
    current_phase: 'IDEATION',
    target_application: 'EHG',  // Primary target; SD-002 and SD-004 target EHG_Engineer
    parent_sd_id: null,
    strategic_intent: 'Harden security posture and stabilize data integrity across both EHG repositories',
    strategic_objectives: JSON.stringify([
      'Eliminate permissive RLS policies (USING(true))',
      'Resolve decision table split-brain',
      'Standardize database function naming',
      'Optimize N+1 query patterns',
      'Improve type safety with Zod validation'
    ]),
    success_criteria: JSON.stringify([
      'No RLS policies use USING(true) on sensitive tables',
      'Decision write-path and read-path use same table or unified view',
      'All database functions use consistent fn_ prefix convention',
      'Chairman decisions API uses batch queries (no N+1)',
      'Evidence service has Zod validation (no as any casts)'
    ]),
    key_changes: JSON.stringify([
      'RLS policy restrictions on chairman_decisions, venture_artifacts, etc.',
      'chairman_unified_decisions view enforcement',
      'fn_advance_venture_stage function alignment',
      'Batch evidence fetching in decisions API',
      'Zod schemas for epistemic_evidence JSONB'
    ]),
    key_principles: JSON.stringify([
      'Security first - fix RLS before performance',
      'Correctness over speed - fix split-brain before optimization',
      'Type safety mandatory - no as any in production',
      'Two-repo awareness - changes may span EHG_Engineer and ehg',
      'Verification required - confirm fixes in both repos'
    ]),
    success_metrics: JSON.stringify([
      'Zero permissive RLS policies on chairman/decision tables',
      'Decision flow E2E test passes (write → read → advance)',
      'N+1 eliminated: max 3 queries per decisions API call',
      'TypeScript strict mode passes on evidence service'
    ]),
    risks: JSON.stringify([
      {
        risk: 'RLS changes break existing functionality',
        mitigation: 'Test in staging first, have rollback migration ready',
        severity: 'high'
      },
      {
        risk: 'Split-brain fix requires data migration',
        mitigation: 'Use unified view first, migrate data incrementally',
        severity: 'medium'
      },
      {
        risk: 'Function rename breaks existing callers',
        mitigation: 'Create alias function during transition',
        severity: 'medium'
      }
    ]),
    created_by: 'LEAD',
    version: '1.0',
    metadata: JSON.stringify({
      analysis_sources: ['Claude Opus 4.5', 'OpenAI GPT-4', 'Google Gemini'],
      analysis_date: '2025-12-17',
      total_child_sds: 6,
      estimated_duration: '2-3 weeks (3 phases)',
      two_repo_architecture: {
        ehg_engineer: '.',
        ehg: '../ehg'
      },
      vision_document_references: [
        'docs/vision/specs/00_VISION_V2_CHAIRMAN_OS.md',
        'docs/vision/specs/01-database-schema.md',
        'docs/vision/specs/02-api-contracts.md',
        'docs/vision/specs/06-chairman-dashboard.md'
      ],
      assessment_files: [
        '/home/rickf/.claude/plans/sunny-dreaming-dolphin.md'
      ]
    })
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: SECURITY (Critical)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'SD-HARDENING-V1-001',
    sd_key: 'SD-HARDENING-V1-001',
    title: 'RLS Security Hardening (ehg repo)',
    description: `Harden Row Level Security policies in the ehg application database.

CRITICAL FINDING (OpenAI + Gemini):
The chairman_unified_decisions.sql migration applies USING(true) for authenticated users,
exposing sensitive executive decisions to ANY logged-in user.

SPECIFIC ISSUES:
1. chairman_decisions table: INSERT policy has WITH CHECK (true)
2. venture_artifacts: SELECT/MODIFY policies use USING(true)
3. venture_stage_work: All operations use USING(true)

REFERENCES:
- Migration: ehg/supabase/migrations/20251216000001_chairman_unified_decisions.sql
- Schema docs: docs/reference/schema/engineer/tables/chairman_decisions.md

FIX APPROACH:
- Replace USING(true) with fn_is_chairman() for chairman-only tables
- Use company/venture-scoped predicates for shared tables
- Add regression tests for RLS policies`,
    rationale: 'OpenAI found USING(true) policies; Gemini confirmed and escalated. This is a data exposure risk if non-chairman users exist.',
    scope: `IN SCOPE:
- chairman_decisions RLS hardening
- chairman_unified_decisions view access control
- venture_artifacts RLS scoping
- venture_stage_work RLS scoping
- RLS regression tests

OUT OF SCOPE:
- EHG_Engineer repo RLS (separate SD)
- New table creation
- Schema changes`,
    category: 'security',
    sd_type: 'infrastructure',
    priority: 'critical',
    status: 'draft',
    current_phase: 'IDEATION',
    target_application: 'EHG',
    parent_sd_id: 'SD-HARDENING-V1-000',
    strategic_intent: 'Ensure chairman-only data is accessible only to the chairman',
    strategic_objectives: JSON.stringify([
      'Replace USING(true) with proper predicates',
      'Enforce fn_is_chairman() on chairman tables',
      'Scope venture data to company access',
      'Add RLS regression tests'
    ]),
    success_criteria: JSON.stringify([
      'chairman_decisions INSERT restricted to chairman only',
      'chairman_unified_decisions SELECT restricted to chairman only',
      'venture_artifacts scoped to venture/company ownership',
      'venture_stage_work scoped to venture/company ownership',
      'RLS regression test suite passes'
    ]),
    key_changes: JSON.stringify([
      'New migration: 2025XXXX_rls_hardening_chairman.sql',
      'Update chairman_decisions policies',
      'Update venture_artifacts policies',
      'Update venture_stage_work policies',
      'RLS test suite creation'
    ]),
    key_principles: JSON.stringify([
      'Principle of least privilege',
      'Chairman-only means chairman-only',
      'Test RLS changes before deploy',
      'Rollback migration ready'
    ]),
    created_by: 'LEAD',
    version: '1.0',
    metadata: JSON.stringify({
      phase: 1,
      phase_name: 'Security',
      source: 'OpenAI GPT-4 + Google Gemini',
      target_repo: 'ehg',
      estimated_effort: '1 day',
      files_to_modify: [
        'ehg/supabase/migrations/2025XXXX_rls_hardening_chairman.sql (new)',
        'ehg/tests/rls/chairman-rls.test.ts (new)'
      ],
      references: [
        'ehg/supabase/migrations/20251216000001_chairman_unified_decisions.sql',
        'docs/reference/schema/engineer/tables/chairman_decisions.md'
      ]
    })
  },
  {
    id: 'SD-HARDENING-V1-002',
    sd_key: 'SD-HARDENING-V1-002',
    title: 'RLS Security Hardening (EHG_Engineer repo)',
    description: `Harden Row Level Security policies in the EHG_Engineer infrastructure database.

CRITICAL FINDING (OpenAI):
Multiple migrations contain dangerous RLS patterns:

1. ANON READS ON CORE TABLES (20251130_ehg_app_schema_migration.sql:330-354):
   CREATE POLICY "Anon read companies" ON companies FOR SELECT TO anon USING (true);
   CREATE POLICY "Anon read ventures" ON ventures FOR SELECT TO anon USING (true);
   CREATE POLICY "Anon read portfolios" ON portfolios FOR SELECT TO anon USING (true);

2. ANY AUTH USER = FULL ACCESS (same file):
   OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid())
   This clause makes company_id checks meaningless.

3. USING(true) ON LIFECYCLE TABLES (20251206_factory_architecture.sql:246-303):
   venture_artifacts_select: USING(true)
   venture_artifacts_modify: USING(true)
   venture_stage_work_select: USING(true)
   venture_stage_work_modify: USING(true)

4. BROKEN POLICY (20251206_factory_architecture.sql:39-46):
   WHERE auth.uid() = id  -- 'id' column doesn't exist in auth.users subquery

FIX APPROACH:
- Remove anon read policies (or scope to truly public data)
- Remove OR EXISTS clause from company access policies
- Replace USING(true) with company/venture predicates
- Fix broken policy reference`,
    rationale: 'OpenAI deep analysis found multiple critical RLS issues that could expose venture data to unauthorized users.',
    scope: `IN SCOPE:
- Remove/restrict anon read policies
- Fix "any auth user" clause
- Fix lifecycle table RLS
- Fix broken policy reference
- Regression tests

OUT OF SCOPE:
- ehg repo RLS (covered in SD-001)
- New features`,
    category: 'security',
    sd_type: 'infrastructure',
    priority: 'critical',
    status: 'draft',
    current_phase: 'IDEATION',
    target_application: 'EHG_Engineer',
    parent_sd_id: 'SD-HARDENING-V1-000',
    strategic_intent: 'Eliminate infrastructure-level RLS vulnerabilities',
    strategic_objectives: JSON.stringify([
      'Remove dangerous anon read policies',
      'Fix any-auth-user bypass clause',
      'Scope lifecycle tables to ownership',
      'Fix broken policy syntax'
    ]),
    success_criteria: JSON.stringify([
      'No anon policies on companies/ventures/portfolios (or properly scoped)',
      'Company access requires actual company membership',
      'venture_artifacts/venture_stage_work scoped to ownership',
      'All policies syntactically correct',
      'Migration applies without errors'
    ]),
    key_changes: JSON.stringify([
      'New migration: 2025XXXX_rls_hardening_infrastructure.sql',
      'ALTER POLICY commands for existing policies',
      'DROP POLICY for anon reads (if not needed)',
      'Regression test suite'
    ]),
    key_principles: JSON.stringify([
      'Remove before restrict',
      'Test in staging first',
      'Have rollback ready',
      'Document policy rationale'
    ]),
    created_by: 'LEAD',
    version: '1.0',
    metadata: JSON.stringify({
      phase: 1,
      phase_name: 'Security',
      source: 'OpenAI GPT-4',
      target_repo: 'EHG_Engineer',
      estimated_effort: '1-2 days',
      files_to_modify: [
        'database/migrations/2025XXXX_rls_hardening_infrastructure.sql (new)'
      ],
      references: [
        'database/migrations/20251130_ehg_app_schema_migration.sql',
        'database/migrations/20251206_factory_architecture.sql'
      ],
      specific_line_references: {
        anon_reads: '20251130_ehg_app_schema_migration.sql:330-354',
        auth_bypass: '20251130_ehg_app_schema_migration.sql:325-343',
        using_true: '20251206_factory_architecture.sql:246-303',
        broken_policy: '20251206_factory_architecture.sql:39-46'
      }
    })
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: CORRECTNESS (High)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'SD-HARDENING-V1-003',
    sd_key: 'SD-HARDENING-V1-003',
    title: 'Decision Table Split-Brain Resolution',
    description: `Fix the split-brain issue where UI writes to one table but state machine reads another.

CRITICAL FINDING (OpenAI):
From ehg/supabase/migrations/20251216000001_chairman_unified_decisions.sql:

"-- PROBLEM: Decision data split across multiple tables
-- UI (decide.ts) writes to venture_decisions
-- StageStateMachine.checkGate() queries chairman_decisions
-- These are DIFFERENT tables - no data flows between them
-- Result: gate approvals were never detected"

The migration created chairman_unified_decisions VIEW as a solution, but:
1. Not all code paths use the unified view
2. Write operations still go to venture_decisions
3. Read operations may query either table

FIX APPROACH:
1. Audit all decision write paths
2. Audit all decision read paths
3. Ensure consistent use of unified view OR single table
4. Add integration test for full decision flow`,
    rationale: 'OpenAI identified this as a root cause of gate approvals never being detected. The fix is not just RLS - it\'s data flow correctness.',
    scope: `IN SCOPE:
- Audit decide.ts write path
- Audit StageStateMachine.checkGate() read path
- Audit chairman_unified_decisions view usage
- Unify to single source of truth
- Add decision flow integration test

OUT OF SCOPE:
- RLS changes (covered in SD-001)
- New decision types`,
    category: 'correctness',
    sd_type: 'infrastructure',
    priority: 'high',
    status: 'draft',
    current_phase: 'IDEATION',
    target_application: 'EHG',
    parent_sd_id: 'SD-HARDENING-V1-000',
    strategic_intent: 'Ensure decision data flows correctly from UI through state machine',
    strategic_objectives: JSON.stringify([
      'Map all decision write paths',
      'Map all decision read paths',
      'Unify to single source of truth',
      'Verify with integration test'
    ]),
    success_criteria: JSON.stringify([
      'All write operations go to same table/view',
      'All read operations come from same table/view',
      'StageStateMachine.checkGate() sees UI decisions',
      'Integration test: write → read → advance passes',
      'No data orphaned in wrong table'
    ]),
    key_changes: JSON.stringify([
      'Audit and document current data flows',
      'Update decide.ts if needed',
      'Update StageStateMachine if needed',
      'Add integration test',
      'Optional: data migration script'
    ]),
    key_principles: JSON.stringify([
      'Single source of truth',
      'Write where you read',
      'Test the full flow',
      'Document the decision'
    ]),
    created_by: 'LEAD',
    version: '1.0',
    metadata: JSON.stringify({
      phase: 2,
      phase_name: 'Correctness',
      source: 'OpenAI GPT-4',
      target_repo: 'ehg',
      estimated_effort: '1 day',
      files_to_audit: [
        'ehg/src/pages/api/v2/chairman/decide.ts',
        'ehg/src/lib/StageStateMachine.ts (or similar)',
        'ehg/supabase/migrations/20251216000001_chairman_unified_decisions.sql'
      ],
      root_cause_quote: 'These are DIFFERENT tables - no data flows between them'
    })
  },
  {
    id: 'SD-HARDENING-V1-004',
    sd_key: 'SD-HARDENING-V1-004',
    title: 'Database Function Naming Standardization',
    description: `Fix function naming mismatch that causes runtime fallbacks.

FINDING (OpenAI):
Code expects: fn_advance_venture_stage(p_venture_id, p_from_stage, p_to_stage, p_handoff_data)
DB defines: advance_venture_stage(p_venture_id) -- different signature!

From lib/agents/venture-state-machine.js:205-230:
"const { data, error } = await this.supabase
  .rpc('fn_advance_venture_stage', { ... });
if (error.message.includes('does not exist')) {
  console.log('fn_advance_venture_stage not found, using direct update');
  return this._directStageAdvance(handoff, ceo_notes);
}"

This fallback bypasses the intended orchestration logic in the DB function.

FIX APPROACH:
1. Create fn_advance_venture_stage with correct signature
2. OR update code to call advance_venture_stage with correct args
3. Remove fallback once alignment is confirmed
4. Add test for function call`,
    rationale: 'OpenAI found that function naming drift causes the system to use a fallback path, bypassing intended orchestration logic.',
    scope: `IN SCOPE:
- Create or rename function to fn_advance_venture_stage
- Align function signature with code expectations
- Update venture-state-machine.js if needed
- Remove direct update fallback
- Add function call test

OUT OF SCOPE:
- Other function renames
- New stage logic`,
    category: 'correctness',
    sd_type: 'infrastructure',
    priority: 'high',
    status: 'draft',
    current_phase: 'IDEATION',
    target_application: 'EHG_Engineer',
    parent_sd_id: 'SD-HARDENING-V1-000',
    strategic_intent: 'Enable proper stage advancement through database function',
    strategic_objectives: JSON.stringify([
      'Align function name with code expectations',
      'Align function signature with code expectations',
      'Remove direct update fallback',
      'Verify with integration test'
    ]),
    success_criteria: JSON.stringify([
      'fn_advance_venture_stage exists with correct signature',
      'venture-state-machine.js calls succeed (no fallback)',
      'Stage transitions use DB function logic',
      'Integration test passes without fallback',
      'Console shows no "not found" warnings'
    ]),
    key_changes: JSON.stringify([
      'New or renamed function: fn_advance_venture_stage',
      'Function signature: (p_venture_id, p_from_stage, p_to_stage, p_handoff_data)',
      'venture-state-machine.js fallback removal',
      'Integration test addition'
    ]),
    key_principles: JSON.stringify([
      'Convention: fn_ prefix for RPC functions',
      'Align code to DB, or DB to code (not both)',
      'Remove fallbacks once primary works',
      'Test the happy path'
    ]),
    created_by: 'LEAD',
    version: '1.0',
    metadata: JSON.stringify({
      phase: 2,
      phase_name: 'Correctness',
      source: 'OpenAI GPT-4',
      target_repo: 'EHG_Engineer',
      estimated_effort: '4 hours',
      files_to_modify: [
        'database/migrations/2025XXXX_fn_advance_venture_stage.sql (new)',
        'lib/agents/venture-state-machine.js'
      ],
      code_reference: 'lib/agents/venture-state-machine.js:205-230',
      db_reference: 'database/migrations/20251206_factory_architecture.sql:461-511'
    })
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3: STABILITY (Medium)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'SD-HARDENING-V1-005',
    sd_key: 'SD-HARDENING-V1-005',
    title: 'Chairman Decisions API Performance (N+1 Fix)',
    description: `Fix N+1 query pattern in the decisions API that causes performance issues.

FINDING (Claude, CONFIRMED by Gemini):
From ehg/src/pages/api/v2/chairman/decisions.ts:93-135:

"const pendingDecisionsPromises = (decisions || []).map(async (d) => {
  // ...
  const evidence = await getDecisionEvidence(supabase, d.venture_id, d.stage);
  // ...
});
let pendingDecisions: PendingDecision[] = await Promise.all(pendingDecisionsPromises);"

For 10 pending decisions, this fires 50+ separate database queries (5 sub-queries per decision).

FIX APPROACH:
1. Batch fetch all evidence in one query using venture_id IN (...)
2. Join evidence in memory
3. Reduce from O(n*5) queries to O(5) queries
4. Add performance test

ALSO: Consider caching evidence per venture with 5-minute TTL.`,
    rationale: 'Claude identified this pattern; Gemini verified it exists in the actual codebase. This will cause performance degradation at scale.',
    scope: `IN SCOPE:
- Refactor getDecisionEvidence to batch mode
- Update decisions.ts to use batch fetching
- Add performance test
- Consider Redis/memory cache

OUT OF SCOPE:
- API endpoint changes
- New evidence types`,
    category: 'performance',
    sd_type: 'infrastructure',
    priority: 'medium',
    status: 'draft',
    current_phase: 'IDEATION',
    target_application: 'EHG',
    parent_sd_id: 'SD-HARDENING-V1-000',
    strategic_intent: 'Ensure chairman dashboard remains responsive at scale',
    strategic_objectives: JSON.stringify([
      'Eliminate N+1 query pattern',
      'Reduce query count to O(1) per type',
      'Add performance baseline test',
      'Consider evidence caching'
    ]),
    success_criteria: JSON.stringify([
      'Max 5 queries per decisions API call (not 5*N)',
      'Response time <500ms for 20 decisions',
      'Performance test documents baseline',
      'No regression in evidence accuracy'
    ]),
    key_changes: JSON.stringify([
      'New function: getBatchDecisionEvidence(ventureIds[])',
      'Update decisions.ts to batch fetch',
      'Add performance test',
      'Optional: evidence cache layer'
    ]),
    key_principles: JSON.stringify([
      'Batch over iterate',
      'Measure before optimize',
      'Test performance, not just correctness',
      'Cache if needed'
    ]),
    created_by: 'LEAD',
    version: '1.0',
    metadata: JSON.stringify({
      phase: 3,
      phase_name: 'Stability',
      source: 'Claude Opus 4.5 (confirmed by Gemini)',
      target_repo: 'ehg',
      estimated_effort: '4 hours',
      files_to_modify: [
        'ehg/src/services/chairmanEvidenceService.ts',
        'ehg/src/pages/api/v2/chairman/decisions.ts',
        'ehg/tests/performance/decisions-api.test.ts (new)'
      ],
      code_reference: 'ehg/src/pages/api/v2/chairman/decisions.ts:93-135'
    })
  },
  {
    id: 'SD-HARDENING-V1-006',
    sd_key: 'SD-HARDENING-V1-006',
    title: 'Evidence Service Type Safety & Validation',
    description: `Add type safety and Zod validation to the evidence service.

FINDING (Claude, CONFIRMED by Gemini):
From ehg/src/services/chairmanEvidenceService.ts:

Line 127-144:
"const evidence = artifact.epistemic_evidence as any || {};
...
resolution: (artifact.epistemic_evidence as any)?.resolution || 'Requires further research'"

These 'as any' casts bypass TypeScript's safety checks and could cause runtime crashes
if epistemic_evidence has unexpected shape.

ALSO: Silent error masking (lines 44-70):
"} catch (error) {
  console.error('[ChairmanEvidence] Error fetching evidence:', error);
  // Return empty buckets on error rather than failing completely
}"

FIX APPROACH:
1. Create Zod schema for epistemic_evidence JSONB structure
2. Validate before accessing nested properties
3. Replace 'as any' with proper types
4. Return partial results with error indicator instead of empty buckets`,
    rationale: 'Claude identified type safety issues; Gemini confirmed they exist. Runtime crashes from unexpected data shapes are a stability risk.',
    scope: `IN SCOPE:
- Create EpistemicEvidenceSchema (Zod)
- Replace 'as any' casts
- Add validation before property access
- Improve error handling to return partial results
- TypeScript strict mode compliance

OUT OF SCOPE:
- Database schema changes
- New evidence types`,
    category: 'stability',
    sd_type: 'infrastructure',
    priority: 'medium',
    status: 'draft',
    current_phase: 'IDEATION',
    target_application: 'EHG',
    parent_sd_id: 'SD-HARDENING-V1-000',
    strategic_intent: 'Prevent runtime crashes from data shape mismatches',
    strategic_objectives: JSON.stringify([
      'Create Zod schema for epistemic_evidence',
      'Eliminate all as any casts',
      'Validate JSONB before access',
      'Return partial results with error indicator'
    ]),
    success_criteria: JSON.stringify([
      'No as any casts in chairmanEvidenceService.ts',
      'Zod schema validates epistemic_evidence',
      'Invalid data shape returns { _partial: true, _errors: [...] }',
      'TypeScript strict mode passes',
      'Unit tests for malformed data handling'
    ]),
    key_changes: JSON.stringify([
      'New file: ehg/src/schemas/epistemic-evidence.zod.ts',
      'Update chairmanEvidenceService.ts to use schema',
      'Replace as any with typed access',
      'Update error handling to return partial results',
      'Add unit tests for edge cases'
    ]),
    key_principles: JSON.stringify([
      'Validate at boundaries',
      'No as any in production',
      'Partial data > no data',
      'Errors should be visible'
    ]),
    created_by: 'LEAD',
    version: '1.0',
    metadata: JSON.stringify({
      phase: 3,
      phase_name: 'Stability',
      source: 'Claude Opus 4.5 (confirmed by Gemini)',
      target_repo: 'ehg',
      estimated_effort: '4 hours',
      files_to_modify: [
        'ehg/src/schemas/epistemic-evidence.zod.ts (new)',
        'ehg/src/services/chairmanEvidenceService.ts',
        'ehg/tests/unit/evidence-service.test.ts (new)'
      ],
      code_reference: 'ehg/src/services/chairmanEvidenceService.ts:127-144'
    })
  }
];

async function createHardeningV1SDs() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  HARDENING V1: Creating Strategic Directives');
  console.log('  Three-Way AI Assessment Implementation');
  console.log('  Sources: Claude Opus 4.5 + OpenAI GPT-4 + Google Gemini');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const sd of SDS) {
    try {
      // Check if SD already exists
      const { data: existing } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('id', sd.id)
        .single();

      if (existing) {
        // Update existing SD
        const { error } = await supabase
          .from('strategic_directives_v2')
          .update({
            ...sd,
            updated_at: new Date().toISOString()
          })
          .eq('id', sd.id);

        if (error) throw error;
        console.log(`📝 Updated: ${sd.id} - ${sd.title}`);
        updated++;
      } else {
        // Create new SD
        const { error } = await supabase
          .from('strategic_directives_v2')
          .insert({
            ...sd,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (error) throw error;
        console.log(`✅ Created: ${sd.id} - ${sd.title}`);
        created++;
      }
    } catch (error) {
      console.error(`❌ Error with ${sd.id}: ${error.message}`);
      errors++;
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log(`  Summary: ${created} created, ${updated} updated, ${errors} errors`);
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  // Display hierarchy
  console.log('SD Hierarchy:');
  console.log('└── SD-HARDENING-V1-000 (Parent: Post-Assessment Hardening)');
  console.log('    ├── Phase 1: Security (CRITICAL)');
  console.log('    │   ├── SD-HARDENING-V1-001 (RLS Hardening - ehg)');
  console.log('    │   └── SD-HARDENING-V1-002 (RLS Hardening - EHG_Engineer)');
  console.log('    ├── Phase 2: Correctness (HIGH)');
  console.log('    │   ├── SD-HARDENING-V1-003 (Decision Split-Brain)');
  console.log('    │   └── SD-HARDENING-V1-004 (Function Naming)');
  console.log('    └── Phase 3: Stability (MEDIUM)');
  console.log('        ├── SD-HARDENING-V1-005 (N+1 Query Fix)');
  console.log('        └── SD-HARDENING-V1-006 (Type Safety)');
  console.log('');

  // Cross-repo summary
  console.log('Cross-Repo Distribution:');
  console.log('├── ehg repo: SD-001, SD-003, SD-005, SD-006');
  console.log('└── EHG_Engineer repo: SD-002, SD-004');
  console.log('');

  if (errors === 0) {
    console.log('🎉 All SDs created successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Review SDs in database');
    console.log('2. Move parent SD to LEAD phase for approval');
    console.log('3. Begin Phase 1: Security (SD-001, SD-002)');
  }
}

// Run
createHardeningV1SDs().catch(console.error);
