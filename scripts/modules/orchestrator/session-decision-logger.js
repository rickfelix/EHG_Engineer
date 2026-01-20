/**
 * Session Decision Logger
 *
 * Records all decisions made without human input during LEO Protocol execution.
 * Enables post-session audit of automated decisions.
 *
 * Extracted from leo-protocol-orchestrator.js for maintainability.
 * Part of SD-LEO-REFACTOR-ORCH-001
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
 * Enables post-session audit of automated decisions
 */
export class SessionDecisionLogger {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.decisions = [];
    this.logPath = path.join(__dirname, '..', '..', '..', 'docs', 'audit', 'sessions', `${new Date().toISOString().split('T')[0]}`);
    this.logFile = path.join(this.logPath, `session_decisions_${sessionId}.json`);
  }

  async init() {
    await fs.mkdir(this.logPath, { recursive: true });
  }

  log(decision) {
    const entry = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      ...decision
    };
    this.decisions.push(entry);
    console.log(chalk.gray(`  [DECISION] ${decision.type}: ${decision.action} - ${decision.reason}`));
  }

  async save() {
    await fs.writeFile(this.logFile, JSON.stringify(this.decisions, null, 2));
    return this.logFile;
  }

  getDecisions() {
    return this.decisions;
  }
}

export default SessionDecisionLogger;
