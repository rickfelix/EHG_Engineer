#!/usr/bin/env node

/**
 * Setup Codex Handoffs Database Tables
 * Creates the necessary tables for OpenAI Codex integration
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import dotenv from 'dotenv';
dotenv.config();

class CodexHandoffSetup {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }

  /**
   * Check if tables already exist
   */
  async checkExistingTables() {
    try {
      // Try to query the codex_handoffs table
      const { data: _data, error } = await this.supabase
        .from('codex_handoffs')
        .select('id')
        .limit(1);

      if (!error) {
        return true; // Table exists
      }

      // If error contains "relation does not exist", table doesn't exist
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        return false;
      }

      // Some other error occurred
      throw error;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Execute migration SQL
   */
  async executeMigration() {
    console.log(chalk.cyan('🔧 Setting up Codex Handoffs Database Tables'));
    console.log(chalk.gray('─'.repeat(60)));

    try {
      // Check if tables already exist
      const exists = await this.checkExistingTables();
      if (exists) {
        console.log(chalk.yellow('⚠️  Tables already exist. Checking for updates...'));

        // Check if columns exist on product_requirements_v2
        const { data: _data, error } = await this.supabase
          .from('product_requirements_v2')
          .select('codex_status')
          .limit(1);

        if (!error) {
          console.log(chalk.green('✅ All tables and columns already configured'));
          return { success: true, message: 'Already configured' };
        }
      }

      // Read migration file
      const migrationPath = path.join(process.cwd(), 'database/migrations/014_codex_handoffs.sql');
      if (!fs.existsSync(migrationPath)) {
        throw new Error('Migration file not found: database/migrations/014_codex_handoffs.sql');
      }

      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

      // Note: Supabase client doesn't support raw SQL execution directly
      // You'll need to run this via the Supabase dashboard or psql
      console.log(chalk.yellow('\n📋 Migration SQL has been prepared'));
      console.log(chalk.yellow('Please execute the following in one of these ways:\n'));

      console.log(chalk.cyan('Option 1: Supabase Dashboard'));
      console.log('  1. Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
      console.log('  2. Paste the migration SQL');
      console.log('  3. Click "Run"\n');

      console.log(chalk.cyan('Option 2: Using psql (if DATABASE_URL is set)'));
      console.log('  Run: psql $DATABASE_URL -f database/migrations/014_codex_handoffs.sql\n');

      console.log(chalk.cyan('Option 3: Copy to clipboard and paste in SQL editor'));
      console.log('  The migration has been saved to: /tmp/codex-migration.sql');

      // Save to temp file for easy access
      fs.writeFileSync('/tmp/codex-migration.sql', migrationSQL);

      // Show a preview of the migration
      console.log(chalk.gray('\n--- Migration Preview (first 20 lines) ---'));
      const lines = migrationSQL.split('\n').slice(0, 20);
      lines.forEach(line => console.log(chalk.gray(line)));
      console.log(chalk.gray('... (see full file for complete migration)'));

      return { success: false, message: 'Manual execution required' };

    } catch (error) {
      console.error(chalk.red('❌ Setup failed:'), error.message);
      throw error;
    }
  }

  /**
   * Verify setup was successful
   */
  async verifySetup() {
    console.log(chalk.cyan('\n🔍 Verifying Codex Handoff Setup'));
    console.log(chalk.gray('─'.repeat(60)));

    const checks = [];

    // Check codex_handoffs table
    try {
      const { data: _data, error } = await this.supabase
        .from('codex_handoffs')
        .select('id')
        .limit(1);

      if (!error) {
        checks.push({ name: 'codex_handoffs table', status: '✅' });
      } else {
        checks.push({ name: 'codex_handoffs table', status: '❌', error: error.message });
      }
    } catch (error) {
      checks.push({ name: 'codex_handoffs table', status: '❌', error: error.message });
    }

    // Check product_requirements_v2 columns
    try {
      const { data: _data2, error } = await this.supabase
        .from('product_requirements_v2')
        .select('id, codex_status, codex_handoff_id')
        .limit(1);

      if (!error) {
        checks.push({ name: 'PRD codex columns', status: '✅' });
      } else {
        checks.push({ name: 'PRD codex columns', status: '❌', error: error.message });
      }
    } catch (error) {
      checks.push({ name: 'PRD codex columns', status: '❌', error: error.message });
    }

    // Check view
    try {
      const { data: _data3, error } = await this.supabase
        .from('active_codex_handoffs')
        .select('handoff_id')
        .limit(1);

      if (!error) {
        checks.push({ name: 'active_codex_handoffs view', status: '✅' });
      } else {
        checks.push({ name: 'active_codex_handoffs view', status: '❌', error: error.message });
      }
    } catch (error) {
      checks.push({ name: 'active_codex_handoffs view', status: '❌', error: error.message });
    }

    // Display results
    console.log(chalk.yellow('\nVerification Results:'));
    checks.forEach(check => {
      console.log(`  ${check.status} ${check.name}`);
      if (check.error) {
        console.log(chalk.gray(`     Error: ${check.error}`));
      }
    });

    const allPassed = checks.every(c => c.status === '✅');

    if (allPassed) {
      console.log(chalk.green('\n✅ All checks passed! Codex integration is ready.'));
      console.log(chalk.gray('\nNext steps:'));
      console.log(chalk.gray('  1. Run: node scripts/generate-codex-prompt.js <PRD-ID>'));
      console.log(chalk.gray('  2. Copy prompt to OpenAI Codex'));
      console.log(chalk.gray('  3. Run: node scripts/process-codex-artifacts.js <PRD-ID>'));
    } else {
      console.log(chalk.yellow('\n⚠️  Some checks failed. Please run the migration first.'));
    }

    return allPassed;
  }

  /**
   * Create sample PRD for testing
   */
  async createSamplePRD() {
    const prdId = `PRD-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;

    const samplePRD = {
      id: prdId,
      directive_id: 'SD-2025-001', // Assuming this exists
      title: 'Sample PRD for Codex Testing',
      version: '1.0',
      status: 'planning',
      category: 'feature',
      priority: 'medium',
      executive_summary: 'Test PRD for OpenAI Codex integration',
      functional_requirements: [
        { id: 'FR-1', description: 'Add error handling to authentication module' },
        { id: 'FR-2', description: 'Implement retry logic for API calls' }
      ],
      technical_requirements: [
        { id: 'TR-1', description: 'Use exponential backoff for retries' },
        { id: 'TR-2', description: 'Log all authentication attempts' }
      ],
      exec_checklist: [
        { task: 'Update src/auth/login.js with try-catch blocks', completed: false },
        { task: 'Add retry utility to src/utils/retry.js', completed: false }
      ],
      test_scenarios: [
        { name: 'Failed login attempt', description: 'Verify error is logged and user sees message' },
        { name: 'API retry', description: 'Verify 3 retry attempts with backoff' }
      ],
      progress: 0,
      phase: 'planning'
    };

    try {
      const { data: _data, error } = await this.supabase
        .from('product_requirements_v2')
        .insert(samplePRD)
        .select()
        .single();

      if (error) {
        console.log(chalk.yellow('Could not create sample PRD:'), error.message);
        return null;
      }

      console.log(chalk.green(`\n✅ Created sample PRD: ${prdId}`));
      console.log(chalk.gray('   You can use this for testing the Codex workflow'));

      return prdId;
    } catch (error) {
      console.log(chalk.yellow('Could not create sample PRD:'), error.message);
      return null;
    }
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const setup = new CodexHandoffSetup();
  const command = process.argv[2];

  (async () => {
    try {
      if (command === '--verify') {
        await setup.verifySetup();
      } else if (command === '--sample') {
        const prdId = await setup.createSamplePRD();
        if (prdId) {
          console.log(chalk.cyan('\nTest the workflow with:'));
          console.log(chalk.white(`  node scripts/generate-codex-prompt.js ${prdId}`));
        }
      } else {
        await setup.executeMigration();
        console.log(chalk.cyan('\nAfter running the migration, verify with:'));
        console.log(chalk.white('  node scripts/setup-codex-handoffs.js --verify'));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  })();
}