/**
 * Database sweeper for the stage 21-26 census (FR-1, FR-7).
 *
 * Every query here is written with a POSIX bracket class ([0-9]) fragment for the stage-number
 * range, never \d/\w/\s/\m/\M -- see regex.mjs's header for why. Each function takes an
 * INJECTED pg client (TR-2, Testability-Aware Implementation) so unit tests can pass a stub and
 * the CLI can pass a real connection from createDatabaseClient('engineer') -- the single shared
 * Postgres instance both the 'engineer' and 'ehg' client aliases resolve to (FR-7): this sweeper
 * connects ONCE, never twice, so the census reads "2 repos, 1 shared database."
 */
import { SQL_STAGE_NUMBER_FRAGMENT } from './regex.mjs';

const RANGE = SQL_STAGE_NUMBER_FRAGMENT; // '2[1-6]'

/**
 * The negative-control data source: component_path values that embed a DIFFERENT stage number
 * than the row's own stage_number column. This is the exact detector VALIDATION's own probe
 * demonstrated silently returning 0 rows when written with \\d instead of [0-9].
 * @param {{query: Function}} client
 */
export async function sweepComponentPathMismatches(client) {
  const { rows } = await client.query(
    `SELECT stage_number, component_path FROM venture_stages WHERE component_path ~ 'Stage[0-9]+'`
  );
  const mismatches = [];
  for (const row of rows) {
    const m = /Stage([0-9]+)/.exec(row.component_path);
    if (!m) continue;
    const embedded = Number(m[1]);
    if (embedded !== Number(row.stage_number)) {
      mismatches.push({ stage_number: Number(row.stage_number), component_path: row.component_path, embedded_stage_number: embedded });
    }
  }
  return mismatches;
}

/** information_schema census of stage-bearing columns on the 4 named tables. */
export async function sweepStageBearingColumns(client) {
  const { rows } = await client.query(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])
       AND column_name ILIKE '%stage%'
     ORDER BY table_name, column_name`,
    [['ventures', 'venture_stages', 'eva_stage_gate_attempts', 'venture_stage_transitions']]
  );
  return rows;
}

/**
 * jsonb metadata path sweep for stage 21-26 literals inside known metadata blobs.
 * RANGE is bound as a query parameter ($1), never interpolated into the SQL text itself --
 * it is a hardcoded constant with no external input today, but building the query string via
 * template-literal interpolation is the same textual shape a real SQL-injection vector would
 * take, and the ship-gate's closed-enumeration scanner correctly flags that shape regardless of
 * where the interpolated value comes from.
 */
export async function sweepJsonbMetadataPaths(client) {
  const { rows } = await client.query(
    `SELECT attempt_id AS id, 'eva_stage_gate_attempts' AS table_name
     FROM eva_stage_gate_attempts
     WHERE metadata::text ~ ('stage[-_]?' || $1)`,
    [RANGE]
  );
  return rows;
}

/** pg_proc function bodies mentioning "stage" and an in-range literal. RANGE bound via $1. */
export async function sweepPgProcBodies(client) {
  const { rows } = await client.query(
    `SELECT proname
     FROM pg_proc
     WHERE prosrc ~* 'stage'
       AND prosrc ~ $1
     ORDER BY proname`,
    [RANGE]
  );
  return rows;
}

/** views/matviews whose definition mentions "stage" and an in-range literal. RANGE bound via $1. */
export async function sweepViewsAndMatviews(client) {
  const { rows } = await client.query(
    `SELECT viewname AS name, 'view' AS kind FROM pg_views
       WHERE schemaname = 'public' AND definition ~* 'stage' AND definition ~ $1
     UNION ALL
     SELECT matviewname AS name, 'matview' AS kind FROM pg_matviews
       WHERE schemaname = 'public' AND definition ~* 'stage' AND definition ~ $1`,
    [RANGE]
  );
  return rows;
}

/** The 3 known array-typed stage-number columns, checked for in-range elements. */
export async function sweepArrayColumns(client) {
  const { rows } = await client.query(
    `SELECT 'venture_stages.depends_on' AS surface, stage_number, depends_on AS elements
       FROM venture_stages
       WHERE EXISTS (SELECT 1 FROM unnest(depends_on) d WHERE d::int BETWEEN 21 AND 26)
     UNION ALL
     SELECT 'lifecycle_phases.stages' AS surface, phase_number AS stage_number, stages AS elements
       FROM lifecycle_phases
       WHERE EXISTS (SELECT 1 FROM unnest(stages) s WHERE s::int BETWEEN 21 AND 26)
     UNION ALL
     SELECT 'chairman_dashboard_config.hard_gate_stages' AS surface, NULL::int AS stage_number, hard_gate_stages AS elements
       FROM chairman_dashboard_config
       WHERE EXISTS (SELECT 1 FROM unnest(hard_gate_stages) h WHERE h::int BETWEEN 21 AND 26)`
  );
  return rows;
}
