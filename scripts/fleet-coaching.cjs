/**
 * Fleet Coaching — Periodic Guidance for Active Workers
 *
 * Designed to run on a recurring loop: every 10 minutes via coordinator cron.
 *
 * Sends proactive coaching messages to active workers covering:
 * 1. WORKTREE_REMINDER — working on main branch with parallel sessions
 * 2. SMALL_PR_REMINDER — long-running EXEC sessions (possible scope creep)
 * 3. LEARN_REMINDER — SD near completion, remind to run /learn
 * 4. GATE_COMPLIANCE — repeated handoff failures
 * 5. SUBAGENT_ROUTING — database/test work should use sub-agents
 * 6. DEPENDENCY_UNLOCK — newly available SDs after blocker completed
 * 7. PRIORITY_REBALANCE — working on MED when HIGH is available
 * 8. AUTO_PROCEED_CHAINING — standing directive to keep auto-proceed and chaining on
 *
 * Anti-spam: 20-minute cooldown per coaching_type per worker.
 * Messages expire after 30 minutes (ephemeral advice).
 *
 * Safe to run repeatedly — fully idempotent.
 */

const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');

const supabase = createSupabaseServiceClient();

const COOLDOWN_MINUTES = 20;
const EXPIRE_MINUTES = 30;
const LONG_SESSION_MINUTES = 45;

// --- Helpers ---

async function wasRecentlySent(sessionId, coachingType) {
  const { data } = await supabase
    .from('session_coordination')
    .select('id')
    .eq('target_session', sessionId)
    .eq('message_type', 'COACHING')
    .gte('created_at', new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000).toISOString())
    .limit(10);

  // Check payload coaching_type in JS since Supabase JS client doesn't support ->>'key' filters well
  return (data || []).some(msg => {
    // We need to re-query with payload — but to avoid N+1, do a broader check
    return false; // Will refine below
  });
}

// More precise: query with payload filter
async function wasRecentlySentPrecise(sessionId, coachingType) {
  const cutoff = new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('session_coordination')
    .select('id, payload')
    .eq('target_session', sessionId)
    .eq('message_type', 'COACHING')
    .gte('created_at', cutoff)
    .limit(20);

  return (data || []).some(m => m.payload?.coaching_type === coachingType);
}

