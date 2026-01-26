/**
 * Pre-Handoff Pending Migrations Check
 * Part of LEO Protocol Handoff Enhancement
 *
 * CRITICAL: This module checks for unexecuted database migrations before handoff
 * and MUST USE the DATABASE sub-agent to execute them.
 *
 * The DATABASE sub-agent is the authoritative executor for all migration work.
 * Direct SQL execution is only a last-resort fallback.
 *
 * Retry Strategy:
 * - Attempt 1: Standard DATABASE sub-agent invocation
 * - Attempt 2: Consult issue_patterns for known solutions, retry with context
 * - Attempt 3: Consult retrospectives for similar past issues, retry with learnings
 * - Only after 3 failed attempts: Escalate to user
 */

import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root is 4 levels up from pre-checks
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');

// Retry configuration
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Check for pending database migrations before handoff
 *
 * IMPORTANT: When pending migrations are found, this function MUST invoke
 * the DATABASE sub-agent to execute them. The DATABASE sub-agent has the
 * expertise and context to handle migrations properly.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic Directive record
 * @param {Object} options - Options including autoExecute flag
 * @returns {Promise<Object>} Result with pending migrations info
 */
export async function checkPendingMigrations(supabase, sd, options = {}) {
  const result = {
    hasPendingMigrations: false,
    pendingMigrations: [],
    uncommittedManualUpdates: [],
    executionAttempted: false,
    executionResult: null,
    attemptsUsed: 0,
    knowledgeBaseConsulted: false,
    warnings: [],
    errors: []
  };

  try {
    console.log('\n   🔍 PRE-HANDOFF MIGRATION CHECK');
    console.log('   ' + '─'.repeat(50));

    // Step 1: Check for uncommitted SQL files in manual-updates
    const uncommitted = await checkUncommittedManualUpdates();
    result.uncommittedManualUpdates = uncommitted;

    if (uncommitted.length > 0) {
      result.hasPendingMigrations = true;
      console.log(`   ⚠️  Found ${uncommitted.length} uncommitted manual update(s):`);
      uncommitted.forEach(f => console.log(`      • ${f}`));
    }

    // Step 2: Check for SD-specific pending migrations
    const sdPending = await checkSDPendingMigrations(supabase, sd);
    result.pendingMigrations = sdPending;

    if (sdPending.length > 0) {
      result.hasPendingMigrations = true;
      console.log(`   ⚠️  Found ${sdPending.length} SD-related migration(s) not yet executed:`);
      sdPending.forEach(m => console.log(`      • ${m.file} (${m.status})`));
    }

    // Step 3: If we have pending migrations, USE THE DATABASE SUB-AGENT to execute them
    if (result.hasPendingMigrations && options.autoExecute !== false) {
      console.log('\n   ╔════════════════════════════════════════════════════════════╗');
      console.log('   ║  🗄️  INVOKING DATABASE SUB-AGENT FOR MIGRATION EXECUTION   ║');
      console.log('   ╚════════════════════════════════════════════════════════════╝');
      console.log('');
      console.log('   The DATABASE sub-agent is the authoritative executor for migrations.');
      console.log('   It will analyze, validate, and execute all pending migrations.');
      console.log('');

      result.executionAttempted = true;

      // Execute with retry logic
      const execResult = await executeWithRetry(supabase, sd, {
        uncommittedFiles: uncommitted,
        pendingMigrations: sdPending
      });

      result.executionResult = execResult;
      result.attemptsUsed = execResult.attemptsUsed;
      result.knowledgeBaseConsulted = execResult.knowledgeBaseConsulted;

      if (execResult.success) {
        console.log('   ✅ DATABASE sub-agent successfully executed all migrations');
        // Re-check to confirm
        const recheck = await checkUncommittedManualUpdates();
        if (recheck.length === 0) {
          result.hasPendingMigrations = false;
          console.log('   ✅ Verification passed: All pending migrations have been executed');
        } else {
          result.warnings.push(`${recheck.length} manual updates still pending after execution`);
          console.log(`   ⚠️  ${recheck.length} file(s) still pending - may need manual review`);
        }
      } else {
        result.errors.push(execResult.error || 'DATABASE sub-agent execution failed after all retry attempts');
        console.log('');
        console.log('   ╔════════════════════════════════════════════════════════════╗');
        console.log('   ║  ❌  MIGRATION EXECUTION FAILED - ESCALATION REQUIRED      ║');
        console.log('   ╚════════════════════════════════════════════════════════════╝');
        console.log('');
        console.log(`   Attempts made: ${execResult.attemptsUsed}/${MAX_RETRY_ATTEMPTS}`);
        console.log(`   Knowledge base consulted: ${execResult.knowledgeBaseConsulted ? 'Yes' : 'No'}`);
        console.log(`   Last error: ${execResult.error}`);
        console.log('');
        console.log('   🚨 REQUIRED ACTION:');
        console.log('   1. Review the error message above');
        console.log('   2. Check database/manual-updates/ for the pending SQL files');
        console.log('   3. Execute migrations manually or use /escalate for RCA');
        console.log('');
      }
    } else if (result.hasPendingMigrations) {
      console.log('\n   ℹ️  Pending migrations detected - autoExecute disabled');
      console.log('   💡 The DATABASE sub-agent should be used to execute these migrations.');
      console.log('   💡 Run `node scripts/execute-manual-migrations.js` for manual execution');
    } else {
      console.log('   ✅ No pending migrations found - database is in sync');
    }

    console.log('   ' + '─'.repeat(50));

    return result;
  } catch (error) {
    result.errors.push(`Migration check failed: ${error.message}`);
    console.log(`   ❌ Migration check error: ${error.message}`);
    return result;
  }
}

