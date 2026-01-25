#!/usr/bin/env node
/**
 * Evidence Pack Generator - Post-Session Audit Report Generator
 *
 * Generates a comprehensive evidence pack for post-session review:
 * - summary.md: Run overview with pass/fail counts
 * - assumptions.json: Decisions made without human input
 * - handoffs.json: All handoff execution records
 * - tests.log: Test execution output
 * - git-evidence.md: Branch, commits, PR status
 *
 * @module lib/evidence-pack-generator
 * @version 1.0.0
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

/**
 * Evidence Pack Generator
 */
export class EvidencePackGenerator {
  /**
   * @param {string} sessionId - Session identifier
   * @param {Object} options - Configuration options
   */
  constructor(sessionId, options = {}) {
    this.sessionId = sessionId;
    this.options = {
      outputDir: options.outputDir || path.join(__dirname, '..', '..', 'docs', 'audit', 'sessions'),
      includeTests: options.includeTests !== false,
      includeGit: options.includeGit !== false,
      ...options
    };

    // Initialize Supabase client
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // Collect evidence during session
    this.evidence = {
      startTime: new Date(),
      endTime: null,
      sdsTouched: [],
      gatesExecuted: [],
      decisions: [],
      handoffs: [],
      testResults: [],
      violations: []
    };
  }

  /**
   * Initialize the evidence pack directory
   */
  async init() {
    const dateStr = new Date().toISOString().split('T')[0];
    this.packDir = path.join(this.options.outputDir, dateStr, this.sessionId);
    await fs.mkdir(this.packDir, { recursive: true });
    console.log(`📦 Evidence pack initialized: ${this.packDir}`);
  }

  // ============================================================================
  // EVIDENCE COLLECTION
  // ============================================================================

  /**
   * Record an SD being worked on
   * @param {string} sdId - Strategic Directive ID
   * @param {string} status - Status (started, completed, failed)
   */
  recordSD(sdId, status) {
    const existing = this.evidence.sdsTouched.find(s => s.sdId === sdId);
    if (existing) {
      existing.status = status;
      existing.lastUpdated = new Date().toISOString();
    } else {
      this.evidence.sdsTouched.push({
        sdId,
        status,
        startedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      });
    }
  }

  /**
   * Record a gate execution
   * @param {string} gate - Gate identifier
   * @param {boolean} passed - Whether gate passed
   * @param {Object} details - Additional details
   */
  recordGate(gate, passed, details = {}) {
    this.evidence.gatesExecuted.push({
      gate,
      passed,
      timestamp: new Date().toISOString(),
      ...details
    });
  }

  /**
   * Record a decision made without human input
   * @param {Object} decision - Decision object from SessionDecisionLogger
   */
  recordDecision(decision) {
    this.evidence.decisions.push({
      ...decision,
      recordedAt: new Date().toISOString()
    });
  }

  /**
   * Record a handoff execution
   * @param {Object} handoff - Handoff record
   */
  recordHandoff(handoff) {
    this.evidence.handoffs.push({
      ...handoff,
      recordedAt: new Date().toISOString()
    });
  }

  /**
   * Record a test result
   * @param {Object} testResult - Test execution result
   */
  recordTestResult(testResult) {
    this.evidence.testResults.push({
      ...testResult,
      recordedAt: new Date().toISOString()
    });
  }

  /**
   * Record a violation
   * @param {Object} violation - Violation details
   */
  recordViolation(violation) {
    this.evidence.violations.push({
      ...violation,
      recordedAt: new Date().toISOString()
    });
  }

  // ============================================================================
  // EVIDENCE RETRIEVAL FROM DATABASE
  // ============================================================================

  /**
   * Fetch session data from database
   */
  async fetchSessionData() {
    try {
      // Fetch execution session
      const { data: session } = await this.supabase
        .from('leo_execution_sessions')
        .select('*')
        .eq('id', this.sessionId)
        .single();

      if (session) {
        this.evidence.dbSession = session;
      }

      // Fetch handoff executions from today
      const today = new Date().toISOString().split('T')[0];
      const { data: handoffs } = await this.supabase
        .from('handoff_executions')
        .select('*')
        .gte('executed_at', today)
        .order('executed_at', { ascending: true });

      if (handoffs) {
        this.evidence.dbHandoffs = handoffs;
      }

      // Fetch compliance reports
      const { data: reports } = await this.supabase
        .from('leo_compliance_reports')
        .select('*')
        .eq('session_id', this.sessionId);

      if (reports) {
        this.evidence.dbReports = reports;
      }

      // Fetch phase completions for this session
      const { data: phases } = await this.supabase
        .from('leo_phase_completions')
        .select('*')
        .eq('session_id', this.sessionId)
        .order('completed_at', { ascending: true });

      if (phases) {
        this.evidence.dbPhases = phases;
      }

    } catch (error) {
      console.warn('⚠️  Could not fetch some session data:', error.message);
    }
  }

