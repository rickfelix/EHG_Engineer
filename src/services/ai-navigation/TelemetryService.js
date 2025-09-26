/**
 * Telemetry Collection Service
 * SD-002: AI Navigation Consolidated
 *
 * Collects navigation events for analytics and ML model training
 */

class TelemetryService {
  constructor(supabase) {
    this.supabase = supabase;
    this.buffer = [];
    this.bufferSize = 50;
    this.flushInterval = 5000; // 5 seconds
    this.isEnabled = true;
    this.sessionId = this.generateSessionId();

    // Start automatic flushing
    this.startAutoFlush();
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Track navigation event
   */
  trackNavigation(from, to, metadata = {}) {
    if (!this.isEnabled) return;

    const event = {
      event_type: 'navigation',
      user_id: metadata.userId,
      session_id: this.sessionId,
      path: to,
      metadata: {
        from_path: from,
        to_path: to,
        ...metadata,
        timestamp: new Date().toISOString()
      },
      client_timestamp: new Date().toISOString()
    };

    this.addToBuffer(event);
  }

  /**
   * Track prediction event
   */
  trackPrediction(predictions, metadata = {}) {
    if (!this.isEnabled) return;

    const event = {
      event_type: 'prediction_generated',
      user_id: metadata.userId,
      session_id: this.sessionId,
      path: metadata.currentPath,
      metadata: {
        predictions_count: predictions.length,
        confidence: predictions[0]?.confidence || 0,
        response_time: metadata.responseTime,
        ...metadata,
        timestamp: new Date().toISOString()
      },
      client_timestamp: new Date().toISOString()
    };

    this.addToBuffer(event);
  }

  /**
   * Track prediction usage
   */
  trackPredictionUsed(prediction, metadata = {}) {
    if (!this.isEnabled) return;

    const event = {
      event_type: 'prediction_used',
      user_id: metadata.userId,
      session_id: this.sessionId,
      path: prediction.path,
      metadata: {
        prediction_confidence: prediction.confidence,
        prediction_rank: metadata.rank,
        ...metadata,
        timestamp: new Date().toISOString()
      },
      client_timestamp: new Date().toISOString()
    };

    this.addToBuffer(event);
  }

  /**
   * Track shortcut usage
   */
  trackShortcut(shortcut, metadata = {}) {
    if (!this.isEnabled) return;

    const event = {
      event_type: 'shortcut_used',
      user_id: metadata.userId,
      session_id: this.sessionId,
      path: shortcut.target_path,
      metadata: {
        shortcut_key: shortcut.key,
        shortcut_label: shortcut.label,
        ...metadata,
        timestamp: new Date().toISOString()
      },
      client_timestamp: new Date().toISOString()
    };

    this.addToBuffer(event);
  }

  /**
   * Track search event
   */
  trackSearch(query, results, metadata = {}) {
    if (!this.isEnabled) return;

    const event = {
      event_type: 'search',
      user_id: metadata.userId,
      session_id: this.sessionId,
      path: metadata.currentPath,
      metadata: {
        query,
        results_count: results.length,
        query_length: query.length,
        ...metadata,
        timestamp: new Date().toISOString()
      },
      client_timestamp: new Date().toISOString()
    };

    this.addToBuffer(event);
  }

  /**
   * Track performance metrics
   */
  trackPerformance(metric, value, metadata = {}) {
    if (!this.isEnabled) return;

    const event = {
      event_type: 'performance',
      user_id: metadata.userId,
      session_id: this.sessionId,
      path: metadata.currentPath,
      metadata: {
        metric_name: metric,
        metric_value: value,
        ...metadata,
        timestamp: new Date().toISOString()
      },
      client_timestamp: new Date().toISOString()
    };

    this.addToBuffer(event);
  }

  /**
   * Track error events
   */
  trackError(error, metadata = {}) {
    if (!this.isEnabled) return;

    const event = {
      event_type: 'error',
      user_id: metadata.userId,
      session_id: this.sessionId,
      path: metadata.currentPath,
      metadata: {
        error_message: error.message,
        error_stack: error.stack,
        error_type: error.name,
        ...metadata,
        timestamp: new Date().toISOString()
      },
      client_timestamp: new Date().toISOString()
    };

    this.addToBuffer(event);
  }

  /**
   * Add event to buffer
   */
  addToBuffer(event) {
    this.buffer.push(event);

    if (this.buffer.length >= this.bufferSize) {
      this.flush();
    }
  }

  /**
   * Flush buffer to database
   */
  async flush() {
    if (this.buffer.length === 0) return;

    const events = [...this.buffer];
    this.buffer = [];

    try {
      const { error } = await this.supabase
        .from('navigation_telemetry')
        .insert(events);

      if (error) {
        console.error('Telemetry flush error:', error);
        // Re-add failed events to buffer (with limit)
        if (this.buffer.length < this.bufferSize * 2) {
          this.buffer.unshift(...events);
        }
      }
    } catch (error) {
      console.error('Telemetry service error:', error);
    }
  }

  /**
   * Start automatic buffer flushing
   */
  startAutoFlush() {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  /**
   * Stop automatic flushing
   */
  stopAutoFlush() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Get session analytics
   */
  async getSessionAnalytics() {
    try {
      const { data, error } = await this.supabase
        .from('navigation_telemetry')
        .select('*')
        .eq('session_id', this.sessionId)
        .order('client_timestamp', { ascending: true });

      if (error) throw error;

      return this.processSessionData(data);
    } catch (error) {
      console.error('Failed to get session analytics:', error);
      return null;
    }
  }

  /**
   * Process session data for analytics
   */
  processSessionData(data) {
    if (!data || data.length === 0) return null;

    const analytics = {
      session_id: this.sessionId,
      event_count: data.length,
      navigation_count: 0,
      predictions_used: 0,
      shortcuts_used: 0,
      searches: 0,
      errors: 0,
      avg_response_time: 0,
      unique_paths: new Set(),
      duration: 0,
      events_timeline: []
    };

    let totalResponseTime = 0;
    let responseTimeCount = 0;

    data.forEach(event => {
      analytics.events_timeline.push({
        type: event.event_type,
        timestamp: event.client_timestamp
      });

      switch (event.event_type) {
        case 'navigation':
          analytics.navigation_count++;
          analytics.unique_paths.add(event.path);
          break;
        case 'prediction_used':
          analytics.predictions_used++;
          break;
        case 'shortcut_used':
          analytics.shortcuts_used++;
          break;
        case 'search':
          analytics.searches++;
          break;
        case 'error':
          analytics.errors++;
          break;
        case 'prediction_generated':
          if (event.metadata?.response_time) {
            totalResponseTime += event.metadata.response_time;
            responseTimeCount++;
          }
          break;
      }
    });

    // Calculate session duration
    if (data.length > 0) {
      const firstEvent = new Date(data[0].client_timestamp);
      const lastEvent = new Date(data[data.length - 1].client_timestamp);
      analytics.duration = (lastEvent - firstEvent) / 1000; // seconds
    }

    // Calculate average response time
    if (responseTimeCount > 0) {
      analytics.avg_response_time = Math.round(totalResponseTime / responseTimeCount);
    }

    analytics.unique_paths = Array.from(analytics.unique_paths);

    return analytics;
  }

  /**
   * Get aggregated metrics for dashboard
   */
  async getAggregatedMetrics(userId, days = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await this.supabase
        .from('navigation_telemetry')
        .select('*')
        .eq('user_id', userId)
        .gte('client_timestamp', startDate.toISOString())
        .order('client_timestamp', { ascending: false });

      if (error) throw error;

      return this.calculateMetrics(data);
    } catch (error) {
      console.error('Failed to get aggregated metrics:', error);
      return null;
    }
  }

  /**
   * Calculate metrics from telemetry data
   */
  calculateMetrics(data) {
    const metrics = {
      total_navigations: 0,
      unique_paths: new Set(),
      predictions_used: 0,
      prediction_accuracy: 0,
      avg_response_time: 0,
      shortcuts_used: 0,
      searches: 0,
      errors: 0,
      daily_activity: {},
      hourly_pattern: Array(24).fill(0),
      top_paths: {},
      navigation_flow: []
    };

    let totalResponseTime = 0;
    let responseTimeCount = 0;
    let correctPredictions = 0;
    let totalPredictions = 0;

    data.forEach(event => {
      const date = new Date(event.client_timestamp);
      const day = date.toISOString().split('T')[0];
      const hour = date.getHours();

      // Daily activity
      metrics.daily_activity[day] = (metrics.daily_activity[day] || 0) + 1;

      // Hourly pattern
      metrics.hourly_pattern[hour]++;

      // Process by event type
      switch (event.event_type) {
        case 'navigation':
          metrics.total_navigations++;
          metrics.unique_paths.add(event.path);
          metrics.top_paths[event.path] = (metrics.top_paths[event.path] || 0) + 1;
          break;

        case 'prediction_used':
          metrics.predictions_used++;
          correctPredictions++;
          break;

        case 'prediction_generated':
          totalPredictions++;
          if (event.metadata?.response_time) {
            totalResponseTime += event.metadata.response_time;
            responseTimeCount++;
          }
          break;

        case 'shortcut_used':
          metrics.shortcuts_used++;
          break;

        case 'search':
          metrics.searches++;
          break;

        case 'error':
          metrics.errors++;
          break;
      }
    });

    // Calculate averages
    metrics.unique_paths = metrics.unique_paths.size;

    if (responseTimeCount > 0) {
      metrics.avg_response_time = Math.round(totalResponseTime / responseTimeCount);
    }

    if (totalPredictions > 0) {
      metrics.prediction_accuracy = Math.round((correctPredictions / totalPredictions) * 100);
    }

    // Get top 10 paths
    metrics.top_paths = Object.entries(metrics.top_paths)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .reduce((acc, [path, count]) => {
        acc[path] = count;
        return acc;
      }, {});

    return metrics;
  }

  /**
   * Export telemetry data
   */
  async exportData(format = 'json', filters = {}) {
    try {
      let query = this.supabase
        .from('navigation_telemetry')
        .select('*');

      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }

      if (filters.startDate) {
        query = query.gte('client_timestamp', filters.startDate);
      }

      if (filters.endDate) {
        query = query.lte('client_timestamp', filters.endDate);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (format === 'csv') {
        return this.convertToCSV(data);
      }

      return data;
    } catch (error) {
      console.error('Failed to export telemetry data:', error);
      return null;
    }
  }

  /**
   * Convert data to CSV format
   */
  convertToCSV(data) {
    if (!data || data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => headers.map(header => {
        const value = row[header];
        return typeof value === 'object' ? JSON.stringify(value) : value;
      }).join(','))
    ].join('\n');

    return csv;
  }

  /**
   * Enable/disable telemetry
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (!enabled) {
      this.flush(); // Flush any remaining events
      this.stopAutoFlush();
    } else {
      this.startAutoFlush();
    }
  }

  /**
   * Cleanup on destroy
   */
  destroy() {
    this.flush();
    this.stopAutoFlush();
  }
}

export default TelemetryService;