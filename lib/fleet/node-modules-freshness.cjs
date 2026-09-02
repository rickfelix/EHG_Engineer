'use strict';
// QF-20260901-083: the root node_modules store (shared by every JUNCTIONed worktree per
// worktree-provision.js) can drift behind package-lock.json for days with no check -- a
// dependency added+locked but never additively installed throws ERR_MODULE_NOT_FOUND from
// any junctioned seat, misread as a venture/credential problem. The banned repair is a clean
// install (its rm -rf follows the junction and wipes the shared store, harness 95022758); the
// sanctioned repair is `npm install` (additive) from the root. This module only DETECTS drift
// and names that command -- it never runs it and never blocks dispatch (that decision, and any
// per-spec import-aware blocking, is out of scope here; deferred to the root-fix SD).
const fs = require('fs');
const path = require('path');

/**
 * Compares package-lock.json (declared) to node_modules/.package-lock.json (npm's own
 * snapshot of what is actually installed). A version mismatch or a missing installed entry
 * means the store is behind the lockfile.
 * @param {string} rootDir - repo root to check (never a worktree -- the shared store lives here)
 * @returns {{fresh: boolean, drifted: string[], installCommand: string|null}}
 */
function checkNodeModulesFreshness(rootDir) {
  const lockPath = path.join(rootDir, 'package-lock.json');
  const installedLockPath = path.join(rootDir, 'node_modules', '.package-lock.json');
  if (!fs.existsSync(lockPath)) return { fresh: true, drifted: [], installCommand: null };
  if (!fs.existsSync(installedLockPath)) {
    return { fresh: false, drifted: ['(no install snapshot at all -- node_modules/.package-lock.json missing)'], installCommand: 'npm install' };
  }

  let declared, installed;
  try {
    declared = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    installed = JSON.parse(fs.readFileSync(installedLockPath, 'utf8'));
  } catch {
    // Fail-open: an unparsable lockfile is ambiguous, never a false alarm blocking dispatch.
    return { fresh: true, drifted: [], installCommand: null };
  }

  const declaredPkgs = declared.packages || {};
  const installedPkgs = installed.packages || {};
  const drifted = [];
  for (const [pkgPath, meta] of Object.entries(declaredPkgs)) {
    if (!pkgPath) continue; // root package's own self-entry (key "")
    const installedMeta = installedPkgs[pkgPath];
    if (!installedMeta || installedMeta.version !== meta.version) {
      drifted.push(pkgPath.replace(/^node_modules\//, ''));
    }
  }

  if (drifted.length === 0) return { fresh: true, drifted: [], installCommand: null };
  return { fresh: false, drifted, installCommand: 'npm install' };
}

module.exports = { checkNodeModulesFreshness };
