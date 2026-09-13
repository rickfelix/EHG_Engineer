/**
 * Stage-15 coverage/disposition reader — SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I FR-2.
 *
 * blueprint_user_journey.coverage_selfcheck.unreachable_screens (computed by
 * generateUserJourneys, stage-15-user-journey.js:262-265) measures JOURNEY
 * REACHABILITY, not built-ness: a screen is "reached" only if some journey step's
 * screen_ref points at it. A screen can be genuinely built and live (a journey
 * ENTRY point, e.g. a landing page) while still reading unreachable, because this
 * codebase's journeys model has no structured "entry screen" field anywhere
 * (entry_conditions is free text; verified against AltifyAI's live data -- no
 * journey's first step ever references screen-0 or screen-1). Because there is no
 * independent, structural signal to auto-verify an ENTRY_POINT classification
 * against, this module is a pure VERIFIER, never a classifier: it never guesses a
 * disposition. Every unreachable screen must have an explicit, evidence-backed row
 * in venture_screen_dispositions (written by recordScreenDisposition, a deliberate
 * act citing real evidence -- a chairman_decisions id for the D2 classes, or a
 * built artifact reference for ENTRY_POINT) before the reader will report it as
 * disposed.
 */

import { createLogger } from '../../../logger.js';

const moduleLogger = createLogger('S15CoverageDispositionReader');

const DISPOSITION_CLASSES = ['D2_RETIRE', 'D2_BUILD_THIRD_PARTY', 'ENTRY_POINT'];

/**
 * Reads the venture's current unreachable_screens set and cross-references it
 * against recorded dispositions.
 * @returns {Promise<{
 *   ok: boolean,
 *   allDisposed: boolean,
 *   unreachableScreens: string[],
 *   undisposedScreenIds: string[],
 *   dispositions: Array<{screen_id: string, disposition_class: string, disposition_status: string, reason: string, evidence_ref: string|null}>,
 *   reason?: string,
 * }>}
 */
export async function checkScreenDispositions({ supabase, ventureId, logger = moduleLogger }) {
  if (!supabase || !ventureId) {
    return { ok: false, reason: 'missing_supabase_or_ventureId' };
  }

  const { data: journeyArtifact, error: journeyErr } = await supabase
    .from('venture_artifacts')
    .select('artifact_data')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'blueprint_user_journey')
    .eq('is_current', true)
    .maybeSingle();
  if (journeyErr) {
    logger?.warn?.(`[S15CoverageDispositionReader] journey artifact read error: ${journeyErr.message}`);
    return { ok: false, reason: 'journey_artifact_read_error' };
  }
  const unreachableScreens = journeyArtifact?.artifact_data?.coverage_selfcheck?.unreachable_screens || [];

  if (unreachableScreens.length === 0) {
    return { ok: true, allDisposed: true, unreachableScreens: [], undisposedScreenIds: [], dispositions: [] };
  }

  const { data: dispositionRows, error: dispErr } = await supabase
    .from('venture_screen_dispositions')
    .select('screen_id, disposition_class, disposition_status, reason, evidence_ref')
    .eq('venture_id', ventureId)
    .in('screen_id', unreachableScreens)
    .limit(200);
  if (dispErr) {
    logger?.warn?.(`[S15CoverageDispositionReader] disposition read error: ${dispErr.message}`);
    return { ok: false, reason: 'disposition_read_error' };
  }

  const byScreenId = new Map((dispositionRows || []).map((row) => [row.screen_id, row]));
  const undisposedScreenIds = unreachableScreens.filter((id) => !byScreenId.has(id));
  const allDisposed = undisposedScreenIds.length === 0;

  return {
    ok: true,
    allDisposed,
    unreachableScreens,
    undisposedScreenIds,
    dispositions: unreachableScreens.map((id) => byScreenId.get(id)).filter(Boolean),
  };
}

/**
 * Records (upserts) a single screen's disposition. A deliberate, evidence-backed
 * act -- never inferred. D2_RETIRE dispositions are always recorded COMPLETE
 * (present-tense fact). D2_BUILD_THIRD_PARTY and ENTRY_POINT default to whatever
 * dispositionStatus the caller passes (the caller decides COMPLETE vs OPEN based
 * on whether the third-party surface/backing artifact has actually been verified
 * to exist yet).
 * @returns {Promise<{ok: boolean, id?: string, reason?: string}>}
 */
export async function recordScreenDisposition({
  supabase, ventureId, screenId, dispositionClass, dispositionStatus, reason, evidenceRef, logger = moduleLogger,
}) {
  if (!supabase || !ventureId || !screenId) {
    return { ok: false, reason: 'missing_required_fields' };
  }
  if (!DISPOSITION_CLASSES.includes(dispositionClass)) {
    return { ok: false, reason: `invalid_disposition_class: ${dispositionClass}` };
  }
  if (!reason || !reason.trim()) {
    return { ok: false, reason: 'empty_or_whitespace_reason' };
  }

  const status = dispositionClass === 'D2_RETIRE' ? 'COMPLETE' : (dispositionStatus === 'COMPLETE' ? 'COMPLETE' : 'OPEN');

  const { data: existing } = await supabase
    .from('venture_screen_dispositions')
    .select('id')
    .eq('venture_id', ventureId)
    .eq('screen_id', screenId)
    .maybeSingle();

  const row = {
    venture_id: ventureId,
    screen_id: screenId,
    disposition_class: dispositionClass,
    disposition_status: status,
    reason: reason.trim(),
    evidence_ref: evidenceRef || null,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabase.from('venture_screen_dispositions').update(row).eq('id', existing.id);
    if (error) {
      logger?.warn?.(`[S15CoverageDispositionReader] disposition update failed for ${screenId}: ${error.message}`);
      return { ok: false, reason: 'update_failed' };
    }
    return { ok: true, id: existing.id };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('venture_screen_dispositions')
    .insert(row)
    .select('id')
    .single();
  if (insertErr) {
    logger?.warn?.(`[S15CoverageDispositionReader] disposition insert failed for ${screenId}: ${insertErr.message}`);
    return { ok: false, reason: 'insert_failed' };
  }
  return { ok: true, id: inserted.id };
}

export { DISPOSITION_CLASSES };
