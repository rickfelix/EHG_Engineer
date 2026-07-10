/**
 * SD-ARCH-HOTSPOT-LEO-CREATE-001: cross-repo target-repos parsing, moved VERBATIM from
 * scripts/leo-create-sd.js. Lives under scripts/ (NOT lib/sd-creation) on purpose:
 * tests/unit/leo-create-sd-target-repos.test.js behaviorally pins that an invalid repo
 * value calls process.exit(1), so the exit stays — the lib/sd-creation no-process.exit
 * invariant does not apply here. scripts/leo-create-sd.js re-exports every name.
 */

// ============================================================================
// Cross-Repo Target Repos Parsing (SD-LEO-INFRA-LEO-CREATE-CROSS-001)
// ============================================================================

/**
 * Allowed platform repo names for the --target-repos flag.
 * Writer/consumer parity with computeReposForSD() in
 * scripts/modules/handoff/executors/lead-final-approval/gates.js (SD-LEO-INFRA-CROSS-REPO-MERGE-001).
 * Canonical casing: 'EHG' and 'EHG_Engineer'.
 */
export const ALLOWED_REPOS = new Set(['EHG', 'EHG_Engineer']);

/**
 * Parse the --target-repos comma-separated list, validate against ALLOWED_REPOS,
 * normalize case (ehg → EHG, ehg_engineer → EHG_Engineer), dedup, return array.
 *
 * @param {string|null|undefined} raw - Comma-separated repo list (e.g., "EHG,EHG_Engineer")
 * @returns {string[]|null} Normalized array; null if raw is empty/missing
 *
 * On invalid repo: console.error with `[INVALID_TARGET_REPOS]` bracket-tokenized
 * message and process.exit(1). Pure function otherwise (no side effects).
 */
export function parseTargetReposArg(raw) {
  if (raw == null || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const parts = trimmed.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const normalized = [];
  const seen = new Set();
  for (const part of parts) {
    const lower = part.toLowerCase();
    let canonical = null;
    if (lower === 'ehg_engineer') canonical = 'EHG_Engineer';
    else if (lower === 'ehg') canonical = 'EHG';

    if (canonical === null || !ALLOWED_REPOS.has(canonical)) {
      console.error(`\n❌ [INVALID_TARGET_REPOS] Invalid --target-repos value: "${part}". Valid: ${[...ALLOWED_REPOS].join(', ')}.`);
      process.exit(1);
    }

    if (!seen.has(canonical)) {
      seen.add(canonical);
      normalized.push(canonical);
    }
  }

  return normalized;
}

/**
 * Build the create-orchestrator-from-plan.js exec command for the auto-route path,
 * forwarding --target-repos for cross-repo orchestrator SDs (QF-20260524-566 /
 * feedback 0ee3c3b8 Bug 2). Pure + exported for unit testing. `targetRepos` is the
 * normalized array from parseTargetReposArg (or null for single-repo SDs).
 */
export function buildOrchestratorCmd({ visionKey, archKey, title, targetRepos } = {}) {
  let cmd = `node scripts/create-orchestrator-from-plan.js --vision-key ${visionKey} --arch-key ${archKey} --title "${title}" --auto-children`;
  if (Array.isArray(targetRepos) && targetRepos.length > 0) {
    cmd += ` --target-repos ${targetRepos.join(',')}`;
  }
  return cmd;
}
