/**
 * deleteVentureFully — full single-venture teardown helper
 *
 * SD: SD-SINGLEVENTURE-AND-BULK-DELETE-ORCH-001-A (Phase 1)
 *
 * Lifts the master-reset teardown (server/routes/ventures.js POST /master-reset,
 * phases 1–6) and scopes it to a SINGLE venture. Unlike master-reset — which
 * calls the portfolio-wide `master_reset_portfolio` RPC — this helper calls the
 * single-venture `delete_venture(p_venture_id)` RPC.
 *
 * This module is the shared teardown engine that sibling child B will wire into
 * the `full-delete` / `bulk-full-delete` endpoints and the refactored
 * master-reset loop. It has no HTTP surface of its own.
 *
 * Phase order (credentials BEFORE DB delete, mirroring master-reset):
 *   1. Look up venture repo + name from venture_provisioning_state
 *   2. runTeardown(ventureId)            — external resources (Vercel/FS/Docker)
 *   3. markResourcesCleaned(ventureId)   — venture_resources status
 *   4. cleanupCredentials([ventureId])   — revoke credentials at providers
 *   5. delete_venture(p_venture_id) RPC  — DB cascade (BLOCKING)
 *   6. gh repo delete                    — guarded + injection-safe slug regex
 *   7. applications/registry.json edit   — remove the one venture's app entry
 *
 * Every phase except the DB delete is non-blocking: failures are captured in the
 * returned per-phase result rather than thrown.
 */

import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createSupabaseServiceClient } from './supabase-client.js';
import { runTeardown } from './cleanup/index.js';
import { markResourcesCleaned } from './venture-resources.js';
import { cleanup as cleanupCredentials } from './cleanup/credentials.js';

/**
 * Core repos that must NEVER be deleted. Canonical home for the guard set;
 * sibling child B refactors server/routes/ventures.js to import from here so the
 * list does not drift between the single-venture and portfolio paths.
 */
export const PROTECTED_REPOS = new Set([
  'rickfelix/ehg',
  'rickfelix/EHG_Engineer',
  'rickfelix/ehg_engineer',
]);

// Injection-safe slug: owner/repo of only safe path characters. Anything with
// shell metacharacters, spaces, or extra path segments is rejected before any
// shell invocation. (Hardening over master-reset, which only counted segments.)
// QF-20260525-419 (SEC-D-01): neither segment may START with '-' — a leading dash
// would otherwise be parsed by gh as a flag (arg-injection on a destructive delete).
const SAFE_SLUG_RE = /^[A-Za-z0-9_.][A-Za-z0-9_.-]*\/[A-Za-z0-9_.][A-Za-z0-9_.-]*$/;

/**
 * Extract and validate the owner/repo slug from a venture repo URL.
 * @param {string} url
 * @returns {{ slug: string|null, valid: boolean }}
 */
export function parseRepoSlug(url) {
  if (!url || typeof url !== 'string') return { slug: null, valid: false };
  const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
  const slug = (match ? match[1] : url).replace(/\.git$/, '').trim();
  return { slug, valid: SAFE_SLUG_RE.test(slug) };
}

/** @param {string} slug */
export function isProtectedRepo(slug) {
  return PROTECTED_REPOS.has(slug) || PROTECTED_REPOS.has(slug.toLowerCase());
}

/**
 * Full teardown for a single venture.
 *
 * @param {string} ventureId - UUID of the venture to delete
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false] - Threaded through to runTeardown/credentials
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabase] - Injectable client (tests)
 * @returns {Promise<{
 *   success: boolean,
 *   venture: { id: string, name: string|null },
 *   phases: Object
 * }>}
 */
