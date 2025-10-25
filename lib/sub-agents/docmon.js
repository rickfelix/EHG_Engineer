/**
 * DOCMON Sub-Agent (Information Architecture Lead)
 * LEO Protocol v4.2.0 - Sub-Agent Performance Enhancement
 *
 * Purpose: Enforce database-first architecture by detecting file-based violations
 * Code: DOCMON
 * Priority: 95 (highest - enforces core protocol)
 *
 * Philosophy: "Database is source of truth. Files are read-only outputs."
 *
 * Created: 2025-10-11 (SD-SUBAGENT-IMPROVE-001)
 */

import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Execute DOCMON sub-agent
 * Detects file-based documentation violations
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent instructions (already loaded)
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} DOCMON results
 */
export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n📚 Starting DOCMON for ${sdId}...`);
  console.log('   Information Architecture Lead - Database-First Enforcement');

  const results = {
    verdict: 'PASS',
    confidence: 100,
    critical_issues: [],
    warnings: [],
    recommendations: [],
    detailed_analysis: {},
    findings: {
      sd_files: null,
      prd_files: null,
      retro_files: null,
      handoff_files: null,
      other_violations: null
    },
    options
  };

  try {
    const rootDir = options.root_dir || '/mnt/c/_EHG/EHG_Engineer';

    // Phase 1: Scan for Strategic Directive markdown files
    console.log('\n📄 Phase 1: Checking for SD markdown files...');
    const sdFiles = await findFiles(rootDir, /^SD-.*\.md$/);
    results.findings.sd_files = { count: sdFiles.length, files: sdFiles };

    if (sdFiles.length > 0) {
      console.log(`   ❌ Found ${sdFiles.length} SD markdown file(s) - VIOLATION`);
      results.critical_issues.push({
        severity: 'CRITICAL',
        issue: `${sdFiles.length} Strategic Directive markdown file(s) found`,
        recommendation: 'Convert to database records in strategic_directives_v2 table',
        files: sdFiles.slice(0, 5), // Show first 5
        violation_type: 'SD_FILE_CREATED'
      });
      results.verdict = 'BLOCKED';
    } else {
      console.log('   ✅ No SD markdown files found');
    }

    // Phase 2: Scan for PRD markdown files
    console.log('\n📋 Phase 2: Checking for PRD markdown files...');
    const prdFiles = await findFiles(rootDir, /^PRD-.*\.md$/);
    results.findings.prd_files = { count: prdFiles.length, files: prdFiles };

    if (prdFiles.length > 0) {
      console.log(`   ❌ Found ${prdFiles.length} PRD markdown file(s) - VIOLATION`);
      results.critical_issues.push({
        severity: 'CRITICAL',
        issue: `${prdFiles.length} PRD markdown file(s) found`,
        recommendation: 'Convert to database records in product_requirements_v2 table',
        files: prdFiles.slice(0, 5),
        violation_type: 'PRD_FILE_CREATED'
      });
      results.verdict = 'BLOCKED';
    } else {
      console.log('   ✅ No PRD markdown files found');
    }

    // Phase 3: Scan for Retrospective markdown files (outside retrospectives/ folder)
    console.log('\n🔄 Phase 3: Checking for retrospective markdown files...');
    const retroFiles = await findFiles(rootDir, /retrospective.*\.md$/i, [join(rootDir, 'retrospectives')]);
    results.findings.retro_files = { count: retroFiles.length, files: retroFiles };

    if (retroFiles.length > 0) {
      console.log(`   ❌ Found ${retroFiles.length} retrospective file(s) outside retrospectives/ - VIOLATION`);
      results.critical_issues.push({
        severity: 'CRITICAL',
        issue: `${retroFiles.length} retrospective markdown file(s) found outside retrospectives/`,
        recommendation: 'Convert to database records in retrospectives table',
        files: retroFiles.slice(0, 5),
        violation_type: 'RETRO_FILE_CREATED'
      });
      results.verdict = 'BLOCKED';
    } else {
      console.log('   ✅ No retrospective files found outside allowed directories');
    }

    // Phase 4: Scan for Handoff markdown files
    console.log('\n🔄 Phase 4: Checking for handoff markdown files...');
    const handoffFiles = await findFiles(rootDir, /handoff.*\.md$/i);
    results.findings.handoff_files = { count: handoffFiles.length, files: handoffFiles };

    if (handoffFiles.length > 0) {
      console.log(`   ❌ Found ${handoffFiles.length} handoff file(s) - VIOLATION`);
      results.critical_issues.push({
        severity: 'CRITICAL',
        issue: `${handoffFiles.length} handoff markdown file(s) found`,
        recommendation: 'Store handoffs in sd_phase_handoffs table via unified-handoff-system.js',
        files: handoffFiles.slice(0, 5),
        violation_type: 'HANDOFF_FILE_CREATED'
      });
      results.verdict = 'BLOCKED';
    } else {
      console.log('   ✅ No handoff files found');
    }

    // Phase 5: Check database consistency
    console.log('\n🗄️  Phase 5: Verifying database records exist...');
    const dbCheck = await verifyDatabaseRecords(sdId);
    results.findings.database_consistency = dbCheck;

    if (!dbCheck.sd_exists) {
      console.log(`   ⚠️  SD ${sdId} not found in database`);
      results.warnings.push({
        severity: 'HIGH',
        issue: `SD ${sdId} not found in strategic_directives_v2 table`,
        recommendation: 'Ensure SD is created in database, not as markdown file'
      });
      if (results.confidence > 80) results.confidence = 80;
    } else {
      console.log('   ✅ SD exists in database');
    }

    // Generate summary
    const totalViolations =
      sdFiles.length +
      prdFiles.length +
      retroFiles.length +
      handoffFiles.length;

    if (totalViolations > 0) {
      results.recommendations.push(
        `Immediately convert ${totalViolations} file(s) to database records`,
        'Delete markdown files after database migration',
        'Use database-first scripts: create-strategic-directive.js, add-prd-to-database.js, etc.'
      );
    } else {
      results.recommendations.push(
        'Database-first architecture maintained correctly',
        'Continue using database operations for all documentation'
      );
    }

    console.log(`\n🏁 DOCMON Complete: ${results.verdict} (${results.confidence}% confidence)`);
    console.log(`   Total violations: ${totalViolations}`);

    return results;

  } catch (error) {
    console.error('\n❌ DOCMON error:', error.message);
    results.verdict = 'ERROR';
    results.error = error.message;
    results.confidence = 0;
    results.critical_issues.push({
      severity: 'CRITICAL',
      issue: 'DOCMON execution failed',
      recommendation: 'Review error and retry',
      error: error.message
    });
    return results;
  }
}

/**
 * Find files matching pattern
 * @param {string} dir - Root directory to search
 * @param {RegExp} pattern - File pattern to match
 * @param {Array<string>} excludeDirs - Directories to exclude
 */
async function findFiles(dir, pattern, excludeDirs = []) {
  const results = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      // Skip excluded directories
      if (excludeDirs.some(ex => fullPath.startsWith(ex))) {
        continue;
      }

      // Skip node_modules, .git, dist, etc.
      if (['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
        continue;
      }

      if (entry.isDirectory()) {
        // Recursive search
        const subResults = await findFiles(fullPath, pattern, excludeDirs);
        results.push(...subResults);
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch (error) {
    // Silently skip directories we can't read (permissions, etc.)
    if (error.code !== 'EACCES' && error.code !== 'EPERM') {
      console.error(`Warning: Could not scan ${dir}: ${error.message}`);
    }
  }

  return results;
}

/**
 * Verify database records exist for this SD
 */
async function verifyDatabaseRecords(sdId) {
  const checks = {
    sd_exists: false,
    prd_exists: false,
    handoffs_exist: false
  };

  // Check SD
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('id', sdId)
    .single();

  checks.sd_exists = !!sd && !sdError;

  if (checks.sd_exists) {
    // Check PRD
    const { data: prd, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('id')
      .eq('directive_id', sdId)
      .single();

    checks.prd_exists = !!prd && !prdError;

    // Check handoffs
    const { data: handoffs, error: handoffError } = await supabase
      .from('sd_phase_handoffs')
      .select('id')
      .eq('sd_id', sdId)
      .limit(1);

    checks.handoffs_exist = handoffs && handoffs.length > 0 && !handoffError;
  }

  return checks;
}
