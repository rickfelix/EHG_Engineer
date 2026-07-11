// Wave-disposition contract (SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001).
//
// Under the chairman-ratified WAVES-AS-GATES model, every plan-affecting event
// (chairman plan ratification, orchestrator-parent SD creation) must record an
// explicit wave disposition — a roadmap_wave_items insert OR an explicit
// no_wave verdict — and stamp roadmap freshness either way. A missing
// disposition is an ERROR on gated paths, never silently defaulted: the defect
// this closes is exactly silent non-disposition (strategic_roadmaps.updated_at
// frozen for a month while nine ratified workstreams accumulated waveless —
// plan-gap audit 2026-07-11, verdict cd261597).

import { createHash } from 'node:crypto';

/**
 * roadmap_wave_items.source_id is UUID NOT NULL and participates in
 * UNIQUE(wave_id, source_type, source_id). Deriving the UUID deterministically
 * from the caller's stable key (question_key / sd_key) makes the unique
 * constraint double as the idempotency guarantee — re-recording the same
 * disposition can never insert a second item.
 */
export function deterministicSourceId(key) {
  const hex = createHash('sha256').update(String(key), 'utf8').digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Validate a wave disposition: exactly one of { waveId } or { noWave: reason }.
 * Throws on anything else — explicit-never-default (TR-2).
 *
 * @returns {{kind:'wave', waveId:string} | {kind:'no_wave', reason:string}}
 */
export function validateWaveDisposition(wd) {
  if (!wd || typeof wd !== 'object') {
    throw new Error(
      'wave_disposition required: pass { waveId: "<roadmap_waves.id>" } or { noWave: "<reason>" } — ' +
      'plan-affecting events must record an explicit wave disposition (waves-as-gates model, SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001)'
    );
  }
  const hasWave = typeof wd.waveId === 'string' && wd.waveId.trim().length > 0;
  const hasNoWave = typeof wd.noWave === 'string' && wd.noWave.trim().length > 0;
  if (hasWave === hasNoWave) {
    throw new Error(
      hasWave
        ? 'wave_disposition must be exactly one of { waveId } or { noWave } — not both'
        : 'wave_disposition must be exactly one of { waveId } or { noWave: "<non-empty reason>" }'
    );
  }
  return hasWave
    ? { kind: 'wave', waveId: wd.waveId.trim() }
    : { kind: 'no_wave', reason: wd.noWave.trim() };
}

async function stampRoadmapFreshness(supabase, roadmapIds, nowIso) {
  const ids = [...new Set(roadmapIds)].filter(Boolean);
  if (ids.length === 0) return;
  // strategic_roadmaps has no updated_at trigger — the stamp must be explicit.
  const { error } = await supabase
    .from('strategic_roadmaps')
    .update({ updated_at: nowIso })
    .in('id', ids);
  if (error) throw new Error(`wave-disposition: roadmap freshness stamp failed: ${error.message}`);
}

/**
 * Apply a validated disposition's durable effects.
 *  - kind 'wave': insert a roadmap_wave_items row (source_type 'adam_direct' —
 *    existing CHECK vocabulary; this SD is no-schema-change) keyed on a
 *    deterministic source_id, then stamp the wave's parent roadmap.
 *  - kind 'no_wave': stamp all active roadmaps — the explicit verdict itself
 *    is the freshness event.
 * Idempotent: a duplicate wave insert (23505) resolves to the existing row.
 *
 * @param {object} supabase - service-role client
 * @param {object} params
 * @param {object} params.waveDisposition - raw { waveId } | { noWave } shape
 * @param {string} params.sourceKey - stable key (question_key / sd_key) for source_id derivation
 * @param {string} params.title - wave-item title when a wave is chosen
 * @param {string} params.dispositionSource - provenance label (e.g. 'plan_ratification', 'orchestrator_sd_creation')
 * @returns {Promise<{verdict: object, itemId: string|null}>}
 */
export async function applyWaveDisposition(supabase, { waveDisposition, sourceKey, title, dispositionSource }) {
  const verdict = validateWaveDisposition(waveDisposition);
  const nowIso = new Date().toISOString();

  if (verdict.kind === 'no_wave') {
    const { data: actives, error } = await supabase
      .from('strategic_roadmaps').select('id').eq('status', 'active');
    if (error) throw new Error(`wave-disposition: active roadmap lookup failed: ${error.message}`);
    await stampRoadmapFreshness(supabase, (actives ?? []).map((r) => r.id), nowIso);
    return { verdict, itemId: null };
  }

  const sourceId = deterministicSourceId(sourceKey);
  let itemId = null;
  const { data, error } = await supabase
    .from('roadmap_wave_items')
    .insert({
      wave_id: verdict.waveId,
      source_type: 'adam_direct',
      source_id: sourceId,
      title,
      item_disposition: 'pending',
      metadata: { disposition_source: dispositionSource, source_key: sourceKey, wave_disposition: verdict },
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('roadmap_wave_items').select('id')
        .eq('wave_id', verdict.waveId).eq('source_type', 'adam_direct').eq('source_id', sourceId)
        .maybeSingle();
      itemId = existing?.id ?? null;
    } else {
      throw new Error(`wave-disposition: wave item insert failed: ${error.message}`);
    }
  } else {
    itemId = data.id;
  }

  const { data: wave, error: wErr } = await supabase
    .from('roadmap_waves').select('roadmap_id').eq('id', verdict.waveId).single();
  if (wErr) throw new Error(`wave-disposition: wave ${verdict.waveId} not found: ${wErr.message}`);
  await stampRoadmapFreshness(supabase, [wave.roadmap_id], nowIso);

  return { verdict, itemId };
}

export default { validateWaveDisposition, applyWaveDisposition, deterministicSourceId };
