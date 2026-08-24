// SD-LEO-INFRA-REPO-HYGIENE-PATH-001, FR-4: portability dry-run proof.
//
// getRepoRoot()/resolveRepoPath() are module-location-derived (path.resolve(__dirname, '..')),
// so no code change should be needed for portability -- this is a PROOF task, not new
// functionality. Copies (not symlinks -- genuinely tests filesystem independence) the minimal
// set of files path resolution actually depends on to a throwaway prefix OUTSIDE
// C:/Users/rickf entirely (C:\ehg-portability-dryrun-<pid>\), runs getRepoRoot(),
// resolveRepoPath('ehg'), and resolveRepoPath('EHG_Engineer') from that copy, and records the
// actual returned paths as committed evidence -- closing the R10 second-venue packet's
// "portable in principle" claim with a measured result instead of prose.
//
// Minimal copy, not a full repo clone: path resolution only depends on lib/repo-paths.js,
// lib/repo-paths.cjs, applications/registry.json, and package.json (for "type":"module" so the
// copied .js resolves as ESM), plus the sibling ehg/ directory itself needing to exist (an empty
// placeholder is sufficient -- resolveRepoPath() computes a path string, it does not require the
// target to contain anything).
//
// TWO scenarios, not one (added after a TESTING sub-agent finding during this SD's own
// EXEC-TO-PLAN handoff, 2026-08-24): the original version of this script only proved the
// foreign-prefix axis (repo copied elsewhere) and missed that resolveLocalPath's resolution
// base was ALSO broken specifically for the worktree-nesting axis -- a real regression this
// script's first draft never caught because it never simulated a `.worktrees/<SD>/` layout.
// Scenario A (foreign prefix) and Scenario B (foreign prefix AND worktree-nested) are both run
// and recorded, so this evidence file can no longer attest to portability while missing the
// exact axis that broke.
//
// DRYRUN_ROOT is created via mkdtempSync (not a PID-based literal name) -- SECURITY sub-agent
// finding, EXEC-TO-PLAN review 2026-08-24: a predictable `C:\ehg-portability-dryrun-<pid>`
// name, combined with mkdirSync's recursive:true writing THROUGH a pre-existing directory/
// junction without erroring, is an arbitrary-file-overwrite primitive (this script writes a
// package.json into it) if another local principal or a PID-reused prior run's leftover state
// occupies that exact path first. Low severity on a single-developer local machine, but
// mkdtempSync's atomic, random-suffixed creation closes it for free. Still rooted directly
// under C:\ (not os.tmpdir(), which on this machine is itself under C:\Users\rickf -- exactly
// the prefix this dry-run exists to test OUTSIDE of).

import { pathToFileURL } from 'node:url';

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}

async function setupCopy(fs, path, REPO_ROOT, engineerRoot, ehgRoot) {
  fs.mkdirSync(path.join(engineerRoot, 'lib'), { recursive: true });
  fs.mkdirSync(path.join(engineerRoot, 'applications'), { recursive: true });
  fs.mkdirSync(ehgRoot, { recursive: true }); // sibling placeholder, content irrelevant

  fs.copyFileSync(path.join(REPO_ROOT, 'lib', 'repo-paths.js'), path.join(engineerRoot, 'lib', 'repo-paths.js'));
  fs.copyFileSync(path.join(REPO_ROOT, 'lib', 'repo-paths.cjs'), path.join(engineerRoot, 'lib', 'repo-paths.cjs'));
  fs.copyFileSync(path.join(REPO_ROOT, 'applications', 'registry.json'), path.join(engineerRoot, 'applications', 'registry.json'));
  fs.writeFileSync(path.join(engineerRoot, 'package.json'), JSON.stringify({ type: 'module' }, null, 2));
}

async function runScenario(fs, path, { name, REPO_ROOT, moduleLocation, ehgRoot, expectedGetRepoRoot }) {
  // Import repo-paths.js FROM THE COPY -- __dirname (via import.meta.url) resolves to the
  // copy's own location, genuinely exercising module-location derivation rather than any
  // baked-in original path. A cache-busting query string forces a fresh module instance per
  // scenario (both scenarios' copies are byte-identical files, which Node's module cache would
  // otherwise treat as the same module by resolved URL).
  const moduleUrl = `${pathToFileURL(path.join(moduleLocation, 'lib', 'repo-paths.js')).href}?scenario=${encodeURIComponent(name)}`;
  const repoPaths = await import(moduleUrl);

  const results = {
    module_location: moduleLocation,
    ehg_root: ehgRoot,
    getRepoRoot: repoPaths.getRepoRoot(),
    resolveRepoPath_ehg: repoPaths.resolveRepoPath('ehg'),
    resolveRepoPath_EHG_Engineer: repoPaths.resolveRepoPath('EHG_Engineer'),
    ENGINEER_ROOT_export: repoPaths.ENGINEER_ROOT,
  };

  const checks = {
    getRepoRoot_matches_expected:
      results.getRepoRoot === expectedGetRepoRoot && results.getRepoRoot !== REPO_ROOT,
    resolveRepoPath_ehg_matches_sibling_not_original:
      path.resolve(results.resolveRepoPath_ehg) === path.resolve(ehgRoot) &&
      !results.resolveRepoPath_ehg.toLowerCase().includes('c:\\users\\rickf'),
    resolveRepoPath_EHG_Engineer_matches_module_location_not_original:
      results.resolveRepoPath_EHG_Engineer === moduleLocation && results.resolveRepoPath_EHG_Engineer !== REPO_ROOT,
    ENGINEER_ROOT_export_matches_module_location:
      results.ENGINEER_ROOT_export === moduleLocation,
  };

  return { name, results, checks, all_checks_passed: Object.values(checks).every(Boolean) };
}

