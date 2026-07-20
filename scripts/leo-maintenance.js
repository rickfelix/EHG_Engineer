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

import { createSupabaseClient } from '../lib/supabase-client.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { renderCount } from '../lib/db/fetch-all-paginated.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabase = createSupabaseClient();

// SD-REFILL-001MABRD: three maintenance routines read tables that are NOT provisioned
// (leo_session_tracking, circuit_breaker_state, sub_agent_activation_stats). PostgREST returns a
// relation/schema-cache error rather than throwing, so the routines used to silently no-op (the
// circuit-breaker reset even reported false success "Reset 0"). This detector lets each site report
// an explicit "not provisioned — skipped" status instead of a silent dead read, making the phantom
// tables behind the live `leo:maintenance` entry observable until they are provisioned (DDL) or removed.
export function isUnprovisionedTableError(error) {
  if (!error) return false;
  const msg = (error.message || String(error) || '').toLowerCase();
  return /relation|does not exist|find the table|schema cache|undefined table/.test(msg);
}

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
      orphanedFiles: this.cleanupOrphanedFiles.bind(this),
      brainstormPipeline: this.fixBrainstormPipeline.bind(this)
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
        .from('circuit_breaker_state') // schema-lint-disable-line: pre-existing table reference, unrelated to FR-6 pagination edits in this file (surfaced by file-level diff scoping)
        .select('*')
        .eq('state', 'open')
        .lt('last_failure_at', new Date(Date.now() - 3600000).toISOString());

      // SD-REFILL-001MABRD: report the unprovisioned table explicitly instead of a misleading
      // "Reset 0 stale circuit breakers" success on a table that does not exist.
      if (isUnprovisionedTableError(error)) {
        return { success: true, skipped: true, message: 'skipped — circuit_breaker_state not provisioned' };
      }

      if (!error && data) {
        for (const breaker of data) {
          await supabase
            .rpc('reset_circuit_breaker', { p_service_name: breaker.service_name });
          resetCount++;
        }
      }
    } catch {
      // Defensive: unexpected throw — treat as skipped rather than failing maintenance.
      return { success: true, skipped: true, message: 'skipped — circuit_breaker_state unavailable' };
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
   * Auto-fix brainstorm pipeline issues (outcome upgrades)
   */
  async fixBrainstormPipeline() {
    try {
      const { autoFixBrainstormPipeline } = await import('./brainstorm-pipeline-health.js');
      const result = await autoFixBrainstormPipeline();
      return {
        success: true,
        message: `Pipeline: ${result.fixed} fixed, ${result.errors} errors, ${result.total_issues} total issues`
      };
    } catch (error) {
      return {
        success: false,
        message: `Brainstorm pipeline check unavailable: ${error.message}`
      };
    }
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
      const { data: activationStats, error: activationErr } = await supabase
        .from('sub_agent_activation_stats') // schema-lint-disable-line: pre-existing table reference, unrelated to FR-6 pagination edits in this file (surfaced by file-level diff scoping)
        .select('*');

      // SD-REFILL-001MABRD: make an unprovisioned table visible instead of a silent empty section.
      if (isUnprovisionedTableError(activationErr)) {
        console.log(chalk.yellow('  ⚠️  Sub-Agent Activity: sub_agent_activation_stats not provisioned — section skipped'));
      } else if (activationStats && activationStats.length > 0) {
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

      // Table hook_resolution_stats does not exist yet
      const resolutionStats = [];

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

      // Active sessions (exact head-count — SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001
      // FR-6 batch 9: this is a gauge, not a processed list; never coerce a failed
      // measurement to a healthy-looking 0)
      const { count: activeSessionCount, error: sessionsErr } = await supabase
        .from('leo_session_tracking') // schema-lint-disable-line: pre-existing table reference, unrelated to FR-6 pagination edits in this file (surfaced by file-level diff scoping)
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');

      // SD-REFILL-001MABRD: surface the unprovisioned table instead of silently omitting the line.
      if (isUnprovisionedTableError(sessionsErr)) {
        console.log(chalk.yellow('\n⚠️  Active Sessions: leo_session_tracking not provisioned — count unavailable'));
      } else if (!sessionsErr) {
        console.log(chalk.cyan(`\nActive Sessions: ${renderCount(activeSessionCount)}`));
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

// SD-REFILL-001MABRD: only run the CLI when invoked directly, not when imported (e.g. by unit tests
// of the exported helpers) — importing the module no longer triggers a live maintenance run.
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (invokedDirectly) {
  main().catch(console.error);
}

export default LEOMaintenanceManager;