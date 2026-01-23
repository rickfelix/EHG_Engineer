/**
 * LEO 5.0 Wall Enforcement Integration
 *
 * Integrates wall management with the existing handoff system.
 * Called by HandoffOrchestrator to enforce phase boundaries.
 *
 * @see lib/tasks/wall-manager.js for wall state management
 * @see scripts/modules/handoff/HandoffOrchestrator.js for handoff system
 */

import { WallManager, WALL_STATUS, GATE_RESULT } from './wall-manager.js';
import { selectTrack, TRACK_CONFIG, getNextPhase } from './track-selector.js';

/**
 * WallEnforcement - Enforcement layer between handoffs and walls
 */
export class WallEnforcement {
  constructor(supabase) {
    this.supabase = supabase;
    this.wallManager = new WallManager(supabase);
  }

  /**
   * Pre-handoff wall check
   * Called BEFORE handoff execution to verify walls allow the transition
   *
   * @param {string} handoffType - Handoff type (e.g., 'PLAN-TO-EXEC')
   * @param {string} sdId - Strategic Directive ID
   * @param {object} options - Additional options
   * @returns {Promise<object>} Enforcement result
   */
  async checkWallsBeforeHandoff(handoffType, sdId, options = {}) {
    console.log('\n   🧱 WALL ENFORCEMENT CHECK');

    try {
      const { fromPhase, toPhase } = this._parseHandoffType(handoffType);

      // Get SD track
      const sd = await this._loadSD(sdId);
      const trackResult = selectTrack(sd);

      // Check if track requires wall for this transition
      const wallName = this._getRequiredWall(fromPhase, trackResult.track);

      if (!wallName) {
        console.log(`      ✓ No wall required for ${handoffType}`);
        return { allowed: true, wallRequired: false };
      }

      // Check previous wall status (must be passed to proceed)
      const wallStatus = await this.wallManager.checkWallStatus(sdId, wallName);

      if (!wallStatus.exists) {
        // Wall not initialized yet - this is OK for first handoff in phase
        console.log(`      ℹ️  Wall ${wallName} not yet initialized`);
        return { allowed: true, wallRequired: true, wallName, initialized: false };
      }

      if (wallStatus.status === WALL_STATUS.PASSED) {
        console.log(`      ✅ Wall ${wallName} already passed`);
        return { allowed: true, wallRequired: true, wallName, status: wallStatus };
      }

      if (wallStatus.status === WALL_STATUS.INVALIDATED) {
        console.log(`      ❌ Wall ${wallName} was invalidated`);
        console.log(`         Reason: ${wallStatus.invalidatedReason}`);
        return {
          allowed: false,
          wallRequired: true,
          wallName,
          reason: `Wall ${wallName} was invalidated: ${wallStatus.invalidatedReason}`,
          status: wallStatus
        };
      }

      // Wall is blocked or pending - check if gates can now pass
      if (wallStatus.canPass) {
        console.log(`      ✓ Wall ${wallName} ready to pass`);
        return { allowed: true, wallRequired: true, wallName, status: wallStatus };
      }

      // Wall blocked by incomplete gates
      console.log(`      ❌ Wall ${wallName} is blocked`);
      console.log(`         Pending gates: ${wallStatus.pendingGates?.join(', ') || 'none'}`);
      console.log(`         Failed gates: ${wallStatus.failedGates?.join(', ') || 'none'}`);

      return {
        allowed: false,
        wallRequired: true,
        wallName,
        reason: `Wall ${wallName} blocked by incomplete gates`,
        pendingGates: wallStatus.pendingGates,
        failedGates: wallStatus.failedGates,
        status: wallStatus
      };

    } catch (error) {
      console.error(`      ❌ Wall check error: ${error.message}`);
      return {
        allowed: false,
        error: error.message
      };
    }
  }

