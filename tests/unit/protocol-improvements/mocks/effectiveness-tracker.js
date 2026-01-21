/**
 * MOCK: EffectivenessTracker
 *
 * Real implementation would be in:
 * lib/protocol-improvements/effectiveness-tracker.js
 *
 * Responsibilities:
 * - Track if issue stops appearing after improvement applied
 * - Calculate effectiveness score based on before/after metrics
 * - Handle improvements with no subsequent data
 */
export class EffectivenessTracker {
  constructor(supabase) {
    this.supabase = supabase;
  }

  /**
   * Calculate effectiveness when issue stops appearing
   * @param {string} improvementId - Improvement ID
   * @returns {Promise<object>} - { effectiveness: number, reason: string }
   */
  async calculateEffectivenessSuccess(improvementId) {
    const { data: improvement } = await this.supabase
      .from('protocol_improvement_queue')
      .select('*')
      .eq('id', improvementId)
      .single();

    if (!improvement || !improvement.applied_at) {
      return {
        effectiveness: 0,
        reason: 'Improvement not yet applied'
      };
    }

    // Check if related pattern still appears after improvement
    const occurrencesAfter = await this._countPatternOccurrencesAfter(
      improvement.pattern_id,
      improvement.applied_at
    );

    if (occurrencesAfter === 0) {
      return {
        effectiveness: 100,
        reason: 'Issue completely resolved - no occurrences after improvement applied'
      };
    }

    // Partial improvement
    const occurrencesBefore = await this._countPatternOccurrencesBefore(
      improvement.pattern_id,
      improvement.applied_at
    );

    const reduction = ((occurrencesBefore - occurrencesAfter) / occurrencesBefore) * 100;

    return {
      effectiveness: Math.max(0, Math.round(reduction)),
      reason: `Reduced occurrences from ${occurrencesBefore} to ${occurrencesAfter}`
    };
  }

  /**
   * Calculate low effectiveness when issue continues
   * @param {string} improvementId - Improvement ID
   * @returns {Promise<object>} - { effectiveness: number, reason: string }
   */
  async calculateEffectivenessFailure(improvementId) {
    const { data: improvement } = await this.supabase
      .from('protocol_improvement_queue')
      .select('*')
      .eq('id', improvementId)
      .single();

    if (!improvement || !improvement.applied_at) {
      return {
        effectiveness: 0,
        reason: 'Improvement not yet applied'
      };
    }

    const occurrencesAfter = await this._countPatternOccurrencesAfter(
      improvement.pattern_id,
      improvement.applied_at
    );

    const occurrencesBefore = await this._countPatternOccurrencesBefore(
      improvement.pattern_id,
      improvement.applied_at
    );

    if (occurrencesAfter >= occurrencesBefore) {
      return {
        effectiveness: 0,
        reason: `Issue still occurring at same or higher rate (${occurrencesBefore} → ${occurrencesAfter})`
      };
    }

    const reduction = ((occurrencesBefore - occurrencesAfter) / occurrencesBefore) * 100;

    return {
      effectiveness: Math.max(0, Math.round(reduction)),
      reason: `Partial improvement: reduced from ${occurrencesBefore} to ${occurrencesAfter} occurrences`
    };
  }

  /**
   * Handle improvements with no subsequent data
   * @param {string} improvementId - Improvement ID
   * @returns {Promise<object>} - { effectiveness: number, reason: string }
   */
  async calculateEffectivenessNoData(improvementId) {
    const { data: improvement } = await this.supabase
      .from('protocol_improvement_queue')
      .select('*')
      .eq('id', improvementId)
      .single();

    if (!improvement || !improvement.applied_at) {
      return {
        effectiveness: null,
        reason: 'Improvement not yet applied'
      };
    }

    // Check if enough time has passed to expect data
    const daysSinceApplied = this._daysSince(improvement.applied_at);

    if (daysSinceApplied < 7) {
      return {
        effectiveness: null,
        reason: 'Insufficient time elapsed - need at least 7 days of data'
      };
    }

    // No subsequent executions to measure against
    const executionsAfter = await this._countExecutionsAfter(improvement.applied_at);

    if (executionsAfter === 0) {
      return {
        effectiveness: null,
        reason: 'No executions after improvement applied - cannot measure effectiveness'
      };
    }

    // Has executions but pattern not seen
    return {
      effectiveness: 100,
      reason: `${executionsAfter} executions completed without issue recurring`
    };
  }

  // Helper methods
  async _countPatternOccurrencesAfter(patternId, date) {
    if (!patternId) return 0;

    const { count } = await this.supabase
      .from('retrospectives')
      .select('*', { count: 'exact', head: true })
      .contains('failure_patterns', [{ pattern_id: patternId }])
      .gte('conducted_date', date);

    return count || 0;
  }

  async _countPatternOccurrencesBefore(patternId, date) {
    if (!patternId) return 0;

    const { count } = await this.supabase
      .from('retrospectives')
      .select('*', { count: 'exact', head: true })
      .contains('failure_patterns', [{ pattern_id: patternId }])
      .lt('conducted_date', date);

    return count || 0;
  }

  async _countExecutionsAfter(date) {
    const { count } = await this.supabase
      .from('leo_handoff_executions')
      .select('*', { count: 'exact', head: true })
      .gte('initiated_at', date);

    return count || 0;
  }

  _daysSince(date) {
    const now = new Date();
    const then = new Date(date);
    return Math.floor((now - then) / (1000 * 60 * 60 * 24));
  }
}
