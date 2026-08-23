// SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-002 -- PRD creation via the canonical
// addPRDToDatabase() contentOverride hook (SD-FDBK-INFRA-ADD-PRD-DATABASE-001).
// This is NOT a hand-rolled insert -- it calls the same sanctioned function
// `node scripts/add-prd-to-database.js` uses, with pre-authored content so LLM
// generation is skipped but grounding + quality validation gates still run.
import { addPRDToDatabase } from '../prd/index.js';

const SD_KEY = 'SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-002';
const TITLE = 'Coordinator role-contract restructure: 3-file split, loop-registry governance, skill-file subordination';

const content = {
  executive_summary: "Splits CLAUDE_COORDINATOR.md into charter/manual/provenance (Adam's precedent), governs STANDARD_LOOPS in the charter, subordinates the skill+behavior docs, and consolidates duplicates without retiring governed directives.",

  functional_requirements: [
    {
      id: 'FR-1',
      requirement: 'Split CLAUDE_COORDINATOR.md into a charter/manual/provenance 3-file family, DB-generated, mirroring the Adam precedent.',
      description: "Add generateCoordinatorManual and generateCoordinatorProvenance to scripts/modules/claude-md-generator/file-generators.js mirroring generateAdamManual/generateAdamProvenance (:577-587) exactly. Wire both into index.js getFileSpecs() (:189-227) and KNOWN_GENERATED_FILES (:662-665). Add coordinator_manual and coordinator_provenance section_types to leo_protocol_sections with corresponding scripts/section-file-mapping.json entries. Migrate row 605's content into the split per the FR-4 KEEP/MERGE/MOVE ledger.",
      priority: 'CRITICAL',
      acceptance_criteria: [
        'generateCoordinatorManual/generateCoordinatorProvenance exist in file-generators.js and are wired into getFileSpecs()',
        'KNOWN_GENERATED_FILES count updated from 21 to 23 and tests/unit/protocol-publication-pipeline.test.js:158 assertion updated to match',
        'assertSharedSectionsNotCopied() passes with zero shared-row duplication after the new rows are added, verified by a full regeneration producing all 23 files',
        "A pre-migration snapshot of row 605's content is diffed against the post-split charter+manual+provenance union with zero orphaned/dropped sentences (M3)",
      ],
    },
    {
      id: 'FR-2',
      requirement: "Represent the STANDARD_LOOPS registry as a governed contract surface inside the charter, generated from (or drift-checked against) the live array -- never hand-typed prose.",
      description: "scripts/coordinator-startup-check.mjs's STANDARD_LOOPS array (session_arm/gha_backed contract, 08-22 cron ruling keep-list) currently appears nowhere in the charter. FR-2 adds a charter section for it, generated from or drift-checked against the live array so a later session_arm/gha_backed flip cannot silently desync the charter text from the code (the same drift class FR-3 closes for the skill file).",
      priority: 'HIGH',
      acceptance_criteria: [
        "Charter's loop-governance section is either generated from STANDARD_LOOPS at regeneration time, or a drift-check assertion fails when the array and the charter table diverge",
        "A test proves desync detection: flipping one entry's session_arm flag in a fixture fails the assertion (M9)",
        "The rule 'loop changes land in the registry, never ad hoc' is stated in the charter's obligation list",
      ],
    },
    {
      id: 'FR-3',
      requirement: 'Declare the coordinator skill file and behavior doc explicitly subordinate to the DB-generated charter, with drift detection on their doctrine-bearing sections.',
      description: "Add a machine-checkable SUBORDINATE-TO header to .claude/commands/coordinator.md and docs/protocol/fleet-coordinator-and-worker-behavior.md naming CLAUDE_COORDINATOR.md as canonical. Extend scripts/check-claude-md-drift.cjs (or add a new assertion) to catch drift in the skill's doctrine-bearing sections (sourcing first-check, gauge-integrity, ETA methodology) against their DB-sourced counterparts -- closing the class of bug where the skill referenced a retired SOURCING_* env-flag surface undetected (harness_backlog row 95a4b79b).",
      priority: 'HIGH',
      acceptance_criteria: [
        'Both files carry a machine-checkable subordination header naming the canonical charter source',
        'A regression test proves the harness_backlog-95a4b79b drift class (skill referencing a retired surface) would now be caught',
        "check-claude-md-drift.cjs requires no changes for the generic section-mapping split itself (Explore confirmed it is mapping-agnostic) -- FR-3's extension targets only the skill/behavior-doc doctrine sections",
      ],
    },
    {
      id: 'FR-4',
      requirement: "Consolidate the 2 genuinely duplicated 'comms MUST be typed' header instances into 1; move dated operator-directive clauses to PROVENANCE verbatim -- never delete governed content.",
      description: "RE-SCOPED at LEAD after risk-agent measurement: the original 'tripled utilization statements' framing was FALSE. Row 605's 8 'utilization' hits are 3 distinct dated operator directives (06-07, 06-10, 07-03) plus a resource-pool duty and an Adam-boundary clause -- not duplicates. Only the 2 verbatim 'comms MUST be typed' header instances are genuine duplicates. A clause-level KEEP/MERGE/MOVE ledger must be authored before any edit to row 605; dated directive clauses move to CLAUDE_COORDINATOR_PROVENANCE.md byte-identical, never deleted or paraphrased.",
      priority: 'CRITICAL',
      acceptance_criteria: [
        'A KEEP/MERGE/MOVE ledger enumerating all 8 measured "utilization" hits plus both "comms MUST be typed" instances exists before implementation begins (M2)',
        'Zero governed directive clauses are deleted -- only the 2 duplicate headers are collapsed to 1',
        'All moved dated-directive content is byte-identical in PROVENANCE to its pre-move form (no paraphrasing)',
      ],
    },
    {
      id: 'FR-5',
      requirement: 'Add a compact never-do block at the top of the charter with the same visual prominence as the existing duty list.',
      description: 'Add a DB-sourced never-do block (prod-migration prohibition, parent-SD dispatch prohibition, DOC-001) near the top of CLAUDE_COORDINATOR.md, correcting the current boundary-light asymmetry where these prohibitions are buried mid-paragraph.',
      priority: 'MEDIUM',
      acceptance_criteria: [
        'The never-do block appears within the first 20 lines of the generated CLAUDE_COORDINATOR.md',
        'It lists at minimum: prod-migration prohibition, parent-SD dispatch prohibition, and DOC-001',
        'The block is DB-sourced, verified by re-running node scripts/generate-claude-md-from-db.js and confirming it persists in the regenerated output',
      ],
    },
  ],

  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'Do not call scripts/protocol/adam-contract-land.mjs directly. Write a new coordinator-specific landing script mirroring its SHAPE (staleness guard vs. pre-migration snapshot, companions-before-contract ordering) with its own row IDs/paths.',
      rationale: 'VALIDATION sub-agent confirmed by reading the file that adam-contract-land.mjs is hard-wired to Adam row IDs/paths/artifact filenames at every seam -- not a reusable library. Calling it against coordinator data would corrupt Adam state or throw on mismatched row IDs.',
    },
    {
      id: 'TR-2',
      requirement: 'All changes to file-generators.js, index.js, and section-file-mapping.json must be purely additive -- never restructure existing coordinator_role_contract/role_partnership_contract mapping entries or existing generator function bodies.',
      rationale: 'Sibling SD SD-LEO-INFRA-SOLOMON-ROLE-CONTRACT-001 converges on the same 3 files for a different role. Additive changes (new functions/entries) merge cleanly regardless of which SD lands first.',
    },
    {
      id: 'TR-3',
      requirement: "Do not justify the file split on Read-tool token-cap grounds in documentation or commit messages.",
      rationale: "VALIDATION sub-agent measured CLAUDE_COORDINATOR.md at ~6.6k tokens (26,580B), well under the 25k-token cap. Adam's split was justified by a real cap failure at ~26k tokens (103,790B). Citing the same rationale here would encode a false premise for future maintainers.",
    },
    {
      id: 'TR-4',
      requirement: '.docmon/rules.json root_allowlist must include CLAUDE_COORDINATOR_MANUAL.md and CLAUDE_COORDINATOR_PROVENANCE.md before the new files are committed.',
      rationale: "Explore confirmed the allowlist currently lists CLAUDE_COORDINATOR.md and CLAUDE_COORDINATOR_DIGEST.md but not the 2 new companions, mirroring the existing CLAUDE_ADAM_MANUAL.md/CLAUDE_ADAM_PROVENANCE.md entries that must be added for Coordinator too.",
    },
  ],

  system_architecture: {
    overview: 'A DB-driven documentation generator (scripts/generate-claude-md-from-db.js + scripts/modules/claude-md-generator/) renders CLAUDE_*.md files from leo_protocol_sections rows via a declarative section_type-to-file mapping (scripts/section-file-mapping.json). This SD extends that pipeline with 2 new coordinator-specific output files using the same generic companion-generator primitive already shared by Adam/LEAD/PLAN/Solomon manuals, plus a governance layer over the previously-uncontracted STANDARD_LOOPS registry and skill/behavior-doc subordination.',
    components: [
      { name: 'file-generators.js companion generators', responsibility: 'Render CLAUDE_COORDINATOR_MANUAL.md / CLAUDE_COORDINATOR_PROVENANCE.md from mapped leo_protocol_sections rows using the existing generateAdamCompanion primitive', technology: 'Node.js ESM, scripts/modules/claude-md-generator/file-generators.js' },
      { name: 'section-file-mapping.json', responsibility: 'Declarative section_type-to-output-file mapping consumed by both the generator and check-claude-md-drift.cjs', technology: 'JSON config' },
      { name: 'leo_protocol_sections (DB)', responsibility: 'Source of truth for all charter/manual/provenance content; 2 new section_types added (coordinator_manual, coordinator_provenance)', technology: 'Supabase/Postgres' },
      { name: 'Coordinator-specific landing script (new)', responsibility: "One-time migration splitting row 605's content into charter+manual+provenance rows per the FR-4 ledger, with a staleness guard against a pre-migration snapshot", technology: "Node.js one-off script, mirroring adam-contract-land.mjs's shape" },
      { name: 'STANDARD_LOOPS governance table', responsibility: "Charter-embedded, array-generated (or drift-checked) representation of coordinator-startup-check.mjs's STANDARD_LOOPS registry", technology: 'Generated markdown table or drift-check assertion' },
      { name: 'check-claude-md-drift.cjs extension', responsibility: "New assertion(s) catching doctrine drift in the skill file and behavior doc against their DB-sourced counterparts", technology: 'Node.js drift-check script' },
    ],
    data_flow: "leo_protocol_sections rows -> section-file-mapping.json declares which rows feed which output file -> generate-claude-md-from-db.js's getFileSpecs()/getSectionsByMapping() assemble content per file -> generator functions (generateCoordinator, generateCoordinatorManual, generateCoordinatorProvenance, generateCoordinatorDigest) render the final markdown -> check-claude-md-drift.cjs compares live DB section digests against committed file content to detect drift -> coordinator/Adam/Solomon sessions read the rendered CLAUDE_*.md files at session/loop start.",
    integration_points: [
      'scripts/generate-claude-md-from-db.js (regeneration entrypoint)',
      'scripts/check-claude-md-drift.cjs (drift detection, CI-gated)',
      'scripts/coordinator-startup-check.mjs STANDARD_LOOPS array (FR-2 governance source)',
      '.claude/commands/coordinator.md and docs/protocol/fleet-coordinator-and-worker-behavior.md (FR-3 subordination targets)',
      '.docmon/rules.json root_allowlist (doc-location validation)',
    ],
  },

  test_scenarios: [
    { id: 'TS-1', scenario: 'Full regeneration produces all 23 known files including the 2 new coordinator companions with no errors', test_type: 'integration', given: 'coordinator_manual and coordinator_provenance leo_protocol_sections rows exist with valid content', when: 'node scripts/generate-claude-md-from-db.js is run', then: 'CLAUDE_COORDINATOR_MANUAL.md and CLAUDE_COORDINATOR_PROVENANCE.md are created, KNOWN_GENERATED_FILES.length === 23, and check-claude-md-drift.cjs reports zero drift' },
    { id: 'TS-2', scenario: 'Shared-row duplication guard refuses ALL generation, not just coordinator files, proving the R1 all-or-nothing hazard is caught pre-merge', test_type: 'unit', given: "a coordinator_manual row accidentally contains a verbatim >=60-char substring already present in role_partnership_contract (row 610)", when: "the generator's loadData() runs assertSharedSectionsNotCopied()", then: 'the function throws naming both the coordinator_manual row and row 610, and generation of ALL 23 files is refused' },
    { id: 'TS-3', scenario: 'Content-conservation check discriminates a truncated migration', test_type: 'unit', given: "a pre-migration snapshot of row 605's full content", when: 'row 605 is split and the union of the new/updated rows is diffed against the snapshot', then: 'the diff reports zero orphaned sentences on a correct split; a deliberately-truncated test fixture (one sentence removed) causes the check to fail (M3)' },
    { id: 'TS-4', scenario: 'STANDARD_LOOPS desync is detected, not silently rendered', test_type: 'unit', given: "the charter's loop-governance table is generated from or drift-checked against the live STANDARD_LOOPS array", when: 'a test fixture flips one entry\'s session_arm from false to true without updating the charter representation', then: 'the drift-check assertion fails (M9)' },
    { id: 'TS-5', scenario: "FR-4's KEEP/MERGE/MOVE ledger has zero silently-dropped items", test_type: 'unit', given: "the ledger for row 605's 8 'utilization' hits plus 2 'comms MUST be typed' instances", when: 'the ledger is reviewed against the pre-migration snapshot', then: 'every one of the 10 measured items has an explicit KEEP/MERGE/MOVE disposition; the 3 dated-directive clauses plus the resource-pool duty and Adam-boundary clause are all disposed MOVE, never DELETE' },
    { id: 'TS-6', scenario: 'Existing tests that assert CLAUDE_COORDINATOR.md content/line-numbers/mapping are updated in the same PR as the content move', test_type: 'integration', given: 'tests/unit/decompose-weakest-classify-rule.test.js and tests/unit/claude-coordinator-generation.test.js currently assert specific content/mapping', when: 'FR-1/FR-4 relocate their target content', then: 'both tests are updated to assert against the new location, and CI shows 0 unexplained failures' },
  ],

  acceptance_criteria: [
    "One charter of record per role: CLAUDE_COORDINATOR.md, the skill file, and the behavior doc all carry explicit subordination headers naming the charter as canonical; drift-check covers the skill's doctrine sections.",
    'STANDARD_LOOPS is governed in the charter (generated-from-array or drift-checked) with the 08-22 cron ruling encoded; a fresh /coordinator start cannot silently revert it.',
    'Zero duplicated headers/statements remain in the charter; dated directive chronology lives in PROVENANCE; the never-do boundaries block is present at the top of the charter.',
    'Regenerated files (all 23, including the 2 new coordinator companions) pass check-claude-md-drift.cjs with zero drift; the coordinator seat re-reads on hash roll.',
    'No governed directive content is deleted during the FR-4 consolidation, verified via the KEEP/MERGE/MOVE ledger and the M3 content-conservation diff.',
  ],

  risks: [
    { risk: "The DB-driven generator's shared-row duplication guard (assertSharedSectionsNotCopied) is all-or-nothing fleet-wide -- a bad coordinator_manual/coordinator_provenance row blocks regeneration of ALL 23 CLAUDE_*.md files, not just the coordinator's (R1).", probability: 'MEDIUM', impact: 'HIGH', mitigation: 'Run the shared-row check as a standalone pre-flight before creating either new leo_protocol_sections row, not only as a side effect of a full regeneration attempt.', rollback_plan: 'Revert the DB insert/update for the offending row using the pre-migration snapshot, then re-run regeneration to confirm all 23 files render again.' },
    { risk: "FR-4's original 'tripled utilization statements' framing was measured false -- the 8 hits are 3 distinct governed operator directives plus a resource-pool duty and Adam-boundary clause, not duplicates; treating them as dedup-able would retire governed content, explicitly out of scope (R2).", probability: 'HIGH', impact: 'HIGH', mitigation: 'A clause-level KEEP/MERGE/MOVE ledger is authored and reviewed before any edit to row 605; only the 2 verbatim header instances are collapsed; all directive clauses move to PROVENANCE verbatim.', rollback_plan: 'Restore any found-deleted directive clause verbatim from the pre-migration snapshot into PROVENANCE and re-run the M3 diff.' },
    { risk: 'Splitting row 605 is an unverified content migration -- check-claude-md-drift.cjs only verifies DB-to-file fidelity, so a clause silently dropped during the split still renders faithfully and reports GREEN (R3).', probability: 'MEDIUM', impact: 'MEDIUM', mitigation: 'Add a byte/clause-conservation assertion (M3) comparing the pre-migration snapshot against the post-split union before considering the migration complete.', rollback_plan: 'Restore row 605 to its pre-migration snapshot and re-attempt the split with the corrected ledger.' },
    { risk: 'Sibling SD SD-LEO-INFRA-SOLOMON-ROLE-CONTRACT-001 converges on the same shared infra files (file-generators.js, index.js, section-file-mapping.json) for a different role, risking a merge conflict if both SDs overlap in EXEC (D2).', probability: 'MEDIUM', impact: 'MEDIUM', mitigation: "This SD's EXEC makes purely additive changes to the 3 shared files; ship and merge before Solomon's SD reaches EXEC where possible.", rollback_plan: "If a merge conflict occurs, resolve by keeping both SDs' additive entries side-by-side -- neither SD's change should require removing the other's." },
    { risk: 'FR-2 encoding STANDARD_LOOPS as hand-typed charter prose would create a second, unlinked representation that desyncs on the next session_arm/gha_backed flip (R10).', probability: 'LOW', impact: 'MEDIUM', mitigation: 'Generate the charter table from the live STANDARD_LOOPS array, or add a drift-check assertion comparing the two (M9).', rollback_plan: 'If hand-typed prose ships anyway and is found desynced, regenerate from the array and add the missing drift-check assertion before the next release.' },
  ],

  implementation_approach: {
    phases: [
      { phase: 'Phase 1: Migration ledger + snapshot', description: "Author the clause-level KEEP/MERGE/MOVE ledger for row 605's content (M2), capture a pre-migration snapshot for the M3 check, and write the coordinator-specific landing script (mirroring adam-contract-land.mjs's shape, per TR-1).", deliverables: ['KEEP/MERGE/MOVE ledger document', 'Pre-migration row 605 snapshot (JSON)', 'scripts/protocol/coordinator-contract-land.mjs (new, dry-run by default)'] },
      { phase: 'Phase 2: Generator + mapping wiring (FR-1)', description: 'Add generateCoordinatorManual/generateCoordinatorProvenance, wire into getFileSpecs()/KNOWN_GENERATED_FILES, add the 2 new leo_protocol_sections section_types and mapping entries, all additive per TR-2.', deliverables: ['2 new generator functions', 'Updated getFileSpecs()/KNOWN_GENERATED_FILES', '2 new leo_protocol_sections rows', '2 new section-file-mapping.json entries'] },
      { phase: 'Phase 3: Content migration (FR-4) + never-do block (FR-5)', description: 'Execute the landing script to split row 605 per the ledger; add the never-do block as a new/updated leo_protocol_sections row.', deliverables: ['Row 605 split into charter/manual/provenance', 'Never-do block DB row + rendered in charter'] },
      { phase: 'Phase 4: Loop governance (FR-2) + skill subordination (FR-3)', description: 'Add the STANDARD_LOOPS-generated governance table; add subordination headers to the skill file and behavior doc; extend check-claude-md-drift.cjs for doctrine-section drift.', deliverables: ['STANDARD_LOOPS governance table + generator or drift-check', 'Subordination headers on both files', 'check-claude-md-drift.cjs extension'] },
      { phase: 'Phase 5: Incidental fixes + verification', description: 'Update the 3 known-breaking tests, add .docmon/rules.json allowlist entries, review the coordinator digest char budget, and run full regeneration + drift-check as final verification.', deliverables: ['3 test files updated', '.docmon/rules.json updated', 'Digest budget reviewed/adjusted if needed', 'Clean check-claude-md-drift.cjs run'] },
    ],
    technical_decisions: [
      'Reuse generateAdamCompanion (the generic primitive) rather than inventing a new companion-file renderer -- already proven across 4 roles.',
      'Do NOT reuse adam-contract-land.mjs directly (not a callable library) -- write a new coordinator-specific landing script mirroring its design shape only.',
      'Generate the STANDARD_LOOPS governance table from the live array rather than hand-typing prose, closing the exact drift class this SD exists to prevent from recurring one layer up.',
      "Justify the file split on governance grounds only -- never on Read-tool token-cap grounds, since Coordinator's charter is measured well under the cap unlike Adam's.",
    ],
  },

  integration_operationalization: {
    consumers: [
      { name: 'Coordinator session (self)', interaction: 'Reads CLAUDE_COORDINATOR.md + companions at session/loop start for role identity and duties', frequency: 'Every coordinator session start and periodic re-read on hash roll' },
      { name: 'Adam session', interaction: 'Reads the shared role_partnership_contract section embedded in CLAUDE_ADAM.md; unaffected by the coordinator-only companion additions', frequency: 'Every Adam session start' },
      { name: 'Fleet worker sessions', interaction: 'Indirectly rely on the coordinator operating from an accurate, non-drifted charter for dispatch/comms correctness', frequency: 'Continuous, every worker interaction with the coordinator' },
    ],
    dependencies: [
      { name: 'leo_protocol_sections table', type: 'upstream', contract: 'Source-of-truth rows keyed by section_type; this SD adds 2 new section_types', failure_handling: 'generate-claude-md-from-db.js fails loudly on a missing/malformed row, no silent skip' },
      { name: 'scripts/coordinator-startup-check.mjs STANDARD_LOOPS array', type: 'upstream', contract: "FR-2's charter table reads from or is drift-checked against this array", failure_handling: 'If the array shape changes incompatibly, the drift-check assertion (M9) fails loudly rather than silently rendering stale content' },
      { name: 'check-claude-md-drift.cjs (CI gate)', type: 'downstream', contract: 'Consumes the regenerated files to detect drift', failure_handling: 'CI blocks merge on any detected drift, including the new FR-3 doctrine-section assertions' },
    ],
    data_contracts: [
      { contract_name: 'leo_protocol_sections.section_type (informal enum)', schema: 'Adds coordinator_manual, coordinator_provenance to the existing set', validation: "No DB-level enum constraint exists; validated by the generator's mapping lookup failing loudly on an unmapped section_type", versioning: 'New section_types are additive; no existing section_type is renamed or removed' },
    ],
    runtime_config: {
      environment_variables: [],
      feature_flags: [],
      deployment_considerations: "Pure documentation/config change -- no runtime deployment beyond committing the regenerated markdown files and DB section rows; the coordinator picks up changes on its next hash-roll re-read, no service restart required.",
    },
    observability_rollout: {
      monitoring: ['check-claude-md-drift.cjs CI run status', 'coordinator session startup logs confirming charter hash matches expected'],
      alerts: ['CI failure on check-claude-md-drift.cjs'],
      rollout_strategy: 'Single PR, single merge -- no phased rollout needed for a documentation/config restructure',
      rollback_trigger: 'check-claude-md-drift.cjs reports drift post-merge, or a coordinator session reports missing/garbled charter content',
      rollback_procedure: 'git revert the PR; the pre-migration row 605 snapshot allows restoring the exact prior leo_protocol_sections content if the DB-side migration also needs reverting.',
    },
  },

  exploration_summary: {
    files_read: [
      'CLAUDE_ADAM.md', 'CLAUDE_ADAM_MANUAL.md', 'CLAUDE_ADAM_PROVENANCE.md', 'CLAUDE_ADAM_DIGEST.md',
      'CLAUDE_COORDINATOR.md', 'CLAUDE_COORDINATOR_DIGEST.md',
      '.claude/commands/coordinator.md', 'docs/protocol/fleet-coordinator-and-worker-behavior.md',
      'scripts/modules/claude-md-generator/file-generators.js', 'scripts/modules/claude-md-generator/index.js', 'scripts/modules/claude-md-generator/digest-generators.js',
      'scripts/section-file-mapping.json', 'scripts/section-file-mapping-digest.json',
      'scripts/generate-claude-md-from-db.js', 'scripts/check-claude-md-drift.cjs', 'scripts/coordinator-startup-check.mjs',
      'scripts/protocol/adam-contract-land.mjs',
      'tests/unit/protocol-publication-pipeline.test.js', 'tests/unit/decompose-weakest-classify-rule.test.js', 'tests/unit/claude-coordinator-generation.test.js',
      'tests/unit/coordinator/coordinator-contract-read.test.js', 'tests/unit/adam/shared-section-included-not-copied.test.js', 'tests/unit/adam/adam-digest-authority-survives.test.js',
      '.docmon/rules.json',
    ],
    patterns_identified: [
      'Role-contract 3-file split (charter/manual/provenance) is an established, reusable pattern already proven for LEAD/PLAN/Solomon manuals via generateAdamCompanion',
      'Declarative section_type-to-file mapping in JSON keeps the generator role-agnostic; new roles/files are pure data additions',
      'check-claude-md-drift.cjs is mapping/section-agnostic and needs no changes for a new file split, only for new content-level assertions (FR-3)',
    ],
    key_decisions: [
      'Do not reuse adam-contract-land.mjs as a callable tool -- write a coordinator-specific landing script mirroring its shape only',
      "FR-4 re-scoped from 'dedup tripled statements' to 'consolidate without retiring governed directives' after risk-agent measurement contradicted the original framing",
      "FR-2's STANDARD_LOOPS representation must be array-generated or drift-checked, never hand-typed prose",
    ],
    exploration_date: '2026-08-23',
  },
};

const result = await addPRDToDatabase(SD_KEY, TITLE, content);
console.log('DONE', result?.id || result);
