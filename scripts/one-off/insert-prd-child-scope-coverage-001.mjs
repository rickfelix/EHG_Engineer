#!/usr/bin/env node
// Inline-mode PRD insertion for SD-LEO-FIX-CHILD-SCOPE-COVERAGE-001 (escalated from
// QF-20260911-793; per CLAUDE_PLAN.md's "PRD Creation - Inline Mode is the Default for
// Claude Code" workflow). Grounded in the actual implementation already committed on
// branch feat/SD-LEO-FIX-CHILD-SCOPE-COVERAGE-001, plus live DB findings from the
// LEAD-phase Explore/VALIDATION sub-agent evidence (rows c886e65e, 6807b6c6, 3917d3cd).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-CHILD-SCOPE-COVERAGE-001';
const SD_UUID = '61447e07-e054-42ab-884c-4b98a69b6557';
const PRD_ID = `PRD-${SD_KEY}`;

const content = {
  executive_summary:
    "Fixes CHILD_SCOPE_COVERAGE: excludes parent-orchestrator-handler.js's 3 hard-coded coordination-only FRs from the coverage denominator (name+flag guarded), fixes a missed metadata projection, and backfills 30 pre-existing rows across 10 live orchestrators.",

  functional_requirements: [
    {
      id: 'FR-1',
      requirement: "Mark parent-orchestrator-handler.js's 3 hard-coded coordination-only FRs (Child SD Orchestration / Work Decomposition Structure / Progress Tracking) with `coordination_only: true` at the source.",
      description: "generateParentPRD (parent-orchestrator-handler.js:105) emits these 3 exact FR titles for every auto-generated orchestrator PRD (lines 163-197). They describe coordinator-only work no child would ever phrase in its own scope, making CHILD_SCOPE_COVERAGE structurally unpassable (2 of 3 required, actual score 33/100). Each FR object gains a `coordination_only: true` field alongside its existing id/title/description/priority/acceptance_criteria.",
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-1: All 3 template FR objects in generateParentPRD carry `coordination_only: true`.',
        'AC-2: No other FR object (present or future) in this function carries the flag unless it is genuinely coordinator-only.',
      ]
    },
    {
      id: 'FR-2',
      requirement: 'Thread the coordination_only marker from PRD functional_requirements into each extracted sd_scope_deliverables row\'s metadata.',
      description: "extract-deliverables-from-prd.js's Option 2 branch (functional_requirements extraction, ~line 155-183) builds each deliverable row from a PRD FR object but previously set no metadata field at all. Add `metadata: req.coordination_only ? { coordination_only: true } : {}` to the pushed deliverable object, so the flag survives from PRD authoring through to the persisted row CHILD_SCOPE_COVERAGE reads.",
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-1: A deliverable extracted from an FR with coordination_only:true carries metadata.coordination_only:true in the inserted row.',
        'AC-2: A deliverable extracted from a normal FR (no coordination_only key) carries metadata: {} (no accidental flag leakage).',
      ]
    },
    {
      id: 'FR-3',
      requirement: "CHILD_SCOPE_COVERAGE excludes coordination-only deliverables from its coverage denominator entirely, requiring BOTH metadata.coordination_only AND an exact deliverable_name match against the 3 known template titles.",
      description: "child-scope-coverage.js's parentDeliverables query previously selected id/deliverable_name/deliverable_type only -- never metadata -- so a first attempt at this exclusion read pd.metadata as undefined for every row and was a complete no-op (VALIDATION evidence 3917d3cd caught this before merge). Fixed: the query now also selects metadata. The exclusion itself is name+flag guarded (COORDINATION_TEMPLATE_NAMES Set) rather than trusting the flag alone, since prd.functional_requirements is free-form JSONB writable by any PRD author -- an unnamespaced flag could otherwise exempt a real deliverable from scoring (VALIDATION recommendation, evidence 6807b6c6). The filter runs BEFORE the child-deliverables query so the all-template case short-circuits (auto-pass at 100) without needing it.",
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-1: An orchestrator whose ONLY parent deliverables are the 3 coordination-template rows auto-passes CHILD_SCOPE_COVERAGE at score 100.',
        'AC-2: An orchestrator with both coordination-only and substantive deliverables scores coverage using ONLY the substantive ones as the denominator (coordination-only rows never scored, never reported uncovered).',
        'AC-3: A deliverable claiming metadata.coordination_only:true but whose deliverable_name does NOT match one of the 3 known titles is NOT exempted -- still scored and can still fail the gate (proves the flag alone is insufficient, closing the spoof risk).',
        'AC-4: The parentDeliverables query\'s select string includes `metadata` (regression-pinned by a projection-asserting test, since the queued-mock test factory ignores the select argument and cannot otherwise catch an unprojected column).',
      ]
    },
    {
      id: 'FR-4',
      requirement: 'Backfill metadata.coordination_only:true onto pre-existing sd_scope_deliverables rows created before this fix, so currently-blocked orchestrators are unblocked without waiting for re-extraction.',
      description: "extractAndPopulateDeliverables defaults skipIfExists:true, so existing deliverable rows are never re-tagged by this fix alone. Live DB evidence (Explore, row c886e65e) found 30 rows across 10 real orchestrator SDs carrying the 3 exact template titles with no coordination_only key, including SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001 which was actively rejected at PLAN-TO-LEAD on this exact gate ~1h before this fix was authored. A one-off backfill script (scripts/one-off/backfill-coordination-only-child-scope-coverage-001.mjs) finds every sd_scope_deliverables row on an orchestrator-type parent whose name matches the 3 known titles and merge-patches metadata.coordination_only:true onto it (preserving existing metadata keys, e.g. orchestrator-completion-guardian's producer stamp).",
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-1: Dry-run mode (default, no --execute) reports every row it WOULD change without writing.',
        'AC-2: --execute mode merge-patches metadata (never a blind replace) so pre-existing keys like producer survive.',
        'AC-3: Scope is limited to sd_type=orchestrator parents and the 3 exact known titles -- never mistakenly tags an unrelated deliverable sharing one of those names on a non-orchestrator SD.',
        'AC-4: Run against production: 30/30 identified rows backfilled successfully, verified by re-reading the previously-blocked SD\'s rows.',
      ]
    },
    {
      id: 'FR-5',
      requirement: 'Regression tests for the fixed gate: projection assertion, all-template auto-pass, mixed-deliverable exclusion, and flag-only spoof rejection.',
      description: 'child-scope-coverage.test.js gains 4 new tests: (1) a spy-based test asserting the parentDeliverables select string contains "metadata" (fails without FR-3\'s projection fix, passes with it -- independently verified both ways by reverting and restoring the fix); (2) all-coordination-only auto-pass at score 100; (3) mixed substantive+coordination-only deliverables scored on the substantive subset only; (4) a coordination_only:true flag on a non-template-named deliverable is NOT exempted.',
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-1: All 4 new tests pass.',
        'AC-2: All pre-existing child-scope-coverage.test.js tests (2) continue to pass unmodified.',
        'AC-3: The full scripts/modules/handoff/executors/plan-to-lead test suite (125 tests, 12 files) passes with zero regressions.',
      ]
    }
  ],

  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'No changes to any OTHER semantic gate (OVERLAPPING_SCOPE_DETECTION, CASCADE_ALIGNMENT, CROSS_CHILD_INTEGRATION) -- the fix is entirely contained in child-scope-coverage.js, extract-deliverables-from-prd.js, and parent-orchestrator-handler.js.',
      rationale: 'Explore confirmed no other gate shares this exact defect shape (CASCADE_ALIGNMENT reads strategic_objectives/key_changes, not this PRD FR path, and is not driven by parent-orchestrator-handler.js\'s hardcoded titles). Widening the fix beyond the actually-affected files risks unrelated regressions with no measured benefit.'
    },
    {
      id: 'TR-2',
      requirement: 'The backfill script must be idempotent and merge (never replace) the metadata column.',
      rationale: 'sd_scope_deliverables.metadata already carries other keys (e.g. orchestrator-completion-guardian\'s producer stamp) on live rows; a blind overwrite would silently destroy that data. Re-running the backfill after it has already applied must be a safe no-op (rows already carrying the flag are skipped).'
    },
    {
      id: 'TR-3',
      requirement: 'COORDINATION_TEMPLATE_NAMES in the gate must exactly match the literal FR titles generateParentPRD emits, byte-for-byte, verified end-to-end (emit -> extract -> persist -> read).',
      rationale: 'A silent mismatch (e.g. a future edit to one title in parent-orchestrator-handler.js without updating the gate\'s Set) would either re-open the original defect (title no longer excluded) or misclassify a coincidentally-similar real deliverable. VALIDATION traced the full pipeline and confirmed exact byte-identical match today; this constraint keeps that true going forward.'
    }
  ],

  system_architecture: {
    overview:
      'Three cooperating changes close the defect end-to-end: (1) the FR source (parent-orchestrator-handler.js) marks its own coordination-only content, (2) the extractor (extract-deliverables-from-prd.js) threads that marker into the persisted deliverable row, and (3) the consuming gate (child-scope-coverage.js) reads the marker (now correctly projected) and excludes matching rows from its coverage denominator, guarded by an exact-name allowlist. A companion one-off script backfills the marker onto rows that predate this fix.',
    components: [
      {
        name: 'ParentOrchestratorHandler.generateParentPRD (parent-orchestrator-handler.js)',
        responsibility: 'MODIFIED. Emits coordination_only:true on its 3 hard-coded template FR objects.',
        technology: 'Node.js / ES modules'
      },
      {
        name: 'extractAndPopulateDeliverables / functional_requirements extraction branch (extract-deliverables-from-prd.js)',
        responsibility: 'MODIFIED. Threads req.coordination_only into the persisted deliverable row\'s metadata field.',
        technology: 'Node.js / ES modules'
      },
      {
        name: 'CHILD_SCOPE_COVERAGE gate (child-scope-coverage.js)',
        responsibility: 'MODIFIED. Projects metadata in its parentDeliverables query; excludes name+flag-matched coordination-only rows from the coverage denominator before computing score, and before querying child deliverables.',
        technology: 'Node.js / ES modules'
      },
      {
        name: 'Backfill script (scripts/one-off/backfill-coordination-only-child-scope-coverage-001.mjs)',
        responsibility: 'NEW, one-time. Finds and merge-patches pre-existing rows on live orchestrators missing the marker.',
        technology: 'Node.js / ES module, direct Supabase client'
      }
    ],
    data_flow:
      'generateParentPRD builds functional_requirements (3 with coordination_only:true) -> PRD saved to product_requirements_v2 -> extractAndPopulateDeliverables (Option 2 branch, since orchestrator PRDs have no story-linked exec_checklist) reads functional_requirements and inserts sd_scope_deliverables rows, threading coordination_only into metadata -> at PLAN-TO-LEAD, CHILD_SCOPE_COVERAGE queries parentDeliverables (id, deliverable_name, deliverable_type, metadata) -> filters out rows matching BOTH metadata.coordination_only AND the 3 known titles -> scores coverage on the remaining substantive deliverables against children\'s own deliverables -> auto-passes at 100 if no substantive deliverables remain.',
    integration_points: [
      'product_requirements_v2.functional_requirements (JSONB array, read by extractAndPopulateDeliverables)',
      'sd_scope_deliverables.metadata (JSONB, write site: extract-deliverables-from-prd.js; read site: child-scope-coverage.js)',
      'PLAN-TO-LEAD handoff pipeline (child-scope-coverage.js is one of ~30 gates evaluated there for orchestrator-type SDs)'
    ]
  },

  test_scenarios: [
    {
      id: 'TS-1',
      scenario: 'parentDeliverables query projects metadata (regression guard for the missed-projection defect caught before merge).',
      test_type: 'unit',
      given: 'A spy wrapping the gate\'s supabase mock captures every .select() call argument',
      when: 'The gate runs against an orchestrator SD',
      then: 'The captured select string for the sd_scope_deliverables (parent) query matches /\\bmetadata\\b/ -- fails if this projection is ever removed'
    },
    {
      id: 'TS-2',
      scenario: 'All parent deliverables are the coordination-only template (no substantive work to check).',
      test_type: 'unit',
      given: 'parentDeliverables = exactly the 3 known titles, each with metadata.coordination_only:true; 1 completed child with unrelated deliverables',
      when: 'The gate runs',
      then: 'passed===true, score===100, details.templateOnly===3, and the child-deliverables query is never issued (short-circuit before it)'
    },
    {
      id: 'TS-3',
      scenario: 'Mixed substantive + coordination-only parent deliverables.',
      test_type: 'unit',
      given: 'parentDeliverables = 1 substantive ("ship auth", no flag) + 1 coordination-only ("Child SD Orchestration", flagged); 1 child whose deliverable covers the substantive one',
      when: 'The gate runs',
      then: 'details.parentDeliverables===1 (only the substantive one counted), details.templateExcluded===1, score===100 (1/1 substantive covered) -- NOT 50 (1/2), proving the coordination-only row is excluded from the denominator entirely'
    },
    {
      id: 'TS-4',
      scenario: 'A deliverable claims coordination_only:true but its name does not match any of the 3 known titles (flag-only spoof).',
      test_type: 'unit',
      given: 'parentDeliverables = 1 row named "Ship the real auth feature" with metadata.coordination_only:true; 1 child with unrelated deliverables',
      when: 'The gate runs',
      then: 'details.parentDeliverables===1 (NOT exempted), details.templateExcluded===0, passed===false -- proves the flag alone cannot disable scoring on a real deliverable'
    },
    {
      id: 'TS-5',
      scenario: 'Live production regression: the previously-blocked orchestrator (SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001) after the backfill.',
      test_type: 'integration (manual, live DB, not part of the automated suite)',
      given: 'The 3 pre-existing deliverable rows for this SD, backfilled with metadata.coordination_only:true via the one-off script',
      when: 'Re-reading the rows directly',
      then: 'Each row carries coordination_only:true in metadata while its pre-existing producer key (orchestrator_completion_guardian) is preserved unchanged -- confirmed by direct query before/after the backfill'
    }
  ],

  acceptance_criteria: [
    'All 5 test scenarios (TS-1 through TS-5) pass; TS-1 through TS-4 as automated unit tests, TS-5 as a manually-verified live-DB check.',
    'The full scripts/modules/handoff/executors/plan-to-lead unit test suite (125 tests across 12 files) passes with zero regressions.',
    'The backfill script has been run with --execute against production and reports 30/30 rows successfully updated across the 10 live orchestrator SDs found.',
    'No changes to any file outside child-scope-coverage.js, child-scope-coverage.test.js, extract-deliverables-from-prd.js, parent-orchestrator-handler.js, and the new one-off backfill/evidence scripts.',
  ],

  risks: [
    {
      risk: 'A prior implementation attempt shipped the coordination_only exclusion without projecting metadata in the query it read from, making the fix a complete no-op in production while unit tests (which stub .select() to ignore its argument) reported green.',
      probability: 'LOW (already occurred once, caught pre-merge)',
      impact: 'HIGH',
      mitigation: 'VALIDATION sub-agent caught this before EXEC by empirically running the gate\'s exact select string against a live row with known metadata. A dedicated regression test (TS-1) now pins the projection directly, independent of the mock factory\'s blind-spot.',
      rollback_plan: 'Single-file revert of child-scope-coverage.js; no data migration involved in this specific fix.'
    },
    {
      risk: 'metadata.coordination_only alone, without a name check, would let any future PRD author (human, add-prd-to-database.js, or an LLM-authored PRD) exempt a genuinely under-scoped real deliverable from coverage scoring, silently weakening the gate it is meant to strengthen.',
      probability: 'LOW',
      impact: 'MEDIUM',
      mitigation: 'Exclusion requires BOTH the flag AND an exact match against a small, hardcoded Set of the 3 known titles this codebase actually emits (TS-4 proves a flag-only spoof is rejected).',
      rollback_plan: 'Revert to flag-only or remove the exclusion entirely; both are single-file, non-destructive changes.'
    },
    {
      risk: 'The backfill script could mistakenly tag a real (non-template) deliverable on a non-orchestrator SD if its name happens to coincidentally match one of the 3 known titles.',
      probability: 'LOW',
      impact: 'LOW',
      mitigation: 'The backfill explicitly scopes its deliverable lookup to sd_id values belonging to sd_type=orchestrator SDs only, and further requires an exact deliverable_name match -- both conditions must hold. Live run found exactly 30 matching rows, all confirmed to be genuine coordination-template rows by manual inspection of a sample.',
      rollback_plan: 'metadata.coordination_only can be unset by a follow-up script targeting the same 30 row IDs logged by the original --execute run output.'
    },
    {
      risk: 'Orchestrator PRDs authored via the OTHER live path (the automatic LLM-based add-prd-to-database.js generator, used for every sd_type including orchestrator when generateParentPRD is not manually invoked) produce differently-phrased coordinator boilerplate that this fix\'s exact-title matching does not cover, and could still hit an equivalent CHILD_SCOPE_COVERAGE failure.',
      probability: 'MEDIUM (unmeasured -- no confirmed live instance found, but the code path exists)',
      impact: 'MEDIUM',
      mitigation: 'Out of scope for this SD, which targets exactly the QF\'s described 3-FR template defect (a live-confirmed, currently-blocking instance). Flagged in Explore evidence (row c886e65e) as a residual gap for a follow-up SD if LLM-authored orchestrator PRDs are later found to hit the same failure.',
      rollback_plan: 'N/A -- tracked as future scope, not a regression risk of this change.'
    }
  ],

  implementation_approach: {
    phases: [
      {
        phase: 'Phase 1: Mark the source and thread the marker',
        description: 'Add coordination_only:true to the 3 template FRs in parent-orchestrator-handler.js; thread it into extract-deliverables-from-prd.js\'s Option 2 deliverable metadata.',
        deliverables: ['Modified parent-orchestrator-handler.js', 'Modified extract-deliverables-from-prd.js']
      },
      {
        phase: 'Phase 2: Fix and harden the gate',
        description: 'Project metadata in the parentDeliverables query; implement the coordination-only exclusion (short-circuit before the child-deliverables query); harden with the name+flag guard.',
        deliverables: ['Modified child-scope-coverage.js', '4 new + 1 pre-existing regression tests in child-scope-coverage.test.js']
      },
      {
        phase: 'Phase 3: Backfill and verify live impact',
        description: 'Write and run the backfill script (dry-run first, then --execute) against all live orchestrator SDs; verify the previously-blocked SD\'s rows now carry the marker with prior metadata preserved.',
        deliverables: ['scripts/one-off/backfill-coordination-only-child-scope-coverage-001.mjs', 'Live verification query output']
      }
    ],
    technical_decisions: [
      'Exclude coordination-only deliverables from the denominator entirely (never scored, never uncovered) rather than auto-covering them or lowering the pass threshold -- chosen because it is semantically exact: these deliverables genuinely have no child-scoped equivalent to check against.',
      'Guard the exclusion with an exact-name allowlist in addition to the metadata flag -- chosen after VALIDATION flagged the unnamespaced-flag spoof risk, closing a real soundness gap before it could ever be exploited (even accidentally).',
      'Backfill via a merge-patch (spread existing metadata, add the new key) rather than a blind replace -- chosen because live rows already carry other metadata keys (e.g. orchestrator-completion-guardian\'s producer stamp) that must not be destroyed.'
    ]
  },

  integration_operationalization: {
    consumers: [
      {
        name: 'PLAN-TO-LEAD handoff callers for orchestrator-type SDs (worker/coordinator sessions running node scripts/handoff.js execute PLAN-TO-LEAD <SD-KEY>)',
        interaction: 'CHILD_SCOPE_COVERAGE is one of ~30-35 gates evaluated during PLAN-TO-LEAD for orchestrator SDs; it now auto-passes when the only parent deliverables are the coordination template, instead of unconditionally failing.',
        frequency: 'Every PLAN-TO-LEAD attempt for every orchestrator-type SD.'
      },
      {
        name: 'The 10 live orchestrator SDs backfilled by this fix (SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001 and 9 others)',
        interaction: 'Their next PLAN-TO-LEAD attempt reads the newly-backfilled metadata.coordination_only marker and can pass CHILD_SCOPE_COVERAGE where it previously could not.',
        frequency: 'Once, on their next PLAN-TO-LEAD attempt after this fix merges.'
      },
      {
        name: 'Future orchestrator SDs created via ParentOrchestratorHandler.generateParentPRD',
        interaction: 'Their 3 template FRs are tagged coordination_only:true at extraction time, so they never hit this defect in the first place.',
        frequency: 'Every future manual invocation of generateParentPRD.'
      }
    ],
    dependencies: [
      {
        name: 'extractAndPopulateDeliverables (scripts/modules/handoff/extract-deliverables-from-prd.js)',
        type: 'upstream',
        contract: 'Reads prd.functional_requirements and writes sd_scope_deliverables rows. This fix adds one new field (metadata) to the object it already pushes for Option 2 -- no signature change to the exported function.',
        failure_handling: 'skipIfExists:true (existing default, unchanged) means a PRD whose deliverables already exist is not re-extracted; this is why the backfill script exists as a separate remediation path for pre-existing rows.'
      },
      {
        name: 'safeQuery (lib/db/safe-query.mjs)',
        type: 'upstream',
        contract: 'Wraps the widened select call; unchanged call signature, only the select string argument is widened by one column.',
        failure_handling: 'Unchanged -- safeQuery still throws on a genuine query error, distinct from a legitimate zero-row result.'
      },
      {
        name: 'ValidationOrchestrator / gate pipeline (downstream)',
        type: 'downstream',
        contract: 'Consumes the gate\'s normalized {passed, score, confidence, details} object exactly as before -- no orchestrator-side change required. New details fields (templateOnly, templateExcluded) are additive.',
        failure_handling: 'Unaffected by this fix; existing required:true blocking behavior for orchestrator-type SDs is preserved.'
      }
    ],
    data_contracts: [
      {
        contract_name: 'sd_scope_deliverables.metadata.coordination_only',
        schema: '{ coordination_only?: true } (boolean, present only when true; absent/false for all other deliverables)',
        validation: 'Enforced by TS-3/TS-4: the gate only treats a row as coordination-only when BOTH this flag is true AND deliverable_name exactly matches one of the 3 known titles.',
        versioning: 'No schema migration -- metadata is an existing JSONB column; this is a new, additive key within it.'
      },
      {
        contract_name: 'CHILD_SCOPE_COVERAGE gate result details shape',
        schema: '{ isOrchestrator, parentDeliverables: number (substantive count), templateExcluded: number, childCount, completedChildren, childDeliverables, covered, uncovered: string[] } | { isOrchestrator, childCount, parentDeliverables: number (total), templateOnly: number } for the all-template short-circuit',
        validation: 'Enforced by TS-2/TS-3 asserting the exact details field values for each scenario class.',
        versioning: 'Internal gate-result contract; no external/persisted schema versioning needed.'
      }
    ],
    runtime_config: {
      environment_variables: [],
      feature_flags: [],
      deployment_considerations: 'No new env vars or feature flags. Pure, additive JS-module logic change plus a one-time data backfill (already run against production as part of this SD\'s own EXEC work, not a deploy-time step). Deploys via a normal PR merge to main; any running LEO worker/coordinator process picks up the new gate code on its next fresh process start.'
    },
    observability_rollout: {
      monitoring: [
        'Existing per-handoff console output already prints this gate\'s score and pass/fail plus the new templateExcluded count in the "Coverage:" log line -- no new instrumentation needed.',
        'The backfill script\'s own dry-run and --execute output (row-by-row, SD-key-labeled) doubles as a one-time observability artifact for what was changed and where.'
      ],
      alerts: [],
      rollout_strategy: 'Standard PR merge to main. The backfill is a separate, already-executed one-time data fix (not gated behind the PR merge) -- it was run directly against production during this SD\'s EXEC phase since the live blocking instance needed immediate remediation, independent of when the code fix itself ships.',
      rollback_trigger: 'Any orchestrator SD newly failing CHILD_SCOPE_COVERAGE after this change that was passing before, or a report that a genuinely under-scoped orchestrator now falsely passes.',
      rollback_procedure: 'git revert the gate/extractor/handler commits (pure function changes, no schema migration). The backfilled metadata.coordination_only keys are harmless to leave in place even after a code revert, since the gate reverting to its old behavior simply stops reading that key.'
    }
  },

  exploration_summary: {
    files_read: [
      'scripts/modules/handoff/executors/plan-to-lead/gates/child-scope-coverage.js',
      'scripts/modules/handoff/executors/plan-to-lead/gates/child-scope-coverage.test.js',
      'scripts/modules/handoff/extract-deliverables-from-prd.js',
      'scripts/modules/parent-orchestrator-handler.js',
      'scripts/modules/handoff/executors/lead-to-plan/gates/overlapping-scope-detection.js',
      'scripts/modules/governance/cascade-validator.js',
      'scripts/modules/handoff/executors/exec-to-plan/gates/cascade-alignment-gate.js',
      'scripts/modules/handoff/executors/exec-to-plan/gates/cross-child-integration-gate.js',
      'scripts/modules/handoff/executors/lead-to-plan/prd-generation.js',
      'scripts/orchestrator-preflight.js',
      'scripts/modules/handoff/validation/semantic-gate-utils.js',
      'scripts/modules/handoff/auto-complete-deliverables.js',
      'scripts/modules/handoff/orchestrator-completion-guardian.js',
      'tests/factories/queued-supabase-mock.js'
    ],
    patterns_identified: [
      'Semantic gate result shape via buildSemanticResult/buildSkipResult (semantic-gate-utils.js) -- passed/score/confidence/details, with a low-confidence-degrades-to-warning rule this SD deliberately avoids relying on (computeConfidence measures row volume, not match quality, and always returned 1.0 for this defect, per the original QF text).',
      'createQueuedSupabaseMock ignores .select() projection arguments entirely -- a real, documented blind spot for any test asserting behavior that depends on which columns were actually requested, which is exactly what caused the pre-merge no-op defect to read as tested.',
      'Metadata-merge-not-replace pattern already established by orchestrator-completion-guardian.js:755 ({ ...(deliverable.metadata || {}), producer: ... }) -- the backfill script follows the same convention.'
    ],
    key_decisions: [
      'Chose to exclude coordination-only deliverables from the denominator entirely rather than lowering the pass threshold or auto-covering them -- semantically exact, and the narrowest possible change to the scoring logic.',
      'Chose a name+flag guard over a flag-only guard after VALIDATION identified the unnamespaced-JSONB-flag spoof risk -- closes a real soundness gap discovered during review, not just a hypothetical.',
      'Chose to write and run a backfill immediately rather than leaving pre-existing blocked orchestrators to self-resolve, after Explore found a live, currently-blocking instance (SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001) that skipIfExists:true would otherwise leave permanently unfixed by this change alone.'
    ],
    exploration_date: new Date().toISOString().slice(0, 10)
  }
};

