#!/usr/bin/env node

/**
 * Claude Code Memory Manager
 *
 * Manages Claude Code's memory files for LEO Protocol state persistence.
 * Provides simple API for reading and writing session state, agent context,
 * and other persistent information across Claude Code sessions.
 *
 * Memory Architecture:
 * - .claude/session-state.md - Mutable session state (SD, phase, progress)
 * - .claude/file-trees.md - Cached file trees (regenerated every 4 hours)
 * - .claude/protocol-config.md - Static protocol rules
 * - .claude/agent-responsibilities.md - Static agent definitions
 *
 * Usage:
 *   import MemoryManager from './lib/context/memory-manager.js';
 *   const memory = new MemoryManager();
 *
 *   // Read session state
 *   const state = await memory.readSessionState();
 *
 *   // Update session state
 *   await memory.updateSection('Active Directive', content);
 *
 *   // Start new session
 *   await memory.startSession('SD-2025-001', 'LEAD');
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class MemoryManager {
  constructor(projectRoot = null) {
    this.projectRoot = projectRoot || path.join(__dirname, '..', '..');
    this.memoryDir = path.join(this.projectRoot, '.claude');
    this.sessionFile = path.join(this.memoryDir, 'session-state.md');
    this.fileTreesFile = path.join(this.memoryDir, 'file-trees.md');
  }

  // ============================================================================
  // SESSION STATE OPERATIONS
  // ============================================================================

  /**
   * Read entire session state file
   */
  async readSessionState() {
    try {
      const content = await fs.readFile(this.sessionFile, 'utf8');
      return this.parseSessionState(content);
    } catch (error) {
      console.warn('⚠️  Could not read session state:', error.message);
      return this.getEmptyState();
    }
  }

  /**
   * Parse markdown session state into structured object
   */
  parseSessionState(markdown) {
    const state = {
      raw: markdown,
      lastUpdated: null,
      sessionId: null,
      activeDirective: {},
      currentPRD: {},
      phases: {},
      lastHandoff: {},
      subAgentResults: [],
      contextCache: {}
    };

    // Extract last updated
    const updatedMatch = markdown.match(/\*\*Last Updated\*\*:\s*(.+)/);
    if (updatedMatch) {
      state.lastUpdated = updatedMatch[1].trim();
    }

    // Extract session ID
    const sessionMatch = markdown.match(/\*\*Session ID\*\*:\s*(.+)/);
    if (sessionMatch) {
      state.sessionId = sessionMatch[1].trim();
    }

    // Extract active directive
    const sdMatch = markdown.match(/## Active Directive[\s\S]*?- \*\*SD ID\*\*:\s*(.+)/);
    if (sdMatch) {
      state.activeDirective.id = sdMatch[1].trim();
    }

    return state;
  }

  /**
   * Get empty state template
   */
  getEmptyState() {
    return {
      raw: '',
      lastUpdated: null,
      sessionId: null,
      activeDirective: {},
      currentPRD: {},
      phases: {},
      lastHandoff: {},
      subAgentResults: [],
      contextCache: {}
    };
  }

  /**
   * Update a specific section in session state
   */
  async updateSection(sectionName, content) {
    try {
      // Read current state
      let markdown = await fs.readFile(this.sessionFile, 'utf8');

      // Update timestamp
      const timestamp = new Date().toISOString();
      markdown = markdown.replace(
        /\*\*Last Updated\*\*:\s*.+/,
        `**Last Updated**: ${timestamp}`
      );

      // Find and replace section
      const sectionRegex = new RegExp(
        `## ${this.escapeRegex(sectionName)}[\\s\\S]*?(?=##|$)`,
        'm'
      );

      if (sectionRegex.test(markdown)) {
        // Replace existing section
        markdown = markdown.replace(
          sectionRegex,
          `## ${sectionName}\n${content}\n\n`
        );
      } else {
        // Append new section
        markdown += `\n## ${sectionName}\n${content}\n\n`;
      }

      // Write back
      await fs.writeFile(this.sessionFile, markdown, 'utf8');

      console.log(`✅ Updated memory section: ${sectionName}`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to update section ${sectionName}:`, error.message);
      return false;
    }
  }

  /**
   * Start a new session
   */
  async startSession(sdId, agent, metadata = {}) {
    const timestamp = new Date().toISOString();
    const sessionId = `session-${Date.now()}`;

    const content = `# LEO Protocol Session State

**Last Updated**: ${timestamp}
**Session ID**: ${sessionId}

## Active Directive
- **SD ID**: ${sdId}
- **Title**: ${metadata.title || 'Loading...'}
- **Status**: ${agent} Phase
- **Progress**: 0%

## Current PRD
- **PRD ID**: ${metadata.prdId || 'Not created yet'}
- **Agent**: ${agent}
- **Phase**: Initialization
- **Checklist**: Not started

## Phase Completion
- LEAD: ${agent === 'LEAD' ? '🔄 In Progress' : '⏳ Not Started'}
- PLAN: ⏳ Not Started
- EXEC: ⏳ Not Started
- VERIFICATION: ⏳ Not Started
- APPROVAL: ⏳ Not Started

## Last Handoff
- **From**: None
- **To**: ${agent}
- **Timestamp**: ${timestamp}
- **Summary**: Session initialized for ${sdId}
- **Full Details**: Starting ${agent} phase

## Sub-Agent Results (Summary)
No sub-agent executions yet.

## Context Cache
- File trees: ${await this.checkFileTreesFreshness()}
- PWD: ${process.cwd()}
- Git branch: ${await this.getCurrentBranch()}

---

*Session started by ${agent} agent*`;

    await fs.writeFile(this.sessionFile, content, 'utf8');

    console.log(`✅ Started new session: ${sessionId}`);
    console.log(`   SD: ${sdId}`);
    console.log(`   Agent: ${agent}`);

    return {
      sessionId,
      sdId,
      agent,
      timestamp
    };
  }

  /**
   * Complete a phase
   */
  async completePhase(phase, summary) {
    const timestamp = new Date().toISOString();
    const dateStr = new Date().toLocaleString();

    // Read current state
    let markdown = await fs.readFile(this.sessionFile, 'utf8');

    // Update phase completion
    const phaseRegex = new RegExp(
      `- ${phase}: .*`,
      'g'
    );

    markdown = markdown.replace(
      phaseRegex,
      `- ${phase}: ✅ Completed (${dateStr})`
    );

    // Update last handoff
    const handoffRegex = /## Last Handoff[\s\S]*?(?=##)/;
    const handoffContent = `## Last Handoff
- **From**: ${phase}
- **To**: Next Phase
- **Timestamp**: ${timestamp}
- **Summary**: ${summary}
- **Full Details**: [View in Dashboard](http://localhost:3000)

`;

    markdown = markdown.replace(handoffRegex, handoffContent);

    // Update timestamp
    markdown = markdown.replace(
      /\*\*Last Updated\*\*:\s*.+/,
      `**Last Updated**: ${timestamp}`
    );

    await fs.writeFile(this.sessionFile, markdown, 'utf8');

    console.log(`✅ Marked ${phase} phase as completed`);
  }

  // ============================================================================
  // FILE TREE OPERATIONS
  // ============================================================================

  /**
   * Check if file trees are fresh (within 4 hours)
   */
  async checkFileTreesFreshness() {
    try {
      const stats = await fs.stat(this.fileTreesFile);
      const age = Date.now() - stats.mtimeMs;
      const fourHours = 4 * 60 * 60 * 1000;

      if (age < fourHours) {
        return `✅ Fresh (${Math.round(age / 60000)} minutes old)`;
      } else {
        return `⚠️  Stale (${Math.round(age / 3600000)} hours old) - regenerate recommended`;
      }
    } catch {
      return '❌ Not generated';
    }
  }

  /**
   * Trigger file tree regeneration
   */
  async regenerateFileTrees() {
    console.log('🔄 Regenerating file trees...');
    try {
      const { exec } = await import('child_process');
      const util = await import('util');
      const execPromise = util.promisify(exec);

      await execPromise('node scripts/generate-file-trees.js --force');
      console.log('✅ File trees regenerated');
      return true;
    } catch (error) {
      console.error('❌ Failed to regenerate file trees:', error.message);
      return false;
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get current git branch
   */
  async getCurrentBranch() {
    try {
      const { exec } = await import('child_process');
      const util = await import('util');
      const execPromise = util.promisify(exec);

      const { stdout } = await execPromise('git branch --show-current');
      return stdout.trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Escape regex special characters
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Reset session state
   */
  async resetSession() {
    const content = `# LEO Protocol Session State

**Last Updated**: ${new Date().toISOString()}
**Session ID**: No active session

## Active Directive
- **SD ID**: None
- **Title**: No active directive
- **Status**: Idle
- **Progress**: 0%

## Current PRD
- **PRD ID**: None
- **Agent**: None
- **Phase**: None
- **Checklist**: Not started

## Phase Completion
- LEAD: ⏳ Not Started
- PLAN: ⏳ Not Started
- EXEC: ⏳ Not Started
- VERIFICATION: ⏳ Not Started
- APPROVAL: ⏳ Not Started

## Last Handoff
- **From**: None
- **To**: None
- **Timestamp**: Not applicable
- **Summary**: No handoffs yet
- **Full Details**: Not applicable

## Sub-Agent Results (Summary)
No sub-agent executions yet.

## Context Cache
- File trees: ${await this.checkFileTreesFreshness()}
- PWD: Not set
- Git branch: Not set`;

    await fs.writeFile(this.sessionFile, content, 'utf8');
    console.log('✅ Session state reset');
  }
}

export default MemoryManager;

// CLI execution for testing
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const memory = new MemoryManager();

  (async () => {
    console.log('📝 Claude Code Memory Manager\n');

    // Read current state
    const state = await memory.readSessionState();
    console.log('Current Session:', state.sessionId || 'None');
    console.log('Active SD:', state.activeDirective.id || 'None');
    console.log('Last Updated:', state.lastUpdated || 'Never');

    // Check file tree freshness
    const freshness = await memory.checkFileTreesFreshness();
    console.log('File Trees:', freshness);
  })();
}