/**
 * Branch-aware file reader for LEO handoff gates.
 * SD: SD-LEO-INFRA-FIX-GATE-FILE-001
 *
 * Reads file contents from `origin/<branch>:<path>` via `git show` so
 * gate logic is independent of whichever branch a shared checkout
 * happens to be on at gate-run time. Includes a per-instance cache to
 * keep repeat reads cheap (important for /heal and batch precheck).
 *
 * Usage:
 *   const reader = createBranchFileReader(repoRoot);
 *   const content = await reader.readFile(branchName, 'src/components/Foo.tsx');
 */

import { execSync } from 'child_process';

const SHOW_TIMEOUT_MS = 3000;
const FETCH_TIMEOUT_MS = 10_000;

/**
 * @param {string} repoRoot - Absolute path to the git repo root
 * @returns {{ readFile: (branch: string, path: string) => string, stats: () => {hits: number, misses: number} }}
 */
export function createBranchFileReader(repoRoot) {
  const cache = new Map();
  let hits = 0;
  let misses = 0;

  function cacheKey(branch, path) {
    return `${branch}::${path}`;
  }

  function fetchBranch(branch) {
    try {
      execSync(`git -C "${repoRoot}" fetch origin ${branch} --quiet --no-tags`, {
        timeout: FETCH_TIMEOUT_MS,
        stdio: 'pipe',
      });
    } catch (err) {
      // Fetch failure is not always fatal — the ref may already be local.
      // Let the subsequent show attempt surface a clearer error.
    }
  }

  function gitShow(branch, path) {
    const ref = `origin/${branch}:${path}`;
    return execSync(`git -C "${repoRoot}" show "${ref}"`, {
      encoding: 'utf8',
      timeout: SHOW_TIMEOUT_MS,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  return {
    readFile(branch, path) {
      const key = cacheKey(branch, path);
      if (cache.has(key)) {
        hits++;
        return cache.get(key);
      }
      misses++;

      let content;
      try {
        content = gitShow(branch, path);
      } catch (err) {
        // First attempt failed — try fetching the branch, then retry once.
        fetchBranch(branch);
        try {
          content = gitShow(branch, path);
        } catch (err2) {
          throw new Error(
            `branch-file-reader: cannot read origin/${branch}:${path} from ${repoRoot} — ${err2.message?.slice(0, 200) || err2}`
          );
        }
      }
      cache.set(key, content);
      return content;
    },
    stats() {
      return { hits, misses, size: cache.size };
    },
  };
}
