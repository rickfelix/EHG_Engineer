/**
 * LEOPlanModeOrchestrator - Claude Code Plan Mode Integration
 * Orchestrates automatic Plan Mode activation at LEO Protocol phase boundaries.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPermissionsForPhase, getCombinedPermissions } from './phase-permissions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLAN_MODE_STATE_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.claude-plan-mode-state.json'
);

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

  async requestPlanModeEntry(options) {
    const { sdId, phase, reason = 'phase_transition' } = options;

    if (!this.isEnabled()) {
      return { success: false, skipped: true, reason: 'Plan Mode integration disabled' };
    }

    const state = {
      requested: true,
      sdId,
      phase: (phase || 'LEAD').toUpperCase(),
      reason,
      requestedAt: new Date().toISOString(),
      permissions: getPermissionsForPhase(phase)
    };

    this._saveState(state);
    this._log('info', `Plan Mode entry requested for ${state.phase} phase`);

    return {
      success: true,
      state,
      message: this._formatPlanModeMessage(state)
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

  _formatPlanModeMessage(state) {
    const lines = [
      '',
      '+---------------------------------------------------------+',
      `|  Plan Mode ACTIVE for ${state.phase} phase`.padEnd(58) + '|',
      '+---------------------------------------------------------+',
      `|  SD: ${(state.sdId || 'Unknown').substring(0, 50)}`.padEnd(58) + '|',
      `|  Permissions: ${state.permissions.length} pre-approved`.padEnd(58) + '|',
      '+---------------------------------------------------------+',
      ''
    ];
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
