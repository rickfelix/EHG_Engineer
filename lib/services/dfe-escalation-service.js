/**
 * DFE Escalation Service
 * SD-EVA-FEAT-DFE-PRESENTATION-001
 *
 * Assembles normalized escalation payload for Chairman Dashboard:
 * - DFE context from chairman_decisions.dfe_context
 * - Matching issue_patterns for historical context
 * - Latest eva_orchestration_events for the decision
 * - Mitigation action state
 */

import { createClient } from '@supabase/supabase-js';

const TRIGGER_TYPE_LABELS = {
  cost_threshold: 'Cost Threshold Exceeded',
  new_tech_vendor: 'Unapproved Technology/Vendor',
  strategic_pivot: 'Strategic Pivot Detected',
  low_score: 'Below Score Threshold',
  novel_pattern: 'Novel Pattern Detected',
  constraint_drift: 'Constraint Drift',
  vision_score_signal: 'Vision Score Below Exec Threshold',
};

const SEVERITY_ORDER = { HIGH: 0, MEDIUM: 1, INFO: 2 };

export class DfeEscalationService {
  constructor(options = {}) {
    this.supabase = options.supabaseClient || createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    this.logger = options.logger || console;
  }

  /**
   * Get the full escalation context for a decision.
   * Returns null if the decision has no DFE escalation.
   *
   * @param {string} decisionId - UUID of the chairman_decisions row
   * @returns {Promise<{success: boolean, data?: object, error?: string}>}
   */
  async getEscalationContext(decisionId) {
    if (!decisionId || typeof decisionId !== 'string') {
      return { success: false, error: 'Invalid decision ID' };
    }

    // 1. Fetch the decision with DFE context
    const { data: decision, error: decisionError } = await this.supabase
      .from('chairman_decisions')
      .select('id, venture_id, lifecycle_stage, dfe_context, mitigation_actions, recommendation, health_score, decision, status, summary, created_at')
      .eq('id', decisionId)
      .single();

    if (decisionError || !decision) {
      return { success: false, error: `Decision not found: ${decisionError?.message || 'no data'}` };
    }

    // 2. Check if this decision has DFE escalation context
    if (!decision.dfe_context) {
      return { success: false, error: 'No DFE escalation context for this decision' };
    }

    const dfeContext = decision.dfe_context;
    const triggers = dfeContext.triggers || [];

    // 3. Fetch matching issue_patterns for historical context
    const triggerTypes = [...new Set(triggers.map(t => t.type))];
    let historicalPatterns = [];

    if (triggerTypes.length > 0) {
      const { data: patterns } = await this.supabase
        .from('issue_patterns')
        .select('id, pattern_key, title, severity, resolution, status, first_seen, last_seen, occurrence_count')
        .or(triggerTypes.map(type => `pattern_key.ilike.%${type}%`).join(','))
        .eq('status', 'active')
        .order('occurrence_count', { ascending: false })
        .limit(5);

      historicalPatterns = (patterns || []).map(p => ({
        id: p.id,
        patternKey: p.pattern_key,
        title: p.title,
        severity: p.severity,
        resolution: p.resolution,
        occurrenceCount: p.occurrence_count,
        lastSeen: p.last_seen,
      }));
    }

    // 4. Fetch latest DFE-related events for this decision/venture
    const { data: events } = await this.supabase
      .from('eva_orchestration_events')
      .select('event_id, event_type, event_data, chairman_flagged, created_at')
      .eq('venture_id', decision.venture_id)
      .in('event_type', ['dfe_triggered', 'escalation'])
      .order('created_at', { ascending: false })
      .limit(3);

    // 5. Normalize triggers with labels and sort by severity
    const normalizedTriggers = triggers
      .map(t => ({
        type: t.type,
        label: TRIGGER_TYPE_LABELS[t.type] || t.type,
        severity: t.severity,
        message: t.message,
        details: t.details || {},
      }))
      .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99));

    // 5b. Fetch vision dimension gaps if a vision_score_signal trigger is present
    let visionDimensionGaps = [];
    const hasVisionTrigger = triggers.some(t => t.type === 'vision_score_signal');
    if (hasVisionTrigger && decision.venture_id) {
      const { data: gaps } = await this.supabase
        .from('eva_vision_gaps')
        .select('dimension_key, dimension_label, current_score, target_score, gap_severity, corrective_sd_key')
        .eq('sd_id', decision.venture_id)
        .order('current_score', { ascending: true });

      visionDimensionGaps = (gaps || []).map(g => ({
        dimensionKey: g.dimension_key,
        dimensionLabel: g.dimension_label,
        currentScore: g.current_score,
        targetScore: g.target_score,
        gapSeverity: g.gap_severity,
        correctiveSdKey: g.corrective_sd_key,
      }));
    }

    // 6. Assemble payload
    return {
      success: true,
      data: {
        decisionId: decision.id,
        ventureId: decision.venture_id,
        lifecycleStage: decision.lifecycle_stage,
        status: decision.status,
        recommendation: dfeContext.recommendation,
        autoProceeded: dfeContext.auto_proceed,
        evaluatedAt: dfeContext.evaluated_at || decision.created_at,

        triggers: normalizedTriggers,
        triggerCount: normalizedTriggers.length,
        highSeverityCount: normalizedTriggers.filter(t => t.severity === 'HIGH').length,

        mitigationActions: decision.mitigation_actions || [],

        historicalPatterns,
        patternCount: historicalPatterns.length,

        visionDimensionGaps,

        recentEvents: (events || []).map(e => ({
          eventId: e.event_id,
          eventType: e.event_type,
          data: e.event_data,
          chairmanFlagged: e.chairman_flagged,
          createdAt: e.created_at,
        })),
      },
    };
  }

  /**
   * Record a mitigation action (accept/reject) for a specific trigger.
   * Idempotent per (decisionId, mitigationId, action, idempotencyKey).
   *
   * @param {object} params
   * @param {string} params.decisionId
   * @param {string} params.mitigationId - Trigger type or unique mitigation identifier
   * @param {'accept'|'reject'} params.action
   * @param {string} [params.reason]
   * @param {string} [params.idempotencyKey]
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async recordMitigationAction({ decisionId, mitigationId, action, reason, idempotencyKey }) {
    if (!decisionId || !mitigationId || !action) {
      return { success: false, error: 'decisionId, mitigationId, and action are required' };
    }

    if (!['accept', 'reject'].includes(action)) {
      return { success: false, error: 'action must be "accept" or "reject"' };
    }

    // Fetch current mitigation_actions
    const { data: decision, error: fetchError } = await this.supabase
      .from('chairman_decisions')
      .select('mitigation_actions')
      .eq('id', decisionId)
      .single();

    if (fetchError || !decision) {
      return { success: false, error: `Decision not found: ${fetchError?.message || 'no data'}` };
    }

    const existing = decision.mitigation_actions || [];

    // Idempotency check
    if (idempotencyKey) {
      const duplicate = existing.find(a => a.idempotency_key === idempotencyKey);
      if (duplicate) {
        return { success: true }; // Already recorded
      }
    }

    // Append new action
    const newAction = {
      mitigation_id: mitigationId,
      action,
      reason: reason || null,
      acted_at: new Date().toISOString(),
      idempotency_key: idempotencyKey || null,
    };

    const { error: updateError } = await this.supabase
      .from('chairman_decisions')
      .update({ mitigation_actions: [...existing, newAction] })
      .eq('id', decisionId);

    if (updateError) {
      return { success: false, error: `Failed to record action: ${updateError.message}` };
    }

    return { success: true };
  }
}

/**
 * Create a DfeEscalationService with default configuration
 */
export function createDfeEscalationService(options = {}) {
  return new DfeEscalationService(options);
}

export default DfeEscalationService;
