/**
 * Migration Handler Module
 * DATABASE Sub-Agent - Migration Detection & Execution
 *
 * Extracted from lib/sub-agents/database.js (SD-LEO-REFAC-DB-SUB-003)
 *
 * Responsibilities:
 * - Detect action intent from context
 * - Find pending migration files
 * - Execute migrations via Supabase CLI
 */

import { readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import globPkg from 'glob';
import { exec } from 'child_process';
import { promisify } from 'util';

const { glob } = globPkg;
const execAsync = promisify(exec);

// Action trigger keywords for migration execution
export const ACTION_TRIGGERS = [
  'apply migration', 'run migration', 'execute migration',
  'apply supabase migration', 'push migration', 'migrate database',
  'apply the migration', 'run the migration', 'db push',
  'supabase db push', 'apply schema', 'run schema migration'
];

/**
 * Detect if the context contains action-oriented keywords
 * @param {string} context - The execution context or description
 * @returns {Object} Action detection result
 */
export function detectActionIntent(context) {
  if (!context || typeof context !== 'string') {
    return { isAction: false, matchedTrigger: null };
  }

  const lowerContext = context.toLowerCase();

  for (const trigger of ACTION_TRIGGERS) {
    if (lowerContext.includes(trigger)) {
      return { isAction: true, matchedTrigger: trigger };
    }
  }

  return { isAction: false, matchedTrigger: null };
}

/**
 * Find pending migration files that haven't been applied
 * @param {string} sdId - Strategic Directive ID (optional filter)
 * @param {string} migrationPath - Path pattern to search for migrations
 * @returns {Promise<Array>} List of pending migration files with metadata
 */
export async function findPendingMigrations(sdId = null, migrationPath = null) {
  console.log('   🔍 Searching for pending migration files...');

  const migrationPaths = migrationPath
    ? [migrationPath]
    : [
        'database/migrations/*.sql',
        'supabase/migrations/*.sql',
        'supabase/ehg_engineer/migrations/*.sql'
      ];

  const pendingMigrations = [];

  for (const pattern of migrationPaths) {
    try {
      const files = await glob(pattern);
      const fileArray = Array.isArray(files) ? files : Array.from(files);

      for (const file of fileArray) {
        try {
          const content = await readFile(file, 'utf-8');
          const fileName = path.basename(file);

          // Filter by SD ID if provided
          if (sdId && !content.includes(sdId) && !fileName.includes(sdId)) {
            continue;
          }

          // Extract timestamp from filename (common patterns: YYYYMMDD_ or timestamp_)
          const timestampMatch = fileName.match(/^(\d{8}|\d{14})_/);
          const timestamp = timestampMatch ? timestampMatch[1] : null;

          // Detect migration type
          const hasCreateTable = /CREATE TABLE/i.test(content);
          const hasAlterTable = /ALTER TABLE/i.test(content);
          const hasRLS = /CREATE POLICY|ROW LEVEL SECURITY/i.test(content);
          const hasInsert = /INSERT INTO/i.test(content);

          pendingMigrations.push({
            path: file,
            fileName,
            timestamp,
            size: content.length,
            types: {
              hasCreateTable,
              hasAlterTable,
              hasRLS,
              hasInsert
            },
            preview: content.substring(0, 200).replace(/\n/g, ' ').trim() + '...'
          });
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // Pattern not found, skip
    }
  }

  console.log(`      Found ${pendingMigrations.length} migration file(s)`);
  return pendingMigrations;
}

/**
 * Execute SQL via Supabase CLI (exposed version for migrations)
 * @param {string} sqlContent - SQL content to execute
 * @param {string} description - Description of the operation
 * @returns {Promise<Object>} Execution result
 */
export async function executeViaSupabaseCLI(sqlContent, description = 'SQL migration') {
  console.log(`   🚀 Executing via Supabase CLI: ${description}...`);

  const result = {
    success: false,
    output: null,
    error: null
  };

  try {
    // Check if Supabase CLI is available
    try {
      await execAsync('supabase --version');
    } catch {
      result.error = 'Supabase CLI not installed. Install with: npm install -g supabase';
      console.log('      ❌ Supabase CLI not available');
      return result;
    }

    // Write SQL to temp file for safer execution
    const tempFile = path.join(process.cwd(), '.temp', `migration_${Date.now()}.sql`);
    const tempDir = path.dirname(tempFile);

    // Ensure temp directory exists
    if (!existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true });
    }

    await writeFile(tempFile, sqlContent, 'utf-8');

    try {
      // Execute via Supabase CLI
      const { stdout, stderr } = await execAsync('supabase db push --include-all', {
        timeout: 120000 // 2 minute timeout
      });

      result.success = true;
      result.output = stdout;

      if (stderr && !stderr.includes('warning')) {
        console.log(`      ⚠️  Notices: ${stderr}`);
      }

      console.log('      ✅ Migration executed successfully');
    } finally {
      // Cleanup temp file
      try {
        await unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    result.error = error.message;
    console.error(`      ❌ Migration failed: ${error.message}`);

    if (error.message.includes('not linked')) {
      console.log(`      💡 Run: supabase link --project-ref ${process.env.SUPABASE_PROJECT_REF || '[your-project-ref]'}`);
    }
  }

  return result;
}

/**
 * Internal version of executeViaSupabaseCLI for specific SQL statements
 * @param {string} sqlStatement - SQL statement to execute
 * @param {string} description - Description of the operation
 * @returns {Promise<Object>} Execution result
 */
export async function executeViaSupabaseCLIInternal(sqlStatement, description = 'SQL operation') {
  console.log(`   🚀 Executing via Supabase CLI: ${description}...`);

  const result = {
    success: false,
    output: null,
    error: null
  };

  try {
    // Check if Supabase CLI is available and linked
    const { stdout: _linkStatus } = await execAsync('supabase status');
    console.log('      ✅ Supabase project linked');

    // Execute SQL via CLI (bypasses RLS with service role)
    const { stdout, stderr } = await execAsync(
      `supabase db execute --sql "${sqlStatement.replace(/"/g, '\\"')}"`
    );

    result.success = true;
    result.output = stdout;

    if (stderr) {
      console.log(`      ⚠️  Warnings: ${stderr}`);
    }

    console.log('      ✅ Execution successful');

  } catch (error) {
    result.error = error.message;
    console.error(`      ❌ Execution failed: ${error.message}`);

    if (error.message.includes('not linked')) {
      console.log(`      💡 Run: supabase link --project-ref ${process.env.SUPABASE_PROJECT_REF || '[your-project-ref]'}`);
    }
  }

  return result;
}

/**
 * Execute migration files via Supabase CLI (with confirmation display)
 * @param {Array} migrationFiles - Array of migration file objects
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Execution result
 */
export async function executeMigrations(migrationFiles, options = {}) {
  console.log('\n🚀 Migration Execution Requested');
  console.log('═'.repeat(50));

  const result = {
    executed: false,
    files_processed: [],
    errors: [],
    requires_confirmation: true,
    confirmation_display: null
  };

  if (migrationFiles.length === 0) {
    console.log('   ℹ️  No migration files to execute');
    result.requires_confirmation = false;
    return result;
  }

  // Build confirmation display
  console.log('\n📋 MIGRATIONS TO APPLY:');
  console.log('─'.repeat(50));

  for (const migration of migrationFiles) {
    console.log(`\n   📄 ${migration.fileName}`);
    console.log(`      Path: ${migration.path}`);
    console.log(`      Size: ${migration.size} bytes`);
    console.log('      Contains:');
    if (migration.types.hasCreateTable) console.log('         • CREATE TABLE statements');
    if (migration.types.hasAlterTable) console.log('         • ALTER TABLE statements');
    if (migration.types.hasRLS) console.log('         • RLS/Policy definitions');
    if (migration.types.hasInsert) console.log('         • INSERT statements (seed data)');
    console.log(`      Preview: ${migration.preview}`);
  }

  console.log('\n' + '─'.repeat(50));

  result.confirmation_display = {
    file_count: migrationFiles.length,
    files: migrationFiles.map(m => ({
      name: m.fileName,
      path: m.path,
      types: m.types
    })),
    command_preview: 'supabase db push  # OR manual SQL execution'
  };

  // If auto-execute is enabled (dangerous), proceed without confirmation
  if (options.auto_execute) {
    console.log('\n⚠️  AUTO-EXECUTE ENABLED - Proceeding without confirmation');

    for (const migration of migrationFiles) {
      try {
        const content = await readFile(migration.path, 'utf-8');
        const execResult = await executeViaSupabaseCLI(content, `Migration: ${migration.fileName}`);

        if (execResult.success) {
          result.files_processed.push({
            file: migration.fileName,
            status: 'SUCCESS',
            output: execResult.output
          });
        } else {
          result.errors.push({
            file: migration.fileName,
            error: execResult.error
          });
        }
      } catch (error) {
        result.errors.push({
          file: migration.fileName,
          error: error.message
        });
      }
    }

    result.executed = result.errors.length === 0;
  } else {
    // Standard flow: require confirmation
    console.log('\n🔐 CONFIRMATION REQUIRED');
    console.log('   To apply these migrations, run one of:');
    console.log('   1. supabase db push');
    console.log('   2. node scripts/run-migration.js --file <path>');
    console.log('   3. Use this sub-agent with --confirm-apply flag');
    console.log('\n   ⚠️  Review the migrations above before confirming!');
  }

  return result;
}
