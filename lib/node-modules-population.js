/**
 * SD-FDBK-ENH-SCOPE-REPLACE-WORKTREE-001 — is a node_modules populated, or merely present?
 *
 * ONE rule, ONE implementation. Two guards need it and they must not drift apart:
 *   - scripts/resolve-sd-workdir.js  decides whether to PROVISION   (FR-1)
 *   - lib/worktree-manager.js        decides whether it is HEALTHY  (FR-4)
 * Both were existence-only, so fixing either alone would leave the silent-failure path open. A
 * copied predicate is how they would diverge later, which is why this lives in its own module with
 * NO imports of either caller (no cycle between worktree-manager and worktree-provision).
 *
 * THE DEFECT. `fs.existsSync` is TRUE for an EMPTY directory. Once anything created
 * <wt>/node_modules/, provisioning was skipped PERMANENTLY and the health check still reported the
 * worktree complete. Vite mkdir -p's node_modules/.vite for its optimize cache, which poisoned
 * both. Measured on this fleet: affected worktrees held literally .vite/ and .vite-temp/ and
 * nothing else, yet require.resolve succeeded by Node walking UP to the shared root — the coupling
 * that makes a shared-root wipe fleet-fatal.
 *
 * EMPTINESS-BASED, NEVER NAME-BASED. An _archive worktree was found poisoned by only
 * .rank-pass-trigger.lock, with no .vite at all, so "known-bad name" under-covers.
 *
 * NEVER READS THROUGH A JUNCTION. lib/worktree-manager.js:86-93 records why lstat was chosen over
 * a read-through check (PR #3488 adversarial review, finding 1): a junction's target is
 * TRANSIENTLY ABSENT during a concurrent npm install at the main repo (.staging atomic swap), so
 * reading through would classify a HEALTHY junctioned worktree as broken and tear it down — under
 * load, when the store is busiest. A symlink is provisioned by construction and short-circuits
 * BEFORE any readdir. This manifests only under concurrency; a quiet test run will not surface it.
 *
 * @param {string} nodeModulesPath
 * @param {{lstatSync:Function, readdirSync:Function}} fsImpl
 * @returns {boolean} true when the path should be treated as NOT provisioned
 */
export function isNodeModulesUnprovisioned(nodeModulesPath, fsImpl) {
  let stat;
  try {
    stat = fsImpl.lstatSync(nodeModulesPath);
  } catch {
    return true; // absent or unreadable => not provisioned
  }
  if (!stat) return true; // lstatSync({throwIfNoEntry:false}) style callers
  if (stat.isSymbolicLink()) return false; // junction: provisioned, and MUST NOT be read through
  if (!stat.isDirectory()) return true;    // a FILE named node_modules is not a provisioned tree
  let entries;
  try {
    entries = fsImpl.readdirSync(nodeModulesPath);
  } catch {
    return true;
  }
  // Dot-entries (.vite, .vite-temp, .package-lock.json, .bin, stray locks) are caches and
  // metadata, never packages. A provisioned tree always carries at least one package entry.
  return !entries.some((name) => !String(name).startsWith('.'));
}

export default { isNodeModulesUnprovisioned };
