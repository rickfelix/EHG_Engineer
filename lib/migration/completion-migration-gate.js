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
 *
 * NO LIVE CALLER FROM scripts/handoff.js's LEAD-FINAL-APPROVAL PATH (SD-LEO-INFRA-
 * COMPLETION-GATE-DATA-001-A FR-1): this gate is wired into scripts/handoff-validator.js
 * (see the `handoffKey === 'LEAD-FINAL-APPROVAL'` branch below), but handoff-validator.js
 * itself has NO caller from the canonical scripts/handoff.js entrypoint — its
 * LEAD-FINAL-APPROVAL branch has never executed in that flow. The ACTUAL
 * migration-completion verification for LEAD-FINAL-APPROVAL lives in a separate,
 * well-tested mechanism: createChairmanApplyVerificationGate
 * (scripts/modules/handoff/executors/lead-final-approval/gates.js), hardened by
 * SD-LEO-INFRA-COMPLETED-UNAPPLIED-MIGRATION-001 (completed 2026-08-30) — that is the
 * authoritative gate for LEAD-FINAL-APPROVAL, not this file.
 *
 * This module's REAL live callers (per LEAD VALIDATION for this SD) are:
 *   - leo-orchestrator-enforced.js (npm run leo:execute)
 *   - PlanToExecVerifier (PLAN-to-EXEC transition only)
 *   - verify-l2p
 *   - a _deprecated/ file
 * None of those are the LEAD-FINAL-APPROVAL path, so the originally-suspected
 * git-enumeration/stale-ref RCA was disproven FOR THAT SPECIFIC BRANCH (never reached).
 * The stale-ref blind spot the Explore sub-agent independently found in
 * enumerateMigrationsForSd below (no `git fetch` before `git log` against origin/main)
 * remains a REAL defect in the function itself — fixed below (FR-3) since it is shared
 * code reachable from the callers listed above. The identical pattern is mirrored in
 * adam-coordinator-health.mjs's `gitGrepMainForSd` (same no-fetch-before-grep gap),
 * which is NOT fixed by this SD — documented here for a future follow-up rather than
 * silently left uncited.
 */

import { execSync } from 'child_process';

/**
 * Migration files ADDED by commits on origin/main mentioning sdKey. Injectable git for
 * tests.
 *
 * FR-3: fetches origin/main first so `git log origin/main --grep=...` is evaluated
 * against a fresh ref rather than a stale local mirror of origin/main (the same class
 * of gap mirrored in adam-coordinator-health.mjs's gitGrepMainForSd, documented above
 * but not fixed there by this SD). A fetch failure returns {paths:[], unverifiable:true}
 * — the SAME shape every existing caller already treats as block/defer — rather than
 * silently falling through to a stale (possibly empty) `git log` result that would read
 * as a false "no migrations to check" pass.
 */
export function enumerateMigrationsForSd(sdKey, { repoPath, git = execSync } = {}) {
  try {
    const opts = { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'], ...(repoPath ? { cwd: repoPath } : {}) };
    // FR-3: freshness check before the grep. On failure, surface unverifiable:true
    // immediately rather than falling through to a stale/empty git log pass.
    git('git fetch origin main --quiet', opts);
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
