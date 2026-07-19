/**
 * Coverage Matrix -- surface x checker(s) x last-verified-at.
 * SD-LEO-INFRA-COVERAGE-MATRIX-SURFACE-001.
 *
 * The surface list is mechanically regenerated from real sources (never hand-enumerated), so a
 * brand-new surface auto-appears with checker_ids=[] instead of being silently unwatched. A
 * surface that vanishes from its source is marked status='stale', never deleted.
 *
 * Six surface classes are covered here (the periodic_process class is a documented placeholder,
 * not a real registry -- SD-LEO-INFRA-PERIODIC-PROCESS-LIVENESS-001 is still draft/LEAD and has
 * no registry to consume as of this SD):
 *   - db_table: information_schema.tables (public schema, minus config/coverage-matrix-exclusions.json)
 *   - message_lane: distinct session_coordination.message_type + payload->>'signal_type' values
 *   - application: applications table (deleted_at IS NULL)
 *   - work_item_type: a fixed set of known SD/QF/feedback/decision/ledger tables + gauge-registry.js entries
 *   - institutional_memory: repo-local memory/*.md files (cross-session memory explicitly out of scope)
 *   - periodic_process: single pending_dependency placeholder row
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6: processed reads carry the exact-cap
// tripwire — a page returning exactly the PostgREST 1000-row max is presumed truncated and
// throws, matching this module's existing fail-loud (throw) query-error policy. (Pagination
// not used here: the unit-test chain stubs expose no .order()/.range().)
import { assertNotCapTruncated } from '../db/fetch-all-paginated.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const RECENT_ACTIVITY_WINDOW_DAYS = 30;

// A single row per (SD-key, QF-id, feedback-category-family, decision-family, ledger) surface --
// each entry is a real, already-shipped table, not a hypothetical one.
export const WORK_ITEM_TYPE_TABLES = [
  'strategic_directives_v2',
  'quick_fixes',
  'feedback',
  'leo_feedback',
  'chairman_decisions',
  'governance_decisions',
  'venture_decisions',
  'eva_decisions',
  'shipping_decisions',
  'ehg_design_decisions',
  'adam_task_ledger',
  'adam_adherence_ledger',
  'bypass_ledger',
  'conversion_ledger',
  'solomon_advice_outcome_ledger',
  'tool_usage_ledger',
  'venture_token_ledger',
  'venture_write_ledger',
  'eva_event_ledger',
];

export const EXTERNAL_CHANNELS = ['email_resend', 'github', 'hosting', 'phone_notify'];

export function loadJsonConfig(relativePath) {
  const raw = readFileSync(join(REPO_ROOT, relativePath), 'utf8');
  return JSON.parse(raw);
}

export function isExcludedTable(tableName, exclusions) {
  if (exclusions.db_table_name_exclusions?.includes(tableName)) return true;
  return (exclusions.db_table_name_prefix_exclusions || []).some((prefix) => tableName.startsWith(prefix));
}

/** Substring match against a human-curated map -- deliberately not regex, so the config stays auditable. */
export function matchCheckerIds(surfaceClass, surfaceKey, checkerMapEntries) {
  const matched = checkerMapEntries
    .filter((e) => e.surface_class === surfaceClass && surfaceKey.includes(e.pattern))
    .flatMap((e) => e.checker_ids);
  return [...new Set(matched)];
}

function isRecentlyActive(lastActivityIso) {
  if (!lastActivityIso) return false;
  const ageMs = Date.now() - new Date(lastActivityIso).getTime();
  return ageMs <= RECENT_ACTIVITY_WINDOW_DAYS * 86400000;
}

/**
 * DB-table enumeration requires a raw system-catalog query (pg_class/information_schema), which
 * PostgREST does not expose and this project has no `exec_sql`/`execute_sql` RPC for (confirmed
 * live, 2026-07-04: PGRST202 "could not find the function" -- documented here so a future
 * maintainer does not reintroduce an RPC-based attempt). The canonical live mechanism already
 * used by scripts/lint/schema-reference-snapshot.mjs is a direct `pg` Client connection via
 * SUPABASE_POOLER_URL -- this function takes that connected pgClient, not the supabase-js client.
 *
 * @param {import('pg').Client} pgClient - an already-connected pg client
 */
