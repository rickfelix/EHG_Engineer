#!/usr/bin/env node
// SD-LEO-ORCH-VENTURE-ORGANIZATION-ADOPT-001 -- parent orchestrator's own PRD.
// Recovery for a documented dispatch-order defect (leo_protocol_sections id=439,
// "Orchestrator Parent Lifecycle"): "the seat claiming its first child" is responsible for
// running the parent's own LEAD-TO-PLAN + PLAN-TO-EXEC (reduced set) BEFORE that child's own
// LEAD-TO-PLAN. This parent was created (by Adam, 49eabb23) after
// SD-LEO-INFRA-ORG-TEST-TEARDOWN-001 was already claimed and advanced past its own
// LEAD-TO-PLAN, so this recovery runs the parent's setup now.
//
// This PRD adds no new decision -- it transcribes the parent SD's own already-chairman-derived
// description/scope/metadata (ratification ee2eaad3, vision VISION-AI-ORGANIZATION-L2-001,
// architecture plan ARCH-AI-ORGANIZATION-001, both chairman_approved=true/status=active,
// verified live) into PRD form, per the parent's own stated purpose: "This document elaborates
// them and adds no decision of its own."
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { createPRDWithValidatedContent } from '../prd/prd-creator.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-ORCH-VENTURE-ORGANIZATION-ADOPT-001';
const SD_UUID = 'd57ce054-be5a-4805-8ed9-268b85600089';
const PRD_ID = 'PRD-SD-LEO-ORCH-VENTURE-ORGANIZATION-ADOPT-001';
const PRD_TITLE = 'Venture AI organization: adopt the sixteen organization directives under one parent';

const CHILDREN = [
  'SD-LEO-INFRA-FIX-STAGE-JOURNEY-001',
  'SD-LEO-INFRA-STOP-ORG-ROLE-001',
  'SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001',
  'SD-LEO-INFRA-ORG-TEST-TEARDOWN-001',
  'SD-LEO-INFRA-CONTEXT-PROFILE-GETS-001',
  'SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001',
  'SD-LEO-INFRA-SKILL-LIBRARY-VERSIONED-001',
  'SD-LEO-INFRA-AGENT-MEMORY-WORKING-001',
  'SD-LEO-INFRA-DUTY-LEDGER-TRACING-001',
  'SD-LEO-INFRA-DELEGATION-RECEIVER-WRITTEN-001',
  'SD-LEO-INFRA-DEFINITION-HANDOFF-ASSURANCE-001',
  'SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001',
  'SD-LEO-INFRA-REGRESSION-GATED-SELF-001',
  'SD-LEO-INFRA-TALENT-FUNCTION-CREW-001',
  'SD-LEO-INFRA-REMOVE-EVERY-BINDING-001',
  'SD-LEO-INFRA-VENTURE-WORKFLOW-CREATES-001',
];

