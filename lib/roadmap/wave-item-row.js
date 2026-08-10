/**
 * Build a roadmap_wave_items insert row from a clustered intake item — the ONE place the promotion
 * step maps a title and refuses a title-less mint. SD-LEO-INFRA-TODOIST-YOUTUBE-ROADMAP-001.
 *
 * WHY THIS EXISTS: scripts/roadmap-generate.js promoted intake items into roadmap_wave_items with
 * only {wave_id, source_type, source_id} — title omitted -> NULL. A title-less capture is
 * un-groomable (no human or engine can distill it) and invisible to every title-keyed dedup axis,
 * so 1087 accumulated and gated the Wave-0 distillation program. A prior fix backfilled the DATA
 * but never the PRODUCER, so the nulls re-grew (414 -> 1087). This helper is the durable
 * recurrence-stopper: map title:item.title (already on the clustered item — wave-clusterer SELECTs
 * and spreads it, no round-trip) and SKIP-and-collect (loud, non-fatal) an unusable-title item so
 * one bad row never mints a title-less capture and never aborts a whole wave.
 *
 * EXTRACTED as a pure importable helper (not inlined) because roadmap-generate.js self-invokes
 * main() at module load and is therefore not unit-testable in place — the same reason
 * lib/roadmap/full-create-guard.js was extracted from that file. Both promotion paths
 * (createWaves array insert, runIncremental single-row insert) call this.
 *
 * PARITY: title usability is decided by the SHARED isUsableTitle (resolve-source-title.js) — the
 * SAME predicate the backfill and the dedup axis use — never a re-implementation, so the producer
 * and the backfill cannot disagree on "usable".
 */

import { isUsableTitle } from '../sourcing-engine/resolve-source-title.js';

/**
 * @param {{ id?: string, source_type?: string, title?: any }} item - a clustered intake item
 * @param {string} waveId - the roadmap_waves row id this item belongs to
 * @returns {{ row: object } | { skip: true, reason: string, source_id: (string|null) }}
 *   { row } when the item carries a usable title (the insert payload, title included);
 *   { skip, reason, source_id } when it does not — the caller logs it loudly and drops it,
 *   NEVER inserts a title-less row and NEVER throws.
 */
export function buildWaveItemRow(item, waveId) {
  if (!item || typeof item !== 'object') {
    return { skip: true, reason: 'missing_item', source_id: null };
  }
  if (!isUsableTitle(item.title)) {
    return { skip: true, reason: 'unusable_source_title', source_id: item.id ?? null };
  }
  return {
    row: {
      wave_id: waveId,
      source_type: item.source_type,
      source_id: item.id,
      title: String(item.title).trim(),
    },
  };
}
