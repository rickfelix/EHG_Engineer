#!/usr/bin/env node

/**
 * Child SD Pre-Work Validation Script
 * LEO Protocol Enhancement - Mandatory validation before working on child SDs
 *
 * PURPOSE: Ensures all prerequisite siblings in the dependency chain are completed
 *          before allowing work to begin on a child SD.
 *
 * PREVENTS:
 * - Starting work on SDs whose dependencies aren't satisfied
 * - Incomplete dependency chains
 * - Work that may need to be redone due to missing prerequisites
 *
 * Usage:
 *   node scripts/child-sd-preflight.js SD-XXX-001
 *   node scripts/child-sd-preflight.js SD-QUALITY-CLI-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m',
};

/**
 * Required handoffs per SD type
 * Based on LEO Protocol workflow requirements
 */
const REQUIRED_HANDOFFS_BY_TYPE = {
  feature: 4,      // LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD
  infrastructure: 4,
  database: 4,
  security: 4,
  documentation: 2, // May have abbreviated workflow
  bugfix: 3,        // Can skip some gates
  refactor: 3,
  orchestrator: 0,  // Orchestrators don't have handoffs (children do)
  default: 3
};

class ChildSDPreflightValidator {
  constructor() {
    this.sd = null;
    this.parent = null;
    this.siblings = [];
    this.dependencies = [];
    this.failures = [];
  }

