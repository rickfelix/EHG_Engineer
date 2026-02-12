/**
 * LEO 5.0 Correction Manager
 *
 * Manages dynamic corrections when work needs to go back without restarting the SD.
 * Creates correction tasks and versioned walls to resume work cleanly.
 *
 * Key concepts:
 * - Wall invalidation: Pause current work to fix earlier phase issues
 * - Correction tasks: Targeted fixes without full phase restart
 * - Versioned walls: PLAN-WALL-V2 allows resumption after correction
 * - Task pausing: In-progress tasks pause during correction
 *
 * @see plans/LEO_5_0_ARCHITECTURE.md Section 9 for spec
 */

import { createClient } from '@supabase/supabase-js';
import { WallManager, WALL_STATUS } from './wall-manager.js';
import { selectTrack, TRACK_CONFIG } from './track-selector.js';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, 'templates');

// Task status extensions for corrections
const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  PAUSED: 'paused',
  INVALIDATED: 'invalidated',
  SUPERSEDED: 'superseded'
};

// Correction types
const CORRECTION_TYPE = {
  PRD_SCOPE_CHANGE: 'prd_scope_change',
  IMPLEMENTATION_REWORK: 'implementation_rework',
  DESIGN_REVISION: 'design_revision',
  REQUIREMENTS_CHANGE: 'requirements_change',
  ARCHITECTURE_UPDATE: 'architecture_update'
};

/**
 * CorrectionManager - Handles dynamic corrections and wall invalidation
 */
export class CorrectionManager {
  constructor(supabase, options = {}) {
    this.supabase = supabase || createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    this.wallManager = options.wallManager || new WallManager(this.supabase);
    this.templateCache = new Map();
  }

