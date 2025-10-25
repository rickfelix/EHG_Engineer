#!/usr/bin/env node
/**
 * Generic Sub-Agent Executor CLI
 * LEO Protocol v4.2.0 - Sub-Agent Performance Enhancement
 *
 * Usage:
 *   node scripts/execute-subagent.js --code VALIDATION --sd-id SD-XXX
 *   node scripts/execute-subagent.js --code TESTING --sd-id SD-XXX --full-e2e
 *   node scripts/execute-subagent.js --code DATABASE --sd-id SD-XXX --verify-db --check-seed-data
 *   node scripts/execute-subagent.js --list  (list all available sub-agents)
 *   node scripts/execute-subagent.js --help  (show usage)
 *
 * Created: 2025-10-11 (SD-SUBAGENT-IMPROVE-001)
 */

import { executeSubAgent, listAllSubAgents } from '../lib/sub-agent-executor.js';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    code: null,
    sdId: null,
    options: {},
    showHelp: false,
    listAgents: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      parsed.showHelp = true;
    } else if (arg === '--list' || arg === '-l') {
      parsed.listAgents = true;
    } else if (arg === '--code' || arg === '-c') {
      parsed.code = args[++i]?.toUpperCase();
    } else if (arg === '--sd-id' || arg === '--sd') {
      parsed.sdId = args[++i];
    } else if (arg === '--prd-id' || arg === '--prd') {
      parsed.options.prd_id = args[++i];
    } else if (arg === '--table-name' || arg === '--table') {
      parsed.options.table_name = args[++i];
    } else if (arg.startsWith('--')) {
      // Boolean flag (e.g., --full-e2e)
      const flagName = arg.slice(2).replace(/-/g, '_');
      parsed.options[flagName] = true;
    }
  }

  return parsed;
}

// Show help
function showHelp() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  Generic Sub-Agent Executor - LEO Protocol v4.2.0            ║
╚═══════════════════════════════════════════════════════════════╝

USAGE:
  node scripts/execute-subagent.js [OPTIONS]

REQUIRED OPTIONS:
  --code, -c <CODE>       Sub-agent code (e.g., VALIDATION, TESTING, DATABASE)
  --sd-id, --sd <SD-ID>   Strategic Directive ID (e.g., SD-XXX)

OPTIONAL FLAGS (sub-agent specific):
  --full-e2e              Run full E2E test suite (TESTING)
  --skip-build            Skip build validation (TESTING)
  --verify-db             Verify database state (DATABASE)
  --check-seed-data       Check seed data (DATABASE)
  --no-auto-migrations    Don't auto-execute migrations (DATABASE)
  --diagnose-rls          Diagnose RLS policy issues via Supabase CLI (DATABASE)
  --table-name <table>    Specify table for RLS diagnosis (DATABASE)

UTILITY OPTIONS:
  --list, -l              List all available sub-agents
  --help, -h              Show this help message

EXAMPLES:
  # Execute VALIDATION sub-agent
  node scripts/execute-subagent.js --code VALIDATION --sd-id SD-SUBAGENT-IMPROVE-001

  # Execute TESTING sub-agent with full E2E
  node scripts/execute-subagent.js --code TESTING --sd-id SD-XXX --full-e2e

  # Execute DATABASE sub-agent with verification
  node scripts/execute-subagent.js --code DATABASE --sd-id SD-XXX --verify-db --check-seed-data

  # Diagnose RLS policy issues (DATABASE)
  node scripts/execute-subagent.js --code DATABASE --sd-id SD-XXX --diagnose-rls --table-name sd_phase_handoffs

  # List all available sub-agents
  node scripts/execute-subagent.js --list

EXIT CODES:
  0   PASS - Sub-agent executed successfully, no issues
  1   FAIL / BLOCKED - Critical issues found, implementation blocked
  2   CONDITIONAL_PASS - Minor issues, implementation can proceed with caution
  3   ERROR - Sub-agent execution failed
  4   MANUAL_REQUIRED - No automation available, manual analysis needed
  5   INVALID_ARGS - Missing or invalid command line arguments