export async function enumerateDbTables(pgClient, exclusions) {
  const { rows } = await pgClient.query(`
    SELECT t.table_name,
           COALESCE(s.n_live_tup, 0) AS live_rows
    FROM information_schema.tables t
    LEFT JOIN pg_stat_user_tables s
      ON s.relname = t.table_name AND s.schemaname = t.table_schema
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name
  `);

  return rows
    .filter((row) => !isExcludedTable(row.table_name, exclusions))
    .map((row) => ({
      surface_key: row.table_name,
      // Row-count-based activity is a pragmatic proxy, not literal 30-day windowing -- most
      // tables lack a uniform updated_at column, so "has real data" is the honest signal
      // available today (documented in the PRD, not a silent simplification).
      is_active: Number(row.live_rows) > 0,
    }));
}

const MESSAGE_LANE_LOOKBACK_DAYS = 90;

/**
 * Message-lane surfaces come from two distinct sources:
 *   - `message_type` is a Postgres ENUM (`coordination_message_type`) -- its full label set is
 *     read from pg_enum via the same pgClient connection used for db_table enumeration, so a
 *     structurally-defined lane surfaces even if zero messages of that type have been sent yet
 *     (arguably MORE correct for "unwatched surface" semantics than pure data-driven discovery).
 *   - `payload->>'signal_type'` is free-form JSONB text with no type-system enumeration
 *     available; those values are genuinely data-driven, discovered over a bounded 90-day
 *     lookback window via supabase-js (a full-table scan would not be safe at this table's
 *     scale). A signal_type used once and never again in >90 days would be missed by this
 *     window -- an honest, documented coverage gap, not a silent one.
 *
 * @param {import('pg').Client} pgClient - an already-connected pg client (for the enum labels)
 * @param {object} supabase - supabase-js client (for the recent signal_type window)
 */
export async function enumerateMessageLanes(pgClient, supabase) {
  const { rows: enumRows } = await pgClient.query(`
    SELECT e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'coordination_message_type'
    ORDER BY e.enumsortorder
  `);
  const messageTypeLanes = enumRows.map((r) => ({ surface_key: r.enumlabel, is_active: true }));

  const since = new Date(Date.now() - MESSAGE_LANE_LOOKBACK_DAYS * 86400000).toISOString();
  const { data, error } = await supabase
    .from('session_coordination')
    .select('payload, created_at')
    .not('payload->>signal_type', 'is', null)
    .gte('created_at', since);
  if (error) throw new Error(`enumerateMessageLanes: signal_type window query failed: ${error.message}`);
  // FR-6 exact-cap tripwire: a capped window would silently drop signal_type lanes.
  assertNotCapTruncated(data || [], { site: 'lib/governance/coverage-matrix.js enumerateMessageLanes' });

  const lastSeenBySignalType = new Map();
  for (const row of data || []) {
    const signalType = row.payload?.signal_type;
    if (!signalType) continue;
    const existing = lastSeenBySignalType.get(signalType);
    if (!existing || row.created_at > existing) lastSeenBySignalType.set(signalType, row.created_at);
  }
  const signalTypeLanes = [...lastSeenBySignalType.entries()].map(([signalType, lastActivity]) => ({
    surface_key: signalType,
    is_active: isRecentlyActive(lastActivity),
  }));

  return [...messageTypeLanes, ...signalTypeLanes];
}

export async function enumerateApplications(supabase) {
  const { data, error } = await supabase
    .from('applications')
    .select('normalized_name')
    .is('deleted_at', null);
  if (error) throw new Error(`enumerateApplications: query failed: ${error.message}`);
  return (data || [])
    .filter((row) => row.normalized_name)
    .map((row) => ({ surface_key: row.normalized_name, is_active: true }));
}

