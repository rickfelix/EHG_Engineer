// coordinator-fleet-retro.mjs — the fleet's recurring SELF-IMPROVEMENT loop ("continuous performance review").
//
// Workers emit a FLEET-RETRO /signal at EACH SD completion: what worked / what was friction in the
// coordinator<->worker collaboration / one improvement idea. This script, on a recurring cron:
//   (1) CAPTURES those FLEET-RETRO signals into the durable `feedback` table (category='fleet_retro')
//       so they survive the coordination-message sweep and ACCUMULATE across sessions;
//   (2) SYNTHESIZES recent retros (prints them) so the coordinator can ADJUST — update the wake-up
//       prompt / coordinator behavior / file harness SDs for recurring friction.
// Distinct from /learn (which retros the SD WORK -> issue_patterns); this retros the FLEET PROCESS.
// See docs/protocol/fleet-coordinator-and-worker-behavior.md + memory feedback-fleet-retro-self-improvement-loop.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { stampLastFired } from '../lib/periodic-liveness/stamp-last-fired.js';

const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const t = Date.now();
const RETRO_RE = /FLEET[\s-]?RETRO/i;

(async () => {
  // ── 1) CAPTURE: pull FLEET-RETRO signals from the (ephemeral) coordination channel into durable feedback ──
  const since = new Date(t - 24 * 3600 * 1000).toISOString();
  const { data: sigs } = await db.from('session_coordination')
    .select('id,sender_session,payload,created_at').gt('created_at', since).order('created_at', { ascending: false }).limit(150);
  const retros = (sigs || []).filter(s => RETRO_RE.test(String((s.payload || {}).body || (s.payload || {}).message || '')));
  let captured = 0, errs = 0;
  for (const s of retros) {
    const body = String((s.payload || {}).body || (s.payload || {}).message || '');
    const key = String(s.sender_session || '').slice(0, 8) + ':' + (s.created_at || '').slice(0, 16);
    const { data: ex } = await db.from('feedback').select('id').eq('category', 'fleet_retro').eq('metadata->>retro_key', key).limit(1);
    if (ex && ex.length) continue;
    // NOTE: feedback.source_id is a uuid column and feedback.type is NOT NULL — the dedup key
    // lives in metadata.retro_key (NOT source_id), and type must be 'issue'|'enhancement'.
    const { error } = await db.from('feedback').insert({
      type: 'enhancement', source_application: 'EHG_Engineer', category: 'fleet_retro', source_type: 'auto_capture',
      title: 'Fleet retro — ' + key, description: body, status: 'new', severity: 'low',
      metadata: { retro_key: key, sender_session: s.sender_session }
    });
    if (error) { errs++; if (errs === 1) console.log('  [insert note] ' + error.message); }
    else captured++;
  }

  // ── 2) SYNTHESIZE: recent durable retros for the coordinator to act on ──
  const since7 = new Date(t - 7 * 24 * 3600 * 1000).toISOString();
  const { data: all } = await db.from('feedback').select('description,created_at')
    .eq('category', 'fleet_retro').gte('created_at', since7).order('created_at', { ascending: false }).limit(50);
  console.log('[FLEET-RETRO] captured ' + captured + ' new this run' + (errs ? ' (' + errs + ' insert errors)' : '') + '; ' + (all || []).length + ' retros in last 7d.');
  if ((all || []).length) {
    console.log('--- recent worker retros (coordinator: synthesize themes + ADJUST) ---');
    for (const r of (all || []).slice(0, 15)) console.log('  ' + (r.created_at || '').slice(5, 16) + ' | ' + String(r.description || '').replace(/\s+/g, ' ').slice(0, 170));
    console.log('[ACTION] Coordinator: cluster these into what-worked / friction / suggestions; ADJUST (wake-up prompt, coordinator behavior, or file a harness SD for recurring friction). Surface a digest to the operator when a clear pattern emerges.');
  } else {
    console.log('(no fleet retros yet — workers emit them at SD completion via /signal)');
  }

  try {
    await stampLastFired(db, 'standard_loop:fleet-retro');
  } catch (err) {
    console.error(`[FLEET-RETRO] stampLastFired failed (non-fatal): ${err.message}`);
  }
})();
