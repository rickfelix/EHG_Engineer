/**
 * Insert EVA Comprehensive Audit orchestrator + 12 child SDs
 * One-time script. Run: node scripts/one-time/insert-eva-audit-sds.cjs
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ORCH_KEY = 'SD-EVA-QA-AUDIT-ORCH-001';

const GOLD_STANDARD = `
Gold standard documents:
- docs/plans/eva-venture-lifecycle-vision.md (v4.7) — Section 5: Stage Inventory
- docs/plans/eva-platform-architecture.md (v1.6) — Section 8: 25-Stage Lifecycle Specifications
`;

const AUDIT_TEMPLATE = `
Per-Stage Audit Checklist:
A. Spec Compliance: Schema fields (NEW/CHANGED), field types/constraints, gate logic, analysisStep inputs/outputs, cross-stage contracts
B. Code Quality: Error handling pattern, logging pattern, input validation depth, LLM output validation, test coverage
C. Vision Alignment: Automation level, gate type, key output
D. Findings Summary: Gap table (field, spec, actual, severity), enhancement table, remediation recommendations
`;

const children = [
  // Tier 1 — no dependencies
  {
    key: 'SD-EVA-QA-AUDIT-TRUTH-001',
    title: 'EVA Audit: Phase 1 — THE TRUTH (Stages 1-5)',
    description: `Audit stages 1-5 against Architecture Section 8.1.\nStages: stage-01 (Idea Capture), stage-02 (Problem Validation), stage-03 (Market Sizing), stage-04 (Competitive Landscape), stage-05 (Founder-Market Fit).\nFiles: lib/eva/stages/stage-01/ through stage-05/\n${AUDIT_TEMPLATE}\n${GOLD_STANDARD}`,
    scope: 'Stages 1-5 spec compliance, code quality, and vision alignment audit',
    tier: 1
  },
  {
    key: 'SD-EVA-QA-AUDIT-ENGINE-001',
    title: 'EVA Audit: Phase 2 — THE ENGINE (Stages 6-9)',
    description: `Audit stages 6-9 against Architecture Section 8.2.\nStages: stage-06 (Business Model Design), stage-07 (Unit Economics), stage-08 (Revenue Model), stage-09 (Pricing Strategy).\nFiles: lib/eva/stages/stage-06/ through stage-09/\n${AUDIT_TEMPLATE}\n${GOLD_STANDARD}`,
    scope: 'Stages 6-9 spec compliance, code quality, and vision alignment audit',
    tier: 1
  },
  {
    key: 'SD-EVA-QA-AUDIT-IDENTITY-001',
    title: 'EVA Audit: Phase 3 — THE IDENTITY (Stages 10-12)',
    description: `Audit stages 10-12 against Architecture Section 8.3.\nStages: stage-10 (Brand Strategy), stage-11 (Positioning), stage-12 (Messaging Framework).\nFiles: lib/eva/stages/stage-10/ through stage-12/\n${AUDIT_TEMPLATE}\n${GOLD_STANDARD}`,
    scope: 'Stages 10-12 spec compliance, code quality, and vision alignment audit',
    tier: 1
  },
  {
    key: 'SD-EVA-QA-AUDIT-BLUEPRINT-001',
    title: 'EVA Audit: Phase 4 — THE BLUEPRINT (Stages 13-16)',
    description: `Audit stages 13-16 against Architecture Section 8.4.\nStages: stage-13 (Product Requirements), stage-14 (Technical Architecture), stage-15 (MVP Scope), stage-16 (Development Roadmap).\nFiles: lib/eva/stages/stage-13/ through stage-16/\n${AUDIT_TEMPLATE}\n${GOLD_STANDARD}`,
    scope: 'Stages 13-16 spec compliance, code quality, and vision alignment audit',
    tier: 1
  },
  {
    key: 'SD-EVA-QA-AUDIT-BUILDLOOP-001',
    title: 'EVA Audit: Phase 5 — THE BUILD LOOP (Stages 17-22)',
    description: `Audit stages 17-22 against Architecture Section 8.5.\nStages: stage-17 (Sprint Planning), stage-18 (Implementation), stage-19 (Testing), stage-20 (Code Review), stage-21 (Deployment), stage-22 (Iteration Review).\nFiles: lib/eva/stages/stage-17/ through stage-22/\n${AUDIT_TEMPLATE}\n${GOLD_STANDARD}`,
    scope: 'Stages 17-22 spec compliance, code quality, and vision alignment audit',
    tier: 1
  },
  {
    key: 'SD-EVA-QA-AUDIT-LAUNCH-001',
    title: 'EVA Audit: Phase 6 — LAUNCH & LEARN (Stages 23-25)',
    description: `Audit stages 23-25 against Architecture Section 8.6.\nStages: stage-23 (Launch Preparation), stage-24 (Go-to-Market), stage-25 (Post-Launch Review).\nFiles: lib/eva/stages/stage-23/ through stage-25/\n${AUDIT_TEMPLATE}\n${GOLD_STANDARD}`,
    scope: 'Stages 23-25 spec compliance, code quality, and vision alignment audit',
    tier: 1
  },
  {
    key: 'SD-EVA-QA-AUDIT-INFRA-001',
    title: 'EVA Audit: Infrastructure Quality',
    description: `Audit EVA infrastructure components:\n- Event bus: lib/eva/event-bus/ (event-router, handler-registry, 4 handlers)\n- CLI: scripts/eva-run.js\n- Chairman decision watcher\n- Test coverage across all EVA modules\n\nKey findings to validate:\n- Retryability conflict (event-router string-matches vs .retryable flag)\n- 0 unit tests for event bus\n- 0 tests for chairman decision watcher\n- DI parameter naming (db vs supabase)\n${GOLD_STANDARD}`,
    scope: 'Event bus, CLI, chairman API, and test coverage audit',
    tier: 1
  },
  {
    key: 'SD-EVA-QA-AUDIT-DBSCHEMA-001',
    title: 'EVA Audit: Database Schema Compliance',
    description: `Compare actual database tables/columns against Architecture Section 8 target schemas.\n- Check all (NEW) fields were implemented in migrations\n- Check all (CHANGED) fields have correct types/constraints\n- Verify table naming consistency (3+ table names for stage data)\n- Check fallback ordering between handlers\nFiles: database/migrations/, lib/eva/stages/*/\n${GOLD_STANDARD}`,
    scope: 'Database tables and columns vs Architecture Section 8 target schemas',
    tier: 1
  },
  {
    key: 'SD-EVA-QA-AUDIT-PRD-EXEC-001',
    title: 'EVA Audit: PRD-EXEC Retroactive Gap',
    description: `All 33 Phase A-E SDs were built BEFORE PRD field consumption wiring (PR #1222, Feb 13).\nEXEC phases ran without reading integration sections, risks, acceptance criteria, or ~26 other PRD fields.\n\nAudit scope:\n- Query product_requirements_v2 for all EVA SD PRDs\n- Check which PRD fields contain substantive content vs boilerplate\n- Identify what EXEC phases missed by not consuming PRD fields\n- Assess impact: did missing field consumption lead to implementation gaps?\n\nReference:\n- SD-LEO-INFRA-PRD-INTEGRATION-SECTION-001 (PR #840)\n- SD-LEO-INFRA-PRD-FIELD-CONSUMPTION-001 (PR #1222)\n- Key files: scripts/modules/handoff/executors/plan-to-exec/gates/integration-section-validation.js\n${GOLD_STANDARD}`,
    scope: '33 EVA SDs built before PRD wiring — assess impact on delivered code',
    tier: 1
  },
  // Tier 2 — depend on children 1-6 (phase audits)
  {
    key: 'SD-EVA-QA-AUDIT-CROSSCUT-001',
    title: 'EVA Audit: Cross-Cutting Consistency',
    description: `Synthesize findings from all 6 phase audits (children 1-6) into cross-cutting analysis.\n\nFocus areas:\n- Error handling: 3 competing patterns (throw Error, ServiceError, result-object) — which stages use which?\n- Logging: 4 competing patterns — map per stage\n- parseJSON() duplicated 25 times — identical function copy-pasted\n- Utility functions: shared vs duplicated\n- Export patterns: consistency across modules\n- DI patterns: parameter naming conventions\n\nInput: Findings from phase-1 through phase-6 audit reports in docs/audits/eva-comprehensive/\n${GOLD_STANDARD}`,
    scope: 'Error handling, logging, utilities, exports, DI pattern consistency',
    tier: 2
  },
  {
    key: 'SD-EVA-QA-AUDIT-VISION-001',
    title: 'EVA Audit: Vision Compliance',
    description: `Synthesize findings from all 6 phase audits (children 1-6) into vision compliance report.\n\nCompare implementation against Vision v4.7 Section 5:\n- Automation levels: Each stage specifies fully automated vs chairman-blocks\n- Gate types: kill/reality/promotion/chairman decision per stage\n- Chairman involvement: Where Chairman must approve vs auto-advance\n- Key outputs: Each stage lists expected key output — verify produced\n\nInput: Findings from phase-1 through phase-6 audit reports in docs/audits/eva-comprehensive/\nGold standard: docs/plans/eva-venture-lifecycle-vision.md (v4.7)`,
    scope: 'Automation levels, gate types, Chairman involvement vs Vision v4.7',
    tier: 2
  },
  {
    key: 'SD-EVA-QA-AUDIT-DOSSIER-001',
    title: 'EVA Audit: Dossier Reconciliation',
    description: `Verify 25 stage dossiers match current 25-stage reality.\n\nScope:\n- docs/guides/workflow/dossiers/ — 25 directories\n- Check each dossier for stale 40-stage era content (original architecture had 40 stages, reduced to 25)\n- Verify stage numbering matches current architecture\n- Check stage names/descriptions match Vision v4.7\n- Flag any dossiers referencing removed stages or old numbering\n\nInput: Findings from phase-1 through phase-6 audit reports in docs/audits/eva-comprehensive/\n${GOLD_STANDARD}`,
    scope: '25 dossier freshness check, flag stale 40-stage content',
    tier: 2
  }
];

