/**
 * Session Decision Logger
 * Records all decisions made during LEO Protocol execution
 *
 * Part of SD-REFACTOR-2025-001-P2-002: leo-protocol-orchestrator Refactoring
 *
 * Enables post-session audit of automated decisions.
 * @module SessionDecisionLogger
 * @version 1.0.0
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * SessionDecisionLogger - Records all decisions made without human input
 */
export class SessionDecisionLogger {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.decisions = [];
    this.logPath = path.join(__dirname, '..', '..', 'docs', 'audit', 'sessions', `${new Date().toISOString().split('T')[0]}`);
    this.logFile = path.join(this.logPath, `session_decisions_${sessionId}.json`);
  }

  /**
   * Initialize the logger - creates directory if needed
   */
  async init() {
    await fs.mkdir(this.logPath, { recursive: true });
  }

  /**
   * Log a decision
   * @param {Object} decision - Decision object with type, action, reason
   */
  log(decision) {
    const entry = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      ...decision
    };
    this.decisions.push(entry);
    console.log(chalk.gray(`  [DECISION] ${decision.type}: ${decision.action} - ${decision.reason}`));
  }

  /**
   * Save decisions to file
   * @returns {Promise<string>} Path to saved file
   */
  async save() {
    await fs.writeFile(this.logFile, JSON.stringify(this.decisions, null, 2));
    return this.logFile;
  }

  /**
   * Get all decisions
   * @returns {Array} Array of decision entries
   */
  getDecisions() {
    return this.decisions;
  }
}

/**
 * Create a new session decision logger
 * @param {string} sessionId - Session identifier
 * @returns {SessionDecisionLogger} New logger instance
 */
export function createSessionDecisionLogger(sessionId) {
  return new SessionDecisionLogger(sessionId);
}

export default SessionDecisionLogger;
