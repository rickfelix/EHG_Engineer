/**
 * coordinator-health-recompute.mjs — S4 fail-loud recompute via a DIFFERENT
 * code path + S5 loop_registry registration
 * (SD-LEO-INFRA-COORDINATOR-HEALTH-KPI-001).
 *
 * S4 (Solomon, binding): the health verification MUST NOT flow through the same
 * shared lib the metrics are written through — a bug in the shared PostgREST
 * path hides itself (correlated blindness). This module's recompute therefore
 * uses the pg-based createDatabaseClient RAW SQL path exclusively
 * (lib/supabase-connection.js; precedent scripts/apply-migration.js). A
 * source-inspection test pins that no supabase-js import ever appears here.
 *
 * S5 (LEAD-corrected premise, validation row abfd5b29): loop_registry is LIVE
 * (the ratified L1-L33 map), so the oversight loop registers a REAL row via
 * upsert-by-loop_key, with the canonical closure-engine predicate taxonomy —
 * EDGE_FRESHNESS carries the ITEM-2 freshness-decay rule natively (a stale
 * newest reading reverts CLOSED -> OPEN/STARVED), and authorized-writer
 * provenance is declared in the predicate for the evidence collector to
 * enforce.
 */

export const RECOMPUTE_TOLERANCE = 0; // countable core must match exactly; any divergence alarms
export const OVERSIGHT_LOOP_KEY = 'coordinator_health_oversight';
export const EVIDENCE_DIMENSION = 'adam_coordinator_health';
export const EVIDENCE_FRESHNESS_SECONDS = 26 * 60 * 60; // one probe cadence + slack; CLOSE decays past this

/**
 * S4: recompute the reading's countable core with RAW SQL on the pg client.
 * Deliberately re-derives from base tables — never reads the probe's own
 * snapshot row as its source of truth.
 */
export async function recomputeViaRawSql(pgClient, { windowDays = 7 } = {}) {
  const q = async (sql, params = []) => (await pgClient.query(sql, params)).rows;
  const [completed] = await q(
    `SELECT count(*)::int AS n FROM strategic_directives_v2
     WHERE status = 'completed' AND completion_date >= now() - ($1 || ' days')::interval`,
    [String(windowDays)]
  );
  const [inFlight] = await q(
    `SELECT count(*)::int AS n FROM strategic_directives_v2
     WHERE status IN ('in_progress','pending_approval','active')`
  );
  const [draftUnclaimed] = await q(
    `SELECT count(*)::int AS n FROM strategic_directives_v2
     WHERE status = 'draft' AND claiming_session_id IS NULL`
  );
  const [latestSnapshot] = await q(
    `SELECT scanned_at FROM codebase_health_snapshots
     WHERE dimension = $1 ORDER BY scanned_at DESC LIMIT 1`,
    [EVIDENCE_DIMENSION]
  );
  return {
    completed_in_window: completed?.n ?? null,
    in_flight: inFlight?.n ?? null,
    draft_unclaimed: draftUnclaimed?.n ?? null,
    latest_snapshot_at: latestSnapshot?.scanned_at ? new Date(latestSnapshot.scanned_at).toISOString() : null,
  };
}

/**
 * S4 pure: compare the probe's supabase-js-derived counts with the raw-SQL
 * recompute. Divergence beyond tolerance => recompute_ok=false, NEVER
 * null-coalesced away; a missing field on either side is itself a divergence
 * (fail-loud, the masked-column-bug class).
 */
export function compareReadings(probeCounts, rawCounts, tolerance = RECOMPUTE_TOLERANCE) {
  const fields = ['in_flight', 'draft_unclaimed'];
  const divergences = [];
  for (const f of fields) {
    const a = probeCounts ? probeCounts[f] : undefined;
    const b = rawCounts ? rawCounts[f] : undefined;
    if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) {
      divergences.push({ field: f, probe: a ?? null, raw: b ?? null, reason: 'unavailable' });
      continue;
    }
    if (Math.abs(Number(a) - Number(b)) > tolerance) {
      divergences.push({ field: f, probe: Number(a), raw: Number(b), reason: 'diverged' });
    }
  }
  return { recompute_ok: divergences.length === 0, divergences };
}

/**
 * S5: register (upsert-by-loop_key) the oversight loop in the LIVE
 * loop_registry, mirroring the observed row shape. EDGE_FRESHNESS +
 * window_seconds gives the ITEM-2 decay rule natively; evidence source +
 * authorized writer are declared for the collector (provenance rule).
 */
export function buildOversightLoopRow() {
  return {
    loop_key: OVERSIGHT_LOOP_KEY,
    display_name: 'Coordinator-health oversight (Adam 3-KPI base + 5-sharpening delta)',
    predicate_type: 'edge_freshness',
    closure_predicate: {
      window_seconds: EVIDENCE_FRESHNESS_SECONDS,
      evidence_table: 'codebase_health_snapshots',
      evidence_filter: { dimension: EVIDENCE_DIMENSION },
      authorized_writer: 'adam-coordinator-health.mjs',
    },
    constituent_operators: [],
    dependency_edges: [],
    status_reason: 'registered by SD-LEO-INFRA-COORDINATOR-HEALTH-KPI-001 (verifier evaluates on its own tick)',
  };
}

export async function registerOversightLoop(supabase) {
  const row = buildOversightLoopRow();
  const { data: existing, error: selErr } = await supabase
    .from('loop_registry').select('id').eq('loop_key', row.loop_key).maybeSingle();
  if (selErr) return { registered: false, error: selErr.message };
  if (existing) {
    const { error } = await supabase
      .from('loop_registry')
      .update({ display_name: row.display_name, predicate_type: row.predicate_type, closure_predicate: row.closure_predicate })
      .eq('id', existing.id);
    return error ? { registered: false, error: error.message } : { registered: true, mode: 'updated', id: existing.id };
  }
  const { data, error } = await supabase.from('loop_registry').insert(row).select('id');
  return error ? { registered: false, error: error.message } : { registered: true, mode: 'inserted', id: data?.[0]?.id };
}
