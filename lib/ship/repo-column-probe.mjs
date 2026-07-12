/**
 * Capability probe + normalizer for ship_review_findings.repo.
 *
 * SD-APEXNICHE-AI-LEO-GEN-WITNESS-LOOKUP-DURABLE-001 (FR-4/5/6). The repo
 * column is added by a chairman-gated migration
 * (database/migrations/20260712_ship_review_findings_repo_column.sql) that
 * may ship un-applied for an indeterminate period -- two sibling
 * chairman-gated migrations on this same table have sat un-applied for
 * months (confirmed live via security-agent LEAD review). Every writer
 * (FR-5) and the FR-6 reader must therefore probe for the column's
 * existence at runtime and degrade to today's exact pre-repo-column
 * behavior when it is absent, rather than erroring the whole insert/read.
 *
 * The probe result is cached for the lifetime of the process ONLY once
 * confirmed either way by a recognized "column does not exist" error code
 * (42703 = Postgres undefined_column; PGRST204 = PostgREST schema-cache
 * miss for the same condition) -- an unrelated transient error (network,
 * auth) is never cached, so a real outage doesn't permanently wedge every
 * future call into the "absent" branch for the rest of the process.
 */

let repoColumnExists = null; // null = unknown, true = confirmed present, false = confirmed absent

const COLUMN_ABSENT_CODES = new Set(['42703', 'PGRST204']);

/**
 * @param {object} supabase - Supabase service-role client.
 * @returns {Promise<boolean>}
 */
export async function probeRepoColumnExists(supabase) {
  if (repoColumnExists !== null) return repoColumnExists;
  if (!supabase) return false;
  // Intentional existence probe for a column the static schema snapshot doesn't
  // know about yet -- it only exists once the chairman applies the FR-4 migration.
  const { error } = await supabase.from('ship_review_findings').select('repo').limit(1); // schema-lint-disable-line
  if (!error) {
    repoColumnExists = true;
    return true;
  }
  if (COLUMN_ABSENT_CODES.has(error.code)) {
    repoColumnExists = false;
    return false;
  }
  // Unrecognized error (network/auth/etc.) -- don't cache; degrade for this
  // call only, retry fresh next time.
  return false;
}

/** Test-only: reset the process-lifetime cache between test cases. */
export function __resetRepoColumnProbeForTests() {
  repoColumnExists = null;
}

/** Normalize a github_repo field ('owner/name.git' or 'owner/name') to 'owner/name' lowercase. */
export function normalizeGithubRepo(githubRepo) {
  if (!githubRepo) return null;
  return githubRepo.replace(/\.git$/i, '').toLowerCase();
}
