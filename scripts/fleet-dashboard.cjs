// Fleet Dashboard — Modular status display for the coordinator session
// Usage: node scripts/fleet-dashboard.cjs [workers|orchestrator|available|coordination|health|qa|forecast|all]

const os = require('os');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STALE_THRESHOLD = parseInt(process.env.STALE_SESSION_THRESHOLD_SECONDS, 10) || 300;

// ── Helpers ──

function bar(pct, width = 20) {
  const p = Math.max(0, Math.min(100, pct || 0));
  const filled = Math.round((p / 100) * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

function pad(str, len) {
  return (str || '').substring(0, len).padEnd(len);
}

// ── Data Loading ──

async function loadData() {
  const [sessRes, allSessRes, childRes, workRes, coordRes, rawSessRes] = await Promise.all([
    supabase
      .from('v_active_sessions')
      .select('session_id, sd_id, sd_title, heartbeat_age_seconds, heartbeat_age_human, computed_status, hostname, tty, pid, track')
      .not('sd_id', 'is', null)
      .order('heartbeat_age_seconds', { ascending: true }),
    supabase
      .from('v_active_sessions')
      .select('session_id, sd_id, computed_status, tty, heartbeat_age_seconds, heartbeat_age_human')
      .order('heartbeat_age_seconds', { ascending: true }),
    supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, status, current_phase, progress_percentage, completion_date, created_at, dependencies')
      .like('sd_key', 'SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-%')
      .order('sd_key', { ascending: true }),
    supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, status, current_phase, progress_percentage, priority')
      .in('status', ['draft', 'in_progress', 'ready', 'pending_approval'])
      .not('sd_key', 'like', 'SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001%')
      .limit(15),
    supabase
      .from('session_coordination')
      .select('id, target_session, target_sd, message_type, subject, read_at, acknowledged_at, created_at')
      .is('acknowledged_at', null)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('claude_sessions')
      .select('session_id, sd_id, tty, status, heartbeat_at, pid')
      .not('sd_id', 'is', null)
      .order('heartbeat_at', { ascending: false })
      .limit(30)
  ]);

  const sessions = sessRes.data || [];
  const allSessions = allSessRes.data || [];
  const children = childRes.data || [];
  const workable = workRes.data || [];
  const coordMessages = coordRes.data || [];
  const rawSessions = rawSessRes.data || [];

  const claimedSdIds = new Set(sessions.map(s => s.sd_id));
  const activeSessions = sessions.filter(s => s.heartbeat_age_seconds < STALE_THRESHOLD);
  const staleSessions = sessions.filter(s => s.heartbeat_age_seconds >= STALE_THRESHOLD);
  const DEAD_THRESHOLD = STALE_THRESHOLD * 3; // 15min
  const idleSessions = allSessions.filter(s => !s.sd_id && s.heartbeat_age_seconds < DEAD_THRESHOLD);

  const completedChildren = children.filter(c => c.status === 'completed').length;
  const totalChildren = children.length;
  const orchPct = totalChildren > 0 ? Math.round((completedChildren / totalChildren) * 100) : 0;

  const unclaimedChildren = children.filter(c => c.status !== 'completed' && !claimedSdIds.has(c.sd_key));
  const unclaimedStandalone = workable.filter(sd => !claimedSdIds.has(sd.sd_key));

  // Build SD status map for QA checks (includes all SDs, not just orchestrator children)
  const allSdKeys = [...new Set(rawSessions.map(s => s.sd_id).filter(Boolean))];
  let sdStatusMap = {};
  children.forEach(c => { sdStatusMap[c.sd_key] = c; });
  // Fetch any non-child SDs that workers are claiming
  const missingKeys = allSdKeys.filter(k => !sdStatusMap[k]);
  if (missingKeys.length > 0) {
    const { data: extraSds } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, status, progress_percentage, completion_date')
      .in('sd_key', missingKeys);
    (extraSds || []).forEach(sd => { sdStatusMap[sd.sd_key] = sd; });
  }

  // Detect bare-shell SDs: title == description, no real scope, not child stubs
  const pendingKeys = workable.map(sd => sd.sd_key);
  let bareShells = [];
  if (pendingKeys.length > 0) {
    const { data: descData } = await supabase.from('strategic_directives_v2')
      .select('sd_key, title, description, scope').in('sd_key', pendingKeys);
    bareShells = (descData || []).filter(sd => {
      if (sd.description && sd.description.startsWith('Child SD of')) return false;
      const thin = !sd.description || sd.description === sd.title || (sd.description.length < 100 && sd.scope === sd.title);
      return thin;
    });
  }

  return {
    sessions, allSessions, children, workable, coordMessages, rawSessions, sdStatusMap,
    claimedSdIds, activeSessions, staleSessions, idleSessions,
    completedChildren, totalChildren, orchPct,
    unclaimedChildren, unclaimedStandalone, bareShellSDs: bareShells
  };
}

// ── Section: Workers ──
function printWorkers(d) {
  const now = new Date();
  console.log('');
  console.log('WORKERS [' + now.toLocaleTimeString() + ']');
  console.log('─'.repeat(72));

  if (d.activeSessions.length === 0) {
    console.log('  (no active workers)');
  } else {
    console.log('  ' + pad('Terminal', 12) + pad('SD', 10) + pad('Progress', 26) + pad('Phase', 8) + pad('Fails', 6) + pad('WIP', 5) + 'Heartbeat');
    console.log('  ' + '─'.repeat(72));
    for (const s of d.activeSessions) {
      const child = d.children.find(c => c.sd_key === s.sd_id);
      const pct = child ? child.progress_percentage : 0;
      const phase = s.current_phase || (child ? child.current_phase : '?');
      const shortSd = s.sd_id.replace('SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-', '').replace(/^SD-.*-/, '');
      const fails = s.handoff_fail_count != null ? String(s.handoff_fail_count) : '-';
      const wip = s.has_uncommitted_changes === true ? 'Y' : s.has_uncommitted_changes === false ? 'N' : '-';
      const struggleTag = (s.handoff_fail_count || 0) > 3 ? ' [STRUGGLING]' : '';
      console.log('  ' + pad(s.tty, 12) + pad(shortSd, 10) + bar(pct) + ' ' + pad(pct + '%', 5) + pad(phase, 8) + pad(fails, 6) + pad(wip, 5) + s.heartbeat_age_human + struggleTag);
    }
  }

  if (d.staleSessions.length > 0) {
    console.log('');
    console.log('  Stale (' + d.staleSessions.length + '):');
    for (const s of d.staleSessions) {
      const shortSd = s.sd_id.replace('SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-', '').replace(/^SD-.*-/, '');
      console.log('  ' + pad(s.tty, 12) + pad(shortSd, 10) + s.heartbeat_age_human);
    }
  }

  if (d.idleSessions.length > 0) {
    console.log('');
    console.log('  Idle — No Claim (' + d.idleSessions.length + '):');
    for (const s of d.idleSessions) {
      const age = s.heartbeat_age_human || (s.heartbeat_age_seconds < 60 ? s.heartbeat_age_seconds + 's ago' : Math.round(s.heartbeat_age_seconds / 60) + 'm ago');
      const staleTag = s.heartbeat_age_seconds >= STALE_THRESHOLD ? ' [STALE]' : '';
      console.log('  ' + pad(s.tty, 12) + pad('—', 10) + pad('', 26) + pad('idle', 14) + age + staleTag);
    }
  }

  console.log('');
}

// ── Section: Orchestrator ──

function printOrchestrator(d) {
  console.log('ORCHESTRATOR ' + bar(d.orchPct, 25) + ' ' + d.completedChildren + '/' + d.totalChildren + ' (' + d.orchPct + '%)');
  console.log('─'.repeat(72));

  for (const c of d.children) {
    const letter = c.sd_key.slice(-1);
    const pct = c.progress_percentage || 0;
    const isClaimed = d.claimedSdIds.has(c.sd_key);
    const icon = c.status === 'completed' ? '\u2705' : isClaimed ? '\uD83D\uDD12' : '\uD83D\uDCCB';
    const phase = c.status === 'completed' ? 'DONE' : c.current_phase;
    console.log('  ' + letter + '  ' + bar(pct, 15) + ' ' + pad(pct + '%', 5) + ' ' + icon + ' ' + pad(phase, 12) + c.title.substring(0, 38));
  }

  console.log('');
}

// ── Section: Available ──
function printAvailable(d) {
  const total = d.unclaimedChildren.length + d.unclaimedStandalone.length;
  console.log('AVAILABLE FOR CLAIM (' + total + ')');
  console.log('─'.repeat(72));

  if (total === 0) {
    console.log('  (all SDs claimed or completed)');
    console.log('');
    return;
  }

  if (d.unclaimedChildren.length > 0) {
    console.log('  Orchestrator Children:');
    for (const c of d.unclaimedChildren) {
      const letter = c.sd_key.slice(-1);
      console.log('    Child ' + letter + '  ' + pad(c.title, 48) + c.status);
    }
  }

  if (d.unclaimedStandalone.length > 0) {
    console.log('  Standalone SDs:');
    for (const sd of d.unclaimedStandalone) {
      const shortKey = sd.sd_key.replace('SD-LEO-', '').replace('SD-', '').substring(0, 22);
      const prio = sd.priority === 'high' ? 'HIGH' : 'MED';
      console.log('    ' + pad(shortKey, 24) + pad(sd.title.substring(0, 38), 40) + prio);
    }
  }

  console.log('');
}

// ── Section: Coordination ──
function printCoordination(d) {
  console.log('COORDINATION MESSAGES');
  console.log('─'.repeat(72));

  if (d.coordMessages.length === 0) {
    console.log('  (no pending messages)');
    console.log('');
    return;
  }

  const unread = d.coordMessages.filter(m => !m.read_at).length;
  const pending = d.coordMessages.filter(m => m.read_at && !m.acknowledged_at).length;
  console.log('  ' + unread + ' unread, ' + pending + ' pending acknowledgment');
  console.log('');

  console.log('  ' + pad('Type', 20) + pad('Target', 16) + pad('Status', 10) + 'Subject');
  console.log('  ' + '─'.repeat(68));
  for (const m of d.coordMessages.slice(0, 10)) {
    const status = m.acknowledged_at ? 'ACKED' : m.read_at ? 'READ' : 'UNREAD';
    const target = (m.target_session || '').replace('session_', '').substring(0, 14);
    console.log('  ' + pad(m.message_type, 20) + pad(target, 16) + pad(status, 10) + (m.subject || '').substring(0, 30));
  }

  console.log('');
}

// ── Section: Coaching ──
async function printCoaching(d) {
  // Query recent coaching messages (last hour)
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: msgs } = await supabase
    .from('session_coordination')
    .select('id, target_session, message_type, subject, payload, read_at, acknowledged_at, created_at')
    .eq('message_type', 'COACHING')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(30);

  const coaching = msgs || [];

  console.log('COACHING (last hour)');
  console.log('─'.repeat(72));

  if (coaching.length === 0) {
    console.log('  (no coaching messages sent recently)');
    console.log('');
    return;
  }

  const acked = coaching.filter(m => m.acknowledged_at).length;
  const read = coaching.filter(m => m.read_at && !m.acknowledged_at).length;
  const unread = coaching.filter(m => !m.read_at).length;
  console.log('  Sent: ' + coaching.length + '  |  Acked: ' + acked + '  |  Read: ' + read + '  |  Unread: ' + unread);
  console.log('');

  // Group by coaching_type
  const byType = {};
  for (const m of coaching) {
    const ct = m.payload?.coaching_type || 'UNKNOWN';
    if (!byType[ct]) byType[ct] = { count: 0, targets: new Set(), acked: 0 };
    byType[ct].count++;
    const tty = (m.target_session || '').replace('session_', '').substring(0, 14);
    byType[ct].targets.add(tty);
    if (m.acknowledged_at) byType[ct].acked++;
  }

  console.log('  ' + pad('Type', 28) + pad('Sent', 6) + pad('Acked', 7) + 'Workers');
  console.log('  ' + '─'.repeat(64));
  for (const [type, data] of Object.entries(byType).sort((a, b) => b[1].count - a[1].count)) {
    console.log('  ' + pad(type, 28) + pad(String(data.count), 6) + pad(String(data.acked), 7) + [...data.targets].join(', '));
  }

  console.log('');
}

// ── Section: Health ──
function printHealth(d) {
  const health = d.activeSessions.length >= 3 ? 'HEALTHY' : d.activeSessions.length >= 1 ? 'DEGRADED' : 'DOWN';
  const icon = health === 'HEALTHY' ? '[OK]' : health === 'DEGRADED' ? '[!!]' : '[XX]';

  console.log('FLEET HEALTH ' + icon);
  console.log('─'.repeat(72));
  console.log('  Active:  ' + d.activeSessions.length + ' workers');
  console.log('  Unclaimed: ' + d.idleSessions.length + ' sessions (no SD claim)');
  console.log('  Stale:   ' + d.staleSessions.length + ' sessions');
  console.log('  Orch:    ' + d.completedChildren + '/' + d.totalChildren + ' children complete (' + d.orchPct + '%)');
  console.log('  Status:  ' + health);
  console.log('');
}

// ── Section: QA ──
function printQA(d) {
  const now = Date.now();
  const issues = [];

  // Filter raw sessions to recent (< 10 min heartbeat)
  const recentRaw = d.rawSessions.filter(s => {
    const age = (now - new Date(s.heartbeat_at).getTime()) / 1000;
    return age < 600;
  });

  // QA 1: Working on completed SD
  const onCompleted = recentRaw.filter(s => {
    const sd = d.sdStatusMap[s.sd_id];
    return sd && sd.status === 'completed';
  });
  onCompleted.forEach(s => {
    const sd = d.sdStatusMap[s.sd_id];
    const shortSd = s.sd_id.replace('SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-', '').replace(/^SD-.*-/, '');
    issues.push({
      severity: 'HIGH',
      check: 'COMPLETED_SD',
      msg: s.tty + ' working on ' + shortSd + ' — already completed' + (sd.completion_date ? ' at ' + new Date(sd.completion_date).toLocaleTimeString() : '')
    });
  });

  // QA 2: Duplicate claims
  const bySd = {};
  recentRaw.forEach(s => {
    if (!bySd[s.sd_id]) bySd[s.sd_id] = [];
    bySd[s.sd_id].push(s);
  });
  Object.entries(bySd).filter(([, arr]) => arr.length > 1).forEach(([sdId, claimants]) => {
    const shortSd = sdId.replace('SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-', '').replace(/^SD-.*-/, '');
    issues.push({
      severity: 'HIGH',
      check: 'DUPLICATE',
      msg: shortSd + ' claimed by ' + claimants.length + ' sessions: ' + claimants.map(s => s.tty).join(', ')
    });
  });

  // QA 3: Orphaned claims (SD not in DB)
  recentRaw.filter(s => !d.sdStatusMap[s.sd_id]).forEach(s => {
    issues.push({
      severity: 'MED',
      check: 'ORPHAN',
      msg: s.tty + ' claims ' + s.sd_id.substring(0, 30) + '… — SD not found in DB'
    });
  });

  // QA 4: Claim with bad session status
  recentRaw.filter(s => s.sd_id && !['active', 'idle'].includes(s.status)).forEach(s => {
    const shortSd = s.sd_id.replace('SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-', '').replace(/^SD-.*-/, '');
    issues.push({
      severity: 'LOW',
      check: 'BAD_STATUS',
      msg: s.tty + ' status=' + s.status + ' but claims ' + shortSd
    });
  });

  // QA 5: Progress 100% but not completed
  Object.values(d.sdStatusMap).filter(sd => sd.progress_percentage >= 100 && sd.status !== 'completed').forEach(sd => {
    const shortSd = sd.sd_key.replace('SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-', '').replace(/^SD-.*-/, '');
    issues.push({
      severity: 'MED',
      check: 'STUCK_100',
      msg: shortSd + ' at 100% but status=' + sd.status + ' — not marked completed'
    });
  });

  // QA 6: SDs stuck in pending_approval with no active claiming session
  const pendingApproval = Object.values(d.sdStatusMap).filter(sd => sd.status === 'pending_approval');
  const activeClaimSdIds = new Set(recentRaw.map(s => s.sd_id).filter(Boolean));
  pendingApproval.filter(sd => !activeClaimSdIds.has(sd.sd_key)).forEach(sd => {
    const shortSd = sd.sd_key.replace('SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-', '').replace(/^SD-.*-/, '');
    issues.push({
      severity: 'HIGH',
      check: 'STUCK_APPROVAL',
      msg: shortSd + ' stuck in pending_approval — no session working on it (sweep will auto-reset to draft)'
    });
  });
  // QA 7: Bare-shell SDs — title repeated as description, no real scope
  (d.bareShellSDs || []).forEach(sd => {
    const shortSd = sd.sd_key.replace('SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-', '').replace(/^SD-.*-/, '');
    issues.push({ severity: 'MED', check: 'BARE_SHELL', msg: shortSd + ' has no real description — workers will waste cycles on LEAD setup' });
  });
  // Print
  const icon = issues.length === 0 ? '[PASS]' : '[' + issues.length + ' ISSUES]';
  console.log('QA CHECKS ' + icon);
  console.log('─'.repeat(72));

  if (issues.length === 0) {
    console.log('  All checks passed. Fleet is clean.');
  } else {
    const severityIcon = { HIGH: '!!', MED: '! ', LOW: '- ' };
    for (const issue of issues) {
      console.log('  ' + severityIcon[issue.severity] + ' [' + pad(issue.check, 12) + '] ' + issue.msg);
    }
  }

  console.log('');
}

// ── Section: Forecast ──
async function printForecast(d) {
  const now = new Date();
  console.log('FORECAST');
  console.log('─'.repeat(72));
  const orchCompleted = d.children.filter(c => c.status === 'completed' && c.completion_date);
  const orchRemaining = d.children.filter(c => c.status !== 'completed');

  if (orchCompleted.length >= 2) {
    const sorted = orchCompleted
      .map(c => ({ ...c, completedAt: new Date(c.completion_date) }))
      .sort((a, b) => a.completedAt - b.completedAt);

    const firstCompletion = sorted[0].completedAt;
    const lastCompletion = sorted[sorted.length - 1].completedAt;
    const elapsedHours = (lastCompletion - firstCompletion) / (1000 * 60 * 60);
    const velocity = elapsedHours > 0 ? (sorted.length - 1) / elapsedHours : 0;

    let recentVelocity = velocity;
    if (sorted.length >= 3) {
      const recent = sorted.slice(-3);
      const recentElapsed = (recent[recent.length - 1].completedAt - recent[0].completedAt) / (1000 * 60 * 60);
      if (recentElapsed > 0) recentVelocity = (recent.length - 1) / recentElapsed;
    }

    const timeSinceLast = (now - lastCompletion) / (1000 * 60);
    const timeSinceStr = timeSinceLast < 60
      ? Math.round(timeSinceLast) + 'min ago'
      : Math.round(timeSinceLast / 60 * 10) / 10 + 'h ago';

    const effectiveVelocity = recentVelocity > 0 ? recentVelocity : velocity;
    const orchEtaHours = effectiveVelocity > 0 ? orchRemaining.length / effectiveVelocity : null;

    console.log('  ORCHESTRATOR (Stage Venture Workflow)');
    console.log('  ' + bar(d.orchPct, 25) + ' ' + orchCompleted.length + '/' + d.totalChildren + ' (' + d.orchPct + '%)');
    console.log('  Velocity:   ' + velocity.toFixed(1) + ' SDs/hr (overall)  ' + recentVelocity.toFixed(1) + ' SDs/hr (recent)');
    console.log('  Last finish: ' + timeSinceStr);

    if (orchRemaining.length === 0) {
      console.log('  Status:     COMPLETE');
    } else if (orchEtaHours !== null) {
      const etaTime = new Date(now.getTime() + orchEtaHours * 60 * 60 * 1000);
      const etaStr = orchEtaHours < 1
        ? Math.round(orchEtaHours * 60) + ' minutes'
        : Math.round(orchEtaHours * 10) / 10 + ' hours';
      console.log('  Remaining:  ' + orchRemaining.length + ' child(ren)  ETA: ~' + etaStr + ' (around ' + etaTime.toLocaleTimeString() + ')');
    }
  } else if (orchRemaining.length === 0) {
    console.log('  ORCHESTRATOR: COMPLETE (' + d.totalChildren + '/' + d.totalChildren + ')');
  } else {
    console.log('  ORCHESTRATOR: ' + orchCompleted.length + '/' + d.totalChildren + ' (need more data for velocity)');
  }

  console.log('');
  // Full Queue Forecast — all pending SDs across the entire queue
  const { data: allPending } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, status, priority, current_phase, progress_percentage, dependencies')
    .in('status', ['draft', 'in_progress', 'ready', 'planning', 'pending_approval'])
    .order('priority', { ascending: true });

  const pending = allPending || [];
  const activeWorkers = d.activeSessions.length;

  // Categorize pending SDs
  const inProgress = pending.filter(sd => sd.status === 'in_progress' || (sd.progress_percentage || 0) > 0);
  const notStarted = pending.filter(sd => sd.status !== 'in_progress' && (sd.progress_percentage || 0) === 0);
  const highPrio = pending.filter(sd => sd.priority === 'high' || sd.priority === 'critical');

  console.log('  FULL QUEUE');
  console.log('  Pending SDs:   ' + pending.length + ' total');
  console.log('  In progress:   ' + inProgress.length);
  console.log('  Not started:   ' + notStarted.length);
  if (highPrio.length > 0) {
    console.log('  High priority:  ' + highPrio.length);
  }
  console.log('  Active workers: ' + activeWorkers);

  // Estimate full queue ETA reusing velocity from above
  if (orchCompleted.length >= 2 && pending.length > 0) {
    const s2 = orchCompleted.map(c => ({ ...c, completedAt: new Date(c.completion_date) })).sort((a, b) => a.completedAt - b.completedAt);
    const vel = ((s2[s2.length - 1].completedAt - s2[0].completedAt) / 3600000);
    const v = vel > 0 ? (s2.length - 1) / vel : 0;
    if (v > 0) {
      const h = pending.length / v;
      const etaStr = h < 1 ? Math.round(h * 60) + ' minutes' : h < 24 ? Math.round(h * 10) / 10 + ' hours' : Math.round(h / 24 * 10) / 10 + ' days';
      console.log('  Queue ETA:     ~' + etaStr + ' at current velocity (' + v.toFixed(1) + ' SDs/hr)');
    }
  }
  console.log('');
  console.log('  ' + '─'.repeat(66));

  if (orchRemaining.length === 0 && pending.length === 0) {
    console.log('  Queue is clear. All SDs complete. Nice work.');
  } else if (orchRemaining.length === 0) {
    console.log('  Orchestrator is done! ' + pending.length + ' standalone SDs remain in the queue.');
    console.log('  ' + (activeWorkers > 0 ? activeWorkers + ' worker(s) can roll into the next priority items.' : 'Spin up workers to start burning through the backlog.'));
  } else if (orchRemaining.length <= 2) {
    console.log('  Orchestrator almost done — ' + orchRemaining.length + ' child(ren) left. Then ' + pending.length + ' more.');
  } else {
    console.log('  ' + activeWorkers + ' workers active across ' + pending.length + ' pending SDs.' + (highPrio.length > 0 ? ' ' + highPrio.length + ' high-priority.' : ''));
  }

  console.log('');
}

// ── Section: Predictions ──
async function printPredictions(d) {
  const signals = [];

  // 1. Capacity — estimate real fleet size using heartbeat freshness
  // Sessions with heartbeat < 3min are likely real; >= 3min are likely ghosts (exited without cleanup)
  const ALIVE_THRESHOLD = 180; // 3 minutes
  const aliveIdle = d.idleSessions.filter(s => s.heartbeat_age_seconds < ALIVE_THRESHOLD);
  const ghostIdle = d.idleSessions.filter(s => s.heartbeat_age_seconds >= ALIVE_THRESHOLD);
  const availableCount = d.unclaimedStandalone.length + d.unclaimedChildren.length;
  // +1 for coordinator session (this session — not in fleet data since it has no SD claim)
  const estimatedFleet = d.activeSessions.length + aliveIdle.length + 1;
  const claimedCount = d.activeSessions.length;
  const utilPct = estimatedFleet > 0 ? Math.round((claimedCount / estimatedFleet) * 100) : 0;

  if (aliveIdle.length > 0 && availableCount > 0) {
    signals.push({
      icon: '!!',
      label: 'CAPACITY',
      msg: aliveIdle.length + ' idle / ' + availableCount + ' available — fleet ~' + estimatedFleet + ' sessions at ' + utilPct + '% utilization'
        + (ghostIdle.length > 0 ? ' (' + ghostIdle.length + ' ghost sessions excluded)' : '')
    });
  } else if (aliveIdle.length > 0 && availableCount === 0) {
    signals.push({
      icon: 'OK',
      label: 'CAPACITY',
      msg: 'Fleet ~' + estimatedFleet + ' sessions — ' + aliveIdle.length + ' idle but 0 SDs available, waiting on completions/unblocks'
    });
  } else if (aliveIdle.length === 0 && availableCount > 0 && claimedCount > 0) {
    signals.push({
      icon: 'OK',
      label: 'CAPACITY',
      msg: 'Fleet ~' + estimatedFleet + ' sessions, all claimed — ' + availableCount + ' SDs queued for next free worker'
        + (ghostIdle.length > 0 ? ' (' + ghostIdle.length + ' ghost sessions excluded)' : '')
    });
  } else if (aliveIdle.length === 0 && claimedCount > 0) {
    signals.push({
      icon: 'OK',
      label: 'CAPACITY',
      msg: 'Fleet ~' + estimatedFleet + ' sessions, fully utilized'
    });
  }

  // 2. Dependency unlock forecast — what SDs will completing current work unblock?
  const completedKeys = new Set(d.children.filter(c => c.status === 'completed').map(c => c.sd_key));
  const claimedSdKeys = [...d.claimedSdIds];
  // Get all blocked SDs with their dependencies
  const { data: allBlockedRaw } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, dependencies, status')
    .in('status', ['draft', 'in_progress', 'ready', 'planning'])
    .not('dependencies', 'is', null);

  const blocked = (allBlockedRaw || []).filter(sd => {
    const deps = parseDeps(sd.dependencies);
    return deps.length > 0 && deps.some(dep => !completedKeys.has(dep));
  });

  // For each currently claimed SD, count how many blocked SDs it would unblock
  for (const claimedKey of claimedSdKeys) {
    const wouldUnblock = blocked.filter(sd => {
      const deps = parseDeps(sd.dependencies);
      const unresolvedDeps = deps.filter(dep => !completedKeys.has(dep));
      return unresolvedDeps.length === 1 && unresolvedDeps[0] === claimedKey;
    });
    if (wouldUnblock.length > 0) {
      const shortKey = claimedKey.replace('SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-', '').replace(/^SD-.*?-/, '');
      const names = wouldUnblock.slice(0, 3).map(s => s.sd_key.replace('SD-LEO-ORCH-', '').replace(/^SD-.*?-/, '').substring(0, 20));
      signals.push({
        icon: '>>',
        label: 'UNLOCK',
        msg: 'When ' + shortKey + ' completes → unblocks ' + wouldUnblock.length + ' SD(s): ' + names.join(', ')
      });
    }
  }

  // 3. Heartbeat aging — workers approaching stale threshold (FIX #5: with coordination messages)
  const STALE_WARNING = STALE_THRESHOLD * 0.6; // 60% of 5min = 3min
  const agingWorkers = [];
  for (const s of d.activeSessions) {
    if (s.heartbeat_age_seconds >= STALE_WARNING) {
      const remaining = Math.round(STALE_THRESHOLD - s.heartbeat_age_seconds);
      const shortSd = s.sd_id.replace('SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-', '').replace(/^SD-.*-/, '');
      signals.push({
        icon: '~~',
        label: 'AGING',
        msg: s.tty + ' on ' + shortSd + ' — heartbeat aging (' + s.heartbeat_age_human + '), stale in ~' + remaining + 's'
      });
      agingWorkers.push(s);
    }
  }

  // Send STALE_WARNING coordination messages for aging workers
  for (const s of agingWorkers) {
    // Check if we already sent a stale warning recently (avoid spam)
    const { data: existingWarn } = await supabase
      .from('session_coordination')
      .select('id')
      .eq('target_session', s.session_id)
      .eq('message_type', 'STALE_WARNING')
      .is('acknowledged_at', null)
      .limit(1);

    if (existingWarn && existingWarn.length > 0) continue;

    await supabase
      .from('session_coordination')
      .insert({
        target_session: s.session_id,
        target_sd: s.sd_id,
        message_type: 'STALE_WARNING',
        subject: 'Heartbeat aging on ' + s.sd_id.split('-').pop() + ' — approaching stale threshold',
        body: 'Your session on ' + s.sd_id + ' has not heartbeated in ' + s.heartbeat_age_human + '. If you are still working, send a heartbeat. If stuck, consider releasing the claim.',
        payload: { session_id: s.session_id, heartbeat_age: s.heartbeat_age_seconds, stale_threshold: STALE_THRESHOLD },
        sender_type: 'dashboard'
      }).then(() => {}).catch(() => {}); // Non-blocking
  }

  // Print
  console.log('PREDICTIONS');
  console.log('─'.repeat(72));
  if (signals.length === 0) {
    console.log('  Fleet nominal — no predictive signals.');
  } else {
    for (const sig of signals) {
      console.log('  ' + sig.icon + ' [' + pad(sig.label, 10) + '] ' + sig.msg);
    }
  }
  console.log('');
}

// Helper: parse dependencies from various formats (string, array, JSONB)
function parseDeps(deps) {
  if (!deps) return [];
  if (Array.isArray(deps)) return deps.map(d => typeof d === 'string' ? d : (d.sd_key || d.id || '')).filter(Boolean);
  if (typeof deps === 'string') {
    try { return parseDeps(JSON.parse(deps)); } catch (e) { return deps.split(',').map(s => s.trim()).filter(Boolean); }
  }
  return [];
}

// ── Main ──

async function main() {
  const section = (process.argv[2] || 'all').toLowerCase();
  const d = await loadData();

  const sections = {
    workers:       () => printWorkers(d),
    orchestrator:  () => printOrchestrator(d),
    available:     () => printAvailable(d),
    coordination:  () => printCoordination(d),
    coaching:      async () => await printCoaching(d),
    health:        () => printHealth(d),
    qa:            () => printQA(d),
    forecast:      async () => await printForecast(d),
    predictions:   async () => await printPredictions(d),
    all:           async () => {
      printWorkers(d);
      printOrchestrator(d);
      printAvailable(d);
      printCoordination(d);
      await printCoaching(d);
      printHealth(d);
      printQA(d);
      await printForecast(d);
      await printPredictions(d);
    }
  };

  const fn = sections[section];
  if (!fn) {
    console.log('Usage: node scripts/fleet-dashboard.cjs [section]');
    console.log('Sections: workers, orchestrator, available, coordination, coaching, health, qa, forecast, predictions, all');
    process.exit(1);
  }

  await fn();
}

main().catch(err => {
  console.error('DASHBOARD ERROR:', err.message);
  process.exit(1);
});