/**
 * Execute migrations with retry logic and knowledge base consultation
 *
 * Retry Strategy:
 * - Attempt 1: Standard DATABASE sub-agent invocation
 * - Attempt 2: Consult issue_patterns, add context, retry
 * - Attempt 3: Consult retrospectives, add learnings, retry
 * - After 3 failures: Return failure for escalation
 */
async function executeWithRetry(supabase, sd, pendingInfo) {
  let lastError = null;
  let knowledgeBaseConsulted = false;
  let additionalContext = {};

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    console.log(`\n   📍 Attempt ${attempt}/${MAX_RETRY_ATTEMPTS}: Invoking DATABASE sub-agent...`);

    try {
      // On attempt 2+, consult knowledge base for solutions
      if (attempt === 2) {
        console.log('   🔎 Consulting issue_patterns for known migration solutions...');
        const patterns = await consultIssuePatterns(supabase, lastError);
        if (patterns.length > 0) {
          knowledgeBaseConsulted = true;
          additionalContext.issuePatterns = patterns;
          console.log(`   📚 Found ${patterns.length} relevant pattern(s) to inform retry`);
          patterns.forEach(p => console.log(`      • ${p.pattern_name}: ${p.resolution_summary}`));
        } else {
          console.log('   📚 No matching patterns found, proceeding with standard retry');
        }
      }

      if (attempt === 3) {
        console.log('   🔎 Consulting retrospectives for similar past issues...');
        const learnings = await consultRetrospectives(supabase, lastError);
        if (learnings.length > 0) {
          knowledgeBaseConsulted = true;
          additionalContext.retrospectiveLearnings = learnings;
          console.log(`   📚 Found ${learnings.length} relevant learning(s) from past issues`);
          learnings.forEach(l => console.log(`      • ${l.key_learning}`));
        } else {
          console.log('   📚 No matching retrospectives found, proceeding with final attempt');
        }
      }

      // Execute via DATABASE sub-agent
      const result = await invokeDatabaseSubAgent(supabase, sd, pendingInfo, additionalContext);

      if (result.success) {
        return {
          success: true,
          attemptsUsed: attempt,
          knowledgeBaseConsulted,
          method: result.method
        };
      }

      lastError = result.error;
      console.log(`   ⚠️  Attempt ${attempt} failed: ${lastError}`);

      // Wait before retry (except on last attempt)
      if (attempt < MAX_RETRY_ATTEMPTS) {
        const delayMs = RETRY_DELAY_MS * attempt; // Progressive backoff
        console.log(`   ⏳ Waiting ${delayMs}ms before retry...`);
        await sleep(delayMs);
      }

    } catch (error) {
      lastError = error.message;
      console.log(`   ⚠️  Attempt ${attempt} threw error: ${lastError}`);

      if (attempt < MAX_RETRY_ATTEMPTS) {
        const delayMs = RETRY_DELAY_MS * attempt;
        await sleep(delayMs);
      }
    }
  }

  // All attempts failed
  return {
    success: false,
    attemptsUsed: MAX_RETRY_ATTEMPTS,
    knowledgeBaseConsulted,
    error: lastError || 'All retry attempts exhausted'
  };
}

