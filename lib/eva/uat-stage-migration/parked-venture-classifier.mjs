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

/** Compose fetch + classify. The apply-time CLI calls this and refuses to proceed when blocked. */
export async function runParkedVentureClassification(client, opts = {}) {
  const rows = await fetchVenturesAtShiftedStages(client);
  return classifyParkedVentures(rows, SHIFTED_STAGE_RANGE, opts);
}
