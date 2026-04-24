/**
 * Cross-Repo Build Verification Gate
 * SD: SD-CROSSREPO-BUILD-VERIFICATION-GATE-ORCH-001-B
 *
 * Verifies that the ehg frontend repo builds successfully.
 * Advisory-only — never blocks handoffs, but warns on build failure.
 * Prevents cross-repo build breakage from reaching production
 * (root cause: authedFetch.ts incident, commit 55399af1).
 */

import { execSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getPrimaryRepos } from '../multi-repo/index.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const WORKTREE_OP_TIMEOUT_MS = 30_000;

/**
 * Create a temp worktree at origin/<branch> from the ehg repo.
 * SD-LEO-INFRA-FIX-GATE-FILE-001: build must target the SD's branch contents,
 * not the shared checkout state (which may be on an unrelated branch).
 *
 * @param {string} repoRoot - ehg repo root
 * @param {string} branch - SD branch name (without origin/ prefix)
 * @returns {{ path: string, cleanup: () => void }}
 */
function createTempWorktreeFromBranch(repoRoot, branch) {
  const tempDir = mkdtempSync(join(tmpdir(), 'ehg-build-'));
  try {
    execSync(`git -C "${repoRoot}" fetch origin ${branch} --quiet --no-tags`, {
      timeout: WORKTREE_OP_TIMEOUT_MS,
      stdio: 'pipe',
    });
  } catch {
    // Fetch may fail if branch is already local — proceed and let worktree add surface a clearer error.
  }
  execSync(`git -C "${repoRoot}" worktree add --detach "${tempDir}" origin/${branch}`, {
    timeout: WORKTREE_OP_TIMEOUT_MS,
    stdio: 'pipe',
  });
  return {
    path: tempDir,
    cleanup: () => {
      try {
        execSync(`git -C "${repoRoot}" worktree remove --force "${tempDir}"`, {
          timeout: WORKTREE_OP_TIMEOUT_MS,
          stdio: 'pipe',
        });
      } catch {
        try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    },
  };
}

/**
 * Run `npm run build` in the ehg repo and report pass/fail.
 *
 * @param {Object} [options]
 * @param {number} [options.timeout] - Build timeout in ms (default 120s)
 * @param {string} [options.branch] - SD branch name to build from origin/<branch>.
 *   When supplied, the build runs in a disposable worktree created from origin/<branch>,
 *   so the verdict reflects the SD's committed state, not the shared checkout.
 *   Omit to keep legacy behavior (build in shared checkout).
 * @returns {{ pass: boolean, output: string, duration: number }}
 */
export function checkEhgBuild(options = {}) {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const start = Date.now();

  let repos, ehg;
  try {
    repos = getPrimaryRepos();
    ehg = repos.ehg;
  } catch (err) {
    return { pass: false, output: err.message, duration: Date.now() - start };
  }

  if (!ehg?.path || !existsSync(ehg.path)) {
    return { pass: false, output: 'ehg repo not found locally', duration: Date.now() - start };
  }

  const packageJson = `${ehg.path}/package.json`;
  if (!existsSync(packageJson)) {
    return { pass: false, output: `No package.json at ${ehg.path}`, duration: Date.now() - start };
  }

  let buildCwd = ehg.path;
  let tempWorktree = null;
  if (options.branch) {
    try {
      tempWorktree = createTempWorktreeFromBranch(ehg.path, options.branch);
      buildCwd = tempWorktree.path;
    } catch (err) {
      return {
        pass: false,
        output: `temp worktree creation failed for origin/${options.branch}: ${err.message?.slice(0, 200) || err}`,
        duration: Date.now() - start,
      };
    }
  }

  try {
    const output = execSync('npm run build', {
      cwd: buildCwd,
      encoding: 'utf8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { pass: true, output: output.slice(-500), duration: Date.now() - start };
  } catch (err) {
    const duration = Date.now() - start;
    if (err.killed) {
      return { pass: false, output: `Build timed out after ${timeout}ms`, duration };
    }
    const stderr = err.stderr ? err.stderr.slice(-500) : err.message;
    return { pass: false, output: stderr, duration };
  } finally {
    if (tempWorktree) tempWorktree.cleanup();
  }
}

// Auth-related file patterns that force the build gate to required (CISO requirement)
// SD: SD-CROSSREPO-BUILD-VERIFICATION-GATE-ORCH-001-D
const AUTH_PATTERNS = [
  /authedFetch/i,
  /\btoken\b/i,
  /\bcredentials?\b/i,
  /\bBearer\b/i,
  /\bauth\b/i,
  /\bsession\b/i,
];

/**
 * Check whether any changed file paths match auth-related patterns.
 * When true, the cross-repo build gate should escalate to required.
 *
 * @param {string[]} changedFiles - Array of file paths from git diff
 * @returns {boolean}
 */
export function shouldForceCheck(changedFiles) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) return false;
  return changedFiles.some(file =>
    AUTH_PATTERNS.some(pattern => pattern.test(file))
  );
}

/**
 * Factory: create the Cross-Repo Build Verification Gate.
 *
 * @param {Object} [options]
 * @param {string[]} [options.changedFiles] - Changed file paths for auth-pattern escalation
 * @returns {Object} Gate definition compatible with handoff executor gates
 */
/**
 * Resolve the SD branch name in the ehg repo.
 * SD-LEO-INFRA-FIX-GATE-FILE-001: the build must target origin/<sd_branch>,
 * not the shared checkout. Probes `feat/<sdKey>` then `fix/<sdKey>`.
 *
 * @param {Object} ctx - gate ctx (contains ctx.sd with sd_key)
 * @returns {string | null} branch name without origin/ prefix, or null if none found
 */
function resolveSdBranch(ctx) {
  const sdKey = ctx?.sd?.sd_key || ctx?.sdKey;
  if (!sdKey) return null;
  let repoPath;
  try {
    repoPath = getPrimaryRepos().ehg?.path;
  } catch { return null; }
  if (!repoPath || !existsSync(repoPath)) return null;
  let branches;
  try {
    branches = execSync(`git -C "${repoPath}" branch -r`, {
      encoding: 'utf8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'],
    }).split('\n').map(b => b.trim());
  } catch { return null; }
  for (const pattern of [`feat/${sdKey}`, `fix/${sdKey}`]) {
    const match = branches.find(b => b.toLowerCase().includes(pattern.toLowerCase()));
    if (match) return match.replace('origin/', '');
  }
  return null;
}

