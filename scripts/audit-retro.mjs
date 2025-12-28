#!/usr/bin/env node
/**
 * Audit Retrospective Script (Phase 7 of Runtime Audit Protocol)
 *
 * Triggers audit retrospective generation after SD creation.
 * Aggregates data from multiple sources and invokes RETRO sub-agent in audit_retro mode.
 *
 * Usage:
 *   node scripts/audit-retro.mjs --file docs/audits/2025-12-26-navigation-audit.md
 *   npm run audit:retro -- --file docs/audits/2025-12-26-navigation-audit.md
 *
 * @see docs/reference/audit-to-sd-pipeline.md
 * @see lib/sub-agents/retro.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { execute as executeRetro } from '../lib/sub-agents/retro.js';

// Load environment variables
dotenv.config();
dotenv.config({ path: '.env.test.local' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    file: null,
    verbose: false,
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      options.file = args[i + 1];
      i++;
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      options.verbose = true;
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

/**
 * Load audit findings from mapping table
 */
async function loadAuditFindings(supabase, filePath) {
  const { data, error } = await supabase
    .from('audit_finding_sd_mapping')
    .select('*')
    .eq('audit_file_path', filePath)
    .order('original_issue_id');

  if (error) {
    throw new Error(`Failed to load audit findings: ${error.message}`);
  }

  return data || [];
}

/**
 * Load triangulation log entries
 */
async function loadTriangulationLog(supabase, auditId) {
  if (!auditId) return [];

  const { data, error } = await supabase
    .from('audit_triangulation_log')
    .select('*')
    .eq('audit_id', auditId)
    .order('issue_id');

  if (error) {
    console.log(`   Note: Triangulation log not available: ${error.message}`);
    return [];
  }

  return data || [];
}

/**
 * Load Chairman verbatim from findings
 */
function extractChairmanVerbatim(findings) {
  // Extract unique verbatim text from findings
  const verbatimSet = new Set();

  for (const finding of findings) {
    if (finding.verbatim_text && finding.verbatim_text.trim()) {
      verbatimSet.add(finding.verbatim_text.trim());
    }
  }

  return Array.from(verbatimSet);
}

/**
 * Load Chairman feedback from chairman_feedback table
 */
async function loadChairmanFeedback(supabase, filePath) {
  const { data, error } = await supabase
    .from('chairman_feedback')
    .select('transcript_text, chairman_edited')
    .or(`target_id.eq.${filePath},target_type.eq.audit`);

  if (error) {
    console.log(`   Note: Chairman feedback table not available: ${error.message}`);
    return [];
  }

  return (data || [])
    .map(f => f.chairman_edited || f.transcript_text)
    .filter(t => t && t.trim());
}

/**
 * Load sub-agent contributions
 */
async function loadSubAgentContributions(supabase, sdIds) {
  if (!sdIds || sdIds.length === 0) return [];

  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('sub_agent_code, sub_agent_name, retro_contribution, verdict, confidence')
    .in('sd_id', sdIds)
    .not('retro_contribution', 'is', null);

  if (error) {
    console.log(`   Note: Sub-agent contributions not available: ${error.message}`);
    return [];
  }

  return (data || []).filter(d => d.retro_contribution && Object.keys(d.retro_contribution).length > 0);
}

/**
 * Get or create runtime audit record
 */
async function getOrCreateRuntimeAudit(supabase, filePath, auditDate, findings) {
  // Check for existing
  const { data: existing, error: existError } = await supabase
    .from('runtime_audits')
    .select('*')
    .eq('audit_file_path', filePath)
    .single();

  if (existing) {
    return existing;
  }

  // Calculate metrics
  const metrics = {
    total_findings: findings.length,
    sd_created_count: findings.filter(f => f.disposition === 'sd_created').length,
    deferred_count: findings.filter(f => f.disposition === 'deferred').length,
    wont_fix_count: findings.filter(f => f.disposition === 'wont_fix').length,
    needs_discovery_count: findings.filter(f => f.disposition === 'needs_discovery').length,
    duplicate_count: findings.filter(f => f.disposition === 'duplicate').length,
    coverage_pct: findings.length > 0
      ? Math.round((findings.filter(f => f.disposition !== 'pending').length / findings.length) * 1000) / 10
      : 0
  };

  // Create new record
  const { data: created, error: createError } = await supabase
    .from('runtime_audits')
    .insert({
      audit_file_path: filePath,
      audit_date: auditDate,
      target_application: 'EHG',
      ...metrics,
      status: 'triaged',
      created_by: 'audit-retro.mjs'
    })
    .select('*')
    .single();

  if (createError) {
    console.log(`   Note: Could not create runtime_audits record: ${createError.message}`);
    return null;
  }

  return created;
}

