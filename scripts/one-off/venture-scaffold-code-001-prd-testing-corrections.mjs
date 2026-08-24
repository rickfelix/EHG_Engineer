#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-INFRA-VENTURE-SCAFFOLD-CODE-001';

// PLAN-TO-EXEC TESTING review (sub_agent_execution_results id 15ada745-9e8e-4324-b0a6-0ffad5ccb4d3,
// verdict=CONDITIONAL_PASS, confidence 88) independently verified every PRD file:line citation as
// accurate, but found the PRD's acceptance criteria were imprecise or outright contradicted by
// already-shipped code in 4 of 5 FRs, plus surfaced 2 severe risks the PRD's own scope missed
// entirely. Every claim below was independently re-verified against live code by this session
// (Golf, 9a78de7f) before writing this correction -- not trusting the sub-agent report at face
// value, matching this session's established discipline on both prior SDs.

const functional_requirements = [
  {
    id: 'FR-1',
    priority: 'HIGH',
    description: 'templates/venture-scaffold/scaffold.js already has an extensible MODULE_REGISTRY (SD-LEO-TESTING-STRATEGY-REDESIGN-ORCH-001-E) with testing/ci-cd modules -- BUT the file is structurally un-importable today: it exports nothing (MODULE_REGISTRY is a bare local const) and calls `main()` unconditionally at line 233 with no isMainModule guard, so importing it in a test (or from a shared generation function per FR-2) executes the full CLI flow and can kill the test worker. generate() arity is also inconsistent between modules (line 34 vs 118) and neither module descriptor exposes a `files` list, making programmatic consumption (FR-2/FR-3 need to enumerate generated files for the manifest) awkward. `templates/venture-scaffold/module-registry.json` is dead data with zero readers anywhere in the codebase -- referring to it as something to "extend" is a citation error; the real, live registry is the JS MODULE_REGISTRY object. Do NOT invent a parallel vendoring mechanism -- fix scaffold.js\'s structure, then extend the existing MODULE_REGISTRY with deploy (vendored FROM altifyai\'s real origin/main deploy.yml -- NOT its local worktree checkout, which is 70 commits stale and missing the file -- the only genuinely hardened deploy workflow found across 18 sampled venture repos), stack-scan (new design, no existing precedent), and feedback (new unified client+server module, no single existing venture implementation is canonical enough to copy verbatim).',
    requirement: 'Make templates/venture-scaffold/scaffold.js importable/testable, then extend MODULE_REGISTRY with deploy, stack-scan, and feedback modules',
    acceptance_criteria: [
      'scaffold.js exports MODULE_REGISTRY and its `main()` call is guarded behind isMainModule(import.meta.url) (lib/utils/is-main-module.js, existing repo convention) -- importing the module in a test no longer triggers CLI execution or process.exit',
      'Each MODULE_REGISTRY entry (including the 3 new ones) exposes a consistent generate(ventureName, outputDir, options) signature and returns a `files` list of generated paths, not just side-effecting disk writes',
      'MODULE_REGISTRY gains deploy/stack-scan/feedback entries, each independently versioned (v1.0.0); the deploy module\'s content is sourced from altifyai\'s origin/main deploy.yml (fetched fresh, not the stale local worktree checkout)',
      'Unit test imports scaffold.js directly (proving the isMainModule fix works) and asserts all 5 modules (testing, ci-cd, deploy, stack-scan, feedback) are independently addressable, independently versioned, and each generate() returns a `files` list',
      'templates/venture-scaffold/module-registry.json is either wired up as a real generated/consumed artifact by this SD, or explicitly dropped from scope with a one-line note -- not left as an orphaned citation',
    ],
  },
  {
    id: 'FR-2',
    priority: 'CRITICAL',
    description: 'Venture provisioning is NOT a single chokepoint: buildModel=leo_bridge routes through provisionVenture() (lib/eva/bridge/venture-provisioner.js:832, sole production call site at lib/eva/stage-execution-worker.js:1963), a declarative step-runner over DEFAULT_STEPS operating on a persistent clone. buildModel=seeded_repo BYPASSES provisionVenture entirely via server/routes/github-repo.js\'s POST /api/github/create-and-seed route (`gh repo create --clone=false` at line 62, inside createAndSeedHandler defined line 25, mounted line 143), then replit-repo-seeder.js::seedRepo() (github-repo.js:89), whose only clone is ephemeral (replit-repo-seeder.js:799). The two paths differ in repo locality, not call convention -- "ONE shared generation function" sharing the FULL write path is not feasible; the correct shape is ONE PURE content-generation function (venture-name/options -> file descriptors, no I/O) plus TWO THIN call-site adapters, one per entry point. CRITICAL DEPENDENCY the original PRD missed entirely: replit-repo-seeder.js:1341 stages files for commit via a HARD-CODED allowlist -- `execSync(\'git add docs/ replit.md CLAUDE.md .replit\', ...)` -- so scaffold files written into the seeded_repo clone by FR-1\'s modules would be written to disk but NEVER staged or pushed unless this allowlist is updated (or scaffold output is routed under docs/, which is a worse fit). Separately, stage-execution-worker.js:1962 passes `provState?.github_repo_url` (a GitHub URL, not a local filesystem path) as `ventureRepoPath` in the current production leo_bridge call, and venture-provisioner.js:862 lets that value win over the real `venture.localPath` when present -- a pre-existing, independent bug. FR-2\'s build-gate/file-existence checks must not assume ctx.ventureRepoPath is always a valid local path, or they will silently no-op in production while every local fixture test passes. Must NOT interfere with the existing standalone self-heal call to ensureLeoBridgeScaffold() at stage-execution-worker.js:702-703 (deliberately not gated behind provisionVenture by design).',
    requirement: 'One pure content-generation function shared by two thin call-site adapters at BOTH real provisioning entry points',
    acceptance_criteria: [
      'A pure generation function (no I/O, venture-name/options -> file descriptor list) is shared by two adapters: one wired into provisionVenture()\'s DEFAULT_STEPS step-runner (persistent clone), one wired into createAndSeedHandler/seedRepo() (ephemeral --clone=false clone)',
      'A fixture provisioning run through provisionVenture() (leo_bridge path) produces all scaffold files + manifest + registry entry',
      'A fixture provisioning run through POST /api/github/create-and-seed (seeded_repo path) produces the SAME set of scaffold files + manifest + registry entry, via the SAME pure generation function -- AND replit-repo-seeder.js\'s git-add allowlist (line 1341) is updated (or scaffold output routed under an already-included path) so the files are actually staged and pushed, not silently dropped',
      'Any file-existence/path-dependent check this FR introduces is proven safe against ctx.ventureRepoPath being a GitHub URL rather than a local path (stage-execution-worker.js:1962 / venture-provisioner.js:862) -- either explicitly guarded, or the risk is documented as a pre-existing out-of-scope bug this FR does not worsen',
      'Regression test: the existing ensureLeoBridgeScaffold() self-heal call continues to function unchanged after this FR ships',
    ],
  },
  {
    id: 'FR-3',
    priority: 'CRITICAL',
    description: 'CORRECTION: the original PRD claimed "no manifest-file convention exists anywhere in the fleet" -- this is FALSE and self-contradicted by the PRD\'s own format-precedent citation. scripts/check-claude-md-drift.cjs already implements the exact "manifest absent -> block" semantic FR-3 needs: manifestPathFor() at line 41, and at line 146, `if (!fs.existsSync(manifestPath)) return { status: \'no_manifest\', drift: true, ..., note: \'claude-generation-manifest.json missing -- run the generator\' }`. FR-3\'s build-gate should model this pattern (existsSync check returning a hard drift/block status), combined with claude-generation-manifest.json\'s content-hash-pinning shape (generated_at + git_commit + per-file content_hash) and MODULE_REGISTRY\'s per-module version field for the scaffold-specific schema. Two additional risks the original PRD missed: (1) the conformance gate (conformance-integration.js:15,26-42) is 80%-score-thresholded across a weighted list of required files -- simply adding the manifest to REQUIRED_FILES could still yield a PASSING/green gate on a manifest-absent repo if other files offset the score, so the build-gate must be an explicit hard check, not merely another scored list entry; (2) SEEDED_ARTIFACTS (repo-readiness.js:32) and the self-heal writer must recognize the same manifest-presence signal, or one produces a permanent warn-loop and the other a blind gate that can never fail.',
    requirement: 'Pinned-version manifest + a HARD (non-score-thresholded) build-gate blocking provisioning/launch on a missing manifest, modeled on the check-claude-md-drift.cjs manifest-absent-block pattern',
    acceptance_criteria: [
      'A manifest file (module name + pinned version + generated_at, modeled on claude-generation-manifest.json\'s content-hash shape) is written into the venture repo in the SAME provisioning step as the scaffold files',
      'Negative test: a fixture repo with the manifest file deliberately removed FAILS the build-gate at BOTH provisioning entry points, using an existsSync-style hard check (scripts/check-claude-md-drift.cjs:146 pattern) -- NOT a score-thresholded check that could pass despite the manifest\'s absence',
      'The gate check function is shared between both entry points (not two independent implementations that could drift)',
      'SEEDED_ARTIFACTS (repo-readiness.js:32) and the self-heal writer are verified to recognize the same manifest-presence signal -- a test proves neither can disagree with the other about whether the manifest is present',
    ],
  },
  {
    id: 'FR-4',
    priority: 'HIGH',
    description: 'CORRECTION: venture-provisioner.js\'s existing `registry_updated` step (lines 254-323) is ALREADY CORRECT and already shipped -- it writes applications/registry.json as the PRIMARY registry (line 299, idempotency keyed on it at 259-263), then does a NON-FATAL DB write-through (lines 308-320) that is UPDATE-ONLY: it looks up an existing `applications` row by normalized name (line 311-313) and if found, updates local_path; if NO match is found, it just logs a WARNING (line 319) and moves on -- it never INSERTs a new row. THE REAL GAP: a brand-new venture with no pre-existing applications row (the actual ApexNiche-class failure) is silently skipped forever, not registered. The original PRD\'s framing ("a naive registry.json-targeting implementation must FAIL") is backwards -- the registry.json write is correct, required, shipped behavior that must NOT be broken; the fix is changing the DB write-through from update-only to upsert (insert-if-missing). scripts/register-app.js is NOT a valid technical precedent for this (it only writes registry.json, line 27 -- it does not touch the DB applications table at all; the original PRD\'s citation of it as an insert/update pattern was a citation error).',
    requirement: 'Registry tie-in becomes an UPSERT to the DB applications table (insert-if-missing, not update-only) alongside the existing, correct registry.json write',
    acceptance_criteria: [
      'The existing registry.json write in registry_updated (venture-provisioner.js:274-299) is preserved unchanged -- this FR does not remove or bypass it',
      'The DB write-through (venture-provisioner.js:308-320) is changed from update-only to upsert: when no existing applications row matches the venture name, a new row is INSERTed (not silently WARN-logged and skipped)',
      'Unit test: a venture with NO pre-existing applications row must result in a new row being INSERTed after provisioning -- an implementation that only UPDATEs matching rows (today\'s behavior, silently skipping new ventures) must FAIL this test',
      'The registry.json/DB-table divergence for ventures registered before this SD shipped is documented as an explicit out-of-scope risk (this FR does not backfill historical entries; that is FR-5\'s job, report-only)',
    ],
  },
  {
    id: 'FR-5',
    priority: 'MEDIUM',
    description: 'Enumerate the full live venture-repo population (confirmed ~44 non-infra-pattern GitHub repos under rickfelix, not just the 5-repo sample cited in the original problem statement) and report scaffold-manifest presence/version per repo, using FR-3\'s manifest convention. Mirrors the report-only precedent already established in this codebase (scripts/audits/gitattributes-eol-census.mjs, scripts/security/rls-acceptance-text-census.mjs -- read via git/gh, aggregate, writeFileSync exactly once at the end, zero mutation). Backfill remains PROPOSED per-venture, NEVER auto-applied.',
    requirement: 'Report-only backfill census across the full live venture-repo population',
    acceptance_criteria: [
      'Census script enumerates the full live venture-repo population (not a 5-repo sample) and reports per-repo manifest presence/version',
      'Zero writes to any venture repo -- report-only, verified by a test asserting no git push/commit/API-write call is ever made by the census script',
      'Output is a mergeable report artifact (e.g. markdown), reviewed and merged as a PR, not auto-applied',
    ],
  },
];