const llmContent = {
  executive_summary: 'Registers the sixteen already-existing AI-organization strategic directives as children of one parent, per chairman ratification ee2eaad3 (2026-09-15, six points) and ruling 212909b9 (sequencing before the clean-slate test venture). Every venture the factory produces gets its own AI organization assembled from a standard 28-role set, assembled before user-acceptance testing, audited at stage 23, approved at stage 24, and switched on only at go-live. This PRD elaborates the chairman-approved vision (VISION-AI-ORGANIZATION-L2-001) and architecture plan (ARCH-AI-ORGANIZATION-001) -- both already chairman_approved and active -- and adds no decision of its own.',

  functional_requirements: [
    {
      id: 'FR-1',
      requirement: 'Phase 1 (D1): the standard 28-role set becomes the source of truth in org_role_base_versions',
      description: 'Migrate the 28 role definitions from the STANDARD_VENTURE_TEMPLATE constant into org_role_base_versions at version 1, field-by-field verified against the constant (recorded, not asserted), then switch the constant\'s readers to the registry.',
      priority: 'CRITICAL',
      acceptance_criteria: ['AC-1: The 28 roles resolve from the registry identically to the constant, verified by a recorded field-by-field comparison']
    },
    {
      id: 'FR-2',
      requirement: 'Phase 2 (D2): one resolution reader for a venture\'s effective roles',
      description: 'A single function returns a venture\'s effective roles as base version, then overlay, then pin; every downstream caller uses it instead of reading the three tables directly.',
      priority: 'CRITICAL',
      acceptance_criteria: ['AC-1: A venture carrying an overlay resolves to the overlaid value and no other venture changes']
    },
    {
      id: 'FR-3',
      requirement: 'Phase 3 (D6): organization assembly before user-acceptance testing',
      description: 'An assembly step resolves a venture\'s roles, writes its pin rows, and records the assembly in the change log; it starts nothing (no role runs at assembly time).',
      priority: 'CRITICAL',
      acceptance_criteria: ['AC-1: A seeded venture reaches user-acceptance testing with its pins written and no role running']
    },
    {
      id: 'FR-4',
      requirement: 'Phase 4 (D7): a computed, provenance-carrying configuration audit',
      description: 'An audit reads a venture\'s pins and returns a verdict plus reasons; every verdict carries producer, run identifier, and content hash (ratification 6c263823 gate-evidence-provenance rule); wired into the existing stage-23 quality work.',
      priority: 'CRITICAL',
      acceptance_criteria: ['AC-1: A deliberately misconfigured venture fails the audit with reasons, and no seat can assert the result']
    },
    {
      id: 'FR-5',
      requirement: 'Phase 5 (D7a, D8): stage-24 approval reads the recorded verdict; switch-on is inert before go-live by construction',
      description: 'Stage-24 approval consumes the recorded stage-23 verdict and the pin set as they stood at stage 23, adding nothing and asking the chairman nothing new. Role activation switches on at go-live through the already-armed stage-gate predicate (ratification b75ddfff), inert before go-live BY CONSTRUCTION rather than by a runtime check.',
      priority: 'CRITICAL',
      acceptance_criteria: ['AC-1: No role activates in a seeded pre-go-live venture', 'AC-2: The chairman receives nothing new beyond the stage approvals he already gives']
    },
    {
      id: 'FR-6',
      requirement: 'The sixteen organization directives are registered as children of this one parent, and this parent carries the architecture plan',
      description: 'Structural registration only: all 16 child SDs carry parent_sd_id = this SD\'s id (verified live); this SD\'s metadata.arch_key = ARCH-AI-ORGANIZATION-001 and metadata.vision_key = VISION-AI-ORGANIZATION-L2-001, both chairman_approved and active (verified live).',
      priority: 'HIGH',
      acceptance_criteria: ['AC-1: All 16 children resolve via parent_sd_id, verified by direct query', 'AC-2: 5 of the 16 (already-delivered, per the parent\'s own scope text) are adopted as-is, not re-run']
    },
    {
      id: 'FR-7',
      requirement: 'Nothing in this program adds a venture stage, a gate, or a new chairman surface',
      description: 'Every deliverable above wires into venture stages, gates, and approval surfaces that already exist (stage 23/24, the existing stage-gate predicate, the existing quality work) -- this SD does not invent new ones.',
      priority: 'MEDIUM',
      acceptance_criteria: ['AC-1: No new venture-lifecycle stage is added', 'AC-2: No new chairman approval surface is added beyond the stage approvals that already exist']
    }
  ],

  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'This parent carries no implementation of its own -- every deliverable above is delivered by one or more of the 16 children',
      rationale: 'Matches the documented Orchestrator Parent Lifecycle (leo_protocol_sections 439): parent EXEC = delegated completion, PLAN-TO-EXEC uses the reduced gate set (PARENT_PRD_EXISTS + CHILDREN_STRUCTURE_VALID), no DESIGN/DATABASE sub-agent demand.'
    },
    {
      id: 'TR-2',
      requirement: 'Every verdict this program produces (the Phase 4 audit) carries producer, run identifier, and content hash',
      rationale: 'Chairman-ratified gate-evidence-provenance rule (ratification 6c263823): no completion gate may accept evidence authored by the party it gates.'
    },
    {
      id: 'TR-3',
      requirement: 'Role activation at go-live routes through the already-armed stage-gate predicate rather than a new bespoke check',
      rationale: 'checkStageGate (lib/governance/stage-gate-predicate.js) is already the chairman-ratified enforced predicate for high-consequence venture stage transitions (ratification b75ddfff); reusing it, rather than a parallel mechanism, keeps exactly one enforced gate for this class of transition.'
    }
  ],

  system_architecture: {
    overview: 'A five-phase pipeline (role registry -> resolution reader -> pre-UAT assembly -> provenance-carrying audit -> stage-24 read + go-live switch-on), delivered across sixteen child SDs and adopted, structurally, under this one parent. Each phase is complete only when its acceptance items pass, closing before the next begins; the acceptance suite runs alongside each phase rather than after all of them.',
    components: [
      { name: 'org_role_base_versions registry', responsibility: 'Source of truth for the 28 standard AI roles, versioned', technology: 'Existing table (from SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001, already completed)' },
      { name: 'Role resolution reader', responsibility: 'Single function resolving a venture\'s effective roles (base -> overlay -> pin)', technology: 'Shared library function, consumed by every downstream caller' },
      { name: 'Pre-UAT assembly step', responsibility: 'Resolves and pins a venture\'s roles before user-acceptance testing, records the assembly', technology: 'Wired into the existing venture-workflow pipeline' },
      { name: 'Configuration audit', responsibility: 'Reads pins, answers the audit\'s four questions, returns a provenance-carrying verdict', technology: 'Wired into the existing stage-23 quality work' },
      { name: 'Stage-24 approval + stage-gate switch-on', responsibility: 'Consumes the stage-23 verdict; activates roles only at go-live via the existing stage-gate predicate', technology: 'lib/governance/stage-gate-predicate.js (existing, ratification b75ddfff)' }
    ],
    data_flow: 'A venture is created -> the role resolution reader computes its effective role set -> the pre-UAT assembly step writes pin rows and logs the assembly -> stage 23 runs the configuration audit against those pins, recording a provenance-carrying verdict -> stage 24 reads that verdict (adding nothing new) -> at go-live, the stage-gate predicate switches roles on for the first time.',
    integration_points: [
      'org_role_base_versions, org_role_overlays, org_role_pins (existing tables)',
      'Existing stage-23 quality work (Phase 4 audit wiring)',
      'Existing stage-24 approval surface (Phase 5 read-only consumption)',
      'lib/governance/stage-gate-predicate.js checkStageGate (Phase 5 switch-on)',
      'Sixteen child SDs, five already completed and adopted as-is'
    ]
  },

  test_scenarios: [
    { id: 'TS-1', scenario: 'The 28 roles resolve identically from registry vs. constant', test_type: 'unit', given: 'org_role_base_versions v1 is migrated from STANDARD_VENTURE_TEMPLATE', when: 'Both sources are compared field-by-field', then: 'They are identical, and the comparison is recorded, not asserted' },
    { id: 'TS-2', scenario: 'Overlay resolution affects only the overlaid venture', test_type: 'integration', given: 'One venture carries a role overlay', when: 'The resolution reader is invoked for that venture and an unrelated venture', then: 'Only the overlaid venture\'s resolved roles reflect the overlay' },
    { id: 'TS-3', scenario: 'Assembly starts nothing', test_type: 'integration', given: 'A seeded venture reaches its assembly step', when: 'Assembly runs (pins written, change log recorded)', then: 'The venture reaches user-acceptance testing with pins written and zero roles actually running' },
    { id: 'TS-4', scenario: 'A misconfigured venture fails the audit with reasons', test_type: 'integration', given: 'A deliberately misconfigured venture (a known-bad pin combination)', when: 'The stage-23 audit runs', then: 'It fails, with reasons, and no seat can override or assert the result -- the verdict carries producer/run-id/hash' },
    { id: 'TS-5', scenario: 'No role activates before go-live', test_type: 'integration', given: 'A seeded venture at any pre-go-live stage', when: 'The stage-gate predicate is evaluated', then: 'It blocks activation by construction (launch_mode !== "live"), not merely by an ad-hoc check' },
    { id: 'TS-6', scenario: 'Structural adoption of the 16 children is verifiable', test_type: 'integration', given: 'This parent SD exists', when: 'strategic_directives_v2 is queried for parent_sd_id = this SD\'s id', then: 'Exactly 16 rows are returned, matching the parent\'s own metadata.children list' }
  ],

  acceptance_criteria: [
    'The 28 standard roles resolve identically from org_role_base_versions and the legacy constant',
    'A venture reaching go-live has an organization assembled before UAT, audited at stage 23, approved at stage 24, and switched on at go-live',
    'The stage-23 audit verdict carries producer, run identifier, and content hash for every venture it evaluates',
    'No AI role runs before go-live, and no role is bound to an earlier venture stage',
    'The chairman receives no approval, report, or interruption from this program beyond the stage approvals he already gives',
    'All 16 organization directives resolve as children of this one parent; 5 already-completed children are adopted as-is'
  ],

  risks: [
    {
      risk: 'This parent was registered (parent_sd_id stamped onto all 16 children) after one child (SD-LEO-INFRA-ORG-TEST-TEARDOWN-001) had already been claimed and advanced past its own LEAD-TO-PLAN -- a live dispatch-order race, not a stale defect',
      probability: 'LOW',
      impact: 'LOW',
      mitigation: 'leo_protocol_sections 439 explicitly names this class of defect and assigns its recovery to "the seat claiming its first child" -- this PRD and the parent\'s own LEAD-TO-PLAN/PLAN-TO-EXEC are exactly that sanctioned recovery, run once, before the affected child proceeds further',
      rollback_plan: 'None needed -- this is additive registration of already-approved structure, not a new decision; reverting would only re-orphan the 16 children from their already-chairman-specified parent'
    },
    {
      risk: 'A future seat could mistake this PRD as authorization to make new decisions about the AI-organization design beyond the six chairman-ratified points',
      probability: 'LOW',
      impact: 'MEDIUM',
      mitigation: 'The PRD\'s own executive summary states it "adds no decision of its own"; anything beyond the six ratified points explicitly returns to the chairman per the parent SD\'s own description text',
      rollback_plan: 'N/A -- a documentation/process risk, not a code risk'
    },
    {
      risk: 'Nine of the sixteen children remain draft/LEAD and unclaimed; a future claimant of any of them could encounter this same PLAN-TO-EXEC block if the parent were somehow not yet past its own PLAN-TO-EXEC at that time',
      probability: 'LOW',
      impact: 'LOW',
      mitigation: 'This PRD + the parent\'s own LEAD-TO-PLAN and PLAN-TO-EXEC (run immediately as part of this recovery) close that window for every remaining child going forward',
      rollback_plan: 'N/A -- running the parent\'s setup handoffs is a one-time, idempotent action per leo_protocol_sections 439'
    }
  ],

  implementation_approach: {
    phases: [
      { phase: 'Phase 1: Role registry (D1)', description: 'SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001 -- already completed.' },
      { phase: 'Phase 2: Resolution reader (D2)', description: 'Delivered by the relevant child SD(s) among the sixteen.' },
      { phase: 'Phase 3: Pre-UAT assembly (D6)', description: 'Delivered by the relevant child SD(s) among the sixteen.' },
      { phase: 'Phase 4: Provenance-carrying audit (D7)', description: 'SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001 and related children -- some already completed.' },
      { phase: 'Phase 5: Stage-24 read + go-live switch-on (D7a, D8)', description: 'Delivered by the relevant child SD(s) among the sixteen, reusing the existing stage-gate predicate.' }
    ],
    testing_strategy: 'Each of the 16 children carries its own test suite per its own LEO Protocol lifecycle; this parent adds no test surface of its own beyond the structural adoption check (TS-6).',
    deployment_strategy: 'No direct deployment from this parent -- every deliverable ships via its owning child SD\'s own PR/merge cycle.'
  },

  metadata: {
    prd_type: 'parent_orchestrator',
    is_orchestrator_prd: true,
    decomposition: CHILDREN,
    source_ratification: 'ee2eaad3 (2026-09-15, six points)',
    source_ruling: '212909b9 (sequencing before the clean-slate test venture)',
    vision_key: 'VISION-AI-ORGANIZATION-L2-001',
    arch_key: 'ARCH-AI-ORGANIZATION-001',
    recovery_note: 'Created as the sanctioned recovery for the dispatch-order defect documented in leo_protocol_sections id=439 -- see this file\'s header comment.'
  }
};

async function run() {
  const supabase = createSupabaseServiceClient();

  const { data: sdData, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, scope, sd_type')
    .eq('id', SD_UUID)
    .single();
  if (sdErr) throw new Error(`fetch SD failed: ${sdErr.message}`);

  const stakeholderPersonas = ['Chairman (Solo Entrepreneur)', 'EVA (AI Chief of Staff)', 'Adam (Org Build Seat)'];

  const prd = await createPRDWithValidatedContent(
    supabase,
    PRD_ID,
    SD_KEY,
    SD_UUID,
    PRD_TITLE,
    sdData,
    llmContent,
    stakeholderPersonas
  );

  console.log('PRD created/updated:', prd.id, '| status:', prd.status, '| progress:', prd.progress);
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
