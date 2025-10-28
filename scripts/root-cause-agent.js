#!/usr/bin/env node

/**
 * Root Cause Agent (RCA) CLI
 * SD-RCA-001
 *
 * Command-line interface for managing Root Cause Reports (RCRs) and CAPA manifests.
 *
 * Commands:
 *   list            List open RCRs for an SD
 *   view            View specific RCR details
 *   trigger         Create manual RCR
 *   analyze         Analyze RCR (v1.1 - stub in v1)
 *   capa            CAPA operations (generate, approve, update, verify)
 *   gate-check      Check RCA gate status for SD
 *   status          Show RCR/CAPA summary for SD
 *
 * @module scripts/root-cause-agent
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';

const supabase = createDatabaseClient();

/**
 * List open RCRs for an SD
 */
async function listRCRs(sdId) {
  if (!sdId) {
    console.error('❌ Error: --sd-id required');
    process.exit(1);
  }

  const { data, error } = await supabase
    .from('root_cause_reports')
    .select('id, severity_priority, problem_statement, status, created_at')
    .eq('sd_id', sdId)
    .in('status', ['OPEN', 'IN_REVIEW', 'CAPA_PENDING', 'CAPA_APPROVED', 'FIX_IN_PROGRESS'])
    .order('severity_priority', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching RCRs:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log(`✅ No open RCRs for SD ${sdId}`);
    return;
  }

  console.log(`\n📋 Open RCRs for SD ${sdId} (${data.length} total)\n`);
  console.log('Priority | Status              | Problem Statement');
  console.log('---------|---------------------|------------------------------------------');

  for (const rcr of data) {
    const problemShort = rcr.problem_statement.substring(0, 50) + (rcr.problem_statement.length > 50 ? '...' : '');
    console.log(`${rcr.severity_priority.padEnd(8)} | ${rcr.status.padEnd(19)} | ${problemShort}`);
    console.log(`         | RCR ID: ${rcr.id}`);
  }
}

/**
 * View specific RCR details
 */
async function viewRCR(rcrId) {
  if (!rcrId) {
    console.error('❌ Error: --rcr-id required');
    process.exit(1);
  }

  const { data: rcr, error } = await supabase
    .from('root_cause_reports')
    .select(`
      *,
      remediation_manifests (*)
    `)
    .eq('id', rcrId)
    .single();

  if (error || !rcr) {
    console.error('❌ Error: RCR not found');
    process.exit(1);
  }

  console.log(`\n📊 Root Cause Report: ${rcr.id}\n`);
  console.log(`SD: ${rcr.sd_id || 'N/A'}`);
  console.log(`Priority: ${rcr.severity_priority}`);
  console.log(`Status: ${rcr.status}`);
  console.log(`Confidence: ${rcr.confidence}/100`);
  console.log(`Created: ${new Date(rcr.created_at).toLocaleString()}\n`);

  console.log(`Problem Statement:\n  ${rcr.problem_statement}\n`);

  if (rcr.root_cause) {
    console.log(`Root Cause:\n  ${rcr.root_cause}\n`);
  }

  if (rcr.root_cause_category) {
    console.log(`Category: ${rcr.root_cause_category}\n`);
  }

  console.log(`Impact: ${rcr.impact_level} × ${rcr.likelihood_level} = ${rcr.severity_priority}\n`);

  if (rcr.evidence_refs && Object.keys(rcr.evidence_refs).length > 0) {
    console.log('Evidence:');
    for (const [key, value] of Object.entries(rcr.evidence_refs)) {
      console.log(`  - ${key}: ${typeof value === 'string' ? value.substring(0, 60) : JSON.stringify(value).substring(0, 60)}`);
    }
    console.log();
  }

  if (rcr.remediation_manifests && rcr.remediation_manifests.length > 0) {
    const capa = rcr.remediation_manifests[0];
    console.log(`CAPA Manifest: ${capa.id}`);
    console.log(`  Status: ${capa.status}`);
    console.log(`  Owner: ${capa.owner_agent}`);
    if (capa.immediate_fix) {
      console.log(`  Immediate Fix: ${capa.immediate_fix.substring(0, 60)}...`);
    }
    console.log();
  }
}

/**
 * Create manual RCR
 */
