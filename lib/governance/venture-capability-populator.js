/**
 * SD-LEO-INFRA-UNBLOCK-PORTFOLIO-WIDE-001 (FR-2) — honest, dormancy-accepting
 * venture_capabilities population.
 *
 * The cross-venture compounding libraries (lib/governance/cross-venture-capability-graph.js,
 * SD-2 scoring, SD-4 maturity) read venture_capabilities, which is EMPTY today. This module
 * supplies the population PATH. It is HONEST about dormancy: with no real ventures it produces
 * 0 rows and NEVER fabricates data to fake non-emptiness.
 *
 * A "real" venture = NOT cancelled, NOT a demo, NOT scaffolding (is_demo/is_scaffolding false),
 * and not a throwaway test row. Capabilities are derived from the venture's strategic directives
 * (strategic_directives_v2.venture_id -> delivers_capabilities). Rows are shaped for the live
 * venture_capabilities columns: name / origin_venture_id / capability_type / maturity_level.
 *
 * PURE core (deriveVentureCapabilities) is unit-tested with fixtures; the thin IO wrapper does
 * the live read + upsert. The graph already returns {success:true, sharedCapabilities:[]} on 0
 * rows, so dormancy is safe end-to-end.
 */

/** Default capability_type when an SD does not classify the capability. */
const DEFAULT_CAPABILITY_TYPE = 'delivered';
/** Default maturity for a freshly-derived venture capability (proxy state; refined by SD-4). */
const DEFAULT_MATURITY_LEVEL = 'emerging';

/**
 * Is this venture a REAL venture eligible to contribute capabilities? Conservative / honest:
 * excludes cancelled, demo, scaffolding, and obvious test rows. Default-EXCLUDE on anything odd.
 * @param {object} v
 * @returns {boolean}
 */
export function isRealVenture(v) {
  if (!v || typeof v !== 'object') return false;
  if (v.is_demo === true) return false;
  if (v.is_scaffolding === true) return false;
  const status = String(v.status || '').toLowerCase();
  if (status === 'cancelled' || status === 'canceled' || status === 'killed' || status === 'archived') return false;
  const name = String(v.name || '');
  if (/^(test|state-test|canary)\b/i.test(name) || /\btest venture\b/i.test(name)) return false;
  return true;
}

/**
 * PURE — derive venture_capabilities rows from real ventures + their SDs. No IO.
 * @param {object[]} ventures - venture rows ({id,name,status,is_demo,is_scaffolding})
 * @param {object[]} sds - SD rows ({venture_id, delivers_capabilities, sd_key})
 * @returns {{rows: object[], realVentureIds: string[], skipped: number}}
 */
export function deriveVentureCapabilities(ventures, sds) {
  const realVentures = (Array.isArray(ventures) ? ventures : []).filter(isRealVenture);
  const realIds = new Set(realVentures.map((v) => v.id));
  const seen = new Set(); // dedup (origin_venture_id|name)
  const rows = [];
  let skipped = 0;
  for (const sd of Array.isArray(sds) ? sds : []) {
    const vid = sd && sd.venture_id;
    if (!vid || !realIds.has(vid)) { skipped++; continue; }
    const caps = Array.isArray(sd.delivers_capabilities) ? sd.delivers_capabilities : [];
    for (const cap of caps) {
      const name = typeof cap === 'string' ? cap.trim() : (cap && (cap.name || cap.capability_key || cap.key));
      if (!name) continue;
      const dedupKey = `${vid}|${name}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      rows.push({
        name,
        origin_venture_id: vid,
        capability_type: (cap && cap.capability_type) || DEFAULT_CAPABILITY_TYPE,
        maturity_level: (cap && cap.maturity_level) || DEFAULT_MATURITY_LEVEL,
      });
    }
  }
  return { rows, realVentureIds: [...realIds], skipped };
}

/**
 * Thin IO wrapper — read real ventures + their SDs, derive, and upsert into venture_capabilities.
 * HONEST: returns populated:0 when there are no real ventures (no fabrication). Fail-soft.
 * @param {object} supabase
 * @param {{dryRun?: boolean}} [opts]
 * @returns {Promise<{success:boolean, populated:number, realVentures:number, dormant:boolean, error?:string}>}
 */
export async function populateVentureCapabilities(supabase, opts = {}) {
  if (!supabase) return { success: false, populated: 0, realVentures: 0, dormant: true, error: 'no supabase client' };
  try {
    const { data: ventures, error: vErr } = await supabase
      .from('ventures')
      .select('id, name, status, is_demo, is_scaffolding');
    if (vErr) return { success: false, populated: 0, realVentures: 0, dormant: true, error: vErr.message };

    const realVentures = (ventures || []).filter(isRealVenture);
    if (realVentures.length === 0) {
      // HONEST dormancy: nothing to populate. Never fabricate.
      return { success: true, populated: 0, realVentures: 0, dormant: true };
    }

    const { data: sds, error: sErr } = await supabase
      .from('strategic_directives_v2')
      .select('venture_id, delivers_capabilities, sd_key')
      .in('venture_id', realVentures.map((v) => v.id));
    if (sErr) return { success: false, populated: 0, realVentures: realVentures.length, dormant: false, error: sErr.message };

    const { rows } = deriveVentureCapabilities(realVentures, sds || []);
    if (rows.length === 0) return { success: true, populated: 0, realVentures: realVentures.length, dormant: true };
    if (opts.dryRun) return { success: true, populated: rows.length, realVentures: realVentures.length, dormant: false, dryRun: true };

    const { error: upErr } = await supabase
      .from('venture_capabilities')
      .upsert(rows, { onConflict: 'origin_venture_id,name', ignoreDuplicates: true });
    if (upErr) return { success: false, populated: 0, realVentures: realVentures.length, dormant: false, error: upErr.message };
    return { success: true, populated: rows.length, realVentures: realVentures.length, dormant: false };
  } catch (e) {
    return { success: false, populated: 0, realVentures: 0, dormant: true, error: e && e.message ? e.message : String(e) };
  }
}
