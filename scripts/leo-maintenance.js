#!/usr/bin/env node

/**
 * LEO Protocol Maintenance Script
 *
 * Handles cleanup and maintenance tasks for the feedback loop system:
 * - Expire old sessions
 * - Clean up activation logs
 * - Rotate failure logs
 * - Reset circuit breakers
 * - Generate health reports
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class LEOMaintenanceManager {
  constructor() {
    this.logRetentionDays = 30;
    this.sessionExpirationHours = 24;
    this.failureLogMaxEntries = 100;
  }

  /**
   * Run all maintenance tasks
   */
  async runMaintenance(options = {}) {
    console.log(chalk.blue('🔧 LEO Protocol Maintenance'));
    console.log(chalk.gray('=' .repeat(50)));

    const tasks = {
      sessions: this.cleanupSessions.bind(this),
      activations: this.cleanupActivations.bind(this),
      failureLogs: this.rotateFailureLogs.bind(this),
      circuitBreakers: this.resetStaleCircuitBreakers.bind(this),
      orphanedFiles: this.cleanupOrphanedFiles.bind(this)
    };

    const results = {};

    for (const [taskName, taskFunc] of Object.entries(tasks)) {
      if (options.only && !options.only.includes(taskName)) {
        continue;
      }

      console.log(chalk.cyan(`\n📋 Running: ${taskName}`));

      try {
        results[taskName] = await taskFunc();
        console.log(chalk.green(`   ✅ ${results[taskName].message}`));
      } catch (error) {
        results[taskName] = { success: false, error: error.message };
        console.log(chalk.red(`   ❌ Failed: ${error.message}`));
      }
    }

    // Generate summary report
    await this.generateHealthReport(results);

    return results;
  }

  /**
   * Clean up expired sessions
   */
  async cleanupSessions() {
    // Clean up file-based sessions
    let filesRemoved = 0;
    try {
      const sessionFile = '.leo-session-active';
      const sessionIdFile = '.leo-session-id';

      // Check session age
      try {
        const stats = await fs.stat(sessionFile);
        const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);

        if (ageHours > this.sessionExpirationHours) {
          await fs.unlink(sessionFile).catch(() => {});
          await fs.unlink(sessionIdFile).catch(() => {});
          filesRemoved = 2;
        }
      } catch {
        // Files don't exist
      }
    } catch (error) {
      console.warn('   Could not clean file sessions:', error.message);
    }

    // Clean up database sessions
    let dbExpired = 0;
    try {
      // Call the database function to expire sessions
      const { data, error } = await supabase
        .rpc('expire_old_sessions');

      if (!error && data) {
        dbExpired = data;
      }
    } catch {
      // Database function might not exist
    }

    return {
      success: true,
      message: `Cleaned ${filesRemoved} session files, expired ${dbExpired} database sessions`
    };
  }

  /**
   * Clean up old activation logs
   */
  async cleanupActivations() {
    let deleted = 0;

    try {
      // Call database cleanup function
      const { data, error } = await supabase
        .rpc('cleanup_old_activations');

      if (!error && data) {
        deleted = data;
      }
    } catch {
      // Database function might not exist
    }

    // Also clean up any local activation logs
    try {
      const logsDir = path.join(__dirname, '..', 'logs');
      const files = await fs.readdir(logsDir).catch(() => []);

      for (const file of files) {
        if (file.startsWith('activation-')) {
          const filePath = path.join(logsDir, file);
          const stats = await fs.stat(filePath);
          const ageDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

          if (ageDays > this.logRetentionDays) {
            await fs.unlink(filePath);
            deleted++;
          }
        }
      }
    } catch {
      // Logs directory might not exist
    }

    return {
      success: true,
      message: `Deleted ${deleted} old activation records`
    };
  }

  /**
   * Rotate failure logs
   */
  async rotateFailureLogs() {
    const failureLogPath = '.leo-hook-failures.json';
    let entriesKept = 0;
    let entriesRemoved = 0;

    try {
      const content = await fs.readFile(failureLogPath, 'utf8');
      const failures = JSON.parse(content);

      if (Array.isArray(failures) && failures.length > this.failureLogMaxEntries) {
        // Keep only the most recent entries
        const keptFailures = failures.slice(-this.failureLogMaxEntries);
        entriesRemoved = failures.length - keptFailures.length;
        entriesKept = keptFailures.length;

        // Archive old entries
        const archivePath = `.leo-hook-failures-${Date.now()}.archive.json`;
        const archivedFailures = failures.slice(0, entriesRemoved);
        await fs.writeFile(archivePath, JSON.stringify(archivedFailures, null, 2));

        // Write back the kept entries
        await fs.writeFile(failureLogPath, JSON.stringify(keptFailures, null, 2));
      } else {
        entriesKept = failures.length;
      }
    } catch {
      // File doesn't exist or is invalid
    }

    return {
      success: true,
      message: `Rotated failure log: kept ${entriesKept}, archived ${entriesRemoved}`
    };
  }

  /**
   * Reset stale circuit breakers
   */
  async resetStaleCircuitBreakers() {
    let resetCount = 0;

    try {
      // Reset circuit breakers that have been open for >1 hour
      const { data, error } = await supabase
        .from('circuit_breaker_state')
        .select('*')
        .eq('state', 'open')
        .lt('last_failure_at', new Date(Date.now() - 3600000).toISOString());

      if (!error && data) {
        for (const breaker of data) {
          await supabase
            .rpc('reset_circuit_breaker', { p_service_name: breaker.service_name });
          resetCount++;
        }
      }
    } catch {
      // Table might not exist
    }

    return {
      success: true,
      message: `Reset ${resetCount} stale circuit breakers`
    };
  }

  /**
   * Clean up orphaned files
   */
  async cleanupOrphanedFiles() {
    const cleaned = {
      tempFiles: 0,
      stashFiles: 0,
      archiveFiles: 0
    };

    // Clean up temporary files
    const patterns = [
      { pattern: '.leo-session-*.tmp', type: 'tempFiles' },
      { pattern: '.leo-hook-failures-*.archive.json', type: 'archiveFiles', maxAge: 7 }, // Keep archives for 7 days
      { pattern: 'auto-stash-*', type: 'stashFiles', maxAge: 3 } // Keep stashes for 3 days
    ];

    for (const { pattern, type, maxAge } of patterns) {
      try {
        const files = await fs.readdir('.');
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));

        for (const file of files) {
          if (regex.test(file)) {
            if (maxAge) {
              const stats = await fs.stat(file);
              const ageDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

              if (ageDays > maxAge) {
                await fs.unlink(file);
                cleaned[type]++;
              }
            } else {
              await fs.unlink(file);
              cleaned[type]++;
            }
          }
        }
      } catch {
        // Continue with other patterns
      }
    }

    return {
      success: true,
      message: `Cleaned ${cleaned.tempFiles} temp, ${cleaned.archiveFiles} archive, ${cleaned.stashFiles} stash files`
    };
  }

  /**
   * Generate health report
   */
  async generateHealthReport(maintenanceResults) {
    console.log(chalk.blue('\n📊 Health Report'));
    console.log(chalk.gray('=' .repeat(50)));

    // Get statistics from database
    try {
      // Sub-agent activation stats
      const { data: activationStats } = await supabase
        .from('sub_agent_activation_stats')
        .select('*');

      if (activationStats && activationStats.length > 0) {
        console.log(chalk.cyan('\nSub-Agent Activity:'));
        for (const stat of activationStats) {
          const successRate = stat.total_activations > 0
            ? ((stat.successful / stat.total_activations) * 100).toFixed(1)
            : 0;

          console.log(`  ${stat.sub_agent_code}:`);
          console.log(`    Total: ${stat.total_activations}, Success: ${successRate}%`);

          if (stat.avg_duration_seconds) {
            console.log(`    Avg Duration: ${stat.avg_duration_seconds.toFixed(2)}s`);
          }
        }
      }

      // Hook resolution stats
      const { data: resolutionStats } = await supabase
        .from('hook_resolution_stats')
        .select('*');

      if (resolutionStats && resolutionStats.length > 0) {
        console.log(chalk.cyan('\nHook Resolution:'));
        for (const stat of resolutionStats) {
          const resolveRate = stat.total_occurrences > 0
            ? ((stat.resolved / stat.total_occurrences) * 100).toFixed(1)
            : 0;

          console.log(`  ${stat.error_type}:`);
          console.log(`    Occurrences: ${stat.total_occurrences}, Resolved: ${resolveRate}%`);

          if (stat.avg_resolution_time_seconds) {
            console.log(`    Avg Time: ${stat.avg_resolution_time_seconds.toFixed(2)}s`);
          }
        }
      }

      // Active sessions
      const { data: activeSessions } = await supabase
        .from('leo_session_tracking')
        .select('count')
        .eq('status', 'active');

      if (activeSessions) {
        console.log(chalk.cyan(`\nActive Sessions: ${activeSessions.length || 0}`));
      }

    } catch (_error) {
      console.log(chalk.yellow('\n⚠️  Could not fetch database statistics'));
    }

    // Summary of maintenance
    console.log(chalk.cyan('\nMaintenance Summary:'));
    for (const [task, result] of Object.entries(maintenanceResults)) {
      const status = result.success ? chalk.green('✓') : chalk.red('✗');
      console.log(`  ${status} ${task}: ${result.message || result.error}`);
    }

    console.log(chalk.gray('\n' + '=' .repeat(50)));
  }
}

// CLI execution
async function main() {
  const manager = new LEOMaintenanceManager();
  const command = process.argv[2];

  const commands = {
    'all': () => manager.runMaintenance(),
    'sessions': () => manager.runMaintenance({ only: ['sessions'] }),
    'logs': () => manager.runMaintenance({ only: ['activations', 'failureLogs'] }),
    'clean': () => manager.runMaintenance({ only: ['orphanedFiles'] }),
    'health': () => manager.generateHealthReport({})
  };

  if (command && commands[command]) {
    await commands[command]();
  } else {
    console.log(chalk.blue('LEO Protocol Maintenance'));
    console.log(chalk.gray('=' .repeat(40)));
    console.log('\nUsage:');
    console.log('  node leo-maintenance.js <command>');
    console.log('\nCommands:');
    console.log('  all      - Run all maintenance tasks');
    console.log('  sessions - Clean up expired sessions');
    console.log('  logs     - Rotate and clean logs');
    console.log('  clean    - Clean orphaned files');
    console.log('  health   - Generate health report only');
  }
}

main().catch(console.error);

export default LEOMaintenanceManager;