  /**
   * Load an SD by ID (supports both id and legacy_id)
   */
  async loadSd(sdId) {
    // Try by id first
    let { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (error || !data) {
      // Try by legacy_id
      const result = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('legacy_id', sdId)
        .single();

      data = result.data;
      error = result.error;
    }

    if (error || !data) {
      return null;
    }

    return data;
  }

  /**
   * Load all siblings of a child SD (children of the same parent)
   */
  async loadSiblings(parentSdId) {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('parent_sd_id', parentSdId)
      .order('sequence_rank');

    if (error) {
      console.error(`${colors.red}Error loading siblings: ${error.message}${colors.reset}`);
      return [];
    }

    return data || [];
  }

  /**
   * Load handoffs for an SD
   * Checks both sd_phase_handoffs AND leo_handoff_executions tables
   * (LEAD-FINAL-APPROVAL is stored in leo_handoff_executions, not sd_phase_handoffs)
   */
  async loadHandoffs(sdId) {
    // Check sd_phase_handoffs for LEAD-TO-PLAN, PLAN-TO-EXEC, etc.
    const { data: phaseHandoffs, error: phaseError } = await supabase
      .from('sd_phase_handoffs')
      .select('*')
      .eq('sd_id', sdId)
      .eq('status', 'accepted')
      .order('created_at');

    // Also check leo_handoff_executions for LEAD-FINAL-APPROVAL
    const { data: leoHandoffs, error: leoError } = await supabase
      .from('leo_handoff_executions')
      .select('*')
      .eq('sd_id', sdId)
      .eq('handoff_type', 'LEAD-FINAL-APPROVAL')
      .eq('status', 'accepted');

    const handoffs = [];

    if (!phaseError && phaseHandoffs) {
      handoffs.push(...phaseHandoffs);
    }

    if (!leoError && leoHandoffs) {
      handoffs.push(...leoHandoffs);
    }

    return handoffs;
  }

  /**
   * Get required handoff count based on SD type
   */
  getRequiredHandoffs(sdType) {
    return REQUIRED_HANDOFFS_BY_TYPE[sdType] || REQUIRED_HANDOFFS_BY_TYPE.default;
  }

  /**
   * Extract dependency IDs from dependency_chain
   * Supports both old and new formats
   */
  extractDependencyIds(sd) {
    if (!sd.dependency_chain) return [];

    const chain = sd.dependency_chain;

    // Format 1: Array of SD IDs directly
    if (Array.isArray(chain)) {
      return chain.filter(item => typeof item === 'string' && item.startsWith('SD-'));
    }

    // Format 2: Object with children array containing depends_on
    if (chain.children && Array.isArray(chain.children)) {
      // Find this SD in the children array and get its depends_on
      const thisChild = chain.children.find(c =>
        c.sd_id === sd.id || c.sd_id === sd.legacy_id
      );

      if (thisChild && thisChild.depends_on) {
        if (Array.isArray(thisChild.depends_on)) {
          return thisChild.depends_on;
        }
        return [thisChild.depends_on];
      }
    }

    // Format 3: Parent's dependency_chain with children array
    // We need to find what this specific SD depends on
    if (this.parent?.dependency_chain?.children) {
      const thisChild = this.parent.dependency_chain.children.find(c =>
        c.sd_id === sd.id || c.sd_id === sd.legacy_id
      );

      if (thisChild && thisChild.depends_on) {
        if (Array.isArray(thisChild.depends_on)) {
          return thisChild.depends_on;
        }
        return [thisChild.depends_on];
      }
    }

    return [];
  }

  /**
   * Main validation function
   */
  async validate(sdId) {
    console.log(`\n${colors.cyan}${'═'.repeat(59)}${colors.reset}`);
    console.log(`${colors.bold}${colors.white}  CHILD SD PRE-WORK VALIDATION${colors.reset}`);
    console.log(`${colors.cyan}${'═'.repeat(59)}${colors.reset}\n`);

    // 1. Load target SD
    this.sd = await this.loadSd(sdId);
    if (!this.sd) {
      console.log(`${colors.red}❌ SD not found: ${sdId}${colors.reset}`);
      return { status: 'ERROR', reason: 'SD not found' };
    }

    const displayId = this.sd.legacy_id || this.sd.id;
    console.log(`${colors.bold}📋 SD:${colors.reset} ${displayId} (${this.sd.title?.substring(0, 50)}...)`);

    // 2. Check if it's a child SD
    if (!this.sd.parent_sd_id) {
      console.log(`${colors.dim}   Type: ${this.sd.relationship_type || 'standalone'}${colors.reset}`);
      console.log(`\n${colors.green}✅ RESULT: PASS${colors.reset}`);
      console.log(`${colors.dim}   Not a child SD - no dependency validation required.${colors.reset}`);
      console.log(`\n${colors.cyan}${'═'.repeat(59)}${colors.reset}\n`);
      return { status: 'PASS', reason: 'Not a child SD' };
    }

    // 3. Load parent SD
    this.parent = await this.loadSd(this.sd.parent_sd_id);
    if (!this.parent) {
      console.log(`${colors.red}❌ Parent SD not found: ${this.sd.parent_sd_id}${colors.reset}`);
      return { status: 'ERROR', reason: 'Parent SD not found' };
    }

    const parentDisplayId = this.parent.legacy_id || this.parent.id;
    console.log(`${colors.bold}   Parent:${colors.reset} ${parentDisplayId} (${this.parent.title?.substring(0, 40)}...)`);

    // 4. Load all siblings
    this.siblings = await this.loadSiblings(this.sd.parent_sd_id);
    console.log(`${colors.dim}   Siblings: ${this.siblings.length} child SDs${colors.reset}\n`);

    // 5. Extract dependencies for this SD
    this.dependencies = this.extractDependencyIds(this.sd);

    if (this.dependencies.length === 0) {
      console.log(`${colors.bold}🔗 DEPENDENCY CHECK${colors.reset}`);
      console.log(`${colors.dim}   No dependencies defined for this child SD.${colors.reset}\n`);
      console.log(`${colors.green}✅ RESULT: PASS${colors.reset}`);
      console.log(`${colors.dim}   Ready to work on ${displayId}.${colors.reset}`);
      console.log(`\n${colors.cyan}${'═'.repeat(59)}${colors.reset}\n`);
      return { status: 'PASS', reason: 'No dependencies', parent: this.parent, sd: this.sd };
    }

    // 6. Check each dependency
    console.log(`${colors.bold}🔗 DEPENDENCY CHECK${colors.reset}\n`);

    // Table header
    console.log(`┌${'─'.repeat(25)}┬${'─'.repeat(10)}┬${'─'.repeat(10)}┬${'─'.repeat(10)}┐`);
    console.log(`│ ${'Dependency'.padEnd(23)} │ ${'Status'.padEnd(8)} │ ${'Progress'.padEnd(8)} │ ${'Handoffs'.padEnd(8)} │`);
    console.log(`├${'─'.repeat(25)}┼${'─'.repeat(10)}┼${'─'.repeat(10)}┼${'─'.repeat(10)}┤`);

    this.failures = [];

    for (const depId of this.dependencies) {
      // Find dependency in siblings
      const depSd = this.siblings.find(s =>
        s.id === depId || s.legacy_id === depId
      ) || await this.loadSd(depId);

      if (!depSd) {
        const depDisplayId = depId.substring(0, 23).padEnd(23);
        console.log(`│ ${depDisplayId} │ ${colors.red}NOT FOUND${colors.reset} │          │          │`);
        this.failures.push({
          sd_id: depId,
          issue: 'Dependency SD not found',
          current_status: 'N/A',
          current_progress: 'N/A'
        });
        continue;
      }

      const depDisplayId = (depSd.legacy_id || depSd.id).substring(0, 23).padEnd(23);
      const statusStr = (depSd.status || 'unknown').substring(0, 8).padEnd(8);
      const progressStr = `${depSd.progress_percentage || 0}%`.padEnd(8);

      // Load handoffs for dependency
      const handoffs = await this.loadHandoffs(depSd.id) || await this.loadHandoffs(depSd.legacy_id);
      const requiredHandoffs = this.getRequiredHandoffs(depSd.sd_type);
      const handoffStr = `${handoffs.length}/${requiredHandoffs}`.padEnd(8);

      // Check completion status
      const isComplete = depSd.status === 'completed' && depSd.progress_percentage === 100;
      const hasEnoughHandoffs = handoffs.length >= requiredHandoffs;

      if (isComplete && hasEnoughHandoffs) {
        console.log(`│ ${depDisplayId} │ ${colors.green}${statusStr}${colors.reset} │ ${colors.green}${progressStr}${colors.reset} │ ${colors.green}${handoffStr}${colors.reset} │`);
      } else {
        console.log(`│ ${depDisplayId} │ ${colors.red}${statusStr}${colors.reset} │ ${colors.yellow}${progressStr}${colors.reset} │ ${colors.yellow}${handoffStr}${colors.reset} │`);

        this.failures.push({
          sd_id: depSd.legacy_id || depSd.id,
          issue: !isComplete ? 'Not completed' : 'Missing handoffs',
          current_status: depSd.status,
          current_progress: depSd.progress_percentage,
          handoffs_actual: handoffs.length,
          handoffs_required: requiredHandoffs
        });
      }
    }

    console.log(`└${'─'.repeat(25)}┴${'─'.repeat(10)}┴${'─'.repeat(10)}┴${'─'.repeat(10)}┘\n`);

    // 7. Return result
    if (this.failures.length > 0) {
      console.log(`${colors.bgRed}${colors.bold} ❌ RESULT: BLOCKED ${colors.reset}`);
      console.log(`${colors.red}   Cannot start ${displayId} until dependencies are complete.${colors.reset}\n`);

      for (const failure of this.failures) {
        console.log(`   ${colors.red}🚫 ${failure.sd_id} is not complete:${colors.reset}`);
        if (failure.current_status !== 'N/A') {
          console.log(`      ${colors.dim}- Status: ${failure.current_status} (expected: completed)${colors.reset}`);
          console.log(`      ${colors.dim}- Progress: ${failure.current_progress}% (expected: 100%)${colors.reset}`);
          if (failure.handoffs_actual !== undefined) {
            console.log(`      ${colors.dim}- Handoffs: ${failure.handoffs_actual}/${failure.handoffs_required} (expected: ${failure.handoffs_required})${colors.reset}`);
          }
        } else {
          console.log(`      ${colors.dim}- ${failure.issue}${colors.reset}`);
        }
        console.log();
      }

      console.log(`   ${colors.yellow}${colors.bold}ACTION:${colors.reset} Complete ${this.failures[0].sd_id} first, then return to this SD.`);
      console.log(`\n${colors.cyan}${'═'.repeat(59)}${colors.reset}\n`);

      return {
        status: 'BLOCKED',
        failures: this.failures,
        parent: this.parent,
        sd: this.sd
      };
    }

    console.log(`${colors.bgGreen}${colors.bold} ✅ RESULT: PROCEED ${colors.reset}`);
    console.log(`${colors.green}   All dependencies satisfied. Ready to work on ${displayId}.${colors.reset}`);
    console.log(`\n${colors.cyan}${'═'.repeat(59)}${colors.reset}\n`);

    return {
      status: 'PASS',
      parent: this.parent,
      sd: this.sd,
      dependencies: this.dependencies
    };
  }
}

/**
 * Check dependency status for a single SD (for use by sd-next.js)
 * Returns { allComplete: boolean, summary: string }
 */
export async function checkDependencyStatus(sdId) {
  const validator = new ChildSDPreflightValidator();

  const sd = await validator.loadSd(sdId);
  if (!sd || !sd.parent_sd_id) {
    return { allComplete: true, summary: 'N/A' };
  }

  validator.sd = sd;
  validator.parent = await validator.loadSd(sd.parent_sd_id);
  validator.siblings = await validator.loadSiblings(sd.parent_sd_id);

  const dependencies = validator.extractDependencyIds(sd);
  if (dependencies.length === 0) {
    return { allComplete: true, summary: 'None' };
  }

  const statuses = [];
  for (const depId of dependencies) {
    const depSd = validator.siblings.find(s =>
      s.id === depId || s.legacy_id === depId
    ) || await validator.loadSd(depId);

    if (!depSd) {
      statuses.push({ id: depId, complete: false });
      continue;
    }

    const isComplete = depSd.status === 'completed' && depSd.progress_percentage === 100;
    statuses.push({
      id: depSd.legacy_id || depSd.id,
      complete: isComplete
    });
  }

  const allComplete = statuses.every(s => s.complete);
  const summary = statuses.map(s => `${s.complete ? '✅' : '❌'} ${s.id.replace('SD-', '').substring(0, 10)}`).join(' ');

  return { allComplete, summary };
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
${colors.bold}Child SD Pre-Work Validation${colors.reset}
${'═'.repeat(40)}

${colors.cyan}Usage:${colors.reset}
  node scripts/child-sd-preflight.js <SD-ID>

${colors.cyan}Examples:${colors.reset}
  node scripts/child-sd-preflight.js SD-QUALITY-CLI-001
  node scripts/child-sd-preflight.js SD-VISION-V2-001

${colors.cyan}Description:${colors.reset}
  Validates that all prerequisite sibling SDs in the dependency
  chain are completed before allowing work on a child SD.

${colors.cyan}Exit Codes:${colors.reset}
  0 - PASS (ready to work) or not a child SD
  1 - BLOCKED (dependencies not satisfied)
  2 - ERROR (SD not found or system error)
`);
    process.exit(0);
  }

  const sdId = args[0];
  const validator = new ChildSDPreflightValidator();
  const result = await validator.validate(sdId);

  switch (result.status) {
    case 'PASS':
      process.exit(0);
    case 'BLOCKED':
      process.exit(1);
    default:
      process.exit(2);
  }
}

// Only run main() if this is the main module being executed
const isMainModule = process.argv[1]?.includes('child-sd-preflight');
if (isMainModule) {
  main().catch(err => {
    console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
    process.exit(2);
  });
}
