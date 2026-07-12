/**
 * OBSERVED-tag migration apply-status verification — SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-F FR-1/TR-1.
 *
 * database/migrations/20260623_competitive_baselines_epistemic_tag_add_observed.sql is ALREADY
 * AUTHORED and merged (SD-LEO-INFRA-COMPETITIVE-OBSERVED-TAG-MIGRATION-001, completed) — this
 * module does NOT re-author it. It verifies the migration's LIVE-apply status via
 * pg_get_constraintdef(pg_constraint), never a PostgREST head-count probe (a documented
 * false-positive-prone pattern in this repo — see scripts/verify-migration-apply-state.mjs's
 * header for two named historical incidents where a head-count probe missed a
 * committed-but-never-deployed migration).
 *
 * Because the constraint `competitive_baselines_epistemic_tag_check` predates this migration
 * (it's a CHECK-WIDEN, not a fresh CREATE), a bare to_regclass/existence check would always
 * report the constraint present regardless of whether OBSERVED was actually added — so this
 * checks the constraint DEFINITION contains 'OBSERVED', not merely its existence.
 */

const CONSTRAINT_NAME = 'competitive_baselines_epistemic_tag_check';
const REQUIRED_VALUE = 'OBSERVED';

/**
 * Verify whether the OBSERVED CHECK-widen is live.
 * @param {object} pgClient - a connected pg client/pool exposing .query(sql, params)
 * @returns {Promise<{applied: boolean, constraintDef: string|null, checked_at: string}>}
 */
export async function checkObservedMigrationApplied(pgClient) {
  const { rows } = await pgClient.query(
    'SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = $1',
    [CONSTRAINT_NAME]
  );
  const constraintDef = rows[0]?.def ?? null;
  return {
    applied: constraintDef != null && constraintDef.includes(REQUIRED_VALUE),
    constraintDef,
    checked_at: new Date().toISOString(),
  };
}

export { CONSTRAINT_NAME, REQUIRED_VALUE };