async function sendCoaching(sessionId, coachingType, subject, body, extraPayload = {}) {
  if (await wasRecentlySentPrecise(sessionId, coachingType)) {
    return false; // Cooldown active
  }

  const expiresAt = new Date(Date.now() + EXPIRE_MINUTES * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('session_coordination')
    .insert({
      target_session: sessionId,
      message_type: 'COACHING',
      subject,
      body,
      payload: { coaching_type: coachingType, ...extraPayload },
      sender_type: 'coaching',
      expires_at: expiresAt
    });

  return !error;
}

// --- Coaching Evaluators ---

function evaluateWorktreeReminder(session, activeCount) {
  // Only relevant when multiple workers are active
  if (activeCount < 2) return null;

  // If session is on main branch or has no branch info, it needs a worktree
  const branch = session.current_branch;
  if (!branch || branch === 'main' || branch === 'master') {
    return {
      subject: 'Working on main branch with ' + activeCount + ' parallel workers — use a worktree',
      body: 'You are on the main branch while ' + activeCount + ' workers are active. ' +
        'This risks git conflicts and corrupted node_modules.\n\n' +
        'REQUIRED: Create an isolated worktree for your SD:\n' +
        '  node scripts/resolve-sd-workdir.js ' + (session.sd_id || '<SD-ID>') + '\n\n' +
        'This gives you a dedicated copy of the repo. Do this BEFORE starting any code changes.'
    };
  }
  return null;
}

function evaluateSmallPRReminder(session, sdDetails) {
  // Only for sessions in EXEC phase that have been working for >45 minutes
  if (!sdDetails || sdDetails.current_phase !== 'EXEC') return null;

  const claimedAt = session.claimed_at ? new Date(session.claimed_at) : null;
  if (!claimedAt) return null;

  const minutesClaimed = (Date.now() - claimedAt.getTime()) / (1000 * 60);
  if (minutesClaimed < LONG_SESSION_MINUTES) return null;

  const duration = minutesClaimed < 60
    ? Math.round(minutesClaimed) + ' minutes'
    : (minutesClaimed / 60).toFixed(1) + ' hours';

  return {
    subject: 'Working on ' + session.sd_id + ' for ' + duration + ' — check PR size',
    body: 'LEO targets PRs at 100 LOC or less (max 400 with justification).\n\n' +
      'Run: git diff --stat\n\n' +
      'If your diff is growing beyond 100 LOC, consider:\n' +
      '1. Splitting into multiple PRs\n' +
      '2. Committing what you have and shipping the first PR\n' +
      '3. Deferring non-essential changes to a follow-up SD'
  };
}

function evaluateLearnReminder(session, sdDetails) {
  if (!sdDetails) return null;

  const nearComplete =
    sdDetails.progress_percentage >= 90 ||
    sdDetails.current_phase === 'EXEC_COMPLETE' ||
    sdDetails.status === 'pending_approval';

  if (!nearComplete) return null;

  return {
    subject: session.sd_id + ' is at ' + (sdDetails.progress_percentage || '?') + '% — remember /learn',
    body: 'Your SD appears near completion. When done:\n\n' +
      '1. Run /learn to generate the retrospective\n' +
      '2. The retrospective is REQUIRED for the quality gate\n' +
      '3. Skipping /learn causes RETROSPECTIVE_QUALITY_GATE failures\n\n' +
      'Do NOT move to the next SD until /learn completes successfully.'
  };
}

function evaluateGateCompliance(session) {
  const fails = session.handoff_fail_count || 0;
  if (fails < 2) return null;

  if (fails >= 5) {
    return {
      subject: session.sd_id + ' has ' + fails + ' gate failures — invoke /rca',
      body: 'Persistent handoff gate failures detected. Do NOT keep retrying the same approach.\n\n' +
        'REQUIRED: Invoke the RCA sub-agent:\n' +
        '  subagent_type="rca-agent"\n\n' +
        'Provide: symptom, location, prior attempts, desired outcome.\n' +
        'Common root causes: missing retrospective content, PRD boilerplate, test gaps.\n\n' +
        'Do NOT use --no-verify to bypass gates.'
    };
  }

  return {
    subject: session.sd_id + ' has ' + fails + ' gate failures — check root cause',
    body: 'You have ' + fails + ' handoff gate failures. Common causes:\n\n' +
      '1. Missing retrospective with SD-specific content (not boilerplate)\n' +
      '2. PRD missing required fields (executive_summary, functional_requirements, etc.)\n' +
      '3. Test coverage below threshold\n\n' +
      'Read the gate error output carefully before retrying.\n' +
      'Do NOT use --no-verify to bypass gates.\n' +
      'If stuck after 3+ failures, invoke /rca for root cause analysis.'
  };
}

function evaluateSubagentRouting(session, sdDetails) {
  if (!sdDetails || sdDetails.current_phase !== 'EXEC') return null;

  const fails = session.handoff_fail_count || 0;
  if (fails < 1) return null;

  // Check SD title/description for database-related keywords
  const text = ((sdDetails.title || '') + ' ' + (sdDetails.description || '')).toLowerCase();
  const dbKeywords = ['migration', 'schema', 'ddl', 'rls', 'trigger', 'enum', 'database', 'supabase', 'postgres'];
  const testKeywords = ['test', 'coverage', 'spec', 'e2e', 'unit test'];

  const isDbWork = dbKeywords.some(kw => text.includes(kw));
  const isTestWork = testKeywords.some(kw => text.includes(kw));

  if (!isDbWork && !isTestWork) return null;

  const agents = [];
  if (isDbWork) agents.push('database-agent (for migrations, DDL, RLS, triggers)');
  if (isTestWork) agents.push('testing-agent (for test creation and coverage)');

  return {
    subject: 'Use specialized sub-agents for ' + session.sd_id,
    body: 'Your SD involves ' + (isDbWork ? 'database' : 'testing') + ' work and has gate failures.\n\n' +
      'Use specialized sub-agents instead of manual implementation:\n' +
      agents.map(a => '  - ' + a).join('\n') + '\n\n' +
      'Sub-agents have domain expertise and follow LEO patterns correctly.\n' +
      'Manual infrastructure implementation is an anti-pattern.'
  };
}

function evaluateDependencyUnlock(session, recentCompletions, allSDs, activeClaims) {
  // Find SDs that were blocked but are now unblocked due to recent completions
  const completedKeys = new Set(recentCompletions.map(sd => sd.sd_key));
  if (completedKeys.size === 0) return null;

  const newlyUnblocked = allSDs.filter(sd => {
    if (sd.status === 'completed') return false;
    if (activeClaims.has(sd.sd_key)) return false;
    if (!sd.dependencies || !Array.isArray(sd.dependencies)) return false;
    // Has at least one dependency that just completed
    const hasNewDep = sd.dependencies.some(dep => completedKeys.has(dep));
    // All dependencies now met
    const allMet = sd.dependencies.every(dep => {
      const depSD = allSDs.find(s => s.sd_key === dep);
      return depSD && depSD.status === 'completed';
    });
    return hasNewDep && allMet;
  });

  if (newlyUnblocked.length === 0) return null;

  const sdList = newlyUnblocked.map(sd => sd.sd_key + ' (' + (sd.priority || 'med') + ')').join(', ');

  return {
    subject: newlyUnblocked.length + ' SD(s) just unblocked — available for work',
    body: 'Recent completions have unblocked new SDs:\n\n' +
      newlyUnblocked.map(sd => '  - ' + sd.sd_key + ': ' + (sd.title || '').substring(0, 60)).join('\n') + '\n\n' +
      'When you finish your current SD, consider picking up one of these.\n' +
      'Run: /claim to see all available work.',
    extra: { unblocked_sds: newlyUnblocked.map(sd => sd.sd_key) }
  };
}

function evaluatePriorityRebalance(session, sdDetails, availableSDs) {
  if (!sdDetails) return null;

  // Don't suggest switching if already in EXEC or near completion
  if (sdDetails.current_phase === 'EXEC' && (sdDetails.progress_percentage || 0) > 20) return null;
  if ((sdDetails.progress_percentage || 0) > 80) return null;

  const currentPriority = (sdDetails.priority || 'medium').toLowerCase();
  if (currentPriority === 'high' || currentPriority === 'critical') return null;

  // Find unclaimed HIGH/CRITICAL SDs
  const highAvailable = availableSDs.filter(sd =>
    (sd.priority || '').toLowerCase() === 'high' || (sd.priority || '').toLowerCase() === 'critical'
  );

  if (highAvailable.length === 0) return null;

  return {
    subject: highAvailable.length + ' HIGH priority SD(s) available — you are on ' + currentPriority,
    body: 'You are working on ' + session.sd_id + ' (priority: ' + currentPriority + ').\n\n' +
      'Higher priority SDs are unclaimed:\n' +
      highAvailable.slice(0, 5).map(sd => '  - ' + sd.sd_key + ' (' + sd.priority + '): ' + (sd.title || '').substring(0, 50)).join('\n') + '\n\n' +
      'Consider finishing your current SD quickly, or if early in the process, switching to a HIGH priority item.',
    extra: { high_available: highAvailable.map(sd => sd.sd_key) }
  };
}

function evaluateAutoProceedChaining() {
  // Always fires for every active worker — this is a standing directive
  return {
    subject: 'Ensure AUTO-PROCEED=ON and CHAINING=ON',
    body: 'STANDING DIRECTIVE: Your session MUST have these settings active:\n\n' +
      '1. AUTO-PROCEED: ON (default). Phases transition automatically without prompts.\n' +
      '2. CHAINING: ON. After completing an SD and running /learn, auto-chain to the next SD.\n\n' +
      'To verify: Check sd:next output for SESSION_SETTINGS line.\n' +
      'Expected: {"auto_proceed":true,"chain_orchestrators":true}\n\n' +
      'WHY: Workers that exit after completing an SD waste fleet capacity. With chaining ON, ' +
      'you automatically pick up the next available SD after /learn completes. ' +
      'Do NOT pause, ask "what next?", or exit after SD completion.'
  };
}

// --- Main ---

async function main() {
  const now = new Date();
  const sent = [];
  const skipped = [];

  // 1. Load active sessions with SD claims
  // v_active_sessions lacks handoff_fail_count/has_uncommitted_changes — query base table
  const { data: sessions, error: sessErr } = await supabase
    .from('claude_sessions')
    .select('session_id, sd_id, tty, current_branch, claimed_at, handoff_fail_count, has_uncommitted_changes, current_phase, heartbeat_at')
    .not('sd_id', 'is', null)
    .in('status', ['active', 'idle'])
    .order('heartbeat_at', { ascending: false });

  if (sessErr) {
    console.log('ERROR: Failed to query sessions — ' + sessErr.message);
    process.exit(1);
  }

  // Filter to sessions with recent heartbeat (< 5 min)
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const activeSessions = (sessions || []).filter(s =>
    s.heartbeat_at && new Date(s.heartbeat_at).getTime() > fiveMinAgo
  );
  if (activeSessions.length === 0) {
    console.log('[' + now.toLocaleTimeString() + '] COACHING: No active workers. Nothing to coach.');
    return;
  }

  // 2. Load SD details for all claimed SDs
  const claimedSdKeys = [...new Set(activeSessions.map(s => s.sd_id).filter(Boolean))];
  const { data: sdData } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, description, status, current_phase, progress_percentage, priority, dependencies, claiming_session_id')
    .in('sd_key', claimedSdKeys);

  const sdMap = {};
  (sdData || []).forEach(sd => { sdMap[sd.sd_key] = sd; });

  // 3. Load all pending SDs (for dependency unlock and priority rebalance)
  const { data: allPendingSDs } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, status, current_phase, progress_percentage, priority, dependencies')
    .in('status', ['draft', 'in_progress', 'ready', 'pending_approval', 'completed'])
    .limit(100);

  const allSDs = allPendingSDs || [];
  const activeClaims = new Set(activeSessions.map(s => s.sd_id));

  // 4. Find recently completed SDs (last 15 minutes) for dependency unlock
  const recentCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: recentCompletions } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, completion_date')
    .eq('status', 'completed')
    .gte('completion_date', recentCutoff);

  // 5. Compute available SDs (unclaimed, deps met)
  const completedKeys = new Set(allSDs.filter(sd => sd.status === 'completed').map(sd => sd.sd_key));
  const availableSDs = allSDs.filter(sd => {
    if (sd.status === 'completed') return false;
    if (activeClaims.has(sd.sd_key)) return false;
    if (sd.dependencies && Array.isArray(sd.dependencies) && sd.dependencies.length > 0) {
      if (!sd.dependencies.every(dep => completedKeys.has(dep))) return false;
    }
    return true;
  });

  // 6. Evaluate coaching for each active worker
  for (const session of activeSessions) {
    const sdDetails = sdMap[session.sd_id];

    // WORKTREE_REMINDER
    const worktree = evaluateWorktreeReminder(session, activeSessions.length);
    if (worktree) {
      const ok = await sendCoaching(session.session_id, 'WORKTREE_REMINDER', worktree.subject, worktree.body, { sd_id: session.sd_id });
      (ok ? sent : skipped).push({ session: session.tty, type: 'WORKTREE_REMINDER' });
    }

    // SMALL_PR_REMINDER
    const smallPR = evaluateSmallPRReminder(session, sdDetails);
    if (smallPR) {
      const ok = await sendCoaching(session.session_id, 'SMALL_PR_REMINDER', smallPR.subject, smallPR.body, { sd_id: session.sd_id });
      (ok ? sent : skipped).push({ session: session.tty, type: 'SMALL_PR_REMINDER' });
    }

    // LEARN_REMINDER
    const learn = evaluateLearnReminder(session, sdDetails);
    if (learn) {
      const ok = await sendCoaching(session.session_id, 'LEARN_REMINDER', learn.subject, learn.body, { sd_id: session.sd_id });
      (ok ? sent : skipped).push({ session: session.tty, type: 'LEARN_REMINDER' });
    }

    // GATE_COMPLIANCE
    const gate = evaluateGateCompliance(session);
    if (gate) {
      const ok = await sendCoaching(session.session_id, 'GATE_COMPLIANCE', gate.subject, gate.body, { sd_id: session.sd_id, fails: session.handoff_fail_count });
      (ok ? sent : skipped).push({ session: session.tty, type: 'GATE_COMPLIANCE' });
    }

    // SUBAGENT_ROUTING
    const subagent = evaluateSubagentRouting(session, sdDetails);
    if (subagent) {
      const ok = await sendCoaching(session.session_id, 'SUBAGENT_ROUTING', subagent.subject, subagent.body, { sd_id: session.sd_id });
      (ok ? sent : skipped).push({ session: session.tty, type: 'SUBAGENT_ROUTING' });
    }

    // DEPENDENCY_UNLOCK (broadcast to all active workers)
    const unlock = evaluateDependencyUnlock(session, recentCompletions || [], allSDs, activeClaims);
    if (unlock) {
      const ok = await sendCoaching(session.session_id, 'DEPENDENCY_UNLOCK', unlock.subject, unlock.body, unlock.extra);
      (ok ? sent : skipped).push({ session: session.tty, type: 'DEPENDENCY_UNLOCK' });
    }

    // PRIORITY_REBALANCE
    const rebalance = evaluatePriorityRebalance(session, sdDetails, availableSDs);
    if (rebalance) {
      const ok = await sendCoaching(session.session_id, 'PRIORITY_REBALANCE', rebalance.subject, rebalance.body, rebalance.extra);
      (ok ? sent : skipped).push({ session: session.tty, type: 'PRIORITY_REBALANCE' });
    }

    // AUTO_PROCEED_CHAINING (standing directive — fires every cycle for every worker)
    const autoProceed = evaluateAutoProceedChaining();
    if (autoProceed) {
      const ok = await sendCoaching(session.session_id, 'AUTO_PROCEED_CHAINING', autoProceed.subject, autoProceed.body, { sd_id: session.sd_id });
      (ok ? sent : skipped).push({ session: session.tty, type: 'AUTO_PROCEED_CHAINING' });
    }
  }

  // 7. Output summary
  console.log('');
  console.log('=== FLEET COACHING [' + now.toLocaleTimeString() + '] ===');
  console.log('');
  console.log('ACTIVE WORKERS: ' + activeSessions.length);
  activeSessions.forEach(s => {
    const sd = sdMap[s.sd_id];
    const phase = sd ? sd.current_phase : '?';
    const pct = sd ? (sd.progress_percentage || 0) + '%' : '?';
    console.log('  ' + (s.tty || '?').padEnd(12) + (s.sd_id || '?').padEnd(45) + phase.padEnd(10) + pct);
  });
  console.log('');

  if (sent.length > 0) {
    console.log('COACHING SENT (' + sent.length + '):');
    sent.forEach(s => console.log('  > ' + (s.session || '?').padEnd(12) + s.type));
    console.log('');
  }

  if (skipped.length > 0) {
    console.log('SKIPPED (cooldown active) (' + skipped.length + '):');
    skipped.forEach(s => console.log('  - ' + (s.session || '?').padEnd(12) + s.type));
    console.log('');
  }

  if (sent.length === 0 && skipped.length === 0) {
    console.log('No coaching needed this cycle — all workers on track.');
    console.log('');
  }

  // Summary stats
  const typeCount = {};
  sent.forEach(s => { typeCount[s.type] = (typeCount[s.type] || 0) + 1; });
  if (Object.keys(typeCount).length > 0) {
    console.log('SUMMARY:');
    Object.entries(typeCount).forEach(([type, count]) => {
      console.log('  ' + type.padEnd(25) + count + ' worker(s)');
    });
    console.log('');
  }

  console.log('=== COACHING COMPLETE ===');
}

main().catch(err => {
  console.error('COACHING FATAL:', err.message);
  process.exit(1);
});
