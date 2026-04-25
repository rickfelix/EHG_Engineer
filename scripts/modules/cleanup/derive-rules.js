/**
 * Derive commit-category rule suggestions from git log.
 *
 * Mines added-file paths (--diff-filter=A) and proposes patterns whose
 * inferred dirname/extension recurs across enough prior commits to be
 * non-coincidental. Suggestions are commit-only by design — never delete.
 */

import { execSync } from 'child_process';
import { inferPattern } from './group-review.js';
import { parsePathsOnly } from '../../proving-run/pattern-discovery/git-scanner.js';

export const DEFAULT_MIN_COMMITS = 2;
export const DEFAULT_MAX_COMMITS_SCANNED = 1000;

export const parseAddedFiles = parsePathsOnly;

function runGitLog(repoPath, maxCommits) {
  const cmd = `git -C "${repoPath}" log --diff-filter=A --pretty= --name-only -n ${maxCommits}`;
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

export function deriveRulesFromGitLog(options = {}) {
  const {
    repoPath = process.cwd(),
    minCommits = DEFAULT_MIN_COMMITS,
    maxCommitsScanned = DEFAULT_MAX_COMMITS_SCANNED,
    rawLog
  } = options;

  let output;
  try {
    output = rawLog ?? runGitLog(repoPath, maxCommitsScanned);
  } catch {
    return [];
  }

  const counts = new Map();
  for (const filePath of parseAddedFiles(output)) {
    const pattern = inferPattern(filePath);
    counts.set(pattern, (counts.get(pattern) || 0) + 1);
  }

  const suggestions = [];
  for (const [pattern, occurrences] of counts) {
    if (occurrences < minCommits) continue;
    suggestions.push({
      pattern,
      category: 'commit',
      reason: `Recurring added-file pattern (${occurrences} prior commits)`,
      occurrences
    });
  }
  suggestions.sort((a, b) => b.occurrences - a.occurrences || a.pattern.localeCompare(b.pattern));
  return suggestions;
}
