#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-INFRA-VENTURE-SCAFFOLD-CODE-001';
const SD_ID = '4ce0d96d-9043-4673-af0c-e8807201b19d';
const PRD_ID = `PRD-${SD_KEY}`;

const prd = {
  id: PRD_ID,
  sd_id: SD_ID,
  directive_id: SD_KEY,
  title: 'Venture scaffold as CODE: vendored deploy/ci/scan/feedback modules stamped at provisioning',
  status: 'approved',
  executive_summary:
    'Extends the existing templates/venture-scaffold/ MODULE_REGISTRY (testing, ci-cd) with deploy/stack-scan/feedback modules, hooks generation into BOTH real provisioning entry points, adds a pinned-version manifest + build-gate, writes the DB applications table (not the drifted registry.json file), and reports (never auto-applies) a backfill census.',
  functional_requirements: [
    {
      id: 'FR-1',
      priority: 'HIGH',
      requirement: 'Extend the existing templates/venture-scaffold/scaffold.js MODULE_REGISTRY with deploy, stack-scan, and feedback modules',
      description:
        'templates/venture-scaffold/scaffold.js already has an extensible MODULE_REGISTRY (SD-LEO-TESTING-STRATEGY-REDESIGN-ORCH-001-E) with testing/ci-cd modules, each versioned independently (v1.0.0) and generated via a per-module generate() function. Add three new module entries: deploy (vendored FROM altifyai\'s real origin/main deploy.yml -- NOT its local worktree checkout, which is 70 commits stale and missing the file -- the only genuinely hardened deploy workflow found across 18 sampled venture repos: concurrency guard, post-build secret-bake verification, DB migration step, live-URL fail-loud check, config-drift guard, post-deploy signed-in UAT probe, log redaction on failure); stack-scan (new design -- no existing precedent found in any of the 18 sampled repos, so this is a fresh minimal CI workflow, not an extraction); feedback (new unified client+server module -- no single existing venture feedback implementation is complete/canonical enough to copy verbatim; shapes found range from client-only to client+server to a Lovable-platform error-reporting variant). Do NOT invent a parallel vendoring mechanism -- extend the existing registry.',
      acceptance_criteria: [
        'MODULE_REGISTRY in templates/venture-scaffold/scaffold.js gains deploy/stack-scan/feedback entries, each with its own version field independent of testing/ci-cd',
        'The deploy module\'s generated content is sourced from altifyai\'s origin/main deploy.yml content (fetched fresh, not from the stale local worktree checkout)',
        'Unit test asserts all 5 modules (testing, ci-cd, deploy, stack-scan, feedback) are independently addressable and independently versioned',
      ],
    },
    {
      id: 'FR-2',
      priority: 'CRITICAL',
      requirement: 'Automatically invoke scaffold generation at BOTH real provisioning entry points',
      description:
        'Venture provisioning is NOT a single chokepoint: buildModel=leo_bridge routes through provisionVenture() (lib/eva/bridge/venture-provisioner.js:832, sole production call site at lib/eva/stage-execution-worker.js:1963); buildModel=seeded_repo BYPASSES provisionVenture entirely via server/routes/github-repo.js\'s POST /api/github/create-and-seed route (gh repo create at line 62, inside createAndSeedHandler defined line 25, mounted line 143), then a DIFFERENT seeder (replit-repo-seeder.js::seedRepo()). FR-1\'s scaffold generation (module files + FR-3\'s manifest + FR-4\'s registry write) must be invoked from BOTH paths, sharing the same generation logic rather than two divergent implementations. Must NOT interfere with the existing standalone self-heal call to ensureLeoBridgeScaffold() at stage-execution-worker.js:702-703 (deliberately not gated behind provisionVenture by design -- a pre-existing, working mechanism this SD must not regress).',
      acceptance_criteria: [
        'A fixture provisioning run through provisionVenture() (leo_bridge path) produces all scaffold files + manifest + registry entry',
        'A fixture provisioning run through POST /api/github/create-and-seed (seeded_repo path) produces the SAME set of scaffold files + manifest + registry entry, via the SAME underlying generation function (not a second implementation)',
        'Regression test: the existing ensureLeoBridgeScaffold() self-heal call continues to function unchanged after this FR ships',
      ],
    },
    {
      id: 'FR-3',
      priority: 'CRITICAL',
      requirement: 'Pinned-version manifest + build-gate blocking provisioning/launch on a missing manifest',
      description:
        'No manifest-file convention exists anywhere in the fleet today (checked all 18 sampled repos, disk and altifyai\'s real origin/main tree) -- this is a genuinely greenfield design, not an existing-pattern extension. Format precedent: claude-generation-manifest.json\'s content-hash-pinning shape (generated_at + git_commit + per-file content_hash) combined with MODULE_REGISTRY\'s own per-module version field. The build-gate reads this manifest and BLOCKS provisioning/launch completion if it is absent, at BOTH FR-2 entry points.',
      acceptance_criteria: [
        'A manifest file (naming each stamped module + its pinned version + a generated_at timestamp) is written into the venture repo in the SAME provisioning step as the scaffold files',
        'Negative test: a fixture repo with the manifest file deliberately removed FAILS the build-gate at BOTH provisioning entry points, not just one',
        'The gate check function is shared between both entry points (not two independent implementations that could drift)',
      ],
    },
    {
      id: 'FR-4',
      priority: 'HIGH',
      requirement: 'Registry tie-in writes to the DB applications table, not the drifted registry.json file',
      description:
        '"The applications registry" is not one thing: applications/registry.json (file, 13 entries, all status=active, 8 of 13 are test-fixture residue per VALIDATION evidence) and the DB applications table (15 rows, 9 active) are DIFFERENT, only partially overlapping datasets. VALIDATION sub-agent evidence (row 492c0cf2, registry_source:"db") determined the DB table is the more authoritative, actively-queried registry -- it is what vw_venture_registry (the active-only projection other tooling reads) is built from. FR-4 writes the registry entry to the DB applications table in the SAME provisioning step as FR-1/FR-3, closing the ApexNiche-unregistered class (ApexNiche IS already present in the DB table per VALIDATION\'s measured counts, but the registry.json/DB divergence itself remains a real drift risk this SD does not attempt to fully reconcile -- out of scope, flagged as a risk).',
      acceptance_criteria: [
        'Provisioning writes a registry entry to the DB applications table (not registry.json) in the same step as scaffold generation',
        'Unit test asserts the write target is the DB table specifically (a test that would pass if a future edit silently retargeted registry.json must FAIL)',
        'The registry.json/DB-table divergence is documented as an explicit out-of-scope risk, not silently left unaddressed',
      ],
    },
    {
      id: 'FR-5',
      priority: 'MEDIUM',
      requirement: 'Report-only backfill census across the full live venture-repo population',
      description:
        'Enumerate the full live venture-repo population (confirmed ~44 non-infra-pattern GitHub repos under rickfelix, not just the 5-repo sample cited in the original problem statement) and report scaffold-manifest presence/version per repo, using FR-3\'s manifest convention. Mirrors the report-only precedent already established in this codebase (scripts/audits/gitattributes-eol-census.mjs, scripts/security/rls-acceptance-text-census.mjs -- read via git/gh, aggregate, writeFileSync exactly once at the end, zero mutation). Backfill remains PROPOSED per-venture, NEVER auto-applied.',
      acceptance_criteria: [
        'Census script enumerates the full live venture-repo population (not a 5-repo sample) and reports per-repo manifest presence/version',
        'Zero writes to any venture repo -- report-only, verified by a test asserting no git push/commit/API-write call is ever made by the census script',
        'Output is a mergeable report artifact (e.g. markdown), reviewed and merged as a PR, not auto-applied',
      ],
    },
  ],
  technical_requirements: [
    { requirement: 'Extend templates/venture-scaffold/module-registry.json schema for the 3 new modules, each independently versioned, matching the existing testing/ci-cd entries\' shape.' },
    { requirement: 'Add a shared scaffold-generation + manifest-write function callable from BOTH lib/eva/bridge/venture-provisioner.js (provisionVenture, leo_bridge path) and server/routes/github-repo.js (createAndSeedHandler, seeded_repo path) -- one implementation, two callers.' },
    { requirement: 'DB write to the applications table for FR-4\'s registry tie-in, following the existing insert/update pattern in scripts/register-app.js as structural precedent (register-app.js currently only registers already-cloned repos manually; this SD automates that registration at provisioning time).' },
    { requirement: 'Build-gate check function shared between both FR-2 entry points, reading the FR-3 manifest and returning a block/pass verdict.' },
  ],
  system_architecture:
    'A shared scaffold module (new: lib/eva/bridge/venture-scaffold-stamper.js or similar, TBD at EXEC) wraps templates/venture-scaffold/scaffold.js\'s MODULE_REGISTRY generation logic, called from both provisionVenture() (leo_bridge) and createAndSeedHandler (seeded_repo). The stamper writes scaffold files + a manifest file into the venture repo, then writes a registry entry to the DB applications table -- all in one provisioning step, for both entry points. A build-gate check function (shared, not duplicated) reads the manifest to block provisioning/launch when absent. FR-5\'s census script is a separate, independent, read-only reader of the same manifest convention against the live venture-repo population.',
  test_scenarios: [
    { scenario: 'Fixture provisioning via provisionVenture() (leo_bridge) produces scaffold files + manifest + DB registry entry.', test_type: 'integration' },
    { scenario: 'Fixture provisioning via POST /api/github/create-and-seed (seeded_repo) produces the SAME set via the SAME shared generation function.', test_type: 'integration' },
    { scenario: 'Negative: a fixture repo with the manifest file removed fails the build-gate at BOTH entry points.', test_type: 'unit' },
    { scenario: 'Regression: the existing ensureLeoBridgeScaffold() self-heal call (stage-execution-worker.js:702-703) continues to function unchanged.', test_type: 'unit' },
    { scenario: 'FR-4\'s registry write targets the DB applications table specifically -- a test using a naive registry.json-targeting implementation must FAIL this test, not pass it.', test_type: 'unit' },
    { scenario: 'Backfill census runs against the full live venture-repo population (not a 5-repo sample) and produces a report with zero writes to any venture repo.', test_type: 'integration' },
    { scenario: 'All 5 MODULE_REGISTRY modules (testing, ci-cd, deploy, stack-scan, feedback) are independently addressable and independently versioned.', test_type: 'unit' },
  ],
  acceptance_criteria: [
    'A fixture provisioning run produces a repo with all scaffold files + manifest + DB registry entry, at BOTH real provisioning entry points.',
    'Negative test: provisioning/build gate fails on a repo missing the manifest, at both entry points.',
    'Census report merged listing every live venture\'s scaffold state across the full population, report-only.',
  ],
  risks: [
    {
      risk: 'A build-gate hooking only one of the two provisioning entry points would silently miss the other, reintroducing exactly the drift this SD exists to close for half the fleet.',
      mitigation: 'FR-2/FR-3 explicitly require BOTH entry points share ONE generation/gate implementation, with a test scenario proving both paths produce identical results, not independently-verified-but-divergent ones.',
    },
    {
      risk: 'The applications/registry.json file and the DB applications table will continue to drift apart after this SD ships, since FR-4 only writes the DB table.',
      mitigation: 'Explicitly documented as an accepted, out-of-scope risk (FR-4 acceptance criteria) rather than silently left ambiguous. A follow-up SD can reconcile or deprecate the JSON file if the drift becomes actively harmful.',
    },
    {
      risk: 'No manifest-file convention or build-gate precedent exists anywhere in the fleet -- the design is genuinely greenfield, so a poorly-chosen format could require a breaking migration across every future-provisioned venture repo.',
      mitigation: 'Keep the manifest minimal (module name + pinned version + generated_at) rather than speculatively rich, reducing the surface a future format change has to touch.',
    },
    {
      risk: 'FR-2\'s new hook could regress the existing, working ensureLeoBridgeScaffold() self-heal call if the shared generation function is not carefully scoped to avoid double-invocation or ordering conflicts.',
      mitigation: 'FR-2\'s acceptance criteria include an explicit regression test for the self-heal call, run alongside (not replacing) the new hook\'s own tests.',
    },
  ],
  implementation_approach:
    'Phase 1 (FR-1): extend MODULE_REGISTRY with deploy/stack-scan/feedback modules, vendoring deploy.yml from altifyai\'s real origin/main. Phase 2 (FR-2/FR-3): build the shared scaffold-stamper + manifest-write function, wire it into provisionVenture() and createAndSeedHandler, add the shared build-gate check. Phase 3 (FR-4): DB applications-table registry write, in the same provisioning step. Phase 4 (FR-5): report-only backfill census script against the full live population. Negative-tests-first throughout, matching this fleet\'s established discipline.',
  integration_operationalization: {
    consumers: 'Both venture-provisioning entry points (leo_bridge automated pipeline, seeded_repo chairman-facing/EHG-frontend-driven flow); the DB applications table\'s existing readers (vw_venture_registry and anything downstream of it).',
    dependencies: 'lib/eva/bridge/venture-provisioner.js, server/routes/github-repo.js, templates/venture-scaffold/scaffold.js, the DB applications table.',
    data_contracts: 'Manifest file schema (module name + pinned version + generated_at) written into each venture repo; DB applications table row shape for the new registry entry written at provisioning.',
    runtime_config: 'No new env vars required -- scaffold module content is versioned/checked into EHG_Engineer, not externally configured.',
    observability_rollout: 'Scaffold-stamping failure must not silently pass provisioning -- fail loud, matching altifyai deploy.yml\'s own fail-loud-not-silent philosophy this SD is vendoring. New ventures only at ship time; FR-5\'s census + proposed backfill is the only path to retrofitting existing ventures, never automatic.',
  },
  exploration_summary:
    'LEAD-phase research (a coordinator-dispatched agent swarm plus an independently-verifying VALIDATION sub-agent and a dedicated Explore discovery pass) found the SD\'s original problem statement understated the actual structural complexity: two divergent provisioning entry points instead of one, a split applications registry instead of one, and -- critically -- an already-existing, directly-reusable scaffold module registry (templates/venture-scaffold/scaffold.js) that the original problem statement did not know about. All three findings are baked into FR-1 through FR-4 above rather than left for EXEC to discover.',
};

const { data: sd, error: sdErr } = await supabase.from('strategic_directives_v2').select('id, status').eq('id', SD_ID).single();
if (sdErr || !sd) { console.error('SD READ ERR', sdErr?.message); process.exit(1); }

const { data: existing } = await supabase.from('product_requirements_v2').select('id').eq('id', PRD_ID).maybeSingle();
if (existing) {
  const { error: updateErr } = await supabase.from('product_requirements_v2').update(prd).eq('id', PRD_ID);
  if (updateErr) { console.error('UPDATE ERR', updateErr.message); process.exit(1); }
  console.log('PRD updated:', PRD_ID);
} else {
  const { error: insertErr } = await supabase.from('product_requirements_v2').insert(prd);
  if (insertErr) { console.error('INSERT ERR', insertErr.message); process.exit(1); }
  console.log('PRD inserted:', PRD_ID);
}
