/**
 * Rung/KR progress rollup — SD-LEO-INFRA-PROGRESS-ROLLUP-NEEDLE-PRIORITIZATION-001-B (FR-1).
 *
 * Populate roadmap_waves.progress_pct TYPE-AWARE by REUSING the existing measurement systems — it
 * does NOT build a new one:
 *   - BUILD rungs (the active vision build rung, e.g. V1 Foundation) derive their % from the existing
 *     computeBuildGauge (lib/vision/vdr-registry.js).
 *   - OUTCOME rungs (future revenue / distance-to-quit, e.g. V2/V3) derive their % from key_results
 *     progress (the v_okr_hierarchy formula) via each wave's okr_objective_ids.
 *
 * Wave→rung attribution is the existing advisory mapping (metadata.rung_key, else time_horizon:
 * now→V1, next→V2, later→V3). HONESTY: a wave with no resolvable rung, or an outcome wave with no
 * linked objectives / no probeable KR, yields progress_pct=null with an explicit reason — it is NEVER
 * fabricated as 0%. Write is DRY-RUN by default; --apply persists.
 *
 * @module lib/vision/rung-progress-rollup
 */

/** Advisory time-horizon → vision rung mapping (SD-LEO-INFRA-VISION-LADDER-ROADMAP-COHERENCE-001). */
export const RUNG_BY_HORIZON = Object.freeze({ now: 'V1', next: 'V2', later: 'V3' });
// 'eventually' intentionally maps to null — too far out to attribute to a concrete rung.

/** PURE: resolve a wave's rung_key. metadata.rung_key (explicit) wins; else the time_horizon map; else null. */
export function mapWaveToRung(wave) {
  const md = (wave && wave.metadata) || {};
  if (md.rung_key) return String(md.rung_key);
  const th = wave && wave.time_horizon;
  return (th && RUNG_BY_HORIZON[th]) || null;
}

/**
 * PURE: a single key_result's progress %, mirroring the v_okr_hierarchy formula
 * (database/migrations/20260104_okr_strategic_hierarchy.sql). Clamped 0–100. Returns null when the
 * KR is unmeasurable (non-numeric fields or a zero span), so a degenerate KR never fabricates 0%.
 */
export function krProgressPct(kr) {
  if (!kr) return null;
  // Reject null/undefined BEFORE coercion — Number(null)===0 would otherwise fabricate a span.
  if (kr.baseline_value == null || kr.current_value == null || kr.target_value == null) return null;
  const b = Number(kr.baseline_value);
  const cur = Number(kr.current_value);
  const t = Number(kr.target_value);
  if (![b, cur, t].every(Number.isFinite)) return null;
  const decrease = (kr && kr.direction) === 'decrease';
  const denom = decrease ? (b - t) : (t - b);
  if (denom === 0) return null; // zero span — undefined progress, never 0%-by-fiat
  const num = decrease ? (b - cur) : (cur - b);
  const pct = (num / denom) * 100;
  return Math.max(0, Math.min(100, pct));
}

/** PURE: mean progress over measurable KRs (each 0–100). null when none are measurable. */
export function aggregateKrProgress(krRows) {
  const vals = (krRows || []).map(krProgressPct).filter((v) => v !== null);
  if (!vals.length) return null;
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}

/**
 * PURE: decide one wave's rollup row. Returns
 *   { wave_id, title, rung_key, type, progress_pct, source, reason }
 * progress_pct is null (never fabricated) when it cannot be honestly measured.
 *
 * @param {object} wave - roadmap_waves row (id, title, time_horizon, okr_objective_ids, metadata)
 * @param {object} ctx
 *   activeRungKey   - vision_ladder_rungs.rung_key WHERE is_active (the build rung)
 *   gaugeBuildPct   - computeBuildGauge build_pct for the active rung (number|null)
 *   krAggByObjective- { [objectiveId]: aggregateKrProgress(...) | null }
 */
export function computeWaveRollup(wave, ctx = {}) {
  const base = { wave_id: wave && wave.id, title: (wave && wave.title) || null };
  const rungKey = mapWaveToRung(wave);
  if (!rungKey) {
    return { ...base, rung_key: null, type: null, progress_pct: null, source: 'skip', reason: 'no rung mapping (time_horizon null/eventually + no metadata.rung_key)' };
  }
  const isBuildRung = rungKey === ctx.activeRungKey;
  if (isBuildRung) {
    const g = ctx.gaugeBuildPct;
    if (g == null || !Number.isFinite(Number(g))) {
      return { ...base, rung_key: rungKey, type: 'build', progress_pct: null, source: 'computeBuildGauge', reason: 'gauge unavailable' };
    }
    return { ...base, rung_key: rungKey, type: 'build', progress_pct: Math.round(Number(g)), source: 'computeBuildGauge', reason: `active build rung ${rungKey} → reuse build gauge` };
  }
  // Outcome rung: derive from KR progress for the wave's linked objectives.
  const objs = (wave && wave.okr_objective_ids) || [];
  if (!objs.length) {
    return { ...base, rung_key: rungKey, type: 'outcome', progress_pct: null, source: 'key_results', reason: 'outcome rung with no okr_objective_ids on the wave' };
  }
  const aggs = objs.map((o) => (ctx.krAggByObjective || {})[o]).filter((v) => v !== null && v !== undefined);
  if (!aggs.length) {
    return { ...base, rung_key: rungKey, type: 'outcome', progress_pct: null, source: 'key_results', reason: 'outcome rung with no measurable KRs under its objective(s)' };
  }
  const pct = Math.round(aggs.reduce((s, v) => s + v, 0) / aggs.length);
  return { ...base, rung_key: rungKey, type: 'outcome', progress_pct: pct, source: 'key_results', reason: `outcome rung ${rungKey} ← ${aggs.length} objective KR-set(s)` };
}

