/**
 * SovereignAlert - Push notification service for critical system events
 * Industrial Hardening v3.0: The "EVA Scream" - Active nervous system
 *
 * Supports:
 * - Discord webhook integration
 * - Database logging (system_events table)
 * - Email via Resend (when configured)
 *
 * Severity levels:
 * - INFO: Routine notifications
 * - WARNING: Attention needed (e.g., budget < 20%)
 * - CRITICAL: Immediate action required
 * - EMERGENCY: Calibration delta < 0.5, security breach
 */

import { createClient } from '@supabase/supabase-js';

// Get Supabase client singleton
let _supabaseClient = null;
function getSupabaseClient() {
  if (!_supabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
      _supabaseClient = createClient(supabaseUrl, supabaseKey);
    }
  }
  return _supabaseClient;
}

/**
 * Severity levels for alerts
 */
export const SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
  EMERGENCY: 'emergency'
};

/**
 * Alert types for categorization
 */
export const ALERT_TYPE = {
  CALIBRATION_EMERGENCY: 'CALIBRATION_EMERGENCY',
  BUDGET_WARNING: 'BUDGET_WARNING',
  BUDGET_EXHAUSTED: 'BUDGET_EXHAUSTED',
  BUDGET_CONFIGURATION_ERROR: 'BUDGET_CONFIGURATION_ERROR',
  CIRCUIT_BREAKER_TRIGGERED: 'CIRCUIT_BREAKER_TRIGGERED',
  SECURITY_VIOLATION: 'SECURITY_VIOLATION',
  VALIDATION_FAILURE: 'VALIDATION_FAILURE',
  STAGE_BLOCKED: 'STAGE_BLOCKED',
  SYSTEM_ERROR: 'SYSTEM_ERROR'
};

/**
 * Discord embed colors by severity
 */
const DISCORD_COLORS = {
  [SEVERITY.INFO]: 0x3498DB,      // Blue
  [SEVERITY.WARNING]: 0xF39C12,   // Orange
  [SEVERITY.CRITICAL]: 0xE74C3C,  // Red
  [SEVERITY.EMERGENCY]: 0xFF0000  // Bright Red
};

/**
 * SovereignAlert class - Static methods for firing alerts
 */
export class SovereignAlert {
  /**
   * Fire an alert to all configured channels
   * @param {Object} event - Alert event
   * @param {string} event.type - Alert type (from ALERT_TYPE)
   * @param {string} event.severity - Severity level (from SEVERITY)
   * @param {string} [event.venture_id] - Venture ID (if applicable)
   * @param {string} event.message - Human-readable message
   * @param {number} [event.delta] - Calibration delta (if applicable)
   * @param {Object} [event.details] - Additional details
   */
  static async fire(event) {
    const {
      type,
      severity,
      venture_id = null,
      message,
      delta = null,
      details = {}
    } = event;

    const timestamp = new Date().toISOString();
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 1. Always log to database
    await SovereignAlert.logToDatabase({
      alertId,
      type,
      severity,
      venture_id,
      message,
      delta,
      details,
      timestamp
    });

    // 2. Push to Discord for CRITICAL and EMERGENCY
    if (severity === SEVERITY.CRITICAL || severity === SEVERITY.EMERGENCY) {
      await SovereignAlert.pushToDiscord({
        alertId,
        type,
        severity,
        venture_id,
        message,
        delta,
        details,
        timestamp
      });
    }

    // 3. Send email for EMERGENCY (when configured)
    if (severity === SEVERITY.EMERGENCY) {
      await SovereignAlert.sendEmail({
        alertId,
        type,
        severity,
        venture_id,
        message,
        delta,
        details,
        timestamp
      });
    }

    // Log to console for visibility
    console.log(`[SOVEREIGN ALERT] ${severity.toUpperCase()}: ${type} - ${message}`);

    return { alertId, dispatched: true };
  }