/**
 * Consult issue_patterns table for known solutions to migration errors
 */
async function consultIssuePatterns(supabase, errorMessage) {
  try {
    if (!errorMessage) return [];

    // Search for patterns related to migrations and the specific error
    const searchTerms = ['migration', 'sql', 'database', 'schema'];
    const errorKeywords = errorMessage.toLowerCase().split(/\s+/).slice(0, 5);

    const { data, error } = await supabase
      .from('issue_patterns')
      .select('pattern_name, resolution_summary, resolution_steps, root_cause')
      .or(`pattern_name.ilike.%migration%,pattern_name.ilike.%database%,pattern_name.ilike.%sql%`)
      .eq('status', 'ACTIVE')
      .limit(5);

    if (error || !data) return [];

    // Filter for relevance to the error
    return data.filter(pattern => {
      const patternText = `${pattern.pattern_name} ${pattern.resolution_summary}`.toLowerCase();
      return errorKeywords.some(kw => patternText.includes(kw)) ||
             searchTerms.some(term => patternText.includes(term));
    });
  } catch {
    return [];
  }
}

/**
 * Consult retrospectives for similar past migration issues
 */
async function consultRetrospectives(supabase, errorMessage) {
  try {
    if (!errorMessage) return [];

    const { data, error } = await supabase
      .from('retrospectives')
      .select('key_learnings, what_went_well, what_needs_improvement, action_items')
      .eq('status', 'PUBLISHED')
      .or(`key_learnings.ilike.%migration%,key_learnings.ilike.%database%,key_learnings.ilike.%sql%`)
      .order('conducted_date', { ascending: false })
      .limit(5);

    if (error || !data) return [];

    // Extract relevant learnings
    const learnings = [];
    for (const retro of data) {
      if (retro.key_learnings) {
        const keyLearnings = Array.isArray(retro.key_learnings)
          ? retro.key_learnings
          : [retro.key_learnings];

        for (const learning of keyLearnings) {
          const text = typeof learning === 'string' ? learning : learning.learning || '';
          if (text.toLowerCase().includes('migration') ||
              text.toLowerCase().includes('database') ||
              text.toLowerCase().includes('sql')) {
            learnings.push({ key_learning: text });
          }
        }
      }
    }

    return learnings.slice(0, 3);
  } catch {
    return [];
  }
}

/**
 * Invoke the DATABASE sub-agent to execute migrations
 *
 * IMPORTANT: The DATABASE sub-agent is the primary mechanism for migration execution.
 * It has specialized knowledge and can handle complex migration scenarios.
 */
