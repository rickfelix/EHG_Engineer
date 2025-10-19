#!/usr/bin/env node

/**
 * LEO Session Cleanup Utility
 * Cleans up lingering sessions, caches, and ensures clean orchestrator runs
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class LEOCleanup {
  constructor() {
    this.sessionFiles = [
      '.leo-session-active',
      '.leo-session-id',
      '.leo-handoff-active',
      '.handoff-in-progress',
      '.sd-active',
      '.current-sd'
    ];

    this.cacheFiles = [
      '.leo-cache.json',
      '.leo-analysis-cache.json',
      '.leo-context-state.json',
      '.leo-hook-failures.json'
    ];
  }

  async cleanSessionFiles() {
    console.log(chalk.yellow('🧹 Cleaning session files...'));

    for (const file of this.sessionFiles) {
      try {
        await fs.unlink(file);
        console.log(chalk.green(`   ✓ Removed ${file}`));
      } catch (error) {
        // File doesn't exist, that's ok
      }
    }
  }

  async cleanCompletedSDs() {
    console.log(chalk.yellow('\n📋 Checking for completed SDs that should not be active...'));

    // Get all completed SDs
    const { data: completedSDs, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, current_phase')
      .eq('status', 'completed');

    if (completedSDs && completedSDs.length > 0) {
      console.log(chalk.cyan(`   Found ${completedSDs.length} completed SDs:`));

      for (const sd of completedSDs) {
        console.log(`   - ${sd.id}: ${sd.title}`);

        // Check if any sessions reference this SD
        const { data: sessions } = await supabase
          .from('leo_execution_sessions')
          .select('id, status')
          .eq('sd_id', sd.id)
          .eq('status', 'in_progress');

        if (sessions && sessions.length > 0) {
          console.log(chalk.yellow(`     ⚠️  Found ${sessions.length} active sessions - cleaning...`));

          // Mark sessions as completed
          await supabase
            .from('leo_execution_sessions')
            .update({ status: 'completed', ended_at: new Date() })
            .eq('sd_id', sd.id)
            .eq('status', 'in_progress');
        }
      }
    } else {
      console.log(chalk.green('   ✓ No completed SDs found'));
    }
  }

  async cleanOrphanedHandoffs() {
    console.log(chalk.yellow('\n🤝 Checking for orphaned handoffs...'));

    // Find handoffs for completed SDs
    const { data: orphanedHandoffs } = await supabase
      .from('sd_phase_handoffs')
      .select(`
        id,
        sd_id,
        from_agent,
        to_agent,
        status,
        strategic_directives_v2!inner(status)
      `)
      .eq('status', 'pending')
      .eq('strategic_directives_v2.status', 'completed');

    if (orphanedHandoffs && orphanedHandoffs.length > 0) {
      console.log(chalk.yellow(`   Found ${orphanedHandoffs.length} orphaned handoffs`));

      for (const handoff of orphanedHandoffs) {
        console.log(`   - Handoff ${handoff.id}: ${handoff.from_agent} → ${handoff.to_agent} for ${handoff.sd_id}`);

        // Mark as cancelled
        await supabase
          .from('sd_phase_handoffs')
          .update({ status: 'cancelled', completed_at: new Date() })
          .eq('id', handoff.id);
      }
    } else {
      console.log(chalk.green('   ✓ No orphaned handoffs found'));
    }
  }

  async resetCaches(full = false) {
    if (full) {
      console.log(chalk.yellow('\n🗑️  Full cache reset requested...'));

      for (const file of this.cacheFiles) {
        try {
          await fs.unlink(file);
          console.log(chalk.green(`   ✓ Removed ${file}`));
        } catch (error) {
          // File doesn't exist, that's ok
        }
      }
    } else {
      console.log(chalk.cyan('\n📦 Preserving cache files (use --full to clear)'));
    }
  }

  async showActiveWork() {
    console.log(chalk.blue('\n📊 Active Work Status:'));

    // Show active SDs
    const { data: activeSDs } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, current_phase, is_working_on')
      .in('status', ['active', 'in_progress', 'pending_approval'])
      .order('priority', { ascending: false });

    if (activeSDs && activeSDs.length > 0) {
      console.log(chalk.cyan('\n   Active Strategic Directives:'));
      for (const sd of activeSDs) {
        const workingOn = sd.is_working_on ? '🔴' : '⚪';
        console.log(`   ${workingOn} ${sd.id}: ${sd.title}`);
        console.log(`      Status: ${sd.status}, Phase: ${sd.current_phase || 'N/A'}`);
      }
    }

    // Show active sessions
    const { data: activeSessions } = await supabase
      .from('leo_execution_sessions')
      .select('id, sd_id, started_at, status')
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false });

    if (activeSessions && activeSessions.length > 0) {
      console.log(chalk.yellow('\n   ⚠️  Active LEO Sessions:'));
      for (const session of activeSessions) {
        const duration = Math.round((Date.now() - new Date(session.started_at)) / 1000 / 60);
        console.log(`   - Session ${session.id} for ${session.sd_id} (${duration} minutes ago)`);
      }

      console.log(chalk.yellow('\n   Consider running with --force to clean these up'));
    } else {
      console.log(chalk.green('\n   ✓ No active sessions'));
    }
  }

  async cleanAll(options = {}) {
    console.log(chalk.blue.bold('\n🚀 LEO Cleanup Utility\n'));

    // Clean session files
    await this.cleanSessionFiles();

    // Clean completed SDs
    await this.cleanCompletedSDs();

    // Clean orphaned handoffs
    await this.cleanOrphanedHandoffs();

    // Reset caches if requested
    await this.resetCaches(options.full);

    // Force clean active sessions if requested
    if (options.force) {
      console.log(chalk.red('\n⚠️  Force cleaning all active sessions...'));

      const { error } = await supabase
        .from('leo_execution_sessions')
        .update({ status: 'cancelled', ended_at: new Date() })
        .eq('status', 'in_progress');

      if (!error) {
        console.log(chalk.green('   ✓ All active sessions cancelled'));
      }
    }

    // Show current status
    await this.showActiveWork();

    console.log(chalk.green.bold('\n✅ Cleanup complete!\n'));
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const cleanup = new LEOCleanup();

  const args = process.argv.slice(2);
  const options = {
    full: args.includes('--full'),
    force: args.includes('--force')
  };

  if (args.includes('--help')) {
    console.log(`
LEO Cleanup Utility

Usage: node scripts/leo-cleanup.js [options]

Options:
  --full   Clear all cache files (not just sessions)
  --force  Cancel all active sessions (use with caution)
  --help   Show this help message

Examples:
  node scripts/leo-cleanup.js           # Basic cleanup
  node scripts/leo-cleanup.js --full    # Full cache reset
  node scripts/leo-cleanup.js --force   # Force cancel active work
    `);
    process.exit(0);
  }

  cleanup.cleanAll(options)
    .then(() => process.exit(0))
    .catch(error => {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    });
}