export async function deleteVentureFully(ventureId, options = {}) {
  const { dryRun = false } = options;
  const supabase = options.supabase || createSupabaseServiceClient();

  const phases = {
    teardown: null,
    resources_marked: 0,
    credentials: { revoked: [], failed: [], skipped: [] },
    db: { success: false, count: 0 },
    github_repo: { slug: null, status: 'none' },
    registry: { cleaned: false },
  };

  if (!ventureId) {
    return { success: false, venture: { id: ventureId, name: null }, phases, error: 'ventureId is required' };
  }

  // Phase 1: collect repo + name BEFORE deletion
  let repoUrl = null;
  let ventureName = null;
  try {
    const { data: prov } = await supabase
      .from('venture_provisioning_state')
      .select('venture_id, venture_name, github_repo_url')
      .eq('venture_id', ventureId)
      .maybeSingle();
    repoUrl = prov?.github_repo_url || null;
    ventureName = prov?.venture_name || null;
  } catch (err) {
    phases.provisioning_error = err.message;
  }

  // Phase 2: external resource teardown (non-blocking)
  try {
    phases.teardown = await runTeardown(ventureId, { dryRun });
  } catch (err) {
    phases.teardown = { success: false, error: err.message };
  }

  // Phase 3: mark venture_resources cleaned (non-blocking)
  try {
    phases.resources_marked = await markResourcesCleaned(ventureId);
  } catch (err) {
    phases.resources_marked = 0;
    phases.resources_error = err.message;
  }

  // Phase 4: revoke credentials BEFORE DB deletion (non-blocking)
  try {
    phases.credentials = await cleanupCredentials([ventureId], { dryRun });
  } catch (err) {
    phases.credentials = { revoked: [], failed: [{ error: err.message }], skipped: [] };
  }

  // Phase 5: DB delete via SINGLE-venture RPC (BLOCKING)
  if (dryRun) {
    phases.db = { success: true, count: 0, dryRun: true };
  } else {
    try {
      const { data: rpcResult, error: rpcErr } = await supabase.rpc('delete_venture', { p_venture_id: ventureId });
      if (rpcErr || (rpcResult && rpcResult.success === false)) {
        phases.db = { success: false, count: 0, error: rpcErr?.message || rpcResult?.error || 'delete_venture failed' };
        return { success: false, venture: { id: ventureId, name: ventureName }, phases };
      }
      phases.db = { success: true, count: 1, deleted_counts: rpcResult?.deleted_counts };
      if (rpcResult?.venture_name) ventureName = ventureName || rpcResult.venture_name;
    } catch (err) {
      phases.db = { success: false, count: 0, error: err.message };
      return { success: false, venture: { id: ventureId, name: ventureName }, phases };
    }
  }

  // Phase 6: delete the GitHub repo (guarded, non-blocking)
  phases.github_repo = deleteGithubRepo(repoUrl, { dryRun });

  // Phase 7: clean applications/registry.json for this one venture (non-blocking)
  phases.registry = cleanRegistryEntry(ventureName, { dryRun });

  return { success: true, venture: { id: ventureId, name: ventureName }, phases };
}

/**
 * Delete a single GitHub repo behind the PROTECTED_REPOS guard + injection-safe slug.
 * @returns {{ slug: string|null, status: 'deleted'|'skipped'|'failed'|'none', reason?: string }}
 */
function deleteGithubRepo(repoUrl, { dryRun = false } = {}) {
  if (!repoUrl) return { slug: null, status: 'none' };

  const { slug, valid } = parseRepoSlug(repoUrl);
  if (!slug || !valid) {
    return { slug, status: 'failed', reason: 'invalid or unsafe repo slug' };
  }
  if (isProtectedRepo(slug)) {
    return { slug, status: 'skipped', reason: 'PROTECTED — core repo, never deleted' };
  }
  if (dryRun) {
    return { slug, status: 'skipped', reason: 'dryRun' };
  }

  try {
    // QF-20260525-419 (SEC-D-01): execFileSync = no shell, and '--' terminates flag
    // parsing so the slug can never be read as a gh flag (defense-in-depth with the
    // leading-dash-forbidding SAFE_SLUG_RE above).
    execFileSync('gh', ['repo', 'delete', '--yes', '--', slug], { timeout: 15000, stdio: 'pipe' });
    return { slug, status: 'deleted' };
  } catch (err) {
    // QF-20260525-419 (SEC-D-02): a missing gh binary throws ENOENT ("command not
    // found"), whose message contains "not found" — classify it as a real failure
    // BEFORE the already-gone branch so a missing CLI is never mistaken for success.
    if (err.code === 'ENOENT' || /ENOENT|command not found/i.test(err.message || '')) {
      return { slug, status: 'failed', reason: 'gh CLI not found (ENOENT)' };
    }
    const msg = err.stderr?.toString() || err.message || '';
    if (msg.includes('not found') || msg.includes('404')) {
      return { slug, status: 'deleted', reason: 'already gone' };
    }
    return { slug, status: 'failed', reason: msg.substring(0, 200) };
  }
}

/**
 * Remove a single venture's app entry from applications/registry.json.
 * Core apps (ehg, ehg_engineer, test-leo-project) are never removed.
 * @returns {{ cleaned: boolean, error?: string }}
 */
function cleanRegistryEntry(ventureName, { dryRun = false } = {}) {
  if (!ventureName) return { cleaned: false };
  try {
    const registryPath = resolve(process.cwd(), 'applications/registry.json');
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    const apps = registry.applications || {};
    const coreApps = new Set(['ehg', 'ehg_engineer', 'test-leo-project']);
    const target = ventureName.toLowerCase();

    let removed = 0;
    for (const [key, app] of Object.entries(apps)) {
      const name = (app.name || '').toLowerCase();
      if (name === target && !coreApps.has(name)) {
        if (!dryRun) delete apps[key];
        removed++;
      }
    }

    if (removed > 0 && !dryRun) {
      registry.metadata.total_apps = Object.keys(apps).length;
      registry.metadata.active_apps = Object.values(apps).filter(a => a.status === 'active').length;
      registry.metadata.last_updated = new Date().toISOString();
      writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');
    }
    return { cleaned: removed > 0 };
  } catch (err) {
    return { cleaned: false, error: err.message };
  }
}

export default deleteVentureFully;