const technical_requirements = [
  {
    requirement: 'Fix templates/venture-scaffold/scaffold.js structurally: export MODULE_REGISTRY, guard main() behind isMainModule(import.meta.url), normalize generate() arity, add a `files` list per module descriptor -- THEN extend MODULE_REGISTRY with 3 new modules, each independently versioned. module-registry.json (dead data, zero readers) is either wired up or dropped from scope, not silently extended as if it were live.',
  },
  {
    requirement: 'Add a pure scaffold-generation function (no I/O) shared by two thin adapters: one hooked into lib/eva/bridge/venture-provisioner.js\'s provisionVenture() DEFAULT_STEPS step-runner (leo_bridge path), one hooked into server/routes/github-repo.js\'s createAndSeedHandler / replit-repo-seeder.js::seedRepo() (seeded_repo path). The seeded_repo adapter must also update replit-repo-seeder.js:1341\'s git-add allowlist so generated scaffold files are actually staged and pushed.',
  },
  {
    requirement: 'Change venture-provisioner.js\'s registry_updated DB write-through (lines 308-320) from update-only to upsert: INSERT a new applications row when no existing row matches the venture name, in addition to preserving the existing registry.json write.',
  },
  {
    requirement: 'Build-gate check function shared between both FR-2 entry points, reading the FR-3 manifest via an existsSync-style hard check (modeled on scripts/check-claude-md-drift.cjs:146\'s no_manifest/drift pattern, NOT the 80%-score-thresholded conformance gate) and returning a block/pass verdict.',
  },
];