/**
 * Get linked SD IDs from audit_finding_sd_links
 */
async function getLinkedSDIds(supabase, mappingIds) {
  if (!mappingIds || mappingIds.length === 0) return [];

  const { data, error } = await supabase
    .from('audit_finding_sd_links')
    .select('sd_id')
    .in('mapping_id', mappingIds);

  if (error) {
    console.log(`   Note: SD links not available: ${error.message}`);
    return [];
  }

  return [...new Set((data || []).map(d => d.sd_id))];
}

/**
 * Compute audit metrics
 */
function computeMetrics(findings, triangulation) {
  const total = findings.length;
  const pending = findings.filter(f => f.disposition === 'pending').length;

  // Coverage percentage
  const coverage_pct = total > 0 ? Math.round((total - pending) / total * 1000) / 10 : 0;

  // Triangulation consensus rate
  const consensusEntries = triangulation.filter(t =>
    t.consensus_type === 'HIGH' || t.consensus_score >= 70
  ).length;
  const consensus_rate = triangulation.length > 0
    ? Math.round(consensusEntries / triangulation.length * 100)
    : 0;

  // Verbatim preservation rate (assuming all findings have verbatim text)
  const withVerbatim = findings.filter(f => f.verbatim_text && f.verbatim_text.length > 10).length;
  const verbatim_preservation_rate = total > 0
    ? Math.round(withVerbatim / total * 100)
    : 0;

  return {
    total_findings: total,
    coverage_pct,
    consensus_rate,
    verbatim_preservation_rate
  };
}

