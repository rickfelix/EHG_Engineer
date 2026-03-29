/**
 * Git History Scanner — scans git log for stage-relevant commits
 * across both EHG_Engineer and EHG app repos.
 *
 * Part of: Pattern Discovery Agent (SD-AUTOMATED-PROVING-RUN-ENGINE-ORCH-001-B)
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { resolveRepoPath, ENGINEER_ROOT } from '../../../lib/repo-paths.js';

const MAX_COMMITS = 50;
const EHG_APP_PATH = resolveRepoPath('ehg') || path.resolve(ENGINEER_ROOT, '..', 'ehg');

/**
 * Scan git history for a single repo, filtering by stage-relevant paths.
 * @param {string} repoPath - Absolute path to repo
 * @param {string[]} pathPatterns - Glob patterns to filter commits
 * @param {number} limit - Max commits to return
 * @returns {Array<{hash: string, subject: string, date: string, files: string[]}>}
 */
function scanRepoHistory(repoPath, pathPatterns, limit = MAX_COMMITS) {
  if (!existsSync(repoPath)) return [];

  // Convert glob patterns to git-log-friendly paths
  const pathArgs = pathPatterns
    .map(p => p.replace(/\*/g, ''))  // Strip globs for git log -- paths
    .filter(p => p.length > 3)        // Skip overly broad patterns
    .map(p => `"${p}"`)
    .join(' ');

  if (!pathArgs) return [];

  try {
    const cmd = `git -C "${repoPath}" log --oneline --name-only -n ${limit} --diff-filter=AMRC -- ${pathArgs}`;
    const output = execSync(cmd, { encoding: 'utf8', timeout: 30000 }).trim();
    if (!output) return [];

    return parseGitLog(output);
  } catch {
    return [];
  }
}

/**
 * Parse git log --oneline --name-only output into structured commits.
 */
function parseGitLog(output) {
  const commits = [];
  let current = null;

  for (const line of output.split('\n')) {
    if (!line.trim()) continue;

    // Commit line: hash + subject (7+ char hash at start)
    const commitMatch = line.match(/^([a-f0-9]{7,}) (.+)$/);
    if (commitMatch) {
      if (current) commits.push(current);
      current = {
        hash: commitMatch[1],
        subject: commitMatch[2],
        files: [],
      };
    } else if (current) {
      // File path line
      current.files.push(line.trim());
    }
  }
  if (current) commits.push(current);

  return commits;
}

/**
 * Scan git history for all stages across both repos.
 * @param {Object.<number, import('./stage-mapper.js').StageMapping>} stages
 * @param {object} options
 * @param {string} [options.engineerPath] - Path to EHG_Engineer repo
 * @param {string} [options.appPath] - Path to EHG app repo
 * @returns {Object.<number, {engineer: Array, app: Array}>}
 */
export function scanAllStages(stages, options = {}) {
  const engineerPath = options.engineerPath || process.cwd();
  const appPath = options.appPath || EHG_APP_PATH;

  const results = {};

  for (const [stageNum, stage] of Object.entries(stages)) {
    const num = parseInt(stageNum);

    // Scan EHG_Engineer repo
    const engineerCommits = scanRepoHistory(
      engineerPath,
      stage.engineer?.serviceScripts || [],
      MAX_COMMITS
    );

    // Scan EHG app repo
    const appCommits = scanRepoHistory(
      appPath,
      stage.app?.filePatterns || [],
      MAX_COMMITS
    );

    results[num] = {
      engineer: {
        commitCount: engineerCommits.length,
        commits: engineerCommits.slice(0, 10), // Keep top 10 for output
        patterns: extractPatterns(engineerCommits),
      },
      app: {
        commitCount: appCommits.length,
        commits: appCommits.slice(0, 10),
        patterns: extractPatterns(appCommits),
      },
    };
  }

  return results;
}

/**
 * Extract pattern keywords from commit subjects.
 */
function extractPatterns(commits) {
  const keywords = new Set();
  const patterns = {
    additions: 0,
    modifications: 0,
    refactors: 0,
  };

  for (const c of commits) {
    const subj = c.subject.toLowerCase();
    if (subj.includes('feat') || subj.includes('add')) patterns.additions++;
    if (subj.includes('fix') || subj.includes('update')) patterns.modifications++;
    if (subj.includes('refactor') || subj.includes('cleanup')) patterns.refactors++;

    // Extract meaningful keywords
    for (const word of subj.split(/[\s:,()]+/)) {
      if (word.length > 4 && !['feat', 'fix', 'chore', 'docs', 'test', 'merge'].includes(word)) {
        keywords.add(word);
      }
    }
  }

  return { ...patterns, keywords: [...keywords].slice(0, 20) };
}
