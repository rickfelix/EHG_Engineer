// lib/execute/team-banner.cjs
//
// SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-B (Phase 2 of /execute)
// Pure helpers for the /coordinator team banner: data loader, format helpers,
// renderer. Imported by scripts/fleet-dashboard.cjs and tests.
//
// All functions here are CommonJS to match fleet-dashboard.cjs.

// Honor NO_COLOR env var per https://no-color.org/
const USE_ANSI = !process.env.NO_COLOR && !process.env.CI;
const ANSI = USE_ANSI ? {
  reset:  '\x1b[0m',
  blue:   '\x1b[34m',
  green:  '\x1b[32m',
  purple: '\x1b[35m',
  orange: '\x1b[33m', // closest in 8-color
  cyan:   '\x1b[36m',
  pink:   '\x1b[95m',
  yellow: '\x1b[93m',
  red:    '\x1b[31m'
} : new Proxy({}, { get: () => '' });

/**
 * Loads active execute_teams + their virtual claude_sessions + SD progress.
 * Returns shaped data ready for the renderer. Defensive: missing virtual sessions
 * surface as session_status='missing' so the renderer can show IDLE/missing state.
 *
 * @param {Object} client - Supabase client (service role for full visibility)
 * @returns {Promise<Array<{team_id, status, started_at, uptime_seconds, sds_completed,
 *   sds_failed, worker_count, active_workers, slots: [{slot, callsign, color,
 *   virtual_session_id, sd_key, current_phase, progress, heartbeat_age_seconds,
 *   session_status}]}>>}
 */
async function loadExecuteTeams(client) {
  const { data: teams, error } = await client
    .from('execute_teams')
    .select('team_id, status, started_at, sds_completed, sds_failed, worker_session_ids, metadata')
    .in('status', ['active', 'stopping'])
    .order('started_at', { ascending: true });
  if (error || !teams || teams.length === 0) return [];

  // Single round-trip for all worker sessions across all teams
  const allSessionIds = [];
  for (const t of teams) {
    if (Array.isArray(t.worker_session_ids)) allSessionIds.push(...t.worker_session_ids);
  }

  const sessionsBySid = {};
  if (allSessionIds.length > 0) {
    const { data: sess } = await client
      .from('claude_sessions')
      .select('session_id, sd_key, current_phase, heartbeat_at, status')
      .in('session_id', allSessionIds);
    for (const s of (sess || [])) sessionsBySid[s.session_id] = s;
  }

  // Single round-trip for SD progress lookups
  const sdKeys = [...new Set(Object.values(sessionsBySid).map(s => s.sd_key).filter(Boolean))];
  const sdsByKey = {};
  if (sdKeys.length > 0) {
    const { data: sds } = await client
      .from('strategic_directives_v2')
      .select('sd_key, progress_percentage, current_phase')
      .in('sd_key', sdKeys);
    for (const sd of (sds || [])) sdsByKey[sd.sd_key] = sd;
  }

  const now = Date.now();
  return teams.map(t => {
    const slots = ((t.metadata && t.metadata.slots) || []).map(slot => {
      const sess = sessionsBySid[slot.virtual_session_id] || null;
      const sd = sess && sess.sd_key ? sdsByKey[sess.sd_key] : null;
      const heartbeatAge = sess && sess.heartbeat_at
        ? Math.round((now - new Date(sess.heartbeat_at).getTime()) / 1000)
        : null;
      return {
        slot: slot.slot,
        callsign: slot.callsign,
        color: slot.color,
        virtual_session_id: slot.virtual_session_id,
        sd_key: (sess && sess.sd_key) || null,
        current_phase: (sess && sess.current_phase) || (sd && sd.current_phase) || null,
        progress: sd && sd.progress_percentage != null ? sd.progress_percentage : null,
        heartbeat_age_seconds: heartbeatAge,
        session_status: (sess && sess.status) || 'missing'
      };
    });

    const uptimeSec = t.started_at
      ? Math.round((now - new Date(t.started_at).getTime()) / 1000)
      : 0;

    return {
      team_id: t.team_id,
      status: t.status,
      started_at: t.started_at,
      uptime_seconds: uptimeSec,
      sds_completed: t.sds_completed || 0,
      sds_failed: t.sds_failed || 0,
      worker_count: slots.length,
      active_workers: slots.filter(s => s.session_status === 'active').length,
      slots
    };
  });
}

/** Format seconds → human duration (s / m / Xh Ym) */
function fmtUptime(sec) {
  if (!sec || sec < 60) return `${sec || 0}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return `${h}h${m > 0 ? m + 'm' : ''}`;
}

/** Format heartbeat age in seconds → compact display */
function fmtHeartbeat(sec) {
  if (sec == null) return '?';
  if (sec < 60) return `${sec}s`;
  return `${Math.round(sec / 60)}m`;
}

/** Apply ANSI color (or no-op if NO_COLOR / CI / unsupported) */
function colorize(text, color) {
  if (!color || !ANSI[color]) return text;
  return ANSI[color] + text + ANSI.reset;
}

/**
 * Render the Mockup A banner from loader output.
 * @param {Array} teams - Output of loadExecuteTeams
 * @param {Function} bar - Progress bar helper from fleet-dashboard.cjs (signature: bar(pct, width))
 * @param {Object} [opts] - Optional { now: number, log: Function } for testing
 */
function printTeam(teams, bar, opts = {}) {
  const log = opts.log || console.log;
  const safeTeams = teams || [];

  if (safeTeams.length === 0) {
    log('');
    log('  (no active teams)');
    log('');
    return;
  }

  for (const team of safeTeams) {
    const clock = opts.now
      ? new Date(opts.now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const headerInner = ` /execute team ════ ${team.active_workers}/${team.worker_count} active ══ uptime ${fmtUptime(team.uptime_seconds)} ══ ${clock} `;
    const innerWidth = Math.max(64, headerInner.length);
    const headerPad = '═'.repeat(Math.max(0, innerWidth - headerInner.length));

    log('');
    log('╔══' + headerInner + headerPad + '╗');

    if (team.slots.length === 0) {
      log('║' + ' '.repeat(innerWidth + 2) + '║');
    } else {
      for (const slot of team.slots) {
        const callsign = (slot.callsign || `Slot${slot.slot}`).toUpperCase().padEnd(8);
        const sdLabel = slot.sd_key
          ? slot.sd_key.replace(/^SD-/, '').substring(0, 22).padEnd(22)
          : '(idle)'.padEnd(22);
        const phase = (slot.current_phase || '—').substring(0, 6).padEnd(6);
        const pct = slot.progress != null ? slot.progress : 0;
        const pctLabel = (pct + '%').padEnd(4);
        const progressBar = bar(pct, 10);
        const hb = fmtHeartbeat(slot.heartbeat_age_seconds).padEnd(5);
        const idleTag = slot.session_status === 'missing' ? ' [missing]' : '';

        const rowText = ` ${callsign} ${sdLabel} ${phase} ${pctLabel} ${progressBar}  ${hb}${idleTag}`;
        const colored = colorize(rowText, slot.color);
        const padNeeded = Math.max(0, innerWidth + 2 - rowText.length);
        log('║' + colored + ' '.repeat(padNeeded) + '║');
      }
    }

    log('╚' + '═'.repeat(innerWidth + 2) + '╝');
    log(`  Completed: ${team.sds_completed} · Failed: ${team.sds_failed} · Status: ${team.status}`);
    log('');
  }
}

module.exports = {
  loadExecuteTeams,
  printTeam,
  fmtUptime,
  fmtHeartbeat,
  colorize,
  ANSI
};
