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

import { pathToFileURL } from 'node:url';

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}

async function run() {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
  const DRYRUN_ROOT = path.join('C:\\', `ehg-portability-dryrun-${process.pid}`);
  const COPY_ENGINEER_ROOT = path.join(DRYRUN_ROOT, 'EHG_Engineer');
  const COPY_EHG_ROOT = path.join(DRYRUN_ROOT, 'ehg');

  console.log(`Original repo root: ${REPO_ROOT}`);
  console.log(`Dry-run prefix (outside C:/Users/rickf): ${DRYRUN_ROOT}`);

  try {
    // Minimal copy: only what path resolution actually reads.
    fs.mkdirSync(path.join(COPY_ENGINEER_ROOT, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(COPY_ENGINEER_ROOT, 'applications'), { recursive: true });
    fs.mkdirSync(COPY_EHG_ROOT, { recursive: true }); // sibling placeholder, content irrelevant

    fs.copyFileSync(path.join(REPO_ROOT, 'lib', 'repo-paths.js'), path.join(COPY_ENGINEER_ROOT, 'lib', 'repo-paths.js'));
    fs.copyFileSync(path.join(REPO_ROOT, 'lib', 'repo-paths.cjs'), path.join(COPY_ENGINEER_ROOT, 'lib', 'repo-paths.cjs'));
    fs.copyFileSync(path.join(REPO_ROOT, 'applications', 'registry.json'), path.join(COPY_ENGINEER_ROOT, 'applications', 'registry.json'));
    fs.writeFileSync(path.join(COPY_ENGINEER_ROOT, 'package.json'), JSON.stringify({ type: 'module' }, null, 2));

    // Import repo-paths.js FROM THE COPY -- __dirname (via import.meta.url) resolves to the
    // copy's own location, genuinely exercising module-location derivation rather than any
    // baked-in original path.
    const moduleUrl = pathToFileURL(path.join(COPY_ENGINEER_ROOT, 'lib', 'repo-paths.js')).href;
    const repoPaths = await import(moduleUrl);

    const results = {
      dryrun_root: DRYRUN_ROOT,
      copy_engineer_root: COPY_ENGINEER_ROOT,
      copy_ehg_root: COPY_EHG_ROOT,
      getRepoRoot: repoPaths.getRepoRoot(),
      resolveRepoPath_ehg: repoPaths.resolveRepoPath('ehg'),
      resolveRepoPath_EHG_Engineer: repoPaths.resolveRepoPath('EHG_Engineer'),
      ENGINEER_ROOT_export: repoPaths.ENGINEER_ROOT,
    };

    const checks = {
      getRepoRoot_matches_copy_not_original:
        results.getRepoRoot === COPY_ENGINEER_ROOT && results.getRepoRoot !== REPO_ROOT,
      resolveRepoPath_ehg_matches_copy_sibling_not_original:
        path.resolve(results.resolveRepoPath_ehg) === path.resolve(COPY_EHG_ROOT) &&
        !results.resolveRepoPath_ehg.toLowerCase().includes('c:\\users\\rickf'),
      resolveRepoPath_EHG_Engineer_matches_copy_not_original:
        results.resolveRepoPath_EHG_Engineer === COPY_ENGINEER_ROOT && results.resolveRepoPath_EHG_Engineer !== REPO_ROOT,
      ENGINEER_ROOT_export_matches_copy:
        results.ENGINEER_ROOT_export === COPY_ENGINEER_ROOT,
    };

    const allPassed = Object.values(checks).every(Boolean);

    console.log('\nResults:');
    console.log(JSON.stringify(results, null, 2));
    console.log('\nChecks:');
    console.log(JSON.stringify(checks, null, 2));
    console.log(allPassed ? '\n✅ ALL CHECKS PASSED -- resolver output is genuinely location-derived, not baked-in.' : '\n❌ FAILED');

    const evidence = {
      sd: 'SD-LEO-INFRA-REPO-HYGIENE-PATH-001',
      fr: 'FR-4',
      description: 'Portability dry-run: repo-paths.js resolver COPIED (not symlinked) to a throwaway prefix outside C:/Users/rickf, run from that copy, output verified to reflect the new location.',
      original_repo_root: REPO_ROOT,
      run_at: new Date().toISOString(),
      results,
      checks,
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
