/**
 * completion-migration-gate — QF-20260830-232.
 *
 * LEAD-FINAL-APPROVAL must not let an SD close "completed" while it shipped a
 * database/migrations/*.sql file that was never actually applied (no row in
 * schema_migrations_applied) and no explicit deferral names an owner + due date.
 * SPECIMEN: SD-LEO-INFRA-COMPETITIVE-OBSERVED-TAG-MIGRATION-001 closed completed
 * 2026-06-24 with the migration's own DORMANT header the only record of the
 * deferral — nothing durable tracked it, so the deferral evaporated at completion.
 *
 * Git tracing mirrors adam-coordinator-health.mjs's gitGrepMainForSd (same
 * merge-commit-by-sd_key-grep pattern) rather than re-deriving a second heuristic.
 * Applied-state check is injected by the caller (handoff-validator.js passes
 * lib/migration-audit-reader.js's getLatestSuccessForPath — the PRD FR-6
 * consumer-contract helper — rather than a raw table SELECT).
 */

import { execSync } from 'child_process';

/** Migration files ADDED by commits on origin/main mentioning sdKey. Injectable git for tests. */
export function enumerateMigrationsForSd(sdKey, { repoPath, git = execSync } = {}) {
  try {
    const opts = { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'], ...(repoPath ? { cwd: repoPath } : {}) };
    const safeKey = String(sdKey).replace(/["\\$`]/g, '');
    const hashes = git(`git log origin/main --grep="${safeKey}" --format=%H`, opts).trim();
    if (!hashes) return { paths: [], unverifiable: false };
    const paths = new Set();
    for (const h of hashes.split('\n').filter(Boolean)) {
      const out = git(`git show ${h} --diff-filter=A --name-only --format= -- database/migrations`, opts).trim();
      out.split('\n').filter(Boolean).forEach((p) => paths.add(p));
    }
    return { paths: [...paths], unverifiable: false };
  } catch {
    return { paths: [], unverifiable: true };
  }
}

/** metadata.deferred_migrations[] entry naming an owner + due_date for this path, or null. */
export function findDeferral(metadata, path) {
  const list = metadata && Array.isArray(metadata.deferred_migrations) ? metadata.deferred_migrations : [];
  return list.find((d) => d && d.migration_path === path && d.owner && d.due_date) || null;
}

/**
 * Pure gate over an already-enumerated path list: which paths are neither
 * applied nor validly deferred. isApplied is injected (async path -> boolean).
 */
export async function evaluateMigrationGate({ metadata, paths }, isApplied) {
  const unresolved = [];
  for (const path of paths || []) {
    if (findDeferral(metadata, path)) continue;
    const applied = await isApplied(path);
    if (!applied) unresolved.push(path);
  }
  return { blocked: unresolved.length > 0, unresolved };
}
