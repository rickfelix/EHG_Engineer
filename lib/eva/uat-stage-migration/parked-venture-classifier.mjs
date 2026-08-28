/**
 * Parked-venture disposition check (FR-6) for the UAT-stage renumber migration.
 *
 * VALIDATION found 11 active-status ventures sitting at stage 23 (3) / 24 (8) at LEAD/PLAN
 * time, all is_demo=true fixtures. This module classifies every venture at a shifted
 * stage_number (demo vs real) immediately before the freeze and blocks apply outright if any
 * REAL venture is found there, since this SD does not attempt to solve migrating a real
 * venture mid-flight -- it only proves, at apply time, that zero such ventures exist.
 */
'use strict';

/** stage_number range this SD's migration shifts (23-26 -> 24-27). */
export const SHIFTED_STAGE_RANGE = Object.freeze({ min: 23, max: 26 });

/**
 * PURE.
 * @param {Array<{id?:string, is_demo?:boolean, current_lifecycle_stage?:number}>} ventureRows
 * @param {{min:number,max:number}} [range]
 * @param {{override?:boolean}} [opts]
 */
export function classifyParkedVentures(ventureRows = [], range = SHIFTED_STAGE_RANGE, opts = {}) {
  const inRange = (ventureRows || []).filter((v) => {
    const stage = Number(v?.current_lifecycle_stage);
    return Number.isFinite(stage) && stage >= range.min && stage <= range.max;
  });

  const real = inRange.filter((v) => v?.is_demo !== true);
  const demo = inRange.filter((v) => v?.is_demo === true);
  const blocked = real.length > 0 && !opts.override;

  return {
    total: inRange.length,
    demoCount: demo.length,
    realCount: real.length,
    real,
    blocked,
  };
}

/** IO: fetch ventures currently sitting at a shifted stage_number. */
export async function fetchVenturesAtShiftedStages(client, range = SHIFTED_STAGE_RANGE) {
  const { rows } = await client.query(
    `SELECT id, is_demo, current_lifecycle_stage
     FROM ventures
     WHERE current_lifecycle_stage BETWEEN $1 AND $2`,
    [range.min, range.max]
  );
  return rows;
}

/**
 * Calls the shared fn_parked_venture_preflight() SQL function (SD-LEO-INFRA-STAGE-KEYED-DATA-001,
 * FR-5) if it exists live, translating its jsonb verdict into this module's existing shape so
 * callers of runParkedVentureClassification see no interface change. Returns null if the function
 * is not yet live (v2 not chairman-applied) rather than throwing, so the caller can fall back.
 */
async function tryFnParkedVenturePreflight(client, range, opts) {
  const { rows } = await client.query(
    `SELECT to_regprocedure('public.fn_parked_venture_preflight(integer, integer, boolean)') AS oid`
  );
  if (!rows[0]?.oid) return null;

  const { rows: verdictRows } = await client.query(
    `SELECT public.fn_parked_venture_preflight($1, $2, $3) AS verdict`,
    [range.min, range.max, Boolean(opts.override)]
  );
  const v = verdictRows[0].verdict;
  return {
    total: v.total,
    demoCount: v.demo_count,
    realCount: v.real_count,
    real: (v.real_venture_ids || []).map((id) => ({ id })),
    blocked: v.blocked,
  };
}

/**
 * Compose fetch + classify. The apply-time CLI calls this and refuses to proceed when blocked.
 * Prefers the shared SQL function (FR-5) when it exists live; falls back to the pre-existing JS
 * classification (fetch + classifyParkedVentures) when it does not -- e.g. before
 * SD-LEO-INFRA-STAGE-KEYED-DATA-001's v2 migration has been chairman-approved and applied. This
 * keeps this script working unmodified through that gap rather than hard-depending on a function
 * that may not exist yet, while transparently upgrading to the single shared implementation once
 * both call sites (this script and v2's own DDL preflight) can use it.
 */
export async function runParkedVentureClassification(client, opts = {}) {
  const range = opts.range || SHIFTED_STAGE_RANGE;
  const shared = await tryFnParkedVenturePreflight(client, range, opts);
  if (shared) return shared;

  const rows = await fetchVenturesAtShiftedStages(client, range);
  return classifyParkedVentures(rows, range, opts);
}
