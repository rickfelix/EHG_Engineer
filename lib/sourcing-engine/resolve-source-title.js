/**
 * resolve-source-title.js — single source of truth for resolving a roadmap_wave_items title from its
 * source intake row (SD-LEO-INFRA-AUTO-REFILL-414-NULL-TITLES-001).
 *
 * roadmap_wave_items.source_id is the UUID PK of the per-source intake table:
 *   - todoist → eva_todoist_intake.title (the task content)
 *   - youtube → eva_youtube_intake.title (the video title)
 * Both intake .title columns are NOT NULL, so a staged roadmap_wave_items row should never have had a
 * null title — the 414 belt-blocking null-title rows are recoverable by re-joining on source_id.
 *
 * Shared by both the going-forward populator (stageCorpus) and the one-shot backfill, so the
 * source→title mapping lives in ONE place. Fail-soft: any error / missing row / placeholder title
 * returns null (the caller decides: disposition the row, or skip + fail-loud at ingestion).
 *
 * @module lib/sourcing-engine/resolve-source-title
 */

export const INTAKE_TABLE = Object.freeze({ todoist: 'eva_todoist_intake', youtube: 'eva_youtube_intake' });

/** A title is usable iff it is a non-empty, non-placeholder string. */
export function isUsableTitle(t) {
  const s = typeof t === 'string' ? t.trim() : '';
  return s !== '' && s !== '(untitled)';
}

/**
 * Resolve the source title for a roadmap_wave_items-shaped item ({source_type, source_id}).
 * @returns {Promise<string|null>} the trimmed source title, or null if unrecoverable/placeholder.
 */
export async function resolveSourceTitle(supabase, { source_type, source_id } = {}) {
  const table = INTAKE_TABLE[source_type];
  if (!supabase || !table || !source_id) return null;
  try {
    const { data, error } = await supabase.from(table).select('title').eq('id', source_id).maybeSingle();
    if (error || !data) return null;
    const t = (data.title || '').trim();
    return isUsableTitle(t) ? t : null;
  } catch {
    return null;
  }
}

export default resolveSourceTitle;
