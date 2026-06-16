// @wire-check-exempt: FR-4 prerequisite read API. getNorthStar() is the documented
// target-of-record contract the cockpit gauges (ord 2/3/4) bind to — those gauges are
// still design-only Phase-0 specs, so this read API is intentionally provided AHEAD of its
// static consumers (per VALIDATION: do not wire non-existent consumers). It also backs the
// ord-11 VDR probe's north_star record (lib/vision/vdr-registry.js) at runtime.
/**
 * north-star.js — SD-EHG-FOUNDATION-NORTHSTAR-CONTRACT-BUILD-001
 *
 * The single read API for the canonical north-star contract (vision-ladder ordinal 11):
 * the chairman-ratified target-of-record the cockpit gauges (ord 2/3/4) bind to instead of
 * each inventing its own target. Per docs/04_features/ehg-northstar-contract-phase0.md §5c.
 *
 * Cardinal honesty invariant: getNorthStar() is FAIL-SOFT and NEVER fabricates a target.
 * When no chairman_ratified record exists (or on any DB/error), it returns { status: 'unset' }
 * with NO target — downstream gauges must show "no target set", never a made-up number.
 */

const UNSET = Object.freeze({ status: 'unset', target: null });

/**
 * PURE — shape a north_star DB row into the public contract. Never throws.
 * @param {object} row
 * @returns {object}
 */
export function toContract(row) {
  if (!row || typeof row !== 'object') return { ...UNSET };
  return {
    definition: row.definition ?? null,
    metric: row.metric ?? null,
    target: row.target ?? null, // { amount, unit, qualifier } | null
    sustain: row.sustain ?? null,
    measurement_source: row.measurement_source ?? null,
    cadence: row.cadence ?? null,
    status: row.status ?? 'proposed',
    provenance: row.provenance ?? null,
    // current_value is honest: read from measurement_source when instrumented; null until then.
    current_value: row.current_value ?? null,
    measured_at: row.measured_at ?? null,
  };
}

/**
 * IO — read the single chairman-ratified north-star contract. Fail-soft: returns
 * { status: 'unset', target: null } when no ratified record exists, the table is missing,
 * or any error occurs — NEVER a fabricated target.
 *
 * @param {object} db - a supabase-like client (from()/select()/eq()...). If absent → unset.
 * @returns {Promise<object>} the contract, or { status:'unset', target:null }
 */
export async function getNorthStar(db) {
  if (!db || typeof db.from !== 'function') return { ...UNSET };
  try {
    const { data, error } = await db
      .from('north_star')
      .select('*')
      .eq('status', 'chairman_ratified')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(1);
    if (error) return { ...UNSET };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { ...UNSET };
    return toContract(row);
  } catch {
    return { ...UNSET };
  }
}

// ── FR-5: read-side de-noise filter ────────────────────────────────────────
// Exclude auto-generated retrospective noise (PAT-AUTO-* key_results) and orphan visions
// from any north-star reconciliation. READ-SIDE ONLY — never deletes.

/**
 * PURE — true if a key_results code is an auto-generated retro-noise row. Covers the real
 * noisy auto-generated families: PAT-AUTO-* (auto_rca), PAT-HF-* and PAT-RETRO-*
 * (gate-failure / retro history). These are machinery exhaust, not chairman-decision
 * substrate, so they are excluded from north-star reconciliation. Trims leading whitespace.
 */
export function isAutoNoiseKr(code) {
  return /^PAT-(AUTO|HF|RETRO)-/i.test(String(code || '').trim());
}

/** @deprecated narrower alias retained for back-compat — prefer isAutoNoiseKr. */
export const isPatAutoNoise = isAutoNoiseKr;

/**
 * PURE — filter substrate rows for north-star reconciliation, excluding PAT-AUTO noise KRs
 * and orphan visions. Never mutates the input; returns a new array.
 *
 * @param {Array<object>} rows - candidate substrate rows ({ code? , id? , kind? })
 * @param {{orphanVisionIds?: Set<string>|Array<string>}} [opts]
 * @returns {Array<object>}
 */
export function denoiseSubstrate(rows = [], opts = {}) {
  const orphan = opts.orphanVisionIds instanceof Set
    ? opts.orphanVisionIds
    : new Set(Array.isArray(opts.orphanVisionIds) ? opts.orphanVisionIds.map(String) : []);
  const input = Array.isArray(rows) ? rows : [];
  return input.filter((r) => {
    if (!r || typeof r !== 'object') return false;
    if (isAutoNoiseKr(r.code)) return false;             // auto-generated retro noise (PAT-AUTO/HF/RETRO)
    if (r.id != null && orphan.has(String(r.id))) return false; // orphan vision
    return true;
  });
}