/** PURE: roll up every wave. Returns the rows array (no IO). */
export function rollupWaves(waves, ctx = {}) {
  return (waves || []).map((w) => computeWaveRollup(w, ctx));
}

/**
 * IO runner. FAIL-SOFT: a read error degrades to an empty/unknown result rather than throwing.
 * DRY-RUN by default; pass { apply:true } to persist progress_pct (only for rows with a non-null %).
 *
 * @param {object} opts
 *   supabase       - REQUIRED supabase client
 *   computeGaugeFn - async () => gauge object (reuse computeBuildGauge); injected for tests
 *   apply          - boolean (default false → dry-run)
 *   log            - logger (default console.log)
 * @returns {{ ok:boolean, apply:boolean, activeRungKey:?string, gaugeBuildPct:?number, rows:Array, written:number, error?:string }}
 */
export async function runRollup(opts = {}) {
  const { supabase, computeGaugeFn, apply = false, log = console.log } = opts;
  if (!supabase) return { ok: false, apply, activeRungKey: null, gaugeBuildPct: null, rows: [], written: 0, error: 'no supabase client' };
  try {
    // active build rung
    let activeRungKey = null;
    try {
      const r = await supabase.from('vision_ladder_rungs').select('rung_key,is_active').eq('is_active', true).maybeSingle();
      activeRungKey = r && r.data ? r.data.rung_key : null;
    } catch { activeRungKey = null; }

    // build gauge (reuse) — fail-soft to null
    let gaugeBuildPct = null;
    if (typeof computeGaugeFn === 'function') {
      try {
        const g = await computeGaugeFn();
        // prefer build_pct (buildable-only); fall back to overall_pct; null when gauge unavailable
        gaugeBuildPct = g && g.available !== false ? (g.build_pct ?? g.overall_pct ?? null) : null;
      } catch { gaugeBuildPct = null; }
    }

    // key_results grouped by objective → per-objective aggregate
    const krAggByObjective = {};
    try {
      const kr = await supabase.from('key_results').select('objective_id,baseline_value,current_value,target_value,direction');
      if (kr && !kr.error && Array.isArray(kr.data)) {
        const byObj = {};
        for (const row of kr.data) { (byObj[row.objective_id] = byObj[row.objective_id] || []).push(row); }
        for (const [obj, rows] of Object.entries(byObj)) krAggByObjective[obj] = aggregateKrProgress(rows);
      }
    } catch { /* leave empty → outcome rungs report unknown */ }

    // waves
    let waves = [];
    try {
      const w = await supabase.from('roadmap_waves').select('id,title,time_horizon,okr_objective_ids,metadata,progress_pct');
      if (w && !w.error && Array.isArray(w.data)) waves = w.data;
    } catch { waves = []; }

    const rows = rollupWaves(waves, { activeRungKey, gaugeBuildPct, krAggByObjective });

    let written = 0;
    if (apply) {
      for (const row of rows) {
        if (row.progress_pct == null) continue; // never write a fabricated 0
        try {
          const u = await supabase.from('roadmap_waves').update({ progress_pct: row.progress_pct }).eq('id', row.wave_id);
          if (!u || !u.error) written += 1;
        } catch { /* fail-soft per-row; keep going */ }
      }
    }

    log(`[rung-rollup] ${apply ? 'APPLY' : 'DRY-RUN'} activeRung=${activeRungKey} gaugeBuildPct=${gaugeBuildPct} waves=${rows.length} writable=${rows.filter((r) => r.progress_pct != null).length} written=${written}`);
    return { ok: true, apply, activeRungKey, gaugeBuildPct, rows, written };
  } catch (err) {
    return { ok: false, apply, activeRungKey: null, gaugeBuildPct: null, rows: [], written: 0, error: err && err.message ? err.message : String(err) };
  }
}

export default { RUNG_BY_HORIZON, mapWaveToRung, krProgressPct, aggregateKrProgress, computeWaveRollup, rollupWaves, runRollup };
