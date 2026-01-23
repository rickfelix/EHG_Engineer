/**
 * LEO 5.0 Task Hydrator
 *
 * Generates phase-specific task lists at handoff transitions.
 * Tasks are NOT pre-compiled at SD creation - they are hydrated on-demand.
 *
 * Key responsibilities:
 * 1. Load track-specific templates
 * 2. Interpolate variables ({{SD_ID}}, {{SD_TITLE}}, etc.)
 * 3. Create tasks with blockedBy dependencies
 * 4. Record hydration events to database
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { selectTrack, TRACK_CONFIG } from './track-selector.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, 'templates', 'tracks');

/**
 * TaskHydrator class - generates tasks at phase transitions
 */
export class TaskHydrator {
  constructor(supabase) {
    this.supabase = supabase;
    this.templateCache = new Map();
  }

  /**
   * Load an SD from the database
   * @param {string} sdId - SD identifier (id or uuid_id)
   * @returns {Object} SD data
   */
  async loadSD(sdId) {
    // Try by id first, then by uuid_id
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

    if (error) {
      throw new Error(`Failed to load SD ${sdId}: ${error.message}`);
    }

    return sd;
  }

  /**
   * Load a template for a specific track and phase
   * @param {string} track - Track name (FULL, STANDARD, FAST, HOTFIX)
   * @param {string} phase - Phase name (LEAD, PLAN, EXEC, VERIFY, SAFETY, FINAL)
   * @returns {Object} Template data
   */
  async loadTemplate(track, phase) {
    const cacheKey = `${track}-${phase}`;

    if (this.templateCache.has(cacheKey)) {
      return this.templateCache.get(cacheKey);
    }

    const templatePath = join(TEMPLATES_DIR, track.toLowerCase(), `${phase.toLowerCase()}.json`);

    try {
      const content = await readFile(templatePath, 'utf-8');
      const template = JSON.parse(content);
      this.templateCache.set(cacheKey, template);
      return template;
    } catch (err) {
      throw new Error(`Failed to load template ${templatePath}: ${err.message}`);
    }
  }

  /**
   * Interpolate variables in a string
   * @param {string} str - String with {{VARIABLE}} placeholders
   * @param {Object} vars - Variable values
   * @returns {string} Interpolated string
   */
  interpolateString(str, vars) {
    if (!str) return str;
    return str.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
  }

  /**
   * Interpolate variables in task templates
   * @param {Array} tasks - Array of task templates
   * @param {Object} vars - Variable values
   * @returns {Array} Interpolated tasks
   */
  interpolateTasks(tasks, vars) {
    return tasks.map(task => ({
      ...task,
      id: this.interpolateString(task.id_template, vars),
      subject: this.interpolateString(task.subject, vars),
      description: this.interpolateString(task.description, vars),
      activeForm: this.interpolateString(task.activeForm, vars),
      blockedBy: task.blockedBy.map(dep => this.interpolateString(dep, vars))
    }));
  }