  /**
   * Log alert to database (system_events table)
   */
  static async logToDatabase(alert) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn('[SOVEREIGN ALERT] Database unavailable - alert not persisted');
      return;
    }

    try {
      await supabase.from('system_events').insert({
        event_type: `SOVEREIGN_ALERT_${alert.type}`,
        event_source: 'sovereign-alert-service',
        severity: alert.severity,
        details: {
          alert_id: alert.alertId,
          type: alert.type,
          venture_id: alert.venture_id,
          message: alert.message,
          delta: alert.delta,
          ...alert.details,
          timestamp: alert.timestamp
        }
      });
    } catch (err) {
      console.error(`[SOVEREIGN ALERT] Database log failed: ${err.message}`);
    }
  }

  /**
   * Push alert to Discord webhook
   */
  static async pushToDiscord(alert) {
    const webhookUrl = process.env.DISCORD_ALERT_WEBHOOK;
    if (!webhookUrl) {
      console.warn('[SOVEREIGN ALERT] Discord webhook not configured - skipping push');
      return;
    }

    const color = DISCORD_COLORS[alert.severity] || DISCORD_COLORS[SEVERITY.INFO];
    const emoji = alert.severity === SEVERITY.EMERGENCY ? ':rotating_light:' : ':warning:';

    const embed = {
      title: `${emoji} ${alert.severity.toUpperCase()}: ${alert.type}`,
      description: alert.message,
      color,
      fields: [
        {
          name: 'Venture',
          value: alert.venture_id || 'System-Wide',
          inline: true
        }
      ],
      footer: {
        text: `Alert ID: ${alert.alertId}`
      },
      timestamp: alert.timestamp
    };

    // Add delta field if present
    if (alert.delta !== null) {
      embed.fields.push({
        name: 'Calibration Delta',
        value: alert.delta.toFixed(3),
        inline: true
      });
    }

    // Add severity field
    embed.fields.push({
      name: 'Severity',
      value: alert.severity.toUpperCase(),
      inline: true
    });

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'EVA Sovereign Alert',
          avatar_url: 'https://i.imgur.com/AfFp7pu.png', // Placeholder
          embeds: [embed]
        })
      });

      if (!response.ok) {
        console.error(`[SOVEREIGN ALERT] Discord push failed: ${response.status}`);
      }
    } catch (err) {
      console.error(`[SOVEREIGN ALERT] Discord push error: ${err.message}`);
    }
  }

  /**
   * Send email alert via Resend (when configured)
   */
  static async sendEmail(alert) {
    const resendApiKey = process.env.RESEND_API_KEY;
    const alertEmail = process.env.SOVEREIGN_ALERT_EMAIL;

    if (!resendApiKey || !alertEmail) {
      console.warn('[SOVEREIGN ALERT] Email not configured - skipping email');
      return;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'EVA Alerts <alerts@ehg.ai>',
          to: [alertEmail],
          subject: `[EMERGENCY] ${alert.type}: ${alert.message.slice(0, 50)}...`,
          html: `
            <h1 style="color: #FF0000;">SOVEREIGN ALERT - ${alert.severity.toUpperCase()}</h1>
            <h2>${alert.type}</h2>
            <p><strong>Message:</strong> ${alert.message}</p>
            <p><strong>Venture:</strong> ${alert.venture_id || 'System-Wide'}</p>
            ${alert.delta !== null ? `<p><strong>Calibration Delta:</strong> ${alert.delta.toFixed(3)}</p>` : ''}
            <p><strong>Timestamp:</strong> ${alert.timestamp}</p>
            <p><strong>Alert ID:</strong> ${alert.alertId}</p>
            <hr>
            <p style="color: #666;">This is an automated alert from the EHG Sovereign Alert System.</p>
          `
        })
      });

      if (!response.ok) {
        console.error(`[SOVEREIGN ALERT] Email send failed: ${response.status}`);
      }
    } catch (err) {
      console.error(`[SOVEREIGN ALERT] Email send error: ${err.message}`);
    }
  }

  /**
   * Convenience method: Fire calibration emergency
   */
  static async fireCalibrationEmergency(ventureId, delta, additionalContext = {}) {
    return SovereignAlert.fire({
      type: ALERT_TYPE.CALIBRATION_EMERGENCY,
      severity: SEVERITY.EMERGENCY,
      venture_id: ventureId,
      delta,
      message: `Calibration emergency: delta=${delta.toFixed(3)} (threshold: 0.5)`,
      details: additionalContext
    });
  }

  /**
   * Convenience method: Fire budget warning
   */
  static async fireBudgetWarning(ventureId, budgetRemaining, budgetAllocated) {
    const percentRemaining = ((budgetRemaining / budgetAllocated) * 100).toFixed(1);
    return SovereignAlert.fire({
      type: ALERT_TYPE.BUDGET_WARNING,
      severity: SEVERITY.WARNING,
      venture_id: ventureId,
      message: `Budget low: ${budgetRemaining}/${budgetAllocated} tokens (${percentRemaining}% remaining)`,
      details: {
        budget_remaining: budgetRemaining,
        budget_allocated: budgetAllocated,
        percent_remaining: parseFloat(percentRemaining)
      }
    });
  }

  /**
   * Convenience method: Fire budget exhausted
   */
  static async fireBudgetExhausted(ventureId, agentId) {
    return SovereignAlert.fire({
      type: ALERT_TYPE.BUDGET_EXHAUSTED,
      severity: SEVERITY.CRITICAL,
      venture_id: ventureId,
      message: `Budget exhausted for agent ${agentId}. All operations halted.`,
      details: { agent_id: agentId }
    });
  }

  /**
   * Convenience method: Fire security violation
   */
  static async fireSecurityViolation(ventureId, violationType, path) {
    return SovereignAlert.fire({
      type: ALERT_TYPE.SECURITY_VIOLATION,
      severity: SEVERITY.EMERGENCY,
      venture_id: ventureId,
      message: `Security violation detected: ${violationType}`,
      details: {
        violation_type: violationType,
        path: path
      }
    });
  }

  /**
   * Convenience method: Fire circuit breaker
   */
  static async fireCircuitBreaker(ventureId, agentId, reason, iterationCount) {
    return SovereignAlert.fire({
      type: ALERT_TYPE.CIRCUIT_BREAKER_TRIGGERED,
      severity: SEVERITY.CRITICAL,
      venture_id: ventureId,
      message: `Circuit breaker triggered: ${reason} after ${iterationCount} iterations`,
      details: {
        agent_id: agentId,
        reason,
        iteration_count: iterationCount
      }
    });
  }
}

export default SovereignAlert;
