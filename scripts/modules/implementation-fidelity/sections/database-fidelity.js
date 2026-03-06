/**
 * Section B: Database Implementation Fidelity (35 points)
 * Part of SD-LEO-REFACTOR-IMPL-FIDELITY-001
 *
 * Phase-aware weighting: Migration execution is CRITICAL (20 pts)
 */

import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { getSDSearchTerms, gitLogForSD, detectImplementationRepos } from '../utils/index.js';
import { getSectionEnforcement } from '../sd-type-section-policy.js';

/**
 * Validate Database Implementation Fidelity
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} databaseAnalysis - Database analysis from PRD metadata
 * @param {Object} validation - Validation object to populate
 * @param {Object} supabase - Supabase client
 */
export async function validateDatabaseFidelity(sd_id, databaseAnalysis, validation, supabase) {
  const exemptSections = validation.details.gate2_exempt_sections || [];
  const isB1Exempt = exemptSections.includes('B1_migrations');
  const isB2Exempt = exemptSections.includes('B2_rls');
  const isB3Exempt = exemptSections.includes('B3_complexity');

  if (isB1Exempt && isB2Exempt && isB3Exempt) {
    validation.score += 35;
    validation.gate_scores.database_fidelity = 35;
    validation.details.database_fidelity = {
      exempt: true,
      reason: 'All Section B checks exempt for this SD type'
    };
    console.log('   ✅ Section B fully exempt for this SD type (35/35)');
    return;
  }

  // Centralized SD-type section enforcement policy (fallback after DB exemptions)
  const sdType = validation.details.sd_type || '';
  const enforcement = getSectionEnforcement(sdType, 'B');
  if (enforcement === 'SKIP') {
    validation.score += 35;
    validation.gate_scores.database_fidelity = 35;
    validation.details.database_fidelity = {
      skipped: true,
      reason: `Section B skipped for ${sdType} SD (policy: SKIP)`
    };
    console.log(`   ✅ Section B skipped for ${sdType} SD - full credit (35/35)`);
    return;
  }
  const isAdvisory = enforcement === 'ADVISORY';
  const issueCountBefore = validation.issues.length;

  if (!databaseAnalysis) {
    validation.warnings.push('[B] No DATABASE analysis found - skipping database fidelity check');
    validation.score += 18;
    validation.gate_scores.database_fidelity = 18;
    console.log('   ⚠️  No DATABASE analysis - partial credit (18/35)');
    return;
  }

  let sectionScore = 0;
  const sectionDetails = {};
  sectionDetails.exemptions = { B1: isB1Exempt, B2: isB2Exempt, B3: isB3Exempt };

  // B1: Check for migration files AND execution (25 points)
  console.log('\n   [B1] Schema Change Migrations (Creation + Execution)...');

  if (isB1Exempt) {
    sectionScore += 25;
    sectionDetails.B1_exempt = true;
    console.log('   ✅ B1 exempt for this SD type - full credit (25/25)');
  } else {
    try {
      const implementationRepos = await detectImplementationRepos(sd_id, supabase);
      console.log(`   📂 Searching for migrations in: ${implementationRepos.join(', ')}`);

      const migrationDirs = ['database/migrations', 'supabase/migrations', 'migrations'];
      let migrationFiles = [];
      let primaryMigrationRepo = null;
      // Search by both UUID and sd_key for migration file matching
      const searchTerms = await getSDSearchTerms(sd_id, supabase);
      const searchLower = searchTerms.map(t => t.replace('SD-', '').toLowerCase());

      for (const repo of implementationRepos) {
        for (const dir of migrationDirs) {
          const fullPath = path.join(repo, dir);
          if (existsSync(fullPath)) {
            const files = await readdir(fullPath);
            const sdMigrations = files.filter(f => {
              const fileLower = f.toLowerCase();
              return searchLower.some(term => fileLower.includes(term));
            });
            if (sdMigrations.length > 0 && !primaryMigrationRepo) {
              primaryMigrationRepo = repo;
            }
            migrationFiles.push(...sdMigrations.map(f => ({ dir, file: f })));
          }
        }
      }

      if (migrationFiles.length > 0) {
        sectionScore += 5;
        sectionDetails.migration_files = migrationFiles.map(m => `${m.dir}/${m.file}`);
        sectionDetails.migration_count = migrationFiles.length;
        sectionDetails.implementation_repo = primaryMigrationRepo || implementationRepos[0];
        console.log(`   ✅ Found ${migrationFiles.length} migration file(s) (5/25)`);

        // B1.2: Verify migrations were executed (20 points - CRITICAL)
        console.log('   [B1.2] Verifying migration execution...');
        const execScore = await verifyMigrationExecution(migrationFiles, searchLower[0], sectionDetails, validation, supabase);
        sectionScore += execScore;
      } else {
        validation.warnings.push('[B1] No migration files found for this SD');
        sectionScore += 13;
        sectionDetails.migration_execution_verified = null;
        console.log('   ⚠️  No migration files found - partial credit if N/A (13/25)');
      }
    } catch (error) {
      validation.warnings.push(`[B1] Migration check failed: ${error.message}`);
      sectionScore += 0;
      console.log('   ❌ Cannot verify migrations - error (0/25)');
    }
  }

  // B2: Check for RLS policies (5 points)
  console.log('\n   [B2] RLS Policies...');

  if (isB2Exempt) {
    sectionScore += 5;
    sectionDetails.B2_exempt = true;
    console.log('   ✅ B2 exempt for this SD type - full credit (5/5)');
  } else {
    try {
      const searchTerms = await getSDSearchTerms(sd_id, supabase);
      const implementationRepos = await detectImplementationRepos(sd_id, supabase);
      let gitDiff = '';
      for (const repo of implementationRepos) {
        try {
          gitDiff += await gitLogForSD(
            `git -C "${repo}" log --all --grep="\${TERM}" --pretty=format:"" --patch`,
            searchTerms,
            { timeout: 15000 }
          );
        } catch (_) { /* skip repos without matching commits */ }
      }

      const hasRLS = gitDiff.includes('CREATE POLICY') ||
                     gitDiff.includes('ALTER POLICY') ||
                     gitDiff.toLowerCase().includes('rls');

      if (hasRLS) {
        sectionScore += 5;
        sectionDetails.rls_policies_found = true;
        console.log('   ✅ RLS policies found in migrations');
      } else {
        validation.warnings.push('[B2] No RLS policies detected');
        sectionScore += 3;
        console.log('   ⚠️  No RLS policies detected (3/5)');
      }
    } catch (_error) {
      sectionScore += 3;
      console.log('   ⚠️  Cannot verify RLS policies (3/5)');
    }
  }

  // B3: Migration complexity check (5 points)
  console.log('\n   [B3] Migration Complexity Alignment...');

  if (isB3Exempt) {
    sectionScore += 5;
    sectionDetails.B3_exempt = true;
    console.log('   ✅ B3 exempt for this SD type - full credit (5/5)');
  } else if (sectionDetails.migration_files && sectionDetails.migration_files.length > 0) {
    try {
      const firstMigration = sectionDetails.migration_files[0];
      const repoPath = sectionDetails.implementation_repo || process.cwd();
      const fullPath = path.join(repoPath, firstMigration);
      const content = await readFile(fullPath, 'utf-8');
      const lineCount = content.split('\n').length;

      sectionDetails.migration_line_count = lineCount;
      sectionScore += 5;
      console.log(`   ✅ Migration file has ${lineCount} lines`);
    } catch (_error) {
      sectionScore += 3;
      console.log('   ⚠️  Cannot read migration file (3/5)');
    }
  } else {
    sectionScore += 3;
    console.log('   ⚠️  No migration to check complexity (3/5)');
  }

  // ADVISORY mode: convert issues to warnings, award full credit
  if (isAdvisory) {
    const newIssues = validation.issues.splice(issueCountBefore);
    validation.warnings.push(...newIssues.map(i => `[ADVISORY] ${i}`));
    sectionScore = 35;
    console.log(`   ℹ️  Section B in ADVISORY mode for ${sdType} SD - full credit (35/35)`);
  }

  validation.score += sectionScore;
  validation.gate_scores.database_fidelity = sectionScore;
  validation.details.database_fidelity = sectionDetails;
  console.log(`\n   Section B Score: ${sectionScore}/35`);
}

