import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-D';
const { data: sd } = await sb.from('strategic_directives_v2').select('id,target_application').eq('sd_key', SD_KEY).maybeSingle();
const { data: agent } = await sb.from('leo_sub_agents').select('id,name,code').eq('code', 'VALIDATION').maybeSingle();

const resolution = await resolveSubAgentRepo({
  sdId: sd.id,
  targetApplication: sd.target_application,
  subAgentCode: 'VALIDATION',
  probeExistsRelative: 'lib/eva/lifecycle/exit-gate-verifiers.js',
  supabase: sb,
});

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  validation_mode: 'prospective',
  summary: 'No duplicate SD/PR implements the design-fidelity gate wiring or the experience-review coverage gauge; Tier 3 is correct (migrations + gate wiring force it regardless of LOC). Two conditions block a clean pass: (1) a last-writer-wins CHECK-constraint collision between this SD second experience-review migration and sibling -A already-applied migration; (2) FR-3 stated outcome is falsified live - scoreWireframeFidelity returns no_wireframes, not no_screens, because AltifyAI has no blueprint_wireframes artifact.',
  critical_issues: [
    {
      severity: 'CRITICAL',
      id: 'VAL-D-1',
      issue: 'CHECK-constraint collision with sibling -A (last-writer-wins, silent revocation). database/migrations/20260828_venture_quality_findings_experience_categories.sql (the SECOND experience-review migration named by this SD own scope C3.1 "apply the two experience-review migrations") and database/migrations/20260913_venture_quality_findings_capa_baseline_categories.sql (sibling -A, commit aa3ca9abd10, whose commit message states it was already applied live via the DATABASE sub-agent) BOTH drop-if-exists and re-add the SAME constraint venture_quality_findings_finding_category_check with NON-UNION value lists. -A grants 10 base + accessibility, performance, responsive. The -D 20260828 file grants 10 base + usability, accessibility, journey_coherence. Applying 20260828 now would SILENTLY REVOKE performance and responsive and break the baseline writer -A just landed. Both files assert "Additive-only: every existing accepted value stays accepted" - true only against the 10-value baseline each was authored against, FALSE against each other.',
      recommendation: 'Do NOT apply 20260828 as written. PLAN must author a single union-valued migration granting all 15 values (10 base + usability, accessibility, journey_coherence, performance, responsive) and coordinate with -A, or explicitly drop the second migration from scope with a written reason.',
    },
  ],
  warnings: [
    {
      severity: 'HIGH',
      issue: 'FR-3 expected-output premise falsified live. scoreWireframeFidelity (lib/eva/qa/stitch-wireframe-qa.js:325) guards IN ORDER: no Anthropic key -> vision_api_unavailable; getWireframes() reads venture_artifacts artifact_type=blueprint_wireframes is_current -> empty -> no_wireframes; only THEN getExportedScreens() reads stitch_design_export -> no_screens. AltifyAI (50763b6a-1fad-4e1e-b2fc-296a1d66ebf9) has SIX is_current artifacts, ALL stage 1-4 (intake_venture_analysis, truth_idea_brief, truth_validation_decision, truth_competitive_analysis, truth_ai_critique, system_devils_advocate_review) and NO blueprint_wireframes. It therefore returns no_wireframes, NOT no_screens. Fleet-wide: 0 stitch_design_export rows (prompt claim confirmed) but 25 blueprint_wireframes rows exist for OTHER ventures.',
      recommendation: 'Correct the FR-3 acceptance criterion to expect no_wireframes for AltifyAI, or select a venture that actually has a blueprint_wireframes artifact.',
    },
    {
      severity: 'HIGH',
      issue: 'Dead-by-construction risk across FR-2 and FR-3/C3.2. SD scope C3.2 states "fidelity compares against blueprint_wireframes" - AltifyAI has none, so the design-fidelity gate is zero-yield against the very pilot venture it is registered for. FR-2 experience review consumes the Stage-15 experience artifacts (wireframe screens, IA, user-journey) per precedent SD-LEO-FEAT-STAGE-EXPERIENCE-DESIGN-001 item 3 - AltifyAI has none of those either. AltifyAI sits at stage 24 carrying only stage-1-4 artifacts.',
      recommendation: 'PLAN must state explicitly what FR-2/FR-3 are expected to yield on AltifyAI and why an empty but honest result still satisfies the pilot, or select a venture with stage-15 artifacts.',
    },
    {
      severity: 'MEDIUM',
      issue: 'FR-1 scope reduction is undeclared. The SD own scope C3.1 says "the two experience-review migrations" (plural); the LEAD FR list names only 20260828_venture_experience_review_runs.sql. The omitted second file is exactly the one that collides with -A.',
      recommendation: 'PLAN must ratify the reduction in writing or restore the second migration in union-safe form.',
    },
    {
      severity: 'MEDIUM',
      issue: 'Ordering coupling with sibling -E (not a file conflict). -E scope P3.1 requires every non-binding mode to exist as a leo_feature_flags row with enablement_criteria/owner/last_reviewed_at, plus a CI lint that FAILS on any non-binding mechanism outside that registry. FR-4 creates a NEW non-binding mechanism (gates.exit_observe on stage 15). If -E lands first, FR-4 trips the -E CI lint unless -D also registers a flag row.',
      recommendation: 'Add a leo_feature_flags registry row for the new exit_observe gate in the same PR, or sequence -D before -E.',
    },
    {
      severity: 'MEDIUM',
      issue: 'Pre-existing design-fidelity harness not reconciled. lib/eva/bridge/design-fidelity-observe.js already defines DESIGN_FIDELITY_GATE_ID=DESIGN_FIDELITY_LANDING with a gate_witness_events sink and a companion scorer (design-fidelity-scorer.js); tests/unit/eva/bridge/design-input-instructions.test.js carries an explicit in-repo instruction to extend the shipped design-fidelity-observe.js harness and never build a second gate. FR-4 adds a second design-fidelity surface (exit-gate-verifiers + CANDIDATE_GATE_STRINGS). These are arguably distinct surfaces (lifecycle exit gate vs witness recorder), so this is NOT scored as duplicate work - but it is unreconciled.',
      recommendation: 'PLAN must state why the lifecycle exit-gate surface is not a second gate, or extend the existing harness instead.',
    },
    {
      severity: 'LOW',
      issue: 'Sibling status drift vs the LEAD briefing. Live DB: -A is active/PLAN_VERIFICATION (briefed as active/EXEC) and -I is pending_approval/LEAD_FINAL with PR 8912 open (briefed as active/PLAN_VERIFICATION). Both are further along than stated.',
      recommendation: 'Re-read sibling state at PLAN rather than from the LEAD briefing.',
    },
  ],
  recommendations: [
    'Proceed to PLAN. Scope is legitimate and non-duplicate, but PLAN must resolve VAL-D-1 (union-valued constraint migration) before any migration ceremony packet is authored.',
    'Correct the FR-3 acceptance criterion from no_screens to no_wireframes, verified against live AltifyAI artifacts.',
    'Register a leo_feature_flags row for the new stage-15 gates.exit_observe mechanism to stay compatible with sibling -E CI lint.',
  ],
  conditions: [
    { action: 'Resolve the venture_quality_findings_finding_category_check collision with sibling -A via a single union-valued migration before any apply ceremony', priority: 'high', blocking: true },
    { action: 'Correct FR-3 expected status from no_screens to no_wireframes and state the expected yield of FR-2/FR-3 on a venture with no stage-15 artifacts', priority: 'high', blocking: false },
    { action: 'Ratify or reverse the undeclared FR-1 reduction from two migrations to one', priority: 'medium', blocking: false },
  ],
  justification: 'CONDITIONAL_PASS: the duplicate-work check is clean (no other SD or open PR implements the design-fidelity gate wiring or the experience-review coverage gauge) and Tier 3 routing is correct, but two verified defects must be resolved at PLAN: a last-writer-wins CHECK-constraint collision with sibling -A that would silently revoke live-granted values, and a falsified FR-3 outcome premise (no_wireframes, not no_screens) that also exposes dead-by-construction risk for FR-2 and C3.2 against AltifyAI.',
  detailed_analysis: {
    gate: 'GATE 1 - LEAD Pre-Approval',
    a_duplicate_check: {
      verdict: 'CLEAN - no duplicate implementation found',
      sds_scanned: 1000,
      keyword_hits: 12,
      gauge: 'GAUGE_REGISTRY (lib/governance/gauge-registry.js) holds 35 gauge ids; none covers experience-review run coverage. The FR-5 gauge is genuinely new.',
      gate_string: 'CANDIDATE_GATE_STRINGS (lib/eva/lifecycle/bind-criterion-checker.js:25) holds 5 entries (stages 19 and 24 only); no stage-15 entry and no design-fidelity-reviewed string. The FR-4 entry is genuinely new.',
      open_prs: 'Scanned 100 open PRs. Only PR 8912 (sibling -I) is in adjacent territory; it touches no FR-4/FR-5 target file.',
      adjacent_prior_art: 'SD-LEO-FEAT-STAGE-EXPERIENCE-DESIGN-001 (completed) built the stage-20 experience review and the out-of-band annex fallback path FR-2 reuses - correctly reused, not duplicated. lib/eva/bridge/design-fidelity-observe.js + design-fidelity-scorer.js are a pre-existing but DIFFERENT surface (witness recorder, not lifecycle exit gate).',
    },
    b_tier_justification: {
      verdict: 'TIER 3 CONFIRMED CORRECT',
      reasoning: 'CLAUDE.md Work Item Routing forces Tier 3 on risk keywords regardless of LOC. This SD trips Schema (two migrations: venture_experience_review_runs DDL plus a venture_stages.metadata jsonb merge) and gate wiring (a new GATE_VERIFIERS entry plus a new CANDIDATE_GATE_STRINGS entry that changes venture stage-transition behavior). Independently, 5 FRs spanning exit-gate-verifiers.js, bind-criterion-checker.js, gauge-registry.js, gauge-runner.mjs, a new guard module and a new gauge script exceed the 75 LOC Tier 3 threshold on size alone. A quick-fix path would be incorrect.',
    },
    c_sibling_overlap: {
      sibling_A: 'BLOCKING COLLISION on venture_quality_findings_finding_category_check - see critical issue VAL-D-1. Not previously flagged.',
      sibling_I: 'NO file-level overlap. PR 8912 changes 19 files; its stage-15 work is a NEW file (lib/eva/stage-templates/analysis-steps/stage-15-coverage-disposition-reader.js) and its migration is 20260913_venture_screen_disposition_reconciliation.sql. It does not touch exit-gate-verifiers.js, bind-criterion-checker.js, gauge-registry.js, gauge-runner.mjs, or venture_stages metadata. Conceptually adjacent (both add stage-15 readers) but safe to run in parallel.',
      sibling_E: 'ORDERING COUPLING, newly flagged - see the MEDIUM warning on leo_feature_flags / CI lint.',
    },
    premises_verified_live: {
      'FR-1 venture_experience_review_runs unapplied': 'CONFIRMED - PGRST205, table absent from schema cache',
      'FR-4 stage 15 metadata has no gates key': 'CONFIRMED - live value is metrics.invest_compliance=true plus stage_timeout_ms=600000 only',
      'FR-3 zero stitch_design_export fleet-wide': 'CONFIRMED - 0 rows',
      'FR-3 returns no_screens': 'FALSIFIED - returns no_wireframes; AltifyAI has no blueprint_wireframes artifact (25 such rows exist for other ventures)',
      'FR-1 names all experience-review migrations': 'FALSIFIED - a second file exists and is omitted from the FR list',
    },
  },
  metadata: {
    validation_gate: 'GATE_1_LEAD_PRE_APPROVAL',
    phase: 'LEAD-TO-PLAN',
    sd_key: SD_KEY,
    duplicate_found: false,
    tier_3_required: true,
    blocking_findings: 1,
    evidence_files: [
      'database/migrations/20260828_venture_quality_findings_experience_categories.sql',
      'database/migrations/20260913_venture_quality_findings_capa_baseline_categories.sql',
      'lib/eva/qa/stitch-wireframe-qa.js:216,247,325',
      'lib/eva/lifecycle/bind-criterion-checker.js:25',
      'lib/governance/gauge-registry.js',
      'lib/eva/bridge/design-fidelity-observe.js:16',
    ],
  },
  execution_time_ms: 0,
};

applySubAgentRepoVerdict(results, resolution);
const rec = await storeSubAgentResults('VALIDATION', sd.id, agent, results, { phase: 'LEAD-TO-PLAN', sdKey: SD_KEY });
console.log('\nSTORED id=', rec?.id, 'verdict=', rec?.verdict, 'confidence=', rec?.confidence, 'phase=', rec?.phase);
console.log('metadata.repo_path=', rec?.metadata?.repo_path);
console.log('executed_from_cwd=', rec?.metadata?.executed_from_cwd);
