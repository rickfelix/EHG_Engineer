/**
 * Stale Session Sweep — Automated Conflict Resolution & Coordination
 *
 * Designed to run on a recurring loop: /loop 5m node scripts/stale-session-sweep.cjs
 *
 * What it does:
 * 1. Scans all sessions with active SD claims
 * 2. Detects stale sessions (heartbeat > threshold)
 * 3. Checks PID liveness for same-host sessions
 * 4. Auto-releases dead claims (stale + PID dead)
 * 5. Detects duplicate claims on the same SD (conflicts)
 * 6. Writes coordination messages for active sessions
 * 7. Outputs a summary to stdout
 *
 * Safe to run repeatedly — fully idempotent.
 */

const os = require('os');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STALE_THRESHOLD_SECONDS = parseInt(process.env.STALE_SESSION_THRESHOLD_SECONDS, 10) || 300;
const LOCAL_HOSTNAME = os.hostname();

function isProcessRunning(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err.code === 'ESRCH') return false;
    if (err.code === 'EPERM') return true; // exists but no permission
    return false;
  }
}

function bar(pct, width = 20) {
  const filled = Math.round((pct / 100) * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

async function main() {
  const now = new Date();
  const actions = [];
  const warnings = [];
  const conflictEvicted = [];

  // 1. Get all sessions with SD claims
  const { data: sessions, error: sessErr } = await supabase
    .from('v_active_sessions')
    .select('session_id, sd_id, sd_title, heartbeat_age_seconds, heartbeat_age_human, computed_status, hostname, tty, pid, track')
    .not('sd_id', 'is', null)
    .order('heartbeat_age_seconds', { ascending: true });

  if (sessErr) {
    console.log('ERROR: Failed to query sessions — ' + sessErr.message);
    process.exit(1);
  }

  if (!sessions || sessions.length === 0) {
    console.log('[' + now.toLocaleTimeString() + '] SWEEP: No sessions with claims. All clear.');
    return;
  }

  // 2. Classify each session
  // NOTE: PID checks are unreliable on Windows — claude_sessions stores the PID
  // of a bash child process, not the parent node.exe. These child PIDs are ephemeral
  // and appear dead even when the session is actively running.
  // Classification uses HEARTBEAT AGE ONLY as the liveness signal.
  const VERY_STALE_SECONDS = STALE_THRESHOLD_SECONDS * 3; // 15min = definitely dead
  const classified = sessions.map(s => {
    const isStale = s.heartbeat_age_seconds > STALE_THRESHOLD_SECONDS;
    const isVeryStale = s.heartbeat_age_seconds > VERY_STALE_SECONDS;

    let status;
    if (!isStale) {
      status = 'ACTIVE';
    } else if (isVeryStale) {
      status = 'DEAD'; // No heartbeat for 15min+ = definitely gone
    } else {
      status = 'STALE_UNKNOWN'; // Between 5-15min = might be busy/compacting
    }

    return { ...s, isStale, status };
  });

  // 3. Detect conflicts (multiple sessions claiming same SD)
  const bySD = {};
  classified.forEach(s => {
    if (!bySD[s.sd_id]) bySD[s.sd_id] = [];
    bySD[s.sd_id].push(s);
  });

  const conflicts = Object.entries(bySD).filter(([, arr]) => arr.length > 1);

  // 3b. QA — detect sessions working on completed SDs
  const claimedSdKeys = [...new Set(classified.map(s => s.sd_id).filter(Boolean))];
  const { data: claimedSdStatus } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, status, completion_date')
    .in('sd_key', claimedSdKeys);

  const sdStatusMap = {};
  (claimedSdStatus || []).forEach(sd => { sdStatusMap[sd.sd_key] = sd; });

  const workingOnCompleted = classified.filter(s => {
    const sd = sdStatusMap[s.sd_id];
    return sd && sd.status === 'completed';
  });

  for (const s of workingOnCompleted) {
    // Use 'released' not 'idle' — stale sessions can't become 'idle' due to
    // idx_claude_sessions_unique_terminal_active (one active/idle per terminal).
    // Using 'idle' silently fails when another session on the same terminal exists.
    const targetStatus = s.status === 'ACTIVE' ? 'idle' : 'released';
    const { error } = await supabase
      .from('claude_sessions')
      .update({
        sd_id: null,
        status: targetStatus,
        released_at: now.toISOString(),
        released_reason: 'SWEEP_SD_ALREADY_COMPLETED'
      })
      .eq('session_id', s.session_id);

    if (!error) {
      // Also clear claiming_session_id on the SD to break the churn loop
      await supabase
        .from('strategic_directives_v2')
        .update({ claiming_session_id: null, is_working_on: false })
        .eq('sd_key', s.sd_id);
      actions.push('QA: released ' + s.session_id + ' (' + s.tty + ') — ' + s.sd_id + ' already completed');
    }
  }

  // 3c. QA — detect sessions claiming SDs that don't exist
  const orphanedClaims = classified.filter(s => !sdStatusMap[s.sd_id]);
  for (const s of orphanedClaims) {
    const targetStatus = s.status === 'ACTIVE' ? 'idle' : 'released';
    const { error } = await supabase
      .from('claude_sessions')
      .update({
        sd_id: null,
        status: targetStatus,
        released_at: now.toISOString(),
        released_reason: 'SWEEP_ORPHANED_CLAIM'
      })
      .eq('session_id', s.session_id);

    if (!error) {
      actions.push('QA: released ' + s.session_id + ' (' + s.tty + ') — SD ' + s.sd_id + ' not found in DB');
    }
  }

  // 3d. QA — detect SDs stuck in pending_approval with no claiming session
  const pendingApproval = (claimedSdStatus || []).filter(sd => sd.status === 'pending_approval');
  // Also check standalone SDs not already in claimedSdStatus
  const claimedKeys = new Set((claimedSdStatus || []).map(sd => sd.sd_key));
  const { data: allPendingApproval } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, status, current_phase, progress_percentage, completion_date')
    .eq('status', 'pending_approval');

  const activeClaimSdIds = new Set(classified.filter(s => s.status === 'ACTIVE').map(s => s.sd_id));
  const stuckApproval = (allPendingApproval || []).filter(sd => !activeClaimSdIds.has(sd.sd_key));

  for (const sd of stuckApproval) {
    // FIX #1: STUCK_100 — if at 100% with completion_date, mark completed instead of resetting
    if (sd.progress_percentage >= 100 && sd.completion_date) {
      const { error } = await supabase
        .from('strategic_directives_v2')
        .update({
          status: 'completed',
          claiming_session_id: null,
          is_working_on: false
        })
        .eq('sd_key', sd.sd_key)
        .select();

      if (!error) {
        actions.push('QA: completed ' + sd.sd_key + ' — was stuck at 100%/pending_approval with completion_date');
      }
    } else {
      const { error } = await supabase
        .from('strategic_directives_v2')
        .update({
          status: 'draft',
          current_phase: 'LEAD',
          progress_percentage: 0,
          claiming_session_id: null,
          is_working_on: false
        })
        .eq('sd_key', sd.sd_key);

      if (!error) {
        actions.push('QA: reset ' + sd.sd_key + ' from pending_approval → draft/LEAD/0% (no session working on it)');
      }
    }
  }

  // FIX #2: Proactively clear stale claiming_session_id on completed SDs to prevent churn
  const { data: completedWithClaims } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, claiming_session_id, is_working_on')
    .eq('status', 'completed')
    .not('claiming_session_id', 'is', null);

  for (const sd of (completedWithClaims || [])) {
    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({ claiming_session_id: null, is_working_on: false })
      .eq('sd_key', sd.sd_key)
      .select();

    if (!error) {
      actions.push('QA: cleared stale claiming_session_id on completed ' + sd.sd_key);
    }
  }

  // 3e. QA — detect and auto-enrich bare-shell SDs (FIX #6)
  const { data: pendingSDs } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, description, scope')
    .in('status', ['draft', 'ready'])
    .not('sd_key', 'like', '%ORCH-STAGE-VENTURE-WORKFLOW-001-%');
  const bareShellSDs = (pendingSDs || []).filter(sd => {
    if (sd.description && sd.description.startsWith('Child SD of')) return false;
    return !sd.description || sd.description === sd.title || (sd.description.length < 100 && sd.scope === sd.title);
  });
  if (bareShellSDs.length > 0) {
    const fs = require('fs');
    const path = require('path');
    const repoRoot = path.resolve(__dirname, '..');
    const searchDirs = ['docs/audits', 'docs/plans', 'brainstorm'].map(d => path.join(repoRoot, d));

    for (const sd of bareShellSDs) {
      // Try to find matching content in docs/audits, docs/plans, brainstorm
      const keywords = sd.title.toLowerCase().split(/[\s\-_]+/).filter(w => w.length > 3);
      let bestMatch = null;
      let bestScore = 0;

      for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
        for (const file of files) {
          const nameLower = file.toLowerCase();
          const score = keywords.filter(kw => nameLower.includes(kw)).length;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = path.join(dir, file);
          }
        }
      }

      if (bestMatch && bestScore >= 2) {
        // Read up to 2000 chars from the matching file for description enrichment
        const content = fs.readFileSync(bestMatch, 'utf8').substring(0, 2000);
        // Extract first paragraph or summary section
        const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
        const summary = lines.slice(0, 10).join('\n').substring(0, 500);

        if (summary.length > 50) {
          const { error } = await supabase
            .from('strategic_directives_v2')
            .update({
              description: sd.title + '\n\n' + summary + '\n\n[Auto-enriched by sweep from ' + path.basename(bestMatch) + ']'
            })
            .eq('sd_key', sd.sd_key)
            .select();

          if (!error) {
            actions.push('ENRICH: ' + sd.sd_key + ' — description populated from ' + path.basename(bestMatch));
          } else {
            warnings.push('BARE_SHELL: ' + sd.sd_key + ' — enrichment failed: ' + error.message);
          }
        } else {
          warnings.push('BARE_SHELL: ' + sd.sd_key + ' — found ' + path.basename(bestMatch) + ' but content too short');
        }
      } else {
        warnings.push('BARE_SHELL: ' + sd.sd_key + ' has no real description — no matching docs found');
      }
    }
  }

  // 4. Auto-release dead sessions
  const dead = classified.filter(s => s.status === 'DEAD');
  for (const s of dead) {
    const { error } = await supabase
      .from('claude_sessions')
      .update({
        sd_id: null,
        status: 'released',
        released_at: now.toISOString(),
        released_reason: 'SWEEP_PID_DEAD'
      })
      .eq('session_id', s.session_id);

    if (error) {
      actions.push('FAILED to release ' + s.session_id + ' (' + s.sd_id + '): ' + error.message);
    } else {
      actions.push('RELEASED ' + s.session_id + ' — PID ' + s.pid + ' dead — freed ' + s.sd_id);
    }
  }

  // 5. Resolve conflicts — keep freshest, release ALL others (including active)
  for (const [sdId, claimants] of conflicts) {
    const sorted = claimants.sort((a, b) => a.heartbeat_age_seconds - b.heartbeat_age_seconds);
    const keeper = sorted[0];
    const evictees = sorted.slice(1);

    for (const evict of evictees) {
      // Skip if already released in step 4
      if (dead.find(d => d.session_id === evict.session_id)) continue;

      const targetStatus = evict.status === 'ACTIVE' ? 'idle' : 'released';
      const { error } = await supabase
        .from('claude_sessions')
        .update({
          sd_id: null,
          status: targetStatus,
          released_at: now.toISOString(),
          released_reason: 'SWEEP_CONFLICT_RESOLUTION'
        })
        .eq('session_id', evict.session_id);

      if (!error) {
        const tag = evict.status === 'ACTIVE' ? ' (was active)' : '';
        actions.push('CONFLICT on ' + sdId + ': released ' + evict.session_id + tag + ' (kept ' + keeper.session_id + ')');

        // Send coordination message to the evicted session so it picks up other work
        conflictEvicted.push(evict);
      }
    }
  }

  // 6. Send coordination messages to active sessions
  // Load BOTH orchestrator children AND all pending standalone SDs
  const [childRes, standaloneRes] = await Promise.all([
    supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, status, current_phase, progress_percentage, dependencies')
      .like('sd_key', 'SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-%')
      .order('sd_key', { ascending: true }),
    supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, status, current_phase, progress_percentage, dependencies, priority')
      .in('status', ['draft', 'in_progress', 'ready', 'pending_approval'])
      .not('sd_key', 'like', 'SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001%')
      .limit(20)
  ]);

  const children = childRes.data || [];
  const standaloneSDs = standaloneRes.data || [];
  const allSDs = [...children, ...standaloneSDs];

  // Dependency-aware availability: only suggest SDs whose deps are all completed
  const completedKeys = new Set(allSDs.filter(c => c.status === 'completed').map(c => c.sd_key));
  const claimedByActive = new Set(classified.filter(s => s.status === 'ACTIVE').map(s => s.sd_id));

  const available = allSDs
    .filter(c => {
      if (c.status === 'completed') return false;
      if (claimedByActive.has(c.sd_key)) return false;
      // Check dependencies are satisfied
      if (c.dependencies && Array.isArray(c.dependencies) && c.dependencies.length > 0) {
        const allDepsMet = c.dependencies.every(dep => completedKeys.has(dep));
        if (!allDepsMet) return false;
      }
      return true;
    })
    .map(c => c.sd_key);

  const blocked = allSDs
    .filter(c => {
      if (c.status === 'completed') return false;
      if (!c.dependencies || !Array.isArray(c.dependencies) || c.dependencies.length === 0) return false;
      return !c.dependencies.every(dep => completedKeys.has(dep));
    })
    .map(c => c.sd_key);

  const activeSessions = classified.filter(s => s.status === 'ACTIVE');

  // Clean up expired messages first
  try { await supabase.rpc('cleanup_expired_coordination'); } catch { /* ignore */ }

  // FIX #3: Clean up coordination messages targeting dead/stale sessions
  // These accumulate because target sessions exit without reading them
  const allSessionIds = new Set(classified.map(s => s.session_id));
  const { data: unreadMsgs } = await supabase
    .from('session_coordination')
    .select('id, target_session')
    .is('acknowledged_at', null)
    .is('read_at', null);

  const deadMsgIds = (unreadMsgs || [])
    .filter(m => !allSessionIds.has(m.target_session))
    .map(m => m.id);

  // Also include messages targeting sessions classified as DEAD or stale
  const deadOrStaleIds = new Set(classified.filter(s => s.status !== 'ACTIVE').map(s => s.session_id));
  const staleMsgIds = (unreadMsgs || [])
    .filter(m => deadOrStaleIds.has(m.target_session))
    .map(m => m.id);

  const allDeadMsgIds = [...new Set([...deadMsgIds, ...staleMsgIds])];
  if (allDeadMsgIds.length > 0) {
    // Delete in batches of 50
    for (let i = 0; i < allDeadMsgIds.length; i += 50) {
      const batch = allDeadMsgIds.slice(i, i + 50);
      await supabase.from('session_coordination').delete().in('id', batch);
    }
    actions.push('CLEANUP: deleted ' + allDeadMsgIds.length + ' unread coordination messages targeting dead/gone sessions');
  }

  for (const s of activeSessions) {
    // Check if we already have an unacknowledged message for this session
    const { data: existing } = await supabase
      .from('session_coordination')
      .select('id')
      .eq('target_session', s.session_id)
      .eq('message_type', 'WORK_ASSIGNMENT')
      .is('acknowledged_at', null)
      .limit(1);

    if (existing && existing.length > 0) continue; // Don't spam

    await supabase
      .from('session_coordination')
      .insert({
        target_session: s.session_id,
        target_sd: s.sd_id,
        message_type: 'WORK_ASSIGNMENT',
        subject: 'Next work available when ' + s.sd_id.split('-').pop() + ' completes',
        body: 'When you complete ' + s.sd_id + ', pick up the next unclaimed child.',
        payload: { available_sds: available, current_sd: s.sd_id },
        sender_type: 'sweep'
      });
  }

  // Also send CLAIM_RELEASED messages for any sessions we evicted (dead)
  for (const d of dead) {
    await supabase
      .from('session_coordination')
      .insert({
        target_session: d.session_id,
        target_sd: d.sd_id,
        message_type: 'CLAIM_RELEASED',
        subject: 'Claim on ' + d.sd_id + ' was released (PID dead)',
        body: 'Your session was detected as dead (PID ' + d.pid + '). Claim released. Available: ' + available.join(', '),
        payload: { released_sd: d.sd_id, reason: 'PID_DEAD', available_sds: available },
        sender_type: 'sweep'
      });
  }

  // Send CLAIM_RELEASED messages for conflict-evicted active sessions
  for (const evict of conflictEvicted) {
    const otherAvailable = available.filter(sd => sd !== evict.sd_id);
    await supabase
      .from('session_coordination')
      .insert({
        target_session: evict.session_id,
        target_sd: evict.sd_id,
        message_type: 'CLAIM_RELEASED',
        subject: 'Duplicate claim on ' + evict.sd_id.split('-').pop() + ' resolved — pick next SD',
        body: 'Another session is already working on ' + evict.sd_id + '. Your claim was released to avoid duplicate work. Please claim one of: ' + (otherAvailable.length > 0 ? otherAvailable.join(', ') : 'run /leo next for available SDs'),
        payload: { released_sd: evict.sd_id, reason: 'CONFLICT_RESOLUTION', available_sds: otherAvailable },
        sender_type: 'sweep'
      });
  }

  // Send CLAIM_RELEASED messages for QA-released sessions (completed SD or orphan)
  for (const s of [...workingOnCompleted, ...orphanedClaims]) {
    await supabase
      .from('session_coordination')
      .insert({
        target_session: s.session_id,
        target_sd: s.sd_id,
        message_type: 'CLAIM_RELEASED',
        subject: 'SD ' + s.sd_id.split('-').pop() + ' already completed — pick next SD',
        body: 'Your SD ' + s.sd_id + ' is already completed. Your claim was released. Please pick up one of: ' + (available.length > 0 ? available.join(', ') : 'run /leo next for available SDs'),
        payload: { released_sd: s.sd_id, reason: 'SD_ALREADY_COMPLETED', available_sds: available },
        sender_type: 'sweep'
      });
  }

  // 7. Get orchestrator progress for summary
  const completed = (children || []).filter(c => c.status === 'completed').length;
  const total = (children || []).length;
  const orchPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  // 8. Output summary
  console.log('');
  console.log('=== STALE SESSION SWEEP [' + now.toLocaleTimeString() + '] ===');
  console.log('');

  // Active workers
  console.log('ACTIVE WORKERS (' + activeSessions.length + '):');
  activeSessions.forEach(s => {
    const child = (children || []).find(c => c.sd_key === s.sd_id);
    const pct = child ? child.progress_percentage : '?';
    console.log('  ' + s.tty.padEnd(12) + s.sd_id.padEnd(50) + bar(pct) + ' ' + pct + '%');
  });
  console.log('');

  // Stale sessions
  const stale = classified.filter(s => s.status !== 'ACTIVE');
  if (stale.length > 0) {
    console.log('STALE/DEAD (' + stale.length + '):');
    stale.forEach(s => {
      const tag = s.status === 'DEAD' ? 'RELEASED' : s.status;
      console.log('  ' + s.tty.padEnd(12) + s.sd_id.padEnd(50) + tag + ' (' + s.heartbeat_age_human + ')');
    });
    console.log('');
  }

  // Actions taken
  if (actions.length > 0) {
    console.log('ACTIONS TAKEN (' + actions.length + '):');
    actions.forEach(a => console.log('  > ' + a));
    console.log('');
  }

  // Warnings
  if (warnings.length > 0) {
    console.log('WARNINGS (' + warnings.length + '):');
    warnings.forEach(w => console.log('  ! ' + w));
    console.log('');
  }

  // Conflicts
  if (conflicts.length > 0) {
    console.log('CONFLICTS DETECTED: ' + conflicts.length);
    conflicts.forEach(([sdId, arr]) => {
      console.log('  ' + sdId + ': ' + arr.map(s => s.session_id.substring(0, 20) + '(' + s.status + ')').join(' vs '));
    });
    console.log('');
  } else {
    console.log('CONFLICTS: None');
    console.log('');
  }

  // QA summary
  const stuckCompleted = stuckApproval.filter(sd => sd.progress_percentage >= 100 && sd.completion_date);
  const stuckReset = stuckApproval.filter(sd => !(sd.progress_percentage >= 100 && sd.completion_date));
  const qaIssues = workingOnCompleted.length + orphanedClaims.length + stuckApproval.length + (completedWithClaims || []).length;
  if (qaIssues > 0) {
    console.log('QA FIXES (' + qaIssues + '):');
    if (workingOnCompleted.length > 0) console.log('  Released ' + workingOnCompleted.length + ' session(s) working on completed SDs');
    if (orphanedClaims.length > 0) console.log('  Released ' + orphanedClaims.length + ' session(s) with orphaned claims');
    if (stuckCompleted.length > 0) console.log('  Completed ' + stuckCompleted.length + ' SD(s) stuck at 100%/pending_approval');
    if (stuckReset.length > 0) console.log('  Reset ' + stuckReset.length + ' SD(s) from pending_approval → draft (no session working on them)');
    if ((completedWithClaims || []).length > 0) console.log('  Cleared ' + (completedWithClaims || []).length + ' stale claiming_session_id on completed SDs');
    console.log('');
  }

  // Orchestrator progress
  console.log('ORCHESTRATOR: ' + bar(orchPct, 30) + ' ' + completed + '/' + total + ' children (' + orchPct + '%)');
  console.log('AVAILABLE FOR CLAIM: ' + (available.length > 0 ? available.join(', ') : 'None — all assigned'));
  if (blocked.length > 0) {
    console.log('BLOCKED (deps unmet): ' + blocked.join(', '));
  }
  console.log('COORDINATION MSGS: Sent to ' + activeSessions.length + ' active sessions');
  console.log('');
  console.log('=== SWEEP COMPLETE ===');
}

main().catch(err => {
  console.error('SWEEP FATAL:', err.message);
  process.exit(1);
});
