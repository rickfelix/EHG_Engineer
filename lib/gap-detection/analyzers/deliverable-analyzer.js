/**
 * Deliverable Analyzer
 *
 * Identifies files changed by an SD using multiple strategies:
 * 1. Branch-based diff (if branch still exists)
 * 2. Commit message grep for SD key (primary for retroactive analysis)
 * 3. PR merge commit grep (for squash-merged PRs)
 * 4. Date-range fallback (least precise, filtered by SD key in paths)
 *
 * Categorizes file changes into: code, migration, test, config, docs.
 */

import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const FILE_CATEGORIES = [
  { pattern: /^database\/migrations\//, category: 'migration' },
  { pattern: /^tests\/|\.test\.|\.spec\.|__tests__/, category: 'test' },
  { pattern: /^config\/|\.config\.|\.env|tsconfig|package\.json/, category: 'config' },
  { pattern: /^docs\/|\.md$/, category: 'docs' },
  { pattern: /^lib\/|^src\/|^scripts\//, category: 'code' },
];

/**
 * Analyze deliverables for an SD by examining git history.
 * Uses multiple strategies in priority order for best accuracy.
 * @param {string} sdKey - The SD key
 * @param {object} options - Optional overrides { branch, since, until }
 * @returns {Promise<{deliverables: Array, error: string|null, partial: boolean, metadata: object}>}
 */
export async function analyzeDeliverables(sdKey, options = {}) {
  const sb = getSupabase();

  try {
    const { data: sd, error: sdError } = await sb
      .from('strategic_directives_v2')
      .select('created_at, updated_at, status')
      .eq('sd_key', sdKey)
      .single();

    if (sdError || !sd) {
      return { deliverables: [], error: 'SD_NOT_FOUND', partial: false, metadata: {} };
    }

    const branchName = options.branch;
    let files;
    let gitRange;
    let strategy;

    // Strategy 1: Branch-based diff (most accurate, only works if branch exists)
    if (branchName) {
      try {
        files = getFilesByBranch(branchName);
        gitRange = `main..${branchName}`;
        strategy = 'branch_diff';
      } catch {
        // Branch doesn't exist, fall through to next strategy
      }
    }

    // Strategy 2: Grep commit messages for SD key (primary retroactive method)
    if (!files || files.length === 0) {
      files = getFilesBySdKeyGrep(sdKey);
      if (files.length > 0) {
        gitRange = `grep:${sdKey}`;
        strategy = 'commit_grep';
      }
    }

    // Strategy 3: Search PR merge commits that reference the SD key
    if (!files || files.length === 0) {
      files = getFilesByMergeCommitGrep(sdKey);
      if (files.length > 0) {
        gitRange = `merge_grep:${sdKey}`;
        strategy = 'merge_commit_grep';
      }
    }

    // Strategy 4: Branch name pattern search in merged PRs
    if (!files || files.length === 0) {
      const branchPattern = sdKey.toLowerCase().replace(/[_]/g, '-');
      files = getFilesByBranchPattern(branchPattern);
      if (files.length > 0) {
        gitRange = `branch_pattern:${branchPattern}`;
        strategy = 'branch_pattern';
      }
    }

    // Strategy 5: Date-range fallback (least precise)
    if (!files || files.length === 0) {
      const since = options.since || sd.created_at;
      const until = options.until || sd.updated_at || new Date().toISOString();
      files = getFilesByDateRange(since, until);
      gitRange = `${since}..${until}`;
      strategy = 'date_range';
    }

    const deliverables = files.map(f => ({
      file: f.file,
      change_type: f.change_type,
      category: categorizeFile(f.file)
    }));

    return {
      deliverables,
      error: null,
      partial: false,
      metadata: {
        git_range: gitRange,
        strategy,
        files_analyzed: deliverables.length,
        categories: summarizeCategories(deliverables)
      }
    };
  } catch (err) {
    return { deliverables: [], error: 'GIT_ERROR', partial: false, metadata: { message: err.message } };
  }
}

/**
 * Get files from branch diff against main.
 */
function getFilesByBranch(branchName) {
  const output = execSync(
    `git diff --name-status main...${branchName}`,
    { encoding: 'utf-8', timeout: 30000 }
  ).trim();
  return parseNameStatus(output);
}

/**
 * Get files from commits whose messages contain the SD key.
 * This is the primary strategy for retroactive analysis of completed SDs.
 */
function getFilesBySdKeyGrep(sdKey) {
  try {
    const output = execSync(
      `git log main --name-status --pretty=format: --grep="${sdKey}" -i`,
      { encoding: 'utf-8', timeout: 30000 }
    ).trim();
    return deduplicateFiles(parseNameStatus(output));
  } catch {
    return [];
  }
}

/**
 * Get files from merge commits that reference the SD key.
 * Catches squash-merged PRs where the SD key is in the PR title.
 */
function getFilesByMergeCommitGrep(sdKey) {
  try {
    // Search merge commits specifically
    const output = execSync(
      `git log main --merges --name-status --pretty=format: --grep="${sdKey}" -i`,
      { encoding: 'utf-8', timeout: 30000 }
    ).trim();
    return deduplicateFiles(parseNameStatus(output));
  } catch {
    return [];
  }
}

/**
 * Search for merge commits whose branch name matches the SD key pattern.
 * Useful when commit messages don't contain the SD key but the branch does.
 */
function getFilesByBranchPattern(branchPattern) {
  try {
    // Search merge commit messages for branch name patterns like "feat/SD-..."
    const output = execSync(
      `git log main --merges --name-status --pretty=format: --grep="${branchPattern}" -i`,
      { encoding: 'utf-8', timeout: 30000 }
    ).trim();
    return deduplicateFiles(parseNameStatus(output));
  } catch {
    return [];
  }
}

/**
 * Date-range based file search (least precise fallback).
 */
function getFilesByDateRange(since, until) {
  const sinceDate = new Date(since).toISOString().split('T')[0];
  const untilObj = new Date(until);
  untilObj.setDate(untilObj.getDate() + 1);
  const untilDate = untilObj.toISOString().split('T')[0];

  const output = execSync(
    `git log main --name-status --pretty=format: --since="${sinceDate}" --until="${untilDate}"`,
    { encoding: 'utf-8', timeout: 30000 }
  ).trim();

  return deduplicateFiles(parseNameStatus(output));
}

function parseNameStatus(output) {
  if (!output) return [];

  const files = [];
  const seen = new Set();

  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^([AMDRC])\t(.+)$/);
    if (!match) continue;

    const [, status, filePath] = match;
    if (seen.has(filePath)) continue;
    seen.add(filePath);

    const changeMap = { A: 'added', M: 'modified', D: 'deleted', R: 'renamed', C: 'copied' };
    files.push({
      file: filePath,
      change_type: changeMap[status] || 'modified'
    });
  }

  return files;
}

function deduplicateFiles(files) {
  const map = new Map();
  for (const f of files) {
    if (!map.has(f.file)) map.set(f.file, f);
  }
  return [...map.values()];
}

function categorizeFile(filePath) {
  for (const { pattern, category } of FILE_CATEGORIES) {
    if (pattern.test(filePath)) return category;
  }
  return 'code';
}

function summarizeCategories(deliverables) {
  const counts = {};
  for (const d of deliverables) {
    counts[d.category] = (counts[d.category] || 0) + 1;
  }
  return counts;
}
