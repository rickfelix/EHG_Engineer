#!/usr/bin/env node

/**
 * Unified State Manager v2.0
 * SD-LEO-INFRA-UPGRADE-CONTEXT-PRESERVATION-001
 *
 * Research-Based Memory Architecture:
 * - ReSum (2025): Reasoning state checkpoints with structured sections
 * - RECOMP (ICLR 2024): Utility-optimized compression with token budget
 * - MemGPT (2023): Tiered memory hierarchy
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
import os from 'os';
import { execSync } from 'child_process';

const STATE_FILE_NAME = 'unified-session-state.json';
const STATE_DIR = '.claude';
const MAX_AGE_MINUTES = 30; // Consider state "recent" if less than this

/**
 * Get session-scoped state filename (SD-LEO-INFRA-CLAIM-GUARD-001: US-004).
 * Prevents cross-session state contamination on shared machines.
 * Falls back to legacy shared filename if session ID unavailable.
 * @returns {string} Session-scoped or legacy filename
 */
function getSessionScopedStateFileName() {
  try {
    const sessionDir = path.join(os.homedir(), '.claude-sessions');
    if (fs.existsSync(sessionDir)) {
      const pid = process.ppid || process.pid;
      const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(sessionDir, file), 'utf8'));
          if (data.pid === pid && data.session_id) {
            return `unified-session-state.${data.session_id}.json`;
          }
        } catch { /* skip */ }
      }
    }
  } catch { /* fallback to legacy */ }
  return STATE_FILE_NAME; // Legacy fallback
}

// Token budget configuration (ReSum/RECOMP research)
const TOKEN_BUDGET = {
  min: 300,      // Minimum tokens for meaningful context
  target: 800,   // Optimal token count
  max: 1200,     // Maximum tokens before truncation
  charsPerToken: 4  // Approximate characters per token
};

// Maximum entries per section to prevent unbounded growth
const MAX_ENTRIES = {
  decisions: 10,
  constraints: 10,
  openQuestions: 5,
  evidenceLedger: 15,
  contextHighlights: 5,
  pendingActions: 10
};

/**
 * Schema for unified state file v2.0
 * Enhanced with research-based sections
 */
const STATE_SCHEMA = {
  version: '2.0.0',
  required: ['version', 'timestamp', 'trigger'],
  properties: {
    version: { type: 'string' },
    timestamp: { type: 'string' },
    trigger: { type: 'string', enum: ['precompact', 'manual', 'checkpoint', 'threshold'] },

    // Git state
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

    // SD context
    sd: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        phase: { type: 'string' },
        progress: { type: 'number' }
      }
    },

    // Workflow state
    workflow: {
      type: 'object',
      properties: {
        currentPhase: { type: 'string' },
        lastHandoff: { type: 'string' },
        toolExecutions: { type: 'number' }
      }
    },

    // Legacy summaries (backward compatible)
    summaries: {
      type: 'object',
      properties: {
        contextHighlights: { type: 'array' },
        keyDecisions: { type: 'array' },
        pendingActions: { type: 'array' }
      }
    },

    // NEW: Research-based structured sections (ReSum 2025)

    // Decisions made during session with rationale
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },        // D1, D2, etc.
          decision: { type: 'string' },   // What was decided
          rationale: { type: 'string' },  // Why
          timestamp: { type: 'string' },
          reversible: { type: 'boolean' }
        }
      }
    },

    // Constraints discovered or enforced
    constraints: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },         // C1, C2, etc.
          constraint: { type: 'string' },  // What the constraint is
          source: { type: 'string' },      // Where it came from (code, user, system)
          blocking: { type: 'boolean' },   // Is it blocking progress?
          timestamp: { type: 'string' }
        }
      }
    },

    // Open questions requiring resolution
    openQuestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },       // Q1, Q2, etc.
          question: { type: 'string' },  // The question
          context: { type: 'string' },   // Why it matters
          priority: { type: 'string' },  // high, medium, low
          timestamp: { type: 'string' }
        }
      }
    },

    // NEW: Verbatim evidence ledger (prevents paraphrasing errors)
    evidenceLedger: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },      // E1, E2, etc.
          type: { type: 'string' },    // error, command, output, observation
          content: { type: 'string' }, // VERBATIM content
          source: { type: 'string' },  // Where it came from
          timestamp: { type: 'string' }
        }
      }
    },

    // Token budget metadata
    tokenMetrics: {
      type: 'object',
      properties: {
        estimatedTokens: { type: 'number' },
        budgetStatus: { type: 'string' },  // healthy, warning, over_budget
        lastTruncation: { type: 'string' }
      }
    }
  }
};

