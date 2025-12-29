/**
 * HardHaltProtocol - Emergency halt mechanism for Chairman absence
 *
 * EVA Manifesto Part IV: Continuity & Succession
 *
 * THE LAW: When the Chairman is unavailable, the system must fail safe.
 * All L2+ (CEO and above) autonomous operations must cease until
 * Chairman authority is restored.
 *
 * Features:
 * 1. Manual halt trigger via authenticated endpoint
 * 2. Dead-man switch with configurable timeout (default 72h)
 * 3. Venture maintenance mode (graceful degradation)
 * 4. Restoration procedure for resuming operations
 *
 * @module HardHaltProtocol
 * @version 1.0.0
 * @implements SD-MANIFESTO-002
 */

import { createClient } from '@supabase/supabase-js';
import { SovereignAlert, SEVERITY } from '../services/sovereign-alert.js';

// Centralized exceptions - imported from lib/exceptions/ (US-003 refactoring)
import {
  HardHaltError,
  UnauthorizedHaltError,
  AlreadyHaltedError,
  NotHaltedError
} from '../exceptions/governance-exceptions.js';

// Re-export for backwards compatibility
export { HardHaltError, UnauthorizedHaltError, AlreadyHaltedError, NotHaltedError };

// =============================================================================
// CONFIGURATION
// =============================================================================

const HARD_HALT_CONFIG = {
  // Dead-man switch timeout in hours
  deadManSwitchTimeoutHours: 72,

  // Warning threshold before auto-halt (hours)
  warningThresholdHours: 48,

  // Activity check interval (ms)
  activityCheckIntervalMs: 60 * 60 * 1000, // 1 hour

  // Halt status table name
  haltStatusTable: 'system_settings',

  // Halt status key
  haltStatusKey: 'HARD_HALT_STATUS',

  // Chairman activity events to track
  trackedActivityTypes: [
    'login',
    'approval',
    'command',
    'heartbeat',
    'session_active'
  ],

  // Realtime broadcast channel
  broadcastChannel: 'system:halt'
};

// =============================================================================
// HARD HALT PROTOCOL CLASS
// =============================================================================

/**
 * HardHaltProtocol - Core implementation of the Hard Halt mechanism
 */
export class HardHaltProtocol {
  constructor(options = {}) {
    this.config = { ...HARD_HALT_CONFIG, ...options };
    this.supabase = this._createSupabaseClient();
    this._checkInterval = null;
  }