/**
 * Extract table names from CREATE TABLE statements in migration files.
 * @param {Array} migrationFiles - Array of {dir, file} migration objects
 * @param {string} repoPath - Repository root path
 * @returns {string[]} Table names found in migrations
 */
async function extractTableNamesFromMigrations(migrationFiles, repoPath) {
  const tableNames = [];
  for (const m of migrationFiles) {
    try {
      const fullPath = path.join(repoPath, m.dir, m.file);
      const content = await readFile(fullPath, 'utf-8');
      const matches = content.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/gi);
      for (const match of matches) {
        tableNames.push(match[1].toLowerCase());
      }
    } catch (_) { /* skip unreadable files */ }
  }
  return [...new Set(tableNames)];
}

/**
 * Verify tables exist in the live database via information_schema.
 * Used as fallback when schema_migrations is empty/missing.
 * @param {string[]} tableNames - Expected table names
 * @param {Object} supabase - Supabase client
 * @returns {{found: string[], missing: string[]}}
 */
async function verifyTablesExist(tableNames, supabase) {
  const found = [];
  const missing = [];
  for (const table of tableNames) {
    const { data, error } = await supabase.rpc('execute_sql', {
      query: `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${table}') AS exists`
    }).single();

    if (error) {
      // Fallback: try direct query
      const { error: directError } = await supabase.from(table).select('*').limit(0);
      if (directError && directError.message.includes('Could not find')) {
        missing.push(table);
      } else {
        found.push(table);
      }
    } else if (data?.exists) {
      found.push(table);
    } else {
      missing.push(table);
    }
  }
  return { found, missing };
}

