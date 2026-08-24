#!/usr/bin/env node
// SD-LEO-INFRA-REPO-HYGIENE-PATH-001, FR-2.
//
// Counts total untracked files in the working tree (git status --porcelain
// --untracked-files=all) and fails above a documented threshold. See
// docs/architecture/evidence-boundary.md for the full one-time triage this threshold is
// calibrated against (3192 -> 2291 untracked files, via .gitignore additions for confirmed-
// ephemeral directories).
//
// DELIBERATELY NOT WIRED INTO .github/workflows/*.yml (unlike the sibling
// no-literal-home-path-lint.mjs and no-connection-string-literals-lint.mjs): GitHub Actions
// does a fresh `actions/checkout` on every run, which by definition has ZERO untracked files --
// a workflow-based version of this check would always pass trivially and never provide real
// signal (a hollow, always-green check is worse than no check at all -- it would read as
// "verified clean" while measuring nothing). Untracked-file accumulation is a property of a
// long-lived LOCAL working tree (this repo's actual dev machine, built up over many fleet
// sessions), so this lint is wired into .husky/pre-commit instead -- this repo's other
// repo-hygiene-class checks (LOC threshold, Scope Gate, root temp file warning) already live
// there for the same reason.
//
// NON-BLOCKING by design (does not exit 1 from pre-commit, matching the existing "Root Temp
// File Warning" Stage 9 precedent in .husky/pre-commit): a hard block here would fail EVERY
// commit -- including ones completely unrelated to hygiene -- any time concurrent fleet-session
// activity pushes the untracked count over threshold, which this SD's own measurement shows can
// happen at roughly 90 files/day just from .artifacts/ direct-children alone (not yet triaged;
// see evidence-boundary.md). A CI-style hard gate on a metric no single commit fully controls
// is the wrong shape; a visible, act-on-it-when-convenient warning is the deliberately chosen
// alternative. `--strict` (used by tests and available for a future harder gate) restores a
// real non-zero exit code so the underlying logic is still genuinely testable.
//
// THRESHOLD RATIONALE: baseline (post-triage) = 2291, measured 2026-08-24 (see
// evidence-boundary.md "Measured result"). Buffer = 100, derived from this SD's own measured
// growth rate of the largest remaining untriaged source (.artifacts/ direct-children: 639 new
// files over the last 7 days = ~91/day) -- rounded up to 100 so the threshold absorbs roughly
// one day of normal fleet-session accumulation before firing, rather than going red on the
// very next commit after a busy day. THRESHOLD = 2391, not a round number chosen independently
// of any measurement.
import { execFileSync } from 'node:child_process';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { getRepoRoot } from '../../lib/repo-paths.js';

export const BASELINE = 2291;
export const BUFFER = 100;
export const THRESHOLD = BASELINE + BUFFER;

export function countUntrackedFiles(cwd = process.cwd()) {
  const raw = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return raw.split('\n').filter((l) => l.startsWith('?? ')).length;
}

function main() {
  const strict = process.argv.includes('--strict');
  // getRepoRoot() (not process.cwd()): most fleet commits run from a .worktrees/<SD>/ checkout,
  // which starts nearly empty of untracked scratch -- measuring cwd there would make this check
  // hollow for the majority of real commits (SD-LEO-INFRA-REPO-HYGIENE-PATH-001, RCA finding).
  // The debris this lint targets accumulates in the MAIN checkout, so that's what must be
  // measured regardless of which worktree the commit is actually happening in.
  const count = countUntrackedFiles(getRepoRoot());

  if (count <= THRESHOLD) {
    console.log(`✅ root-dirt-lint: ${count} untracked file(s) (threshold ${THRESHOLD}, baseline ${BASELINE} + ${BUFFER} buffer)`);
    process.exitCode = 0;
    return;
  }

  console.error(`⚠ root-dirt-lint: ${count} untracked file(s) exceeds threshold ${THRESHOLD} (baseline ${BASELINE} + ${BUFFER} buffer)`);
  console.error('   See docs/architecture/evidence-boundary.md for the per-directory triage policy.');
  console.error('   If this growth is genuine new ephemeral debris, add a .gitignore entry (with rationale) for its source directory.');
  console.error('   If it is genuine durable evidence, commit or archive it instead of leaving it untracked.');
  process.exitCode = strict ? 1 : 0;
}

if (isMainModule(import.meta.url)) {
  main();
}
