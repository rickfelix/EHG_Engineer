#!/usr/bin/env node

/**
 * Unified State Manager
 * SD-LEO-INFRA-UNIFY-CONTEXT-PRESERVATION-001
 *
 * Provides a single coordinated state file for all context preservation mechanisms:
 * - PreCompact hook
 * - SessionStart hook
 * - /context-compact command
 * - persist-session-state checkpoints
 *
 * State file location: .claude/unified-session-state.json
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const STATE_FILE_NAME = 'unified-session-state.json';
const STATE_DIR = '.claude';
const MAX_AGE_MINUTES = 30; // Consider state "recent" if less than this

/**
 * Schema for unified state file
 */
const STATE_SCHEMA = {
  version: '1.0.0',
  required: ['version', 'timestamp', 'trigger'],
  properties: {
    version: { type: 'string' },
    timestamp: { type: 'string' },
    trigger: { type: 'string', enum: ['precompact', 'manual', 'checkpoint', 'threshold'] },
    git: {
      type: 'object',
      properties: {
        branch: { type: 'string' },
        status: { type: 'string' },
        recentCommits: { type: 'array' },
        modifiedFiles: { type: 'array' },
        stagedChanges: { type: 'string' }
      }
    },
    sd: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        phase: { type: 'string' },
        progress: { type: 'number' }
      }
    },
    workflow: {
      type: 'object',
      properties: {
        currentPhase: { type: 'string' },
        lastHandoff: { type: 'string' },
        toolExecutions: { type: 'number' }
      }
    },
    summaries: {
      type: 'object',
      properties: {
        contextHighlights: { type: 'array' },
        keyDecisions: { type: 'array' },
        pendingActions: { type: 'array' }
      }
    }
  }
};

class UnifiedStateManager {
  constructor(projectDir = null) {
    this.projectDir = projectDir || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    this.stateDir = path.join(this.projectDir, STATE_DIR);
    this.stateFile = path.join(this.stateDir, STATE_FILE_NAME);
  }