  /**
   * Post-handoff wall update
   * Called AFTER handoff execution to update wall state
   *
   * @param {string} handoffType - Handoff type
   * @param {string} sdId - Strategic Directive ID
   * @param {object} handoffResult - Result from handoff execution
   * @returns {Promise<object>} Wall update result
   */
  async updateWallsAfterHandoff(handoffType, sdId, handoffResult) {
    console.log('\n   🧱 WALL STATE UPDATE');

    try {
      const { fromPhase, toPhase } = this._parseHandoffType(handoffType);

      // Get SD track
      const sd = await this._loadSD(sdId);
      const trackResult = selectTrack(sd);

      // Initialize walls for the new phase
      const initResult = await this.wallManager.initializeWallsForHandoff(
        sdId,
        fromPhase,
        toPhase,
        {
          metadata: {
            handoffType,
            handoffScore: handoffResult.normalizedScore,
            handoffSuccess: handoffResult.success
          }
        }
      );

      if (!initResult.success) {
        console.log(`      ⚠️  Wall initialization failed: ${initResult.error}`);
        return initResult;
      }

      // If handoff passed all gates, record gate results
      if (handoffResult.success && handoffResult.gateResults) {
        await this._recordGateResultsFromHandoff(sd.uuid_id || sd.id, handoffResult.gateResults);
      }

      // Mark the previous wall as passed (if applicable)
      const previousWall = this._getRequiredWall(fromPhase, trackResult.track);
      if (previousWall && handoffResult.success) {
        await this.wallManager.passWall(sdId, previousWall, {
          validationScore: handoffResult.normalizedScore,
          gateResults: handoffResult.gateResults
        });
      }

      console.log(`      ✅ Walls updated for ${toPhase} phase`);

      return {
        success: true,
        phase: toPhase,
        wallsInitialized: initResult.wallRequired,
        previousWallPassed: previousWall || null
      };

    } catch (error) {
      console.error(`      ❌ Wall update error: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Record gate results from handoff execution
   * Maps handoff gate results to wall-blocking gates
   *
   * @param {string} sdId - Strategic Directive ID (UUID)
   * @param {array} gateResults - Gate results from handoff
   */
  async _recordGateResultsFromHandoff(sdUuid, gateResults) {
    if (!gateResults || !Array.isArray(gateResults)) return;

    for (const gate of gateResults) {
      const gateId = gate.name || gate.gateName || gate.id;
      const passed = gate.passed !== false && gate.score > 0;

      await this.wallManager.recordGateResult(sdUuid, gateId, passed ? GATE_RESULT.PASS : GATE_RESULT.FAIL, {
        score: gate.score,
        maxScore: gate.max_score || gate.maxScore,
        issues: gate.issues || [],
        metadata: {
          weight: gate.weight,
          warnings: gate.warnings
        }
      });
    }
  }

  /**
   * Handle kickback scenario (gate failure requiring phase return)
   *
   * @param {string} sdId - Strategic Directive ID
   * @param {string} currentPhase - Current phase
   * @param {string} failedGate - Gate that failed
   * @param {object} options - Additional options
   * @returns {Promise<object>} Kickback result
   */
  async handleKickback(sdId, currentPhase, failedGate, options = {}) {
    console.log('\n   ⬅️  KICKBACK INITIATED');
    console.log(`      Phase: ${currentPhase}`);
    console.log(`      Failed Gate: ${failedGate}`);

    try {
      const sd = await this._loadSD(sdId);
      const trackResult = selectTrack(sd);

      // Determine kickback target phase
      const targetPhase = this._getKickbackTarget(currentPhase, trackResult.track);

      if (!targetPhase) {
        return {
          success: false,
          error: `No kickback target for ${currentPhase}`
        };
      }

      console.log(`      Target: ${targetPhase}`);

      // Invalidate current wall
      const currentWall = this._getRequiredWall(
        this._getPreviousPhase(currentPhase, trackResult.track),
        trackResult.track
      );

      if (currentWall) {
        await this.wallManager.invalidateWall(
          sdId,
          currentWall,
          `Kickback due to failed gate: ${failedGate}`,
          {
            previousStatus: WALL_STATUS.PASSED,
            invalidatedBy: 'kickback'
          }
        );
      }

      // Record kickback in database
      const { error } = await this.supabase
        .from('sd_kickbacks')
        .insert({
          sd_id: sd.uuid_id || sd.id,
          from_phase: currentPhase,
          to_phase: targetPhase,
          wall_name: currentWall,
          failure_reason: options.reason || `Gate ${failedGate} failed`,
          retry_count: options.retryCount || 0,
          max_retries: options.maxRetries || 3,
          metadata: {
            failedGate,
            issues: options.issues || [],
            track: trackResult.track
          }
        });

      if (error) {
        console.error(`      ⚠️  Kickback recording failed: ${error.message}`);
      }

      return {
        success: true,
        fromPhase: currentPhase,
        toPhase: targetPhase,
        invalidatedWall: currentWall,
        message: `Kicked back from ${currentPhase} to ${targetPhase}`
      };

    } catch (error) {
      console.error(`      ❌ Kickback error: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get wall status overview for an SD
   *
   * @param {string} sdId - Strategic Directive ID
   * @returns {Promise<object>} Wall overview
   */
  async getWallOverview(sdId) {
    const sd = await this._loadSD(sdId);
    const trackResult = selectTrack(sd);
    const wallStates = await this.wallManager.getWallStates(sdId);

    // Build overview with track context
    const expectedWalls = TRACK_CONFIG[trackResult.track]?.walls || [];
    const wallStatusMap = new Map(wallStates.map(w => [w.wall_name, w]));

    const overview = expectedWalls.map(wallName => {
      const state = wallStatusMap.get(wallName);
      return {
        wallName,
        status: state?.status || 'not_initialized',
        passedAt: state?.passed_at || null,
        blockedBy: state?.blocked_by || [],
        validationScore: state?.validation_score || null
      };
    });

    return {
      sdId,
      track: trackResult.track,
      currentPhase: sd.current_phase,
      walls: overview,
      totalWalls: expectedWalls.length,
      passedWalls: overview.filter(w => w.status === WALL_STATUS.PASSED).length
    };
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

  _parseHandoffType(handoffType) {
    const parts = handoffType.split('-TO-');
    if (parts.length !== 2) {
      // Handle special cases like LEAD-FINAL-APPROVAL
      if (handoffType === 'LEAD-FINAL-APPROVAL') {
        return { fromPhase: 'VERIFY', toPhase: 'FINAL' };
      }
      throw new Error(`Invalid handoff type: ${handoffType}`);
    }
    return { fromPhase: parts[0], toPhase: parts[1] };
  }

  _getRequiredWall(phase, track) {
    const config = TRACK_CONFIG[track];
    if (!config) return null;

    const wallName = `${phase}-WALL`;
    return config.walls.includes(wallName) ? wallName : null;
  }

  _getKickbackTarget(currentPhase, track) {
    // Kickback targets: generally go back one phase
    const kickbackMap = {
      'PLAN': 'LEAD',
      'EXEC': 'PLAN',
      'VERIFY': 'EXEC',
      'FINAL': 'VERIFY',
      'SAFETY': 'EXEC'
    };
    return kickbackMap[currentPhase] || null;
  }

  _getPreviousPhase(currentPhase, track) {
    const config = TRACK_CONFIG[track];
    if (!config) return null;

    const currentIndex = config.phases.indexOf(currentPhase);
    if (currentIndex <= 0) return null;

    return config.phases[currentIndex - 1];
  }
}

export default WallEnforcement;