class UnifiedStateManager {
  constructor(projectDir = null) {
    this.projectDir = projectDir || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    this.stateDir = path.join(this.projectDir, STATE_DIR);
    // SD-LEO-INFRA-CLAIM-GUARD-001: Session-scoped state file
    const scopedName = getSessionScopedStateFileName();
    this.stateFile = path.join(this.stateDir, scopedName);
    // Legacy path for read fallback (if scoped file doesn't exist yet)
    this.legacyStateFile = path.join(this.stateDir, STATE_FILE_NAME);
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
   * Estimate token count for a string (approximate)
   */
  estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / TOKEN_BUDGET.charsPerToken);
  }

  /**
   * Estimate total tokens for state object
   */
  estimateStateTokens(state) {
    const json = JSON.stringify(state);
    return this.estimateTokens(json);
  }

  /**
   * Truncate array to fit within token budget
   * Keeps most recent entries (priority-based for questions)
   */
  truncateForBudget(array, maxEntries, priorityField = null) {
    if (!array || array.length <= maxEntries) return array;

    if (priorityField) {
      // Sort by priority (high first), then by recency
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return array
        .sort((a, b) => {
          const aPri = priorityOrder[a[priorityField]] ?? 1;
          const bPri = priorityOrder[b[priorityField]] ?? 1;
          if (aPri !== bPri) return aPri - bPri;
          return new Date(b.timestamp) - new Date(a.timestamp);
        })
        .slice(0, maxEntries);
    }

    // Keep most recent
    return array.slice(-maxEntries);
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
   * Get current SD info from database (primary) or local session file (fallback)
   *
   * SD-LEO-INFRA-COMPACTION-CLAIM-001: Fixed to query database instead of
   * reading from legacy session-state.md (which was never written to).
   * This ensures precompact state captures the actual claimed SD.
   */
  async getSDState() {
    // Primary: Query database for current session's claimed SD
    try {
      const dbState = await this._getSDStateFromDatabase();
      if (dbState) return dbState;
    } catch {
      // Database unavailable - fall through to fallbacks
    }

    // Fallback: Check auto-proceed-state.json (written by sd:start)
    try {
      const autoProceedFile = path.join(this.stateDir, 'auto-proceed-state.json');
      if (fs.existsSync(autoProceedFile)) {
        const content = JSON.parse(fs.readFileSync(autoProceedFile, 'utf8'));
        if (content.currentSd) {
          return {
            id: content.currentSd,
            title: content.currentTask || null,
            phase: content.currentPhase || 'unknown',
            progress: 0,
            source: 'auto-proceed-state'
          };
        }
      }
    } catch {
      // Ignore read errors
    }

    return { id: null, title: null, phase: null, progress: null };
  }

  /**
   * Query database for the current session's claimed SD
   * @private
   */
  async _getSDStateFromDatabase() {
    // Find current session ID from local session files
    const sessionId = this._findCurrentSessionId();
    if (!sessionId) return null;

    // Lazy-load Supabase (avoid import-time dependency)
    let supabase;
    try {
      const dotenv = await import('dotenv');
      dotenv.config({ path: path.resolve(this.projectDir, '.env') });
      const { createClient } = await import('@supabase/supabase-js');
      supabase = createClient(
        process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
    } catch {
      return null; // Supabase not available
    }

    // Query session's claimed SD
    const { data: session } = await supabase
      .from('claude_sessions')
      .select('sd_id')
      .eq('session_id', sessionId)
      .single();

    if (!session?.sd_id) return null;

    // Get SD details
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, current_phase, progress_pct')
      .eq('sd_key', session.sd_id)
      .single();

    if (!sd) {
      return {
        id: session.sd_id,
        title: null,
        phase: 'unknown',
        progress: 0,
        source: 'database'
      };
    }

    return {
      id: sd.sd_key,
      title: sd.title,
      phase: sd.current_phase || 'unknown',
      progress: sd.progress_pct || 0,
      source: 'database'
    };
  }

  /**
   * Find the current session ID from local session files
   * Matches by PID (same pattern as session-state-sync.cjs)
   * @private
   */
  _findCurrentSessionId() {
    try {
      const sessionDir = path.join(os.homedir(), '.claude-sessions');
      if (!fs.existsSync(sessionDir)) return null;

      const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.json'));
      const pid = process.ppid || process.pid;

      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(sessionDir, file), 'utf8'));
          if (data.pid === pid) {
            return data.session_id;
          }
        } catch {
          // Skip invalid files
        }
      }
    } catch {
      // Session directory issues
    }
    return null;
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
   * Ensure state has required fields
   */
  ensureStateFields(state) {
    state.version = state.version || STATE_SCHEMA.version;
    state.timestamp = state.timestamp || new Date().toISOString();
    state.trigger = state.trigger || 'manual';
    state.decisions = state.decisions || [];
    state.constraints = state.constraints || [];
    state.openQuestions = state.openQuestions || [];
    state.evidenceLedger = state.evidenceLedger || [];
    state.tokenMetrics = state.tokenMetrics || {
      estimatedTokens: 0,
      budgetStatus: 'healthy',
      lastTruncation: null
    };
    return state;
  }

  /**
   * Add a decision to the state
   */
  addDecision(decision, rationale, reversible = true) {
    let state = this.loadState() || {};
    state = this.ensureStateFields(state);

    const id = `D${state.decisions.length + 1}`;
    state.decisions.push({
      id,
      decision,
      rationale,
      reversible,
      timestamp: new Date().toISOString()
    });

    // Truncate if over limit
    state.decisions = this.truncateForBudget(state.decisions, MAX_ENTRIES.decisions);

    this.saveStateSync(state);
    return id;
  }

  /**
   * Add a constraint to the state
   */
  addConstraint(constraint, source, blocking = false) {
    let state = this.loadState() || {};
    state = this.ensureStateFields(state);

    const id = `C${state.constraints.length + 1}`;
    state.constraints.push({
      id,
      constraint,
      source,
      blocking,
      timestamp: new Date().toISOString()
    });

    // Truncate if over limit
    state.constraints = this.truncateForBudget(state.constraints, MAX_ENTRIES.constraints);

    this.saveStateSync(state);
    return id;
  }

  /**
   * Add an open question to the state
   */
  addOpenQuestion(question, context, priority = 'medium') {
    let state = this.loadState() || {};
    state = this.ensureStateFields(state);

    const id = `Q${state.openQuestions.length + 1}`;
    state.openQuestions.push({
      id,
      question,
      context,
      priority,
      timestamp: new Date().toISOString()
    });

    // Truncate by priority
    state.openQuestions = this.truncateForBudget(
      state.openQuestions,
      MAX_ENTRIES.openQuestions,
      'priority'
    );

    this.saveStateSync(state);
    return id;
  }

  /**
   * Add verbatim evidence to the ledger
   */
  addEvidence(type, content, source) {
    let state = this.loadState() || {};
    state = this.ensureStateFields(state);

    const id = `E${state.evidenceLedger.length + 1}`;
    state.evidenceLedger.push({
      id,
      type,  // error, command, output, observation
      content: content.substring(0, 500),  // Truncate long content
      source,
      timestamp: new Date().toISOString()
    });

    // Truncate if over limit
    state.evidenceLedger = this.truncateForBudget(
      state.evidenceLedger,
      MAX_ENTRIES.evidenceLedger
    );

    this.saveStateSync(state);
    return id;
  }

  /**
   * Resolve an open question
   */
  resolveQuestion(questionId, resolution) {
    const state = this.loadState();
    if (!state || !state.openQuestions) return false;

    const question = state.openQuestions.find(q => q.id === questionId);
    if (question) {
      question.resolved = true;
      question.resolution = resolution;
      question.resolvedAt = new Date().toISOString();
      this.saveStateSync(state);
      return true;
    }
    return false;
  }

  /**
   * Build comprehensive state object
   */
  async buildState(trigger = 'manual', additionalData = {}) {
    const git = this.getGitState();
    const sd = await this.getSDState();
    const workflow = this.getWorkflowState();

    // Load existing structured data
    const existingState = this.loadState() || {};

    const state = {
      version: STATE_SCHEMA.version,
      timestamp: new Date().toISOString(),
      trigger,
      git,
      sd,
      workflow,

      // Legacy summaries (backward compatible)
      summaries: {
        contextHighlights: this.truncateForBudget(
          additionalData.highlights || existingState.summaries?.contextHighlights || [],
          MAX_ENTRIES.contextHighlights
        ),
        keyDecisions: additionalData.decisions || existingState.summaries?.keyDecisions || [],
        pendingActions: this.truncateForBudget(
          additionalData.actions || existingState.summaries?.pendingActions || [],
          MAX_ENTRIES.pendingActions
        )
      },

      // New structured sections (preserve existing, merge new)
      decisions: this.truncateForBudget(
        additionalData.structuredDecisions || existingState.decisions || [],
        MAX_ENTRIES.decisions
      ),
      constraints: this.truncateForBudget(
        additionalData.structuredConstraints || existingState.constraints || [],
        MAX_ENTRIES.constraints
      ),
      openQuestions: this.truncateForBudget(
        additionalData.structuredQuestions || existingState.openQuestions || [],
        MAX_ENTRIES.openQuestions,
        'priority'
      ),
      evidenceLedger: this.truncateForBudget(
        additionalData.evidence || existingState.evidenceLedger || [],
        MAX_ENTRIES.evidenceLedger
      ),

      ...additionalData.extra
    };

    // Calculate and add token metrics
    const estimatedTokens = this.estimateStateTokens(state);
    state.tokenMetrics = {
      estimatedTokens,
      budgetStatus: estimatedTokens < TOKEN_BUDGET.target ? 'healthy' :
                    estimatedTokens < TOKEN_BUDGET.max ? 'warning' : 'over_budget',
      lastTruncation: estimatedTokens > TOKEN_BUDGET.max ? new Date().toISOString() : null
    };

    // Log warning if over budget
    if (estimatedTokens > TOKEN_BUDGET.max) {
      console.warn(`[UnifiedState] Token budget exceeded: ${estimatedTokens} tokens (max: ${TOKEN_BUDGET.max})`);
    }

    return state;
  }

  /**
   * Save state synchronously (for incremental updates)
   */
  saveStateSync(state) {
    this.ensureStateDir();

    // Update token metrics before saving
    const estimatedTokens = this.estimateStateTokens(state);
    state.tokenMetrics = {
      estimatedTokens,
      budgetStatus: estimatedTokens < TOKEN_BUDGET.target ? 'healthy' :
                    estimatedTokens < TOKEN_BUDGET.max ? 'warning' : 'over_budget',
      lastTruncation: estimatedTokens > TOKEN_BUDGET.max ? new Date().toISOString() : null
    };

    // Log warning if over budget
    if (estimatedTokens > TOKEN_BUDGET.max) {
      console.warn(`[UnifiedState] Token budget exceeded: ${estimatedTokens} tokens (max: ${TOKEN_BUDGET.max})`);
    }

    const tempFile = `${this.stateFile}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tempFile, this.stateFile);
    return state;
  }

  /**
   * Save state to unified file (atomic write)
   */
  async saveState(trigger = 'manual', additionalData = {}) {
    this.ensureStateDir();

    const state = await this.buildState(trigger, additionalData);
    return this.saveStateSync(state);
  }

  /**
   * Load state from unified file
   */
  loadState() {
    // SD-LEO-INFRA-CLAIM-GUARD-001: Try session-scoped file first, fall back to legacy
    let targetFile = this.stateFile;
    if (!fs.existsSync(targetFile) && this.legacyStateFile && fs.existsSync(this.legacyStateFile)) {
      targetFile = this.legacyStateFile; // Read-only fallback to legacy shared file
    }
    if (!fs.existsSync(targetFile)) {
      return null;
    }

    try {
      let content = fs.readFileSync(targetFile, 'utf8');
      // Remove BOM if present
      if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
      }
      const state = JSON.parse(content);

      // Handle version migration if needed
      if (state.version === '1.0.0') {
        console.log('[UnifiedState] Migrating from v1.0.0 to v2.0.0');
        state.version = '2.0.0';
        state.decisions = state.decisions || [];
        state.constraints = state.constraints || [];
        state.openQuestions = state.openQuestions || [];
        state.evidenceLedger = state.evidenceLedger || [];
        state.tokenMetrics = state.tokenMetrics || {
          estimatedTokens: this.estimateStateTokens(state),
          budgetStatus: 'healthy',
          lastTruncation: null
        };
      }

      return state;
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
   * Enhanced to include new structured sections
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
        const changes = Array.isArray(state.git.status)
          ? state.git.status.length
          : state.git.status.split('\n').filter(Boolean).length;
        lines.push(`[GIT] Uncommitted changes: ${changes}`);
      }
      if (state.git.recentCommits && state.git.recentCommits.length > 0) {
        lines.push(`[GIT] Latest: ${state.git.recentCommits[0]}`);
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

    // NEW: Decisions (if any)
    if (state.decisions && state.decisions.length > 0) {
      lines.push(`[DECISIONS] ${state.decisions.length} recorded`);
      state.decisions.slice(-3).forEach(d => {
        lines.push(`   ${d.id}: ${d.decision.substring(0, 50)}...`);
      });
    }

    // NEW: Constraints (if any blocking)
    if (state.constraints && state.constraints.length > 0) {
      const blocking = state.constraints.filter(c => c.blocking);
      if (blocking.length > 0) {
        lines.push(`[CONSTRAINTS] ${blocking.length} BLOCKING`);
        blocking.forEach(c => {
          lines.push(`   ${c.id}: ${c.constraint.substring(0, 50)}...`);
        });
      }
    }

    // NEW: Open Questions (high priority first)
    if (state.openQuestions && state.openQuestions.length > 0) {
      const unresolved = state.openQuestions.filter(q => !q.resolved);
      if (unresolved.length > 0) {
        lines.push(`[QUESTIONS] ${unresolved.length} open`);
        unresolved.filter(q => q.priority === 'high').forEach(q => {
          lines.push(`   ${q.id} [HIGH]: ${q.question.substring(0, 40)}...`);
        });
      }
    }

    // NEW: Recent Evidence (errors only)
    if (state.evidenceLedger && state.evidenceLedger.length > 0) {
      const errors = state.evidenceLedger.filter(e => e.type === 'error');
      if (errors.length > 0) {
        lines.push(`[EVIDENCE] ${errors.length} error(s) logged`);
        errors.slice(-2).forEach(e => {
          lines.push(`   ${e.id}: ${e.content.substring(0, 50)}...`);
        });
      }
    }

    // Legacy: Pending actions
    if (state.summaries) {
      if (state.summaries.pendingActions && state.summaries.pendingActions.length > 0) {
        lines.push(`[TODO] Pending actions: ${state.summaries.pendingActions.length}`);
        state.summaries.pendingActions.slice(0, 3).forEach(action => {
          lines.push(`       - ${action}`);
        });
      }
    }

    // Token metrics
    if (state.tokenMetrics) {
      const status = state.tokenMetrics.budgetStatus;
      if (status === 'warning' || status === 'over_budget') {
        lines.push(`[TOKENS] ${state.tokenMetrics.estimatedTokens} (${status.toUpperCase()})`);
      }
    }

    lines.push('='.repeat(60));
    lines.push('[RESTORED] Context automatically loaded - ready to continue');
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

    // Check version (allow both 1.0.0 and 2.0.0)
    if (state.version && !['1.0.0', '2.0.0'].includes(state.version)) {
      errors.push(`Unsupported version: ${state.version}`);
    }

    // Check trigger enum
    if (state.trigger && !STATE_SCHEMA.properties.trigger.enum.includes(state.trigger)) {
      errors.push(`Invalid trigger: ${state.trigger}`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get token budget configuration
   */
  getTokenBudget() {
    return { ...TOKEN_BUDGET };
  }

  /**
   * Get max entries configuration
   */
  getMaxEntries() {
    return { ...MAX_ENTRIES };
  }
}

export default UnifiedStateManager;
export { STATE_SCHEMA, STATE_FILE_NAME, STATE_DIR, TOKEN_BUDGET, MAX_ENTRIES };
