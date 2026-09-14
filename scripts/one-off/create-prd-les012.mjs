#!/usr/bin/env node
// SD-LEARN-FIX-ADDRESS-PAT-LES-012 -- PLAN phase PRD creation.
// Uses the canonical createPRDWithValidatedContent() helper (scripts/prd/prd-creator.js)
// per CLAUDE_PLAN.md's "generate first, then insert" inline-mode pattern, incorporating
// the LEAD-phase scope correction (SD description) plus the VALIDATION, TESTING and
// DATABASE sub-agent measurement-based findings (sub_agent_execution_results rows
// 53910d3f, a0b168bb, 8ba5e6c0).
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { createPRDWithValidatedContent } from '../prd/prd-creator.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-012';
// strategic_directives_v2.id is heterogeneous (UUID for some rows, the sd_key string for
// others -- see TESTING finding F5 precedent). For THIS row, id === sd_key (verified live);
// product_requirements_v2.sd_id's FK targets strategic_directives_v2.id, so sdIdValue must
// be the literal `id` column value, NOT uuid_id/uuid_internal_pk.
const SD_UUID = 'SD-LEARN-FIX-ADDRESS-PAT-LES-012';
const PRD_ID = 'PRD-SD-LEARN-FIX-ADDRESS-PAT-LES-012';
const PRD_TITLE = 'Close the integration_operationalization write-path leak and backfill NULL rows without fabrication';