  /**
   * Ensure state directory exists
   */
  ensureStateDir() {
    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true });
    }
  }

  /**
   * Get git state safely
   */
  getGitState() {
    try {
      const branch = execSync('git branch --show-current', {
        cwd: this.projectDir,
        encoding: 'utf8',
        timeout: 5000
      }).trim();

      const status = execSync('git status --porcelain', {
        cwd: this.projectDir,
        encoding: 'utf8',
        timeout: 5000
      }).trim();

      const recentCommits = execSync('git log -5 --oneline', {
        cwd: this.projectDir,
        encoding: 'utf8',
        timeout: 5000
      }).trim().split('\n').filter(Boolean);

      const stagedChanges = execSync('git diff --cached --stat', {
        cwd: this.projectDir,
        encoding: 'utf8',
        timeout: 5000
      }).trim();

      let modifiedFiles = [];
      try {
        modifiedFiles = execSync('git diff --name-only HEAD~5', {
          cwd: this.projectDir,
          encoding: 'utf8',
          timeout: 5000
        }).trim().split('\n').filter(Boolean).slice(0, 20);
      } catch {
        // If HEAD~5 doesn't exist, use status
        modifiedFiles = status.split('\n').map(line => line.substring(3)).filter(Boolean);
      }

      return { branch, status, recentCommits, modifiedFiles, stagedChanges };
    } catch (error) {
      return {
        branch: 'unknown',
        status: '',
        recentCommits: [],
        modifiedFiles: [],
        stagedChanges: '',
        error: error.message
      };
    }
  }

  /**
   * Get current SD info from working directory or database
   */
  async getSDState() {
    // Try to read from existing session state first
    const legacyState = path.join(this.stateDir, 'session-state.md');
    if (fs.existsSync(legacyState)) {
      const content = fs.readFileSync(legacyState, 'utf8');
      const sdMatch = content.match(/SD[- ]?ID[:\s]*([A-Z0-9-]+)/i);
      const phaseMatch = content.match(/Phase[:\s]*([A-Z_]+)/i);
      if (sdMatch) {
        return {
          id: sdMatch[1],
          title: 'Loaded from session-state.md',
          phase: phaseMatch ? phaseMatch[1] : 'unknown',
          progress: 0
        };
      }
    }

    return { id: null, title: null, phase: null, progress: null };
  }

  /**
   * Get workflow state
   */
  getWorkflowState() {
    return {
      currentPhase: 'unknown',
      lastHandoff: null,
      toolExecutions: 0
    };
  }

  /**
   * Build comprehensive state object
   */
  async buildState(trigger = 'manual', additionalData = {}) {
    const git = this.getGitState();
    const sd = await this.getSDState();
    const workflow = this.getWorkflowState();

    return {
      version: STATE_SCHEMA.version,
      timestamp: new Date().toISOString(),
      trigger,
      git,
      sd,
      workflow,
      summaries: {
        contextHighlights: additionalData.highlights || [],
        keyDecisions: additionalData.decisions || [],
        pendingActions: additionalData.actions || []
      },
      ...additionalData.extra
    };
  }

  /**
   * Save state to unified file (atomic write)
   */
  async saveState(trigger = 'manual', additionalData = {}) {
    this.ensureStateDir();

    const state = await this.buildState(trigger, additionalData);
    const tempFile = `${this.stateFile}.tmp`;

    // Atomic write: write to temp, then rename
    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tempFile, this.stateFile);

    return state;
  }

  /**
   * Load state from unified file
   */
  loadState() {
    if (!fs.existsSync(this.stateFile)) {
      return null;
    }

    try {
      const content = fs.readFileSync(this.stateFile, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`[UnifiedState] Error loading state: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if state is recent (within MAX_AGE_MINUTES)
   */
  isStateRecent() {
    if (!fs.existsSync(this.stateFile)) {
      return false;
    }

    const stat = fs.statSync(this.stateFile);
    const ageMs = Date.now() - stat.mtime.getTime();
    const ageMinutes = ageMs / (1000 * 60);

    return ageMinutes < MAX_AGE_MINUTES;
  }

  /**
   * Get state age in minutes
   */
  getStateAge() {
    if (!fs.existsSync(this.stateFile)) {
      return null;
    }

    const stat = fs.statSync(this.stateFile);
    const ageMs = Date.now() - stat.mtime.getTime();
    return Math.round(ageMs / (1000 * 60));
  }

  /**
   * Format state for console output (used by SessionStart)
   */
  formatStateForOutput(state) {
    if (!state) {
      return '[STATE] No preserved state found';
    }

    const lines = [];
    lines.push('');
    lines.push('='.repeat(60));
    lines.push('[CONTEXT RESTORED] Session state from ' + state.timestamp);
    lines.push('='.repeat(60));

    // Git info
    if (state.git) {
      lines.push(`[GIT] Branch: ${state.git.branch}`);
      if (state.git.status) {
        const changes = state.git.status.split('\n').filter(Boolean).length;
        lines.push(`[GIT] Uncommitted changes: ${changes}`);
      }
      if (state.git.recentCommits && state.git.recentCommits.length > 0) {
        lines.push(`[GIT] Latest commit: ${state.git.recentCommits[0]}`);
      }
    }

    // SD info
    if (state.sd && state.sd.id) {
      lines.push(`[SD] Working on: ${state.sd.id}`);
      if (state.sd.phase) {
        lines.push(`[SD] Phase: ${state.sd.phase}`);
      }
    }

    // Workflow
    if (state.workflow && state.workflow.currentPhase !== 'unknown') {
      lines.push(`[WORKFLOW] Phase: ${state.workflow.currentPhase}`);
    }

    // Summaries
    if (state.summaries) {
      if (state.summaries.pendingActions && state.summaries.pendingActions.length > 0) {
        lines.push(`[TODO] Pending actions: ${state.summaries.pendingActions.length}`);
        state.summaries.pendingActions.slice(0, 3).forEach(action => {
          lines.push(`       - ${action}`);
        });
      }
    }

    lines.push('='.repeat(60));
    lines.push('[TIP] Run "npm run sd:next" to see the SD queue');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Validate state against schema
   */
  validateState(state) {
    if (!state) return { valid: false, errors: ['State is null'] };

    const errors = [];

    // Check required fields
    for (const field of STATE_SCHEMA.required) {
      if (!(field in state)) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Check version
    if (state.version !== STATE_SCHEMA.version) {
      errors.push(`Version mismatch: expected ${STATE_SCHEMA.version}, got ${state.version}`);
    }

    // Check trigger enum
    if (state.trigger && !STATE_SCHEMA.properties.trigger.enum.includes(state.trigger)) {
      errors.push(`Invalid trigger: ${state.trigger}`);
    }

    return { valid: errors.length === 0, errors };
  }
}

export default UnifiedStateManager;
export { STATE_SCHEMA, STATE_FILE_NAME, STATE_DIR };
