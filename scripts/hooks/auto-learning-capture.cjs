#!/usr/bin/env node
/**
 * Auto-Learning Capture Hook
 * SD-LEO-SELF-IMPROVE-001D - Automated Learning Capture for Non-SD Sessions
 *
 * PostToolUse hook for Bash tool that detects non-SD PR merges
 * and automatically creates retrospectives and issue patterns.
 *
 * Hook Type: PostToolUse (matcher: Bash, pattern: gh pr merge)
 *
 * The Problem:
 * Sessions that don't go through full SD workflow have no mechanism to capture learnings.
 * Valuable insights from documentation fixes, ad-hoc improvements, and polish sessions are lost.
 *
 * The Solution:
 * Automatically detect when non-SD work is shipped and capture learnings without manual steps.
 *
 * Detection Strategy (Database-First, Survives Branch Deletion):
 * 1. Check claude_sessions.sd_id for active SD claim
 * 2. Check sd_claims for recently released SD
 * 3. Check quick_fixes for in-progress QF
 * 4. Check is_working_on flag
 * 5. Grep commit messages for SD-xxx/QF-xxx references
 *
 * Created: 2026-02-01
 */

const path = require('path');
const { spawn } = require('child_process');

// Configuration
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer';
const LOG_LEVEL = process.env.AUTO_LEARNING_LOG_LEVEL || 'info';

// Log level hierarchy
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT_LOG_LEVEL = LOG_LEVELS[LOG_LEVEL] || 2;

/**
 * Structured logging function
 */
function log(level, event, data = {}) {
  if (LOG_LEVELS[level] > CURRENT_LOG_LEVEL) return;

  const logEntry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    event,
    ...data
  };

  const prefix = `[auto-learning-capture]`;
  if (level === 'error') {
    console.error(`${prefix} ${JSON.stringify(logEntry)}`);
  } else {
    console.log(`${prefix} ${JSON.stringify(logEntry)}`);
  }
}

/**
 * Extract PR number from gh pr merge command or output
 * @param {string} command - The command that was executed
 * @param {string} output - The command output
 * @returns {string|null} PR number if found
 */