const test_scenarios = [
  {
    scenario: 'scaffold.js is import-safe: importing the module directly (not invoking the CLI) does not execute main() or call process.exit -- proves the isMainModule guard fix from FR-1.',
    test_type: 'unit',
  },
  {
    scenario: 'Fixture provisioning via provisionVenture() (leo_bridge) produces scaffold files + manifest + a DB applications row (inserted, not just updated).',
    test_type: 'integration',
  },
  {
    scenario: 'Fixture provisioning via POST /api/github/create-and-seed (seeded_repo) produces the SAME set via the SAME pure generation function, AND the generated scaffold files are present in the git-add/commit set (not silently dropped by replit-repo-seeder.js\'s docs/replit.md/CLAUDE.md/.replit allowlist).',
    test_type: 'integration',
  },
  {
    scenario: 'Negative: a fixture repo with the manifest file removed fails the build-gate at BOTH entry points via a hard existsSync-style check -- not merely a lower score on the 80%-thresholded conformance gate.',
    test_type: 'unit',
  },
  {
    scenario: 'Regression: the existing ensureLeoBridgeScaffold() self-heal call (stage-execution-worker.js:702-703) continues to function unchanged.',
    test_type: 'unit',
  },
  {
    scenario: 'FR-4\'s registry write is an upsert: a venture with NO pre-existing applications row gets one INSERTed. An implementation that only UPDATEs matching rows (today\'s shipped behavior, silently skipping new ventures) must FAIL this test.',
    test_type: 'unit',
  },
  {
    scenario: 'FR-2\'s file-existence/build-gate checks behave safely when ctx.ventureRepoPath is a GitHub URL rather than a local path (stage-execution-worker.js:1962 production condition) -- does not silently misreport pass/fail.',
    test_type: 'unit',
  },
  {
    scenario: 'Backfill census runs against the full live venture-repo population (not a 5-repo sample) and produces a report with zero writes to any venture repo.',
    test_type: 'integration',
  },
  {
    scenario: 'All 5 MODULE_REGISTRY modules (testing, ci-cd, deploy, stack-scan, feedback) are independently addressable, independently versioned, and each generate() returns a `files` list.',
    test_type: 'unit',
  },
];