async function main() {
  console.log('=== Creating EVA Comprehensive Audit SDs ===\n');

  // 1. Check if orchestrator already exists, insert if not
  const { data: existingOrch } = await db
    .from('strategic_directives_v2')
    .select('uuid_id,sd_key')
    .eq('sd_key', ORCH_KEY)
    .single();

  if (existingOrch) {
    console.log(`Orchestrator already exists: ${existingOrch.sd_key} (uuid: ${existingOrch.uuid_id})`);
    var orch = existingOrch;
  } else {

  const orchData = {
    id: ORCH_KEY,
    sd_key: ORCH_KEY,
    sd_type: 'orchestrator',
    status: 'draft',
    priority: 'critical',
    current_phase: 'LEAD_APPROVAL',
    category: 'Quality Assurance',
    title: 'EVA Comprehensive Audit: Vision & Architecture Compliance',
    description: `Orchestrator for comprehensive EVA audit. 12 children across 2 tiers.\n\nTier 1 (9 SDs, no dependencies): 6 phase audits + infrastructure + DB schema + PRD-EXEC gap\nTier 2 (3 SDs, depend on phase audits): Cross-cutting + Vision compliance + Dossier reconciliation\n\nOutput: docs/audits/eva-comprehensive/\n${GOLD_STANDARD}`,
    scope: 'Full EVA venture lifecycle audit: 25 stages, infrastructure, DB schema, PRD gap, cross-cutting patterns',
    rationale: 'EVA venture lifecycle (33 SDs) built rapidly across 6 days by multiple orchestrator children. Patterns diverged. All Phase A-E SDs built before PRD field consumption wiring. Comprehensive audit validates implementation against gold standard (Vision v4.7 + Architecture v1.6).',
    success_criteria: [
      { measure: 'Phase audits complete', criterion: 'All 6 phases (25 stages) audited against Architecture Section 8' },
      { measure: 'Infrastructure audited', criterion: 'Event bus, CLI, chairman API, test coverage assessed' },
      { measure: 'DB schema validated', criterion: 'All (NEW)/(CHANGED) fields verified against target schemas' },
      { measure: 'PRD-EXEC gap assessed', criterion: '33 SDs checked for impact of missing PRD field consumption' },
      { measure: 'Cross-cutting report', criterion: 'Error handling, logging, utility patterns cataloged' },
      { measure: 'Vision compliance report', criterion: 'Automation levels and gate types verified vs Vision v4.7' },
      { measure: 'Dossiers reconciled', criterion: '25 dossiers checked for stale 40-stage content' }
    ],
    risks: [{ risk: 'Large audit scope', mitigation: 'Parallelized across 9 independent Tier 1 children' }],
    stakeholders: ['Chairman'],
    implementation_guidelines: ['Use docs/audits/eva-comprehensive/ for all output', 'Reference Architecture Section 8 as gold standard'],
    key_changes: [{ change: 'Comprehensive EVA audit', impact: 'Identifies all gaps between spec and implementation' }],
    key_principles: ['Spec compliance first', 'Vision alignment second', 'Cross-cutting consistency third'],
    success_metrics: [
      { metric: 'Stages audited', target: '25/25', actual: null },
      { metric: 'Children completed', target: '12/12', actual: '0/12' }
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
  console.log(`Orchestrator: ${orch.sd_key} (uuid: ${orch.uuid_id})`);
  } // end else

  // Use orch from either path
  if (!orch && !existingOrch) { console.error('No orchestrator!'); process.exit(1); }
  var orchRef = orch || existingOrch;

  // 2. Insert children
  const childResults = [];
  for (const child of children) {
    const childData = {
      id: child.key,
      sd_key: child.key,
      sd_type: 'infrastructure',
      status: 'draft',
      priority: 'high',
      current_phase: 'LEAD_APPROVAL',
      category: 'Quality Assurance',
      title: child.title,
      description: child.description,
      scope: child.scope,
      parent_sd_id: ORCH_KEY,
      rationale: 'Part of EVA Comprehensive Audit orchestrator. Validates implementation against gold standard documents.',
      success_criteria: [{ measure: 'Audit complete', criterion: `${child.scope} — findings documented in docs/audits/eva-comprehensive/` }],
      risks: [],
      stakeholders: ['Chairman'],
      implementation_guidelines: [],
      key_changes: [{ change: child.title, impact: 'Identifies gaps in EVA implementation' }],
      key_principles: ['Spec compliance audit', 'Document all findings'],
      success_metrics: [{ metric: 'Audit complete', target: 'All findings documented', actual: null }],
      smoke_test_steps: [],
      dependencies: child.tier === 1 ? { blocks: [], blocked_by: [] } : undefined,
      is_active: true,
      created_by: 'claude-engineer'
    };

    const { data: result, error: childErr } = await db
      .from('strategic_directives_v2')
      .insert(childData)
      .select('uuid_id,sd_key')
      .single();

    if (childErr) {
      console.error(`Failed to insert ${child.key}:`, childErr.message);
      continue;
    }
    childResults.push({ ...result, tier: child.tier });
    console.log(`  Child ${child.tier === 1 ? 'T1' : 'T2'}: ${result.sd_key} (uuid: ${result.uuid_id})`);
  }

  // 3. Set up Tier 2 dependencies (blocked by children 1-6 = phase audits)
  const phaseAuditKeys = childResults
    .filter(c => c.tier === 1 && c.sd_key.match(/TRUTH|ENGINE|IDENTITY|BLUEPRINT|BUILDLOOP|LAUNCH/))
    .map(c => c.sd_key);

  const tier2Children = childResults.filter(c => c.tier === 2);

  for (const t2 of tier2Children) {
    const deps = {
      blocks: [],
      blocked_by: phaseAuditKeys
    };
    const { error: depErr } = await db
      .from('strategic_directives_v2')
      .update({ dependencies: deps })
      .eq('sd_key', t2.sd_key);

    if (depErr) {
      console.error(`Failed to set deps for ${t2.sd_key}:`, depErr.message);
    } else {
      console.log(`  Deps: ${t2.sd_key} blocked_by ${phaseAuditKeys.length} phase audits`);
    }
  }

  // 4. Also set the "blocks" field on phase audit children
  const tier2Keys = tier2Children.map(c => c.sd_key);
  for (const phase of childResults.filter(c => c.tier === 1 && c.sd_key.match(/TRUTH|ENGINE|IDENTITY|BLUEPRINT|BUILDLOOP|LAUNCH/))) {
    const deps = {
      blocks: tier2Keys,
      blocked_by: []
    };
    const { error: depErr } = await db
      .from('strategic_directives_v2')
      .update({ dependencies: deps })
      .eq('sd_key', phase.sd_key);

    if (depErr) {
      console.error(`Failed to set blocks for ${phase.sd_key}:`, depErr.message);
    }
  }

  console.log('\n=== Done ===');
  console.log(`Total: 1 orchestrator + ${childResults.length} children`);
  console.log(`Tier 1: ${childResults.filter(c => c.tier === 1).length} (independent)`);
  console.log(`Tier 2: ${childResults.filter(c => c.tier === 2).length} (blocked by phase audits)`);
}

main().catch(console.error);
