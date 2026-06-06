// coordinator-audit.mjs — recurring coordinator audit of the THREE work sources.
//   (1) Harness backlog  : feedback category=harness_backlog, open   → items to SOURCE into SDs
//   (2) SD queue         : non-terminal SDs (claimed / unclaimed / stuck)
//   (3) Coordinator inbox: unread worker /signal traffic
// Surfaces all three + flags whether to SOURCE backlog into DRAFT SDs. Sourcing rule: only when the
// queue would otherwise STARVE available workers (don't flood the queue when there's already surplus
// work — then the constraint is worker capacity, not work). See memory
// feedback-coordinator-delegate-and-keep-workers-busy.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const me = process.env.CLAUDE_SESSION_ID;
const t = Date.now();
const OPEN = ['new', 'in_progress', 'open', 'triaged', 'snoozed'];
const TERMINAL = ['completed', 'cancelled', 'archived', 'deferred'];
const termList = '(' + TERMINAL.join(',') + ')';

// (1) harness backlog
const { data: hb } = await db.from('feedback').select('id,title,status,severity,created_at').eq('category', 'harness_backlog').in('status', OPEN).order('created_at', { ascending: false });
const backlog = hb || [];
const high = backlog.filter(r => ['high', 'critical'].includes((r.severity || '').toLowerCase()));

// (2) SD queue
const { data: sd } = await db.from('strategic_directives_v2').select('sd_key,status,current_phase,claiming_session_id').not('status', 'in', termList);
const sds = sd || [];
const unclaimed = sds.filter(s => !s.claiming_session_id);
const claimed = sds.length - unclaimed.length;
const stuck = unclaimed.filter(s => s.status === 'in_progress');

// workers
const { data: sessRaw } = await db.from('claude_sessions').select('session_id,heartbeat_at,sd_key').order('heartbeat_at', { ascending: false }).limit(60);
const live = (sessRaw || []).filter(s => s.session_id !== me && s.heartbeat_at && (t - new Date(s.heartbeat_at).getTime()) < 900000);
const builders = live.filter(s => s.sd_key).length;
const liveIdle = live.filter(s => !s.sd_key).length;

// (3) inbox
const { data: sig } = await db.from('session_coordination').select('id').eq('target_session', me).is('read_at', null).not('payload->>signal_type', 'is', null);
const unread = (sig || []).length;

// sourcing decision: feed the fleet only if there is idle capacity AND the queue can't fill it
const capacity = builders + liveIdle;
const starving = backlog.length > 0 && liveIdle > 0 && unclaimed.length < capacity;
const toSource = starving ? Math.min(backlog.length, capacity - unclaimed.length) : 0;

console.log('[COORD-AUDIT] ' + new Date(t).toISOString());
console.log('  HARNESS BACKLOG : ' + backlog.length + ' open (' + high.length + ' high/critical)');
for (const r of backlog.slice(0, 10)) console.log('      [' + r.status + '/' + (r.severity || '-') + '] ' + String(r.title || '').slice(0, 78));
console.log('  SD QUEUE        : ' + sds.length + ' non-terminal | ' + claimed + ' claimed | ' + unclaimed.length + ' unclaimed | ' + stuck.length + ' stuck(in_progress,unclaimed)');
console.log('  WORKERS         : ' + builders + ' building, ' + liveIdle + ' live-idle');
console.log('  INBOX           : ' + unread + ' unread signals');
console.log('  SOURCE BACKLOG? : ' + (starving
  ? 'YES — source ' + toSource + ' high-priority backlog item(s) into DRAFT SDs (idle capacity + thin queue)'
  : 'no — ' + (backlog.length === 0 ? 'backlog empty'
    : liveIdle === 0 ? 'no idle workers to feed'
    : 'queue has surplus (' + unclaimed.length + ' unclaimed ≥ ' + capacity + ' capacity) → worker-bound, wake workers instead')));
