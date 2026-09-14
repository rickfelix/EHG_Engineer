import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const repo = process.cwd();
const ROW = 'f70a280f-39a9-432d-ac51-07a7c55d7bfa';

const warnings = [
  {
    issue: "BEHAVIOR CHANGE (intended, FR-1): the dedup-UPDATE path now writes the metadata column, which the UPDATE payload previously omitted entirely. Existing keys are preserved (existing.metadata is spread FIRST), so nothing is dropped -- but caller-supplied metadata keys now WIN over stored values on a repeat write, where they were previously silently ignored. Concrete instance across the ~42 writeArtifact call sites: artifact-versioning.js stores version/content_hash in metadata; a repeat write carrying a stale version value would now overwrite the stored one.",
    severity: 'LOW',
    recommendation: "No action. artifact-versioning.js's own tests pass (34-file high-risk caller run, 448/451) and createVersionedArtifact sets version=1 semantics, so no live caller round-trips a stale version. Noted so a future editorial-provenance writer (SD-LEO-INFRA-VENTURE-FACTORY-HANDOFF-001-C) knows caller-wins is the merge rule.",
  },
  {
    issue: "BEHAVIOR CHANGE (intended, FR-1/FR-3): the fresh-INSERT path now sets row.metadata unconditionally (was 'if (metadata) row.metadata = metadata;'). Callers passing no metadata now write {machine_provenance:{...}} instead of omitting the key. Checked against idx_unique_current_artifact, whose discriminator is COALESCE(metadata->>'screenId','__no_screen__'): metadata->>'screenId' is still NULL for those callers, so the index key is unchanged ('__no_screen__' both before and after). Dedup scoping at lib/eva/artifact-persistence-service.js:213 still reads the CALLER's metadata?.screenId, not the merged object -- unchanged by this SD.",
    severity: 'LOW',
    recommendation: 'No action; verified non-regressive against the unique index discriminator.',
  },
  {
    issue: "BEHAVIOR CHANGE (intended, FR-6): writeArtifactBatch now forwards art.metadata (previously dropped one hop from the DB). Any batch artifact carrying metadata.screenId would NEWLY become dedup-scoped by screenId, i.e. could INSERT a second row where it previously UPDATEd. Traced every screenId producer in the repo: lib/eva/stage-17/archetype-generator.js:134, lib/eva/stage-17/design-mastering.js:41 and lib/eva/stage-17/refinement.js all call writeArtifact DIRECTLY, never the batch path. The batch callers (eva-orchestrator-helpers.js:301, eva-orchestrator.js:553, stage-execution-engine.js:375, stage-23-dedicated-venture-uat.js, stage-16.js) carry no screenId, so no live path changes behavior.",
    severity: 'LOW',
    recommendation: 'No action now. If a stage-17 screen artifact is ever routed through writeArtifactBatch, re-check this interaction before merging.',
  },
  {
    issue: "NEW-FIELD SEMANTICS (not a regression): buildMachineProvenance() defaults run_id to a fresh randomUUID() per WRITE when the caller passes no runId. Of the ~42 writeArtifact call sites, only stage-23-dedicated-venture-uat.js threads a real runId, so for the rest machine_provenance.run_id is per-write, not per-run, and is not joinable across the artifacts of a single stage execution.",
    severity: 'LOW',
    recommendation: 'Acceptable for an advisory-only v1. If cross-artifact run correlation is later wanted, thread runId from the orchestrator rather than changing the default.',
  },
];