const risks = [
  {
    risk: 'A build-gate hooking only one of the two provisioning entry points would silently miss the other, reintroducing exactly the drift this SD exists to close for half the fleet.',
    mitigation: 'FR-2/FR-3 explicitly require BOTH entry points share ONE generation/gate implementation, with a test scenario proving both paths produce identical results, not independently-verified-but-divergent ones.',
  },
  {
    risk: 'replit-repo-seeder.js:1341 stages files via a hard-coded git-add allowlist (docs/, replit.md, CLAUDE.md, .replit) that does not include any scaffold-related paths -- scaffold files written to the seeded_repo clone by FR-1\'s modules would be written to disk but silently never committed or pushed, passing local fixture assertions while failing in production.',
    mitigation: 'FR-2 explicitly requires updating this allowlist (or routing scaffold output under an already-included path) as part of the seeded_repo adapter, with a test scenario proving the generated files appear in the git-add/commit set.',
  },
  {
    risk: 'stage-execution-worker.js:1962 passes github_repo_url (a URL, not a local path) as ventureRepoPath in the current production leo_bridge call, and venture-provisioner.js:862 lets it win over the real localPath -- a pre-existing, independent bug. Any FR-2/FR-3 check that assumes ctx.ventureRepoPath is always a valid local filesystem path could silently no-op in production while every fixture test (which passes a real local path) stays green.',
    mitigation: 'FR-2 explicitly requires this class of check to be proven safe against URL-shaped input, with a dedicated test scenario -- either the check guards against it, or the pre-existing bug is called out as a documented, out-of-scope dependency this SD does not worsen.',
  },
  {
    risk: 'The applications/registry.json file and the DB applications table will continue to drift apart for ventures registered before this SD ships, since FR-4 only fixes the upsert behavior going forward.',
    mitigation: 'Explicitly documented as an accepted, out-of-scope risk (FR-4 acceptance criteria) rather than silently left ambiguous. FR-5\'s census reports the drift; a follow-up SD can backfill or reconcile if it becomes actively harmful.',
  },
  {
    risk: 'FR-2\'s new hook could regress the existing, working ensureLeoBridgeScaffold() self-heal call if the shared generation function is not carefully scoped to avoid double-invocation or ordering conflicts.',
    mitigation: 'FR-2\'s acceptance criteria include an explicit regression test for the self-heal call, run alongside (not replacing) the new hook\'s own tests.',
  },
];

async function main() {
  const { data: prd, error: readErr } = await supabase
    .from('product_requirements_v2')
    .select('id')
    .eq('id', PRD_ID)
    .single();
  if (readErr || !prd) { console.error('READ ERR', readErr?.message); process.exit(1); }

  const { error: writeErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements, technical_requirements, test_scenarios, risks })
    .eq('id', PRD_ID);
  if (writeErr) { console.error('WRITE ERR', writeErr.message); process.exit(1); }
  console.log('PRD corrections written for', PRD_ID, `(${functional_requirements.length} FRs, ${test_scenarios.length} test scenarios, ${risks.length} risks)`);
}

if (isMainModule(import.meta.url)) main();
