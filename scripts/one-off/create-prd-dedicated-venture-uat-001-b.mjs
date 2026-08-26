#!/usr/bin/env node
// SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B -- PLAN phase PRD creation, incorporating LEAD's
// Explore corrections + VALIDATION's independent re-verification findings.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { createPRDWithValidatedContent } from '../prd/prd-creator.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B';
const SD_UUID = 'aa05cf0d-254f-4f43-b30b-f935fcedbf21';
const PRD_ID = 'PRD-SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B';
const PRD_TITLE = 'Stage-Key SSOT Migration: Insert UAT Stage, Renumber 23-26 to 24-27';

const llmContent = {
  executive_summary: 'Insert a chairman-ratified UAT venture_stage and renumber stages 23-26 to 24-27, preserving gate-semantics at the DATA level (per a corrected live-state finding), reconciling historical rows against the real 20260322 precedent, and re-anchoring 2 stale JS gate arrays across both repos.',

  functional_requirements: [
    {
      id: 'FR-1',
      requirement: 'Pre-DDL mechanism drift re-verification: assert the live writer-choke and gate-array mechanisms still match what LEAD/PLAN found before any DDL runs',
      description: 'This SD\'s own originally-stated hard EXEC blocker (a 4-step chairman-gated writer-choke chain) turned out to have already shipped to production before the SD was even created -- proof that this class of mechanism can drift silently between phases. A precondition script must independently re-query (a) ventures_canonical_writer_policy() existence and registry content, (b) advance_venture_stage()\'s live function body for the absence of hardcoded gate arrays, and fail loudly (non-zero exit) if either has changed shape since this PRD was authored.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-1: Precondition script queries pg_proc for ventures_canonical_writer_policy() and advance_venture_stage(), comparing their live definitions against a committed baseline hash/fingerprint',
        'AC-2: Script exits non-zero and refuses to proceed if either function\'s shape has materially changed',
        'AC-3: A unit test simulates a changed function body and asserts the non-zero exit'
      ]
    },
    {
      id: 'FR-2',
      requirement: 'Stage-quiescent DDL apply: insert the new UAT venture_stages row and renumber stage_number 23-26 to 24-27 only at an instant when no venture is mid-transition through the affected stage range',
      description: 'DDL must acquire an optimistic-lock freeze (e.g. a transition-in-progress check against venture_stage_transitions/ventures) before renumbering, include a DOWN mirror block (the migration is its own inverse, matching the 20260607_swap_stage_21_22_full_content.sql precedent\'s convention), and a post-apply readback with RAISE EXCEPTION assertions confirming the new state.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-1: Migration refuses to apply (RAISE EXCEPTION) if any venture is currently mid-transition through stage_number 23-26',
        'AC-2: A DOWN block exists in the same file and is idempotent (re-running detects already-reverted state)',
        'AC-3: Post-apply readback asserts stage_number, stage_key, gate_type, and is_irreversible for every affected row match the intended target state'
      ]
    },
    {
      id: 'FR-3',
      requirement: 'Gate-semantics invariance preserved at the DATA level, not code: venture_stages.gate_type/is_irreversible values travel with their row to the new stage_number',
      description: 'A live re-verification this session found advance_venture_stage() no longer hardcodes v_kill_gates/v_promotion_gates arrays -- it reads gate_type dynamically from venture_stages. There is no array left in that function to re-anchor. The actual invariant to preserve is that each shifted row\'s gate_type/is_irreversible value is carried forward unchanged to its new stage_number, with the irreversible go_live gate (currently stage 24, promotion+is_irreversible=true) never landing on a row that loses that flag.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-1: A post-apply query compares gate_type/is_irreversible for every shifted row against its pre-apply value at the OLD stage_number, asserting 1:1 equality',
        'AC-2: The row carrying is_irreversible=true is verified present at its new stage_number after apply, with zero rows unexpectedly carrying is_irreversible=true',
        'AC-3: The migration file documents the live pre-apply gate_type/is_irreversible baseline it was authored against, so a stale assumption is visible on read'
      ]
    },
    {
      id: 'FR-4',
      requirement: 'Historical-row translate-at-read shim reconciled against the REAL 20260322 precedent, not a clean-slate assumption',
      description: 'database/migrations/20260322_stage_renumbering_blueprint_review.sql STEP 3 already renumbered venture_stage_transitions.from_stage/to_stage once (+1 for values 17-25). The new epoch/schema-version marker design must distinguish at least 3 row epochs: pre-20260322 (never renumbered), post-20260322-pre-this-SD (renumbered once), and post-this-SD (renumbered twice, or newly created post-apply). eva_stage_gate_attempts and venture_stage_transitions rows must never be renumbered in place -- only read through the shim.',
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-1: An epoch marker column or convention distinguishes at least the 3 identified row generations',
        'AC-2: A translate-at-read function/view correctly maps a historical stage_number to its current-scheme equivalent for each epoch, verified against at least one real row known to have been renumbered by the 20260322 migration',
        'AC-3: eva_stage_gate_attempts.stage_number and venture_stage_transitions.from_stage/to_stage are never UPDATEd by this SD\'s own migration -- verified by the migration file containing no UPDATE statement against either table'
      ]
    },
    {
      id: 'FR-5',
      requirement: 'Cross-repo gate-array re-anchoring: update both repos\' hardcoded stage-number constants and query boundaries to the new numbering',
      description: 'Two genuinely-stale hardcoded arrays remain outside the DB function: lib/eva/gate-bars.js CHAIRMAN_GATE_STAGES (EHG_Engineer) and ehg/src/hooks/useLaunchWorkflow.ts LAUNCH_STAGES plus all 6 (not the originally-cited 3) .lte(...,25)/.gte(...,21) query pairs at lines 151, 190, 242, 260, 270, 294.',
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-1: lib/eva/gate-bars.js CHAIRMAN_GATE_STAGES is updated to the new stage numbering and covered by a test',
        'AC-2: All 6 confirmed .lte(...,25)/.gte(...,21) query pairs in ehg/src/hooks/useLaunchWorkflow.ts are updated to the new boundaries, verified by a test in the ehg repo',
        'AC-3: A grep-based self-check confirms zero remaining references to the pre-renumber stage boundaries (23-26) in either repo\'s gate-related source, excluding historical/archived content'
      ]
    },
    {
      id: 'FR-6',
      requirement: 'Parked-venture disposition at apply time is an explicit, answered design question',
      description: 'VALIDATION found 11 active-status ventures currently sitting at stage 23 (3) / 24 (8), all is_demo=true fixtures today. The apply plan must classify every ventures row at a shifted stage_number (demo vs real) immediately before the stage-quiescent freeze and state its disposition -- this SD does not need to solve the general case if zero real ventures are present at apply time, but must not proceed silently if one is.',
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-1: A pre-apply query classifies every ventures row at stage_number 23-26 as demo or real',
        'AC-2: The apply script refuses to proceed (non-zero exit) if any REAL (is_demo=false) venture is found at a shifted stage_number, unless an explicit override is provided',
        'AC-3: The classification result (counts, demo vs real) is logged/recorded as part of the apply evidence'
      ]
    },
    {
      id: 'FR-7',
      requirement: 'stage_key becomes the primary identifier in callers; stage numbers become display-order only, and the new UAT stage\'s writers register in ventures_canonical_writer_policy()',
      description: 'Per the original SD intent (confirmed correct this session, superseding the SD\'s own embedded but wrong "CENSUS-RECON CORRECTION"), the new UAT stage\'s writers must be added to ventures_canonical_writer_policy()\'s registry CTE, the same registry pattern sd_canonical_writer_policy() uses for strategic_directives_v2.',
      priority: 'MEDIUM',
      acceptance_criteria: [
        'AC-1: The new UAT stage\'s writer(s) appear in ventures_canonical_writer_policy()\'s registry VALUES list',
        'AC-2: A test confirms an unregistered writer attempting to write the new UAT stage is rejected by the existing enforcement triggers (aaa_enforce_canonical_stage_write / zzz_enforce_canonical_stage_write_final)'
      ]
    },
    {
      id: 'FR-8',
      requirement: 'Census citation and chairman-gated staging convention',
      description: 'The migration cites Child A\'s committed census (docs/audits/stage-21-26-census.md) as its blast-radius contract and is staged under database/chairman-gated/ with an @approved-by: PENDING header identical in convention to the other chairman-gated migrations -- never auto-applied by this SD.',
      priority: 'MEDIUM',
      acceptance_criteria: [
        'AC-1: The migration file header explicitly references docs/audits/stage-21-26-census.md by path',
        'AC-2: The migration file carries an @approved-by: PENDING (or equivalent unapproved) header and is never invoked by any automated apply script during this SD\'s own EXEC phase'
      ]
    }
  ],

  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'The renumber migration is authored as a staged, chairman-gated SQL file under database/chairman-gated/, using the established apply-migration.js BEGIN/COMMIT + advisory-lock pattern, and is never auto-applied by this SD\'s EXEC work',
      rationale: 'This migration touches an irreversible go_live gate on live production venture data; per this repo\'s own established convention, high-consequence DDL of this kind requires explicit chairman ratification before apply, matching the pattern already used for the writer-choke chain and the 20260607 stage swap.'
    },
    {
      id: 'TR-2',
      requirement: 'The single-transaction UPDATE...FROM CTE technique from 20260607_swap_stage_21_22_full_content.sql (capturing a pre-apply snapshot, writing each target row exactly once) is reused for the renumber, to avoid unique-constraint collisions on stage_key mid-walk',
      rationale: 'Sequential single-row UPDATEs on a column carrying a UNIQUE constraint (stage_key) would collide mid-migration; this repo already solved this exact problem once for the 21/22 swap.'
    },
    {
      id: 'TR-3',
      requirement: 'All read-only precondition/verification scripts (drift check, parked-venture classifier, quiescence check) connect via the existing createDatabaseClient(\'engineer\') helper, never a new ad hoc connection',
      rationale: 'Consistency with the established connection pattern (lib/supabase-connection.js) and with Child A\'s own census instrument, which resolved the "2 repos, 1 shared database" scope question the same way.'
    },
    {
      id: 'TR-4',
      requirement: 'Cross-repo JS changes (gate-bars.js, useLaunchWorkflow.ts) are each covered by a unit test in their OWN repo\'s existing test suite -- no cross-repo test runner is introduced',
      rationale: 'EHG_Engineer and ehg have independent CI pipelines and test runners; a change split across both repos must be independently verifiable in each without a new coupling mechanism.'
    }
  ],

  system_architecture: {
    overview: 'A chairman-gated SQL migration (staged, unapplied) performs the stage-quiescent renumber and UAT stage insert in one transaction with a DOWN mirror and readback assertions. Three precondition scripts (drift check, quiescence check, parked-venture classifier) gate the apply. Two cross-repo JS changes re-anchor stale gate-number constants. A translate-at-read shim reconciles historical rows across 3 identified epochs.',
    components: [
      {
        name: 'PreconditionChecker',
        responsibility: 'Re-verifies live writer-choke/gate-array mechanism shape (FR-1), checks stage-quiescence (FR-2), and classifies parked ventures demo-vs-real (FR-6) immediately before apply',
        technology: 'Node.js + createDatabaseClient(\'engineer\')'
      },
      {
        name: 'RenumberMigration',
        responsibility: 'The staged, chairman-gated SQL file: single-transaction CTE-based renumber + UAT stage insert, DOWN mirror, post-apply readback assertions (FR-2, FR-3, FR-7, FR-8)',
        technology: 'PostgreSQL DDL/DML, database/chairman-gated/ convention'
      },
      {
        name: 'HistoricalTranslateShim',
        responsibility: 'Epoch-marked translate-at-read logic reconciling eva_stage_gate_attempts/venture_stage_transitions against the pre-20260322/post-20260322/post-this-SD epochs (FR-4)',
        technology: 'PostgreSQL view or function, read-only'
      },
      {
        name: 'CrossRepoGateArrayUpdate',
        responsibility: 'Updates lib/eva/gate-bars.js (EHG_Engineer) and ehg/src/hooks/useLaunchWorkflow.ts (6 query sites) to the new stage numbering (FR-5)',
        technology: 'TypeScript/JavaScript, 2 independent repos'
      }
    ],
    data_flow: 'PreconditionChecker runs and must exit 0 -> RenumberMigration applies in one transaction (freeze check, CTE-based row swap, gate_type/is_irreversible carried per-row, readback assertions) -> HistoricalTranslateShim is deployed so historical queries resolve correctly across all 3 epochs -> CrossRepoGateArrayUpdate lands in both repos, independently tested.',
    integration_points: [
      'ventures_canonical_writer_policy() registry (database/chairman-gated/20260825_ventures_canonical_writer_choke.sql) -- new UAT stage writer registration',
      'advance_venture_stage() live function -- consumes venture_stages.gate_type dynamically, no code change needed there',
      'docs/audits/stage-21-26-census.md (Child A) -- cited blast-radius contract',
      'database/migrations/20260607_swap_stage_21_22_full_content.sql -- precedent for the single-transaction CTE renumber technique and DOWN-mirror convention'
    ]
  },

  test_scenarios: [
    {
      id: 'TS-1',
      scenario: 'Pre-DDL drift check blocks apply when the writer-choke or gate-array mechanism has changed shape',
      test_type: 'integration',
      given: 'A committed baseline fingerprint of ventures_canonical_writer_policy() and advance_venture_stage() taken at PLAN time',
      when: 'The precondition script runs against the live database at apply time',
      then: 'The script exits non-zero if either function\'s live definition differs from the committed baseline, and exits 0 if unchanged'
    },
    {
      id: 'TS-2',
      scenario: 'Stage-quiescent freeze blocks apply mid-walk',
      test_type: 'unit',
      given: 'A venture currently transitioning through stage_number 23 (simulated via a stubbed venture_stage_transitions row with no completed_at)',
      when: 'The quiescence check runs',
      then: 'The check reports not-quiescent and the migration refuses to apply (RAISE EXCEPTION)'
    },
    {
      id: 'TS-3',
      scenario: 'Gate-semantics data integrity preserved after renumber',
      test_type: 'integration',
      given: 'The pre-apply gate_type/is_irreversible values for venture_stages rows 23-26',
      when: 'The renumber migration applies (in a non-production verification run)',
      then: 'Each row\'s gate_type/is_irreversible value is found unchanged at its new stage_number (24-27), verified by the post-apply readback assertion'
    },
    {
      id: 'TS-4',
      scenario: 'Historical shim correctly translates a row known to have been renumbered once by the 20260322 precedent',
      test_type: 'integration',
      given: 'A venture_stage_transitions row whose from_stage/to_stage was shifted +1 by the 20260322 migration',
      when: 'The translate-at-read shim resolves that row\'s stage_number to the current scheme',
      then: 'The shim correctly applies the SECOND shift (this SD\'s renumber) on top of the row\'s already-applied first shift, rather than double-counting or assuming a clean slate'
    },
    {
      id: 'TS-5',
      scenario: 'Cross-repo gate-array re-anchoring is complete in both repos',
      test_type: 'unit',
      given: 'The updated lib/eva/gate-bars.js and ehg/src/hooks/useLaunchWorkflow.ts source files',
      when: 'Each repo\'s own test suite runs against its own updated constants',
      then: 'Both repos\' tests assert the new stage-number boundaries with zero remaining references to the pre-renumber boundaries'
    },
    {
      id: 'TS-6',
      scenario: 'Parked-venture classification blocks apply when a real venture is found at a shifted stage',
      test_type: 'unit',
      given: 'A stubbed ventures row with is_demo=false at stage_number 24',
      when: 'The parked-venture classifier runs',
      then: 'The classifier flags this as REAL and the apply script refuses to proceed without an explicit override'
    },
    {
      id: 'TS-7',
      scenario: 'DOWN mirror correctly reverts the renumber',
      test_type: 'integration',
      given: 'The migration has been applied (in a non-production verification run)',
      when: 'The DOWN block is executed',
      then: 'All shifted rows return to their original stage_number/stage_key/gate_type/is_irreversible values, verified by comparing against the pre-apply snapshot'
    },
    {
      id: 'TS-8',
      scenario: 'stage-execution-worker.js\'s literal fromStage/toStage check and stage-23.js dynamic import are updated or explicitly justified as unchanged',
      test_type: 'unit',
      given: 'lib/eva/stage-execution-worker.js:2971\'s literal `if (fromStage === 23 && toStage === 24)` check and its 2 dynamic imports of ./stage-templates/stage-23.js',
      when: 'The renumber lands (23->24, 24->25 boundaries)',
      then: 'Either the literal check and filename are updated to the new stage numbers, or the PRD/migration explicitly documents why the check/filename intentionally stays stale-named (matching the tolerated component_path drift precedent from the 20260607 swap)'
    }
  ],

  acceptance_criteria: [
    'Pre-DDL precondition script exits non-zero if the live writer-choke or gate-array mechanism has drifted since PLAN\'s verification',
    'The migration refuses to apply while any venture is mid-transition through stage_number 23-26 (stage-quiescent freeze)',
    'Post-apply readback confirms 100% of shifted venture_stages rows retain their pre-renumber gate_type/is_irreversible value at the new stage_number',
    'The translate-at-read shim correctly distinguishes pre-20260322, post-20260322-pre-this-SD, and post-this-SD row epochs',
    'Both repos\' hardcoded gate-number constants (lib/eva/gate-bars.js; ehg/src/hooks/useLaunchWorkflow.ts, 6 query sites) are updated with zero remaining pre-renumber references',
    'The apply script refuses to proceed if any is_demo=false venture is found at a shifted stage_number',
    'The migration cites docs/audits/stage-21-26-census.md and is staged chairman-gated (never auto-applied by this SD)'
  ],

  risks: [
    {
      risk: 'The writer-choke or gate-array mechanism drifts AGAIN between PLAN and EXEC/apply, the exact hazard already observed once on this SD (its own stated hard blocker had already shipped before the SD was created)',
      probability: 'MEDIUM',
      impact: 'HIGH',
      mitigation: 'FR-1\'s pre-DDL drift check re-verifies mechanism shape immediately before apply, failing loudly rather than trusting a stale PLAN-time snapshot',
      rollback_plan: 'No schema change has occurred if the drift check fails pre-apply -- nothing to roll back, the apply simply does not proceed'
    },
    {
      risk: 'The DDL applies while a venture is mid-transition through the affected stage range, corrupting an in-flight venture_stage_transitions row or leaving a venture at an undefined stage_number',
      probability: 'LOW',
      impact: 'HIGH',
      mitigation: 'FR-2\'s stage-quiescent freeze check refuses to apply unless zero ventures are mid-transition through stage_number 23-26',
      rollback_plan: 'The DOWN mirror (FR-2/TR-2) reverts all shifted rows to their pre-apply state if a problem is discovered post-apply'
    },
    {
      risk: 'The two repos (EHG_Engineer, ehg) are updated out of sync -- one repo\'s gate-array constants reflect the new numbering while the other still reflects the old, causing inconsistent gate enforcement between the backend RPC and the frontend launch workflow',
      probability: 'MEDIUM',
      impact: 'MEDIUM',
      mitigation: 'FR-5 requires both repos\' changes to land together as part of this SD\'s own scope, each independently tested; the PRD explicitly enumerates all 6 EHG-app query sites (corrected from the SD\'s original undercounted 3) to prevent a partial fix',
      rollback_plan: 'Each repo\'s change is independently revertable via its own git history; no cross-repo coupling mechanism exists to fail atomically'
    },
    {
      risk: 'A real (non-demo) venture reaches stage 23 or 24 between PLAN authoring and the actual apply instant (e.g. AltifyAI, currently at stage 19 per the SD\'s stated coordinator constraint, advances further than expected)',
      probability: 'LOW',
      impact: 'HIGH',
      mitigation: 'FR-6\'s parked-venture classifier re-checks demo-vs-real status immediately before the freeze, not just at PLAN time, and refuses to proceed on any real venture found at a shifted stage without an explicit override',
      rollback_plan: 'No schema change occurs if the classifier blocks apply -- the coordinator constraint (land before AltifyAI crosses S22->S23) becomes the actual scheduling driver, re-verified live rather than assumed from a point-in-time PLAN observation'
    }
  ],

  implementation_approach: {
    phases: [
      {
        phase: 'Phase 1: Precondition and verification tooling',
        description: 'Build the pre-DDL drift check (FR-1), stage-quiescent freeze check (FR-2), and parked-venture classifier (FR-6) as independently testable, read-only scripts',
        deliverables: ['Drift-check script with a committed baseline fingerprint', 'Quiescence-check script', 'Parked-venture classifier script']
      },
      {
        phase: 'Phase 2: Staged migration authoring (no apply)',
        description: 'Author the chairman-gated renumber migration under database/chairman-gated/ using the 20260607 single-transaction CTE technique, with a DOWN mirror and post-apply readback assertions, citing the census and carrying an @approved-by: PENDING header',
        deliverables: ['Staged, unapplied SQL migration file with DOWN mirror', 'Post-apply readback assertion block']
      },
      {
        phase: 'Phase 3: Historical shim + cross-repo gate-array re-anchoring',
        description: 'Implement the epoch-marked translate-at-read shim reconciled against the 20260322 precedent, and update both repos\' hardcoded gate-number constants and query boundaries',
        deliverables: ['Translate-at-read shim (view or function)', 'Updated lib/eva/gate-bars.js', 'Updated ehg/src/hooks/useLaunchWorkflow.ts (6 query sites)']
      }
    ],
    technical_decisions: [
      'The renumber migration is staged chairman-gated and NEVER auto-applied by this SD\'s own EXEC work, given it touches an irreversible go_live gate on live production venture data -- matching this repo\'s established convention for high-consequence DDL',
      'Gate-semantics re-anchoring targets DATA (venture_stages.gate_type/is_irreversible), not code, because a live re-verification this session found advance_venture_stage() no longer hardcodes gate arrays -- the SD\'s original code-level re-anchoring plan was designed against a premise that stopped being true before the SD was even created',
      'Reuse the single-transaction UPDATE...FROM CTE technique from database/migrations/20260607_swap_stage_21_22_full_content.sql rather than sequential single-row UPDATEs, to avoid a stage_key UNIQUE-constraint collision mid-walk'
    ]
  },

  integration_operationalization: {
    consumers: [
      {
        name: 'Chairman ratification ceremony',
        interaction: 'Reviews and approves the staged migration file before any apply, given the irreversible go_live gate it touches',
        frequency: 'Once, at the scheduled apply ceremony'
      },
      {
        name: 'AltifyAI venture progression (coordinator constraint)',
        interaction: 'This migration must land before AltifyAI crosses the S22->S23 boundary -- re-verify AltifyAI\'s live stage at apply time rather than trusting the PLAN-time snapshot (confirmed stage 19 this session)',
        frequency: 'Continuous monitoring until apply'
      }
    ],
    dependencies: [
      {
        name: 'ventures_canonical_writer_policy() + self-stamp RPCs (already shipped via SD-LEO-INFRA-STAGE-WRITER-CHOKE-001)',
        type: 'upstream',
        contract: 'The new UAT stage\'s writers register in the existing registry CTE',
        failure_handling: 'FR-1\'s drift check fails loudly if this mechanism has changed shape since verification, rather than assuming it is still accurate'
      },
      {
        name: 'Child A\'s committed census (docs/audits/stage-21-26-census.md)',
        type: 'upstream',
        contract: 'Cited as the blast-radius contract before authoring DDL',
        failure_handling: 'N/A -- a static document reference, not a runtime dependency'
      }
    ],
    data_contracts: [
      {
        contract_name: 'venture_stages row shape post-renumber',
        schema: 'stage_number, stage_key, gate_type, is_irreversible carried together per row from old to new stage_number',
        validation: 'Post-apply readback assertion comparing pre/post values 1:1',
        versioning: 'The DOWN mirror is the rollback path; no forward versioning beyond this migration'
      }
    ],
    runtime_config: {
      environment_variables: [],
      feature_flags: [],
      deployment_considerations: 'The migration is staged and chairman-gated; it introduces no runtime behavior change until explicitly applied by a separate, chairman-supervised ceremony outside this SD\'s own EXEC scope'
    },
    observability_rollout: {
      monitoring: ['Post-apply readback assertions serve as the immediate correctness signal', 'Parked-venture classifier output logged as apply evidence'],
      alerts: [],
      rollout_strategy: 'Staged migration file committed and reviewed; actual apply is a separate, chairman-supervised ceremony scheduled around the AltifyAI coordinator constraint',
      rollback_trigger: 'Any post-apply readback assertion failure',
      rollback_procedure: 'Execute the migration\'s own DOWN mirror block, which is its own verified inverse (TS-7)'
    }
  },

  exploration_summary: {
    files_read: [
      'database/migrations/20260322_stage_renumbering_blueprint_review.sql',
      'database/chairman-gated/20260825_ventures_canonical_writer_choke.sql',
      'database/chairman-gated/20260825_ventures_stage_rpcs_self_stamp.sql',
      'database/migrations/20260607_swap_stage_21_22_full_content.sql',
      'lib/eva/gate-bars.js',
      'lib/eva/stage-execution-worker.js',
      'ehg/src/hooks/useLaunchWorkflow.ts',
      'docs/audits/stage-21-26-census.md'
    ],
    patterns_identified: [
      'The single-transaction UPDATE...FROM CTE renumber technique (20260607 swap) avoids UNIQUE-constraint collisions on stage_key and is directly reusable here',
      'Chairman-gated migrations in this repo carry an @approved-by: PENDING header and are never auto-applied by the SD that authors them -- apply is a separate ceremony',
      'A mechanism this SD depends on can silently ship to production between SD creation and EXEC -- this was independently observed TWICE in this program now (the writer-choke chain here; the regex hazard on sibling Child A) -- pre-apply drift re-verification is a load-bearing pattern, not optional defensiveness'
    ],
    key_decisions: [
      'Corrected the SD\'s own embedded "CENSUS-RECON CORRECTION" (itself factually wrong about ventures_canonical_writer_policy() not being a registry pattern) and its "hard blocking dependency" premise (the chain had already shipped) before PLAN authored this PRD -- verified independently via live pg_get_functiondef queries and a direct strategic_directives_v2 status check, not by trusting either the original SD text or the embedded correction',
      'Re-targeted gate-semantics re-anchoring from a code-level array edit (no longer possible -- the array does not exist in the live function) to a data-level row-value preservation requirement'
    ],
    exploration_date: '2026-08-25'
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

  const stakeholderPersonas = ['Chairman (Solo Entrepreneur)', 'EVA (AI Chief of Staff)', 'DevOps Engineer'];

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
    process.exitCode = 1;
  });
}
