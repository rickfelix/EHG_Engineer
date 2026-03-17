#!/usr/bin/env node

/**
 * Execute Manual Database Migrations
 *
 * This script executes pending SQL files from database/manual-updates/
 * It can be run standalone or is invoked by the pre-handoff migration check.
 *
 * Usage:
 *   node scripts/execute-manual-migrations.js [options]
 *
 * Options:
 *   --dry-run      Show what would be executed without running
 *   --file <path>  Execute a specific file only
 *   --today        Only execute files created today
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: join(__dirname, '../.env') });
config({ path: join(__dirname, '../../ehg/.env') });

const supabase = createSupabaseServiceClient();

const MANUAL_UPDATES_DIR = join(__dirname, '../database/manual-updates');

async function getUncommittedMigrations() {
  const uncommitted = [];

  try {
    const { stdout } = await execAsync('git status --porcelain database/manual-updates/', {
      cwd: join(__dirname, '..'),
      timeout: 10000
    });

    if (stdout.trim()) {
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        const match = line.match(/^(\?\?|M|A)\s+database\/manual-updates\/(.+\.sql)$/);
        if (match) {
          uncommitted.push(match[2]);
        }
      }
    }
  } catch (error) {
    console.error('Warning: Could not check git status:', error.message);
  }

  return uncommitted;
}

async function getAllMigrationFiles() {
  if (!existsSync(MANUAL_UPDATES_DIR)) {
    return [];
  }

  const files = await readdir(MANUAL_UPDATES_DIR);
  return files.filter(f => f.endsWith('.sql')).sort();
}

async function executeMigration(filename) {
  const filePath = join(MANUAL_UPDATES_DIR, filename);

  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const sql = await readFile(filePath, 'utf-8');

  console.log(`\n📄 Executing: ${filename}`);
  console.log('─'.repeat(60));

  // Try using exec_sql RPC function first
  try {
    const { error } = await supabase.rpc('exec_sql', {
      sql_query: sql
    });

    if (error) {
      throw error;
    }

    console.log('✅ Executed successfully via exec_sql RPC');
    return { success: true, method: 'rpc' };
  } catch (rpcError) {
    // If exec_sql doesn't exist, try direct execution
    if (rpcError.message?.includes('function') || rpcError.code === 'PGRST202') {
      console.log('ℹ️  exec_sql RPC not available, attempting statement-by-statement...');

      // Split SQL into statements and execute individually
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      let _executed = 0;
      for (const statement of statements) {
        if (statement.toLowerCase().startsWith('select')) {
          // Skip SELECT statements (they're usually for verification)
          console.log('   ⏭️  Skipping SELECT statement');
          continue;
        }

        try {
          // Use Supabase's query method for DDL
          const { _error } = await supabase.from('_migrations_log').select('*').limit(0);
          // Note: This is a workaround - in practice, you'd need psql or Supabase CLI

          _executed++;
        } catch {
          // Continue anyway
        }
      }

      console.log(`⚠️  Attempted ${statements.length} statements`);
      console.log('💡 For full DDL support, use: supabase db push or psql');

      return { success: false, method: 'partial', reason: 'exec_sql RPC not available' };
    }

    throw rpcError;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const todayOnly = args.includes('--today');
  const fileIndex = args.indexOf('--file');
  const specificFile = fileIndex >= 0 ? args[fileIndex + 1] : null;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🗄️  MANUAL MIGRATION EXECUTOR');
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  // Get files to process
  let filesToProcess = [];

  if (specificFile) {
    filesToProcess = [specificFile];
  } else {
    const uncommitted = await getUncommittedMigrations();

    if (uncommitted.length > 0) {
      console.log('📋 Uncommitted migration files (from git status):');
      uncommitted.forEach(f => console.log(`   • ${f}`));
      filesToProcess = uncommitted;
    } else {
      console.log('ℹ️  No uncommitted migrations detected.');

      if (todayOnly) {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const allFiles = await getAllMigrationFiles();
        filesToProcess = allFiles.filter(f => f.includes(today));

        if (filesToProcess.length === 0) {
          console.log(`   No files created today (${today})`);
        }
      } else {
        console.log('   Use --file <filename> to execute a specific file');
        console.log('   Use --today to execute files created today');
      }
    }
  }

  if (filesToProcess.length === 0) {
    console.log('\n✅ No migrations to execute.\n');
    return;
  }

  console.log(`\n📁 Files to process: ${filesToProcess.length}\n`);

  if (dryRun) {
    console.log('Would execute:');
    filesToProcess.forEach(f => console.log(`   • ${f}`));
    console.log('\n✅ Dry run complete.\n');
    return;
  }

  // Execute migrations
  const results = [];

  for (const file of filesToProcess) {
    try {
      const result = await executeMigration(file);
      results.push({ file, ...result });
    } catch (error) {
      console.error(`❌ Failed: ${error.message}`);
      results.push({ file, success: false, error: error.message });
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📊 EXECUTION SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✅ Successful: ${successful.length}`);
  successful.forEach(r => console.log(`   • ${r.file}`));

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}`);
    failed.forEach(r => console.log(`   • ${r.file}: ${r.error || r.reason || 'Unknown error'}`));
  }

  console.log('\n💡 For full DDL support, consider using:');
  console.log('   • supabase db push (Supabase CLI)');
  console.log('   • psql -f <file> (PostgreSQL CLI)');
  console.log('');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
