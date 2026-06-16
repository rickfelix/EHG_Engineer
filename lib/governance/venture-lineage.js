/**
 * SD-LEO-INFRA-UNBLOCK-PORTFOLIO-WIDE-001 (FR-4) — venture lineage write path.
 *
 * Begins populating the ventures.source_blueprint_id / vision_id / architecture_plan_id lineage
 * (all null today, 0/9). PURE buildLineagePatch validates + filters a proposed lineage to the
 * three known uuid columns; the thin IO writer applies it. DORMANT: nothing is derivable today,
 * so this supplies the PATH (and is fixture-tested), not live backfill.
 */

const LINEAGE_COLUMNS = Object.freeze(['source_blueprint_id', 'vision_id', 'architecture_plan_id']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PURE — build a sanitized lineage patch. Only the three known lineage columns are accepted,
 * only valid uuid values, and (by default) only columns that are currently empty (no clobber).
 * @param {object} current - the venture's current lineage values
 * @param {object} proposed - proposed lineage values
 * @param {{overwrite?: boolean}} [opts]
 * @returns {{patch: object, applied: string[], rejected: object[]}}
 */
export function buildLineagePatch(current = {}, proposed = {}, opts = {}) {
  const patch = {};
  const applied = [];
  const rejected = [];
  for (const col of LINEAGE_COLUMNS) {
    const val = proposed[col];
    if (val === undefined || val === null || val === '') continue;
    if (typeof val !== 'string' || !UUID_RE.test(val)) { rejected.push({ col, reason: 'not_a_uuid' }); continue; }
    if (!opts.overwrite && current[col]) { rejected.push({ col, reason: 'already_set' }); continue; }
    patch[col] = val;
    applied.push(col);
  }
  return { patch, applied, rejected };
}

/**
 * Thin IO — apply a lineage patch to a venture. No-op (success) when the patch is empty.
 * @param {object} supabase
 * @param {string} ventureId
 * @param {object} proposed
 * @param {{overwrite?: boolean}} [opts]
 * @returns {Promise<{success:boolean, applied:string[], rejected?:object[], error?:string, noop?:boolean}>}
 */
export async function writeVentureLineage(supabase, ventureId, proposed, opts = {}) {
  if (!supabase || !ventureId) return { success: false, applied: [], error: 'missing supabase/ventureId' };
  try {
    const { data: cur, error: rErr } = await supabase
      .from('ventures')
      .select('source_blueprint_id, vision_id, architecture_plan_id')
      .eq('id', ventureId)
      .single();
    if (rErr) return { success: false, applied: [], error: rErr.message };
    const { patch, applied, rejected } = buildLineagePatch(cur || {}, proposed || {}, opts);
    if (applied.length === 0) return { success: true, applied: [], rejected, noop: true };
    // `patch` is dynamic, built+validated by buildLineagePatch to ONLY the 3 real lineage columns
    // (LINEAGE_COLUMNS); the linter otherwise mis-binds nearby return-object keys to this update.
    const { error: uErr } = await supabase.from('ventures').update(patch).eq('id', ventureId); // schema-lint-disable-line
    if (uErr) return { success: false, applied: [], rejected, error: uErr.message };
    return { success: true, applied, rejected };
  } catch (e) {
    return { success: false, applied: [], error: e && e.message ? e.message : String(e) };
  }
}

export { LINEAGE_COLUMNS };
