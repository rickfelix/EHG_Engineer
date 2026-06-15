/**
 * SD-LEO-INFRA-VDR-GREP-SEAM-CROSSREPO-001 — shared io.grep seam + cross-repo repo-root map for the VDR gauge.
 *
 * The Vision Denominator Registry's code_grep probes (lib/vision/vdr-probes.js codeGrepProbe) need an
 * injected `io.grep(pattern, sub, repo) => { matched, accessible }`. Without it every code_grep probe
 * returns 'unknown' ('no grep seam') and is excluded from the denominator, so the gauge measures only
 * the DB/KR-backed subset (6 of 11). This module is the single, injectable source for that seam, plus
 * the repo-name -> filesystem-root map (so a probe can target the EHG_Engineer tree OR the sibling 'ehg'
 * app checkout). It was extracted, behavior-identical, from the inline copy in scripts/vision-gauge-refresh.mjs.
 *
 * HONESTY CONTRACT (anti-inflation; the gauge must never lie high):
 *   - accessible:false  → codeGrepProbe maps to 'unknown' (EXCLUDED from the denominator, never guessed).
 *     Returned when a repo's checkout is absent/unreadable on the run host, or git grep errors unexpectedly.
 *   - matched:true       → codeGrepProbe maps to 'partial' (code presence = intent, NOT realization), never 'built'.
 *   - matched:false      → codeGrepProbe maps to 'unbuilt'.
 *   So wiring this seam GROWS the probeable denominator toward 11; it never inflates the percentage.
 *
 * Archived/dead/test paths are excluded from the git-grep pathspec so a vocabulary hit there cannot
 * credit a capability (review: 'effort_level' in scripts/archive/* once false-credited the fleet-dial cap).
 *
 * All IO is injectable (exec, existsSync) so the seam is unit-testable without a real git/FS.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// lib/vision/vdr-grep-seam.js → ../.. is the EHG_Engineer repo root (fallback when a caller omits engineerRoot).
const DEFAULT_ENGINEER_ROOT = path.resolve(__dirname, '..', '..');

// Pathspec exclusions: a vocabulary match in archived/dead/test code must not credit a live capability.
export const GREP_EXCLUDES = [':!**/archive/**', ':!**/__tests__/**', ':!**/*.test.*', ':!**/*.spec.*'];

/**
 * Resolve the repo-name -> filesystem-root map for the VDR code_grep probes.
 *   'EHG_Engineer' → engineerRoot (default: this repo root, resolved from the module location).
 *   'ehg'          → env.VDR_EHG_REPO_ROOT (if set) || ehgRoot || the sibling checkout <engineerRoot>/../ehg.
 * The sibling default IS the documented default C:/Users/rickf/Projects/_EHG/ehg on the primary host, but is
 * computed portably (and overridable via VDR_EHG_REPO_ROOT) so it is correct on any host / in a worktree.
 * No existence check here — an absent root is detected (and honestly reported accessible:false) by the seam.
 * @param {object} [opts]
 * @param {string} [opts.engineerRoot] - EHG_Engineer repo root
 * @param {string} [opts.ehgRoot]      - explicit 'ehg' app checkout root (overridden by env.VDR_EHG_REPO_ROOT)
 * @param {object} [opts.env]          - environment bag (defaults to process.env)
 * @returns {{ EHG_Engineer: string, ehg: string }}
 */
export function resolveRepoRoots({ engineerRoot, ehgRoot, env = process.env } = {}) {
  const engineer = engineerRoot || DEFAULT_ENGINEER_ROOT;
  const ehg = (env && env.VDR_EHG_REPO_ROOT) || ehgRoot || path.resolve(engineer, '..', 'ehg');
  return { EHG_Engineer: engineer, ehg };
}

/**
 * Build the injectable code-grep seam. Returns grep(pattern, sub, repo) => { matched, accessible }.
 * `git grep -lE <pattern> -- <sub> <excludes>` over TRACKED files in repoRoots[repo], scoped to <sub>.
 * @param {object} opts
 * @param {object} opts.repoRoots          - { <repoName>: <absRoot> } (from resolveRepoRoots)
 * @param {Function} [opts.exec]           - execFileSync-compatible (sync). Default: node's execFileSync.
 * @param {Function} [opts.existsSync]     - fs.existsSync-compatible. Default: node's fs.existsSync.
 * @param {number} [opts.timeoutMs]        - git grep timeout (default 20000)
 * @returns {(pattern:string, sub:string, repo:string) => { matched:boolean, accessible:boolean }}
 */
export function makeGrepSeam({ repoRoots, exec = execFileSync, existsSync = fs.existsSync, timeoutMs = 20000 } = {}) {
  const roots = repoRoots || {};
  return function grep(pattern, sub, repo) {
    const root = roots[repo];
    // Absent/unknown repo or missing checkout → honest 'unknown' (never a guess).
    if (!root || !existsSync(root)) return { accessible: false, matched: false };
    const target = sub ? path.join(root, sub) : root;
    if (!existsSync(target)) return { accessible: false, matched: false };
    try {
      exec('git', ['-C', root, 'grep', '-lE', pattern, '--', sub || '.', ...GREP_EXCLUDES],
        { stdio: 'pipe', timeout: timeoutMs });
      return { accessible: true, matched: true };   // exit 0 ⇒ at least one tracked file matched
    } catch (e) {
      // git grep exit 1 ⇒ accessible but no match. Any other status (128 git error, 124 timeout, …)
      // ⇒ accessible:false so the probe degrades to 'unknown' — a seam failure NEVER fabricates a match.
      if (e && e.status === 1) return { accessible: true, matched: false };
      return { accessible: false, matched: false };
    }
  };
}

/**
 * One-liner convenience: resolve roots + build the seam. The canonical wiring for computeBuildGauge callers.
 * @param {object} [opts] - forwarded to resolveRepoRoots ({ engineerRoot, ehgRoot, env }) + makeGrepSeam ({ exec, existsSync, timeoutMs })
 * @returns {(pattern:string, sub:string, repo:string) => { matched:boolean, accessible:boolean }}
 */
export function makeDefaultGrepSeam(opts = {}) {
  const repoRoots = resolveRepoRoots(opts);
  return makeGrepSeam({ repoRoots, exec: opts.exec, existsSync: opts.existsSync, timeoutMs: opts.timeoutMs });
}