export function createCrossRepoBuildGate(options = {}) {
  const forceRequired = shouldForceCheck(options.changedFiles || []);

  return {
    name: 'CROSS_REPO_BUILD_CHECK',
    validator: async (ctx) => {
      const mode = forceRequired ? 'REQUIRED (auth-pattern detected)' : 'Advisory';
      console.log(`\n\u{1f3d7}\ufe0f  GATE: Cross-Repo Build Verification (${mode})`);
      console.log('-'.repeat(50));

      if (forceRequired) {
        console.log('   \u{1f6a8} Auth-pattern escalation: gate is REQUIRED');
      }

      // SD-LEO-INFRA-FIX-GATE-FILE-001: build from origin/<sd_branch> via a
      // disposable worktree so the verdict is independent of whichever branch
      // the shared checkout is on (parallel-session-safe).
      const sdBranch = resolveSdBranch(ctx);
      if (sdBranch) {
        console.log(`   Building from origin/${sdBranch} in a disposable worktree`);
      } else {
        console.log('   No SD branch resolved — falling back to shared checkout (legacy path)');
      }

      const result = checkEhgBuild(sdBranch ? { branch: sdBranch } : {});
      const warnings = [];
      const issues = [];

      if (result.pass) {
        console.log(`   \u2705 ehg build passed (${result.duration}ms)`);
      } else {
        console.log(`   \u26a0\ufe0f  ehg build FAILED (${result.duration}ms)`);
        console.log(`   Output: ${result.output.substring(0, 200)}`);
        if (forceRequired) {
          issues.push(`ehg build failed (auth-pattern escalation): ${result.output.substring(0, 200)}`);
        } else {
          warnings.push(`ehg build failed: ${result.output.substring(0, 200)}`);
        }
      }

      return {
        pass: forceRequired ? result.pass : true,
        score: result.pass ? 100 : 50,
        max_score: 100,
        issues,
        warnings,
        metadata: { duration: result.duration, buildPassed: result.pass, authEscalation: forceRequired },
      };
    },
    required: forceRequired,
    weight: forceRequired ? 1.0 : 0.5,
    remediation: 'Run `cd C:/Users/rickf/Projects/_EHG/ehg && npm run build` to diagnose. Common causes: missing imports, uncommitted shared files.',
  };
}
