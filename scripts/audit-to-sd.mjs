#!/usr/bin/env node
/**
 * Audit to SD Generator Script
 *
 * Generates Strategic Directives from triaged audit findings.
 * Enforces 100% triage coverage before SD generation.
 * Preserves verbatim Chairman text and creates proper audit traceability links.
 *
 * Usage:
 *   node scripts/audit-to-sd.mjs --file docs/audits/2025-12-26-navigation-audit.md
 *   node scripts/audit-to-sd.mjs --file docs/audits/2025-12-26-navigation-audit.md --allow-partial --justification "Emergency fix"
 *
 * @see docs/reference/audit-format-spec.md
 * @see database/migrations/20251228_audit_finding_mapping.sql
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();
dotenv.config({ path: '.env.test.local' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

// SD Type mapping based on issue characteristics
const SD_TYPE_MAPPING = {
  bug: 'implementation',
  ux: 'ux_debt',
  brainstorm: 'discovery_spike',
  theme: 'architectural_review',
  question: 'discovery_spike',
  observation: 'strategic_observation'
};

// Severity to priority mapping
const SEVERITY_PRIORITY = {
  critical: 1,
  major: 2,
  minor: 3,
  idea: 4
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    file: null,
    allowPartial: false,
    justification: null,
    dryRun: false,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      options.file = args[i + 1];
      i++;
    } else if (args[i] === '--allow-partial') {
      options.allowPartial = true;
    } else if (args[i] === '--justification' && args[i + 1]) {
      options.justification = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      options.verbose = true;
    }
  }

  return options;
}

async function getCoverageReport(supabase, filePath) {
  const { data, error } = await supabase
    .from('audit_finding_sd_mapping')
    .select('disposition, original_issue_id')
    .eq('audit_file_path', filePath);

  if (error) {
    throw new Error(`Failed to get coverage: ${error.message}`);
  }

  const report = {
    total: data.length,
    pending: 0,
    sd_created: 0,
    deferred: 0,
    wont_fix: 0,
    duplicate: 0,
    needs_discovery: 0,
    coverage_pct: 0
  };

  for (const row of data) {
    if (report[row.disposition] !== undefined) {
      report[row.disposition]++;
    }
  }

  report.coverage_pct = report.total > 0
    ? Math.round((report.total - report.pending) / report.total * 1000) / 10
    : 0;

  return report;
}

async function getUnlinkedSDCreatedItems(supabase, filePath) {
  // Get items marked for SD creation that don't have a linked SD yet
  const { data: mappings, error: mappingError } = await supabase
    .from('audit_finding_sd_mapping')
    .select('*')
    .eq('audit_file_path', filePath)
    .eq('disposition', 'sd_created');

  if (mappingError) {
    throw new Error(`Failed to get mappings: ${mappingError.message}`);
  }

  // Get existing links
  const mappingIds = mappings.map(m => m.id);
  if (mappingIds.length === 0) {
    return [];
  }

  const { data: links, error: linkError } = await supabase
    .from('audit_finding_sd_links')
    .select('mapping_id, sd_id')
    .in('mapping_id', mappingIds);

  if (linkError) {
    throw new Error(`Failed to get links: ${linkError.message}`);
  }

  const linkedMappingIds = new Set(links?.map(l => l.mapping_id) || []);

  // Return unlinked items
  return mappings.filter(m => !linkedMappingIds.has(m.id));
}

function generateSDId(issueType, counter) {
  const prefix = 'SD-AUDIT';
  const typeSuffix = (issueType || 'FIX').toUpperCase().substring(0, 3);
  return `${prefix}-${typeSuffix}-${String(counter).padStart(3, '0')}`;
}

function createSDFromAuditItem(item, sdId) {
  const sdType = SD_TYPE_MAPPING[item.issue_type] || 'implementation';
  const priority = SEVERITY_PRIORITY[item.severity] || 3;

  return {
    id: sdId,
    title: `[Audit] ${item.original_issue_id}: ${item.verbatim_text.substring(0, 80)}${item.verbatim_text.length > 80 ? '...' : ''}`,
    description: `Audit finding from ${item.audit_file_path}

**Original Issue ID**: ${item.original_issue_id}
**Route**: ${item.route_path || 'N/A'}
**Type**: ${item.issue_type}
**Severity**: ${item.severity}

**Chairman's Verbatim Observation**:
> ${item.verbatim_text}

---
*Auto-generated from audit ingestion pipeline*`,
    status: 'draft',
    sd_type: sdType,
    target_application: 'EHG',
    strategic_objectives: [
      `Address audit finding ${item.original_issue_id}`,
      `Improve ${item.route_path || 'affected area'}`
    ],
    success_metrics: [
      `Issue ${item.original_issue_id} is resolved`,
      'No regression in affected area'
    ],
    metadata: {
      source_type: 'runtime_audit',
      source_audit_file: item.audit_file_path,
      original_issue_ids: [item.original_issue_id],
      chairman_verbatim_text: item.verbatim_text,
      audit_date: item.audit_date,
      auto_generated: true
    }
  };
}

async function generateSDs(filePath, options = {}) {
  const result = {
    success: false,
    filePath,
    coverage: null,
    sdsGenerated: 0,
    linksCreated: 0,
    errors: [],
    warnings: [],
    generatedSDs: []
  };

  // Check Supabase connection
  if (!supabaseUrl || !supabaseKey) {
    result.errors.push('Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    return result;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Step 1: Check coverage
  console.log('Step 1: Checking triage coverage...');
  result.coverage = await getCoverageReport(supabase, filePath);

  console.log(`  Total items: ${result.coverage.total}`);
  console.log(`  Pending: ${result.coverage.pending}`);
  console.log(`  SD Created: ${result.coverage.sd_created}`);
  console.log(`  Deferred: ${result.coverage.deferred}`);
  console.log(`  Won't Fix: ${result.coverage.wont_fix}`);
  console.log(`  Duplicate: ${result.coverage.duplicate}`);
  console.log(`  Needs Discovery: ${result.coverage.needs_discovery}`);
  console.log(`  Coverage: ${result.coverage.coverage_pct}%`);

  if (result.coverage.total === 0) {
    result.errors.push('No audit items found for this file. Run ingestion first.');
    return result;
  }

  // Enforce 100% coverage
  if (result.coverage.pending > 0) {
    if (!options.allowPartial) {
      result.errors.push(`Triage incomplete: ${result.coverage.pending} items still pending.`);
      result.errors.push('All items must have a disposition before SD generation.');
      result.errors.push('Use --allow-partial --justification "reason" to override.');
      return result;
    } else if (!options.justification) {
      result.errors.push('Partial coverage requires justification. Use --justification "reason"');
      return result;
    } else {
      result.warnings.push(`Proceeding with partial coverage (${result.coverage.coverage_pct}%): ${options.justification}`);
    }
  }

  // Step 2: Get unlinked items marked for SD creation
  console.log('\nStep 2: Finding items needing SDs...');
  const unlinkedItems = await getUnlinkedSDCreatedItems(supabase, filePath);

  if (unlinkedItems.length === 0) {
    console.log('  No unlinked items found - all SDs already created');
    result.success = true;
    return result;
  }

  console.log(`  Found ${unlinkedItems.length} items needing SDs`);

  // Step 3: Generate SDs
  console.log('\nStep 3: Generating Strategic Directives...');

  // Get next SD counter
  const { data: existingSDs, error: countError } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .like('id', 'SD-AUDIT-%');

  let sdCounter = (existingSDs?.length || 0) + 1;

  const sdsToCreate = [];
  const linksToCreate = [];

  for (const item of unlinkedItems) {
    const sdId = generateSDId(item.issue_type, sdCounter);
    const sd = createSDFromAuditItem(item, sdId);

    sdsToCreate.push(sd);
    linksToCreate.push({
      mapping_id: item.id,
      sd_id: sdId,
      link_type: 'primary'
    });

    result.generatedSDs.push({
      id: sdId,
      originalIssueId: item.original_issue_id,
      type: sd.sd_type,
      title: sd.title.substring(0, 60) + '...'
    });

    sdCounter++;
  }

  if (options.verbose) {
    console.log('\n  Generated SDs:');
    for (const sd of result.generatedSDs.slice(0, 5)) {
      console.log(`    ${sd.id}: ${sd.originalIssueId} -> ${sd.type}`);
    }
    if (result.generatedSDs.length > 5) {
      console.log(`    ... and ${result.generatedSDs.length - 5} more`);
    }
  }

  // Step 4: Insert SDs and links
  if (options.dryRun) {
    console.log('\n[DRY RUN] Would create:');
    console.log(`  ${sdsToCreate.length} Strategic Directives`);
    console.log(`  ${linksToCreate.length} audit-to-SD links`);
    result.sdsGenerated = sdsToCreate.length;
    result.linksCreated = linksToCreate.length;
    result.success = true;
    return result;
  }

  console.log('\nStep 4: Creating SDs in database...');

  // Insert SDs in batches
  const batchSize = 10;
  for (let i = 0; i < sdsToCreate.length; i += batchSize) {
    const batch = sdsToCreate.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(batch)
      .select('id');

    if (error) {
      result.errors.push(`SD batch ${Math.floor(i / batchSize) + 1} failed: ${error.message}`);
    } else {
      result.sdsGenerated += (data?.length || 0);
      console.log(`  Created SD batch ${Math.floor(i / batchSize) + 1}: ${data?.length || 0} SDs`);
    }
  }

  // Create links
  console.log('\nStep 5: Creating audit-to-SD links...');
  const { data: linkData, error: linkError } = await supabase
    .from('audit_finding_sd_links')
    .insert(linksToCreate)
    .select('id');

  if (linkError) {
    result.errors.push(`Failed to create links: ${linkError.message}`);
  } else {
    result.linksCreated = linkData?.length || 0;
    console.log(`  Created ${result.linksCreated} links`);
  }

  // Update disposition_at for linked items
  console.log('\nStep 6: Updating disposition timestamps...');
  const now = new Date().toISOString();
  for (const link of linksToCreate) {
    await supabase
      .from('audit_finding_sd_mapping')
      .update({ disposition_at: now })
      .eq('id', link.mapping_id);
  }

  result.success = result.errors.length === 0;
  return result;
}

function printResult(result) {
  console.log('\n' + '='.repeat(70));
  console.log('SD GENERATION RESULT');
  console.log('='.repeat(70));

  console.log(`\nFile: ${result.filePath}`);
  if (result.coverage) {
    console.log(`Coverage: ${result.coverage.coverage_pct}%`);
  }
  console.log(`SDs generated: ${result.sdsGenerated}`);
  console.log(`Links created: ${result.linksCreated}`);

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

  if (result.generatedSDs.length > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log('GENERATED SDs:');
    console.log('-'.repeat(70));
    for (const sd of result.generatedSDs) {
      console.log(`  ${sd.id} <- ${sd.originalIssueId} (${sd.type})`);
    }
  }

  console.log('\n' + '='.repeat(70));
  if (result.success) {
    console.log('Result: SUCCESS');
    if (result.sdsGenerated > 0) {
      console.log(`\n${result.sdsGenerated} SDs created and linked to audit findings`);
      console.log('\nNext steps:');
      console.log('  1. Review generated SDs in Supabase Studio');
      console.log('  2. Update status to "approved" when ready');
      console.log('  3. Execute SDs through LEO Protocol');
    }
  } else {
    console.log('Result: FAILED');
    console.log('\nFix the errors above and re-run.');
  }
  console.log('='.repeat(70));
}

async function main() {
  const options = parseArgs();

  if (!options.file) {
    console.error('Usage: node scripts/audit-to-sd.mjs --file <path-to-audit-file>');
    console.error('');
    console.error('Options:');
    console.error('  --file <path>           Path to audit markdown file (required)');
    console.error('  --allow-partial         Allow SD generation with incomplete triage');
    console.error('  --justification <text>  Reason for partial coverage (required with --allow-partial)');
    console.error('  --dry-run               Show what would be created without committing');
    console.error('  --verbose, -v           Show detailed output');
    console.error('');
    console.error('Examples:');
    console.error('  node scripts/audit-to-sd.mjs --file docs/audits/2025-12-26-navigation-audit.md');
    console.error('  node scripts/audit-to-sd.mjs --file docs/audits/2025-12-26-navigation-audit.md --dry-run');
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log('AUDIT TO SD GENERATOR');
  console.log('='.repeat(70));
  console.log(`\nFile: ${options.file}`);
  if (options.dryRun) {
    console.log('Mode: DRY RUN');
  }
  if (options.allowPartial) {
    console.log('Mode: ALLOW PARTIAL COVERAGE');
  }
  console.log('');

  try {
    const result = await generateSDs(options.file, options);
    printResult(result);
    process.exit(result.success ? 0 : 1);
  } catch (err) {
    console.error('\nUnexpected error:', err.message);
    process.exit(1);
  }
}

main();

// Export for testing
export { generateSDs, getCoverageReport, createSDFromAuditItem };
