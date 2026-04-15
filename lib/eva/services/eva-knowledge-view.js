/**
 * EVA Knowledge Base View Service
 * SD-EVA-FRIDAY-MEETING-ENHANCEMENT-ORCH-001-D
 *
 * Queries v_eva_knowledge_base VIEW to surface LEO Protocol intelligence
 * during Friday meeting conversation without direct table access.
 */

import { createSupabaseServiceClient } from '../../supabase-client.js';

const DEFAULT_LIMIT = 50;

/**
 * Query the v_eva_knowledge_base VIEW with optional filters.
 *
 * @param {Object} [options={}]
 * @param {string} [options.status] - Filter by status (e.g. 'resolved', 'pending')
 * @param {string} [options.source_type] - Filter by source ('learning_decision', 'issue_pattern', 'protocol_improvement', 'retrospective')
 * @param {number} [options.limit=50] - Max rows to return
 * @returns {Promise<Array<{ source_type: string, item_key: string, title: string, status: string, created_at: string, resolution_notes: string|null, score: number|null }>>}
 */
export async function getKnowledgeSummary(options = {}) {
  const { status, source_type, limit = DEFAULT_LIMIT } = options;

  try {
    const supabase = createSupabaseServiceClient();
    let query = supabase
      .from('v_eva_knowledge_base')
      .select('source_type, item_key, title, status, created_at, resolution_notes, score');

    if (status) query = query.eq('status', status);
    if (source_type) query = query.eq('source_type', source_type);
    query = query.limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error('[eva-knowledge-view] KNOWLEDGE_VIEW_UNAVAILABLE:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[eva-knowledge-view] KNOWLEDGE_VIEW_UNAVAILABLE:', err.message);
    return [];
  }
}
