#!/usr/bin/env node

/**
 * LEO Hook Feedback System
 * Captures git hook failures and automatically resolves them
 * Part of SD-LEO-003 enhancement
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import HookSubAgentActivator from './hook-subagent-activator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

class LEOHookFeedback {
  constructor() {
    this.failureLogPath = '.leo-hook-failures.json';
    this.maxRetries = 3;
    this.subAgentActivator = new HookSubAgentActivator();

    // Error recovery configuration
    this.retryConfig = {
      baseDelay: 1000,          // Start with 1 second
      maxDelay: 30000,          // Max 30 seconds
      backoffMultiplier: 2,     // Exponential backoff
      operationTimeout: 30000,  // 30 second timeout per operation
      circuitBreakerThreshold: 3 // Open circuit after 3 consecutive failures
    };

    // Circuit breaker state
    this.circuitBreaker = {
      failures: 0,
      state: 'closed', // closed, open, half-open
      lastFailureTime: null,
      nextRetryTime: null
    };

    // Legacy resolution strategies (fallback if sub-agent fails)
    this.resolutionStrategies = {
      'no_orchestrator_session': this.resolveNoSession.bind(this),
      'prd_files_detected': this.resolvePRDFiles.bind(this),
      'duplicate_services': this.resolveDuplicateServices.bind(this),
      'stale_session': this.resolveStaleSession.bind(this),
      'handoff_files_detected': this.resolveHandoffFiles.bind(this)
    };
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  calculateRetryDelay(attemptNumber) {
    const delay = Math.min(
      this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attemptNumber - 1),
      this.retryConfig.maxDelay
    );
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.3 * delay;
    return Math.floor(delay + jitter);
  }

  /**
   * Check circuit breaker state
   */
  checkCircuitBreaker() {
    if (this.circuitBreaker.state === 'open') {
      if (Date.now() >= this.circuitBreaker.nextRetryTime) {
        console.log(chalk.yellow('⚡ Circuit breaker entering half-open state'));
        this.circuitBreaker.state = 'half-open';
      } else {
        const waitTime = Math.ceil((this.circuitBreaker.nextRetryTime - Date.now()) / 1000);
        throw new Error(`Circuit breaker is open. Retry in ${waitTime} seconds`);
      }
    }
  }

  /**
   * Record circuit breaker failure
   */
  recordCircuitFailure() {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.failures >= this.retryConfig.circuitBreakerThreshold) {
      this.circuitBreaker.state = 'open';
      this.circuitBreaker.nextRetryTime = Date.now() + 60000; // Wait 1 minute before retry
      console.log(chalk.red('⚡ Circuit breaker opened due to repeated failures'));
    }
  }

  /**
   * Reset circuit breaker on success
   */
  resetCircuitBreaker() {
    if (this.circuitBreaker.state !== 'closed') {
      console.log(chalk.green('⚡ Circuit breaker reset to closed'));
    }
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.state = 'closed';
    this.circuitBreaker.lastFailureTime = null;
    this.circuitBreaker.nextRetryTime = null;
  }

  /**
   * Wrap git commit command to capture failures
   */
  async wrapGitCommit(args) {
    console.log(chalk.blue('🤖 LEO Hook Feedback System Active'));
    console.log(chalk.gray('=' .repeat(50)));

    let attempts = 0;
    let lastError = null;

    while (attempts < this.maxRetries) {
      attempts++;

      // Check circuit breaker before attempting
      try {
        this.checkCircuitBreaker();
      } catch (cbError) {
        console.log(chalk.red(`\n❌ ${cbError.message}`));
        process.exit(1);
      }

      console.log(chalk.cyan(`\n📝 Attempt ${attempts}/${this.maxRetries}`));

      try {
        // Try to execute git command with timeout
        const result = await this.executeWithTimeout(
          this.executeGitCommand(args),
          this.retryConfig.operationTimeout,
          'Git command timed out'
        );

        if (result.success) {
          console.log(chalk.green('\n✅ Commit successful!'));
          await this.cleanupFailureLog();
          return;
        }

        // Parse the error
        const failure = this.parseHookFailure(result.error);

        if (!failure) {
          console.log(chalk.red('\n❌ Unknown error - cannot auto-resolve'));
          console.error(result.error);
          process.exit(1);
        }

        // Log the failure
        await this.logFailure(failure);
        lastError = failure;

        console.log(chalk.yellow(`\n🔍 Detected issue: ${failure.type}`));
        console.log(chalk.gray(`   ${failure.message}`));

        // Try to resolve
        const resolved = await this.attemptResolution(failure);

        if (!resolved) {
          console.log(chalk.red('\n❌ Could not auto-resolve issue'));
          break;
        }

        console.log(chalk.green('✅ Issue resolved, retrying commit...'));

        // Reset circuit breaker on successful resolution
        this.resetCircuitBreaker();

        // Calculate and apply retry delay with exponential backoff
        const retryDelay = this.calculateRetryDelay(attempts);
        console.log(chalk.gray(`   Waiting ${retryDelay}ms before retry...`));
        await new Promise(resolve => setTimeout(resolve, retryDelay));

      } catch (error) {
        console.error(chalk.red('\n❌ Error:'), error.message);

        // Record failure for circuit breaker
        this.recordCircuitFailure();

        // If this was the last attempt, exit
        if (attempts >= this.maxRetries) {
          console.error(chalk.red('\n❌ Fatal: Max retries exceeded'));
          process.exit(1);
        }

        // Apply exponential backoff before next attempt
        const retryDelay = this.calculateRetryDelay(attempts);
        console.log(chalk.yellow(`\n⏳ Retrying in ${retryDelay}ms...`));
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    if (lastError) {
      console.log(chalk.red('\n❌ Failed after maximum retries'));
      console.log(chalk.yellow('\n💡 Manual resolution needed:'));
      this.printManualResolution(lastError);
    }

    process.exit(1);
  }

  /**
   * Execute with timeout wrapper
   */
  async executeWithTimeout(promise, timeout, timeoutMessage) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeout);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Execute git command and capture output
   */
  async executeGitCommand(args) {
    return new Promise((resolve) => {
      const gitArgs = ['commit', ...args];
      const git = spawn('git', gitArgs, { stdio: 'pipe' });

      let stdout = '';
      let stderr = '';

      git.stdout.on('data', (data) => {
        stdout += data.toString();
        process.stdout.write(data);
      });

      git.stderr.on('data', (data) => {
        stderr += data.toString();
        process.stderr.write(data);
      });

      git.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output: stdout });
        } else {
          resolve({ success: false, error: stderr || stdout });
        }
      });
    });
  }

  /**
   * Parse hook failure message to identify the issue
   */
  parseHookFailure(errorMessage) {
    const patterns = [
      {
        pattern: /No active LEO Protocol Orchestrator session/i,
        type: 'no_orchestrator_session',
        message: 'No orchestrator session active'
      },
      {
        pattern: /Orchestrator session is stale/i,
        type: 'stale_session',
        message: 'Session is stale (>2 hours old)'
      },
      {
        pattern: /PRD markdown files detected/i,
        type: 'prd_files_detected',
        message: 'PRD files must be in database only'
      },
      {
        pattern: /Duplicate service files detected/i,
        type: 'duplicate_services',
        message: 'Duplicate service files found'
      },
      {
        pattern: /Handoff files detected/i,
        type: 'handoff_files_detected',
        message: 'Handoff files must be in database only'
      }
    ];

    for (const { pattern, type, message } of patterns) {
      if (pattern.test(errorMessage)) {
        return {
          type,
          message,
          rawError: errorMessage,
          timestamp: new Date().toISOString()
        };
      }
    }

    return null;
  }

  /**
   * Log failure to file and database
   */
  async logFailure(failure) {
    // Log to file
    let failures = [];
    try {
      const existing = await fs.readFile(this.failureLogPath, 'utf8');
      failures = JSON.parse(existing);
    } catch {
      // File doesn't exist or is invalid
    }

    failures.push(failure);
    await fs.writeFile(this.failureLogPath, JSON.stringify(failures, null, 2));

    // Log to database if available
    try {
      await supabase
        .from('leo_hook_feedback')
        .insert({
          error_type: failure.type,
          error_message: failure.message,
          resolution_status: 'pending',
          created_at: failure.timestamp
        });
    } catch {
      // Database table might not exist yet
    }
  }

  /**
   * Attempt to resolve the issue
   */
  async attemptResolution(failure) {
    console.log(chalk.cyan('\n🔧 Attempting automatic resolution...'));

    // First, try sub-agent activation
    if (this.subAgentActivator.canHandle(failure.type)) {
      console.log(chalk.blue('🤖 Delegating to sub-agent system...'));

      try {
        const subAgentResult = await this.subAgentActivator.activateForFailure(
          failure.type,
          { sdId: await this.getCurrentSDContext() }
        );

        if (subAgentResult.success) {
          console.log(chalk.green('✅ Sub-agent resolution successful'));

          // Update database with sub-agent info
          try {
            await supabase
              .from('leo_hook_feedback')
              .update({
                resolution_status: 'resolved',
                resolved_at: new Date().toISOString(),
                sub_agent_activated: subAgentResult.subAgent || 'UNKNOWN',
                resolution_method: 'sub-agent',
                resolution_details: subAgentResult
              })
              .eq('error_type', failure.type)
              .eq('resolution_status', 'pending');
          } catch {
            // Database might not be available
          }

          return subAgentResult;
        } else {
          console.log(chalk.yellow('⚠️  Sub-agent resolution failed, trying legacy method...'));
        }
      } catch (error) {
        console.error(chalk.red('Sub-agent error:'), error.message);
      }
    }

    // Fallback to legacy resolution strategies
    const resolver = this.resolutionStrategies[failure.type];

    if (!resolver) {
      console.log(chalk.yellow('⚠️  No automatic resolution available'));
      return false;
    }

    try {
      const resolved = await resolver(failure);

      if (resolved) {
        // Update database
        try {
          await supabase
            .from('leo_hook_feedback')
            .update({
              resolution_status: 'resolved',
              resolved_at: new Date().toISOString(),
              sub_agent_activated: resolved.subAgent || null,
              resolution_method: 'legacy'
            })
            .eq('error_type', failure.type)
            .eq('resolution_status', 'pending');
        } catch {
          // Database might not be available
        }
      }

      return resolved;
    } catch (error) {
      console.error(chalk.red('Resolution failed:'), error.message);
      return false;
    }
  }

  /**
   * Resolution: No orchestrator session
   */
  async resolveNoSession() {
    console.log('🚀 Creating orchestrator session...');

    // Check for current SD in branch name or recent commits
    const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    let sdId = null;

    // Try to extract SD from branch name
    const sdMatch = branch.match(/SD-\d{4}-\d{3}/);
    if (sdMatch) {
      sdId = sdMatch[0];
    }

    if (!sdId) {
      // Try to find SD from recent commit messages
      try {
        const recentCommits = execSync('git log -5 --oneline', { encoding: 'utf8' });
        const commitSDMatch = recentCommits.match(/SD-\d{4}-\d{3}/);
        if (commitSDMatch) {
          sdId = commitSDMatch[0];
        }
      } catch {
        // No commits yet
      }
    }

    if (!sdId) {
      console.log(chalk.yellow('⚠️  No SD found. Creating temporary session...'));
      sdId = 'SD-TEMP-001';
    }

    // Create session files
    await fs.writeFile('.leo-session-active', new Date().toISOString());
    await fs.writeFile('.leo-session-id', sdId);

    console.log(chalk.green(`✅ Session created for ${sdId}`));

    return { success: true, subAgent: 'session-manager' };
  }

  /**
   * Resolution: Stale session
   */
  async resolveStaleSession() {
    console.log('🔄 Refreshing orchestrator session...');

    // Read existing session ID
    let sdId = 'SD-TEMP-001';
    try {
      sdId = await fs.readFile('.leo-session-id', 'utf8');
    } catch {
      // No session ID file
    }

    // Refresh session
    await fs.writeFile('.leo-session-active', new Date().toISOString());

    console.log(chalk.green('✅ Session refreshed'));

    return { success: true, subAgent: 'session-manager' };
  }

  /**
   * Resolution: PRD files detected
   */
  async resolvePRDFiles() {
    console.log('📦 Migrating PRD files to database...');

    try {
      // Run PRD migration script
      execSync('node scripts/add-prd-to-database.js', { stdio: 'inherit' });

      // Remove PRD files
      const prdFiles = await fs.readdir('prds').catch(() => []);
      for (const file of prdFiles) {
        if (file.endsWith('.md')) {
          await fs.unlink(path.join('prds', file));
          console.log(chalk.gray(`   Removed: prds/${file}`));
        }
      }

      console.log(chalk.green('✅ PRDs migrated to database'));
      return { success: true, subAgent: 'database-migration' };

    } catch (error) {
      console.error(chalk.red('Migration failed:'), error.message);
      return false;
    }
  }

  /**
   * Resolution: Handoff files detected
   */
  async resolveHandoffFiles() {
    console.log('📦 Migrating handoff files to database...');

    // Similar to PRD migration
    console.log(chalk.yellow('⚠️  Manual migration needed for handoff files'));
    console.log('   Run: node scripts/migrate-handoffs-to-database.js');

    return false; // Can't auto-resolve yet
  }

  /**
   * Resolution: Duplicate services
   */
  async resolveDuplicateServices() {
    console.log('🔍 Analyzing duplicate services...');

    // This is complex and needs manual decision
    console.log(chalk.yellow('⚠️  Manual resolution needed for duplicate services'));
    console.log('   1. Review duplicates in src/services/ vs lib/dashboard-legacy/');
    console.log('   2. Choose which version to keep');
    console.log('   3. Update imports accordingly');

    return false; // Can't auto-resolve
  }

  /**
   * Print manual resolution steps
   */
  printManualResolution(failure) {
    const resolutions = {
      'no_orchestrator_session': [
        'Run: npm run leo:execute SD-YYYY-XXX',
        'Or: Create session manually with .leo-session-active file'
      ],
      'stale_session': [
        'Restart your orchestrator session:',
        'Run: npm run leo:execute SD-YYYY-XXX'
      ],
      'prd_files_detected': [
        'Run: node scripts/add-prd-to-database.js',
        'Then: rm prds/*.md'
      ],
      'duplicate_services': [
        'Review files in src/services/ and lib/dashboard-legacy/',
        'Remove duplicates and update imports'
      ],
      'handoff_files_detected': [
        'Migrate handoffs to database',
        'Remove handoff markdown files'
      ]
    };

    const steps = resolutions[failure.type] || ['Check error message above'];

    steps.forEach(step => {
      console.log(chalk.white(`   • ${step}`));
    });
  }

  /**
   * Get current SD context from git or session
   */
  async getCurrentSDContext() {
    try {
      // Try session file first
      const sdId = await fs.readFile('.leo-session-id', 'utf8');
      return sdId.trim();
    } catch {
      // Try branch name
      try {
        const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
        const match = branch.match(/SD-\d{4}-\d{3}/);
        if (match) return match[0];
      } catch {
        // Ignore
      }
    }
    return null;
  }

  /**
   * Clean up failure log after success
   */
  async cleanupFailureLog() {
    try {
      await fs.unlink(this.failureLogPath);
    } catch {
      // File might not exist
    }

    // Get sub-agent activation summary if available
    if (this.subAgentActivator) {
      const summary = this.subAgentActivator.getActivationSummary();
      if (summary.totalActivations > 0) {
        console.log(chalk.blue('\n📊 Sub-Agent Activity Summary:'));
        console.log(chalk.gray(`   Total activations: ${summary.totalActivations}`));
        console.log(chalk.green(`   Successful: ${summary.successful}`));
        if (summary.failed > 0) {
          console.log(chalk.yellow(`   Failed: ${summary.failed}`));
        }
        if (summary.errors > 0) {
          console.log(chalk.red(`   Errors: ${summary.errors}`));
        }
      }
    }
  }
}

// CLI execution
async function main() {
  const feedback = new LEOHookFeedback();

  // Get command and arguments
  const [,, command, ...args] = process.argv;

  if (command === 'commit') {
    await feedback.wrapGitCommit(args);
  } else {
    console.log(chalk.blue('LEO Hook Feedback System'));
    console.log(chalk.gray('=' .repeat(40)));
    console.log('\nUsage:');
    console.log('  node leo-hook-feedback.js commit -m "message"');
    console.log('  npm run leo:commit -m "message"');
    console.log('\nThis wraps git commit to auto-resolve hook failures');
  }
}

main().catch(console.error);