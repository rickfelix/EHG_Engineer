/**
 * Protocol Improvement Repository
 * Handles database operations for protocol improvements
 */

import { createClient } from '@supabase/supabase-js';

export class ImprovementRepository {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(
      supabaseUrl || process.env.SUPABASE_URL,
      supabaseKey || process.env.SUPABASE_ANON_KEY
    );
  }

  /**
   * Get retrospectives with protocol improvements
   */
  async getRetrospectivesWithImprovements(filters = {}) {
    let query = this.supabase
      .from('retrospectives')
      .select('*')
      .not('protocol_improvements', 'is', null);

    if (filters.since) {
      query = query.gte('conducted_date', filters.since);
    }

    if (filters.sdId) {
      query = query.eq('sd_id', filters.sdId);
    }

    query = query.order('conducted_date', { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch retrospectives: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get flattened list of improvements from database view
   */
  async getProtocolImprovementsAnalysis(filters = {}) {
    let query = this.supabase
      .from('v_protocol_improvements_analysis')
      .select('*');

    if (filters.phase) {
      query = query.eq('affected_phase', filters.phase);
    }

    if (filters.category) {
      query = query.eq('improvement_category', filters.category);
    }

    query = query.order('conducted_date', { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch improvements analysis: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Create or update a protocol improvement queue entry
   * Note: This assumes a protocol_improvement_queue table exists
   * If it doesn't exist yet, this would need to be created via migration
   */
  async upsertImprovementQueue(improvement) {
    const { data, error } = await this.supabase
      .from('protocol_improvement_queue')
      .upsert({
        retro_id: improvement.retro_id,
        sd_id: improvement.sd_id,
        improvement_category: improvement.category,
        improvement_text: improvement.improvement,
        evidence: improvement.evidence,
        impact: improvement.impact,
        affected_phase: improvement.affected_phase,
        status: improvement.status || 'PENDING',
        auto_apply_score: improvement.auto_apply_score || null,
        reviewed_at: improvement.reviewed_at || null,
        reviewed_by: improvement.reviewed_by || null,
        applied_at: improvement.applied_at || null,
        rejection_reason: improvement.rejection_reason || null
      }, {
        onConflict: 'retro_id,improvement_text'
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to upsert improvement queue: ${error.message}`);
    }

    return data;
  }

  /**
   * List improvements from queue
   */
  async listQueuedImprovements(filters = {}) {
    let query = this.supabase
      .from('protocol_improvement_queue')
      .select('*');

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.phase) {
      query = query.eq('affected_phase', filters.phase);
    }

    if (filters.autoApplicable) {
      query = query.gte('auto_apply_score', 0.85);
    }

    query = query.order('created_at', { ascending: false });

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list queued improvements: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get a specific improvement by ID
   */
  async getImprovementById(id) {
    const { data, error } = await this.supabase
      .from('protocol_improvement_queue')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(`Failed to get improvement: ${error.message}`);
    }

    return data;
  }

  /**
   * Update improvement status
   */
  async updateImprovementStatus(id, status, metadata = {}) {
    const updates = {
      status,
      ...metadata
    };

    if (status === 'APPROVED') {
      updates.reviewed_at = new Date().toISOString();
    } else if (status === 'APPLIED') {
      updates.applied_at = new Date().toISOString();
    }

    const { data, error } = await this.supabase
      .from('protocol_improvement_queue')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update improvement status: ${error.message}`);
    }

    return data;
  }

  /**
   * Record effectiveness metrics for an applied improvement
   */
  async recordEffectiveness(improvementId, metrics) {
    const { data, error } = await this.supabase
      .from('protocol_improvement_queue')
      .update({
        effectiveness_score: metrics.score,
        effectiveness_measured_at: new Date().toISOString(),
        effectiveness_notes: metrics.notes
      })
      .eq('id', improvementId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to record effectiveness: ${error.message}`);
    }

    return data;
  }

  /**
   * Get improvements with effectiveness tracking
   */
  async getImprovementsWithEffectiveness(filters = {}) {
    let query = this.supabase
      .from('protocol_improvement_queue')
      .select('*')
      .eq('status', 'APPLIED')
      .not('effectiveness_score', 'is', null);

    if (filters.minScore) {
      query = query.gte('effectiveness_score', filters.minScore);
    }

    query = query.order('effectiveness_measured_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get effectiveness data: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get retrospective by ID
   */
  async getRetrospectiveById(id) {
    const { data, error } = await this.supabase
      .from('retrospectives')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(`Failed to get retrospective: ${error.message}`);
    }

    return data;
  }
}