async function invokeDatabaseSubAgent(supabase, sd, pendingInfo, additionalContext = {}) {
  try {
    // Try to use the orchestrate function for DATABASE sub-agent
    const { orchestrate } = await import('../../../orchestrate-phase-subagents.js');

    // Build comprehensive context for DATABASE sub-agent
    const context = {
      trigger: 'PRE_HANDOFF_MIGRATION_CHECK',
      action: 'EXECUTE_PENDING_MIGRATIONS',
      sdKey: sd?.sd_key,
      pendingMigrations: pendingInfo.pendingMigrations,
      uncommittedFiles: pendingInfo.uncommittedFiles,
      // Include knowledge base findings to help the sub-agent
      ...additionalContext,
      instructions: `
        CRITICAL: You are the DATABASE sub-agent and MUST execute these pending migrations.

        Pending files to execute:
        ${pendingInfo.uncommittedFiles.map(f => `- ${f}`).join('\n')}
        ${pendingInfo.pendingMigrations.map(m => `- ${m.file}`).join('\n')}

        ${additionalContext.issuePatterns ? `
        Known solutions from issue_patterns:
        ${additionalContext.issuePatterns.map(p => `- ${p.pattern_name}: ${p.resolution_summary}`).join('\n')}
        ` : ''}

        ${additionalContext.retrospectiveLearnings ? `
        Learnings from past retrospectives:
        ${additionalContext.retrospectiveLearnings.map(l => `- ${l.key_learning}`).join('\n')}
        ` : ''}

        Execute each migration file in order. If a migration fails:
        1. Analyze the error message
        2. Check if it's a known issue from the patterns above
        3. Apply the appropriate fix
        4. Retry the migration

        Do NOT give up on the first failure - try alternative approaches.
      `
    };

    console.log('   🗄️  DATABASE sub-agent context prepared, invoking...');

    // Invoke DATABASE sub-agent
    const result = await orchestrate('EXEC_IMPLEMENTATION', sd?.id || 'system', {
      specificSubAgent: 'DATABASE',
      triggerType: 'auto',
      autoRemediate: true,
      context
    });

    const success = result.status === 'PASS' || result.status === 'COMPLETE';

    return {
      success,
      status: result.status,
      method: 'database_subagent',
      details: result,
      error: success ? null : (result.error || result.message || `Sub-agent returned status: ${result.status}`)
    };
  } catch (orchestratorError) {
    // Fallback: Try direct migration execution (last resort)
    console.log('   ⚠️  DATABASE sub-agent orchestrator unavailable');
    console.log('   ℹ️  Attempting fallback direct execution (not recommended)...');

    try {
      return await executeDirectMigrations(supabase, pendingInfo);
    } catch (directError) {
      return {
        success: false,
        method: 'fallback_failed',
        error: `Orchestrator error: ${orchestratorError.message}; Direct execution error: ${directError.message}`
      };
    }
  }
}

/**
 * Direct migration execution - FALLBACK ONLY
 *
 * This should only be used when the DATABASE sub-agent is unavailable.
 * The DATABASE sub-agent is the preferred executor.
 */
async function executeDirectMigrations(supabase, pendingInfo) {
  console.log('   ⚠️  FALLBACK: Direct execution without DATABASE sub-agent');
  console.log('   ⚠️  This is not recommended - DATABASE sub-agent has better error handling');

  let executedCount = 0;
  let lastError = null;

  for (const file of pendingInfo.uncommittedFiles) {
    const filePath = path.join(PROJECT_ROOT, file);
    if (!existsSync(filePath)) {
      console.log(`   ⏭️  Skipping missing file: ${file}`);
      continue;
    }

    try {
      const sql = await readFile(filePath, 'utf-8');

      // Try exec_sql RPC
      const { error: execError } = await supabase.rpc('exec_sql', {
        sql_query: sql
      });

      if (execError) {
        lastError = `Failed to execute ${file}: ${execError.message}`;
        console.log(`   ❌ ${lastError}`);
        // Continue to try other files
      } else {
        executedCount++;
        console.log(`   ✅ Executed: ${file}`);
      }
    } catch (fileError) {
      lastError = `Error processing ${file}: ${fileError.message}`;
      console.log(`   ❌ ${lastError}`);
    }
  }

  if (executedCount === pendingInfo.uncommittedFiles.length) {
    return { success: true, method: 'direct_fallback', executedCount };
  } else if (executedCount > 0) {
    return {
      success: false,
      method: 'direct_fallback_partial',
      executedCount,
      error: `Only ${executedCount}/${pendingInfo.uncommittedFiles.length} migrations succeeded. ${lastError}`
    };
  } else {
    return {
      success: false,
      method: 'direct_fallback_failed',
      error: lastError || 'No migrations could be executed'
    };
  }
}

/**
 * Check for uncommitted SQL files in database/manual-updates
 * These are migration files that haven't been committed (likely just created)
 */