  /**
   * Invalidate a wall and create correction tasks
   *
   * @param {string} sdId - Strategic Directive ID
   * @param {string} wallName - Wall to invalidate (e.g., 'PLAN-WALL')
   * @param {object} options - Correction options
   * @returns {Promise<object>} Invalidation result
   */
  async invalidateWallForCorrection(sdId, wallName, options = {}) {
    console.log('\n   🔄 WALL INVALIDATION FOR CORRECTION');
    console.log(`      SD: ${sdId}`);
    console.log(`      Wall: ${wallName}`);
    console.log(`      Reason: ${options.reason || 'Correction required'}`);

    try {
      const sd = await this._loadSD(sdId);
      const sdUuid = sd.uuid_id || sd.id;
      const trackResult = selectTrack(sd);

      // Validate wall exists in track
      if (!trackResult.walls.includes(wallName)) {
        return {
          success: false,
          error: `Wall ${wallName} not valid for track ${trackResult.track}`
        };
      }

      // Get current wall state
      const wallStatus = await this.wallManager.checkWallStatus(sdId, wallName);

      if (!wallStatus.exists) {
        return {
          success: false,
          error: `Wall ${wallName} not initialized`
        };
      }

      if (wallStatus.status === WALL_STATUS.INVALIDATED) {
        return {
          success: false,
          error: `Wall ${wallName} already invalidated`
        };
      }

      // Determine which phase tasks need to be paused
      const wallPhase = this._getPhaseFromWall(wallName);
      const nextPhase = this._getNextPhase(wallPhase, trackResult.track);

      // Pause in-progress tasks in the next phase
      const pausedTasks = await this._pausePhaseTask(sdUuid, nextPhase, {
        pauseReason: `Wall invalidation: ${options.reason}`,
        wallName
      });

      // Invalidate the wall
      await this.wallManager.invalidateWall(sdId, wallName, options.reason || 'Correction required', {
        invalidatedBy: 'correction',
        correctionType: options.correctionType || CORRECTION_TYPE.REQUIREMENTS_CHANGE
      });

      // Calculate next wall version
      const wallVersion = await this._getNextWallVersion(sdUuid, wallName);
      const newWallName = `${wallName}-V${wallVersion}`;

      // Load and create correction tasks
      await this._loadCorrectionTemplate();
      const correctionTasks = this._createCorrectionTasks(sd, wallName, newWallName, {
        reason: options.reason,
        correctionType: options.correctionType,
        targetPhase: wallPhase
      });

      // Record correction in database
      const { data: correction, error: correctionError } = await this.supabase
        .from('sd_corrections')
        .insert({
          sd_id: sdUuid,
          wall_name: wallName,
          new_wall_name: newWallName,
          correction_type: options.correctionType || CORRECTION_TYPE.REQUIREMENTS_CHANGE,
          reason: options.reason || 'Correction required',
          from_phase: nextPhase,
          to_phase: wallPhase,
          paused_tasks: pausedTasks.map(t => t.id),
          status: 'in_progress',
          metadata: {
            track: trackResult.track,
            correction_tasks: correctionTasks.map(t => t.id),
            initiated_by: options.initiatedBy || 'system'
          }
        })
        .select()
        .single();

      if (correctionError) {
        console.log(`      ⚠️  Correction record error: ${correctionError.message}`);
      }

      console.log('      ✅ Correction initiated');
      console.log(`      New wall: ${newWallName}`);
      console.log(`      Tasks paused: ${pausedTasks.length}`);

      return {
        success: true,
        correctionId: correction?.id,
        wallInvalidated: wallName,
        newWallName,
        wallVersion,
        pausedTasks: pausedTasks.length,
        correctionTasks,
        fromPhase: nextPhase,
        toPhase: wallPhase
      };

    } catch (error) {
      console.error(`      ❌ Correction error: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Complete a correction and allow work to resume
   *
   * @param {string} correctionId - Correction ID
   * @param {object} resolution - Resolution details
   * @returns {Promise<object>} Completion result
   */
  async completeCorrection(correctionId, resolution = {}) {
    console.log('\n   ✅ COMPLETING CORRECTION');

    try {
      // Get correction record
      const { data: correction, error } = await this.supabase
        .from('sd_corrections')
        .select('*')
        .eq('id', correctionId)
        .single();

      if (error || !correction) {
        return {
          success: false,
          error: `Correction not found: ${correctionId}`
        };
      }

      const sdId = correction.sd_id;

      // Pass the new versioned wall
      await this.wallManager.passWall(sdId, correction.new_wall_name, {
        validationScore: resolution.validationScore || 100,
        metadata: {
          correction_completed: true,
          completion_notes: resolution.notes
        }
      });

      // Resume paused tasks
      const resumedTasks = await this._resumePausedTasks(sdId, correction.paused_tasks, {
        resumeReason: 'Correction completed',
        resumeAfter: correction.new_wall_name
      });

      // Update correction status
      await this.supabase
        .from('sd_corrections')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          metadata: {
            ...correction.metadata,
            completion_notes: resolution.notes,
            resumed_tasks: resumedTasks.length
          }
        })
        .eq('id', correctionId);

      console.log(`      Correction completed: ${correctionId}`);
      console.log(`      Tasks resumed: ${resumedTasks.length}`);

      return {
        success: true,
        correctionId,
        wallPassed: correction.new_wall_name,
        resumedTasks: resumedTasks.length,
        completedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error(`      ❌ Completion error: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get active corrections for an SD
   *
   * @param {string} sdId - Strategic Directive ID
   * @returns {Promise<array>} Array of active corrections
   */
  async getActiveCorrections(sdId) {
    const sd = await this._loadSD(sdId);
    const sdUuid = sd.uuid_id || sd.id;

    const { data, error } = await this.supabase
      .from('sd_corrections')
      .select('*')
      .eq('sd_id', sdUuid)
      .eq('status', 'in_progress')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`Error fetching corrections: ${error.message}`);
      return [];
    }

    return data || [];
  }

  /**
   * Check if an SD has active corrections blocking progress
   *
   * @param {string} sdId - Strategic Directive ID
   * @returns {Promise<boolean>} True if corrections are blocking
   */
  async hasActiveCorrections(sdId) {
    const corrections = await this.getActiveCorrections(sdId);
    return corrections.length > 0;
  }

  /**
   * Get correction history for an SD
   *
   * @param {string} sdId - Strategic Directive ID
   * @returns {Promise<array>} Array of all corrections
   */
  async getCorrectionHistory(sdId) {
    const sd = await this._loadSD(sdId);
    const sdUuid = sd.uuid_id || sd.id;

    const { data, error } = await this.supabase
      .from('sd_corrections')
      .select('*')
      .eq('sd_id', sdUuid)
      .order('created_at', { ascending: true });

    if (error) {
      console.error(`Error fetching correction history: ${error.message}`);
      return [];
    }

    return data || [];
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

  async _loadCorrectionTemplate() {
    if (this.templateCache.has('correction')) {
      return this.templateCache.get('correction');
    }

    try {
      const templatePath = join(TEMPLATES_DIR, 'shared', 'gates', 'correction-template.json');
      const content = await readFile(templatePath, 'utf-8');
      const template = JSON.parse(content);
      this.templateCache.set('correction', template);
      return template;
    } catch (_error) {
      // Return inline default
      return {
        tasks: [
          {
            id_template: '{{SD_ID}}-CORRECTION-{{TARGET_PHASE}}',
            subject: 'Correction: {{REASON}}',
            description: 'Fix issues identified in {{TARGET_PHASE}} phase.',
            blockedBy: [],
            metadata: { category: 'correction' }
          }
        ]
      };
    }
  }

  _createCorrectionTasks(sd, oldWallName, newWallName, options) {
    return [
      {
        id: `${sd.id}-CORRECTION-${options.targetPhase}`,
        subject: `Correction: ${options.reason}`,
        description: `Fix issues identified during ${options.targetPhase} phase work.`,
        status: TASK_STATUS.PENDING,
        blockedBy: [],
        metadata: {
          category: 'correction',
          correction_type: options.correctionType,
          target_phase: options.targetPhase
        }
      },
      {
        id: `${sd.id}-CORRECTION-SYNTHESIS`,
        subject: 'Correction Synthesis',
        description: 'Verify all corrections have been applied.',
        status: TASK_STATUS.PENDING,
        blockedBy: [`${sd.id}-CORRECTION-${options.targetPhase}`],
        metadata: {
          category: 'correction',
          depends_on_correction: true
        }
      },
      {
        id: newWallName,
        subject: `${oldWallName.replace('-WALL', '')} Validation (V2)`,
        description: `Re-validate ${oldWallName.replace('-WALL', '')} phase after corrections.`,
        status: TASK_STATUS.PENDING,
        blockedBy: [`${sd.id}-CORRECTION-SYNTHESIS`],
        metadata: {
          category: 'wall',
          is_phase_boundary: true,
          replaces_wall: oldWallName
        }
      }
    ];
  }

  async _pausePhaseTask(sdUuid, phase, _options) {
    // Note: This would integrate with actual task tracking system
    // For now, we record the intent
    console.log(`      Pausing tasks in ${phase} phase`);

    return []; // Placeholder - actual task IDs would come from task tracking
  }

  async _resumePausedTasks(sdUuid, taskIds, _options) {
    // Note: This would integrate with actual task tracking system
    console.log(`      Resuming ${taskIds?.length || 0} paused tasks`);

    return taskIds || [];
  }

  async _getNextWallVersion(sdUuid, wallName) {
    // Count existing versions of this wall
    const { data } = await this.supabase
      .from('sd_wall_states')
      .select('wall_name')
      .eq('sd_id', sdUuid)
      .like('wall_name', `${wallName}%`);

    return (data?.length || 0) + 1;
  }

  _getPhaseFromWall(wallName) {
    // LEAD-WALL guards PLAN, PLAN-WALL guards EXEC, etc.
    const wallToGuardedPhase = {
      'LEAD-WALL': 'LEAD',
      'PLAN-WALL': 'PLAN',
      'EXEC-WALL': 'EXEC',
      'VERIFY-WALL': 'VERIFY',
      'SAFETY-WALL': 'SAFETY'
    };

    // Extract base wall name (handle versioned walls like PLAN-WALL-V2)
    const baseWall = wallName.replace(/-V\d+$/, '');
    return wallToGuardedPhase[baseWall] || 'EXEC';
  }

  _getNextPhase(currentPhase, track) {
    const config = TRACK_CONFIG[track];
    if (!config) return null;

    const currentIndex = config.phases.indexOf(currentPhase);
    if (currentIndex === -1 || currentIndex >= config.phases.length - 1) {
      return null;
    }

    return config.phases[currentIndex + 1];
  }
}

// Export constants
export { TASK_STATUS, CORRECTION_TYPE };

export default CorrectionManager;