  // ============================================================================
  // GIT EVIDENCE
  // ============================================================================

  /**
   * Collect git evidence
   */
  collectGitEvidence() {
    const git = {};

    try {
      // Current branch
      git.branch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();

      // Recent commits (last 10)
      git.commits = execSync('git log --oneline -10', { encoding: 'utf-8' }).trim().split('\n');

      // Status
      git.status = execSync('git status --short', { encoding: 'utf-8' }).trim();

      // Diff stats
      git.diffStats = execSync('git diff --stat HEAD~5 2>/dev/null || echo "Not enough commits"', { encoding: 'utf-8' }).trim();

      // Check for uncommitted changes
      git.hasUncommitted = git.status.length > 0;

      // Remote status
      try {
        git.remote = execSync('git remote -v', { encoding: 'utf-8' }).trim();
      } catch {
        git.remote = 'No remote configured';
      }

    } catch (error) {
      git.error = error.message;
    }

    this.evidence.git = git;
    return git;
  }

  // ============================================================================
  // PACK GENERATION
  // ============================================================================

  /**
   * Generate the complete evidence pack
   * @returns {Promise<string>} Path to the evidence pack directory
   */
  async generate() {
    this.evidence.endTime = new Date();
    console.log('\n📦 Generating evidence pack...');

    // Ensure directory exists
    await this.init();

    // Collect all evidence
    await this.fetchSessionData();
    if (this.options.includeGit) {
      this.collectGitEvidence();
    }

    // Generate each file in parallel
    await Promise.all([
      this.generateSummary(),
      this.generateDecisions(),
      this.generateHandoffs(),
      this.generateGitEvidence()
    ]);

    console.log(`\n✅ Evidence pack generated: ${this.packDir}`);
    return this.packDir;
  }

  /**
   * Generate summary.md
   */
  async generateSummary() {
    const passCount = this.evidence.gatesExecuted.filter(g => g.passed).length;
    const failCount = this.evidence.gatesExecuted.filter(g => !g.passed).length;
    const totalGates = this.evidence.gatesExecuted.length;

    const durationMs = this.evidence.endTime - this.evidence.startTime;
    const durationMin = Math.round(durationMs / 60000);

    const completedSDs = this.evidence.sdsTouched.filter(s => s.status === 'completed').length;
    const failedSDs = this.evidence.sdsTouched.filter(s => s.status === 'failed').length;

    const content = `# Evidence Pack Summary

**Session ID:** ${this.sessionId}
**Generated:** ${new Date().toISOString()}

## Session Overview

| Metric | Value |
|--------|-------|
| Start Time | ${this.evidence.startTime.toISOString()} |
| End Time | ${this.evidence.endTime.toISOString()} |
| Duration | ${durationMin} minutes |
| SDs Touched | ${this.evidence.sdsTouched.length} |
| SDs Completed | ${completedSDs} |
| SDs Failed | ${failedSDs} |

## Gate Results

| Metric | Value |
|--------|-------|
| Total Gates | ${totalGates} |
| Passed | ${passCount} |
| Failed | ${failCount} |
| Pass Rate | ${totalGates > 0 ? Math.round((passCount / totalGates) * 100) : 0}% |

## SDs Worked On

${this.evidence.sdsTouched.length > 0 ? this.evidence.sdsTouched.map(sd =>
      `- **${sd.sdId}**: ${sd.status} (started: ${sd.startedAt})`
    ).join('\n') : 'No SDs touched in this session'}

## Decisions Made

${this.evidence.decisions.length} automated decisions made (see assumptions.json for details)

## Violations

${this.evidence.violations.length > 0 ? this.evidence.violations.map(v =>
      `- **${v.type}**: ${v.description}`
    ).join('\n') : 'No violations recorded'}

## Files

- \`summary.md\` - This file
- \`assumptions.json\` - All automated decisions
- \`handoffs.json\` - Handoff execution records
- \`git-evidence.md\` - Git state and commits

---
*Generated by LEO Protocol Evidence Pack Generator v1.0.0*
`;

    await fs.writeFile(path.join(this.packDir, 'summary.md'), content);
    console.log('  ✓ summary.md');
  }