  /**
   * Evaluate conditional tasks
   * @param {Array} tasks - Array of tasks
   * @param {Object} sd - SD data for condition evaluation
   * @returns {Array} Filtered tasks (conditionals evaluated)
   */
  evaluateConditionals(tasks, sd) {
    return tasks.filter(task => {
      if (!task.metadata?.conditional) {
        return true;
      }

      const condition = task.metadata.conditional;

      // Simple condition evaluation (safe subset)
      try {
        // Support common conditions
        if (condition === 'sd.security_relevant') {
          return sd.security_relevant === true;
        }
        if (condition === "sd.risk_level !== 'low'") {
          return sd.risk_level !== 'low';
        }
        if (condition.includes('sd.sd_type in')) {
          const typesMatch = condition.match(/\[([^\]]+)\]/);
          if (typesMatch) {
            const types = typesMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
            return types.includes(sd.sd_type);
          }
        }

        // Default: include task
        return true;
      } catch {
        // On error, include task
        return true;
      }
    });
  }

  /**
   * Hydrate tasks for a specific phase
   * @param {string} sdId - SD identifier
   * @param {string} targetPhase - Phase to hydrate tasks for
   * @param {Object} options - Hydration options
   * @returns {Object} Hydration result
   */
  async hydratePhase(sdId, targetPhase, options = {}) {
    // 1. Load SD metadata
    const sd = await this.loadSD(sdId);

    // 2. Determine track
    const trackResult = selectTrack(sd);
    const track = options.forceTrack || trackResult.track;

    // 3. Verify phase is valid for track
    const trackConfig = TRACK_CONFIG[track];
    if (!trackConfig.phases.includes(targetPhase)) {
      throw new Error(`Phase ${targetPhase} is not valid for track ${track}. Valid phases: ${trackConfig.phases.join(', ')}`);
    }

    // 4. Load template for track + phase
    const template = await this.loadTemplate(track, targetPhase);

    // 5. Build interpolation variables
    const vars = {
      SD_ID: sd.id,
      SD_TITLE: sd.title,
      SD_TYPE: sd.sd_type,
      TARGET_APP: sd.target_application || 'EHG',
      TRACK: track
    };

    // 6. Interpolate tasks
    let tasks = this.interpolateTasks(template.tasks, vars);

    // 7. Evaluate conditionals
    tasks = this.evaluateConditionals(tasks, sd);

    // 8. Record hydration event
    const hydrationRecord = {
      sd_id: sd.uuid_id || sd.id,
      phase: targetPhase,
      track,
      tasks_created: tasks.length,
      task_ids: tasks.map(t => t.id),
      template_version: template.version || '1.0',
      variables_used: vars,
      escalated: trackResult.escalated,
      escalation_reason: trackResult.escalationReason,
      hydrated_at: new Date().toISOString()
    };

    // Try to record to database (non-blocking if table doesn't exist yet)
    try {
      await this.supabase
        .from('task_hydration_log')
        .insert(hydrationRecord);
    } catch (err) {
      console.warn('Could not record hydration event (table may not exist):', err.message);
    }

    return {
      sd,
      track,
      trackConfig,
      phase: targetPhase,
      tasks,
      hydrationRecord,
      subAgents: trackResult.subAgents
    };
  }

  /**
   * Get the next phase for a track
   * @param {string} track - Track name
   * @param {string} currentPhase - Current phase
   * @returns {string|null} Next phase or null if complete
   */
  getNextPhase(track, currentPhase) {
    const config = TRACK_CONFIG[track];
    if (!config) return null;

    const currentIndex = config.phases.indexOf(currentPhase);
    if (currentIndex === -1 || currentIndex >= config.phases.length - 1) {
      return null;
    }

    return config.phases[currentIndex + 1];
  }

  /**
   * Get the wall task ID for a phase
   * @param {string} sdId - SD identifier
   * @param {string} phase - Phase name
   * @returns {string} Wall task ID
   */
  getWallTaskId(sdId, phase) {
    if (phase === 'SAFETY') {
      return `${sdId}-SAFETY-WALL`;
    }
    if (phase === 'FINAL') {
      return `${sdId}-FINAL-APPROVE`;
    }
    return `${sdId}-${phase}-WALL`;
  }

  /**
   * Validate that a handoff can proceed
   * @param {string} sdId - SD identifier
   * @param {string} fromPhase - Source phase
   * @param {string} toPhase - Target phase
   * @returns {Object} Validation result
   */
  async validateHandoff(sdId, fromPhase, toPhase) {
    const sd = await this.loadSD(sdId);
    const trackResult = selectTrack(sd);
    const track = trackResult.track;
    const config = TRACK_CONFIG[track];

    // Check phases are valid for track
    const fromIndex = config.phases.indexOf(fromPhase);
    const toIndex = config.phases.indexOf(toPhase);

    if (fromIndex === -1) {
      return {
        valid: false,
        reason: `Phase ${fromPhase} is not valid for track ${track}`
      };
    }

    if (toIndex === -1) {
      return {
        valid: false,
        reason: `Phase ${toPhase} is not valid for track ${track}`
      };
    }

    // Check phases are adjacent (or allowed skip for FAST track)
    if (toIndex !== fromIndex + 1) {
      // Check if this is an allowed skip (FAST track skips PLAN)
      if (track === 'FAST' && fromPhase === 'LEAD' && toPhase === 'EXEC') {
        // Allowed: FAST track skips PLAN
      } else {
        return {
          valid: false,
          reason: `Cannot transition from ${fromPhase} to ${toPhase}. Expected next phase: ${config.phases[fromIndex + 1]}`
        };
      }
    }

    return {
      valid: true,
      track,
      fromPhase,
      toPhase,
      sd
    };
  }
}

/**
 * Create a TaskHydrator instance with Supabase client
 * @param {Object} supabase - Supabase client
 * @returns {TaskHydrator} TaskHydrator instance
 */
export function createTaskHydrator(supabase) {
  return new TaskHydrator(supabase);
}

export default TaskHydrator;
