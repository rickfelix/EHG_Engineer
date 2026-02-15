/**
 * Insert EVA Round 2 Remediation orchestrator + 13 child SDs
 * Addresses 103 findings (10 critical, 38 high, 47 medium, 8 low) from R2 post-remediation audit.
 * One-time script. Run: node scripts/one-time/insert-eva-remediation-r2-sds.cjs
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ORCH_KEY = 'SD-EVA-REMEDIATION-R2-ORCH-001';

const AUDIT_SOURCE = 'Source: R2 post-remediation audit reports (SD-EVA-QA-AUDIT-R2-*-001). Average score 51→70/100 (+19 pts after R1 remediation).';

// ─── Children ───────────────────────────────────────────────────────────────────

const children = [
  // ── Tier 1: Independent (9 SDs) ───────────────────────────────────────────────
  {
    key: 'SD-EVA-R2-FIX-SECURITY-001',
    title: 'DB Public-Role Write Policy Lockdown',
    description: `Lock down public-role write access on 7 EVA tables. Current RLS policies allow unauthenticated writes.

Actions:
1. Revoke public INSERT/UPDATE on: eva_ventures, eva_stage_results, eva_stage_artifacts, eva_chairman_decisions, eva_event_log, eva_kill_decisions, eva_reality_gate_results
2. Create service-role-only write policies for each table
3. Verify existing read policies remain intact

Files: database/migrations/ (new migration), RLS policies on 7 tables

Findings addressed:
- DB NEW-002 (CRITICAL): 7 tables have public-role write access
- DB NEW-003 (HIGH): Missing service-role enforcement on writes
- DB NEW-004 (HIGH): No row-level ownership validation

${AUDIT_SOURCE}`,
    scope: 'Revoke public write access on 7 EVA tables, add service-role-only policies',
    priority: 'critical',
    est_loc: 80,
    tier: 1,
    blocks: [],
    blocked_by: []
  },
  {
    key: 'SD-EVA-R2-FIX-STAGE1-HYDRATION-001',
    title: 'Stage 1 Analysis Step Completion',
    description: `Complete Stage 1 (Ground Truth Analysis) hydration — analysis steps exist as stubs returning empty objects.

Actions:
1. Implement Stage 1 analysis step logic for all sub-steps
2. Wire analysis steps to template validate() contract
3. Add cross-stage data contracts from Stage 1 outputs

Files: lib/eva/stage-templates/stage-1.js, lib/eva/stage-templates/analysis-steps/stage-1-*.js

Findings addressed:
- F-TRUTH-001 (CRITICAL): Stage 1 analysis steps return empty objects
- F-TRUTH-002 (CRITICAL): No validation of Stage 1 outputs
- F-TRUTH-003 (HIGH): Missing cross-stage contracts from Stage 1
- F-TRUTH-004 (HIGH): Analysis step stubs not wired to template
- F-TRUTH-005 (HIGH): No error handling in Stage 1 pipeline

${AUDIT_SOURCE}`,
    scope: 'Implement Stage 1 analysis steps, wire to template validate(), add cross-stage contracts',
    priority: 'critical',
    est_loc: 200,
    tier: 1,
    blocks: ['SD-EVA-R2-FIX-TEST-COVERAGE-001'],
    blocked_by: []
  },
  {
    key: 'SD-EVA-R2-FIX-TEMPLATE-VALIDATE-P1P2-001',
    title: 'Template validate() Enforcement: Phases 1-2',
    description: `Enforce template validate() contracts for Phase 1 (Ground Truth, Stages 1-5) and Phase 2 (Identity, Stages 6-9). Fix engine risk formula inconsistency, add cross-stage contracts.

Actions:
1. Add/fix validate() in Stage 1-5 templates with proper field checks
2. Add/fix validate() in Stage 6-9 templates with Architecture v2.0 fields
3. Fix engine risk formula to use Vision v4.7 thresholds (7=caution, 9=chairman)
4. Add cross-stage contract validation between Phase 1 and Phase 2 outputs

Files: lib/eva/stage-templates/stage-{1..9}.js, lib/eva/engine/risk-*.js

Findings addressed:
- 8 engine findings related to Phase 1-2 template gaps
- Engine risk formula inconsistency (HIGH)
- Phase 1 cross-stage contract gaps (HIGH)
- Template-analysis divergence in Phases 1-2

${AUDIT_SOURCE}`,
    scope: 'Enforce validate() in Phase 1-2 templates, fix risk formula, add cross-stage contracts',
    priority: 'critical',
    est_loc: 300,
    tier: 1,
    blocks: ['SD-EVA-R2-FIX-CROSS-CUTTING-001'],
    blocked_by: []
  },
  {
    key: 'SD-EVA-R2-FIX-TEMPLATE-VALIDATE-P3-001',
    title: 'Template validate() Enforcement: Phase 3',
    description: `Enforce template validate() contracts for Phase 3 (Business Model, Stages 10-13). Fix 7 unenforced fields, add G12-7 economyCheck validation, close enum gaps.

Actions:
1. Add validate() enforcement for 7 unenforced fields in Stage 10-13 templates
2. Implement G12-7 economyCheck validation in Stage 12 template
3. Add enum validation for free-text fields in Phase 3
4. Wire validation errors to structured error reporting

Files: lib/eva/stage-templates/stage-{10..13}.js

Findings addressed:
- 7 unenforced template fields in Phase 3
- G12-7 economyCheck missing validation (HIGH)
- Enum gaps in Phase 3 templates (MEDIUM)

${AUDIT_SOURCE}`,
    scope: 'Enforce validate() in Phase 3 templates, add economyCheck, close enum gaps',
    priority: 'high',
    est_loc: 250,
    tier: 1,
    blocks: ['SD-EVA-R2-FIX-CROSS-CUTTING-001'],
    blocked_by: []
  },
  {
    key: 'SD-EVA-R2-FIX-TEMPLATE-VALIDATE-P4-001',
    title: 'Template validate() + Spec Alignment: Phase 4',
    description: `Enforce template validate() and align with spec for Phase 4 (Growth, Stages 14-16). Stage 14 security/dataEntities/5-layer gaps, Stage 16 financial validation gaps.

Actions:
1. Stage 14: Add security validation fields, dataEntities schema, 5-layer architecture checks
2. Stage 15: Verify risk register alignment (from R1 fix)
3. Stage 16: Add financial projection validation, unit economics checks
4. Wire all validate() to structured error output

Files: lib/eva/stage-templates/stage-{14..16}.js, lib/eva/stage-templates/analysis-steps/stage-{14..16}-*.js

Findings addressed:
- Stage 14 security/dataEntities/5-layer gaps (HIGH)
- Stage 16 financial validation gaps (HIGH)
- Template-spec divergence in Phase 4

${AUDIT_SOURCE}`,
    scope: 'Enforce validate() in Phase 4 templates, fix Stage 14 security + Stage 16 financial gaps',
    priority: 'high',
    est_loc: 350,
    tier: 1,
    blocks: ['SD-EVA-R2-FIX-CROSS-CUTTING-001'],
    blocked_by: []
  },
  {
    key: 'SD-EVA-R2-FIX-ENUM-ALIGN-P5-001',
    title: 'Enum Alignment: Phase 5 (Build Loop)',
    description: `Fix 6 enum mismatches in Phase 5 Build Loop (Stages 17-22), add missing template fields, close severity validation gap.

Actions:
1. Fix 6 enum mismatches between template validation and analysis step output
2. Add missing template fields identified in R2 audit
3. Add severity enum validation (replacing typeof === 'string' checks)
4. Align enum values across template, analysis, and DB layers

Files: lib/eva/stage-templates/stage-{17..22}.js, lib/eva/stage-templates/analysis-steps/stage-{17..22}-*.js

Findings addressed:
- 6 enum mismatches in Build Loop (HIGH)
- Missing template fields in Phase 5 (MEDIUM)
- Severity validation gap (HIGH)

${AUDIT_SOURCE}`,
    scope: 'Fix 6 enum mismatches in Build Loop, add missing fields, close severity gap',
    priority: 'high',
    est_loc: 250,
    tier: 1,
    blocks: ['SD-EVA-R2-FIX-CROSS-CUTTING-001'],
    blocked_by: []
  },
  {
    key: 'SD-EVA-R2-FIX-LAUNCH-ENUMS-001',
    title: 'Enum + Schema Alignment: Phase 6 (Launch)',
    description: `Fix enum and schema alignment for Phase 6 Launch (Stages 23-25). Stage 25 VENTURE_DECISIONS critical gap, ventureHealth critical gap, 15 total findings.

Actions:
1. Stage 25: Implement VENTURE_DECISIONS enum with 5 outcomes (continue, pivot, expand, sunset, exit)
2. Stage 25: Add ventureHealth schema with required fields
3. Stage 23-24: Fix enum values for launch decision types
4. Wire all enums to DB-level PostgreSQL ENUM types where applicable

Files: lib/eva/stage-templates/stage-{23..25}.js, database/migrations/ (enum types)

Findings addressed:
- Stage 25 VENTURE_DECISIONS missing (CRITICAL)
- Stage 25 ventureHealth missing (CRITICAL)
- 15 total Launch phase findings

${AUDIT_SOURCE}`,
    scope: 'Fix Stage 25 VENTURE_DECISIONS + ventureHealth, align Launch phase enums',
    priority: 'critical',
    est_loc: 350,
    tier: 1,
    blocks: ['SD-EVA-R2-FIX-DOSSIER-NAMES-001', 'SD-EVA-R2-FIX-TEST-COVERAGE-001'],
    blocked_by: []
  },
  {
    key: 'SD-EVA-R2-FIX-LOGGING-001',
    title: 'Logging Instrumentation for 72 Silent Files',
    description: `Add structured logging to 72 EVA files that currently have zero logging instrumentation, and 25 analysis steps that run silently.

Actions:
1. Add logger DI parameter to 72 files with no logging
2. Add entry/exit/error logging to 25 silent analysis steps
3. Use structured log format (JSON with stage, step, venture context)
4. Add performance timing to analysis step execution

Files: 72 files in lib/eva/ (identified by R2 cross-cutting audit), 25 analysis step files

Findings addressed:
- CrossCut CRIT-002: 72 files with zero logging instrumentation
- CrossCut CRIT-003: 25 analysis steps run silently
- Logging gap prevents debugging and observability

${AUDIT_SOURCE}`,
    scope: 'Add structured logging to 72 silent files and 25 silent analysis steps',
    priority: 'high',
    est_loc: 400,
    tier: 1,
    blocks: ['SD-EVA-R2-FIX-TEST-COVERAGE-001'],
    blocked_by: []
  },
  {
    key: 'SD-EVA-R2-FIX-CHAIRMAN-DB-001',
    title: 'Chairman Decision Taxonomy DB Enforcement',
    description: `Enforce Chairman decision taxonomy in database. 16 decision types exist in code but are not validated at DB level.

Actions:
1. Create PostgreSQL ENUM type for 16 chairman decision types
2. Add CHECK constraint on eva_chairman_decisions.decision_type
3. Validate existing data against enum (migration with data check)
4. Update insert/update code to use enum validation

Files: database/migrations/ (new migration), lib/eva/chairman/

Findings addressed:
- Vision CRIT-002: 16 decision types unenforced in DB
- Chairman decisions can contain arbitrary strings

${AUDIT_SOURCE}`,
    scope: 'Create DB ENUM for 16 chairman decision types, add CHECK constraint',
    priority: 'high',
    est_loc: 100,
    tier: 1,
    blocks: [],
    blocked_by: []
  },

  // ── Tier 2: Dependent (4 SDs) ─────────────────────────────────────────────────
  {
    key: 'SD-EVA-R2-FIX-DOSSIER-NAMES-001',
    title: 'Dossier Stage Name Canonicalization',
    description: `Canonicalize dossier stage names — 24 of 25 stage names diverge between Vision spec and database/dossier system.

Actions:
1. Create canonical stage name mapping (Vision v4.7 → DB/dossier)
2. Update 24 dossier stage names to match Vision spec
3. Update DB references to use canonical names
4. Add validation to prevent future name drift

Files: docs/guides/workflow/dossiers/, database seed data, lib/eva/stage-templates/

Findings addressed:
- 24/25 stage names diverge between Vision and DB
- Name inconsistency causes confusion in reporting

Blocked by: SD-EVA-R2-FIX-LAUNCH-ENUMS-001 (Stage 25 schema must be finalized first)

${AUDIT_SOURCE}`,
    scope: 'Canonicalize 24 divergent stage names between Vision and DB/dossier',
    priority: 'high',
    est_loc: 200,
    tier: 2,
    blocks: [],
    blocked_by: ['SD-EVA-R2-FIX-LAUNCH-ENUMS-001']
  },
  {
    key: 'SD-EVA-R2-FIX-CROSS-CUTTING-001',
    title: 'Cross-Cutting: DI Naming + Export Cleanup',
    description: `Fix cross-cutting code quality issues: DI parameter naming (db→supabase in 4 files), mixed export patterns, parseJSON residual copies.

Actions:
1. Rename db→supabase DI parameter in 4 remaining files
2. Standardize export patterns (named exports, no default+named mixing)
3. Remove any remaining parseJSON copies (use shared util)
4. Fix any import path inconsistencies

Files: 4 DI files, export pattern files across lib/eva/

Findings addressed:
- db→supabase naming (4 files remaining from R1)
- Mixed export patterns (MEDIUM)
- parseJSON residual copies (MEDIUM)

Blocked by: Template validate SDs (#3,4,5,6) — naming changes must not conflict with template work

${AUDIT_SOURCE}`,
    scope: 'Fix DI naming (db→supabase), standardize exports, remove parseJSON copies',
    priority: 'medium',
    est_loc: 200,
    tier: 2,
    blocks: [],
    blocked_by: [
      'SD-EVA-R2-FIX-TEMPLATE-VALIDATE-P1P2-001',
      'SD-EVA-R2-FIX-TEMPLATE-VALIDATE-P3-001',
      'SD-EVA-R2-FIX-TEMPLATE-VALIDATE-P4-001',
      'SD-EVA-R2-FIX-ENUM-ALIGN-P5-001'
    ]
  },
  {
    key: 'SD-EVA-R2-FIX-TEST-COVERAGE-001',
    title: 'Test Coverage for Untested Components',
    description: `Add test coverage for components identified as untested in R2 audit: event router, CLI, chairman watcher, and Stages 2/4/5 analysis steps.

Actions:
1. Write unit tests for event router (lib/eva/event-bus/event-router.js)
2. Write CLI tests for eva-run.js argument parsing and execution
3. Write chairman watcher tests
4. Write Stage 2, 4, 5 analysis step tests
5. Target >80% coverage for each component

Files: tests/eva/ (new test files)

Findings addressed:
- Event router: 0 test coverage
- CLI: 0 test coverage
- Chairman watcher: 0 test coverage
- Stages 2/4/5: 0 analysis step tests

Blocked by: Stage 1 hydration (#2), Launch enums (#7), Logging (#8) — test against completed implementations

${AUDIT_SOURCE}`,
    scope: 'Add tests for event router, CLI, chairman watcher, Stages 2/4/5',
    priority: 'medium',
    est_loc: 400,
    tier: 2,
    blocks: [],
    blocked_by: [
      'SD-EVA-R2-FIX-STAGE1-HYDRATION-001',
      'SD-EVA-R2-FIX-LAUNCH-ENUMS-001',
      'SD-EVA-R2-FIX-LOGGING-001'
    ]
  },
  {
    key: 'SD-EVA-R2-FIX-PRD-BACKFILL-001',
    title: 'PRD integration_operationalization Backfill',
    description: `Backfill integration_operationalization field for all existing PRDs. R2 audit found all PRDs have NULL for this field.

Actions:
1. Query all PRDs with NULL integration_operationalization
2. Generate integration_operationalization content for each PRD using sub-agent
3. Update PRDs in database
4. Add validation to PRD creation flow to require this field

Files: scripts/ (backfill script), lib/leo/prd/ (validation update)

Findings addressed:
- R2-CRITICAL-1: All PRDs have NULL integration_operationalization
- Sub-agent wiring for PRD enrichment

${AUDIT_SOURCE}`,
    scope: 'Backfill integration_operationalization for all PRDs, add creation-time validation',
    priority: 'low',
    est_loc: 120,
    tier: 2,
    blocks: [],
    blocked_by: []
  }
];

// ─── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Creating EVA R2 Remediation SDs ===\n');
  console.log('103 findings: 10 critical, 38 high, 47 medium, 8 low');
  console.log('13 children + 1 orchestrator\n');

  // 1. Insert or reuse orchestrator
  const { data: existingOrch } = await db
    .from('strategic_directives_v2')
    .select('uuid_id,sd_key')
    .eq('sd_key', ORCH_KEY)
    .single();

  let orchRef;

  if (existingOrch) {
    console.log(`Orchestrator already exists: ${existingOrch.sd_key} (uuid: ${existingOrch.uuid_id})`);
    orchRef = existingOrch;
  } else {
    const orchData = {
      id: ORCH_KEY,
      sd_key: ORCH_KEY,
      sd_type: 'orchestrator',
      status: 'draft',
      priority: 'critical',
      current_phase: 'LEAD_APPROVAL',
      category: 'EVA Remediation',
      title: 'EVA Round 2 Remediation: Address 103 Findings from Post-Remediation Audit',
      description: `Orchestrator for remediating 103 findings (10 critical, 38 high, 47 medium, 8 low) identified by EVA Round 2 Post-Remediation Audit.

R1 remediation improved average score from 51→70/100 (+19 points). This R2 orchestrator addresses remaining gaps.

Tier 1 (9 SDs, parallel): Security, Stage1 Hydration, Template P1-2, Template P3, Template P4, Enum P5, Launch Enums, Logging, Chairman DB
Tier 2 (4 SDs, dependent): Dossier Names, Cross-Cutting, Test Coverage, PRD Backfill

Dependency graph:
  Tier 1 (parallel): [1-SECURITY] [2-STAGE1] [3-TEMPLATE-P1P2] [4-TEMPLATE-P3] [5-TEMPLATE-P4] [6-ENUM-P5] [7-LAUNCH-ENUMS] [8-LOGGING] [9-CHAIRMAN-DB]
  Tier 2 (after):    [10-DOSSIER←7] [11-CROSS-CUTTING←3,4,5,6] [12-TESTS←2,7,8] [13-PRD-BACKFILL]

Design decision: Split template/enum/validation by phase (5 children) instead of 1 mega-SD. R1's SD-EVA-FIX-TEMPLATE-ALIGN-001 at 700 LOC was too large and only partially succeeded.

${AUDIT_SOURCE}`,
      scope: 'Remediate all 103 findings from EVA Round 2 Audit across 13 child SDs',
      rationale: 'EVA R1 remediation improved scores from 51→70/100 but 103 findings remain (10 CRIT, 38 HIGH, 47 MED, 8 LOW). Systematic R2 remediation required to reach target 85+/100 across all audit areas.',
      success_criteria: [
        { measure: 'Critical findings resolved', criterion: 'All 10 critical findings addressed' },
        { measure: 'High findings resolved', criterion: 'All 38 high findings addressed' },
        { measure: 'Medium findings resolved', criterion: 'All 47 medium findings addressed' },
        { measure: 'Low findings resolved', criterion: 'All 8 low findings addressed' },
        { measure: 'Average audit score', criterion: '85+/100 across all 12 audit areas' }
      ],
      risks: [
        { risk: 'Template changes across 5 SDs may conflict', mitigation: 'Phase-based splitting ensures each child touches different stage files' },
        { risk: 'DB migrations in Security + Chairman DB SDs', mitigation: 'Isolated table scopes — Security touches RLS, Chairman touches ENUM types' }
      ],
      stakeholders: ['Chairman'],
      implementation_guidelines: [
        'Reference R2 audit reports (SD-EVA-QA-AUDIT-R2-*-001) for detailed findings',
        'Follow Vision v4.7 and Architecture v2.0 as gold standards',
        'Each child SD addresses phase-specific or cross-cutting findings',
        'Template SDs split by phase to keep each under 350 LOC'
      ],
      key_changes: [{ change: 'Systematic R2 remediation of 103 audit findings', impact: 'EVA audit scores from 70→85+/100' }],
      key_principles: ['Phase-based splitting over mega-SDs', 'Fix root cause not symptoms', 'Respect dependency order'],
      success_metrics: [
        { metric: 'Children completed', target: '13/13', actual: '0/13' },
        { metric: 'Findings resolved', target: '103/103', actual: '0/103' },
        { metric: 'Average audit score', target: '85+/100', actual: '70/100' }
      ],
      smoke_test_steps: [],
      is_active: true,
      created_by: 'claude-engineer'
    };

    const { data: orch, error: orchErr } = await db
      .from('strategic_directives_v2')
      .insert(orchData)
      .select('uuid_id,sd_key')
      .single();

    if (orchErr) {
      console.error('Failed to insert orchestrator:', orchErr.message);
      process.exit(1);
    }
    console.log(`Orchestrator created: ${orch.sd_key} (uuid: ${orch.uuid_id})`);
    orchRef = orch;
  }

  // 2. Insert children (sequentially to respect parent reference)
  const childResults = [];
  for (const child of children) {
    // Check if already exists
    const { data: existingChild } = await db
      .from('strategic_directives_v2')
      .select('uuid_id,sd_key')
      .eq('sd_key', child.key)
      .single();

    if (existingChild) {
      console.log(`  Child already exists: ${existingChild.sd_key} (uuid: ${existingChild.uuid_id})`);
      childResults.push({ ...existingChild, tier: child.tier });
      continue;
    }

    const childData = {
      id: child.key,
      sd_key: child.key,
      sd_type: 'infrastructure',
      status: 'draft',
      priority: child.priority,
      current_phase: 'LEAD_APPROVAL',
      category: 'EVA Remediation R2',
      title: child.title,
      description: child.description,
      scope: child.scope,
      parent_sd_id: ORCH_KEY,
      rationale: `Part of EVA R2 Remediation orchestrator (${ORCH_KEY}). Addresses remaining findings from R2 post-remediation audit.`,
      success_criteria: [{ measure: 'Findings resolved', criterion: `${child.scope} — all mapped findings addressed and verified` }],
      risks: [],
      stakeholders: ['Chairman'],
      implementation_guidelines: ['Reference R2 audit reports (SD-EVA-QA-AUDIT-R2-*-001) for detailed findings'],
      key_changes: [{ change: child.title, impact: `Fixes R2 audit findings in scope: ${child.scope}` }],
      key_principles: ['Fix root cause, not symptoms', 'Follow gold standard specs'],
      success_metrics: [
        { metric: 'Estimated LOC', target: `~${child.est_loc}`, actual: null },
        { metric: 'Findings resolved', target: 'All mapped', actual: null }
      ],
      smoke_test_steps: [],
      dependencies: {
        blocks: child.blocks,
        blocked_by: child.blocked_by
      },
      is_active: true,
      created_by: 'claude-engineer'
    };

    const { data: result, error: childErr } = await db
      .from('strategic_directives_v2')
      .insert(childData)
      .select('uuid_id,sd_key')
      .single();

    if (childErr) {
      console.error(`  Failed to insert ${child.key}: ${childErr.message}`);
      continue;
    }
    childResults.push({ ...result, tier: child.tier });
    console.log(`  Child T${child.tier} created: ${result.sd_key} (uuid: ${result.uuid_id})`);
  }

  // 3. Summary
  const t1 = childResults.filter(c => c.tier === 1);
  const t2 = childResults.filter(c => c.tier === 2);

  console.log('\n=== Done ===');
  console.log(`Total: 1 orchestrator + ${childResults.length} children`);
  console.log(`Tier 1: ${t1.length} (independent, parallel)`);
  console.log(`Tier 2: ${t2.length} (blocked by specific Tier 1 SDs)`);

  // 4. Verify dependencies
  console.log('\n=== Dependency Verification ===');
  for (const child of children.filter(c => c.tier === 2)) {
    const { data } = await db
      .from('strategic_directives_v2')
      .select('sd_key,dependencies')
      .eq('sd_key', child.key)
      .single();

    if (data) {
      const deps = data.dependencies || {};
      console.log(`  ${data.sd_key}: blocked_by=[${(deps.blocked_by || []).join(', ')}]`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
