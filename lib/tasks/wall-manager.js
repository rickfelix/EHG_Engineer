/**
 * LEO 5.0 Wall Manager
 *
 * Manages phase boundaries ("walls") using Claude Code Tasks blockedBy constraints.
 * Walls are impenetrable barriers that prevent phase transitions until all gates pass.
 *
 * Key concepts:
 * - Walls block the first task of the next phase via blockedBy
 * - Gates must complete before walls can complete
 * - Walls are track-specific (FULL, STANDARD, FAST, HOTFIX)
 *
 * @see plans/LEO_5_0_ARCHITECTURE.md Section 6 for spec
 */

import { createClient } from '@supabase/supabase-js';
import { selectTrack, TRACK_CONFIG } from './track-selector.js';
import { TaskHydrator } from './task-hydrator.js';

// Wall status constants
const WALL_STATUS = {
  PENDING: 'pending',
  BLOCKED: 'blocked',
  READY: 'ready',
  PASSED: 'passed',
  INVALIDATED: 'invalidated'
};

// Gate result constants
const GATE_RESULT = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  SKIP: 'SKIP',
  PENDING: 'PENDING'
};

/**
 * WallManager - Orchestrates wall-based phase boundaries
 */
export class WallManager {
  constructor(supabase) {
    this.supabase = supabase || createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    this.hydrator = new TaskHydrator(this.supabase);
  }

