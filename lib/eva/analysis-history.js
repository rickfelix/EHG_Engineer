/**
 * Historical Analysis Step Preservation
 * SD-MAN-INFRA-CORRECTIVE-ARCHITECTURE-GAP-025
 *
 * Preserves historical analysis steps rather than overwriting them.
 * Previous results are archived with timestamps so analysis evolution
 * is traceable across stage re-runs.
 *
 * Design principles:
 *   - Stateless: history stored in eva_event_log (no new tables)
 *   - Uses eva_event_log with event_type=ANALYSIS_STEP_ARCHIVED
 *   - Current analysis still accessible via existing query patterns
 *   - Constructor injection for Supabase client
 *
 * @module lib/eva/analysis-history
 */

import { ServiceError } from './shared-services.js';

export const MODULE_VERSION = '1.0.0';

/**
 * Archive an existing analysis result before overwriting it.
 * Call this BEFORE updating eva_venture_stages with new analysis.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {string} params.stageId - Stage identifier (e.g. stage number or UUID)
 * @param {object} params.analysisResult - The current analysis result to archive
 * @param {string} [params.reason] - Why re-analysis is being run
 * @returns {Promise<{eventId: string, archivedAt: string, historyCount: number}>}
 */
export async function archiveAnalysisStep(supabase, { ventureId, stageId, analysisResult, reason = 'stage_reanalysis' }) {
  if (!supabase) throw new ServiceError('INVALID_ARGS', 'supabase client is required', 'AnalysisHistory');
  if (!ventureId) throw new ServiceError('INVALID_ARGS', 'ventureId is required', 'AnalysisHistory');
  if (!stageId) throw new ServiceError('INVALID_ARGS', 'stageId is required', 'AnalysisHistory');
  if (!analysisResult) throw new ServiceError('INVALID_ARGS', 'analysisResult is required', 'AnalysisHistory');

  const archivedAt = new Date().toISOString();

  // Get current history count for ordering
  const existingHistory = await getAnalysisHistory(supabase, ventureId, stageId);
  const historyCount = existingHistory.length + 1;

  const { data, error } = await supabase
    .from('eva_event_log')
    .insert({
      venture_id: ventureId,
      event_type: 'ANALYSIS_STEP_ARCHIVED',
      severity: 'info',
      metadata: {
        stage_id: stageId,
        analysis_result: analysisResult,
        archived_at: archivedAt,
        history_index: historyCount,
        reason,
        module_version: MODULE_VERSION,
      },
    })
    .select('id')
    .single();

  if (error) {
    throw new ServiceError('ARCHIVE_FAILED', `Failed to archive analysis step: ${error.message}`, 'AnalysisHistory', error);
  }

  return { eventId: data.id, archivedAt, historyCount };
}

/**
 * Get the complete analysis history for a stage, ordered chronologically.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId - Venture UUID
 * @param {string} stageId - Stage identifier
 * @param {object} [options]
 * @param {number} [options.limit=50] - Max results
 * @returns {Promise<Array<{eventId: string, stageId: string, analysisResult: object, archivedAt: string, historyIndex: number}>>}
 */
export async function getAnalysisHistory(supabase, ventureId, stageId, { limit = 50 } = {}) {
  if (!supabase) throw new ServiceError('INVALID_ARGS', 'supabase client is required', 'AnalysisHistory');

  const { data, error } = await supabase
    .from('eva_event_log')
    .select('id, metadata, created_at')
    .eq('venture_id', ventureId)
    .eq('event_type', 'ANALYSIS_STEP_ARCHIVED')
    .eq('metadata->>stage_id', String(stageId))
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new ServiceError('QUERY_FAILED', `Failed to query analysis history: ${error.message}`, 'AnalysisHistory', error);
  }

  return (data || []).map(row => ({
    eventId: row.id,
    stageId: row.metadata?.stage_id,
    analysisResult: row.metadata?.analysis_result,
    archivedAt: row.metadata?.archived_at,
    historyIndex: row.metadata?.history_index,
    reason: row.metadata?.reason,
    createdAt: row.created_at,
  }));
}

/**
 * Run analysis with automatic history preservation.
 * Archives the current result (if any), then returns a flag
 * indicating the caller should proceed with the new analysis.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {string} params.stageId - Stage identifier
 * @param {string} [params.reason] - Why re-analysis is being run
 * @returns {Promise<{archived: boolean, historyCount: number}>}
 */
export async function preserveBeforeReanalysis(supabase, { ventureId, stageId, reason = 'stage_reanalysis' }) {
  if (!supabase) throw new ServiceError('INVALID_ARGS', 'supabase client is required', 'AnalysisHistory');

  // Check if there's a current analysis to preserve
  const { data: currentStage, error } = await supabase
    .from('eva_venture_stages')
    .select('analysis_result')
    .eq('venture_id', ventureId)
    .eq('stage_number', stageId)
    .maybeSingle();

  if (error) {
    throw new ServiceError('QUERY_FAILED', `Failed to check current analysis: ${error.message}`, 'AnalysisHistory', error);
  }

  if (!currentStage?.analysis_result) {
    return { archived: false, historyCount: 0 };
  }

  const result = await archiveAnalysisStep(supabase, {
    ventureId,
    stageId,
    analysisResult: currentStage.analysis_result,
    reason,
  });

  return { archived: true, historyCount: result.historyCount };
}
