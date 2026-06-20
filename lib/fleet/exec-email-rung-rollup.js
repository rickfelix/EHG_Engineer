/**
 * Exec-email rung-rollup line — SD-LEO-INFRA-PROGRESS-ROLLUP-NEEDLE-PRIORITIZATION-001-E (FR-4).
 *
 * Renders the type-aware rung/KR progress rollup (lib/vision/rung-progress-rollup.mjs, FR-1 child -B)
 * into a single chairman-readable line for the hourly executive-summary email, so the chairman sees
 * rung-completion % (Foundation → revenue rails) — not just raw SD counts.
 *
 * LOCKSTEP / NO DIVERGENCE: the caller passes the SAME runRollup() result the rollup compute produces
 * (which itself reuses computeBuildGauge for the active build rung), so the email number can never
 * diverge from the canonical rollup. HONESTY-PRESERVED: a rung with progress_pct=null renders as
 * "(not yet measurable)" — never a fabricated 0% (mirrors the rollup's own honest-null contract).
 *
 * @module lib/fleet/exec-email-rung-rollup
 */

/** Canonical rung display order (Foundation → revenue → future). */
const RUNG_ORDER = ['V1', 'V2', 'V3'];

/**
 * Aggregate runRollup rows into one progress % per rung. PURE.
 * A rung's % is the rounded mean of its waves' non-null progress_pct; null when no wave under that rung
 * is measurable (honest-null, never fabricated 0).
 * @param {Array<{rung_key:?string, progress_pct:?number}>} rows
 * @returns {Object<string, {pct:?number, waves:number, measured:number}>} keyed by rung_key
 */
export function aggregateRungProgress(rows) {
  const byRung = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    const key = r && r.rung_key;
    if (!key) continue; // unmappable waves are excluded, not zero-counted
    const slot = byRung[key] || (byRung[key] = { sum: 0, measured: 0, waves: 0 });
    slot.waves += 1;
    if (typeof r.progress_pct === 'number' && Number.isFinite(r.progress_pct)) {
      slot.sum += r.progress_pct;
      slot.measured += 1;
    }
  }
  const out = {};
  for (const [key, s] of Object.entries(byRung)) {
    out[key] = { pct: s.measured > 0 ? Math.round(s.sum / s.measured) : null, waves: s.waves, measured: s.measured };
  }
  return out;
}

/**
 * Format the rung-rollup line for the email. PURE + FAIL-SOFT (returns '' rather than throwing).
 * @param {{ ok?:boolean, rows?:Array }} rollupResult - the runRollup() return value
 * @param {{ em?:string }} [opts] - em = the separator glyph used elsewhere in the email (default '—')
 * @returns {string} e.g. "Rung progress (Foundation → revenue): V1 88% · V2 (not yet measurable)"  or ''
 */
export function formatRungRollupLine(rollupResult, opts = {}) {
  if (!rollupResult || rollupResult.ok === false || !Array.isArray(rollupResult.rows) || rollupResult.rows.length === 0) {
    return '';
  }
  const agg = aggregateRungProgress(rollupResult.rows);
  const presentRungs = RUNG_ORDER.filter((k) => agg[k]);
  // include any non-standard rung keys after the canonical ones, deterministically
  for (const k of Object.keys(agg).sort()) if (!presentRungs.includes(k)) presentRungs.push(k);
  if (presentRungs.length === 0) return '';

  const parts = presentRungs.map((k) => {
    const a = agg[k];
    return a.pct == null ? `${k} (not yet measurable)` : `${k} ${a.pct}%`;
  });
  return `Rung progress (Foundation → revenue): ${parts.join('  ·  ')}`;
}

export default { aggregateRungProgress, formatRungRollupLine };
