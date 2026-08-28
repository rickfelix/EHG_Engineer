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

/**
 * Schema-wide sweep for stage-bearing columns (SD-LEO-INFRA-STAGE-KEYED-DATA-001, FR-1).
 *
 * Unlike sweepStageBearingColumns (which is pinned to the 4-table allowlist used by the -A code
 * census and is left unmodified for that SD's backward compatibility), this sweep is schema-wide:
 * no table_name allowlist. This is the corrected instrument -- VALIDATION sub-agent evidence
 * (45d1f8b3-8a03-465c-bf76-9231b9df82df) measured live that the 4-table allowlist reports "7
 * stage-bearing columns" while the true schema-wide answer is 134 columns across 93 tables, and
 * that 3 of this SD's own named minimum-set columns (gate_boundary_config.stage_number,
 * venture_capture_snapshots.stage_number, stage_executions.stage_number) do not exist as named --
 * only a schema-wide sweep surfaces the corrected names.
 * @param {{query: Function}} client
 */
export async function sweepStageBearingColumnsSchemaWide(client) {
  const { rows } = await client.query(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND column_name ILIKE '%stage%'
     ORDER BY table_name, column_name`
  );
  return rows;
}

/**
 * Schema-wide sweep for CHECK constraints whose clause contains a given numeric literal
 * (SD-LEO-INFRA-STAGE-KEYED-DATA-001, FR-2, TR-1).
 *
 * Deliberately uses a parameterized LIKE predicate ('%' || $1 || '%'), never a regex -- this is
 * the safest possible choice given VALIDATION's live-reproduced finding that a naive JS-authored
 * word-boundary regex (\\m/\\y) silently degrades during JS-to-SQL authoring and matches nothing,
 * returning a confident zero instead of an error. LIKE has no backslash-escape authoring path to
 * degrade. The literal is bound as a query parameter, never interpolated into the SQL text.
 *
 * columns is enriched via a LEFT JOIN against pg_attribute/conkey for report readability ONLY --
 * it never excludes a row. An earlier draft required the constrained column's NAME to match
 * '%stage%' (a HAVING filter) to guard against a coincidental numeric match like
 * CHECK (price <= 260); live-measured against this SD's own RISK/DATABASE sub-agent evidence, that
 * filter was WRONG, not merely cautious -- it silently dropped
 * venture_artifacts_artifact_type_check, a genuine stage-relevant CHECK whose constrained column is
 * literally named artifact_type (a text enum listing stage_0_analysis..stage_26_analysis as
 * values), not a "stage"-named column. Column-name correlation cannot distinguish "not stage-
 * related" from "stage-related via enum VALUES on a differently-named column" -- exactly the kind
 * of blind, plausible-looking guard this SD's own predecessor SD's negative-control convention
 * exists to catch. The un-filtered LIKE predicate matches the 18-row floor RISK+DATABASE
 * independently measured live; a future correctness improvement should attack the value-level
 * distinction directly (e.g. inspect the literal's numeric context), not column identifiers.
 * @param {{query: Function}} client
 * @param {string} literal e.g. '26'
 */
export async function sweepCheckConstraintsContainingLiteral(client, literal) {
  const { rows } = await client.query(
    `SELECT c.conrelid::regclass::text AS table_name,
            c.conname AS constraint_name,
            pg_get_constraintdef(c.oid) AS definition,
            COALESCE(array_agg(DISTINCT a.attname ORDER BY a.attname) FILTER (WHERE a.attname IS NOT NULL), ARRAY[]::text[]) AS columns
     FROM pg_constraint c
     LEFT JOIN LATERAL unnest(c.conkey) AS ck(attnum) ON true
     LEFT JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ck.attnum
     WHERE c.contype = 'c'
       AND c.connamespace = 'public'::regnamespace
       AND pg_get_constraintdef(c.oid) LIKE ('%' || $1 || '%')
     GROUP BY c.conrelid, c.conname, c.oid
     ORDER BY table_name, constraint_name`,
    [literal]
  );
  return rows;
}

/** Quotes a Postgres identifier -- doubles embedded double-quotes, per the SQL standard. */
function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/**
 * Live row count for a given table/column within an inclusive stage-number range
 * (SD-LEO-INFRA-STAGE-KEYED-DATA-001, FR-1).
 *
 * table and column are NEVER accepted from untrusted input -- callers pass only the fixed,
 * hardcoded surface names this instrument itself enumerates (from
 * sweepStageBearingColumnsSchemaWide/sweepCheckConstraintsContainingLiteral output or this SD's
 * own known-surface list), so a parameterized identifier is not applicable (Postgres does not
 * support parameterized identifiers) and identifier-quoting (never literal interpolation) is the
 * correct escaping primitive here. table and column are substituted independently -- an earlier
 * draft used a single %I-style .replace(/%I/g, ...) with one callback, which substitutes BOTH
 * placeholders with the same value and silently produces `WHERE "table_name"::int BETWEEN ...`
 * (casting the table's row identity, not the column, to int) -- caught live when every single
 * surface in the first real run of this census failed with "cannot cast type X to integer".
 * @param {{query: Function}} client
 * @param {string} table
 * @param {string} column
 * @param {number} lower inclusive
 * @param {number} upper inclusive
 */
export async function countRowsInStageRange(client, table, column, lower = 23, upper = 26) {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n
     FROM (SELECT 1 FROM ONLY public.${quoteIdent(table)} WHERE ${quoteIdent(column)}::int BETWEEN $1 AND $2) t`,
    [lower, upper]
  );
  return rows[0]?.n ?? 0;
}

/**
 * Live row count for a text-enum column whose VALUES (not the column itself) encode a stage
 * number, matched via a bound array parameter (SD-LEO-INFRA-STAGE-KEYED-DATA-001, FR-1).
 *
 * Exists because countRowsInStageRange's ::int cast fails outright on a column like
 * venture_artifacts.artifact_type, where the CHECK constraint enumerates 'stage_0_analysis' ..
 * 'stage_26_analysis' as one text value among many unrelated non-stage values -- there is no
 * numeric column to range-compare, only a fixed, generated set of literal candidate values.
 * @param {{query: Function}} client
 * @param {string} table
 * @param {string} column
 * @param {string} valuePrefix e.g. 'stage_'
 * @param {string} valueSuffix e.g. '_analysis'
 * @param {number} lower inclusive
 * @param {number} upper inclusive
 */
export async function countRowsMatchingStageEnumValues(client, table, column, valuePrefix, valueSuffix, lower = 23, upper = 26) {
  const candidates = [];
  for (let n = lower; n <= upper; n += 1) candidates.push(`${valuePrefix}${n}${valueSuffix}`);
  const { rows } = await client.query(
    `SELECT count(*)::int AS n
     FROM (SELECT 1 FROM ONLY public.${quoteIdent(table)} WHERE ${quoteIdent(column)}::text = ANY($1::text[])) t`,
    [candidates]
  );
  return rows[0]?.n ?? 0;
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