const { data: existingPrd } = await supabase
  .from('product_requirements_v2')
  .select('id')
  .eq('id', PRD_ID)
  .maybeSingle();

const row = {
  id: PRD_ID,
  sd_id: SD_UUID,
  title: 'Fix CHILD_SCOPE_COVERAGE for orchestrator coordination-only template',
  status: 'approved',
  category: 'Fix',
  priority: 'high',
  version: '1.0',
  phase: 'planning',
  created_by: 'PLAN',
  executive_summary: content.executive_summary,
  functional_requirements: content.functional_requirements,
  technical_requirements: content.technical_requirements,
  system_architecture: content.system_architecture,
  test_scenarios: content.test_scenarios,
  acceptance_criteria: content.acceptance_criteria,
  risks: content.risks,
  implementation_approach: content.implementation_approach,
  integration_operationalization: content.integration_operationalization,
  exploration_summary: content.exploration_summary,
  metadata: {
    generated_via: 'inline_claude_code',
    source_qf_id: 'QF-20260911-793',
    lead_validation_evidence_id: '6807b6c6-e149-4e0b-a48d-f3c9f360e7cf',
    lead_explore_evidence_id: 'c886e65e-e9bb-487f-96af-41a96a539a9e',
    generation_method: 'inline-direct',
    grounding_confidence: 0.95,
  },
};

let result;
if (existingPrd) {
  result = await supabase.from('product_requirements_v2').update(row).eq('id', PRD_ID).select().single();
} else {
  result = await supabase.from('product_requirements_v2').insert(row).select().single();
}

if (result.error) {
  console.error('❌ PRD insert/update failed:', result.error.message);
  process.exit(1);
}

console.log('✅ PRD', existingPrd ? 'updated' : 'inserted', ':', result.data.id);
console.log('   executive_summary length:', content.executive_summary.length, 'chars');
console.log('   functional_requirements:', content.functional_requirements.length);
console.log('   technical_requirements:', content.technical_requirements.length);
console.log('   test_scenarios:', content.test_scenarios.length);
console.log('   risks:', content.risks.length);
