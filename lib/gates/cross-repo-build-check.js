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
import { existsSync } from 'fs';
import { getPrimaryRepos } from '../multi-repo/index.js';

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Run `npm run build` in the ehg repo and report pass/fail.
 *
 * @param {Object} [options]
 * @param {number} [options.timeout] - Build timeout in ms (default 120s)
 * @returns {{ pass: boolean, output: string, duration: number }}
 */
export function checkEhgBuild(options = {}) {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const start = Date.now();

  try {
    const repos = getPrimaryRepos();
    const ehg = repos.ehg;

    if (!ehg?.path || !existsSync(ehg.path)) {
      return { pass: false, output: 'ehg repo not found locally', duration: Date.now() - start };
    }

    const packageJson = `${ehg.path}/package.json`;
    if (!existsSync(packageJson)) {
      return { pass: false, output: `No package.json at ${ehg.path}`, duration: Date.now() - start };
    }

    const output = execSync('npm run build', {
      cwd: ehg.path,
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
  }
}

/**
 * Factory: create the Cross-Repo Build Verification Gate.
 *
 * @returns {Object} Gate definition compatible with handoff executor gates
 */
export function createCrossRepoBuildGate() {
  return {
    name: 'CROSS_REPO_BUILD_CHECK',
    validator: async () => {
      console.log('\n\u{1f3d7}\ufe0f  GATE: Cross-Repo Build Verification (Advisory)');
      console.log('-'.repeat(50));

      const result = checkEhgBuild();
      const warnings = [];
      const issues = [];

      if (result.pass) {
        console.log(`   \u2705 ehg build passed (${result.duration}ms)`);
      } else {
        console.log(`   \u26a0\ufe0f  ehg build FAILED (${result.duration}ms)`);
        console.log(`   Output: ${result.output.substring(0, 200)}`);
        warnings.push(`ehg build failed: ${result.output.substring(0, 200)}`);
      }

      return {
        pass: true, // Advisory — never blocks
        score: result.pass ? 100 : 50,
        max_score: 100,
        issues,
        warnings,
        metadata: { duration: result.duration, buildPassed: result.pass },
      };
    },
    required: false,
    weight: 0.5,
    remediation: 'Run `cd C:/Users/rickf/Projects/_EHG/ehg && npm run build` to diagnose. Common causes: missing imports, uncommitted shared files.',
  };
}