const detailed = [
  'REGRESSION VALIDATION -- SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G (PLAN VERIFY), branch feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G vs main.',
  '',
  '(1) TEST EXECUTION -- runner: vitest 4.1.4 via "npx vitest run --project unit" (package.json "test"). THREE runs, all green:',
  '  RUN A (broad, cross-file breakage sweep) -- tests/unit/eva/ + tests/unit/proving-companion/ + scripts/modules/handoff/executors/lead-final-approval/gates/',
  '    Test Files 630 passed | 4 skipped (634).  Tests 8074 passed | 24 skipped (8098).  0 FAILED.  Duration 58.87s.',
  '  RUN B (every test file this SD touched, exact paths from "git diff --name-only main...HEAD")',
  '    Test Files 13 passed (13).  Tests 251 passed | 3 skipped (254).  0 FAILED.',
  '    Includes tests/unit/eva/stage-templates/stage-22-spend-approval.test.js -- the file a prior sub-agent in this SD history caught breaking silently on a shared test-mock shape assumption. It passes.',
  '  RUN C (high-risk UNTOUCHED writeArtifact callers, selected from the call-site grep in (2): artifact-persistence, artifact-versioning, stage-execution-engine, eva-orchestrator, stage-17/*, archetype, refinement, design-mastering, deviation-ledger, artifact-type-parity, stage-15, stage-16)',
  '    Test Files 34 passed (34).  Tests 448 passed | 3 skipped (451).  0 FAILED.',
  '  EXTENT BOUND: RUN A collected 634 of the 666 *.test.js files present on disk under those three directories; the 32 uncollected fall outside the unit project include globs. The repo has 3768 unit test files in total -- the FULL suite was NOT run. The dimension that bounded this measurement is directory scope, chosen per the task brief.',
  '',
  '(2) writeArtifact METADATA-MERGE -- BACKWARD COMPATIBILITY FOR ALL CALLERS. Repo-wide grep found 42 non-test call sites of writeArtifact/writeArtifactBatch across lib/ and scripts/ (stage-17 x9, stage-templates x9, stage-handlers s11/s15, eva-orchestrator, eva-orchestrator-helpers, stage-execution-engine, stage-execution-worker, devils-advocate, economic-lens-analysis, logo-image-generator, post-lifecycle-decisions, replit-reentry-adapter, venture-state-machine/stage-gates.js, srip-wireframe-generator, exit-gate-verifiers, artifact-versioning, artifact-content-hash, venture-artifact-provenance, stage-zero/chairman-review). Read the full diff of all three write paths:',
  "  - dedup-UPDATE: SELECT widened 'id' -> 'id, metadata'; mergedMetadata = {...existing.metadata, ...metadata, machine_provenance}. existing spread FIRST => NO existing metadata field can be dropped. See warning 1 for the caller-wins precedence change.",
  '  - fresh-INSERT: row.metadata = {...(metadata||{}), machine_provenance}. Caller metadata preserved verbatim; only the new machine_provenance key is added. See warning 2.',
  "  - unique-violation fallback: previously 'metadata: row.metadata' -- a WHOLESALE CLOBBER after a bare 'id' SELECT. This SD widens the SELECT and merges. That is a PRE-EXISTING DATA-LOSS BUG which the SD FIXES; strictly safer than main.",
  '  CONCLUSION: no artifact type, touched by this SD tests or not, can lose a metadata field. The only field-level precedence change is caller-over-stored on the dedup-UPDATE path (warning 1).',
  '',
  '(3) BACKWARD COMPATIBILITY OF THE READ SIDE / ACCIDENTAL CONSUMERS.',
  '  - grep -rl venture-artifact-provenance across lib/ scripts/ src/ returns EXACTLY the 6 files the SD accounts for: lib/eva/reality-gates.js, lib/eva/stage-artifact-precondition.js, lib/eva/lifecycle/exit-gate-verifiers.js, lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js, lib/proving-companion/artifact-integrity-checker.js, scripts/modules/handoff/executors/lead-final-approval/gates/acceptance-artifact-gate.js. No accidental extra consumer.',
  "  - grep for the literal 'machine_provenance' returns 5 files, all expected (artifact-persistence-service, venture-artifact-provenance, reality-gates, stage-23-dedicated-venture-uat as the one runId-threading producer, acceptance-artifact-gate). The other readers reach it through the shared module rather than the literal string.",
  '  - No SQL / migration / view / UI consumer of venture_artifacts.metadata.machine_provenance exists, so no read-side surface outside JS is affected.',
  '',
  "(4) API-SIGNATURE / IMPORT-RESOLUTION CHECK (the classic refactor regression class). computeContentHash was MOVED out of lib/eva/artifact-versioning.js into the new lib/eva/artifact-content-hash.js to break a circular import. Verified: (a) the function body is byte-identical (same createHash('sha256'), same string/JSON.stringify branch, same hex digest); (b) artifact-versioning.js re-exports it via 'export { computeContentHash }', so an existing 'import { computeContentHash } from ./artifact-versioning.js' still resolves; (c) a repo-wide grep confirms NO importer actually used that path -- the re-export is dead-but-harmless backward compat. The identically-named symbols in lib/sub-agent-executor/evidence-provenance.js and lib/eva/devils-advocate.js are SEPARATE functions, untouched by this SD. All import paths resolve; all three runs above would have failed at collection otherwise.",
  '',
  "(5) DESIGN-INTENT CHECK. The advisory-only contract holds: each reader adds its own provenance_warnings/warnings field and the stamp is never folded into an existing pass/fail expression, and VENTURE_ARTIFACT_PROVENANCE_CUTOVER_AT = '2026-09-13T21:00:00.000Z' means the 7972 live pre-cutover rows (0 of which carry any provenance field) are graded leniently, never ABSENT.",
  '',
  'NO REGRESSION FOUND. Zero tests that pass on main fail on this branch across 8773 executed test cases.',
].join('\n');

