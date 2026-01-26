/**
 * HandoffRepository - Handoff-specific database access layer
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Manages handoff templates, executions, and artifacts.
 */

export class HandoffRepository {
  constructor(supabase) {
    if (!supabase) {
      throw new Error('HandoffRepository requires a Supabase client');
    }
    this.supabase = supabase;
    this.templateCache = new Map();
  }

  /**
   * Terminal handoff types that don't use the standard FROM-TO-TARGET template pattern.
   * These handoffs have their own executors and don't require database templates.
   */
  static TERMINAL_HANDOFFS = ['LEAD-FINAL-APPROVAL'];

  /**
   * Load handoff template from database
   * @param {string} handoffType - Handoff type (e.g., 'PLAN-TO-EXEC')
   * @returns {Promise<object|null>} Template record or null
   */
  async loadTemplate(handoffType) {
    const cacheKey = `template:${handoffType}`;
    if (this.templateCache.has(cacheKey)) {
      return this.templateCache.get(cacheKey);
    }

    // Terminal handoffs (e.g., LEAD-FINAL-APPROVAL) don't follow the FROM-TO-TARGET pattern
    // and have dedicated executors that don't require database templates
    if (HandoffRepository.TERMINAL_HANDOFFS.includes(handoffType)) {
      console.log(`📋 ${handoffType}: Terminal handoff - no template required`);
      this.templateCache.set(cacheKey, null);
      return null;
    }

    const [fromAgent, , toAgent] = handoffType.split('-');

    const { data: templates, error } = await this.supabase
      .from('leo_handoff_templates')
      .select('*')
      .eq('from_agent', fromAgent)
      .eq('to_agent', toAgent)
      .eq('active', true)
      .order('version', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.warn(`⚠️  Template query error: ${handoffType} - ${error.message}`);
      return null;
    }

    if (!templates || templates.length === 0) {
      console.warn(`⚠️  No template found for: ${handoffType} (from=${fromAgent}, to=${toAgent})`);
      return null;
    }

    const template = templates[0];

    if (templates.length > 1) {
      console.log(`📋 Multiple templates found for ${handoffType}, using latest: ${template.handoff_type} (v${template.version || 1})`);
    } else {
      console.log(`📋 Template loaded: ${template.handoff_type} (v${template.version || 1})`);
    }

    this.templateCache.set(cacheKey, template);
    return template;
  }

  /**
   * List handoff executions with filters
   * @param {object} filters - Query filters
   * @returns {Promise<array>} Execution records
   */
  async listExecutions(filters = {}) {
    let query = this.supabase
      .from('leo_handoff_executions')
      .select('*')
      .order('initiated_at', { ascending: false });

    if (filters.sdId) {
      query = query.eq('sd_id', filters.sdId);
    }

    if (filters.handoffType) {
      query = query.eq('handoff_type', filters.handoffType);
    }

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Execution query error: ${error.message}`);
      return [];
    }

    return data || [];
  }

  /**
   * Get handoff system statistics
   * @returns {Promise<object|null>} Statistics object
   */
  async getStats() {
    const { data: executions, error } = await this.supabase
      .from('leo_handoff_executions')
      .select('handoff_type, status, validation_score');

    if (error || !executions) {
      return null;
    }

    const stats = {
      total: executions.length,
      successful: executions.filter(e => e.status === 'ACCEPTED').length,
      failed: executions.filter(e => e.status === 'REJECTED').length,
      averageScore: 0,
      byType: {}
    };

    if (stats.total > 0) {
      const scores = executions
        .filter(e => e.validation_score !== null)
        .map(e => e.validation_score);
      stats.averageScore = scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 0;
    }

    // Group by type
    for (const exec of executions) {
      if (!stats.byType[exec.handoff_type]) {
        stats.byType[exec.handoff_type] = {
          total: 0,
          successful: 0,
          scores: []
        };
      }
      const typeStats = stats.byType[exec.handoff_type];
      typeStats.total++;
      if (exec.status === 'ACCEPTED') {
        typeStats.successful++;
      }
      if (exec.validation_score !== null) {
        typeStats.scores.push(exec.validation_score);
      }
    }

    // Calculate averages per type
    for (const type of Object.keys(stats.byType)) {
      const typeStats = stats.byType[type];
      typeStats.averageScore = typeStats.scores.length > 0
        ? typeStats.scores.reduce((a, b) => a + b, 0) / typeStats.scores.length
        : 0;
      delete typeStats.scores; // Clean up
    }

    return stats;
  }

  /**
   * Query sub-agent execution results
   * @param {string} sdId - Strategic Directive ID
   * @param {string} phase - Phase filter (optional)
   * @returns {Promise<array>} Sub-agent results
   */
  async getSubAgentResults(sdId, phase = null) {
    let query = this.supabase
      .from('leo_sub_agent_executions')
      .select('*')
      .eq('sd_id', sdId)
      .order('started_at', { ascending: false });

    if (phase) {
      query = query.eq('phase', phase);
    }

    const { data, error } = await query;

    if (error) {
      console.warn(`Sub-agent query error: ${error.message}`);
      return [];
    }

    return data || [];
  }

  /**
   * Query RCA/CAPA records for SD
   * @param {string} sdId - Strategic Directive ID
   * @returns {Promise<array>} RCA records
   */
  async getRCARecords(sdId) {
    const { data, error } = await this.supabase
      .from('root_cause_analyses')
      .select('*')
      .eq('sd_id', sdId)
      .order('created_at', { ascending: false });

    if (error) {
      return [];
    }

    return data || [];
  }

  clearCache() {
    this.templateCache.clear();
  }
}

export default HandoffRepository;
