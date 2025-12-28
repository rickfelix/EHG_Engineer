#!/usr/bin/env node
/**
 * Audit File Ingestion Script
 *
 * Parses validated audit markdown files and creates entries in audit_finding_sd_mapping table.
 * Preserves Chairman's verbatim text and original issue IDs with full traceability.
 *
 * Usage:
 *   node scripts/ingest-audit-file.mjs --file docs/audits/2025-12-26-navigation-audit.md
 *   node scripts/ingest-audit-file.mjs --file docs/audits/2025-12-26-navigation-audit.md --dry-run
 *
 * @see docs/reference/audit-format-spec.md
 * @see database/migrations/20251228_audit_finding_mapping.sql
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validateAuditFile } from './validate-audit-file.mjs';

// Load environment variables
dotenv.config();
dotenv.config({ path: '.env.test.local' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    file: null,
    dryRun: false,
    force: false,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      options.file = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    } else if (args[i] === '--force') {
      options.force = true;
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      options.verbose = true;
    }
  }

  return options;
}

function calculateContentHash(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function extractAuditDate(filePath) {
  const filename = path.basename(filePath);
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return match[1];
  }
  return null;
}

async function checkExistingIngestion(supabase, filePath, contentHash) {
  // Check by file path
  const { data: byPath, error: pathError } = await supabase
    .from('audit_finding_sd_mapping')
    .select('id, audit_content_hash, ingested_at')
    .eq('audit_file_path', filePath)
    .limit(1);

  if (pathError) {
    throw new Error(`Failed to check existing ingestion: ${pathError.message}`);
  }

  if (byPath && byPath.length > 0) {
    const existing = byPath[0];
    if (existing.audit_content_hash === contentHash) {
      return { exists: true, reason: 'identical', existingHash: existing.audit_content_hash };
    } else {
      return { exists: true, reason: 'modified', existingHash: existing.audit_content_hash };
    }
  }

  return { exists: false };
}

async function ingestAuditFile(filePath, options = {}) {
  const result = {
    success: false,
    filePath,
    auditDate: null,
    contentHash: null,
    issuesIngested: 0,
    issuesSkipped: 0,
    errors: [],
    warnings: []
  };

  // Step 1: Validate the file first
  console.log('Step 1: Validating audit file...');
  const validation = validateAuditFile(filePath, options.verbose);

  if (!validation.valid) {
    result.errors.push('File validation failed. Fix errors before ingestion.');
    result.errors.push(...validation.errors);
    return result;
  }

  console.log(`  Validation passed: ${validation.issueCount} issues found`);

  // Step 2: Read file and calculate hash
  console.log('\nStep 2: Calculating content hash...');
  const content = fs.readFileSync(filePath, 'utf-8');
  result.contentHash = calculateContentHash(content);
  result.auditDate = extractAuditDate(filePath);

  console.log(`  Content hash: ${result.contentHash.substring(0, 16)}...`);
  console.log(`  Audit date: ${result.auditDate}`);

  // Step 3: Check Supabase connection
  if (!supabaseUrl || !supabaseKey) {
    result.errors.push('Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    return result;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Step 4: Check for existing ingestion
  console.log('\nStep 3: Checking for existing ingestion...');

  if (!options.dryRun) {
    const existing = await checkExistingIngestion(supabase, filePath, result.contentHash);

    if (existing.exists) {
      if (existing.reason === 'identical' && !options.force) {
        result.warnings.push('File already ingested with identical content. Use --force to re-ingest.');
        console.log('  File already ingested (identical content)');
        return result;
      } else if (existing.reason === 'modified' && !options.force) {
        result.errors.push(`File content has changed since last ingestion. Previous hash: ${existing.existingHash?.substring(0, 16)}...`);
        result.errors.push('Use --force to delete existing entries and re-ingest.');
        return result;
      } else if (options.force) {
        // Delete existing entries
        console.log('  Deleting existing entries (--force flag used)...');
        const { error: deleteError } = await supabase
          .from('audit_finding_sd_mapping')
          .delete()
          .eq('audit_file_path', filePath);

        if (deleteError) {
          result.errors.push(`Failed to delete existing entries: ${deleteError.message}`);
          return result;
        }
        console.log('  Existing entries deleted');
      }
    } else {
      console.log('  No existing ingestion found');
    }
  } else {
    console.log('  [DRY RUN] Skipping existence check');
  }

  // Step 5: Prepare records for insertion
  console.log(`\nStep 4: Preparing ${validation.issues.length} records for insertion...`);

  const records = validation.issues.map(issue => ({
    audit_file_path: filePath,
    original_issue_id: issue.id,
    audit_date: result.auditDate,
    source_line_number: issue.lineNumber,
    audit_content_hash: result.contentHash,
    ingested_by: 'ingest-audit-file.mjs',
    verbatim_text: issue.description || '',
    issue_type: (issue.type || 'Bug').toLowerCase(),
    severity: (issue.severity || 'Major').toLowerCase(),
    route_path: issue.route || null,
    disposition: 'pending'
  }));

  if (options.verbose) {
    console.log('\n  Sample records:');
    for (const record of records.slice(0, 3)) {
      console.log(`    ${record.original_issue_id}: ${record.verbatim_text.substring(0, 50)}...`);
    }
    if (records.length > 3) {
      console.log(`    ... and ${records.length - 3} more`);
    }
  }

  // Step 6: Insert records
  if (options.dryRun) {
    console.log('\n[DRY RUN] Would insert the following records:');
    console.log(`  Total: ${records.length}`);
    console.log(`  File path: ${filePath}`);
    console.log(`  Audit date: ${result.auditDate}`);
    console.log(`  Content hash: ${result.contentHash.substring(0, 16)}...`);
    result.issuesIngested = records.length;
    result.success = true;
    return result;
  }

  console.log('\nStep 5: Inserting records into database...');

  // Insert in batches of 50
  const batchSize = 50;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('audit_finding_sd_mapping')
      .insert(batch)
      .select('id, original_issue_id');

    if (error) {
      result.errors.push(`Batch ${Math.floor(i / batchSize) + 1} failed: ${error.message}`);
      // Continue with other batches
    } else {
      result.issuesIngested += (data?.length || 0);
      console.log(`  Inserted batch ${Math.floor(i / batchSize) + 1}: ${data?.length || 0} records`);
    }
  }

  // Step 7: Verify insertion
  console.log('\nStep 6: Verifying insertion...');
  const { data: verification, error: verifyError } = await supabase
    .from('audit_finding_sd_mapping')
    .select('id, original_issue_id')
    .eq('audit_file_path', filePath);

  if (verifyError) {
    result.warnings.push(`Verification failed: ${verifyError.message}`);
  } else {
    console.log(`  Verified: ${verification?.length || 0} records in database`);
    if (verification?.length !== result.issuesIngested) {
      result.warnings.push(`Mismatch: inserted ${result.issuesIngested} but found ${verification?.length} in database`);
    }
  }

  result.success = result.errors.length === 0;
  return result;
}

function printResult(result) {
  console.log('\n' + '='.repeat(70));
  console.log('AUDIT FILE INGESTION RESULT');
  console.log('='.repeat(70));

  console.log(`\nFile: ${result.filePath}`);
  console.log(`Audit date: ${result.auditDate || 'Unknown'}`);
  console.log(`Content hash: ${result.contentHash?.substring(0, 16) || 'N/A'}...`);
  console.log(`Issues ingested: ${result.issuesIngested}`);
  console.log(`Issues skipped: ${result.issuesSkipped}`);

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
    console.log(`Result: SUCCESS`);
    console.log(`${result.issuesIngested} issues ingested with disposition='pending'`);
    console.log('\nNext steps:');
    console.log('  1. Triage issues via Supabase Studio');
    console.log('  2. Run: npm run audit:generate-sds --file <path>');
  } else {
    console.log(`Result: FAILED`);
  }
  console.log('='.repeat(70));
}

async function main() {
  const options = parseArgs();

  if (!options.file) {
    console.error('Usage: node scripts/ingest-audit-file.mjs --file <path-to-audit-file>');
    console.error('');
    console.error('Options:');
    console.error('  --file <path>   Path to audit markdown file (required)');
    console.error('  --dry-run       Validate and show what would be inserted without committing');
    console.error('  --force         Re-ingest even if file was already ingested');
    console.error('  --verbose, -v   Show detailed output');
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log('AUDIT FILE INGESTION');
  console.log('='.repeat(70));
  console.log(`\nFile: ${options.file}`);
  if (options.dryRun) {
    console.log('Mode: DRY RUN (no database changes)');
  }
  if (options.force) {
    console.log('Mode: FORCE (will replace existing entries)');
  }
  console.log('');

  try {
    const result = await ingestAuditFile(options.file, options);
    printResult(result);
    process.exit(result.success ? 0 : 1);
  } catch (err) {
    console.error('\nUnexpected error:', err.message);
    process.exit(1);
  }
}

main();

// Export for testing
export { ingestAuditFile, calculateContentHash, extractAuditDate };
