/**
 * LEO 5.0 Kickback Manager
 *
 * Manages failure recovery through kickback tasks.
 * When gates fail repeatedly, the system creates kickback tasks
 * to return to the previous phase for correction.
 *
 * Key concepts:
 * - Retry tracking: Gates can retry up to max_retries before kickback
 * - Kickback creation: Auto-creates tasks to return to previous phase
 * - Wall invalidation: Invalidates current wall on kickback
 * - Resolution tracking: Tracks kickback resolution status
 *
 * @see plans/LEO_5_0_ARCHITECTURE.md Section 8 for spec
 */

import { createClient } from '@supabase/supabase-js';
import { WallManager, WALL_STATUS, GATE_RESULT } from './wall-manager.js';
import { selectTrack, TRACK_CONFIG } from './track-selector.js';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, 'templates');

// Kickback status constants
const KICKBACK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  ESCALATED: 'escalated'
};

// Default retry configuration
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  retryDelayMs: 0, // No delay by default
  escalateOnMaxRetries: true
};

/**
 * KickbackManager - Handles failure recovery and phase regression
 */
export class KickbackManager {
  constructor(supabase, options = {}) {
    this.supabase = supabase || createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    this.wallManager = options.wallManager || new WallManager(this.supabase);
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...options.retryConfig };
    this.templateCache = new Map();
  }

  /**
   * Record a gate failure and check if kickback is needed
   *
   * @param {string} sdId - Strategic Directive ID
   * @param {string} gateId - Failed gate identifier
   * @param {object} failureDetails - Details about the failure
   * @returns {Promise<object>} Failure handling result
   */
  async recordGateFailure(sdId, gateId, failureDetails = {}) {
    console.log('\n   ⚠️  GATE FAILURE RECORDED');
    console.log(`      Gate: ${gateId}`);

    try {
      const sd = await this._loadSD(sdId);
      const sdUuid = sd.uuid_id || sd.id;

      // Get current retry count
      const { data: existingResult } = await this.supabase
        .from('sd_gate_results')
        .select('retry_count, issues')
        .eq('sd_id', sdUuid)
        .eq('gate_id', gateId)
        .single();

      const currentRetries = (existingResult?.retry_count || 0) + 1;
      const maxRetries = failureDetails.maxRetries || this.retryConfig.maxRetries;

      console.log(`      Retry: ${currentRetries}/${maxRetries}`);

      // Record the failure
      await this.wallManager.recordGateResult(sdUuid, gateId, GATE_RESULT.FAIL, {
        score: failureDetails.score || 0,
        maxScore: failureDetails.maxScore || 100,
        issues: failureDetails.issues || [],
        metadata: {
          ...failureDetails.metadata,
          retry_count: currentRetries,
          failure_reason: failureDetails.reason || 'Gate validation failed'
        }
      });

      // Update retry count in gate results
      await this.supabase
        .from('sd_gate_results')
        .update({ retry_count: currentRetries })
        .eq('sd_id', sdUuid)
        .eq('gate_id', gateId);

      // Check if kickback is needed
      if (currentRetries >= maxRetries) {
        console.log('      🔄 Max retries reached - initiating kickback');

        const kickbackResult = await this.createKickback(sdId, {
          failedGate: gateId,
          failureReason: failureDetails.reason || 'Gate validation failed after max retries',
          retryCount: currentRetries,
          issues: failureDetails.issues || []
        });

        return {
          kickbackCreated: true,
          retryCount: currentRetries,
          maxRetries,
          kickback: kickbackResult
        };
      }

      return {
        kickbackCreated: false,
        retryCount: currentRetries,
        maxRetries,
        canRetry: currentRetries < maxRetries,
        retriesRemaining: maxRetries - currentRetries
      };

    } catch (error) {
      console.error(`      ❌ Error recording failure: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a kickback task to return to previous phase
   *
   * @param {string} sdId - Strategic Directive ID
   * @param {object} options - Kickback options
   * @returns {Promise<object>} Kickback creation result
   */
  async createKickback(sdId, options = {}) {
    console.log('\n   ⬅️  CREATING KICKBACK TASK');

    try {
      const sd = await this._loadSD(sdId);
      const sdUuid = sd.uuid_id || sd.id;
      const trackResult = selectTrack(sd);

      // Determine current and target phases
      const currentPhase = sd.current_phase || this._inferPhase(options.failedGate);
      const targetPhase = this._getKickbackTarget(currentPhase, trackResult.track);

      if (!targetPhase) {
        return {
          success: false,
          error: `No kickback target for phase: ${currentPhase}`
        };
      }

      console.log(`      From: ${currentPhase} → To: ${targetPhase}`);
      console.log(`      Failed Gate: ${options.failedGate}`);

      // Get the wall to invalidate
      const wallToInvalidate = this._getWallForPhase(currentPhase, trackResult.track);

      // Load kickback template
      const kickbackTemplate = await this._loadKickbackTemplate();

      // Generate kickback task ID
      const kickbackId = `${sd.id}-KICKBACK-${currentPhase}-${Date.now()}`;

      // Create kickback record in database
      const { data: kickback, error: kickbackError } = await this.supabase
        .from('sd_kickbacks')
        .insert({
          sd_id: sdUuid,
          from_phase: currentPhase,
          to_phase: targetPhase,
          wall_name: wallToInvalidate,
          failure_reason: options.failureReason,
          retry_count: options.retryCount || 0,
          max_retries: options.maxRetries || this.retryConfig.maxRetries,
          resolution_status: KICKBACK_STATUS.PENDING,
          metadata: {
            kickback_id: kickbackId,
            failed_gate: options.failedGate,
            issues: options.issues || [],
            track: trackResult.track,
            template_used: 'kickback-template'
          }
        })
        .select()
        .single();

      if (kickbackError) {
        console.error(`      ⚠️  Kickback record error: ${kickbackError.message}`);
        // Continue even if recording fails
      }

      // Invalidate the current wall
      if (wallToInvalidate) {
        await this.wallManager.invalidateWall(
          sdId,
          wallToInvalidate,
          `Kickback due to ${options.failedGate} failure`,
          {
            invalidatedBy: 'kickback',
            kickbackId: kickback?.id || kickbackId
          }
        );
      }

      // Build the kickback task
      const kickbackTask = this._interpolateTemplate(kickbackTemplate, {
        SD_ID: sd.id,
        FROM_PHASE: currentPhase,
        TO_PHASE: targetPhase,
        FAILED_GATE: options.failedGate,
        FAILURE_REASON: options.failureReason || 'Gate validation failed',
        RETRY_COUNT: options.retryCount || 0,
        CURRENT_WALL: wallToInvalidate
      });

      console.log(`      ✅ Kickback created: ${kickbackId}`);

      return {
        success: true,
        kickbackId,
        kickbackDbId: kickback?.id,
        fromPhase: currentPhase,
        toPhase: targetPhase,
        invalidatedWall: wallToInvalidate,
        task: kickbackTask
      };

    } catch (error) {
      console.error(`      ❌ Kickback creation error: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Resolve a kickback (mark as resolved after fixing the issue)
   *
   * @param {string} kickbackId - Kickback ID (from database or generated)
   * @param {object} resolution - Resolution details
   * @returns {Promise<object>} Resolution result
   */
  async resolveKickback(kickbackId, resolution = {}) {
    console.log('\n   ✅ RESOLVING KICKBACK');

    try {
      // Try to find by UUID first
      let { data: kickback, error } = await this.supabase
        .from('sd_kickbacks')
        .select('*')
        .eq('id', kickbackId)
        .single();

      // If not found by UUID, try metadata
      if (error || !kickback) {
        const result = await this.supabase
          .from('sd_kickbacks')
          .select('*')
          .contains('metadata', { kickback_id: kickbackId })
          .single();
        kickback = result.data;
        error = result.error;
      }

      if (error || !kickback) {
        return {
          success: false,
          error: `Kickback not found: ${kickbackId}`
        };
      }

      // Update kickback status
      const { error: updateError } = await this.supabase
        .from('sd_kickbacks')
        .update({
          resolution_status: KICKBACK_STATUS.RESOLVED,
          resolved_at: new Date().toISOString(),
          metadata: {
            ...kickback.metadata,
            resolution_notes: resolution.notes || '',
            resolved_by: resolution.resolvedBy || 'system',
            gate_retried: resolution.gateRetried || false
          }
        })
        .eq('id', kickback.id);

      if (updateError) {
        return {
          success: false,
          error: updateError.message
        };
      }

      console.log(`      Kickback resolved: ${kickbackId}`);
      console.log(`      From: ${kickback.from_phase} → To: ${kickback.to_phase}`);

      return {
        success: true,
        kickbackId,
        fromPhase: kickback.from_phase,
        toPhase: kickback.to_phase,
        resolvedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error(`      ❌ Resolution error: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Escalate a kickback to human/LEAD intervention
   *
   * @param {string} kickbackId - Kickback ID
   * @param {object} escalation - Escalation details
   * @returns {Promise<object>} Escalation result
   */
  async escalateKickback(kickbackId, escalation = {}) {
    console.log('\n   🚨 ESCALATING KICKBACK');

    try {
      // Find the kickback
      let { data: kickback, error } = await this.supabase
        .from('sd_kickbacks')
        .select('*')
        .eq('id', kickbackId)
        .single();

      if (error || !kickback) {
        const result = await this.supabase
          .from('sd_kickbacks')
          .select('*')
          .contains('metadata', { kickback_id: kickbackId })
          .single();
        kickback = result.data;
      }

      if (!kickback) {
        return {
          success: false,
          error: `Kickback not found: ${kickbackId}`
        };
      }

      // Update to escalated status
      const { error: updateError } = await this.supabase
        .from('sd_kickbacks')
        .update({
          resolution_status: KICKBACK_STATUS.ESCALATED,
          escalated_at: new Date().toISOString(),
          metadata: {
            ...kickback.metadata,
            escalation_reason: escalation.reason || 'Manual escalation',
            escalated_to: escalation.escalateTo || 'LEAD',
            escalated_by: escalation.escalatedBy || 'system',
            requires_human: true
          }
        })
        .eq('id', kickback.id);

      if (updateError) {
        return {
          success: false,
          error: updateError.message
        };
      }

      console.log(`      Escalated: ${kickbackId}`);
      console.log(`      Reason: ${escalation.reason || 'Manual escalation'}`);

      return {
        success: true,
        kickbackId,
        escalatedAt: new Date().toISOString(),
        escalatedTo: escalation.escalateTo || 'LEAD'
      };

    } catch (error) {
      console.error(`      ❌ Escalation error: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get pending kickbacks for an SD
   *
   * @param {string} sdId - Strategic Directive ID
   * @returns {Promise<array>} Array of pending kickbacks
   */
  async getPendingKickbacks(sdId) {
    const sd = await this._loadSD(sdId);
    const sdUuid = sd.uuid_id || sd.id;

    const { data, error } = await this.supabase
      .from('sd_kickbacks')
      .select('*')
      .eq('sd_id', sdUuid)
      .in('resolution_status', [KICKBACK_STATUS.PENDING, KICKBACK_STATUS.IN_PROGRESS])
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`Error fetching kickbacks: ${error.message}`);
      return [];
    }

    return data || [];
  }

  /**
   * Check if an SD has unresolved kickbacks
   *
   * @param {string} sdId - Strategic Directive ID
   * @returns {Promise<boolean>} True if there are unresolved kickbacks
   */
  async hasUnresolvedKickbacks(sdId) {
    const pending = await this.getPendingKickbacks(sdId);
    return pending.length > 0;
  }

  /**
   * Get retry count for a specific gate
   *
   * @param {string} sdId - Strategic Directive ID
   * @param {string} gateId - Gate identifier
   * @returns {Promise<number>} Current retry count
   */
  async getGateRetryCount(sdId, gateId) {
    const sd = await this._loadSD(sdId);
    const sdUuid = sd.uuid_id || sd.id;

    const { data } = await this.supabase
      .from('sd_gate_results')
      .select('retry_count')
      .eq('sd_id', sdUuid)
      .eq('gate_id', gateId)
      .single();

    return data?.retry_count || 0;
  }

  /**
   * Reset retry count for a gate (after successful fix)
   *
   * @param {string} sdId - Strategic Directive ID
   * @param {string} gateId - Gate identifier
   * @returns {Promise<boolean>} Success status
   */
  async resetGateRetries(sdId, gateId) {
    const sd = await this._loadSD(sdId);
    const sdUuid = sd.uuid_id || sd.id;

    const { error } = await this.supabase
      .from('sd_gate_results')
      .update({ retry_count: 0, result: GATE_RESULT.PENDING })
      .eq('sd_id', sdUuid)
      .eq('gate_id', gateId);

    return !error;
  }

  // ============ Private Helper Methods ============

  async _loadSD(sdId) {
    let { data: sd, error } = await this.supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (error || !sd) {
      const result = await this.supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('uuid_id', sdId)
        .single();
      sd = result.data;
      error = result.error;
    }

    if (error || !sd) {
      throw new Error(`SD not found: ${sdId}`);
    }

    return sd;
  }

  async _loadKickbackTemplate() {
    if (this.templateCache.has('kickback')) {
      return this.templateCache.get('kickback');
    }

    try {
      const templatePath = join(TEMPLATES_DIR, 'shared', 'kickback', 'kickback-template.json');
      const content = await readFile(templatePath, 'utf-8');
      const template = JSON.parse(content);
      this.templateCache.set('kickback', template);
      return template;
    } catch (error) {
      // Return inline default template
      return {
        id_template: '{{SD_ID}}-KICKBACK-{{FROM_PHASE}}',
        subject: 'Kickback: {{FAILURE_REASON}}',
        activeForm: 'Processing kickback',
        description: 'Gate {{FAILED_GATE}} failed after {{RETRY_COUNT}} attempts. Fix and re-attempt.',
        blockedBy: [],
        metadata: {
          category: 'kickback',
          from_phase: '{{FROM_PHASE}}',
          to_phase: '{{TO_PHASE}}',
          invalidates_wall: '{{CURRENT_WALL}}',
          failure_reason: '{{FAILURE_REASON}}',
          failed_gate: '{{FAILED_GATE}}'
        }
      };
    }
  }

  _interpolateTemplate(template, vars) {
    const result = JSON.parse(JSON.stringify(template));

    const interpolate = (obj) => {
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'string') {
          for (const [varName, varValue] of Object.entries(vars)) {
            obj[key] = obj[key].replace(new RegExp(`\\{\\{${varName}\\}\\}`, 'g'), varValue);
          }
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          interpolate(obj[key]);
        }
      }
    };

    interpolate(result);
    return result;
  }

  _getKickbackTarget(currentPhase, track) {
    const kickbackMap = {
      'PLAN': 'LEAD',
      'EXEC': 'PLAN',
      'VERIFY': 'EXEC',
      'FINAL': 'VERIFY',
      'SAFETY': 'EXEC'
    };

    // For tracks without certain phases, adjust
    const config = TRACK_CONFIG[track];
    const target = kickbackMap[currentPhase];

    if (!target) return null;

    // Verify target exists in track
    if (config && !config.phases.includes(target)) {
      // Skip to next available phase
      const targetIndex = Object.keys(kickbackMap).indexOf(target);
      for (let i = targetIndex - 1; i >= 0; i--) {
        const altTarget = Object.values(kickbackMap)[i];
        if (config.phases.includes(altTarget)) {
          return altTarget;
        }
      }
      return config.phases[0]; // Fall back to first phase
    }

    return target;
  }

  _getWallForPhase(phase, track) {
    const config = TRACK_CONFIG[track];
    if (!config) return null;

    // The wall that guards entry to this phase
    const phaseIndex = config.phases.indexOf(phase);
    if (phaseIndex <= 0) return null;

    const previousPhase = config.phases[phaseIndex - 1];
    const wallName = `${previousPhase}-WALL`;

    return config.walls.includes(wallName) ? wallName : null;
  }

  _inferPhase(gateId) {
    // Infer phase from gate ID pattern
    if (!gateId) return 'EXEC';

    const gateUpper = gateId.toUpperCase();
    if (gateUpper.includes('LEAD')) return 'LEAD';
    if (gateUpper.includes('PLAN') || gateUpper.includes('PRD')) return 'PLAN';
    if (gateUpper.includes('EXEC') || gateUpper.includes('IMPL')) return 'EXEC';
    if (gateUpper.includes('VERIFY')) return 'VERIFY';
    if (gateUpper.includes('SAFETY')) return 'SAFETY';
    if (gateUpper.includes('FINAL')) return 'FINAL';

    return 'EXEC'; // Default
  }
}

// Export constants
export { KICKBACK_STATUS };

export default KickbackManager;
