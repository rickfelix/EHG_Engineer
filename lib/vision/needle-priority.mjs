/**
 * Needle-movement prioritization — SD-LEO-INFRA-PROGRESS-ROLLUP-NEEDLE-PRIORITIZATION-001-C (FR-2).
 *
 * Turns the rung/KR progress MEASUREMENT shipped by FR-1 (lib/vision/rung-progress-rollup.mjs) into
 * a prioritization INPUT: remaining work is ordered active-rung-first, then highest-impact-on-rung-
 * completion-first. This is a thin, PURE scoring layer — it REUSES FR-1's mapWaveToRung and runRollup
 * output rather than re-deriving rung attribution.
 *
 * HONESTY: an SD whose rung cannot be resolved (not promoted from a roadmap wave, or a wave with no
 * rung mapping) scores 0 — it is left in its existing rank order, never guessed onto a rung.
 *
 * @module lib/vision/needle-priority
 */

import { mapWaveToRung } from './rung-progress-rollup.mjs';

/**
 * PURE: a single SD's needle-movement score.
 *   - unresolvable rung            -> 0   (neutral; falls back to the existing order)
 *   - a known FUTURE rung (V2/V3)  -> 1   (+ completion bonus)
 *   - the ACTIVE build rung (V1)   -> 2   (+ completion bonus)
 * The completion bonus is the rung's progress_pct scaled to 0..0.1, so within a tier the rung CLOSER
 * to completion edges up (highest-impact-on-rung-completion-first) without ever crossing tiers.
 *
 * @param {?string} sdRung the SD's resolved rung_key (e.g. 'V1'), or null/undefined if unknown
 * @param {{activeRungKey?:?string, rungProgressByKey?:Object<string,number>}} ctx
 * @returns {number} score (0, or [1,1.1], or [2,2.1])
 */
export function needleScore(sdRung, ctx = {}) {
  if (!sdRung) return 0;
  const base = sdRung === ctx.activeRungKey ? 2 : 1;
  const prog = Number((ctx.rungProgressByKey || {})[sdRung]);
  const bonus = Number.isFinite(prog) ? Math.max(0, Math.min(100, prog)) / 1000 : 0; // 0..0.1
  return base + bonus;
}

/**
 * PURE: fold FR-1 runRollup() rows into a { [rung_key]: progress_pct } map.
 * Rows with a null progress_pct (FR-1's honest "unmeasurable") are skipped, never coerced to 0.
 * If multiple waves map to the same rung, the highest measured progress_pct wins (most-complete view).
 *
 * @param {Array<{rung_key:?string, progress_pct:?number}>} rollupRows
 * @returns {Object<string,number>}
 */
export function rungProgressByKey(rollupRows) {
  const out = {};
  for (const r of rollupRows || []) {
    if (!r || !r.rung_key || r.progress_pct == null) continue;
    const pct = Number(r.progress_pct);
    if (!Number.isFinite(pct)) continue;
    if (out[r.rung_key] == null || pct > out[r.rung_key]) out[r.rung_key] = pct;
  }
  return out;
}

/**
 * PURE: map each promoted SD key to its rung by REUSING FR-1's mapWaveToRung.
 * Skips wave items with no promoted SD, an unknown wave, or an unmappable wave (honest — no guess).
 *
 * @param {Array<{promoted_to_sd_key?:?string, wave_id?:?string}>} waveItems roadmap_wave_items rows
 * @param {Object<string,object>} wavesById roadmap_waves keyed by id
 * @returns {Object<string,string>} { [sd_key]: rung_key }
 */
export function buildSdRungMap(waveItems, wavesById = {}) {
  const map = {};
  for (const it of waveItems || []) {
    const sdKey = it && it.promoted_to_sd_key;
    const waveId = it && it.wave_id;
    if (!sdKey || !waveId) continue;
    const wave = wavesById[waveId];
    if (!wave) continue;
    const rung = mapWaveToRung(wave);
    if (rung) map[sdKey] = rung;
  }
  return map;
}

export default { needleScore, rungProgressByKey, buildSdRungMap };