DOCUMENTATION:
  See: CLAUDE.md - Sub-Agent System section
  Code: lib/sub-agent-executor.js
  Modules: lib/sub-agents/*.js
`);
}

// List all sub-agents
async function listSubAgents() {
  console.log('\n📋 Available Sub-Agents:\n');

  try {
    const agents = await listAllSubAgents();

    if (agents.length === 0) {
      console.log('   No sub-agents found in database.');
      return;
    }

    console.log(`   Total: ${agents.length}\n`);

    // Group by activation type
    const automatic = agents.filter(a => a.activation === 'automatic');
    const manual = agents.filter(a => a.activation === 'manual');

    console.log(`   🤖 Automatic (${automatic.length}):`);
    automatic.forEach(agent => {
      const version = agent.metadata?.version || '1.0.0';
      console.log(`      - ${agent.code.padEnd(15)} ${agent.name} (v${version}) [Priority: ${agent.priority}]`);
    });

    console.log(`\n   👤 Manual (${manual.length}):`);
    manual.forEach(agent => {
      const version = agent.metadata?.version || '1.0.0';
      console.log(`      - ${agent.code.padEnd(15)} ${agent.name} (v${version}) [Priority: ${agent.priority}]`);
    });

    console.log('\n   💡 Tip: Run with --code <CODE> --sd-id <SD-ID> to execute');

  } catch (error) {
    console.error('\n❌ Failed to list sub-agents:', error.message);
    process.exit(3);
  }
}

// Main execution
async function main() {
  const args = parseArgs();

  // Show help
  if (args.showHelp) {
    showHelp();
    process.exit(0);
  }

  // List agents
  if (args.listAgents) {
    await listSubAgents();
    process.exit(0);
  }

  // Validate required arguments
  if (!args.code || !args.sdId) {
    console.error('\n❌ Error: Missing required arguments');
    console.error('   Required: --code <CODE> --sd-id <SD-ID>');
    console.error('   Run with --help for usage information\n');
    process.exit(5);
  }

  // Execute sub-agent
  try {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log(`║  Executing: ${args.code.padEnd(49)} ║`);
    console.log(`║  SD: ${args.sdId.padEnd(54)} ║`);
    console.log('╚═══════════════════════════════════════════════════════════════╝');

    const result = await executeSubAgent(args.code, args.sdId, args.options);

    // Determine exit code based on verdict
    let exitCode = 0;
    switch (result.verdict) {
      case 'PASS':
        exitCode = 0;
        console.log(`\n✅ PASS - ${args.code} completed successfully`);
        break;
      case 'CONDITIONAL_PASS':
        exitCode = 2;
        console.log(`\n⚠️  CONDITIONAL PASS - ${args.code} completed with warnings`);
        break;
      case 'FAIL':
      case 'BLOCKED':
        exitCode = 1;
        console.log(`\n❌ FAIL - ${args.code} found critical issues`);
        break;
      case 'MANUAL_REQUIRED':
        exitCode = 4;
        console.log(`\n👤 MANUAL REQUIRED - ${args.code} needs human analysis`);
        break;
      case 'ERROR':
        exitCode = 3;
        console.log(`\n💥 ERROR - ${args.code} execution failed`);
        break;
      default:
        exitCode = 0;
        console.log(`\n❓ UNKNOWN VERDICT: ${result.verdict}`);
    }

    // Show recommendations if any
    if (result.recommendations && result.recommendations.length > 0) {
      console.log('\n📋 Recommendations:');
      result.recommendations.forEach((rec, i) => {
        console.log(`   ${i + 1}. ${rec}`);
      });
    }

    // Show critical issues if any
    if (result.critical_issues && result.critical_issues.length > 0) {
      console.log('\n🚨 Critical Issues:');
      result.critical_issues.forEach((issue, i) => {
        console.log(`   ${i + 1}. ${issue.issue || issue}`);
        if (issue.recommendation) {
          console.log(`      → ${issue.recommendation}`);
        }
      });
    }

    // Show stored result ID
    console.log(`\n💾 Results stored: ${result.stored_result_id}`);
    console.log(`   Query: SELECT * FROM sub_agent_execution_results WHERE id = '${result.stored_result_id}';`);

    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log(`║  Execution Complete - Exit Code: ${exitCode}                       ║`);
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    process.exit(exitCode);

  } catch (error) {
    console.error('\n💥 Fatal Error:', error.message);
    console.error('\nStack Trace:', error.stack);
    process.exit(3);
  }
}

// Run
main();
