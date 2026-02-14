/**
 * Insert EVA Audit Remediation orchestrator + 12 child SDs
 * Addresses 157 findings (36 critical, 53 high, 48 medium, 20 low) from EVA Comprehensive Audit.
 * One-time script. Run: node scripts/one-time/insert-eva-remediation-sds.cjs
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ORCH_KEY = 'SD-EVA-REMEDIATION-ORCH-001';

const AUDIT_SOURCE = 'Source: docs/audits/eva-comprehensive/ (12 completed audit reports from SD-EVA-QA-AUDIT-ORCH-001)';

// ─── Children ───────────────────────────────────────────────────────────────────

const children = [
  // ── Tier 1: Independent (9 SDs) ───────────────────────────────────────────────
  {
    key: 'SD-EVA-FIX-CHAIRMAN-GATES-001',
    title: 'Chairman Governance Gates',
    description: `Add blocking Chairman decisions at stages 10, 22, and 25 following the Stage 0 pattern.

Pattern to follow: lib/eva/stage-zero/ — createOrReusePendingDecision() + waitForDecision()
Files: lib/eva/stage-templates/stage-10.js, lib/eva/stage-templates/stage-22.js, lib/eva/stage-templates/stage-25.js

Findings addressed:
- Vision CRIT-001: 3 missing Chairman blocking points (stages 10, 22, 25)
- Theme 2: Chairman Governance

${AUDIT_SOURCE}`,
    scope: 'Add blocking decisions at stages 10, 22, 25 following Stage 0 pattern',
    priority: 'critical',
    est_loc: 150,
    tier: 1,
    blocks: [],
    blocked_by: []
  },
  {
    key: 'SD-EVA-FIX-STAGE15-RISK-001',
    title: 'Stage 15 Risk Register',
    description: `Replace Resource Planning with Risk Register per Architecture Section 8.4 specification.

Files: lib/eva/stage-templates/stage-15.js, lib/eva/stage-templates/analysis-steps/stage-15-*.js
Action: Replace Resource Planning schema with Risk Register schema

Findings addressed:
- Blueprint #19 CRITICAL: Stage 15 scope mismatch (Risk Register vs Resource Planning)
- Theme 9: Stage 15 Scope Mismatch

${AUDIT_SOURCE}`,
    scope: 'Replace Resource Planning with Risk Register per spec',
    priority: 'critical',
    est_loc: 200,
    tier: 1,
    blocks: [],
    blocked_by: []
  },
  {
    key: 'SD-EVA-FIX-ERROR-LOGGING-001',
    title: 'Error & Logging Standardization',
    description: `Adopt ServiceError across 119 files, mandatory logger injection in 68 files, fix 12 silent catches.

Actions:
1. Expand ServiceError class from shared-services.js to lib/eva/errors/service-error.js
2. Create error catalog with codes per subsystem
3. Add mandatory logger = console DI parameter to all public functions
4. Add logging to 12 bare catch blocks

Files: 119 EVA files (55 with throw Error, 68 with no logging, 12 with silent catches)

Findings addressed:
- Cross-Cutting CRIT-002: No ServiceError adoption (119 files use throw new Error)
- Cross-Cutting CRIT-003: No logging injection (68 files with no logger)
- Cross-Cutting HIGH-001: Silent catch blocks (12+ files)
- Theme 4: Error Handling
- Theme 5: Logging Gaps

Note: Infrastructure CRIT-001 (retry logic dead code in event-router.js) is addressed by SD-EVA-FIX-INFRA-BUGS-001, not this SD.

${AUDIT_SOURCE}`,
    scope: 'Adopt ServiceError across 119 files, mandatory logger injection in 68 files, fix 12 silent catches',
    priority: 'critical',
    est_loc: 400,
    tier: 1,
    blocks: ['SD-EVA-FIX-POST-LAUNCH-001'],
    blocked_by: []
  },
  {
    key: 'SD-EVA-FIX-UTILITY-DEDUP-001',
    title: 'Utility Deduplication',
    description: `Extract parseJSON (25 copies) and other shared utils to lib/eva/utils/.

Files: 25 stage analysis files in lib/eva/stage-templates/analysis-steps/
Actions: Extract parseJSON() to lib/eva/utils/parse-json.js, update 25 imports

Findings addressed:
- Cross-Cutting CRIT-001: 25 identical copies of parseJSON utility
- Theme 6: Utility Duplication

${AUDIT_SOURCE}`,
    scope: 'Extract parseJSON (25 copies) + other shared utils to lib/eva/utils/',
    priority: 'high',
    est_loc: 100,
    tier: 1,
    blocks: ['SD-EVA-FIX-ENUM-NAMING-001'],
    blocked_by: []
  },
  {
    key: 'SD-EVA-FIX-DB-SCHEMA-001',
    title: 'Database Schema Normalization',
    description: `Normalize EVA database schema: replace single JSONB column with structured storage, create PostgreSQL ENUMs, tighten RLS policies, add gate constraints and data contracts.

Actions:
1. Design and implement structured stage data storage (architecture to be determined in PLAN phase — options include per-stage tables, partitioned tables, or typed JSONB with constraints)
2. Create 16 PostgreSQL ENUM types (9 decision + 7 categorization) to replace free-text fields
3. Replace USING (TRUE) RLS with role-based policies
4. Add stage-specific gate constraint columns
5. Add cross-stage data contract tracking (artifact dependency validation)

Files: database/migrations/, RLS policies

Findings addressed:
- DB Schema CRIT-001: Missing structured stage storage (single JSONB column for all stage data)
- DB Schema CRIT-002: Missing 16 PostgreSQL ENUM types
- DB Schema HIGH-001: USING (TRUE) RLS policies
- DB Schema HIGH-002: Missing stage-specific gate constraints
- DB Schema HIGH-003: Missing cross-stage data contracts
- Theme 3: Database Schema
- Theme 17: RLS Policies

${AUDIT_SOURCE}`,
    scope: 'Normalize stage data storage, create 16 PostgreSQL ENUMs, tighten RLS policies, add gate constraints and data contracts',
    priority: 'critical',
    est_loc: 500,
    tier: 1,
    blocks: [],
    blocked_by: []
  },
  {
    key: 'SD-EVA-FIX-REALITY-GATES-001',
    title: 'Reality Gate Corrections',
    description: `Fix gate 9→10 wrong artifacts, move gate 20→21 to 22→23, fix dual-gate coordination at stage 12.

Actions:
1. Fix gate 9→10 to validate Stage 6-9 artifacts (not Stage 4)
2. Move gate from boundary 20→21 to 22→23 per Vision v4.7
3. Integrate Stage 12 local gate with system gate

Files: lib/eva/reality-gates.js, stage-12 local gate

Findings addressed:
- Engine CRITICAL-1: Reality gate 9→10 validates wrong artifacts
- Vision HIGH-001: Gate 20→21 in wrong position
- Identity HIGH G12-6: Stage 12 dual-gate coordination
- Theme 8: Reality Gate Issues
- Theme 15: Dual-Gate Coordination

${AUDIT_SOURCE}`,
    scope: 'Fix gate 9→10 wrong artifacts, move gate 20→21 to 22→23, fix dual-gate coordination at stage 12',
    priority: 'critical',
    est_loc: 150,
    tier: 1,
    blocks: [],
    blocked_by: []
  },
  {
    key: 'SD-EVA-FIX-INFRA-BUGS-001',
    title: 'Infrastructure Bug Fixes',
    description: `Fix retry logic dead code, failure reason classification, CLI arg validation, wrong column ref, string-based error matching.

Actions:
1. Fix retry logic dead code in event-router.js:215 to check error.retryable flag
2. Track original + final errors in retry exhaustion for accurate failure classification (event-router.js:228)
3. Add CLI arg validation to eva-run.js (check next element exists, isn't a flag)
4. Fix stage -> lifecycle_stage column reference in decision-submitted.js
5. Replace string-based error matching with error.code === '23505' in sd-completed.js

Files: lib/eva/event-bus/event-router.js, scripts/eva-run.js, lib/eva/event-bus/handlers/decision-submitted.js, lib/eva/event-bus/handlers/sd-completed.js

Findings addressed:
- Infrastructure CRIT-001: Retry logic dead code in event-router.js
- Infrastructure CRIT-002: CLI argument parsing lacks validation
- Infrastructure CRIT-003: Wrong column reference in decision-submitted.js
- Infrastructure HIGH-001: Incorrect failure reason classification in event-router.js (line 228)
- Infrastructure HIGH-005: String-based error matching
- Theme 13: Infrastructure Bugs

${AUDIT_SOURCE}`,
    scope: 'Fix retry logic dead code, failure reason classification, CLI arg validation, wrong column ref, string-based error matching',
    priority: 'high',
    est_loc: 100,
    tier: 1,
    blocks: ['SD-EVA-FIX-POST-LAUNCH-001'],
    blocked_by: []
  },
  {
    key: 'SD-EVA-FIX-KILL-GATES-001',
    title: 'Kill Gate Logic Fixes',
    description: `Stage 13 priority check, Stage 23 upstream prerequisite, risk threshold standardization (Vision v4.7: 7/9).

Actions:
1. Add 'now'-priority milestone check to Stage 13 kill gate
2. Add Stage 22 prerequisite check to Stage 23 kill gate
3. Standardize risk thresholds to Vision v4.7 values (7=caution, 9=chairman)

Files: Stage 13 kill gate, Stage 23 kill gate, Stage 6 template/analysis

Findings addressed:
- Engine CRITICAL-2: Risk threshold triple-inconsistency (values 1, 8, 10 vs spec 7, 9)
- Blueprint #8: Stage 13 kill gate missing 'now'-priority check
- Launch CC-3: Stage 23 kill gate missing Stage 22 prerequisite
- Theme 10: Kill Gate Logic
- Theme 20: Risk Threshold

${AUDIT_SOURCE}`,
    scope: 'Stage 13 priority check, Stage 23 upstream prerequisite, risk threshold standardization',
    priority: 'critical',
    est_loc: 120,
    tier: 1,
    blocks: [],
    blocked_by: []
  },
  {
    key: 'SD-EVA-FIX-DOSSIER-REBUILD-001',
    title: 'Dossier System Rebuild',
    description: `Regenerate 20 missing dossiers, fix 4 stale stage names, archive 14 old-era files, fix README.

Actions:
1. Update README to correct status (5/25, not 100%)
2. Rename 4 dossiers to Vision v4.7 stage names
3. Archive 14 stale 40-stage era files
4. Generate 20 missing dossier structures
5. Align phase grouping to 6-phase model

Files: docs/guides/workflow/dossiers/

Findings addressed:
- Dossier CRITICAL-1: 20 missing dossier structures
- Dossier CRITICAL-2: 4 stale stage names
- Dossier CRITICAL-3: README claims 100% but only 5/25 exist
- Dossier HIGH-1/2: Phase grouping and archive issues
- Theme 14: Dossier System

${AUDIT_SOURCE}`,
    scope: 'Regenerate 20 missing dossiers, fix 4 stale stage names, archive 14 old-era files, fix README',
    priority: 'high',
    est_loc: 300,
    tier: 1,
    blocks: [],
    blocked_by: []
  },

  // ── Tier 2: Dependencies (3 SDs) ─────────────────────────────────────────────
  {
    key: 'SD-EVA-FIX-TEMPLATE-ALIGN-001',
    title: 'Template Schema Alignment',
    description: `Add missing fields/decision objects across Phases 3 (10 fields), 5 (13 fields), 6 (12+ fields); fix Stages 6-9, 14, 16 missing Architecture v2.0 fields.

Actions:
1. Phase 3 (Identity): Add 10 missing fields (narrativeExtension, namingStrategy, decision objects, etc.)
2. Phase 5 (Build Loop): Add 5 decision objects + 8 fields
3. Phase 6 (Launch): Add launchOutcome, ventureDecision, financialComparison objects; Stage 23 (launchType, successCriteria, rollbackTriggers); Stage 24 (AARRR trend fields)
4. Stage 6: Add aggregate risk metrics, risk_source enum alignment, 3-factor scoring fields (Engine HIGH-1/2/5)
5. Stages 7-9, 14, 16: Add Architecture v2.0 missing fields

Files: Stage templates for 6, 7, 8, 9, 10, 11, 12, 14, 16, 17, 19, 20, 21, 22, 23, 24, 25

Findings addressed:
- Template-Analysis divergence (systemic across all phases)
- Architecture v2.0 gaps (Engine HIGH-1/2/5 for Stage 6)
- Launch template gaps (Stage 23-24 missing fields)
- Theme 1: Template-Analysis Divergence
- Theme 12: Missing Arch v2.0 Fields

${AUDIT_SOURCE}`,
    scope: 'Add missing fields/decision objects across Phases 3, 5, 6; fix Stages 6-9, 14, 16 Architecture v2.0 fields; add Stage 23-24 Launch gaps',
    priority: 'critical',
    est_loc: 700,
    tier: 1,
    blocks: [],
    blocked_by: []
  },
  {
    key: 'SD-EVA-FIX-ENUM-NAMING-001',
    title: 'Enum Validation & Field Naming',
    description: `Replace typeof x === 'string' template validation with enum arrays for 8 Build Loop fields, fix camelCase/snake_case drift, rename DI params.

Actions:
1. Replace typeof x === 'string' with VALID_ENUMS.includes(x) in Build Loop template validation for 8 fields:
   - Stage 17: bugs[].severity, bugs[].status
   - Stage 18: improvements[].category
   - Stage 19: metricUpdates[].trend
   - Stage 20: roadmapItems[].priority
   - Stage 21: completionItems[].status
   - Stage 22: releaseItems[].category
2. Fix camelCase/snake_case drift across stage templates
3. Rename db -> supabase in 6 DI files
4. Rename LLM client -> llmClient in 25 templates

Files: Build Loop templates (17-22), all stage templates (naming), 6 DI files, 25 LLM client files

Findings addressed:
- Build Loop Finding 2 (HIGH): 8 fields use typeof instead of enum arrays in template validation
- Cross-Cutting HIGH-003: DI parameter naming (db -> supabase)
- Schema field naming drift across templates
- Theme 7: Enum Validation
- Theme 11: Schema Field Naming
- Theme 19: DI Parameter Naming

${AUDIT_SOURCE}`,
    scope: 'Replace typeof checks with enum arrays for 8 Build Loop fields, fix naming drift, rename DI params',
    priority: 'high',
    est_loc: 200,
    tier: 2,
    blocks: [],
    blocked_by: ['SD-EVA-FIX-UTILITY-DEDUP-001']
  },
  {
    key: 'SD-EVA-FIX-POST-LAUNCH-001',
    title: 'Post-Launch Operations & Test Coverage',
    description: `Stage 25 decision routing (5 outcomes), template-applier completion, event bus tests, CLI tests, chairman watcher tests.

Actions:
1. Implement Stage 25 decision routing (continue→24, pivot→new venture, expand→child, sunset, exit)
2. Complete template-applier.js TODOs
3. Write event bus unit tests (router, 4 handlers)
4. Write CLI (eva-run.js) tests
5. Write chairman watcher tests

Files: Stage 25 handler, template-applier.js, event bus test files

Findings addressed:
- Post-Launch gaps: Stage 25 decision routing missing
- Test coverage gaps: 0 tests for event bus, CLI, chairman watcher
- Theme 16: Post-Launch Operations
- Theme 18: Missing Test Coverage

${AUDIT_SOURCE}`,
    scope: 'Stage 25 decision routing, template-applier completion, event bus/CLI/chairman tests',
    priority: 'medium',
    est_loc: 400,
    tier: 2,
    blocks: [],
    blocked_by: ['SD-EVA-FIX-ERROR-LOGGING-001', 'SD-EVA-FIX-INFRA-BUGS-001']
  }
];

// ─── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Creating EVA Audit Remediation SDs ===\n');
  console.log('157 findings: 36 critical, 53 high, 48 medium, 20 low');
  console.log('20 themes → 12 children + 1 orchestrator\n');

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
      title: 'EVA Audit Remediation: Address 157 Findings from Comprehensive Audit',
      description: `Orchestrator for remediating 157 findings (36 critical, 53 high, 48 medium, 20 low) identified by EVA Comprehensive Audit (SD-EVA-QA-AUDIT-ORCH-001).

Tier 1 (10 SDs, parallel): Chairman Gates, Stage 15 Risk, Error/Logging, Utility Dedup, DB Schema, Reality Gates, Infra Bugs, Kill Gates, Dossier Rebuild, Template Alignment
Tier 2 (2 SDs, sequential): Enum/Naming, Post-Launch/Tests

Dependency graph:
  Tier 1 (parallel): [1-CHAIRMAN] [2-STAGE15] [3-ERR/LOG] [4-UTILS] [5-DB] [6-GATES] [7-INFRA] [8-KILL] [9-DOSSIER] [10-TEMPLATES]
  Tier 2 (after):     [11-ENUMS←4]  [12-POST-LAUNCH←3,7]

Coverage: All 20 major audit themes assigned to child SDs. All CRITICAL and HIGH findings explicitly addressed. Some MEDIUM/LOW findings (DB Schema MED-001/002/003, Cross-Cutting MED-001/002/003, Infrastructure MED-001-004) are not explicitly scoped — these may be addressed incidentally during related work or deferred to follow-up SDs.

${AUDIT_SOURCE}`,
      scope: 'Remediate all 157 findings from EVA Comprehensive Audit across 12 child SDs',
      rationale: 'EVA Comprehensive Audit (SD-EVA-QA-AUDIT-ORCH-001, 12 children, all completed) identified 157 findings across 20 themes. These must be systematically remediated to bring EVA implementation into compliance with Vision v4.7 and Architecture v1.6.',
      success_criteria: [
        { measure: 'Critical findings resolved', criterion: 'All 36 critical findings addressed' },
        { measure: 'High findings resolved', criterion: 'All 53 high findings addressed' },
        { measure: 'Medium findings resolved', criterion: 'All 48 medium findings addressed' },
        { measure: 'Low findings resolved', criterion: 'All 20 low findings addressed' },
        { measure: 'All themes covered', criterion: '20/20 audit themes have remediation SDs' }
      ],
      risks: [
        { risk: 'Large remediation scope (157 findings)', mitigation: 'Parallelized across 9 independent Tier 1 children' },
        { risk: 'Tier 2 dependencies may delay completion', mitigation: 'Tier 2 blocked only on directly prerequisite Tier 1 SDs, not all 9' }
      ],
      stakeholders: ['Chairman'],
      implementation_guidelines: [
        'Reference docs/audits/eva-comprehensive/ for detailed findings per theme',
        'Follow Vision v4.7 and Architecture v1.6 as gold standards',
        'Each child SD addresses 1-3 related themes'
      ],
      key_changes: [{ change: 'Systematic remediation of 157 audit findings', impact: 'EVA compliance with Vision v4.7 and Architecture v1.6' }],
      key_principles: ['Fix all findings, not just critical', 'Respect dependency order', 'Each theme maps to exactly one child SD'],
      success_metrics: [
        { metric: 'Children completed', target: '12/12', actual: '0/12' },
        { metric: 'Findings resolved', target: '157/157', actual: '0/157' }
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
      category: 'EVA Remediation',
      title: child.title,
      description: child.description,
      scope: child.scope,
      parent_sd_id: ORCH_KEY,
      rationale: `Part of EVA Audit Remediation orchestrator (${ORCH_KEY}). Addresses findings from EVA Comprehensive Audit.`,
      success_criteria: child.success_criteria || [{ measure: 'Findings resolved', criterion: `${child.scope} — all mapped findings addressed and verified` }],
      risks: child.risks || [],
      stakeholders: ['Chairman'],
      implementation_guidelines: child.implementation_guidelines || ['Reference docs/audits/eva-comprehensive/ for detailed findings'],
      key_changes: [{ change: child.title, impact: `Fixes audit findings in scope: ${child.scope}` }],
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