  /**
   * Initialize walls for an SD at handoff time
   * Called by HandoffOrchestrator after gate validation passes
   *
   * @param {string} sdId - Strategic Directive ID (legacy key or UUID)
   * @param {string} fromPhase - Source phase (e.g., 'LEAD')
   * @param {string} toPhase - Target phase (e.g., 'PLAN')
   * @param {object} options - Additional options
   * @returns {Promise<object>} Wall initialization result
   */
  async initializeWallsForHandoff(sdId, fromPhase, toPhase, options = {}) {
    console.log('\n   🧱 WALL INITIALIZATION (LEO 5.0)');
    console.log(`      From: ${fromPhase} → To: ${toPhase}`);

    try {
      // Load SD and determine track
      const sd = await this._loadSD(sdId);
      const trackResult = selectTrack(sd);

      console.log(`      Track: ${trackResult.track}`);
      console.log(`      Phases: ${trackResult.phases.join(' → ')}`);

      // Validate phase transition is valid for track
      if (!trackResult.phases.includes(toPhase)) {
        return {
          success: false,
          error: `Phase ${toPhase} not valid for track ${trackResult.track}`,
          track: trackResult.track,
          validPhases: trackResult.phases
        };
      }

      // Get wall name for the transition
      const wallName = this._getWallForTransition(fromPhase, toPhase, trackResult.track);
      if (!wallName) {
        console.log(`      ℹ️  No wall required for ${fromPhase} → ${toPhase}`);
        return { success: true, wallRequired: false };
      }

      console.log(`      Wall: ${wallName}`);

      // Hydrate the target phase tasks
      const hydratedPhase = await this.hydrator.hydratePhase(sdId, toPhase, {
        previousPhase: fromPhase
      });

      // Find the wall task
      const wallTask = hydratedPhase.tasks.find(t =>
        t.id?.includes('-WALL') || t.metadata?.category === 'wall'
      );

      if (!wallTask) {
        console.log(`      ⚠️  No wall task found in ${toPhase} template`);
        return {
          success: true,
          wallRequired: false,
          tasks: hydratedPhase.tasks
        };
      }

      // Record wall state in database
      await this._recordWallState(sd.id, wallName, toPhase, {
        status: WALL_STATUS.BLOCKED,
        blockedBy: wallTask.blockedBy || [],
        track: trackResult.track,
        metadata: options.metadata || {}
      });

      return {
        success: true,
        wallRequired: true,
        wallName,
        wallTask,
        track: trackResult.track,
        phase: toPhase,
        tasks: hydratedPhase.tasks,
        blockedBy: wallTask.blockedBy
      };

    } catch (error) {
      console.error(`      ❌ Wall initialization error: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if a wall can be passed (all blocking gates complete)
   *
   * @param {string} sdId - Strategic Directive ID
   * @param {string} wallName - Wall identifier (e.g., 'PLAN-WALL')
   * @returns {Promise<object>} Wall status check result
   */
  async checkWallStatus(sdId, wallName) {
    const sd = await this._loadSD(sdId);

    // Get wall state from database
    const { data: wallState, error } = await this.supabase
      .from('sd_wall_states')
      .select('*')
      .eq('sd_id', sd.id)
      .eq('wall_name', wallName)
      .single();

    if (error || !wallState) {
      return {
        exists: false,
        canPass: false,
        error: error?.message || 'Wall state not found'
      };
    }

    // If already passed or invalidated, return current status
    if (wallState.status === WALL_STATUS.PASSED) {
      return {
        exists: true,
        canPass: true,
        status: WALL_STATUS.PASSED,
        passedAt: wallState.passed_at
      };
    }

    if (wallState.status === WALL_STATUS.INVALIDATED) {
      return {
        exists: true,
        canPass: false,
        status: WALL_STATUS.INVALIDATED,
        invalidatedReason: wallState.invalidated_reason
      };
    }

    // Check blocking gates
    const blockedBy = wallState.blocked_by || [];
    const gateStatuses = await this._checkGateStatuses(sd.id, blockedBy);

    const allGatesPassed = gateStatuses.every(g => g.status === GATE_RESULT.PASS);
    const failedGates = gateStatuses.filter(g => g.status === GATE_RESULT.FAIL);
    const pendingGates = gateStatuses.filter(g => g.status === GATE_RESULT.PENDING);

    return {
      exists: true,
      canPass: allGatesPassed,
      status: allGatesPassed ? WALL_STATUS.READY : WALL_STATUS.BLOCKED,
      gates: gateStatuses,
      failedGates: failedGates.map(g => g.gateId),
      pendingGates: pendingGates.map(g => g.gateId),
      blockedBy
    };
  }

  /**
   * Mark a wall as passed (after all gates complete)
   *
   * @param {string} sdId - Strategic Directive ID
   * @param {string} wallName - Wall identifier
   * @param {object} options - Additional options (validation results, etc.)
   * @returns {Promise<object>} Wall pass result
   */
  async passWall(sdId, wallName, options = {}) {
    const sd = await this._loadSD(sdId);

    // First check if wall can be passed
    const status = await this.checkWallStatus(sdId, wallName);

    if (!status.exists) {
      return {
        success: false,
        error: 'Wall state not found'
      };
    }

    if (!status.canPass) {
      return {
        success: false,
        error: 'Wall cannot be passed - gates incomplete',
        failedGates: status.failedGates,
        pendingGates: status.pendingGates
      };
    }

    // Update wall state to passed
    const { error } = await this.supabase
      .from('sd_wall_states')
      .update({
        status: WALL_STATUS.PASSED,
        passed_at: new Date().toISOString(),
        validation_score: options.validationScore || null,
        metadata: {
          ...(options.metadata || {}),
          gateResults: options.gateResults || status.gates
        }
      })
      .eq('sd_id', sd.id)
      .eq('wall_name', wallName);

    if (error) {
      return {
        success: false,
        error: error.message
      };
    }

    console.log(`   ✅ WALL PASSED: ${wallName}`);

    return {
      success: true,
      wallName,
      passedAt: new Date().toISOString(),
      gates: status.gates
    };
  }

  /**
   * Invalidate a wall (for kickback or correction scenarios)
   *
   * @param {string} sdId - Strategic Directive ID
   * @param {string} wallName - Wall identifier
   * @param {string} reason - Reason for invalidation
   * @param {object} options - Additional options
   * @returns {Promise<object>} Invalidation result
   */
  async invalidateWall(sdId, wallName, reason, options = {}) {
    const sd = await this._loadSD(sdId);

    const { error } = await this.supabase
      .from('sd_wall_states')
      .update({
        status: WALL_STATUS.INVALIDATED,
        invalidated_at: new Date().toISOString(),
        invalidated_reason: reason,
        metadata: {
          previousStatus: options.previousStatus,
          invalidatedBy: options.invalidatedBy || 'system',
          ...options.metadata
        }
      })
      .eq('sd_id', sd.id)
      .eq('wall_name', wallName);

    if (error) {
      return {
        success: false,
        error: error.message
      };
    }

    console.log(`   ⚠️  WALL INVALIDATED: ${wallName}`);
    console.log(`      Reason: ${reason}`);

    return {
      success: true,
      wallName,
      reason,
      invalidatedAt: new Date().toISOString()
    };
  }

  /**
   * Get all wall states for an SD
   *
   * @param {string} sdId - Strategic Directive ID
   * @returns {Promise<array>} Array of wall states
   */
  async getWallStates(sdId) {
    const sd = await this._loadSD(sdId);

    const { data, error } = await this.supabase
      .from('sd_wall_states')
      .select('*')
      .eq('sd_id', sd.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error(`Error fetching wall states: ${error.message}`);
      return [];
    }

    return data || [];
  }

  /**
   * Record a gate result (for wall blocking logic)
   *
   * @param {string} sdId - Strategic Directive ID
   * @param {string} gateId - Gate identifier
   * @param {string} result - PASS, FAIL, or SKIP
   * @param {object} details - Gate result details
   * @returns {Promise<object>} Recording result
   */
  async recordGateResult(sdId, gateId, result, details = {}) {
    const sd = await this._loadSD(sdId);

    const { error } = await this.supabase
      .from('sd_gate_results')
      .upsert({
        sd_id: sd.id,
        gate_id: gateId,
        result,
        score: details.score || null,
        max_score: details.maxScore || null,
        issues: details.issues || [],
        metadata: details.metadata || {},
        executed_at: new Date().toISOString()
      }, {
        onConflict: 'sd_id,gate_id'
      });

    if (error) {
      console.error(`Error recording gate result: ${error.message}`);
      return { success: false, error: error.message };
    }

    return { success: true, gateId, result };
  }

  // ============ Private Helper Methods ============

  /**
   * Load SD by legacy key or UUID
   */
  async _loadSD(sdId) {
    // Try legacy ID first
    let { data: sd, error } = await this.supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (error || !sd) {
      // Try UUID
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

  /**
   * Determine wall name for a phase transition
   */
  _getWallForTransition(fromPhase, toPhase, track) {
    const config = TRACK_CONFIG[track];
    if (!config) return null;

    // Wall naming convention: {FROM_PHASE}-WALL blocks {TO_PHASE}
    const wallName = `${fromPhase}-WALL`;

    // Verify this wall exists in the track configuration
    if (config.walls.includes(wallName)) {
      return wallName;
    }

    // Special case: SAFETY-WALL for HOTFIX track
    if (track === 'HOTFIX' && fromPhase === 'EXEC' && toPhase === 'FINAL') {
      return 'SAFETY-WALL';
    }

    return null;
  }

  /**
   * Record wall state to database
   */
  async _recordWallState(sdUuid, wallName, phase, data) {
    const { error } = await this.supabase
      .from('sd_wall_states')
      .upsert({
        sd_id: sdUuid,
        wall_name: wallName,
        phase,
        status: data.status,
        blocked_by: data.blockedBy,
        track: data.track,
        metadata: data.metadata,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'sd_id,wall_name'
      });

    if (error) {
      console.error(`Error recording wall state: ${error.message}`);
    }

    return !error;
  }

  /**
   * Check status of blocking gates
   */
  async _checkGateStatuses(sdUuid, gateIds) {
    if (!gateIds || gateIds.length === 0) {
      return [];
    }

    const { data: gateResults, error } = await this.supabase
      .from('sd_gate_results')
      .select('gate_id, result, score, issues')
      .eq('sd_id', sdUuid)
      .in('gate_id', gateIds);

    if (error) {
      console.error(`Error fetching gate results: ${error.message}`);
      return gateIds.map(gateId => ({
        gateId,
        status: GATE_RESULT.PENDING,
        error: error.message
      }));
    }

    // Map results, defaulting to PENDING for gates without results
    const resultMap = new Map((gateResults || []).map(r => [r.gate_id, r]));

    return gateIds.map(gateId => {
      const result = resultMap.get(gateId);
      if (!result) {
        return { gateId, status: GATE_RESULT.PENDING };
      }
      return {
        gateId,
        status: result.result,
        score: result.score,
        issues: result.issues
      };
    });
  }
}

// Export constants for external use
export { WALL_STATUS, GATE_RESULT };

export default WallManager;