async function runAuditRetrospective(filePath, options = {}) {
  const result = {
    success: false,
    filePath,
    retroId: null,
    qualityScore: 0,
    errors: [],
    warnings: []
  };

  // Check Supabase connection
  if (!supabaseUrl || !supabaseKey) {
    result.errors.push('Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    return result;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Step 1: Load audit findings
  console.log('Step 1: Loading audit findings from mapping table...');
  const findings = await loadAuditFindings(supabase, filePath);

  if (findings.length === 0) {
    result.errors.push('No audit findings found. Run audit:ingest first.');
    return result;
  }

  console.log(`   Loaded ${findings.length} findings`);

  // Extract audit date from first finding
  const auditDate = findings[0].audit_date;

  // Step 2: Get or create runtime audit record
  console.log('\nStep 2: Getting/creating runtime audit record...');
  const runtimeAudit = await getOrCreateRuntimeAudit(supabase, filePath, auditDate, findings);
  const auditId = runtimeAudit?.id;

  if (auditId) {
    console.log(`   Audit ID: ${auditId}`);
  } else {
    result.warnings.push('Could not create runtime_audits record - some features may be limited');
  }

  // Step 3: Load triangulation log
  console.log('\nStep 3: Loading triangulation log...');
  const triangulation = await loadTriangulationLog(supabase, auditId);
  console.log(`   Loaded ${triangulation.length} triangulation entries`);

  // Step 4: Extract Chairman verbatim from findings
  console.log('\nStep 4: Extracting Chairman verbatim observations...');
  const chairmanVerbatim = extractChairmanVerbatim(findings);

  // Also load from chairman_feedback table
  const chairmanFeedback = await loadChairmanFeedback(supabase, filePath);

  // Combine and deduplicate
  const allVerbatim = [...new Set([...chairmanVerbatim, ...chairmanFeedback])];
  console.log(`   Extracted ${allVerbatim.length} unique verbatim observations`);

  // Step 5: Get linked SD IDs and load sub-agent contributions
  console.log('\nStep 5: Loading sub-agent contributions...');
  const mappingIds = findings.map(f => f.id);
  const sdIds = await getLinkedSDIds(supabase, mappingIds);
  const subAgentContributions = await loadSubAgentContributions(supabase, sdIds);
  console.log(`   Loaded ${subAgentContributions.length} sub-agent contributions from ${sdIds.length} SDs`);

  // Step 6: Compute metrics
  console.log('\nStep 6: Computing metrics...');
  const metrics = computeMetrics(findings, triangulation);
  console.log(`   Coverage: ${metrics.coverage_pct}%`);
  console.log(`   Triangulation consensus rate: ${metrics.consensus_rate}%`);
  console.log(`   Verbatim preservation rate: ${metrics.verbatim_preservation_rate}%`);

  // Step 7: Build audit context
  console.log('\nStep 7: Building audit context for RETRO...');
  const auditContext = {
    audit_id: auditId,
    audit_file_path: filePath,
    findings,
    triangulation,
    chairman_verbatim: allVerbatim,
    sub_agent_contributions: subAgentContributions,
    metrics
  };

  if (options.verbose) {
    console.log('\n   Audit Context Summary:');
    console.log(`     Findings: ${findings.length}`);
    console.log(`     Triangulation entries: ${triangulation.length}`);
    console.log(`     Verbatim observations: ${allVerbatim.length}`);
    console.log(`     Sub-agent contributions: ${subAgentContributions.length}`);
  }

  // Step 8: Invoke RETRO sub-agent
  console.log('\nStep 8: Invoking RETRO sub-agent in audit_retro mode...');

  if (options.dryRun) {
    console.log('\n[DRY RUN] Would invoke RETRO with:');
    console.log(`  Mode: audit_retro`);
    console.log(`  Audit file: ${filePath}`);
    console.log(`  Findings: ${findings.length}`);
    console.log(`  Verbatim: ${allVerbatim.length}`);
    result.success = true;
    return result;
  }

  try {
    // Create a mock sub-agent object (RETRO uses instructions from database)
    const subAgent = {
      code: 'RETRO',
      name: 'Continuous Improvement Coach'
    };

    const retroResult = await executeRetro(
      auditId || 'audit-retro', // sdId parameter (used for identification)
      subAgent,
      {
        mode: 'audit_retro',
        auditContext
      }
    );

    if (retroResult.findings?.retrospective?.id) {
      result.retroId = retroResult.findings.retrospective.id;
      result.qualityScore = retroResult.findings.quality_score || retroResult.confidence || 0;
      result.success = retroResult.verdict !== 'BLOCKED';
    } else {
      result.warnings.push('Retrospective may not have been stored in database');
      result.success = retroResult.verdict !== 'BLOCKED';
    }

    // Collect any warnings from RETRO
    if (retroResult.warnings && retroResult.warnings.length > 0) {
      result.warnings.push(...retroResult.warnings);
    }

  } catch (err) {
    result.errors.push(`RETRO execution failed: ${err.message}`);
  }

  return result;
}

function printResult(result) {
  console.log('\n' + '='.repeat(70));
  console.log('AUDIT RETROSPECTIVE RESULT');
  console.log('='.repeat(70));

  console.log(`\nFile: ${result.filePath}`);
  if (result.retroId) {
    console.log(`Retrospective ID: ${result.retroId}`);
  }
  console.log(`Quality Score: ${result.qualityScore}/100`);

  if (result.errors.length > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log('ERRORS:');
    console.log('-'.repeat(70));
    for (const error of result.errors) {
      console.log(`  - ${error}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log('WARNINGS:');
    console.log('-'.repeat(70));
    for (const warning of result.warnings) {
      console.log(`  - ${warning}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  if (result.success) {
    console.log('Result: SUCCESS');
    if (result.qualityScore >= 70) {
      console.log(`\nAudit retrospective published with quality score ${result.qualityScore}/100`);
    } else {
      console.log(`\nAudit retrospective saved as draft (quality score ${result.qualityScore}/100)`);
      console.log('Review and improve before publishing.');
    }

    console.log('\nNext steps:');
    console.log('  1. Review retrospective in Supabase Studio');
    console.log('  2. Check action items and assign owners');
    console.log('  3. Extract patterns for issue_patterns table');
  } else {
    console.log('Result: FAILED');
    console.log('\nFix the errors above and re-run.');
  }
  console.log('='.repeat(70));
}

async function main() {
  const options = parseArgs();

  if (!options.file) {
    console.error('Usage: node scripts/audit-retro.mjs --file <path-to-audit-file>');
    console.error('');
    console.error('Options:');
    console.error('  --file <path>   Path to audit markdown file (required)');
    console.error('  --verbose, -v   Show detailed context information');
    console.error('  --dry-run       Show what would happen without invoking RETRO');
    console.error('');
    console.error('Examples:');
    console.error('  node scripts/audit-retro.mjs --file docs/audits/2025-12-26-navigation-audit.md');
    console.error('  npm run audit:retro -- --file docs/audits/2025-12-26-navigation-audit.md');
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log('AUDIT RETROSPECTIVE (Phase 7)');
  console.log('='.repeat(70));
  console.log(`\nFile: ${options.file}`);
  if (options.dryRun) {
    console.log('Mode: DRY RUN');
  }
  console.log('');

  try {
    const result = await runAuditRetrospective(options.file, options);
    printResult(result);
    process.exit(result.success ? 0 : 1);
  } catch (err) {
    console.error('\nUnexpected error:', err.message);
    process.exit(1);
  }
}

main();

// Export for testing
export { runAuditRetrospective, loadAuditFindings, computeMetrics };