async function run() {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
  const DRYRUN_ROOT = fs.mkdtempSync(path.join('C:\\', 'ehg-portability-dryrun-'));

  // Scenario A: foreign prefix, ordinary (non-worktree) layout.
  const A_ENGINEER_ROOT = path.join(DRYRUN_ROOT, 'scenario-a-plain', 'EHG_Engineer');
  const A_EHG_ROOT = path.join(DRYRUN_ROOT, 'scenario-a-plain', 'ehg');

  // Scenario B: foreign prefix AND worktree-nested (the axis that broke -- module physically
  // loads from .worktrees/<fake-sd>/lib/repo-paths.js, exactly mirroring how EVERY EXEC-phase
  // fleet session actually runs). getRepoRoot() must strip the suffix back to
  // scenario-b-worktree/EHG_Engineer; resolveRepoPath('ehg') must land on scenario-b-worktree/ehg,
  // NOT scenario-b-worktree/EHG_Engineer/.worktrees/ehg (the original bug's exact failure shape).
  const B_ENGINEER_ROOT = path.join(DRYRUN_ROOT, 'scenario-b-worktree', 'EHG_Engineer');
  const B_WORKTREE_MODULE_LOCATION = path.join(B_ENGINEER_ROOT, '.worktrees', 'FAKE-SD-FOR-DRYRUN');
  const B_EHG_ROOT = path.join(DRYRUN_ROOT, 'scenario-b-worktree', 'ehg');

  console.log(`Original repo root: ${REPO_ROOT}`);
  console.log(`Dry-run prefix (outside C:/Users/rickf): ${DRYRUN_ROOT}`);

  try {
    await setupCopy(fs, path, REPO_ROOT, A_ENGINEER_ROOT, A_EHG_ROOT);
    await setupCopy(fs, path, REPO_ROOT, B_ENGINEER_ROOT, B_EHG_ROOT);
    // Scenario B's module actually loads from the nested .worktrees/ subdirectory, not
    // B_ENGINEER_ROOT directly -- copy the same files one level deeper.
    await setupCopy(fs, path, REPO_ROOT, B_WORKTREE_MODULE_LOCATION, B_EHG_ROOT);

    const scenarioA = await runScenario(fs, path, {
      name: 'A_foreign_prefix_plain',
      REPO_ROOT,
      moduleLocation: A_ENGINEER_ROOT,
      ehgRoot: A_EHG_ROOT,
      expectedGetRepoRoot: A_ENGINEER_ROOT,
    });
    const scenarioB = await runScenario(fs, path, {
      name: 'B_foreign_prefix_AND_worktree_nested',
      REPO_ROOT,
      moduleLocation: B_WORKTREE_MODULE_LOCATION,
      ehgRoot: B_EHG_ROOT,
      expectedGetRepoRoot: B_ENGINEER_ROOT, // must strip the .worktrees/FAKE-SD-FOR-DRYRUN suffix
    });

    const allPassed = scenarioA.all_checks_passed && scenarioB.all_checks_passed;

    console.log('\nScenario A (foreign prefix, plain):');
    console.log(JSON.stringify(scenarioA, null, 2));
    console.log('\nScenario B (foreign prefix + worktree-nested):');
    console.log(JSON.stringify(scenarioB, null, 2));
    console.log(allPassed ? '\n✅ ALL CHECKS PASSED (both scenarios) -- resolver output is genuinely location-derived, not baked-in, including from a worktree-nested module location.' : '\n❌ FAILED');

    const evidence = {
      sd: 'SD-LEO-INFRA-REPO-HYGIENE-PATH-001',
      fr: 'FR-4',
      description: 'Portability dry-run: repo-paths.js resolver COPIED (not symlinked) to a throwaway prefix outside C:/Users/rickf, run from that copy under TWO scenarios (plain, and worktree-nested), output verified to reflect the new location in both.',
      note_on_scenario_b: "Scenario B was added after a TESTING sub-agent finding during this SD's own EXEC-TO-PLAN handoff: the first version of this script only covered the foreign-prefix axis and missed that resolveLocalPath's resolution base was ALSO broken specifically for worktree-nesting -- the actual regression that shipped. Scenario B reproduces that exact shape.",
      original_repo_root: REPO_ROOT,
      run_at: new Date().toISOString(),
      scenario_a: scenarioA,
      scenario_b: scenarioB,
      all_checks_passed: allPassed,
    };
    fs.writeFileSync(
      path.join(REPO_ROOT, 'docs', 'architecture', 'fr4-portability-dry-run-evidence.json'),
      JSON.stringify(evidence, null, 2) + '\n',
    );
    console.log(`\nEvidence written to docs/architecture/fr4-portability-dry-run-evidence.json`);

    if (!allPassed) process.exitCode = 1;
  } finally {
    // Clean up the throwaway copy -- the evidence file (already written above) is the durable
    // artifact, not this temp directory.
    fs.rmSync(DRYRUN_ROOT, { recursive: true, force: true });
    console.log(`Cleaned up dry-run copy at ${DRYRUN_ROOT}`);
  }
}