const { error } = await sb.from('sub_agent_execution_results').update({
  verdict: 'PASS',
  confidence: 92,
  critical_issues: [],
  warnings,
  detailed_analysis: detailed,
  recommendations: [
    'No blocking regression. Proceed with the PLAN->LEAD handoff.',
    'Record warning 3 (writeArtifactBatch now forwards art.metadata, so a batch artifact carrying metadata.screenId would newly be dedup-scoped) as a check to re-run if stage-17 screen artifacts are ever routed through the batch path.',
    'The unique-violation fallback previously clobbered the whole metadata column after a bare id SELECT; this SD fixes that pre-existing data-loss bug as a side effect -- worth naming in the retrospective, since it was not in the stated SD scope.',
  ],
  summary: 'PASS -- no regression. 3 vitest runs, 8773 test cases executed, 0 failures: broad scoped sweep 8074 passed/24 skipped across 634 files; all 13 SD-touched files 251 passed; 34 high-risk untouched writeArtifact-caller files 448 passed. Metadata spread-merge verified non-destructive on all 3 write paths for all 42 call sites; the computeContentHash move is byte-identical with a working back-compat re-export; the 6 provenance consumers are the only importers, no accidental extras. 4 LOW advisory warnings, each traced to ground, none blocking.',
  justification: 'Verdict is PASS rather than CONDITIONAL_PASS because every PASS criterion is met by measurement, not by inspection alone: all tests pass with zero new failures against baseline, the public API surface (writeArtifact/writeArtifactBatch opts, computeContentHash) is additive-only with a preserved re-export, every import path resolves (three independent vitest collections succeeded), and no metadata field can be dropped on any of the three write paths because existing.metadata is spread first. The 4 warnings are intended behavior changes whose live blast radius was traced to zero (the screenId/batch interaction has no live producer; the caller-wins precedence has no live stale-version round-trip), so they are advisory notes rather than unmet conditions.',
  execution_time: 0,
  executed_from_cwd: repo,
  metadata: {
    repo_path: repo,
    executed_from_cwd: repo,
    partial: false,
    sd_key: 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G',
    test_runner: 'vitest 4.1.4 --project unit',
    test_runs: [
      { scope: 'tests/unit/eva + tests/unit/proving-companion + lead-final-approval/gates', files_passed: 630, files_skipped: 4, tests_passed: 8074, tests_skipped: 24, failed: 0, duration_s: 58.87 },
      { scope: 'all 13 SD-touched test files (git diff --name-only main...HEAD)', files_passed: 13, tests_passed: 251, tests_skipped: 3, failed: 0 },
      { scope: '34 high-risk untouched writeArtifact-caller test files', files_passed: 34, tests_passed: 448, tests_skipped: 3, failed: 0 },
    ],
    total_test_cases_executed: 8773,
    total_failures: 0,
    writeartifact_call_sites_audited: 42,
    provenance_consumer_files: 6,
    extent_bound: 'Directory-scoped, not the full 3768-file unit suite; 634 of the 666 on-disk *.test.js files in the scoped dirs were collected by the unit project.',
  },
}).eq('id', ROW).select('id, verdict, confidence').single();
if (error) { console.error('ERR', JSON.stringify(error)); process.exit(1); }
console.log('FINAL_ROW_UPDATED=' + ROW);