/**
 * `supabase.from(table).select('*', {count:'exact', head:true})` on a table that does not exist
 * can read as count=0/error=null rather than a clear error (a documented gotcha in this
 * codebase's own memory: "supabase-js head/count false-positives on a MISSING table"). A single
 * batched `to_regclass` query via the pg client disambiguates "table exists but is empty" from
 * "table does not exist at all" before any count query runs, so a dropped table surfaces as a
 * real coverage finding instead of silently reading as merely dormant.
 *
 * @param {object} supabase - supabase-js client (for the count queries)
 * @param {Array} gaugeRegistry
 * @param {import('pg').Client} pgClient - connected pg client (for to_regclass existence checks)
 */
export async function enumerateWorkItemTypes(supabase, gaugeRegistry, pgClient) {
  const existenceByTable = new Map();
  if (pgClient) {
    // to_regclass() (the FUNCTION form) returns NULL for a non-existent relation; the `::regclass`
    // CAST form instead throws -- using the cast here would defeat the whole point of this check.
    const { rows: existenceRows } = await pgClient.query(
      'SELECT t AS table_name, to_regclass(\'public.\' || t) IS NOT NULL AS exists_check FROM unnest($1::text[]) AS t',
      [WORK_ITEM_TYPE_TABLES]
    ).catch(() => ({ rows: [] })); // best-effort: fall back to count-only if the batched query fails
    for (const row of existenceRows) existenceByTable.set(row.table_name, row.exists_check);
  }

  // Concurrent, not sequential -- 19 independent head-count round trips run in parallel so
  // regeneration wall-clock time doesn't scale linearly with the number of known tables.
  const countResults = await Promise.all(
    WORK_ITEM_TYPE_TABLES.map((table) => {
      if (existenceByTable.get(table) === false) {
        return Promise.resolve({ table, count: null, error: { message: 'table does not exist (to_regclass check)' } });
      }
      return supabase.from(table).select('*', { count: 'exact', head: true }).then((r) => ({ table, ...r }));
    })
  );
  const results = countResults.map(({ table, count, error }) => (
    error
      // A table listed here that no longer exists/is inaccessible is itself a coverage finding --
      // record it as inactive rather than aborting the whole enumeration run.
      ? { surface_key: table, is_active: false, metadata: { enumeration_error: error.message } }
      : { surface_key: table, is_active: (count || 0) > 0 }
  ));
  for (const gauge of gaugeRegistry || []) {
    results.push({ surface_key: `gauge_registry:${gauge.id}`, is_active: gauge.enabled !== false });
  }
  return results;
}

