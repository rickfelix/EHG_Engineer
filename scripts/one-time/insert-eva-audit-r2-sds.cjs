/**
 * Insert EVA Comprehensive Audit Round 2 orchestrator + 12 child SDs
 * Re-audits all 12 areas from Round 1 to verify remediation effectiveness.
 * One-time script. Run: node scripts/one-time/insert-eva-audit-r2-sds.cjs
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ORCH_KEY = 'SD-EVA-QA-AUDIT-R2-ORCH-001';
const R1_ORCH_KEY = 'SD-EVA-QA-AUDIT-ORCH-001';

const GOLD_STANDARDS = 'Gold Standards: Vision v4.7 (docs/plans/eva-venture-lifecycle-vision.md Section 5), Architecture v1.6 (docs/plans/eva-platform-architecture.md Section 8)';
const R2_TEMPLATE = `Enhanced Round 2 Reporting Template:
1. Round 1 Score Comparison: Table showing R1 score -> R2 score per category
2. Remediation Verification: For each R1 finding — FIXED / PARTIALLY FIXED / NOT FIXED / REGRESSED
3. New Findings: Issues not present in Round 1 (introduced by fixes or newly discovered)
4. Net Delta: Summary of score change and finding count change`;

// Round 1 scores (extracted from docs/audits/eva-comprehensive/)
const R1_SCORES = {
  'TRUTH': null,       // No R1 report found
  'ENGINE': 62,
  'IDENTITY': 60,
  'BLUEPRINT': 50,     // Estimated from 27 findings (2 CRIT, 9 HIGH)
  'BUILDLOOP': 45,
  'LAUNCH': 62,
  'INFRA': 58,
  'DBSCHEMA': 42,
  'CROSSCUT': 38,
  'VISION': 72,
  'DOSSIER': 32,
  'PRD-EXEC': null     // No R1 report found
};

// ─── Children ───────────────────────────────────────────────────────────────────

const children = [
  // ── Tier 1: Independent (9 SDs) ───────────────────────────────────────────────
  {
    key: 'SD-EVA-QA-AUDIT-R2-TRUTH-001',
    title: 'Round 2 Audit: Phase 1 — The Truth (Stages 1-5)',
    r1_key: 'SD-EVA-QA-AUDIT-TRUTH-001',
    r1_score: R1_SCORES.TRUTH,
    scope: 'Phase 1: Stages 1-5 (Opportunity Discovery through Market Validation)',
    description: `Re-audit Phase 1 (The Truth, Stages 1-5) to verify remediation effectiveness and catch new issues.

Round 1 counterpart: SD-EVA-QA-AUDIT-TRUTH-001
Round 1 score: N/A (report not generated in R1)

Audit scope:
- Stage 1: Opportunity Discovery
- Stage 2: Idea Intake & Tagging
- Stage 3: Problem-Solution Fit
- Stage 4: Market Sizing
- Stage 5: Market Validation

${R2_TEMPLATE}
${GOLD_STANDARDS}`,
    priority: 'critical',
    tier: 1,
    blocks: [],
    blocked_by: []
  },
  {
    key: 'SD-EVA-QA-AUDIT-R2-ENGINE-001',
    title: 'Round 2 Audit: Phase 2 — The Engine (Stages 6-9)',
    r1_key: 'SD-EVA-QA-AUDIT-ENGINE-001',
    r1_score: R1_SCORES.ENGINE,
    scope: 'Phase 2: Stages 6-9 (Risk Assessment through Competitive Moat)',
    description: `Re-audit Phase 2 (The Engine, Stages 6-9) to verify remediation effectiveness and catch new issues.

Round 1 counterpart: SD-EVA-QA-AUDIT-ENGINE-001
Round 1 score: 62/100

Key R1 findings to verify:
- CRITICAL-1: Reality gate 9->10 validates wrong artifacts (fix: SD-EVA-FIX-REALITY-GATES-001)
- CRITICAL-2: Risk threshold triple-inconsistency (fix: SD-EVA-FIX-KILL-GATES-001)
- HIGH-1/2/5: Stage 6 missing Architecture v2.0 fields (fix: SD-EVA-FIX-TEMPLATE-ALIGN-001)

${R2_TEMPLATE}
${GOLD_STANDARDS}`,
    priority: 'critical',
    tier: 1,
    blocks: [],
    blocked_by: []
  },
  {
    key: 'SD-EVA-QA-AUDIT-R2-IDENTITY-001',
    title: 'Round 2 Audit: Phase 3 — The Identity (Stages 10-12)',
    r1_key: 'SD-EVA-QA-AUDIT-IDENTITY-001',
    r1_score: R1_SCORES.IDENTITY,
    scope: 'Phase 3: Stages 10-12 (Brand Foundation through Go-to-Market)',
    description: `Re-audit Phase 3 (The Identity, Stages 10-12) to verify remediation effectiveness and catch new issues.

Round 1 counterpart: SD-EVA-QA-AUDIT-IDENTITY-001
Round 1 score: 60/100

Key R1 findings to verify:
- 10 missing template fields (fix: SD-EVA-FIX-TEMPLATE-ALIGN-001)
- Stage 12 dual-gate coordination (fix: SD-EVA-FIX-REALITY-GATES-001)
- Chairman blocking point at Stage 10 (fix: SD-EVA-FIX-CHAIRMAN-GATES-001)

${R2_TEMPLATE}
${GOLD_STANDARDS}`,
    priority: 'critical',
    tier: 1,
    blocks: [],
    blocked_by: []
  },
  {
    key: 'SD-EVA-QA-AUDIT-R2-BLUEPRINT-001',
    title: 'Round 2 Audit: Phase 4 — The Blueprint (Stages 13-16)',
    r1_key: 'SD-EVA-QA-AUDIT-BLUEPRINT-001',
    r1_score: R1_SCORES.BLUEPRINT,
    scope: 'Phase 4: Stages 13-16 (Feature Prioritization through Technical Architecture)',
    description: `Re-audit Phase 4 (The Blueprint, Stages 13-16) to verify remediation effectiveness and catch new issues.

Round 1 counterpart: SD-EVA-QA-AUDIT-BLUEPRINT-001
Round 1 score: ~50/100 (estimated from 27 findings: 2 CRITICAL, 9 HIGH)

Key R1 findings to verify:
- CRITICAL: Stage 15 scope mismatch — Risk Register vs Resource Planning (fix: SD-EVA-FIX-STAGE15-RISK-001)
- Stage 13 kill gate missing 'now'-priority check (fix: SD-EVA-FIX-KILL-GATES-001)
- Stages 14, 16 missing Architecture v2.0 fields (fix: SD-EVA-FIX-TEMPLATE-ALIGN-001)

${R2_TEMPLATE}
${GOLD_STANDARDS}`,
    priority: 'critical',
    tier: 1,
    blocks: [],
    blocked_by: []
  },
  {
    key: 'SD-EVA-QA-AUDIT-R2-BUILDLOOP-001',
    title: 'Round 2 Audit: Phase 5 — The Build Loop (Stages 17-22)',
    r1_key: 'SD-EVA-QA-AUDIT-BUILDLOOP-001',
    r1_score: R1_SCORES.BUILDLOOP,
    scope: 'Phase 5: Stages 17-22 (MVP Build through Release Management)',
    description: `Re-audit Phase 5 (The Build Loop, Stages 17-22) to verify remediation effectiveness and catch new issues.

Round 1 counterpart: SD-EVA-QA-AUDIT-BUILDLOOP-001
Round 1 score: 45/100

Key R1 findings to verify:
- 8 fields using typeof instead of enum arrays (fix: SD-EVA-FIX-ENUM-NAMING-001)
- 13 missing template fields + 5 decision objects (fix: SD-EVA-FIX-TEMPLATE-ALIGN-001)
- Chairman blocking point at Stage 22 (fix: SD-EVA-FIX-CHAIRMAN-GATES-001)

${R2_TEMPLATE}
${GOLD_STANDARDS}`,
    priority: 'critical',
    tier: 1,
    blocks: [],
    blocked_by: []
  },
  {
    key: 'SD-EVA-QA-AUDIT-R2-LAUNCH-001',
    title: 'Round 2 Audit: Phase 6 — Launch & Learn (Stages 23-25)',
    r1_key: 'SD-EVA-QA-AUDIT-LAUNCH-001',
    r1_score: R1_SCORES.LAUNCH,
    scope: 'Phase 6: Stages 23-25 (Launch Execution through Post-Launch Review)',
    description: `Re-audit Phase 6 (Launch & Learn, Stages 23-25) to verify remediation effectiveness and catch new issues.

Round 1 counterpart: SD-EVA-QA-AUDIT-LAUNCH-001
Round 1 score: 62/100

Key R1 findings to verify:
- Stage 23 kill gate missing Stage 22 prerequisite (fix: SD-EVA-FIX-KILL-GATES-001)
- Stage 25 decision routing (5 outcomes) (fix: SD-EVA-FIX-POST-LAUNCH-001)
- Launch template gaps Stages 23-24 (fix: SD-EVA-FIX-TEMPLATE-ALIGN-001)
- Chairman blocking point at Stage 25 (fix: SD-EVA-FIX-CHAIRMAN-GATES-001)

${R2_TEMPLATE}
${GOLD_STANDARDS}`,
    priority: 'critical',
    tier: 1,
    blocks: [],
    blocked_by: []
  },
  {
    key: 'SD-EVA-QA-AUDIT-R2-INFRA-001',
    title: 'Round 2 Audit: Infrastructure Quality',
    r1_key: 'SD-EVA-QA-AUDIT-INFRA-001',
    r1_score: R1_SCORES.INFRA,
    scope: 'Infrastructure: Event bus, CLI, handlers, retry logic, error matching',
    description: `Re-audit infrastructure quality to verify remediation effectiveness and catch new issues.

Round 1 counterpart: SD-EVA-QA-AUDIT-INFRA-001
Round 1 score: 58/100

Key R1 findings to verify:
- CRIT-001: Retry logic dead code in event-router.js (fix: SD-EVA-FIX-INFRA-BUGS-001)
- CRIT-002: CLI argument parsing lacks validation (fix: SD-EVA-FIX-INFRA-BUGS-001)
- CRIT-003: Wrong column reference in decision-submitted.js (fix: SD-EVA-FIX-INFRA-BUGS-001)
- HIGH-005: String-based error matching (fix: SD-EVA-FIX-INFRA-BUGS-001)

${R2_TEMPLATE}
${GOLD_STANDARDS}`,
    priority: 'high',
    tier: 1,
    blocks: [],
    blocked_by: []
  },
  {
    key: 'SD-EVA-QA-AUDIT-R2-DBSCHEMA-001',
    title: 'Round 2 Audit: Database Schema',
    r1_key: 'SD-EVA-QA-AUDIT-DBSCHEMA-001',
    r1_score: R1_SCORES.DBSCHEMA,
    scope: 'Database: Schema normalization, ENUM types, RLS policies, gate constraints, data contracts',
    description: `Re-audit database schema to verify remediation effectiveness and catch new issues.

Round 1 counterpart: SD-EVA-QA-AUDIT-DBSCHEMA-001
Round 1 score: 42/100

Key R1 findings to verify:
- CRIT-001: Missing structured stage storage (fix: SD-EVA-FIX-DB-SCHEMA-001)
- CRIT-002: Missing 16 PostgreSQL ENUM types (fix: SD-EVA-FIX-DB-SCHEMA-001)
- HIGH-001: USING (TRUE) RLS policies (fix: SD-EVA-FIX-DB-SCHEMA-001)
- HIGH-002: Missing stage-specific gate constraints (fix: SD-EVA-FIX-DB-SCHEMA-001)

${R2_TEMPLATE}
${GOLD_STANDARDS}`,
    priority: 'high',
    tier: 1,
    blocks: [],
    blocked_by: []
  },
  {
    key: 'SD-EVA-QA-AUDIT-R2-PRD-EXEC-001',
    title: 'Round 2 Audit: PRD-EXEC Gap Analysis',
    r1_key: 'SD-EVA-QA-AUDIT-PRD-EXEC-001',
    r1_score: R1_SCORES['PRD-EXEC'],
    scope: 'PRD-EXEC: Gap between planned requirements and actual implementation',
    description: `Re-audit PRD-EXEC gap to verify remediation effectiveness and catch new issues.

Round 1 counterpart: SD-EVA-QA-AUDIT-PRD-EXEC-001
Round 1 score: N/A (report not generated in R1)

Audit scope:
- Compare PRD requirements against actual implementation
- Verify all PRD acceptance criteria are met
- Check for scope creep or missing features
- Validate implementation matches architectural decisions

${R2_TEMPLATE}
${GOLD_STANDARDS}`,
    priority: 'high',
    tier: 1,
    blocks: [],
    blocked_by: []
  },

  // ── Tier 2: Dependent on phase audits (3 SDs) ────────────────────────────────
  {
    key: 'SD-EVA-QA-AUDIT-R2-CROSSCUT-001',
    title: 'Round 2 Audit: Cross-Cutting Consistency',
    r1_key: 'SD-EVA-QA-AUDIT-CROSSCUT-001',
    r1_score: R1_SCORES.CROSSCUT,
    scope: 'Cross-cutting: Error handling, logging, utility dedup, DI naming, field naming',
    description: `Re-audit cross-cutting consistency to verify remediation effectiveness and catch new issues.

Round 1 counterpart: SD-EVA-QA-AUDIT-CROSSCUT-001
Round 1 score: 38/100

Key R1 findings to verify:
- CRIT-001: 25 identical copies of parseJSON (fix: SD-EVA-FIX-UTILITY-DEDUP-001)
- CRIT-002: No ServiceError adoption, 119 files use throw new Error (fix: SD-EVA-FIX-ERROR-LOGGING-001)
- CRIT-003: No logging injection, 68 files (fix: SD-EVA-FIX-ERROR-LOGGING-001)
- HIGH-001: Silent catch blocks, 12+ files (fix: SD-EVA-FIX-ERROR-LOGGING-001)
- HIGH-003: DI parameter naming db->supabase (fix: SD-EVA-FIX-ENUM-NAMING-001)

Blocked by: Phase 1-6 audits (needs phase audit results for cross-cutting analysis).

${R2_TEMPLATE}
${GOLD_STANDARDS}`,
    priority: 'high',
    tier: 2,
    blocks: [],
    blocked_by: [
      'SD-EVA-QA-AUDIT-R2-TRUTH-001',
      'SD-EVA-QA-AUDIT-R2-ENGINE-001',
      'SD-EVA-QA-AUDIT-R2-IDENTITY-001',
      'SD-EVA-QA-AUDIT-R2-BLUEPRINT-001',
      'SD-EVA-QA-AUDIT-R2-BUILDLOOP-001',
      'SD-EVA-QA-AUDIT-R2-LAUNCH-001'
    ]
  },
  {
    key: 'SD-EVA-QA-AUDIT-R2-VISION-001',
    title: 'Round 2 Audit: Vision v4.7 Compliance',
    r1_key: 'SD-EVA-QA-AUDIT-VISION-001',
    r1_score: R1_SCORES.VISION,
    scope: 'Vision compliance: Chairman governance, stage naming, gate placement, lifecycle alignment',
    description: `Re-audit Vision v4.7 compliance to verify remediation effectiveness and catch new issues.

Round 1 counterpart: SD-EVA-QA-AUDIT-VISION-001
Round 1 score: 72/100

Key R1 findings to verify:
- CRIT-001: 3 missing Chairman blocking points at stages 10, 22, 25 (fix: SD-EVA-FIX-CHAIRMAN-GATES-001)
- HIGH-001: Gate 20->21 in wrong position (fix: SD-EVA-FIX-REALITY-GATES-001)
- HIGH-002: Stage naming mismatches (fix: SD-EVA-FIX-DOSSIER-REBUILD-001)

Blocked by: Phase 1-6 audits (needs phase results for vision compliance cross-reference).

${R2_TEMPLATE}
${GOLD_STANDARDS}`,
    priority: 'high',
    tier: 2,
    blocks: [],
    blocked_by: [
      'SD-EVA-QA-AUDIT-R2-TRUTH-001',
      'SD-EVA-QA-AUDIT-R2-ENGINE-001',
      'SD-EVA-QA-AUDIT-R2-IDENTITY-001',
      'SD-EVA-QA-AUDIT-R2-BLUEPRINT-001',
      'SD-EVA-QA-AUDIT-R2-BUILDLOOP-001',
      'SD-EVA-QA-AUDIT-R2-LAUNCH-001'
    ]
  },
  {
    key: 'SD-EVA-QA-AUDIT-R2-DOSSIER-001',
    title: 'Round 2 Audit: Dossier Reconciliation',
    r1_key: 'SD-EVA-QA-AUDIT-DOSSIER-001',
    r1_score: R1_SCORES.DOSSIER,
    scope: 'Dossier system: Completeness, naming, phase grouping, archive status',
    description: `Re-audit dossier reconciliation to verify remediation effectiveness and catch new issues.

Round 1 counterpart: SD-EVA-QA-AUDIT-DOSSIER-001
Round 1 score: 32/100

Key R1 findings to verify:
- CRITICAL-1: 20 missing dossier structures (fix: SD-EVA-FIX-DOSSIER-REBUILD-001)
- CRITICAL-2: 4 stale stage names (fix: SD-EVA-FIX-DOSSIER-REBUILD-001)
- CRITICAL-3: README claims 100% but only 5/25 exist (fix: SD-EVA-FIX-DOSSIER-REBUILD-001)

Blocked by: Phase 1-6 audits (needs phase results for dossier cross-reference).

${R2_TEMPLATE}
${GOLD_STANDARDS}`,
    priority: 'high',
    tier: 2,
    blocks: [],
    blocked_by: [
      'SD-EVA-QA-AUDIT-R2-TRUTH-001',
      'SD-EVA-QA-AUDIT-R2-ENGINE-001',
      'SD-EVA-QA-AUDIT-R2-IDENTITY-001',
      'SD-EVA-QA-AUDIT-R2-BLUEPRINT-001',
      'SD-EVA-QA-AUDIT-R2-BUILDLOOP-001',
      'SD-EVA-QA-AUDIT-R2-LAUNCH-001'
    ]
  }
];

// ─── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Creating EVA Comprehensive Audit Round 2 SDs ===\n');
  console.log('Round 1 avg score: ~53/100 across 10 areas');
  console.log('Remediation: 11/12 children merged (~2,370 LOC across 18 PRs)');
  console.log('Structure: 1 orchestrator + 12 children (9 Tier 1 + 3 Tier 2)\n');

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
      category: 'EVA Quality',
      title: 'EVA Comprehensive Audit Round 2: Post-Remediation Validation',
      description: `Orchestrator for Round 2 re-audit of all 12 EVA audit areas after remediation.

Round 1 (${R1_ORCH_KEY}) produced 157 findings across 12 areas.
Remediation (SD-EVA-REMEDIATION-ORCH-001) addressed findings with 12 child SDs — 11/12 merged (~2,370 LOC, 18 PRs).

Round 2 re-audits all 12 areas to:
1. Verify remediation effectiveness (before/after scoring)
2. Catch new issues introduced by the fixes
3. Identify any Round 1 findings that regressed or were missed

Structure:
  Tier 1 (9 SDs, parallel): Truth, Engine, Identity, Blueprint, BuildLoop, Launch, Infrastructure, DB Schema, PRD-EXEC Gap
  Tier 2 (3 SDs, sequential): Cross-Cutting, Vision, Dossier — blocked by 6 phase audits

${GOLD_STANDARDS}`,
      scope: 'Re-audit all 12 EVA areas post-remediation with enhanced before/after scoring',
      rationale: 'Round 1 audit found 157 findings (avg score 53/100). Remediation addressed these across 11 merged PRs. Round 2 validates that fixes are effective, catches regressions, and identifies new issues.',
      success_criteria: [
        { measure: 'All 12 areas re-audited', criterion: '12/12 audit reports generated with R2 scores' },
        { measure: 'Score improvement', criterion: 'Average R2 score > R1 average (53/100)' },
        { measure: 'Remediation verification', criterion: 'Each R1 finding has FIXED/PARTIALLY FIXED/NOT FIXED/REGRESSED status' },
        { measure: 'Regression detection', criterion: 'Any regressions identified and flagged' }
      ],
      risks: [
        { risk: 'Some R1 fixes may have introduced new issues', mitigation: 'Explicit "New Findings" section in each R2 report' },
        { risk: 'Template-Align child still in progress', mitigation: 'R2 audit captures current state regardless' }
      ],
      stakeholders: ['Chairman'],
      implementation_guidelines: [
        'Reference docs/audits/eva-comprehensive/ for R1 baseline reports',
        'Reference docs/audits/eva-comprehensive-r2/ for R2 output',
        'Use same methodology and gold standards as R1',
        'Enhanced reporting: R1 comparison + remediation verification + new findings + net delta'
      ],
      key_changes: [{ change: 'Post-remediation validation audit', impact: 'Confirms EVA compliance improvement and catches regressions' }],
      key_principles: ['Same methodology as R1', 'Enhanced reporting with before/after', 'Every R1 finding gets a status'],
      success_metrics: [
        { metric: 'Children completed', target: '12/12', actual: '0/12' },
        { metric: 'Average R2 score', target: '>53/100', actual: null },
        { metric: 'R1 findings verified', target: '157/157', actual: null }
      ],
      metadata: {
        round: 2,
        round1_orchestrator: R1_ORCH_KEY,
        remediation_orchestrator: 'SD-EVA-REMEDIATION-ORCH-001',
        r1_average_score: 53
      },
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

  // 2. Insert children
  const childResults = [];
  for (const child of children) {
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
      category: 'EVA Quality',
      title: child.title,
      description: child.description,
      scope: child.scope,
      parent_sd_id: ORCH_KEY,
      rationale: `Part of EVA Audit Round 2 orchestrator (${ORCH_KEY}). Re-audits ${child.scope} post-remediation.`,
      success_criteria: [
        { measure: 'Audit report generated', criterion: 'Complete R2 audit report with all 4 enhanced sections' },
        { measure: 'R1 findings verified', criterion: 'Every R1 finding has FIXED/PARTIALLY FIXED/NOT FIXED/REGRESSED status' },
        { measure: 'Score comparison', criterion: 'R1 vs R2 score table included' }
      ],
      risks: [],
      stakeholders: ['Chairman'],
      implementation_guidelines: [
        'Use same methodology and gold standards as Round 1',
        `Round 1 counterpart: ${child.r1_key}`,
        `Round 1 score: ${child.r1_score !== null ? child.r1_score + '/100' : 'N/A (no R1 report)'}`,
        'Output report to docs/audits/eva-comprehensive-r2/'
      ],
      key_changes: [{ change: `Re-audit: ${child.scope}`, impact: 'Validates remediation effectiveness' }],
      key_principles: ['Same methodology as R1', 'Enhanced reporting with before/after comparison'],
      success_metrics: [
        { metric: 'R1 score', target: child.r1_score !== null ? `${child.r1_score}/100` : 'N/A', actual: null },
        { metric: 'R2 score', target: 'Improvement over R1', actual: null }
      ],
      metadata: {
        round: 2,
        round1_sd_key: child.r1_key,
        round1_score: child.r1_score,
        audit_area: child.scope
      },
      dependencies: {
        blocks: child.blocks,
        blocked_by: child.blocked_by
      },
      smoke_test_steps: [],
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
  console.log(`Tier 2: ${t2.length} (blocked by 6 phase audits)`);

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

  // 5. R1 score summary
  console.log('\n=== Round 1 Baseline Scores ===');
  for (const [area, score] of Object.entries(R1_SCORES)) {
    console.log(`  ${area}: ${score !== null ? score + '/100' : 'N/A'}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
