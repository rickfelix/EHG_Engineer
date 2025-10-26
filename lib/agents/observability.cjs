/**
 * C1.3: Agent Observability System
 *
 * Part of Phase 1, Week 2 - Agent Coordination & Monitoring
 * Tracks agent usage, performance, and effectiveness metrics
 *
 * Features:
 * - Agent invocation tracking
 * - Performance metrics (execution time, success/failure)
 * - Usage pattern analysis
 * - Database persistence (agent_performance_metrics table)
 * - Real-time and historical metrics
 *
 * Usage:
 *   const observability = new AgentObservability();
 *   await observability.initialize();
 *
 *   // Track agent invocation
 *   const tracker = observability.startTracking('VALIDATION');
 *   // ... agent execution ...
 *   await tracker.end({ success: true, data: {...} });
 *
 *   // Get metrics
 *   const metrics = await observability.getAgentMetrics('VALIDATION');
 *   const summary = await observability.getAllMetrics();
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

class AgentObservability {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
    this.activeTrackers = new Map(); // Track in-progress agent executions
    this.metricsCache = new Map(); // Cache for quick lookups
    this.initialized = false;
  }

  /**
   * Initialize observability system
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Verify database connection and table existence
      const { error } = await this.supabase
        .from('agent_performance_metrics')
        .select('id')
        .limit(1);

      if (error && !error.message.includes('0 rows')) {
        console.warn('⚠️  Agent performance metrics table not found. Run database migration first.');
      }

      this.initialized = true;
      console.log('✅ Agent Observability initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Agent Observability:', error.message);
      // Don't throw - allow graceful degradation
    }
  }

  /**
   * Start tracking an agent invocation
   * @param {string} agentCode - Agent code (e.g., 'VALIDATION', 'TESTING')
   * @param {Object} context - Additional context (optional)
   * @returns {Object} Tracker object with end() method
   */
  startTracking(agentCode, context = {}) {
    const trackerId = `${agentCode}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const tracker = {
      agentCode,
      trackerId,
      startTime: Date.now(),
      context,

      /**
       * End tracking and record metrics
       * @param {Object} result - Execution result
       * @returns {Promise<void>}
       */
      end: async (result = {}) => {
        const endTime = Date.now();
        const executionTime = endTime - tracker.startTime;

        const metrics = {
          agentCode: tracker.agentCode,
          executionTime,
          success: result.success !== false,
          error: result.error || null,
          context: { ...tracker.context, ...result.context },
          data: result.data || null,
          timestamp: new Date(tracker.startTime).toISOString(),
        };

        // Remove from active trackers
        this.activeTrackers.delete(trackerId);

        // Record to database (async, don't wait)
        this._recordMetrics(metrics).catch(err => {
          console.error('Failed to record agent metrics:', err.message);
        });

        return metrics;
      },
    };

    this.activeTrackers.set(trackerId, tracker);
    return tracker;
  }

  /**
   * Record metrics to database
   * @private
   * @param {Object} metrics - Metrics to record
   * @returns {Promise<void>}
   */
  async _recordMetrics(metrics) {
    if (!this.initialized) return;

    try {
      const today = new Date().toISOString().split('T')[0];

      // Check if today's record exists
      const { data: existing } = await this.supabase
        .from('agent_performance_metrics')
        .select('*')
        .eq('agent_code', metrics.agentCode)
        .eq('measurement_date', today)
        .eq('measurement_window', 'daily')
        .single();

      if (existing) {
        // Update existing record
        const totalExecutions = existing.total_executions + 1;
        const successfulExecutions = existing.successful_executions + (metrics.success ? 1 : 0);
        const failedExecutions = existing.failed_executions + (metrics.success ? 0 : 1);

        // Calculate new average execution time
        const totalTime = (existing.avg_execution_time * existing.total_executions) + metrics.executionTime;
        const avgExecutionTime = totalTime / totalExecutions;

        await this.supabase
          .from('agent_performance_metrics')
          .update({
            total_executions: totalExecutions,
            successful_executions: successfulExecutions,
            failed_executions: failedExecutions,
            avg_execution_time: avgExecutionTime,
            max_execution_time: Math.max(existing.max_execution_time, metrics.executionTime),
            times_selected: existing.times_selected + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        // Create new record
        await this.supabase
          .from('agent_performance_metrics')
          .insert({
            agent_code: metrics.agentCode,
            agent_version: '1.0.0',
            measurement_date: today,
            measurement_window: 'daily',
            total_executions: 1,
            successful_executions: metrics.success ? 1 : 0,
            failed_executions: metrics.success ? 0 : 1,
            avg_execution_time: metrics.executionTime,
            max_execution_time: metrics.executionTime,
            times_selected: 1,
            avg_selection_confidence: 0.0,
          });
      }

      // Invalidate cache for this agent
      this.metricsCache.delete(metrics.agentCode);
    } catch (error) {
      console.error('Error recording metrics:', error.message);
    }
  }

  /**
   * Get metrics for specific agent
   * @param {string} agentCode - Agent code
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Agent metrics
   */
  async getAgentMetrics(agentCode, options = {}) {
    if (!this.initialized) {
      return this._getEmptyMetrics(agentCode);
    }

    try {
      const {
        window = 'daily',
        limit = 30,
        startDate = null,
        endDate = null,
      } = options;

      let query = this.supabase
        .from('agent_performance_metrics')
        .select('*')
        .eq('agent_code', agentCode)
        .eq('measurement_window', window)
        .order('measurement_date', { ascending: false })
        .limit(limit);

      if (startDate) {
        query = query.gte('measurement_date', startDate);
      }
      if (endDate) {
        query = query.lte('measurement_date', endDate);
      }

      const { data, error } = await query;

      if (error) throw error;

      return {
        agentCode,
        window,
        records: data || [],
        summary: this._calculateSummary(data || []),
      };
    } catch (error) {
      console.error('Error fetching agent metrics:', error.message);
      return this._getEmptyMetrics(agentCode);
    }
  }

  /**
   * Get metrics for all agents
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Metrics for all agents
   */
  async getAllMetrics(options = {}) {
    if (!this.initialized) {
      return [];
    }

    try {
      const { window = 'daily', limit = 7 } = options;

      const { data, error } = await this.supabase
        .from('agent_performance_metrics')
        .select('*')
        .eq('measurement_window', window)
        .gte('measurement_date', this._getDateDaysAgo(limit))
        .order('agent_code')
        .order('measurement_date', { ascending: false });

      if (error) throw error;

      // Group by agent code
      const grouped = {};
      (data || []).forEach(record => {
        if (!grouped[record.agent_code]) {
          grouped[record.agent_code] = [];
        }
        grouped[record.agent_code].push(record);
      });

      // Calculate summary for each agent
      return Object.entries(grouped).map(([agentCode, records]) => ({
        agentCode,
        window,
        recordCount: records.length,
        summary: this._calculateSummary(records),
        latestRecord: records[0],
      }));
    } catch (error) {
      console.error('Error fetching all metrics:', error.message);
      return [];
    }
  }

  /**
   * Get top performing agents
   * @param {number} limit - Number of agents to return
   * @returns {Promise<Array>} Top agents by success rate
   */
  async getTopAgents(limit = 10) {
    const allMetrics = await this.getAllMetrics();

    return allMetrics
      .filter(m => m.summary.totalExecutions > 0)
      .sort((a, b) => {
        // Sort by success rate, then by total executions
        const successDiff = b.summary.successRate - a.summary.successRate;
        if (Math.abs(successDiff) > 0.01) return successDiff;
        return b.summary.totalExecutions - a.summary.totalExecutions;
      })
      .slice(0, limit);
  }

  /**
   * Get agents with most activity
   * @param {number} limit - Number of agents to return
   * @returns {Promise<Array>} Most active agents
   */
  async getMostActiveAgents(limit = 10) {
    const allMetrics = await this.getAllMetrics();

    return allMetrics
      .sort((a, b) => b.summary.totalExecutions - a.summary.totalExecutions)
      .slice(0, limit);
  }

  /**
   * Get current active trackers (agents currently executing)
   * @returns {Array} Active tracker information
   */
  getActiveTrackers() {
    return Array.from(this.activeTrackers.values()).map(tracker => ({
      agentCode: tracker.agentCode,
      trackerId: tracker.trackerId,
      startTime: tracker.startTime,
      duration: Date.now() - tracker.startTime,
      context: tracker.context,
    }));
  }

  /**
   * Calculate summary statistics from records
   * @private
   * @param {Array} records - Performance records
   * @returns {Object} Summary statistics
   */
  _calculateSummary(records) {
    if (!records || records.length === 0) {
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        successRate: 0,
        avgExecutionTime: 0,
        maxExecutionTime: 0,
        firstSeen: null,
        lastSeen: null,
      };
    }

    const totalExecutions = records.reduce((sum, r) => sum + r.total_executions, 0);
    const successfulExecutions = records.reduce((sum, r) => sum + r.successful_executions, 0);
    const failedExecutions = records.reduce((sum, r) => sum + r.failed_executions, 0);

    // Weighted average of execution times
    const totalTime = records.reduce((sum, r) => sum + (r.avg_execution_time * r.total_executions), 0);
    const avgExecutionTime = totalExecutions > 0 ? totalTime / totalExecutions : 0;

    const maxExecutionTime = Math.max(...records.map(r => r.max_execution_time || 0));

    return {
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      successRate: totalExecutions > 0 ? successfulExecutions / totalExecutions : 0,
      avgExecutionTime: Math.round(avgExecutionTime),
      maxExecutionTime,
      firstSeen: records[records.length - 1]?.measurement_date,
      lastSeen: records[0]?.measurement_date,
    };
  }

  /**
   * Get empty metrics structure
   * @private
   * @param {string} agentCode - Agent code
   * @returns {Object} Empty metrics
   */
  _getEmptyMetrics(agentCode) {
    return {
      agentCode,
      window: 'daily',
      records: [],
      summary: this._calculateSummary([]),
    };
  }

  /**
   * Get date N days ago in YYYY-MM-DD format
   * @private
   * @param {number} days - Days ago
   * @returns {string} Date string
   */
  _getDateDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }

  /**
   * Clear metrics cache
   */
  clearCache() {
    this.metricsCache.clear();
  }
}

module.exports = { AgentObservability };