export function enumerateInstitutionalMemory(memoryDirPath = join(REPO_ROOT, 'memory')) {
  let files;
  try {
    files = readdirSync(memoryDirPath).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
  return files.map((f) => ({ surface_key: f, is_active: true }));
}

export function periodicProcessPlaceholderRow() {
  return {
    surface_key: 'periodic-process-registry',
    is_active: false,
    status: 'pending_dependency',
    metadata: {
      reason: 'SD-LEO-INFRA-PERIODIC-PROCESS-LIVENESS-001 is still status=draft/phase=LEAD -- no registry exists yet to enumerate real per-process surfaces',
      depends_on_sd_key: 'SD-LEO-INFRA-PERIODIC-PROCESS-LIVENESS-001',
    },
  };
}

export function enumerateExternalChannels() {
  return EXTERNAL_CHANNELS.map((key) => ({ surface_key: key, is_active: true }));
}

/**
 * Regenerates the full coverage_matrix: enumerates every in-scope surface class, applies the
 * checker map, upserts rows keyed on (surface_class, surface_key), and marks any previously-seen
 * surface_key no longer present in its source as status='stale' (never deleted).
 *
 * @param {object} supabase - supabase-js client (PostgREST-exposed tables)
 * @param {import('pg').Client} pgClient - connected pg client (system-catalog introspection:
 *   db_table enumeration + the coordination_message_type enum's label set)
 */
export async function regenerateCoverageMatrix(supabase, pgClient, { exclusions, checkerMapEntries, gaugeRegistry, memoryDirPath } = {}) {
  const perClass = {
    db_table: await enumerateDbTables(pgClient, exclusions || {}),
    message_lane: await enumerateMessageLanes(pgClient, supabase),
    application: await enumerateApplications(supabase),
    work_item_type: await enumerateWorkItemTypes(supabase, gaugeRegistry || [], pgClient),
    institutional_memory: enumerateInstitutionalMemory(memoryDirPath),
    periodic_process: [periodicProcessPlaceholderRow()],
    external_channel: enumerateExternalChannels(),
  };

  const summary = { upserted: 0, stale: 0, unchecked: 0, covered: 0 };
  const nowIso = new Date().toISOString();

  for (const [surfaceClass, rows] of Object.entries(perClass)) {
    const { data: existingRows, error: fetchError } = await supabase
      .from('coverage_matrix')
      .select('surface_key')
      .eq('surface_class', surfaceClass);
    if (fetchError) throw new Error(`regenerateCoverageMatrix: fetch existing rows failed for ${surfaceClass}: ${fetchError.message}`);
    // FR-6 exact-cap tripwire: a capped existing-rows read would mis-derive the stale set below.
    assertNotCapTruncated(existingRows || [], { site: `lib/governance/coverage-matrix.js regenerate existing-rows (${surfaceClass})` });

    // Defensive de-dup by surface_key: a bulk upsert with two rows sharing the same
    // (surface_class, surface_key) conflict target fails with "ON CONFLICT DO UPDATE command
    // cannot affect row a second time" -- e.g. enumerateMessageLanes's structural enum labels and
    // data-driven signal_type values could theoretically collide on the same text.
    const seenKeys = new Set();
    const dedupedRows = rows.filter((row) => {
      if (seenKeys.has(row.surface_key)) return false;
      seenKeys.add(row.surface_key);
      return true;
    });

    const currentKeys = new Set(dedupedRows.map((r) => r.surface_key));
    const existingKeys = new Set((existingRows || []).map((r) => r.surface_key));

    // One bulk upsert per surface class instead of one round trip per row -- db_table alone can
    // be hundreds of rows; a sequential per-row loop made regeneration take minutes.
    if (dedupedRows.length > 0) {
      const upsertRows = dedupedRows.map((row) => {
        const checkerIds = row.status === 'pending_dependency'
          ? []
          : matchCheckerIds(surfaceClass, row.surface_key, checkerMapEntries || []);
        const status = row.status || (checkerIds.length > 0 ? 'covered' : 'unchecked');
        summary[status] = (summary[status] || 0) + 1;
        return {
          surface_class: surfaceClass,
          surface_key: row.surface_key,
          checker_ids: checkerIds,
          status,
          is_active: row.is_active,
          last_verified_at: nowIso,
          metadata: row.metadata || {},
        };
      });

      const { error: upsertError } = await supabase
        .from('coverage_matrix')
        .upsert(upsertRows, { onConflict: 'surface_class,surface_key' });
      if (upsertError) throw new Error(`regenerateCoverageMatrix: bulk upsert failed for ${surfaceClass}: ${upsertError.message}`);
      summary.upserted += upsertRows.length;
    }

    const vanishedKeys = [...existingKeys].filter((k) => !currentKeys.has(k));
    if (vanishedKeys.length > 0) {
      const { error: staleError } = await supabase
        .from('coverage_matrix')
        .update({ status: 'stale', last_verified_at: nowIso })
        .eq('surface_class', surfaceClass)
        .in('surface_key', vanishedKeys);
      if (staleError) throw new Error(`regenerateCoverageMatrix: stale-mark failed for ${surfaceClass}: ${staleError.message}`);
      summary.stale += vanishedKeys.length;
    }
  }

  return summary;
}

export default {
  loadJsonConfig,
  isExcludedTable,
  matchCheckerIds,
  enumerateDbTables,
  enumerateMessageLanes,
  enumerateApplications,
  enumerateWorkItemTypes,
  enumerateInstitutionalMemory,
  periodicProcessPlaceholderRow,
  enumerateExternalChannels,
  regenerateCoverageMatrix,
};