async function triggerManualRCR(options) {
  const { sdId, problemStatement, context } = options;

  if (!sdId || !problemStatement) {
    console.error('❌ Error: --sd-id and --problem-statement required');
    process.exit(1);
  }

  const { data: rcr, error } = await supabase
    .from('root_cause_reports')
    .insert({
      scope_type: 'SD',
      scope_id: sdId,
      sd_id: sdId,
      trigger_source: 'MANUAL',
      trigger_tier: 4,
      failure_signature: `manual:${sdId}:${Date.now()}`,
      problem_statement: problemStatement,
      observed: { description: context || 'Manual investigation' },
      expected: { description: 'Normal operation' },
      evidence_refs: { context: context || 'N/A' },
      confidence: 40, // BASE confidence for manual
      impact_level: 'MEDIUM',
      likelihood_level: 'RARE',
      status: 'OPEN',
      metadata: { manual: true, created_by: 'CLI' }
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating RCR:', error.message);
    process.exit(1);
  }

  console.log(`✅ Manual RCR created: ${rcr.id}`);
  console.log(`   Priority: ${rcr.severity_priority}`);
  console.log(`   Run: node scripts/root-cause-agent.js view --rcr-id ${rcr.id}`);
}

/**
 * Analyze RCR (v1.1 - stub in v1)
 */
async function analyzeRCR(rcrId) {
  console.log('⚠️  Analyze command is a v1.1 feature (stub in v1)');
  console.log(`    Full forensic analysis for RCR ${rcrId} will be available in v1.1`);
  console.log('    Features: 5 Whys analysis, causal chain generation, pattern matching');
}

/**
 * CAPA Operations
 */
async function capaOperations(operation, options) {
  switch (operation) {
    case 'generate':
      return await generateCAPA(options);
    case 'approve':
      return await approveCAPA(options);
    case 'update':
      return await updateCAPA(options);
    case 'verify':
      return await verifyCAPA(options);
    default:
      console.error('❌ Invalid CAPA operation. Use: generate, approve, update, verify');
      process.exit(1);
  }
}

async function generateCAPA(options) {
  const { rcrId } = options;

  if (!rcrId) {
    console.error('❌ Error: --rcr-id required');
    process.exit(1);
  }

  const { data: capa, error } = await supabase
    .from('remediation_manifests')
    .insert({
      rcr_id: rcrId,
      proposed_changes: { description: 'To be defined' },
      impact_assessment: { risk_level: 'MEDIUM' },
      verification_plan: { tests: [] },
      acceptance_criteria: { criteria: [] },
      owner_agent: 'MANUAL',
      status: 'PENDING'
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating CAPA:', error.message);
    process.exit(1);
  }

  console.log(`✅ CAPA manifest created: ${capa.id}`);
  console.log(`   Status: ${capa.status}`);
}

async function approveCAPA(options) {
  const { capaId } = options;

  if (!capaId) {
    console.error('❌ Error: --capa-id required');
    process.exit(1);
  }

  const { error } = await supabase
    .from('remediation_manifests')
    .update({
      status: 'APPROVED',
      approved_at: new Date().toISOString()
    })
    .eq('id', capaId);

  if (error) {
    console.error('❌ Error approving CAPA:', error.message);
    process.exit(1);
  }

  console.log(`✅ CAPA approved: ${capaId}`);
}

async function updateCAPA(options) {
  const { capaId, status } = options;

  if (!capaId || !status) {
    console.error('❌ Error: --capa-id and --status required');
    process.exit(1);
  }

  const validStatuses = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'IMPLEMENTED', 'VERIFIED', 'FAILED_VERIFICATION'];
  if (!validStatuses.includes(status)) {
    console.error(`❌ Error: Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    process.exit(1);
  }

  const updates = { status };
  if (status === 'IMPLEMENTED') {
    updates.implemented_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('remediation_manifests')
    .update(updates)
    .eq('id', capaId);

  if (error) {
    console.error('❌ Error updating CAPA:', error.message);
    process.exit(1);
  }

  console.log(`✅ CAPA updated: ${capaId} → ${status}`);
}

async function verifyCAPA(options) {
  const { capaId } = options;

  if (!capaId) {
    console.error('❌ Error: --capa-id required');
    process.exit(1);
  }

  const { error } = await supabase
    .from('remediation_manifests')
    .update({
      status: 'VERIFIED',
      verified_at: new Date().toISOString()
    })
    .eq('id', capaId);

  if (error) {
    console.error('❌ Error verifying CAPA:', error.message);
    process.exit(1);
  }

  console.log(`✅ CAPA verified: ${capaId}`);
  console.log('   This will auto-resolve the linked RCR');
}

/**
 * Check RCA gate status for SD
 */
async function gateCheck(sdId) {
  if (!sdId) {
    console.error('❌ Error: --sd-id required');
    process.exit(1);
  }

  const { data: openRCRs, error } = await supabase
    .from('root_cause_reports')
    .select(`
      id,
      severity_priority,
      status,
      remediation_manifests (
        id,
        status,
        verified_at
      )
    `)
    .eq('sd_id', sdId)
    .in('status', ['OPEN', 'IN_REVIEW', 'CAPA_PENDING', 'CAPA_APPROVED', 'FIX_IN_PROGRESS'])
    .in('severity_priority', ['P0', 'P1']);

  if (error) {
    console.error('❌ Error checking gate:', error.message);
    process.exit(1);
  }

  if (!openRCRs || openRCRs.length === 0) {
    console.log('\n✅ RCA Gate: PASS');
    console.log('   0 open P0/P1 RCRs');
    console.log('   Handoff can proceed');
    return;
  }

  const blockingRCRs = openRCRs.filter(rcr => {
    const capa = rcr.remediation_manifests?.[0];
    return !capa || capa.status !== 'VERIFIED';
  });

  if (blockingRCRs.length > 0) {
    console.log('\n❌ RCA Gate: BLOCKED');
    console.log(`   ${blockingRCRs.length} open P0/P1 RCRs without verified CAPA`);
    console.log('   Blocking RCR IDs:');
    for (const rcr of blockingRCRs) {
      console.log(`   - ${rcr.id} (${rcr.severity_priority})`);
    }
    console.log('\n   Handoff CANNOT proceed until CAPAs verified');
    console.log('   Run: node scripts/root-cause-agent.js capa verify --capa-id <UUID>');
    process.exit(1);
  }

  console.log('\n✅ RCA Gate: PASS');
  console.log('   All CAPAs verified');
  console.log('   Handoff can proceed');
}

/**
 * Show RCR/CAPA summary for SD
 */
async function statusSummary(sdId) {
  if (!sdId) {
    console.error('❌ Error: --sd-id required');
    process.exit(1);
  }

  const { data: rcrs, error } = await supabase
    .from('root_cause_reports')
    .select(`
      *,
      remediation_manifests (*)
    `)
    .eq('sd_id', sdId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching status:', error.message);
    process.exit(1);
  }

  console.log(`\n📊 RCA Status for SD ${sdId}\n`);

  if (!rcrs || rcrs.length === 0) {
    console.log('✅ No RCRs found');
    return;
  }

  const byStatus = {};
  const bySeverity = {};

  for (const rcr of rcrs) {
    byStatus[rcr.status] = (byStatus[rcr.status] || 0) + 1;
    bySeverity[rcr.severity_priority] = (bySeverity[rcr.severity_priority] || 0) + 1;
  }

  console.log(`Total RCRs: ${rcrs.length}\n`);

  console.log('By Status:');
  for (const [status, count] of Object.entries(byStatus)) {
    console.log(`  ${status}: ${count}`);
  }

  console.log('\nBy Severity:');
  for (const [severity, count] of Object.entries(bySeverity)) {
    console.log(`  ${severity}: ${count}`);
  }

  const openCount = (byStatus.OPEN || 0) + (byStatus.IN_REVIEW || 0) + (byStatus.CAPA_PENDING || 0);
  const resolvedCount = byStatus.RESOLVED || 0;

  console.log(`\nOpen: ${openCount} | Resolved: ${resolvedCount}`);

  if (openCount > 0) {
    console.log(`\nRun: node scripts/root-cause-agent.js list --sd-id ${sdId}`);
  }
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
Root Cause Agent (RCA) CLI - SD-RCA-001

Usage: node scripts/root-cause-agent.js <command> [options]

Commands:
  list --sd-id <SD>                      List open RCRs for SD
  view --rcr-id <UUID>                   View specific RCR details
  trigger --sd-id <SD> --problem-statement <text> [--context <text>]
                                          Create manual RCR
  analyze --rcr-id <UUID>                Analyze RCR (v1.1 stub)
  capa generate --rcr-id <UUID>          Generate CAPA manifest
  capa approve --capa-id <UUID>          Approve CAPA
  capa update --capa-id <UUID> --status <STATUS>
                                          Update CAPA status
  capa verify --capa-id <UUID>           Verify CAPA (auto-resolves RCR)
  gate-check --sd-id <SD>                Check RCA gate status
  status --sd-id <SD>                    Show RCR/CAPA summary
  help                                    Show this help

Examples:
  node scripts/root-cause-agent.js list --sd-id SD-EXPORT-001
  node scripts/root-cause-agent.js view --rcr-id <UUID>
  node scripts/root-cause-agent.js gate-check --sd-id SD-EXPORT-001
  node scripts/root-cause-agent.js capa verify --capa-id <UUID>

Gate Enforcement:
  P0/P1 RCRs block EXEC→PLAN handoff until CAPA verified
  Run gate-check before attempting handoff creation
`);
}

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help') {
    showHelp();
    process.exit(0);
  }

  const command = args[0];
  const options = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2).replace(/-([a-z])/g, (g) => g[1].toUpperCase());
      options[key] = args[++i];
    }
  }

  try {
    switch (command) {
      case 'list':
        await listRCRs(options.sdId);
        break;
      case 'view':
        await viewRCR(options.rcrId);
        break;
      case 'trigger':
        await triggerManualRCR(options);
        break;
      case 'analyze':
        await analyzeRCR(options.rcrId);
        break;
      case 'capa':
        await capaOperations(args[1], options);
        break;
      case 'gate-check':
        await gateCheck(options.sdId);
        break;
      case 'status':
        await statusSummary(options.sdId);
        break;
      default:
        console.error(`❌ Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { gateCheck };
