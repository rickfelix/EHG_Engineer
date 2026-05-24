/**
 * Repository Detection for Implementation Fidelity Validation
 * Part of SD-LEO-REFACTOR-IMPL-FIDELITY-001
 * Refactored: SD-LEARN-FIX-ADDRESS-PAT-AUTO-052 (multi-repo support via registry)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';
import { getSDSearchTerms } from './git-helpers.js';
import { resolveRepoPath, ENGINEER_ROOT } from '../../../../lib/repo-paths.js';
import { resolveWorktreeCwd } from '../../../../lib/resolve-worktree-cwd.js';

const execAsync = promisify(exec);

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const EHG_ENGINEER_ROOT = ENGINEER_ROOT;
export const EHG_ROOT = resolveRepoPath('ehg') || path.resolve(ENGINEER_ROOT, '..', 'ehg');

/**
 * Resolve repos for an SD using application registry + target_application field.
 * Falls back to hardcoded paths if registry is missing.
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @returns {Promise<string[]>} - Array of repo root paths to search
 */
export async function resolveReposForSD(sd_id, supabase) {
  // 1. Check if SD has a target_application
  let targetApp = null;
  try {
    const { data } = await supabase
      .from('strategic_directives_v2')
      .select('target_application')
      .or(`sd_key.eq.${sd_id},id.eq.${sd_id}`)
      .limit(1)
      .single();
    targetApp = data?.target_application;
  } catch (_) {
    // Ignore - will fallback to all repos
  }

  // 2. Load registry
  let registry = null;
  try {
    const registryPath = path.resolve(EHG_ENGINEER_ROOT, 'applications/registry.json');
    const content = await readFile(registryPath, 'utf8');
    registry = JSON.parse(content);
  } catch (_) {
    // Registry missing — fallback to hardcoded paths
    console.log('   ⚠️  Registry not found, falling back to hardcoded repo paths');
    return [EHG_ROOT, EHG_ENGINEER_ROOT];
  }

  const apps = registry.applications || {};
  const activeApps = Object.values(apps).filter(a => a.status === 'active');

  // 3. If target_application set, return only that app's path
  if (targetApp) {
    const match = activeApps.find(a => a.name === targetApp || a.id === targetApp);
    if (match && match.local_path) {
      const resolved = path.resolve(match.local_path);
      console.log(`   📋 Registry resolved ${targetApp} → ${resolved}`);
      return [resolved];
    }
    // target_application set but no local_path — try auto-discovery
    if (match) {
      const discovered = path.resolve(EHG_ENGINEER_ROOT, '..', match.name);
      console.log(`   📋 Auto-discovered ${targetApp} → ${discovered}`);
      return [discovered];
    }
  }

  // 4. No target_application — return all active repos with local_path
  const paths = [];
  for (const app of activeApps) {
    if (app.local_path) {
      paths.push(path.resolve(app.local_path));
    } else {
      // Auto-discover by scanning parent directory for matching repo name
      paths.push(path.resolve(EHG_ENGINEER_ROOT, '..', app.name));
    }
  }

  // Always include EHG_ENGINEER_ROOT if not already present
  const engineerNorm = EHG_ENGINEER_ROOT.replace(/\\/g, '/');
  if (!paths.some(p => p.replace(/\\/g, '/') === engineerNorm)) {
    paths.push(EHG_ENGINEER_ROOT);
  }

  return paths;
}

/**
 * Detect ALL repositories containing implementation for this SD.
 * Returns an array of repo root paths where SD artifacts were found.
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @returns {Promise<string[]>} - Array of repo root paths with SD artifacts
 */
export async function detectImplementationRepos(sd_id, supabase) {
  const searchTerms = await getSDSearchTerms(sd_id, supabase);

  // PAT-WORKTREE-LIFECYCLE-001: If running inside a worktree for this SD, include cwd first
  const cwd = process.cwd();
  const cwdNorm = cwd.replace(/\\/g, '/');
  const foundRepos = [];
  // SD-FDBK-ENH-GATE2-IMPLEMENTATION-FIDELITY-002: the SD-KEY (not the UUID) drives worktree
  // resolution — resolveWorktreeCwd's extractSdId regex matches the SD-key form, not a UUID.
  const sdKey = searchTerms.find(t => t.startsWith('SD-'));

  if (cwdNorm.includes('.worktrees/')) {
    if (sdKey && cwdNorm.includes(sdKey)) {
      console.log(`   📋 Worktree detected for ${sdKey}, using cwd: ${cwd}`);
      foundRepos.push(cwd);
    }
  }

  // Get candidate repos from registry
  const candidateRepos = await resolveReposForSD(sd_id, supabase);

  if (searchTerms.length > 1) {
    console.log(`   📋 Also searching for sd_key: ${searchTerms[1]}`);
  }

  // Check each candidate repo for SD commits
  for (const repo of candidateRepos) {
    // Skip if already added (worktree)
    const repoNorm = repo.replace(/\\/g, '/');
    if (foundRepos.some(r => r.replace(/\\/g, '/') === repoNorm)) continue;

    for (const term of searchTerms) {
      try {
        const { stdout } = await execAsync(
          `git -C "${repo}" log --all --grep="${term}" --format="%H" -n 1`,
          { timeout: 10000 }
        );
        if (stdout.trim()) {
          console.log(`   💡 Implementation detected in: ${repo} (matched: ${term})`);
          foundRepos.push(repo);
          break; // Found in this repo, move to next repo
        }
      } catch (_error) {
        continue;
      }
    }
  }

  // If nothing found, default to cwd
  if (foundRepos.length === 0) {
    console.log(`   ⚠️  No SD commits found in known repos, using current directory: ${cwd}`);
    foundRepos.push(cwd);
  }

  // SD-FDBK-ENH-GATE2-IMPLEMENTATION-FIDELITY-002: redirect each resolved repo to the SD's
  // worktree when one exists. The git `--all` commit scan above is worktree-agnostic (worktrees
  // share the repo's .git object DB), so foundRepos holds repo ROOTS — but the downstream
  // section validators also run non-`--all` FILESYSTEM scans (migration dirs, test dirs,
  // readFile) that read the on-disk checkout. For an EHG-targeted SD whose code lives in an
  // ehg worktree on a non-default branch, scanning the root (parked on another branch) misses
  // the files → false-RED ~68 → forced --bypass-validation. Mirrors the GATE5/GATE6 fix
  // (SD-LEO-INFRA-BRANCH-AWARE-PLAN-001 via resolveWorktreeCwd). Null-fallback keeps
  // EHG_Engineer self-target + non-worktree runs byte-identical; normalize + de-dup preserves
  // primaryMigrationRepo ordering (target repo stays first).
  const resolved = [];
  const seen = new Set();
  for (const repo of foundRepos) {
    const redirected = (sdKey ? resolveWorktreeCwd(repo, { sdId: sdKey }) : null) || repo;
    const norm = path.resolve(redirected).replace(/\\/g, '/');
    if (seen.has(norm)) continue;
    seen.add(norm);
    resolved.push(redirected);
    if (redirected !== repo) {
      console.log(`   🌲 Worktree resolved for fidelity scan: ${redirected} (was ${repo})`);
    }
  }

  return resolved;
}

/**
 * Backward-compatible alias: returns the first (primary) repo.
 * Existing callers using detectImplementationRepo() continue to work.
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @returns {Promise<string>} - Root path of primary implementation repository
 */
export async function detectImplementationRepo(sd_id, supabase) {
  const repos = await detectImplementationRepos(sd_id, supabase);
  return repos[0];
}