function extractPRNumber(command, output) {
  // Try to extract from command: gh pr merge 123 or gh pr merge #123
  const cmdMatch = command.match(/gh\s+pr\s+merge\s+#?(\d+)/);
  if (cmdMatch) {
    return cmdMatch[1];
  }

  // Try to extract from output
  const outputMatches = [
    /Merged\s+pull\s+request\s+#(\d+)/i,
    /PR\s+#?(\d+)/i,
    /pull\/(\d+)/
  ];

  for (const pattern of outputMatches) {
    const match = output.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Detect if the merge was successful
 * @param {string} output - Command output
 * @returns {boolean}
 */
function isMergeSuccessful(output) {
  const successIndicators = [
    /Merged/i,
    /Pull request.*merged/i,
    /Successfully merged/i,
    /deleted.*branch/i
  ];

  return successIndicators.some(pattern => pattern.test(output));
}

/**
 * Check if this work is SD/QF-related via database queries
 * Returns true if SD/QF work is detected (skip auto-capture)
 * @returns {Promise<{isSDWork: boolean, source: string|null, sdId: string|null}>}
 */
async function checkSDWorkStatus() {
  try {
    // Dynamic import for ESM modules
    const dotenv = await import('dotenv');
    dotenv.config({ path: path.join(PROJECT_DIR, '.env') });

    const { createClient } = await import('@supabase/supabase-js');

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      log('warn', 'missing_supabase_credentials', { action: 'skip_db_check' });
      return { isSDWork: false, source: null, sdId: null };
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Query 1: Check v_active_sessions for active SD claim
    const { data: activeSessions } = await supabase
      .from('v_active_sessions')
      .select('sd_id, session_id, computed_status')
      .in('computed_status', ['active', 'idle'])
      .not('sd_id', 'is', null)
      .limit(1)
      .maybeSingle();

    if (activeSessions?.sd_id) {
      log('info', 'sd_work_detected', { source: 'active_session', sd_id: activeSessions.sd_id });
      return { isSDWork: true, source: 'active_session', sdId: activeSessions.sd_id };
    }

    // Query 2: Check sd_claims for recently released SD (within 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentRelease } = await supabase
      .from('sd_claims')
      .select('sd_id')
      .eq('release_reason', 'completed')
      .gte('released_at', tenMinutesAgo)
      .order('released_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentRelease?.sd_id) {
      log('info', 'sd_work_detected', { source: 'recent_release', sd_id: recentRelease.sd_id });
      return { isSDWork: true, source: 'recent_release', sdId: recentRelease.sd_id };
    }

    // Query 3: Check for active Quick Fix
    const { data: activeQF } = await supabase
      .from('quick_fixes')
      .select('id, qf_key')
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeQF?.id) {
      log('info', 'qf_work_detected', { source: 'active_qf', qf_id: activeQF.qf_key || activeQF.id });
      return { isSDWork: true, source: 'active_qf', sdId: activeQF.qf_key || activeQF.id };
    }

    // Query 4: Check is_working_on flag
    const { data: workingOn } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key')
      .eq('is_working_on', true)
      .limit(1)
      .maybeSingle();

    if (workingOn?.id) {
      log('info', 'sd_work_detected', { source: 'is_working_on', sd_id: workingOn.sd_key || workingOn.id });
      return { isSDWork: true, source: 'is_working_on', sdId: workingOn.sd_key || workingOn.id };
    }

    return { isSDWork: false, source: null, sdId: null };
  } catch (error) {
    log('error', 'db_check_failed', { error: error.message });
    // On error, assume it might be SD work to avoid duplicate captures
    return { isSDWork: false, source: 'error', sdId: null };
  }
}

/**
 * Check commit messages for SD/QF references
 * @param {string} prNumber - PR number to check
 * @returns {Promise<string|null>} SD/QF ID if found
 */
async function checkCommitMessages(prNumber) {
  return new Promise((resolve) => {
    // Use gh CLI to get PR commits
    const child = spawn('gh', ['pr', 'view', prNumber, '--json', 'commits,title,body'], {
      cwd: PROJECT_DIR,
      shell: true
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        log('warn', 'gh_pr_view_failed', { pr: prNumber, error: errorOutput });
        resolve(null);
        return;
      }

      try {
        const prData = JSON.parse(output);

        // Check title and body
        const titleAndBody = `${prData.title || ''} ${prData.body || ''}`;

        // Check commit messages
        const commitMessages = (prData.commits || [])
          .map(c => c.messageHeadline || c.message || '')
          .join(' ');

        const allText = `${titleAndBody} ${commitMessages}`;

        // Look for SD-* or QF-* patterns
        const sdMatch = allText.match(/SD-[A-Z0-9][-A-Z0-9]+/i);
        if (sdMatch) {
          resolve(sdMatch[0].toUpperCase());
          return;
        }

        const qfMatch = allText.match(/QF-[A-Z0-9][-A-Z0-9]+/i);
        if (qfMatch) {
          resolve(qfMatch[0].toUpperCase());
          return;
        }

        resolve(null);
      } catch (e) {
        log('warn', 'pr_data_parse_failed', { pr: prNumber, error: e.message });
        resolve(null);
      }
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      child.kill();
      resolve(null);
    }, 5000);
  });
}

/**
 * Spawn the learning capture engine for non-SD work
 * @param {string} prNumber - PR number
 */
function spawnLearningCapture(prNumber) {
  const captureScript = path.join(PROJECT_DIR, 'scripts', 'auto-learning-capture.js');

  log('info', 'spawning_capture_engine', { pr: prNumber, script: captureScript });

  // Spawn as detached process so it doesn't block the hook
  const child = spawn('node', [captureScript, '--pr', prNumber], {
    cwd: PROJECT_DIR,
    stdio: 'ignore',
    detached: true,
    shell: true
  });

  child.unref();

  // Output notification for Claude to see
  console.log('\n');
  console.log('========================================');
  console.log('  AUTO-LEARNING CAPTURE TRIGGERED');
  console.log('========================================');
  console.log(`   PR: #${prNumber}`);
  console.log('   Status: Non-SD work detected');
  console.log('   Action: Capturing learning automatically');
  console.log('========================================');
  console.log('');
}

/**
 * Process hook input
 * @param {Object} hookInput - PostToolUse hook input
 */
async function processHookInput(hookInput) {
  const toolName = hookInput.tool_name || '';
  const toolInput = hookInput.tool_input || {};
  const toolResult = hookInput.tool_result || hookInput.result || '';

  // Only process Bash tool
  if (toolName !== 'Bash') {
    return;
  }

  const command = toolInput.command || '';
  const output = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult || '');

  // Check if this is a gh pr merge command
  if (!command.includes('gh') || !command.includes('pr') || !command.includes('merge')) {
    return;
  }

  log('debug', 'detected_merge_command', { command: command.substring(0, 100) });

  // Check if merge was successful
  if (!isMergeSuccessful(output)) {
    log('debug', 'merge_not_successful', { output: output.substring(0, 200) });
    return;
  }

  // Extract PR number
  const prNumber = extractPRNumber(command, output);
  if (!prNumber) {
    log('warn', 'pr_number_not_found', { command: command.substring(0, 100) });
    return;
  }

  log('info', 'merge_detected', { pr: prNumber });

  // Check database for SD/QF work (parallel with commit check)
  const [dbStatus, commitSD] = await Promise.all([
    checkSDWorkStatus(),
    checkCommitMessages(prNumber)
  ]);

  // If SD/QF work detected, skip auto-capture (existing flow handles)
  if (dbStatus.isSDWork) {
    log('info', 'skipping_auto_capture', {
      reason: 'sd_qf_work_detected',
      source: dbStatus.source,
      sd_id: dbStatus.sdId
    });
    console.log(`[auto-learning-capture] Skipping: SD/QF work detected (${dbStatus.sdId})`);
    return;
  }

  if (commitSD) {
    log('info', 'skipping_auto_capture', {
      reason: 'sd_qf_in_commit',
      sd_id: commitSD
    });
    console.log(`[auto-learning-capture] Skipping: SD/QF reference in commits (${commitSD})`);
    return;
  }

  // This is non-SD work - trigger auto-capture
  log('info', 'non_sd_work_detected', { pr: prNumber });
  spawnLearningCapture(prNumber);
}

/**
 * Main hook execution - reads from stdin
 */
function main() {
  let input = '';

  process.stdin.setEncoding('utf8');

  process.stdin.on('data', chunk => {
    input += chunk;
  });

  process.stdin.on('end', async () => {
    try {
      if (input.trim()) {
        const hookInput = JSON.parse(input);
        await processHookInput(hookInput);
      }
    } catch (e) {
      log('error', 'hook_error', { error: e.message });
    }
    process.exit(0);
  });

  // Handle case where stdin is closed immediately
  process.stdin.on('error', () => {
    process.exit(0);
  });

  // Timeout after 15 seconds (allow time for DB queries)
  setTimeout(async () => {
    if (input.trim()) {
      try {
        const hookInput = JSON.parse(input);
        await processHookInput(hookInput);
      } catch (_e) {
        // Silently fail in timeout
      }
    }
    process.exit(0);
  }, 15000);
}

main();
