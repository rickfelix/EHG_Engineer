/**
 * LEOPlanModeOrchestrator - Claude Code Plan Mode Integration
 * Orchestrates automatic Plan Mode activation at LEO Protocol phase boundaries.
 *
 * SD-PLAN-MODE-002: Writes LEO protocol action plans to Claude Code's plan file
 * SD-PLAN-MODE-003: Intelligent SD-type aware plan generation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPermissionsForPhase, getCombinedPermissions } from './phase-permissions.js';
import { getPlanTemplate, getPlanFilename } from './plan-templates.js';
import { loadSDContext } from './sd-context-loader.js';
import { generateIntelligentPlan, getPlanFilename as getIntelligentFilename } from './intelligent-plan-templates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '/tmp';

const PLAN_MODE_STATE_FILE = path.join(HOME_DIR, '.claude-plan-mode-state.json');

// Claude Code stores plans in ~/.claude/plans/
const CLAUDE_PLANS_DIR = path.join(HOME_DIR, '.claude', 'plans');

const LEO_CONFIG_FILE = path.join(__dirname, '../../../.claude/leo-plan-mode-config.json');

export class LEOPlanModeOrchestrator {
  constructor(options = {}) {
    this.verbose = options.verbose ?? false;
  }

  isEnabled() {
    try {
      if (fs.existsSync(LEO_CONFIG_FILE)) {
        const config = JSON.parse(fs.readFileSync(LEO_CONFIG_FILE, 'utf8'));
        return config.leo_plan_mode?.enabled !== false;
      }
    } catch (error) {
      this._log('warn', `Could not read config: ${error.message}`);
    }
    return true;
  }

  getState() {
    try {
      if (fs.existsSync(PLAN_MODE_STATE_FILE)) {
        return JSON.parse(fs.readFileSync(PLAN_MODE_STATE_FILE, 'utf8'));
      }
    } catch (error) {
      this._log('warn', `Could not read state: ${error.message}`);
    }
    return null;
  }

  _saveState(state) {
    try {
      fs.writeFileSync(PLAN_MODE_STATE_FILE, JSON.stringify(state, null, 2));
    } catch (error) {
      this._log('error', `Could not save state: ${error.message}`);
    }
  }

  /**
   * Write LEO protocol plan to Claude Code's plan file
   * SD-PLAN-MODE-002: Basic plan file writing
   * SD-PLAN-MODE-003: Intelligent SD-type aware plan generation
   */
  async writePlanFile(sdId, phase, sdTitle = null) {
    try {
      // Ensure plans directory exists
      if (!fs.existsSync(CLAUDE_PLANS_DIR)) {
        fs.mkdirSync(CLAUDE_PLANS_DIR, { recursive: true });
        this._log('info', `Created plans directory: ${CLAUDE_PLANS_DIR}`);
      }

      // SD-PLAN-MODE-003: Load SD context from database for intelligent plan generation
      const contextResult = await loadSDContext(sdId);
      let planContent;
      let sdContext;

      if (contextResult.success && contextResult.sd) {
        sdContext = contextResult.sd;
        this._log('info', `SD context loaded: ${sdContext.type} (${sdContext.complexity})`);

        // Generate intelligent plan based on SD type and context
        planContent = generateIntelligentPlan(phase, sdContext);
      } else {
        // Fallback to basic template
        this._log('info', `Using fallback context: ${contextResult.error || 'unknown'}`);
        sdContext = contextResult.sd || { id: sdId, title: sdTitle };
        planContent = getPlanTemplate(phase, sdId, sdTitle);
      }

      const filename = getIntelligentFilename(sdId, phase);
      const planPath = path.join(CLAUDE_PLANS_DIR, filename);

      fs.writeFileSync(planPath, planContent, 'utf8');
      this._log('info', `Plan file written: ${filename}`);

      return {
        success: true,
        path: planPath,
        filename,
        sdContext,
        intelligent: contextResult.success
      };
    } catch (error) {
      this._log('error', `Could not write plan file: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Write plan file synchronously (fallback for non-async contexts)
   */
  writePlanFileSync(sdId, phase, sdTitle = null) {
    try {
      if (!fs.existsSync(CLAUDE_PLANS_DIR)) {
        fs.mkdirSync(CLAUDE_PLANS_DIR, { recursive: true });
      }

      const filename = getPlanFilename(sdId, phase);
      const planPath = path.join(CLAUDE_PLANS_DIR, filename);
      const planContent = getPlanTemplate(phase, sdId, sdTitle);

      fs.writeFileSync(planPath, planContent, 'utf8');
      return { success: true, path: planPath, filename, intelligent: false };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get the current plan file path for an SD
   */
  getPlanFilePath(sdId, phase) {
    const filename = getPlanFilename(sdId, phase);
    return path.join(CLAUDE_PLANS_DIR, filename);
  }

  /**
   * Read the current plan file content
   */
  readPlanFile(sdId, phase) {
    try {
      const planPath = this.getPlanFilePath(sdId, phase);
      if (fs.existsSync(planPath)) {
        return fs.readFileSync(planPath, 'utf8');
      }
    } catch (error) {
      this._log('warn', `Could not read plan file: ${error.message}`);
    }
    return null;
  }

  async requestPlanModeEntry(options) {
    const { sdId, phase, reason = 'phase_transition', sdTitle = null } = options;

    if (!this.isEnabled()) {
      return { success: false, skipped: true, reason: 'Plan Mode integration disabled' };
    }

    const normalizedPhase = (phase || 'LEAD').toUpperCase();

    // SD-PLAN-MODE-003: Write intelligent LEO protocol plan
    const planResult = await this.writePlanFile(sdId, normalizedPhase, sdTitle);

    const state = {
      requested: true,
      sdId,
      phase: normalizedPhase,
      reason,
      requestedAt: new Date().toISOString(),
      permissions: getPermissionsForPhase(phase),
      planFile: planResult.success ? planResult.path : null,
      intelligent: planResult.intelligent || false,
      sdType: planResult.sdContext?.type || null
    };

    this._saveState(state);
    this._log('info', `Plan Mode entry requested for ${state.phase} phase`);

    if (planResult.success) {
      this._log('info', `LEO plan loaded: ${planResult.filename}`);
      if (planResult.intelligent) {
        this._log('info', `Intelligent plan: ${planResult.sdContext?.typeProfile?.name || 'unknown'} type`);
      }
    }

    return {
      success: true,
      state,
      planFile: planResult,
      sdContext: planResult.sdContext,
      message: this._formatPlanModeMessage(state, planResult.sdContext)
    };
  }

  async requestPlanModeExit(options) {
    const { sdId, phase, allowedPrompts } = options;

    if (!this.isEnabled()) {
      return { success: false, skipped: true, reason: 'Plan Mode integration disabled' };
    }

    const permissions = allowedPrompts || getPermissionsForPhase(phase);

    const state = {
      requested: false,
      exiting: true,
      sdId,
      phase: (phase || 'EXEC').toUpperCase(),
      permissions,
      exitRequestedAt: new Date().toISOString()
    };

    this._saveState(state);
    this._log('info', `Plan Mode exit requested for ${state.phase} phase`);

    return {
      success: true,
      state,
      permissions,
      message: `Exit Plan Mode with ${permissions.length} pre-approved permissions for ${state.phase} phase`
    };
  }

  getPhasePermissions(phase) {
    return getPermissionsForPhase(phase);
  }

  getCombinedPhasePermissions(phases) {
    return getCombinedPermissions(phases);
  }

  _formatPlanModeMessage(state, sdContext = null) {
    const planInfo = state.planFile
      ? `Plan: LEO ${state.phase} actions loaded`
      : 'Plan: (no plan file)';

    // SD-PLAN-MODE-003: Show SD type info when available
    const typeInfo = sdContext?.typeProfile
      ? `Type: ${sdContext.typeProfile.name} | Complexity: ${sdContext.complexity}`
      : null;

    const intelligentInfo = state.intelligent
      ? 'Mode: Intelligent (DB context)'
      : 'Mode: Basic (fallback)';

    const lines = [
      '',
      '╔═════════════════════════════════════════════════════════╗',
      `║  LEO Plan Mode ACTIVE - ${state.phase} Phase`.padEnd(58) + '║',
      '╠═════════════════════════════════════════════════════════╣',
      `║  SD: ${(state.sdId || 'Unknown').substring(0, 50)}`.padEnd(58) + '║',
    ];

    if (typeInfo) {
      lines.push(`║  ${typeInfo}`.padEnd(58) + '║');
    }

    lines.push(
      `║  ${planInfo}`.padEnd(58) + '║',
      `║  ${intelligentInfo}`.padEnd(58) + '║',
      `║  Permissions: ${state.permissions.length} pre-approved`.padEnd(58) + '║',
      '╚═════════════════════════════════════════════════════════╝',
      ''
    );

    return lines.join('\n');
  }

  async handlePhaseTransition(options) {
    const { sdId, fromPhase, toPhase, handoffType } = options;

    if (!this.isEnabled()) {
      return { success: true, skipped: true, reason: 'Plan Mode integration disabled' };
    }

    this._log('info', `Phase transition: ${fromPhase || 'START'} -> ${toPhase}`);

    if (toPhase === 'EXEC') {
      return this.requestPlanModeExit({ sdId, phase: 'EXEC' });
    }

    return this.requestPlanModeEntry({
      sdId,
      phase: toPhase,
      reason: `Transition from ${fromPhase || 'START'} via ${handoffType || 'direct'}`
    });
  }

  clearState() {
    try {
      if (fs.existsSync(PLAN_MODE_STATE_FILE)) {
        fs.unlinkSync(PLAN_MODE_STATE_FILE);
      }
    } catch (error) {
      this._log('warn', `Could not clear state: ${error.message}`);
    }
  }

  _log(level, message) {
    if (this.verbose || level === 'error') {
      const prefix = { info: '[plan-mode]', warn: '[plan-mode] WARNING:', error: '[plan-mode] ERROR:' }[level] || '[plan-mode]';
      console.log(`${prefix} ${message}`);
    }
  }
}

export default LEOPlanModeOrchestrator;
