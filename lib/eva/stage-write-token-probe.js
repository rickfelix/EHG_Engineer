/**
 * Capability probe + normalizer for ventures.stage_write_token.
 *
 * SD-LEO-INFRA-STAGE-WRITER-CHOKE-001. The column is added by a chairman-gated migration
 * (database/chairman-gated/20260825_ventures_stage_write_token_column.sql) that may ship
 * un-applied for an indeterminate period -- confirmed live for the directly analogous R5 column
 * on strategic_directives_v2 (SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001), and for two
 * sibling chairman-gated migrations on ship_review_findings (see lib/ship/repo-column-probe.mjs,
 * the template this file mirrors). PostgREST rejects an UPDATE payload containing an unknown
 * column outright (PGRST204), so every writer that self-stamps must probe for the column's
 * existence at runtime and degrade to a plain, unstamped write when it is absent, rather than
 * erroring -- or breaking -- every stage-advance call in production before the chairman ceremony
 * applies the column.
 *
 * The probe result is cached for the lifetime of the process ONLY once confirmed either way by a
 * recognized "column does not exist" error code (42703 = Postgres undefined_column; PGRST204 =
 * PostgREST schema-cache miss for the same condition) -- an unrelated transient error (network,
 * auth) is never cached, so a real outage doesn't permanently wedge every future call into the
 * "absent" branch for the rest of the process.
 */

let stageWriteTokenExists = null; // null = unknown, true = confirmed present, false = confirmed absent

const COLUMN_ABSENT_CODES = new Set(['42703', 'PGRST204']);

/**
 * @param {object} supabase - Supabase client (service_role, or any role with SELECT on ventures).
 * @returns {Promise<boolean>}
 */
export async function probeStageWriteTokenExists(supabase) {
  if (stageWriteTokenExists !== null) return stageWriteTokenExists;
  if (!supabase) return false;
  try {
    // Intentional existence probe for a column the static schema snapshot doesn't know about yet
    // -- it only exists once the chairman applies the step-1 migration.
    const { error } = await supabase.from('ventures').select('stage_write_token').limit(1); // schema-lint-disable-line
    if (!error) {
      stageWriteTokenExists = true;
      return true;
    }
    if (COLUMN_ABSENT_CODES.has(error.code)) {
      stageWriteTokenExists = false;
      return false;
    }
    // Unrecognized error (network/auth/etc.) -- don't cache; degrade for this call only, retry
    // fresh next time.
    return false;
  } catch {
    // REGRESSION (Run Unit Tier, first real exercise of this probe against callers' existing
    // mocks): a THROWN exception here (e.g. a test's mock supabase not implementing .select()/
    // .limit() at all) previously propagated straight out of this function and into the caller's
    // own try/catch, silently skipping the caller's entire update (not just the stamp) -- the
    // exact "breaks the writer" failure mode this probe exists to prevent, just moved one level
    // up. This function's whole contract is "never throw, always resolve to a safe default";
    // catching here, not just handling a returned {error}, is what actually delivers that.
    return false;
  }
}

/**
 * @param {object} supabase
 * @param {string} writerIdentity - must match a row in ventures_canonical_writer_policy() once armed.
 * @returns {Promise<{stage_write_token: string} | {}>} spreadable into an .update() payload.
 */
export async function stageWriteTokenField(supabase, writerIdentity) {
  return (await probeStageWriteTokenExists(supabase)) ? { stage_write_token: writerIdentity } : {};
}

/** Test-only: reset the process-lifetime cache between test cases. */
export function __resetStageWriteTokenProbeForTests() {
  stageWriteTokenExists = null;
}
