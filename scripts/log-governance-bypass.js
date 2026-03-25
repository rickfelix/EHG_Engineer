#!/usr/bin/env node
/**
 * CLI for logging governance bypasses
 *
 * Usage:
 *   node scripts/log-governance-bypass.js \
 *     --category PRE_COMMIT_HOOK \
 *     --control "direct-commit-to-main-check" \
 *     --reason "Automated CI/CD bot commit for schema documentation" \
 *     --changed-by "github-actions[bot]" \
 *     --context '{"workflow": "schema-docs-update.yml"}'
 *
 * Categories:
 *   PRE_COMMIT_HOOK, COMMIT_HOOK, WORKFLOW_CHECK, REQUIRED_STATUS_CHECK,
 *   RLS_POLICY, DATABASE_TRIGGER, QUALITY_GATE, VALIDATION_GATE,
 *   HANDOFF_GATE, SUBAGENT_BLOCKER, SD_COMPLETION_CHECK, MANUAL_OVERRIDE
 *
 * Severity (optional, default MEDIUM):
 *   LOW, MEDIUM, HIGH, CRITICAL
 */

import { logGovernanceBypass, BypassCategory, BypassSeverity } from './lib/governance-bypass-logger.js';

function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-/g, '_');
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        result[key] = value;
        i++;
      } else {
        result[key] = true;
      }
    }
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Help
  if (args.help || args.h) {
    console.log(`
Governance Bypass Logger CLI

Usage:
  node scripts/log-governance-bypass.js [options]

Required Options:
  --category <category>     Bypass category (see list below)
  --control <name>          Name of the control being bypassed
  --reason <text>           Human-readable justification
  --changed-by <actor>      Who/what initiated the bypass

Optional:
  --severity <level>        LOW, MEDIUM (default), HIGH, CRITICAL
  --sd-id <id>              Related Strategic Directive ID
  --pr-number <num>         Related PR number
  --context <json>          Additional context as JSON string

Categories:
  PRE_COMMIT_HOOK           Pre-commit hook bypass
  COMMIT_HOOK               Commit hook bypass
  WORKFLOW_CHECK            CI/CD workflow check bypass
  REQUIRED_STATUS_CHECK     Required status check bypass
  RLS_POLICY                RLS policy bypass
  DATABASE_TRIGGER          Database trigger bypass
  QUALITY_GATE              Quality gate bypass
  VALIDATION_GATE           Validation gate bypass
  HANDOFF_GATE              Handoff gate bypass
  SUBAGENT_BLOCKER          Sub-agent blocker override
  SD_COMPLETION_CHECK       SD completion check bypass
  MANUAL_OVERRIDE           Manual governance override

Example:
  node scripts/log-governance-bypass.js \\
    --category PRE_COMMIT_HOOK \\
    --control "direct-commit-to-main-check" \\
    --reason "Automated schema docs update by CI/CD" \\
    --changed-by "github-actions[bot]" \\
    --context '{"workflow": "schema-docs-update.yml", "event": "push"}'
`);
    process.exit(0);
  }

  // Validate required args
  const required = ['category', 'control', 'reason', 'changed_by'];
  const missing = required.filter(r => !args[r]);
  if (missing.length > 0) {
    console.error(`Error: Missing required arguments: ${missing.join(', ')}`);
    console.error('Run with --help for usage');
    process.exit(1);
  }

  // Validate category
  if (!BypassCategory[args.category]) {
    console.error(`Error: Invalid category '${args.category}'`);
    console.error('Valid categories:', Object.keys(BypassCategory).join(', '));
    process.exit(1);
  }

  // Validate severity if provided
  if (args.severity && !BypassSeverity[args.severity]) {
    console.error(`Error: Invalid severity '${args.severity}'`);
    console.error('Valid severities:', Object.keys(BypassSeverity).join(', '));
    process.exit(1);
  }

  // Parse context JSON
  let context = {};
  if (args.context) {
    try {
      context = JSON.parse(args.context);
    } catch (e) {
      console.error(`Error: Invalid JSON in --context: ${e.message}`);
      process.exit(1);
    }
  }

  // Log the bypass
  try {
    const result = await logGovernanceBypass({
      category: args.category,
      control: args.control,
      reason: args.reason,
      changedBy: args.changed_by,
      severity: args.severity || BypassSeverity.MEDIUM,
      sdId: args.sd_id,
      prNumber: args.pr_number,
      context
    });

    if (result.success) {
      console.log(`Governance bypass logged successfully (id: ${result.id})`);
      process.exit(0);
    } else {
      console.warn(`Bypass logged to console only: ${result.reason || result.error}`);
      process.exit(0);  // Don't fail the workflow for logging issues
    }
  } catch (error) {
    console.error(`Error logging bypass: ${error.message}`);
    process.exit(0);  // Don't fail the workflow for logging issues
  }
}

main();
