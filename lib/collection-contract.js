/**
 * Vitest collection-contract loader — SD-LEO-INFRA-REPO-HYGIENE-PATH-001, FR-3.
 *
 * Extracted from vitest.config.js so tests/unit/vitest-collection-contract.test.js can exercise
 * the exact function vitest.config.js calls, rather than a parallel re-implementation that could
 * silently drift from what's actually wired in. Full rationale: docs/05_testing/collection-contract.md.
 *
 * Fail-safe direction is DELIBERATE and asymmetric with the sibling loadQuarantineExclude() in
 * vitest.config.js: a missing/corrupt tests/collection-contract.json must NOT silently produce
 * an empty exclude list (that would reopen the two incidents this contract exists to prevent --
 * QF-20260727-884 scratch/, SD-LEO-INFRA-VITEST-TIER-REAL-001 .reaper-source/). SAFETY_FLOOR_EXCLUDE
 * always applies regardless of whether the JSON loads.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SAFETY_FLOOR_EXCLUDE = [
  '**/node_modules/**',
  '**/.worktrees/**',
  '**/.cursor/worktrees/**',
  '**/.claude/worktrees/**',
  'scratch/**',
  '**/scratch/**',
  '.reaper-source/**',
  '**/.reaper-source/**',
];

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'tests', 'collection-contract.json');

/**
 * @param {string} [contractPath] override for testing
 * @returns {string[]} the merged, de-duped glob pattern list
 */
export function loadCollectionContractExclude(contractPath = CONTRACT_PATH) {
  try {
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    const patterns = (contract.patterns || []).map((e) => e.pattern).filter(Boolean);
    if (patterns.length === 0) return SAFETY_FLOOR_EXCLUDE;
    return [...new Set([...patterns, ...SAFETY_FLOOR_EXCLUDE])];
  } catch {
    return SAFETY_FLOOR_EXCLUDE;
  }
}

/**
 * @param {string} [contractPath] override for testing
 * @returns {object[]} the raw parsed `patterns` array (each with pattern/gitignore_backed/reason),
 *   or [] on any load failure
 */
export function loadCollectionContractEntries(contractPath = CONTRACT_PATH) {
  try {
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    return contract.patterns || [];
  } catch {
    return [];
  }
}