/**
 * Verify migration execution in schema_migrations table,
 * with fallback to table-existence verification.
 */
async function verifyMigrationExecution(migrationFiles, sdIdLower, sectionDetails, validation, supabase) {
  try {
    let executedMigrations = null;
    let migrationError = null;

    const { data: data1, error: error1 } = await supabase
      .from('schema_migrations')
      .select('version, name');

    if (error1 && error1.message.includes('column') && error1.message.includes('does not exist')) {
      const { data: data2, error: error2 } = await supabase
        .from('schema_migrations')
        .select('*');
      executedMigrations = data2;
      migrationError = error2;
    } else {
      executedMigrations = data1;
      migrationError = error1;
    }

    // Helper: attempt table-existence fallback verification
    const attemptTableExistenceFallback = async (reason) => {
      const repoPath = sectionDetails.implementation_repo || process.cwd();
      const tableNames = await extractTableNamesFromMigrations(migrationFiles, repoPath);
      if (tableNames.length === 0) {
        console.log(`   ⚠️  ${reason} and no CREATE TABLE statements found in migrations (13/20)`);
        sectionDetails.migration_execution_verified = null;
        sectionDetails.migration_execution_note = `${reason} - no tables to verify`;
        validation.warnings.push(`[B1.2] ${reason} - no CREATE TABLE statements found`);
        return 13;
      }
      console.log(`   🔍 Fallback: checking ${tableNames.length} table(s) in live DB: ${tableNames.join(', ')}`);
      const { found, missing } = await verifyTablesExist(tableNames, supabase);
      sectionDetails.fallback_table_check = { expected: tableNames, found, missing };
      if (missing.length === 0) {
        sectionDetails.migration_execution_verified = true;
        sectionDetails.migration_execution_note = 'Verified via table-existence fallback';
        console.log(`   ✅ All ${found.length} table(s) exist in live DB (20/20)`);
        return 20;
      } else if (found.length > 0) {
        sectionDetails.migration_execution_verified = false;
        validation.issues.push(`[B1.2] ${missing.length} table(s) from migrations NOT found in DB: ${missing.join(', ')}`);
        console.log(`   ❌ ${missing.length}/${tableNames.length} table(s) missing: ${missing.join(', ')} (0/20)`);
        return 0;
      } else {
        sectionDetails.migration_execution_verified = false;
        validation.issues.push(`[B1.2] CRITICAL: None of ${tableNames.length} migration table(s) exist in DB: ${missing.join(', ')}`);
        console.log(`   ❌ NONE of ${tableNames.length} table(s) found in DB (0/20)`);
        return 0;
      }
    };

    if (migrationError) {
      const tableNotExistsMsg = "Could not find the table 'public.schema_migrations'";
      const columnNotExistsMsg = 'column';

      if (migrationError.message.includes(tableNotExistsMsg)) {
        console.log('   ⚠️  schema_migrations table does not exist - falling back to table-existence check');
        return await attemptTableExistenceFallback('No schema_migrations table');
      } else if (migrationError.message.includes(columnNotExistsMsg)) {
        console.log('   ⚠️  schema_migrations has non-standard schema - falling back to table-existence check');
        return await attemptTableExistenceFallback('Non-standard schema_migrations schema');
      } else {
        console.log(`   ⚠️  Cannot query schema_migrations: ${migrationError.message} (0/20)`);
        sectionDetails.migration_execution_verified = false;
        sectionDetails.migration_execution_error = migrationError.message;
        validation.issues.push('[B1.2] Cannot verify migration execution - database query failed');
        return 0;
      }
    } else if (executedMigrations && executedMigrations.length > 0) {
      const migrationVersions = migrationFiles.map(m => {
        const filename = m.file;
        const versionMatch = filename.match(/^(\d{14}|\d{8}_\d{6})/);
        return versionMatch ? versionMatch[1].replace('_', '') : null;
      }).filter(Boolean);

      const executedVersions = executedMigrations.map(m => m.version || m.name);
      const ourExecutedMigrations = migrationVersions.filter(v =>
        executedVersions.some(ev => ev.includes(v) || v.includes(ev))
      );

      if (ourExecutedMigrations.length > 0) {
        sectionDetails.migration_execution_verified = true;
        sectionDetails.executed_migration_count = ourExecutedMigrations.length;
        console.log(`   ✅ Verified ${ourExecutedMigrations.length}/${migrationFiles.length} migration(s) executed (20/20)`);
        return 20;
      } else {
        validation.issues.push('[B1.2] CRITICAL: Migration files created but NOT EXECUTED in database');
        sectionDetails.migration_execution_verified = false;
        sectionDetails.executed_migration_count = 0;
        console.log('   ❌ Migration files exist but NOT EXECUTED (0/20)');
        console.log('   ⚠️  CRITICAL FAILURE: Run migrations before EXEC→PLAN handoff');
        return 0;
      }
    } else {
      // schema_migrations is empty — use table-existence fallback
      const hasSDSpecificMigrations = migrationFiles.some(m =>
        m.file.toLowerCase().includes(sdIdLower)
      );

      if (hasSDSpecificMigrations) {
        console.log('   ⚠️  schema_migrations empty but SD-specific migrations found - falling back to table-existence check');
        return await attemptTableExistenceFallback('schema_migrations empty');
      } else {
        sectionDetails.migration_execution_verified = null;
        sectionDetails.migration_execution_note = 'No SD-specific migrations to verify';
        validation.warnings.push('[B1.2] Migration history empty but no SD-specific migrations detected');
        console.log('   ⚠️  No SD-specific migrations to verify (13/20)');
        return 13;
      }
    }
  } catch (execCheckError) {
    validation.issues.push(`[B1.2] Migration execution check error: ${execCheckError.message}`);
    console.log(`   ❌ Error checking migration execution: ${execCheckError.message} (0/20)`);
    return 0;
  }
}
