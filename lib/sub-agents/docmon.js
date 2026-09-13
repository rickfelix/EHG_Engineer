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
 * Updated: 2025-11-15 (SD-LEO-PROTOCOL-V4-4-0: Adaptive validation support)
 */

import { readdir, stat } from 'fs/promises';
import path, { join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { runHardenedGit } from '../git/hardened-runner.cjs';
import dotenv from 'dotenv';
import {
  detectValidationMode,
  logValidationMode
} from '../utils/adaptive-validation.js';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';
import {
  getPendingDocumentationDeliverables
} from '../../scripts/modules/sd-type-documentation-templates.js';
// getRequiredFinalDocTypes available in ./sd-type-documentation-templates.js if needed

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Supabase client initialized in execute() to use async createSupabaseServiceClient
let supabase = null;

/**
 * QF-20260913-950: the checkout's git top-level (main repo or worktree), never the old
 * `path.resolve(__dirname, '../../..')` which landed one level above it -- the sibling-repo
 * folder, or the whole `.worktrees` forest for a worktree checkout -- causing a ~190k-dir walk.
 * @param {Object} [opts] @param {string} [opts.cwd] @returns {string}
 */
export function resolveDocmonRoot(opts = {}) {
  const cwd = opts.cwd || __dirname;
  try {
    const top = execSync('git rev-parse --show-toplevel', { encoding: 'utf8', cwd }).trim();
    if (top) return path.resolve(top);
  } catch {
    // fall through to legacy fallback
  }
  return path.resolve(__dirname, '../../..');
}

/**
 * Get SD creation timestamp from database
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Date|null>} SD creation date or null if not found
 */
async function getSDCreationDate(sdId) {
  try {
    const { data: sd, error } = await supabase
      .from('strategic_directives_v2')
      .select('created_at')
      .eq('id', sdId)
      .single();

    if (error || !sd) {
      console.warn(`   ⚠️  Could not fetch SD creation date: ${error?.message || 'SD not found'}`);
      return null;
    }

    return new Date(sd.created_at);
  } catch (error) {
    console.warn(`   ⚠️  Error fetching SD creation date: ${error.message}`);
    return null;
  }
}

/**
 * Check if a file was created after SD start date
 * @param {string} filePath - Path to file
 * @param {Date} sdCreationDate - SD creation date
 * @returns {boolean} True if file is newer than SD (created by this SD)
 */
async function isFileCreatedAfterSD(filePath, sdCreationDate, rootDir = resolveDocmonRoot()) {
  if (!sdCreationDate) {
    // If we can't get SD date, assume file is new (safe default = stricter)
    return true;
  }

  try {
    // Try git log first (most accurate for committed files). Argv form (no shell string, no
    // `${filePath}` interpolation) via the published hardened runner -- QF-20260913-950 CI
    // caught this line as a shell-injection sink the moment it was touched (S1, pre-existing).
    // `--format=%aI --follow` lists newest-first; the LAST line (oldest add-event) is the
    // file's true creation date, same as the original `| tail -1` shell pipe.
    const r = runHardenedGit(['log', '--diff-filter=A', '--format=%aI', '--follow', '--', filePath], { cwd: rootDir, result: true });
    const lines = (r.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const gitDate = lines[lines.length - 1];

    if (gitDate) {
      const fileCreationDate = new Date(gitDate);
      return fileCreationDate > sdCreationDate;
    }
  } catch {
    // Git command failed, fall back to filesystem stat
  }

  try {
    // Fallback: use filesystem birthtime
    const stats = await stat(filePath);
    const fileCreationDate = stats.birthtime || stats.mtime;
    return fileCreationDate > sdCreationDate;
  } catch (statError) {
    console.warn(`   ⚠️  Could not check file date for ${filePath}: ${statError.message}`);
    return true;  // Safe default: assume new
  }
}

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

  // Initialize Supabase client with SERVICE_ROLE_KEY (SD-FOUND-SAFETY-002 pattern)
  if (!supabase) {
    supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  }

  // SD-LEO-PROTOCOL-V4-4-0: Detect validation mode (prospective vs retrospective)
  const validationMode = await detectValidationMode(sdId, options);

  logValidationMode('DOCMON', validationMode, {
    'Prospective': 'BLOCKED if ANY markdown files found',
    'Retrospective': 'CONDITIONAL_PASS if only pre-existing files, BLOCKED if new files created by SD'
  });

  const results = {
    verdict: 'PASS',
    confidence: 100,
    validation_mode: validationMode,  // Add validation mode to results
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
    const rootDir = options.root_dir || resolveDocmonRoot();
    const walkStats = { dirsWalked: 0 };
    console.log(`   📂 Scan root: ${rootDir}`);

    // SD-LEO-PROTOCOL-V4-4-0: Get SD creation date for retrospective validation
    let sdCreationDate = null;
    if (validationMode === 'retrospective') {
      sdCreationDate = await getSDCreationDate(sdId);
      if (sdCreationDate) {
        console.log(`   📅 SD created: ${sdCreationDate.toISOString()}`);
        console.log('   🔍 Retrospective mode: Only flagging files created AFTER this date');
      }
    }

    // Phase 1: Scan for Strategic Directive markdown files
    // Exclude sub-agent output files like *-DESIGN-REVIEW.md, *-REVIEW.md
    console.log('\n📄 Phase 1: Checking for SD markdown files...');
    const rawSdFiles = await findFiles(rootDir, /^SD-.*\.md$/, [], walkStats);
    // Filter out sub-agent review outputs (not actual SD definitions)
    const allSdFiles = rawSdFiles.filter(f => {
      const filename = f.split('/').pop();
      // Exclude design reviews, code reviews, and other sub-agent outputs
      if (/-DESIGN-REVIEW\.md$/i.test(filename)) return false;
      if (/-REVIEW\.md$/i.test(filename)) return false;
      if (/-ANALYSIS\.md$/i.test(filename)) return false;
      return true;
    });

    // SD-LEO-PROTOCOL-V4-4-0: Filter files based on validation mode
    let sdFiles = allSdFiles;
    let preExistingSdFiles = [];
    if (validationMode === 'retrospective' && sdCreationDate) {
      // Split into new vs pre-existing
      const fileChecks = await Promise.all(
        allSdFiles.map(async (file) => ({
          file,
          isNew: await isFileCreatedAfterSD(file, sdCreationDate, rootDir)
        }))
      );
      sdFiles = fileChecks.filter(f => f.isNew).map(f => f.file);
      preExistingSdFiles = fileChecks.filter(f => !f.isNew).map(f => f.file);

      if (preExistingSdFiles.length > 0) {
        console.log(`   ℹ️  Ignoring ${preExistingSdFiles.length} pre-existing SD file(s) (retrospective mode)`);
      }
    }

    results.findings.sd_files = {
      count: sdFiles.length,
      files: sdFiles,
      pre_existing: preExistingSdFiles.length,
      pre_existing_files: preExistingSdFiles
    };

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
    const allPrdFiles = await findFiles(rootDir, /^PRD-.*\.md$/, [], walkStats);

    // SD-LEO-PROTOCOL-V4-4-0: Filter files based on validation mode
    let prdFiles = allPrdFiles;
    let preExistingPrdFiles = [];
    if (validationMode === 'retrospective' && sdCreationDate) {
      const fileChecks = await Promise.all(
        allPrdFiles.map(async (file) => ({
          file,
          isNew: await isFileCreatedAfterSD(file, sdCreationDate, rootDir)
        }))
      );
      prdFiles = fileChecks.filter(f => f.isNew).map(f => f.file);
      preExistingPrdFiles = fileChecks.filter(f => !f.isNew).map(f => f.file);

      if (preExistingPrdFiles.length > 0) {
        console.log(`   ℹ️  Ignoring ${preExistingPrdFiles.length} pre-existing PRD file(s) (retrospective mode)`);
      }
    }

    results.findings.prd_files = {
      count: prdFiles.length,
      files: prdFiles,
      pre_existing: preExistingPrdFiles.length,
      pre_existing_files: preExistingPrdFiles
    };

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
    const allRetroFiles = await findFiles(rootDir, /retrospective.*\.md$/i, [join(rootDir, 'retrospectives'), join(rootDir, 'docs', 'reference')], walkStats);

    // SD-LEO-PROTOCOL-V4-4-0: Filter files based on validation mode
    let retroFiles = allRetroFiles;
    let preExistingRetroFiles = [];
    if (validationMode === 'retrospective' && sdCreationDate) {
      const fileChecks = await Promise.all(
        allRetroFiles.map(async (file) => ({
          file,
          isNew: await isFileCreatedAfterSD(file, sdCreationDate, rootDir)
        }))
      );
      retroFiles = fileChecks.filter(f => f.isNew).map(f => f.file);
      preExistingRetroFiles = fileChecks.filter(f => !f.isNew).map(f => f.file);

      if (preExistingRetroFiles.length > 0) {
        console.log(`   ℹ️  Ignoring ${preExistingRetroFiles.length} pre-existing retro file(s) (retrospective mode)`);
      }
    }

    results.findings.retro_files = {
      count: retroFiles.length,
      files: retroFiles,
      pre_existing: preExistingRetroFiles.length,
      pre_existing_files: preExistingRetroFiles
    };

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
    // Exclude docs/reference (allowed) and docs/vision/specs (architectural specs, not LEO handoffs)
    console.log('\n🔄 Phase 4: Checking for handoff markdown files...');
    const allHandoffFiles = await findFiles(rootDir, /handoff.*\.md$/i, [
      join(rootDir, 'docs', 'reference'),
      join(rootDir, 'docs', 'vision', 'specs')  // Vision V2 architectural specs, not LEO handoff records
    ], walkStats);

    // SD-LEO-PROTOCOL-V4-4-0: Filter files based on validation mode
    let handoffFiles = allHandoffFiles;
    let preExistingHandoffFiles = [];
    if (validationMode === 'retrospective' && sdCreationDate) {
      const fileChecks = await Promise.all(
        allHandoffFiles.map(async (file) => ({
          file,
          isNew: await isFileCreatedAfterSD(file, sdCreationDate, rootDir)
        }))
      );
      handoffFiles = fileChecks.filter(f => f.isNew).map(f => f.file);
      preExistingHandoffFiles = fileChecks.filter(f => !f.isNew).map(f => f.file);

      if (preExistingHandoffFiles.length > 0) {
        console.log(`   ℹ️  Ignoring ${preExistingHandoffFiles.length} pre-existing handoff file(s) (retrospective mode)`);
      }
    }

    results.findings.handoff_files = {
      count: handoffFiles.length,
      files: handoffFiles,
      pre_existing: preExistingHandoffFiles.length,
      pre_existing_files: preExistingHandoffFiles
    };

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

    // Phase 6: Check documentation deliverables status
    console.log('\n📝 Phase 6: Checking documentation deliverables...');
    const pendingDocs = await getPendingDocumentationDeliverables(supabase, sdId);
    results.findings.documentation_deliverables = {
      pending_count: pendingDocs.length,
      pending_docs: pendingDocs.map(d => ({
        name: d.deliverable_name,
        priority: d.priority,
        doc_type: d.metadata?.doc_type
      }))
    };

    if (pendingDocs.length > 0) {
      const requiredPending = pendingDocs.filter(d => d.priority === 'required');
      if (requiredPending.length > 0) {
        console.log(`   ⚠️  ${requiredPending.length} REQUIRED documentation deliverable(s) pending`);
        for (const doc of requiredPending) {
          console.log(`      - ${doc.metadata?.doc_type || 'unknown'}: ${doc.deliverable_name}`);
        }
        results.warnings.push({
          severity: 'MEDIUM',
          issue: `${requiredPending.length} required documentation deliverable(s) not yet completed`,
          recommendation: 'Generate documentation before SD completion',
          pending_docs: requiredPending.map(d => d.metadata?.doc_type)
        });
      } else {
        console.log(`   ℹ️  ${pendingDocs.length} optional documentation deliverable(s) pending`);
      }
    } else {
      console.log('   ✅ All documentation deliverables completed (or none required)');
    }

    // Generate summary
    const totalViolations =
      sdFiles.length +
      prdFiles.length +
      retroFiles.length +
      handoffFiles.length;

    // SD-LEO-PROTOCOL-V4-4-0: Adaptive verdict logic
    if (totalViolations > 0) {
      // New violations found - BLOCKED
      results.recommendations.push(
        `Immediately convert ${totalViolations} file(s) to database records`,
        'Delete markdown files after database migration',
        'Use database-first scripts: create-strategic-directive.js, add-prd-to-database.js, etc.'
      );
    } else if (validationMode === 'retrospective') {
      // Retrospective mode: Check if we ignored any pre-existing files
      const totalPreExisting =
        (results.findings.sd_files?.pre_existing || 0) +
        (results.findings.prd_files?.pre_existing || 0) +
        (results.findings.retro_files?.pre_existing || 0) +
        (results.findings.handoff_files?.pre_existing || 0);

      if (totalPreExisting > 0) {
        // Pre-existing files exist, but no new violations - CONDITIONAL_PASS
        results.verdict = 'CONDITIONAL_PASS';
        results.confidence = 80;
        results.justification = `Database-first architecture maintained during SD execution. ${totalPreExisting} pre-existing markdown file(s) found but were created before this SD (${sdCreationDate?.toISOString().split('T')[0] || 'unknown date'}). No new violations introduced by current work.`;
        results.conditions = [
          `${totalPreExisting} pre-existing markdown files should be migrated to database in future cleanup SD`,
          'Continue enforcing database-first for all new work'
        ];
        results.recommendations.push(
          `Retrospective validation: Ignored ${totalPreExisting} pre-existing file(s)`,
          'No new markdown files created by this SD - database-first maintained',
          'Consider cleanup SD to migrate legacy markdown files'
        );
      } else {
        // No files at all - PASS
        results.recommendations.push(
          'Database-first architecture maintained correctly',
          'Continue using database operations for all documentation'
        );
      }
    } else {
      // Prospective mode with no violations - PASS
      results.recommendations.push(
        'Database-first architecture maintained correctly',
        'Continue using database operations for all documentation'
      );
    }

    console.log(`\n🏁 DOCMON Complete: ${results.verdict} (${results.confidence}% confidence)`);
    console.log(`   Scan root: ${rootDir} | Directories walked: ${walkStats.dirsWalked}`);
    console.log(`   Total violations: ${totalViolations}`);
    if (validationMode === 'retrospective') {
      const totalPreExisting =
        (results.findings.sd_files?.pre_existing || 0) +
        (results.findings.prd_files?.pre_existing || 0) +
        (results.findings.retro_files?.pre_existing || 0) +
        (results.findings.handoff_files?.pre_existing || 0);
      console.log(`   Pre-existing files (ignored): ${totalPreExisting}`);
    }

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

// QF-20260913-950: added .worktrees/.artifacts/.logs/_archive/coverage/tmp -- none hold real markdown.
const DOCMON_PRUNE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '.worktrees', '.artifacts', '.logs', '_archive', 'coverage', 'tmp'];

/**
 * Find files matching pattern
 * @param {string} dir - Root directory to search
 * @param {RegExp} pattern - File pattern to match
 * @param {Array<string>} excludeDirs - Directories to exclude
 * @param {{dirsWalked: number}} [stats] - shared counter incremented once per directory visited (QF-20260913-950)
 */
export async function findFiles(dir, pattern, excludeDirs = [], stats = { dirsWalked: 0 }) {
  const results = [];
  stats.dirsWalked++;

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      // Skip excluded directories
      if (excludeDirs.some(ex => fullPath.startsWith(ex))) {
        continue;
      }

      // Match by NAME only -- a full-path substring check against `.worktrees` false-positives
      // on every worktree checkout (its own path is nested inside a literal `.worktrees` dir),
      // pruning the whole tree at the first level. Live-caught during this fix (walked=4).
      if (DOCMON_PRUNE_DIRS.includes(entry.name)) {
        continue;
      }

      if (entry.isDirectory()) {
        // Recursive search
        const subResults = await findFiles(fullPath, pattern, excludeDirs, stats);
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