async function checkUncommittedManualUpdates() {
  const uncommitted = [];

  try {
    // Use git status to find untracked/modified SQL files
    const { stdout } = await execAsync('git status --porcelain database/manual-updates/', {
      cwd: PROJECT_ROOT,
      timeout: 10000
    });

    if (stdout.trim()) {
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        // Git status format: XY filename
        // ?? = untracked, M = modified, A = added
        const match = line.match(/^(\?\?|M|A)\s+(.+\.sql)$/);
        if (match) {
          uncommitted.push(match[2]);
        }
      }
    }
  } catch {
    // If git fails, fall back to checking file timestamps
    const manualUpdatesDir = path.join(PROJECT_ROOT, 'database', 'manual-updates');
    if (existsSync(manualUpdatesDir)) {
      const files = await readdir(manualUpdatesDir);
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

      for (const file of files) {
        if (file.endsWith('.sql') && file.includes(today)) {
          uncommitted.push(`database/manual-updates/${file}`);
        }
      }
    }
  }

  return uncommitted;
}

/**
 * Check for SD-specific migrations that haven't been executed
 */
async function checkSDPendingMigrations(supabase, sd) {
  const pending = [];

  if (!sd || !sd.sd_key) {
    return pending;
  }

  try {
    // Get SD search terms
    const sdKey = sd.sd_key;
    const sdIdLower = sdKey.replace('SD-', '').toLowerCase();
    const searchTerms = [sdIdLower, sdKey.toLowerCase()];

    // Check migration directories for SD-specific files
    const migrationDirs = [
      'database/migrations',
      'database/manual-updates',
      'supabase/migrations'
    ];

    for (const dir of migrationDirs) {
      const fullPath = path.join(PROJECT_ROOT, dir);
      if (!existsSync(fullPath)) continue;

      const files = await readdir(fullPath);
      for (const file of files) {
        if (!file.endsWith('.sql')) continue;

        const fileLower = file.toLowerCase();
        const isSDRelated = searchTerms.some(term =>
          fileLower.includes(term) ||
          fileLower.includes(term.replace(/-/g, '_'))
        );

        if (isSDRelated) {
          // Check if migration was executed
          const executed = await checkMigrationExecuted(supabase, file);
          if (!executed) {
            pending.push({
              file: `${dir}/${file}`,
              status: 'NOT_EXECUTED',
              sdKey
            });
          }
        }
      }
    }

    // Also check for migrations referenced in SD metadata
    if (sd.metadata?.pending_migrations) {
      for (const migration of sd.metadata.pending_migrations) {
        if (!pending.some(p => p.file.includes(migration))) {
          pending.push({
            file: migration,
            status: 'REFERENCED_IN_SD',
            sdKey
          });
        }
      }
    }
  } catch (error) {
    console.log(`   ⚠️  Could not check SD migrations: ${error.message}`);
  }

  return pending;
}

/**
 * Check if a migration has been executed in schema_migrations
 */
async function checkMigrationExecuted(supabase, filename) {
  try {
    // Extract version/timestamp from filename
    const versionMatch = filename.match(/^(\d{14}|\d{8}_?\d{0,6}|\d{8})/);
    if (!versionMatch) {
      // No version prefix - can't verify
      return null;
    }

    const version = versionMatch[1].replace('_', '');

    // Query schema_migrations table
    const { data, error } = await supabase
      .from('schema_migrations')
      .select('version, name')
      .limit(100);

    if (error) {
      // Table might not exist - can't verify
      return null;
    }

    if (!data || data.length === 0) {
      return false;
    }

    // Check if this version was executed
    return data.some(m => {
      const mVersion = (m.version || m.name || '').toString();
      return mVersion.includes(version) || version.includes(mVersion);
    });
  } catch {
    return null; // Unknown status
  }
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Display pre-handoff migration warnings (non-blocking)
 * Call this from BaseExecutor.setup() or executeSpecific()
 */
export async function displayMigrationWarnings(supabase, sd) {
  const result = await checkPendingMigrations(supabase, sd, { autoExecute: false });

  if (result.hasPendingMigrations) {
    console.log('\n   ⚠️  MIGRATION WARNING: Pending migrations detected');
    console.log('   The DATABASE sub-agent should be used to execute these migrations.');
    console.log('   Command: node scripts/execute-manual-migrations.js');
    console.log('');
  }

  return result;
}

export default {
  checkPendingMigrations,
  displayMigrationWarnings
};
