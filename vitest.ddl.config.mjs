/**
 * The DDL tier — SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B.
 *
 * A SEPARATE CONFIG, deliberately, and the reason is measured rather than stylistic.
 *
 * The existing `db` project in vitest.config.js gates on assessDbTarget, which parses SUPABASE_URL
 * for a supabase.co project ref. An ephemeral Postgres service container is not Supabase, so that
 * gate resolves `unrecognised_target`, the project collects ZERO files, and — with
 * `passWithNoTests: true` — the run goes GREEN having executed nothing.
 *
 * That is not hypothetical. migration-deploy-drift-guard.yml added a step specifically to make an
 * end-to-end proof reachable in CI, and it currently emits
 *   [vitest] db project DISABLED — no designated non-production target (reason: no_supabase_url).
 *   0 of db tests will run.
 * on every run. Routing this file through the same project would inherit that failure mode.
 *
 * So this config gates on NOTHING. There is no allowlist to satisfy and no ref to name, because
 * the target is a throwaway container created by the job itself and there is no production
 * database it could possibly be pointed at by mistake.
 *
 * `passWithNoTests` is FALSE (vitest's default, set explicitly because it is the whole point):
 * if the include glob ever stops matching, the run must FAIL. "The test did not run" and "the
 * test passed" have to be distinguishable from the outside.
 *
 * VERIFIED LOCALLY, with no Postgres running: this config collects the file (23 tests) and the
 * run FAILS with ECONNREFUSED rather than skipping green. Fail-closed is a measured property of
 * this setup, not an intention.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'ddl',
    globals: true,
    environment: 'node',
    include: ['tests/ddl/**/*.db.test.js'],
    // A zero-file run is a broken runner, not a clean bill of health.
    passWithNoTests: false,
    // The suite applies a migration and re-applies it; container cold start dominates.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Sequential. The grant and policy cases mutate shared table state and restore it; parallel
    // workers would interleave those mutations and the failures would be unattributable.
    // `poolOptions.forks.singleFork` was the Vitest 3 spelling and was REMOVED in Vitest 4 (it
    // emits a deprecation warning and is ignored) — the top-level options below are the v4 form.
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