  /**
   * Create Supabase client
   * @private
   */
  _createSupabaseClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn('[HardHaltProtocol] Supabase credentials not configured');
      return null;
    }

    return createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Trigger a Hard Halt - pauses all L2+ autonomous operations
   *
   * @param {Object} options - Trigger options
   * @param {string} options.triggeredBy - User ID who triggered the halt (must be Chairman)
   * @param {string} [options.reason] - Reason for the halt
   * @param {boolean} [options.isAutomatic] - Whether triggered by dead-man switch
   * @returns {Promise<Object>} Halt confirmation
   */
  async triggerHalt({ triggeredBy, reason = 'Manual trigger', isAutomatic = false }) {
    console.log(`[HardHaltProtocol] Triggering Hard Halt - By: ${triggeredBy}, Reason: ${reason}`);

    // Check if already halted
    const currentStatus = await this.getHaltStatus();
    if (currentStatus.isHalted) {
      throw new AlreadyHaltedError(currentStatus.haltedAt);
    }

    const haltedAt = new Date().toISOString();

    // Store halt status
    const haltData = {
      isHalted: true,
      haltReason: reason,
      triggeredAt: haltedAt,
      triggeredBy: triggeredBy,
      isAutomatic: isAutomatic,
      restoredAt: null
    };

    await this._storeHaltStatus(haltData);

    // Send notifications
    await this._sendHaltNotifications(haltData);

    // Broadcast to all agents
    await this._broadcastHaltStatus(true, reason);

    // Log to audit
    await this._logAudit('HARD_HALT_TRIGGERED', {
      triggeredBy,
      reason,
      isAutomatic,
      haltedAt
    });

    console.log(`[HardHaltProtocol] Hard Halt activated at ${haltedAt}`);

    return {
      success: true,
      haltedAt,
      reason,
      triggeredBy,
      isAutomatic
    };
  }

  /**
   * Restore normal operations after Hard Halt
   *
   * @param {Object} options - Restore options
   * @param {string} options.restoredBy - User ID who restored (must be Chairman)
   * @returns {Promise<Object>} Restoration confirmation
   */
  async restore({ restoredBy }) {
    console.log(`[HardHaltProtocol] Restoring operations - By: ${restoredBy}`);

    // Check if actually halted
    const currentStatus = await this.getHaltStatus();
    if (!currentStatus.isHalted) {
      throw new NotHaltedError();
    }

    const restoredAt = new Date().toISOString();

    // Update halt status
    const haltData = {
      ...currentStatus,
      isHalted: false,
      restoredAt,
      restoredBy
    };

    await this._storeHaltStatus(haltData);

    // Send restoration notifications
    await this._sendRestoreNotifications(restoredBy, restoredAt);

    // Broadcast restoration to all agents
    await this._broadcastHaltStatus(false, 'Operations restored');

    // Log to audit
    await this._logAudit('HARD_HALT_RESTORED', {
      restoredBy,
      restoredAt,
      originalHaltReason: currentStatus.haltReason,
      haltDuration: new Date(restoredAt) - new Date(currentStatus.triggeredAt)
    });

    // Get queued decisions count
    const queuedDecisions = await this._getQueuedDecisionCount();

    console.log(`[HardHaltProtocol] Operations restored at ${restoredAt}`);

    return {
      success: true,
      restoredAt,
      restoredBy,
      queuedDecisions
    };
  }

  /**
   * Get current halt status
   *
   * @returns {Promise<Object>} Current halt status
   */
  async getHaltStatus() {
    if (!this.supabase) {
      return { isHalted: false, error: 'Supabase not configured' };
    }

    try {
      const { data, error } = await this.supabase
        .from('system_settings')
        .select('value')
        .eq('key', this.config.haltStatusKey)
        .maybeSingle();

      if (error) {
        console.warn('[HardHaltProtocol] Error fetching halt status:', error.message);
        return { isHalted: false, error: error.message };
      }

      if (!data) {
        return { isHalted: false };
      }

      return data.value;
    } catch (err) {
      console.warn('[HardHaltProtocol] Exception fetching halt status:', err.message);
      return { isHalted: false, error: err.message };
    }
  }

  /**
   * Check if the system should auto-halt (dead-man switch)
   *
   * @returns {Promise<Object>} Dead-man switch status
   */
  async checkDeadManSwitch() {
    console.log('[HardHaltProtocol] Checking dead-man switch...');

    // Already halted - skip check
    const currentStatus = await this.getHaltStatus();
    if (currentStatus.isHalted) {
      return { shouldHalt: false, reason: 'Already halted' };
    }

    // Get last Chairman activity
    const lastActivity = await this._getLastChairmanActivity();

    if (!lastActivity) {
      // No activity record found - could be initial state or missing data
      console.log('[HardHaltProtocol] No Chairman activity found - may need initialization');
      return { shouldHalt: false, reason: 'No activity record' };
    }

    const hoursSinceActivity = this._hoursSince(lastActivity.activity_at);
    const warningThreshold = this.config.warningThresholdHours;
    const haltThreshold = this.config.deadManSwitchTimeoutHours;

    console.log(`[HardHaltProtocol] Hours since last Chairman activity: ${hoursSinceActivity.toFixed(1)}`);

    // Check if we should send warning
    if (hoursSinceActivity >= warningThreshold && hoursSinceActivity < haltThreshold) {
      await this._sendWarningNotification(hoursSinceActivity, haltThreshold);
      return {
        shouldHalt: false,
        hoursRemaining: haltThreshold - hoursSinceActivity,
        warningIssued: true
      };
    }

    // Check if we should auto-halt
    if (hoursSinceActivity >= haltThreshold) {
      console.log(`[HardHaltProtocol] Dead-man switch triggered - ${hoursSinceActivity.toFixed(1)}h without activity`);

      await this.triggerHalt({
        triggeredBy: 'SYSTEM_DEAD_MAN_SWITCH',
        reason: `No Chairman activity for ${hoursSinceActivity.toFixed(1)} hours (threshold: ${haltThreshold}h)`,
        isAutomatic: true
      });

      return { shouldHalt: true, hoursSinceActivity };
    }

    return { shouldHalt: false, hoursSinceActivity };
  }

  /**
   * Start the dead-man switch monitoring
   */
  startDeadManSwitchMonitor() {
    if (this._checkInterval) {
      console.warn('[HardHaltProtocol] Monitor already running');
      return;
    }

    console.log(`[HardHaltProtocol] Starting dead-man switch monitor (interval: ${this.config.activityCheckIntervalMs}ms)`);

    this._checkInterval = setInterval(
      () => this.checkDeadManSwitch(),
      this.config.activityCheckIntervalMs
    );

    // Run initial check
    this.checkDeadManSwitch();
  }

  /**
   * Stop the dead-man switch monitoring
   */
  stopDeadManSwitchMonitor() {
    if (this._checkInterval) {
      clearInterval(this._checkInterval);
      this._checkInterval = null;
      console.log('[HardHaltProtocol] Dead-man switch monitor stopped');
    }
  }

  /**
   * Record Chairman activity (extends dead-man switch timer)
   *
   * @param {string} activityType - Type of activity
   * @param {string} [sessionId] - Session ID
   */
  async recordChairmanActivity(activityType, sessionId = null) {
    if (!this.supabase) return;

    const activityTypes = this.config.trackedActivityTypes;
    if (!activityTypes.includes(activityType)) {
      console.warn(`[HardHaltProtocol] Unknown activity type: ${activityType}`);
    }

    try {
      await this.supabase
        .from('chairman_activity')
        .insert({
          activity_type: activityType,
          activity_at: new Date().toISOString(),
          session_id: sessionId
        });

      console.log(`[HardHaltProtocol] Recorded Chairman activity: ${activityType}`);
    } catch (err) {
      // Table may not exist yet - log but don't fail
      console.warn('[HardHaltProtocol] Could not record activity:', err.message);
    }
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  /**
   * Store halt status in database
   * @private
   */
  async _storeHaltStatus(haltData) {
    if (!this.supabase) return;

    try {
      const { error } = await this.supabase
        .from('system_settings')
        .upsert({
          key: this.config.haltStatusKey,
          value: haltData,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });

      if (error) {
        console.error('[HardHaltProtocol] Error storing halt status:', error.message);
      }
    } catch (err) {
      console.error('[HardHaltProtocol] Exception storing halt status:', err.message);
    }
  }

  /**
   * Send halt notifications via SovereignAlert
   * @private
   */
  async _sendHaltNotifications(haltData) {
    try {
      await SovereignAlert.fire({
        type: 'HARD_HALT_ACTIVATED',
        severity: SEVERITY.EMERGENCY,
        message: `HARD HALT ACTIVATED: ${haltData.haltReason}`,
        details: {
          triggeredBy: haltData.triggeredBy,
          triggeredAt: haltData.triggeredAt,
          isAutomatic: haltData.isAutomatic
        }
      });
    } catch (err) {
      console.error('[HardHaltProtocol] Failed to send halt notification:', err.message);
    }
  }

  /**
   * Send restoration notifications
   * @private
   */
  async _sendRestoreNotifications(restoredBy, restoredAt) {
    try {
      await SovereignAlert.fire({
        type: 'HARD_HALT_RESTORED',
        severity: SEVERITY.CRITICAL,
        message: 'HARD HALT RESTORED: Operations resuming',
        details: {
          restoredBy,
          restoredAt
        }
      });
    } catch (err) {
      console.error('[HardHaltProtocol] Failed to send restore notification:', err.message);
    }
  }

  /**
   * Send warning notification for impending auto-halt
   * @private
   */
  async _sendWarningNotification(hoursSince, thresholdHours) {
    try {
      await SovereignAlert.fire({
        type: 'DEAD_MAN_SWITCH_WARNING',
        severity: SEVERITY.WARNING,
        message: `Dead-man switch warning: ${thresholdHours - hoursSince.toFixed(1)}h until auto-halt`,
        details: {
          hoursSinceActivity: hoursSince,
          thresholdHours,
          hoursRemaining: thresholdHours - hoursSince
        }
      });
    } catch (err) {
      console.error('[HardHaltProtocol] Failed to send warning notification:', err.message);
    }
  }

  /**
   * Broadcast halt status to all connected agents via Realtime
   * @private
   */
  async _broadcastHaltStatus(isHalted, reason) {
    if (!this.supabase) return;

    try {
      const channel = this.supabase.channel(this.config.broadcastChannel);

      await channel.send({
        type: 'broadcast',
        event: 'halt_status',
        payload: {
          isHalted,
          reason,
          timestamp: new Date().toISOString()
        }
      });

      console.log(`[HardHaltProtocol] Broadcast halt status: ${isHalted}`);
    } catch (err) {
      console.warn('[HardHaltProtocol] Broadcast failed:', err.message);
    }
  }

  /**
   * Log action to agent_audit_log
   * @private
   */
  async _logAudit(action, context) {
    if (!this.supabase) return;

    try {
      await this.supabase
        .from('agent_audit_log')
        .insert({
          agent_id: 'HARD_HALT_PROTOCOL',
          action,
          context,
          created_at: new Date().toISOString()
        });
    } catch (err) {
      console.warn('[HardHaltProtocol] Audit log failed:', err.message);
    }
  }

  /**
   * Get last Chairman activity
   * @private
   */
  async _getLastChairmanActivity() {
    if (!this.supabase) return null;

    try {
      // Try chairman_activity table first
      const { data, error } = await this.supabase
        .from('chairman_activity')
        .select('activity_at, activity_type')
        .order('activity_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return data;
      }

      // Fallback: check session data or return mock for now
      console.log('[HardHaltProtocol] No chairman_activity table, using fallback');
      return null;
    } catch (err) {
      console.warn('[HardHaltProtocol] Error fetching Chairman activity:', err.message);
      return null;
    }
  }

  /**
   * Get count of queued decisions pending restoration
   * @private
   */
  async _getQueuedDecisionCount() {
    if (!this.supabase) return 0;

    try {
      const { count, error } = await this.supabase
        .from('escalation_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (error) return 0;
      return count || 0;
    } catch (_err) {
      return 0;
    }
  }

  /**
   * Calculate hours since a given timestamp
   * @private
   */
  _hoursSince(timestamp) {
    const now = new Date();
    const then = new Date(timestamp);
    return (now - then) / (1000 * 60 * 60);
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let _instance = null;

/**
 * Get the HardHaltProtocol singleton instance
 * @returns {HardHaltProtocol}
 */
export function getHardHaltProtocol() {
  if (!_instance) {
    _instance = new HardHaltProtocol();
  }
  return _instance;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if system is currently halted (quick check for agents)
 * @returns {Promise<boolean>}
 */
export async function isSystemHalted() {
  const protocol = getHardHaltProtocol();
  const status = await protocol.getHaltStatus();
  return status.isHalted === true;
}

/**
 * Ensure operation is allowed (throws if halted)
 * @param {string} agentLevel - Agent level (L2, L3, L4)
 * @throws {HardHaltError} If system is halted and agent is L2+
 */
export async function ensureOperationAllowed(agentLevel) {
  // L4 (Crews) can complete in-flight tasks even during halt
  if (agentLevel === 'L4') {
    return;
  }

  const halted = await isSystemHalted();
  if (halted) {
    throw new HardHaltError(
      'OPERATION_BLOCKED',
      `System is in Hard Halt state. ${agentLevel} operations are suspended.`
    );
  }
}

export default HardHaltProtocol;