  /**
   * Generate assumptions.json (decisions made without human input)
   */
  async generateDecisions() {
    // Combine in-memory decisions with any from decision log files
    let allDecisions = [...this.evidence.decisions];

    // Try to find session decision log
    const decisionLogPath = path.join(
      this.options.outputDir,
      new Date().toISOString().split('T')[0],
      `session_decisions_${this.sessionId}.json`
    );

    try {
      const content = await fs.readFile(decisionLogPath, 'utf-8');
      const loggedDecisions = JSON.parse(content);
      allDecisions = [...allDecisions, ...loggedDecisions];
    } catch {
      // No decision log found, continue with in-memory
    }

    const content = {
      sessionId: this.sessionId,
      generatedAt: new Date().toISOString(),
      totalDecisions: allDecisions.length,
      decisions: allDecisions
    };

    await fs.writeFile(
      path.join(this.packDir, 'assumptions.json'),
      JSON.stringify(content, null, 2)
    );
    console.log('  ✓ assumptions.json');
  }

  /**
   * Generate handoffs.json
   */
  async generateHandoffs() {
    // Combine in-memory and database handoffs
    const allHandoffs = [
      ...this.evidence.handoffs,
      ...(this.evidence.dbHandoffs || [])
    ];

    const content = {
      sessionId: this.sessionId,
      generatedAt: new Date().toISOString(),
      totalHandoffs: allHandoffs.length,
      handoffs: allHandoffs
    };

    await fs.writeFile(
      path.join(this.packDir, 'handoffs.json'),
      JSON.stringify(content, null, 2)
    );
    console.log('  ✓ handoffs.json');
  }

  /**
   * Generate git-evidence.md
   */
  async generateGitEvidence() {
    const git = this.evidence.git || {};

    const content = `# Git Evidence

**Session ID:** ${this.sessionId}
**Generated:** ${new Date().toISOString()}

## Current State

| Property | Value |
|----------|-------|
| Branch | ${git.branch || 'unknown'} |
| Has Uncommitted Changes | ${git.hasUncommitted ? 'Yes' : 'No'} |

## Status

\`\`\`
${git.status || 'Clean working tree'}
\`\`\`

## Recent Commits

\`\`\`
${(git.commits || []).join('\n') || 'No commits found'}
\`\`\`

## Diff Stats (Last 5 Commits)

\`\`\`
${git.diffStats || 'No diff stats available'}
\`\`\`

## Remote

\`\`\`
${git.remote || 'No remote configured'}
\`\`\`

---
*Generated by LEO Protocol Evidence Pack Generator v1.0.0*
`;

    await fs.writeFile(path.join(this.packDir, 'git-evidence.md'), content);
    console.log('  ✓ git-evidence.md');
  }

  /**
   * Get the pack directory path
   */
  getPackPath() {
    return this.packDir;
  }
}

/**
 * Create an evidence pack generator for a session
 * @param {string} sessionId - Session identifier
 * @param {Object} options - Configuration options
 * @returns {Promise<EvidencePackGenerator>} Initialized generator
 */
export async function createEvidencePackGenerator(sessionId, options = {}) {
  const generator = new EvidencePackGenerator(sessionId, options);
  await generator.init();
  return generator;
}

// CLI for testing
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    const testMode = process.argv.includes('--test');

    if (testMode) {
      console.log('📦 Evidence Pack Generator - Test Mode\n');

      const generator = new EvidencePackGenerator(`test-${Date.now()}`);

      // Add some test evidence
      generator.recordSD('SD-TEST-001', 'completed');
      generator.recordSD('SD-TEST-002', 'failed');
      generator.recordGate('LEAD-TO-PLAN', true, { sdId: 'SD-TEST-001' });
      generator.recordGate('PLAN-TO-EXEC', false, { sdId: 'SD-TEST-002', reason: 'PRD validation failed' });
      generator.recordDecision({
        type: 'AUTO_SKIP',
        action: 'skipped_low_priority',
        reason: 'Low priority SD in non-interactive mode'
      });

      // Generate pack
      const packPath = await generator.generate();

      console.log('\n📁 Pack contents:');
      const files = await fs.readdir(packPath);
      for (const file of files) {
        const stat = await fs.stat(path.join(packPath, file));
        console.log(`  - ${file} (${stat.size} bytes)`);
      }

      console.log('\n✅ Test complete');
    } else {
      console.log('Usage: node evidence-pack-generator.js --test');
    }
  })().catch(console.error);
}