const llmContent = {
  executive_summary: 'Add a shared, gate-parity-preserving default-builder to all 3 PRD write paths so integration_operationalization never lands NULL, and backfill 1,570 existing NULL rows with the same non-fabricated placeholder.',

  functional_requirements: [
    {
      id: 'FR-1',
      requirement: 'Export isSubsectionEmpty, validateIntegrationContent and REQUIRED_SUBSECTIONS from scripts/modules/handoff/executors/plan-to-exec/gates/integration-section-validation.js',
      description: 'Additive export-only change (no behavior change to the existing gate). This is the single source of truth for "what counts as empty" that the default-builder, the backfill script, and every new test import — preventing the predicate-drift class of bug that let the prior fabricating backfill ship a test asserting its own corruption as correct (evidence: tests/unit/backfill-prd-integration.test.js, TESTING finding F8).',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-1: isSubsectionEmpty, validateIntegrationContent, REQUIRED_SUBSECTIONS are named exports of the gate module',
        'AC-2: Existing gate behavior (the createIntegrationSectionValidationGate factory export and its validator) is byte-identical before/after — existing gate tests still pass unmodified',
        'AC-3: No new import cycle introduced (prd-creator.js and integration-check.js importing FROM the gate module, never the reverse)'
      ]
    },
    {
      id: 'FR-2',
      requirement: 'Add buildDefaultIntegrationOperationalization() returning a 5-key object with every value the literal null, and apply it at all 3 write paths in scripts/prd/prd-creator.js',
      description: 'Write paths: line 457 (INSERT inside createPRDWithValidatedContent, currently "llmContent.integration_operationalization || null"), line 334 (UPDATE-existing branch, currently "|| undefined" which omits the key entirely and leaves a pre-existing NULL row untouched), and line 715 inside updatePRDWithLLMContent (currently "if (truthy) assign", same silent-NULL effect). Shape is measurement-verified (DATABASE + TESTING sub-agent rows 8ba5e6c0 / a0b168bb) to be the ONLY placeholder shape with parity across all 4 readers: gate .passed/.score identical to NULL for every sd_type, lib/eva/prd-auto-iterate.js quality-score contribution +0 (an empty-array or empty-object-per-key shape is TRUTHY in JS and scores +15, measurement-indistinguishable from the 707 rows already fabricated by the prior backfill script), trigger-legal, and exactKeys-legal under lib/artifact-contracts authoring mode.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-1: buildDefaultIntegrationOperationalization() returns {consumers: null, dependencies: null, data_contracts: null, runtime_config: null, observability_rollout: null} using REQUIRED_SUBSECTIONS from FR-1 (not a hardcoded key list)',
        'AC-2: A new PRD created via any of the 3 write paths without an explicit integration_operationalization payload receives this default, never null, for every sd_type (not just feature/bugfix)',
        'AC-3: When llmContent DOES supply integration_operationalization, all 3 paths pass it through unchanged (the default never clobbers real authored content)',
        'AC-4: validateIntegrationContent(default).presentSubsections.length === 0 -- the anti-fabrication invariant this SD exists to enforce'
      ]
    },
    {
      id: 'FR-3',
      requirement: 'Fix the "fix" -> "bugfix" sd_type naming drift in prd-creator.js\'s authoring-time warn-list (lines 357 and 736)',
      description: 'The warn-list currently checks sd_type IN [feature, "fix"], but the live SD-type vocabulary and the gate itself use "bugfix" (631 live SDs of type bugfix, 0 of type "fix" -- lib/sd-creation/pipeline.js normalizes fix->bugfix at SD creation, so "fix" is unreachable by construction). The authoring-time warning therefore never fires for a real bugfix PRD missing this section.',
      priority: 'MEDIUM',
      acceptance_criteria: [
        'AC-1: The warn-list at both call sites reads sd_type IN [feature, bugfix]',
        'AC-2: A regression test with sdData.sd_type=bugfix and no integration_operationalization content asserts the console.warn fires at both sites'
      ]
    },
    {
      id: 'FR-4',
      requirement: 'Teach scripts/modules/uat-assessment/sections/integration-check.js to treat an all-subsections-empty integration_operationalization object as equivalent to null',
      description: 'fetchIntegrationDataFromPRD returns prd?.integration_operationalization || null; runIntegrationCheck early-returns passed:true when !data. After the backfill/default land, this reader will instead receive a truthy 5-null-key object and run validateConsumerPresence against it, which fails for every infrastructure SD (measured: NULL=passed:true, all 4 candidate placeholder shapes=passed:false -- TESTING finding F2). This function currently has zero live callers (confirmed by both DATABASE and TESTING sub-agents), so today\'s blast radius is zero, but the gate-only exit predicate for this SD cannot see this regression, and shipping it unfixed plants a landmine for whenever the reader is wired. Fix: at the top of runIntegrationCheck (or inside fetchIntegrationDataFromPRD), if every one of the 5 canonical keys is empty per isSubsectionEmpty (imported from FR-1\'s export), treat data as null -- reproducing the current NULL branch exactly.',
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-1: runIntegrationCheck(prd_with_default_placeholder, "infrastructure") returns an identical {passed, errors, warnings} object to runIntegrationCheck(prd_with_null, "infrastructure")',
        'AC-2: The check imports isSubsectionEmpty from the gate module (FR-1) rather than re-implementing the emptiness predicate',
        'AC-3: A row with genuine (non-default) integration content still validates normally -- this fix only collapses the all-empty case, not partial content'
      ]
    },
    {
      id: 'FR-5',
      requirement: 'Backfill the 1,570 currently-NULL product_requirements_v2.integration_operationalization rows using keyset pagination, a single sd_id join, no exclusions, and off-column provenance',
      description: 'Join: product_requirements_v2.sd_id = strategic_directives_v2.id (measured to resolve all 1,570/1,570 rows with zero disagreement against a directive_id-based count -- the earlier "14 orphans / dual-key join" framing was an artifact of joining the wrong column). No exclusions: include documentation (23 rows) and orchestrator (168 rows) identically with everyone else -- a distinct not-applicable marker is trigger-illegal (proven live: any 6th key raises validate_integration_section_keys()), and excluding them just perpetuates the NULL state this SD exists to close. Pagination: keyset (ORDER BY id, .gt(id, lastId)), NOT .range(offset) -- the prior fabricating backfill used offset pagination over its own shrinking NULL predicate and silently skipped roughly half the corpus each pass (TESTING finding F10), which is the actual reason only 707 rows got corrupted instead of the full historical population. Provenance: written to product_requirements_v2.metadata.integration_backfill = {at, sd, script, reason, shape_version} in the SAME UPDATE statement as the column write (the trigger only fires BEFORE INSERT OR UPDATE OF integration_operationalization and does not inspect metadata, so this is safe and does not trip it).',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-1: Dry-run mode enumerates exactly the live COUNT of NULL rows at run time and performs zero writes',
        'AC-2: A live run writes to every enumerated row exactly once (idempotent: a second run writes 0 rows because the predicate is integration_operationalization IS NULL)',
        'AC-3: Post-run, SELECT COUNT(*) WHERE integration_operationalization IS NULL = 0',
        'AC-4: Every written row carries metadata.integration_backfill and gains no key outside the 5 canonical keys in integration_operationalization',
        'AC-5: The payload written is byte-equal to buildDefaultIntegrationOperationalization() output (FR-2) -- backfill and write-path default share one exported function, so they cannot diverge'
      ]
    },
    {
      id: 'FR-6',
      requirement: 'Retire or invert tests/unit/backfill-prd-integration.test.js, which currently asserts the fabricating template is correct and is green today',
      description: 'This file inlines a fabricating TYPE_TEMPLATES map (e.g. consumers[0].name = "LEO Protocol Engine") and asserts "generates all 5 required subsections" with substantive content -- it is the repo\'s only remaining reference to a since-archived generator and stands as documentation that fabrication is correct behavior. Replace with an anti-fabrication test asserting the new default-builder\'s output has presentSubsections.length === 0.',
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-1: The old fabricating assertions no longer exist in the test suite (file deleted or rewritten)',
        'AC-2: A new test asserts buildDefaultIntegrationOperationalization() output has presentSubsections.length === 0 for every sd_type',
        'AC-3: CI is green with the new test suite, not the old one'
      ]
    }
  ],

  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'Placeholder shape is exactly {consumers: null, dependencies: null, data_contracts: null, runtime_config: null, observability_rollout: null} -- never an empty array or empty object per key',
      rationale: 'Measured directly against 4 real readers (the PLAN-TO-EXEC gate, lib/artifact-contracts authoring-mode validation, the DB trigger, and lib/eva/prd-auto-iterate.js quality scorer): only the null-per-key shape achieves parity on ALL FOUR simultaneously. Empty arrays/objects are JS-truthy, scoring +15 on prd-auto-iterate and becoming indistinguishable from the 707 rows the prior backfill already fabricated.'
    },
    {
      id: 'TR-2',
      requirement: 'Backfill and default-builder join/resolve strictly via product_requirements_v2.sd_id = strategic_directives_v2.id',
      rationale: 'Live measurement resolved all 1,570 target rows via this single column with zero cross-check disagreement against directive_id. Any unresolved row via sd_id after this SD ships is therefore a stop-and-investigate signal (the corpus changed unexpectedly), never a routine skip path.'
    },
    {
      id: 'TR-3',
      requirement: 'Backfill script uses keyset pagination (ORDER BY id ASC, WHERE id > :lastId) rather than offset/.range()',
      rationale: 'The archived fabricator used .range(offset, offset+BATCH-1) combined with a shrinking WHERE integration_operationalization IS NULL predicate -- each write shrinks the matched set, so each subsequent offset page silently skips unprocessed rows. This is the documented root cause of why only 707 of a much larger NULL population were ever touched.'
    },
    {
      id: 'TR-4',
      requirement: 'Backfill provenance is written to product_requirements_v2.metadata, never inside the integration_operationalization column',
      rationale: 'validate_integration_section_keys() (database/migrations/20260214_integration_section_key_validation.sql) whitelists exactly the 5 canonical keys and raises on any other -- proven live in a rolled-back transaction. A top-level marker key aborts the UPDATE; a marker nested inside a subsection makes that subsection non-empty, breaking the anti-fabrication invariant this SD is built to guarantee.'
    }
  ],

  system_architecture: {
    overview: 'A single shared emptiness predicate (exported from the existing PLAN-TO-EXEC gate module) becomes the one source of truth consumed by three independent call sites: the PRD write-path default-builder (prd-creator.js), the one-time backfill script, and the UAT integration-check reader. This eliminates the predicate-drift class of defect that let the previous ad-hoc backfill fabricate content and pass its own hand-rolled correctness test.',
    components: [
      {
        name: 'Gate module additive exports',
        responsibility: 'Exposes isSubsectionEmpty, validateIntegrationContent, and REQUIRED_SUBSECTIONS as the single shared emptiness predicate and canonical key list',
        technology: 'Node.js / CommonJS-ESM module (scripts/modules/handoff/executors/plan-to-exec/gates/integration-section-validation.js)'
      },
      {
        name: 'buildDefaultIntegrationOperationalization()',
        responsibility: 'Returns the canonical null-per-key placeholder object, imported by all 3 PRD write paths and by the backfill script',
        technology: 'scripts/prd/prd-creator.js, following the existing buildDefaultSystemArchitecture()/buildDefaultImplementationApproach() pattern in the same file'
      },
      {
        name: 'One-time backfill script',
        responsibility: 'Keyset-paginated UPDATE of the 1,570 currently-NULL rows, dry-run capable, idempotent, provenance-stamped via metadata',
        technology: 'scripts/one-off/backfill-integration-operationalization-v2.mjs (new), Supabase client'
      },
      {
        name: 'integration-check.js reader guard',
        responsibility: 'Treats an all-empty integration_operationalization object identically to null, preventing a silent passed:true -> passed:false flip once this currently-unwired reader is activated',
        technology: 'scripts/modules/uat-assessment/sections/integration-check.js'
      }
    ],
    data_flow: 'PLAN authors a PRD (via add-prd-to-database.js or any of the 4 revise-prd-*.mjs one-off callers) -> prd-creator.js writes the row, applying the default when the LLM payload omits the section -> the PLAN-TO-EXEC gate reads the column at handoff time (blocking for feature/bugfix, warning for infrastructure, skipped for documentation) -> downstream readers (UAT integration-check, EVA prd-auto-iterate quality scorer) consume the same column later in the SD lifecycle. The backfill script performs the same write, once, against the existing NULL corpus, using the identical default-builder output so the two paths cannot diverge.',
    integration_points: [
      'scripts/prd/prd-creator.js (3 write paths: createPRDWithValidatedContent INSERT, its UPDATE-existing branch, updatePRDWithLLMContent)',
      'scripts/modules/handoff/executors/plan-to-exec/gates/integration-section-validation.js (PLAN-TO-EXEC gate + new additive exports)',
      'scripts/modules/uat-assessment/sections/integration-check.js (UAT reader, currently unwired)',
      'lib/eva/prd-auto-iterate.js (EVA PRD quality scorer, read-only consumer -- no change needed, parity confirmed by measurement)',
      'database/migrations/20260214_integration_section_key_validation.sql (validate_integration_section_keys trigger -- read-only constraint, no change needed)'
    ]
  },

  test_scenarios: [
    {
      id: 'TS-1',
      scenario: 'Default-builder applied at all 3 PRD write paths when the LLM payload omits the section',
      test_type: 'unit',
      given: 'llmContent.integration_operationalization is absent',
      when: 'createPRDWithValidatedContent (INSERT), its UPDATE-existing branch, and updatePRDWithLLMContent are each invoked (mocked Supabase client, captured payload)',
      then: 'The captured payload for all 3 paths carries buildDefaultIntegrationOperationalization() output, never null or undefined'
    },
    {
      id: 'TS-2',
      scenario: 'Real authored content is never clobbered by the default',
      test_type: 'unit',
      given: 'llmContent.integration_operationalization contains genuine, non-empty subsections',
      when: 'Any of the 3 write paths is invoked',
      then: 'The captured payload passes the authored content through unchanged'
    },
    {
      id: 'TS-3',
      scenario: 'Anti-fabrication invariant on the default-builder output',
      test_type: 'unit',
      given: 'buildDefaultIntegrationOperationalization() is called',
      when: 'validateIntegrationContent(output) is run for every live sd_type',
      then: 'presentSubsections.length === 0 and completenessScore === 0 in every case -- this is the assertion that would have caught the 707-row prior corruption'
    },
    {
      id: 'TS-4',
      scenario: 'Gate-verdict parity: NULL vs. default placeholder',
      test_type: 'integration',
      given: 'The real createIntegrationSectionValidationGate().validator() is driven with a mock ctx',
      when: 'integration_operationalization is null vs. the default placeholder, for every live sd_type',
      then: '.passed and .score are byte-identical between the two for every sd_type (feature/bugfix stay passed=false score=0; infrastructure/orchestrator/etc. stay passed=true score=50 WARN; documentation stays passed=true score=100 SKIP); missingSubsections.length + emptySubsections.length === 5 in both cases (list identity is explicitly NOT asserted -- the MISSING->INCOMPLETE statusCode transition is expected and documented)'
    },
    {
      id: 'TS-5',
      scenario: 'End-to-end backfill parity probe against real sampled rows',
      test_type: 'e2e',
      given: 'A sample of >=20 real currently-NULL PRD rows spanning all sd_types including feature and bugfix (the gate\'s BLOCKING types)',
      when: 'The real gate verdict is recorded per row before the backfill, the backfill runs against the sample, and the verdict is re-recorded after',
      then: 'The before/after diff on {passed, score, presentSubsections.length} is empty for every sampled row; results are written to a runner-produced JSON evidence file whose hash is cited in the TESTING verdict row per the gate-evidence provenance rule'
    },
    {
      id: 'TS-6',
      scenario: 'Backfill migration correctness: join, pagination, exclusions, trigger legality, idempotence',
      test_type: 'integration',
      given: 'A representative fixture spanning multiple sd_types including documentation and orchestrator rows, plus a live throwaway-PRD fixture for the trigger check',
      when: 'The backfill script runs in dry-run then live mode twice',
      then: 'The dry-run count equals the live NULL count; the enumerator visits every distinct id exactly once (keyset, not offset-skippable); documentation and orchestrator rows receive the identical placeholder (no exclusion); the exact write payload is accepted by the live validate_integration_section_keys() trigger and a deliberately-added 6th key is rejected by the same trigger (proving the test exercises the real trigger); every written row carries metadata.integration_backfill; and the second run writes 0 rows'
    },
    {
      id: 'TS-7',
      scenario: 'Downstream UAT consumer parity after the integration-check.js reader fix',
      test_type: 'integration',
      given: 'sd_type=infrastructure and sd_type=feature PRDs with integration_operationalization = null vs. the default placeholder',
      when: 'runIntegrationCheck / validateConsumerPresence is invoked for both',
      then: '{passed, errors.length} is identical between null and the default for both sd_types -- this test is expected to be RED before the FR-4 fix lands and is its acceptance test'
    },
    {
      id: 'TS-8',
      scenario: 'sd_type naming-drift fix fires the authoring-time warning for real bugfix PRDs',
      test_type: 'unit',
      given: 'sdData.sd_type = "bugfix" and llmContent has no integration_operationalization content',
      when: 'The PRD write path runs',
      then: 'console.warn fires at both the line-357 and line-736 call sites (previously dead for sd_type=bugfix because the list checked the unreachable "fix" value)'
    },
    {
      id: 'TS-9',
      scenario: 'Security/permissions: backfill script requires the service-role client and cannot run against a read-only/anon connection',
      test_type: 'security',
      given: 'The backfill script is invoked',
      when: 'It initializes its Supabase client',
      then: 'It uses createSupabaseServiceClient() (never an anon/public key), matching every other one-off DB-writing script in the repo'
    },
    {
      id: 'TS-10',
      scenario: 'Performance: the backfill completes the full 1,570-row corpus within one CI-friendly run',
      test_type: 'performance',
      given: 'The live NULL corpus (1,570 rows at measurement time)',
      when: 'The backfill runs in batches with keyset pagination',
      then: 'The full run completes in a bounded number of batches with no single batch exceeding the PostgREST row cap, and total wall time is logged in the run summary'
    }
  ],

  acceptance_criteria: [
    'Zero product_requirements_v2 rows have integration_operationalization IS NULL immediately after this SD ships (measured by direct query)',
    'For every sd_type, the PLAN-TO-EXEC gate .passed and .score are byte-identical between the pre-backfill NULL state and the post-backfill default placeholder, verified across a real sample including feature/bugfix rows specifically',
    'presentSubsections.length === 0 for buildDefaultIntegrationOperationalization() output at every sd_type -- the anti-fabrication invariant',
    'runIntegrationCheck/validateConsumerPresence returns identical {passed, errors} for null vs. the default placeholder at sd_type=infrastructure and sd_type=feature',
    'No product_requirements_v2 row gains a JSONB key outside the 5 canonical integration_operationalization subsections; the live trigger rejects a deliberate 6th-key test payload',
    'A new PRD created after this SD ships (any sd_type, any of the 3 write paths) never lands with integration_operationalization NULL, verified for at least one PRD per write path',
    'tests/unit/backfill-prd-integration.test.js no longer asserts the fabricating template is correct'
  ],

  risks: [
    {
      risk: 'The one-time backfill touches 1,570 production rows in a single logical operation; a partial failure mid-run could leave the corpus in a mixed state',
      probability: 'LOW',
      impact: 'MEDIUM',
      mitigation: 'Backfill is idempotent by construction (predicate is always integration_operationalization IS NULL, keyset-paginated with per-batch commits, dry-run mode required before the live run, and a post-run assertion that the remaining NULL count is 0)',
      rollback_plan: 'A partial run is self-healing on re-invocation (only touches rows still NULL); a full rollback simply re-nulls the specific rows carrying metadata.integration_backfill from this SD run, identifiable by the provenance marker'
    },
    {
      risk: 'The write-path default-builder change touches prd-creator.js, which is imported by 4 scripts/one-off/revise-prd-*.mjs callers and 2 scripts/one-off/create-prd-dedicated-venture-uat-001-*.mjs callers besides the canonical add-prd-to-database.js flow',
      probability: 'LOW',
      impact: 'MEDIUM',
      mitigation: 'The change is a pure additive fallback (|| buildDefaultIntegrationOperationalization()) with no signature change to any exported function -- confirmed by a live call-site audit (TESTING finding F11) that every caller passes an llmContent object and none constructs the insert payload directly',
      rollback_plan: 'Revert the prd-creator.js commit; the default-builder function and its 3 call sites are isolated to that one file'
    },
    {
      risk: 'The integration-check.js reader fix changes behavior for a code path with zero live callers today, so a mistake here would not surface in current CI or production traffic',
      probability: 'MEDIUM',
      impact: 'LOW',
      mitigation: 'A dedicated parity regression test (TS-7) asserts identical behavior for null vs. default at the two most consequential sd_types (infrastructure, feature) and is added to the standard CI suite, so any future accidental behavior change is caught even though nothing calls this reader today',
      rollback_plan: 'Revert the integration-check.js commit independently of the other 2 fixes -- it is architecturally isolated'
    },
    {
      risk: 'Exporting previously-internal gate functions (isSubsectionEmpty, validateIntegrationContent) could later be treated as a stable public API by unrelated future callers, creating an unintended coupling',
      probability: 'LOW',
      impact: 'LOW',
      mitigation: 'Export only the 2 specific functions plus the REQUIRED_SUBSECTIONS constant, all documented as consumed by prd-creator.js, the backfill script, and the new test suite; no change to any existing export',
      rollback_plan: 'Removing the exports is a revertible, additive-only change with no other in-repo consumer beyond the 3 named in this PRD (verified by the call-site audit)'
    }
  ],

  implementation_approach: {
    phases: [
      {
        phase: 'Phase 1: Shared predicate',
        description: 'Export isSubsectionEmpty, validateIntegrationContent, REQUIRED_SUBSECTIONS from the gate module (FR-1) -- additive only, ships first so every subsequent phase imports from one source',
        deliverables: ['Gate module export additions', 'Existing gate test suite green, unmodified']
      },
      {
        phase: 'Phase 2: Write-path fix',
        description: 'Add buildDefaultIntegrationOperationalization() and apply at prd-creator.js:457, :334, :715; fix the fix->bugfix naming drift (FR-2, FR-3)',
        deliverables: ['buildDefaultIntegrationOperationalization() in prd-creator.js', 'All 3 write paths updated', 'Unit tests TS-1, TS-2, TS-3, TS-8']
      },
      {
        phase: 'Phase 3: Downstream reader guard',
        description: 'Fix integration-check.js to treat the all-empty default as equivalent to null (FR-4)',
        deliverables: ['integration-check.js reader fix', 'Parity test TS-7']
      },
      {
        phase: 'Phase 4: Backfill script',
        description: 'Author the keyset-paginated, provenance-stamped backfill script with dry-run mode (FR-5)',
        deliverables: ['scripts/one-off/backfill-integration-operationalization-v2.mjs', 'Migration correctness tests TS-6']
      },
      {
        phase: 'Phase 5: Regression suite + retire the fabricating test',
        description: 'Add gate-verdict-parity regression tests (TS-4) and retire/invert the old fabricating test (FR-6)',
        deliverables: ['tests/unit/gates/integration-section-parity.test.js (new)', 'tests/unit/backfill-prd-integration.test.js retired or inverted']
      },
      {
        phase: 'Phase 6: Execute',
        description: 'Run the backfill in dry-run mode first, verify the enumerated count, then execute live against production data; run the end-to-end parity probe (TS-5)',
        deliverables: ['Dry-run + live run logs', 'Post-run NULL count = 0', 'End-to-end parity probe evidence file']
      }
    ],
    technical_decisions: [
      'Placeholder shape is null-per-key, not empty array/object -- the only shape measured to preserve parity across all 4 real readers (gate, trigger, prd-contract authoring mode, prd-auto-iterate quality scorer)',
      'Single join on product_requirements_v2.sd_id = strategic_directives_v2.id, not a dual-key directive_id join -- measured to resolve 100% of the target set with zero disagreement',
      'No exclusions for documentation/orchestrator rows -- a distinct marker is trigger-illegal and exclusion just perpetuates the problem this SD closes',
      'Provenance lives in metadata, never in the integration_operationalization column itself, to stay within the trigger\'s 5-key whitelist',
      'Keyset pagination, not offset/.range() -- directly addresses the root cause of the prior backfill\'s silent row-skipping'
    ]
  },

  integration_operationalization: {
    consumers: [
      { name: 'PLAN-phase sessions authoring or revising a PRD', interaction: 'Call scripts/add-prd-to-database.js (canonical CLI) or one of the 6 scripts/one-off/*.mjs callers of createPRDWithValidatedContent / updatePRDWithLLMContent, which now receive the default when they omit the section', frequency: 'Every PRD creation/update across the fleet -- currently ~1 in 7 new PRDs land with a missing section (measured monthly leak rate)' },
      { name: 'PLAN-TO-EXEC handoff gate (GATE_INTEGRATION_SECTION_VALIDATION)', interaction: 'Reads integration_operationalization per row at handoff time; blocking for feature/bugfix, warning for infrastructure, skipped for documentation', frequency: 'Every SD phase transition through PLAN-TO-EXEC' },
      { name: 'UAT integration-check reader (scripts/modules/uat-assessment/sections/integration-check.js)', interaction: 'Currently unwired (zero live callers); this SD immunizes it against a future silent regression before it is ever activated', frequency: 'None today; whenever this reader is wired in the future' },
      { name: 'EVA PRD quality scorer (lib/eva/prd-auto-iterate.js)', interaction: 'Reads the column to compute a PRD completeness score contribution; the default placeholder scores +0, matching the NULL baseline exactly', frequency: 'Every EVA PRD auto-iteration pass' }
    ],
    dependencies: [
      { name: 'validate_integration_section_keys() trigger (database/migrations/20260214_integration_section_key_validation.sql)', direction: 'upstream', failure_mode: 'A write outside the 5 canonical keys raises and aborts the statement -- this SD writes only within that whitelist, verified live' },
      { name: 'product_requirements_v2 table schema', direction: 'upstream', failure_mode: 'Column already exists (added 2026-02-02); no schema migration required by this SD' },
      { name: 'Every future SD\'s PLAN-TO-EXEC handoff', direction: 'downstream', failure_mode: 'A regression in the default-builder shape would silently degrade gate accuracy fleet-wide -- mitigated by the gate-verdict-parity regression suite (TS-4) added in this SD' }
    ],
    data_contracts: [
      { contract_name: 'integration_operationalization placeholder shape', schema: '{consumers: null, dependencies: null, data_contracts: null, runtime_config: null, observability_rollout: null} -- exactly the 5 canonical keys from REQUIRED_SUBSECTIONS, each value the JSON literal null', validation: 'validate_integration_section_keys() DB trigger (key whitelist) + validateIntegrationContent() gate function (emptiness/completeness scoring) + lib/artifact-contracts prd-contract.js exactKeys check in authoring mode', versioning: 'Provenance-stamped per backfilled row via metadata.integration_backfill.shape_version so a future shape change can distinguish rows written by this SD from later authored content' }
    ],
    runtime_config: {
      environment_variables: [],
      feature_flags: [],
      deployment_considerations: 'No new environment variables or feature flags. The write-path fix ships as a normal code deploy; the backfill is a one-time data-migration script run once (dry-run first, then live) after the code deploy lands, not on every deploy.'
    },
    observability_rollout: {
      monitoring: [
        'Post-deploy: SELECT COUNT(*) FROM product_requirements_v2 WHERE integration_operationalization IS NULL, expected to trend to 0 and stay there for newly-created rows',
        'Gate pass/fail rate for feature/bugfix sd_type SDs at PLAN-TO-EXEC, pre- vs. post-deploy, expected unchanged (the whole point of the parity invariant)'
      ],
      alerts: [
        'Any new NULL row appearing more than 24h after the write-path fix deploys indicates a 4th write path was missed and should page the on-call harness owner'
      ],
      rollout_strategy: 'Code fix (Phases 1-3) ships first and is verified via the regression suite before the one-time backfill (Phase 4-6) runs against production data',
      rollback_trigger: 'Gate-verdict-parity regression test failure, or a NULL-count divergence observed post-backfill',
      rollback_procedure: 'Revert the prd-creator.js / integration-check.js commits (isolated, additive-only changes); for the backfill, re-null the specific rows carrying this SD\'s metadata.integration_backfill provenance marker'
    }
  },

  exploration_summary: {
    files_read: [
      'scripts/prd/prd-creator.js',
      'scripts/modules/handoff/executors/plan-to-exec/gates/integration-section-validation.js',
      'scripts/modules/handoff/executors/plan-to-exec/index.js',
      'database/migrations/20260202_add_integration_operationalization_column.sql',
      'database/migrations/20260214_integration_section_key_validation.sql',
      'scripts/archive/one-time/backfill-prd-integration.js',
      'scripts/modules/uat-assessment/sections/integration-check.js',
      'lib/eva/prd-auto-iterate.js',
      'lib/artifact-contracts/prd-contract.js',
      'lib/sub-agents/design/index.js',
      'lib/sub-agents/database/index.js',
      'tests/unit/backfill-prd-integration.test.js',
      'tests/unit/gates/integration-section-validation-remediation.test.js',
      'lib/sd-creation/pipeline.js'
    ],
    patterns_identified: [
      'Existing default-builder precedent in prd-creator.js: system_architecture and implementation_approach already use a buildDefaultX() fallback pattern in the same insert object literal -- this SD extends that established pattern rather than inventing a new one',
      'The repo already has a self-inflicted precedent for this exact failure mode: a prior one-off backfill script fabricated boilerplate content that reads as complete to the gate but is meaningless, and a unit test was written asserting that fabrication is correct -- this SD is structured specifically to not repeat either mistake'
    ],
    key_decisions: [
      'Rejected empty-array/empty-object-per-key placeholder shapes after live measurement showed they inflate the EVA PRD quality scorer and are indistinguishable from known-fabricated rows; chose null-per-key instead, the only shape with measured parity across all 4 real readers',
      'Rejected excluding or distinctly marking documentation/orchestrator rows from the backfill after live-measuring that a distinct marker is trigger-illegal and exclusion just re-creates the NULL-shaped problem this SD exists to close',
      'Added the integration-check.js reader fix (FR-4) and the gate-module export (FR-1) to scope, beyond the SD\'s original two-item scope, because prospective TESTING and DATABASE sub-agent passes measured a real (if currently dormant) regression the original scope would have shipped'
    ],
    exploration_date: '2026-09-14'
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

  const stakeholderPersonas = ['Chairman (Solo Entrepreneur)', 'EVA (AI Chief of Staff)'];

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
