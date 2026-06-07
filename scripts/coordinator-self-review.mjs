// coordinator-self-review.mjs — recurring coordinator PERFORMANCE REVIEW, WORK-TRIGGERED (not wall-clock).
// Operator 2026-06-06: cadence should track WORK VOLUME, not a clock — a time-cron wastes cycles through idle
// stretches and doesn't scale with a heavy push. So the review fires only after COORD_REVIEW_EVERY completed
// SDs since the last review. Each run ALWAYS captures any COORDINATOR-FEEDBACK / COORD-REVIEW responses (cheap);
// when the completed-SD delta >= threshold it SOLICITS fresh critique + SYNTHESIZES + resets the counter.
// The cron that invokes this is just a cheap poller (no-op below threshold); the coordinator auto-tears-down
// during genuine idle, so nothing 'runs while nothing happens'. Env: COORD_REVIEW_EVERY (default 8).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createRequire } from 'module';
// SD-LEO-INFRA-COORDINATOR-DISPATCH-TARGET-001: validated dispatch guard.
const { insertCoordinationRow } = createRequire(import.meta.url)('../lib/coordinator/dispatch.cjs');

const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const me = process.env.CLAUDE_SESSION_ID;
const t = Date.now();
const STATE = resolve('.coord-review-last.json');
const REVIEW_EVERY = parseInt(process.env.COORD_REVIEW_EVERY || '8', 10);
const RE = /COORDINATOR-FEEDBACK|COORD-REVIEW/i;
// SD-LEO-INFRA-ADAM-ROLE-FORMALIZATION-001-D / FR-5: Adam's reciprocal response marker.
const ADAM_RE = /ADAM-COORD-FEEDBACK|ADAM-REVIEW/i;

// SD-LEO-INFRA-ADAM-ROLE-FORMALIZATION-001-D / FR-4: split active sessions into
// worker vs Adam participants. DEFAULT-OFF (COORD_ADAM_REVIEW_V1): when OFF this is
// byte-identical to the prior behavior — Adam, like any non-coordinator session,
// stays in `workers`. When ON, role=adam sessions are pulled OUT of the
// worker-framed review into their own bidirectional coordinator<->Adam lane so they
// are not mis-framed with a worker prompt. Pure + exported for unit testing.
export function partitionParticipants(sess, me, adamReviewOn) {
  const active = (sess || []).filter(r => !(r.metadata || {}).is_coordinator && r.session_id !== me);
  const uniq = (rows) => [...new Set(rows.map(r => r.session_id))];
  if (!adamReviewOn) {
    return { workers: uniq(active), adamParticipants: [] };
  }
  return {
    workers: uniq(active.filter(r => (r.metadata || {}).role !== 'adam')),
    adamParticipants: uniq(active.filter(r => (r.metadata || {}).role === 'adam')),
  };
}

// SD-...-001-D: wrapped in a named fn + main-guard so partitionParticipants is
// importable by tests without executing this DB-touching body on import.
export async function selfReviewMain() {
  // 1) ALWAYS capture responses -> durable feedback (cheap; dedup by metadata.review_key)
  const since = new Date(t - 24 * 3600 * 1000).toISOString();
  const { data: sigs } = await db.from('session_coordination').select('id,sender_session,payload,created_at')
    .eq('target_session', me).gt('created_at', since).order('created_at', { ascending: false }).limit(150);
  let captured = 0;
  for (const s of (sigs || [])) {
    const b = String((s.payload || {}).body || (s.payload || {}).message || '');
    if (!RE.test(b)) continue;
    const key = String(s.sender_session || '').slice(0, 8) + ':' + (s.created_at || '').slice(0, 16);
    const { data: ex } = await db.from('feedback').select('id').eq('category', 'coordinator_review').eq('metadata->>review_key', key).limit(1);
    if (ex && ex.length) continue;
    const { error } = await db.from('feedback').insert({
      type: 'enhancement', source_application: 'EHG_Engineer', source_type: 'auto_capture',
      category: 'coordinator_review', status: 'new', severity: 'low',
      title: 'Coordinator review — ' + key, description: b, metadata: { review_key: key, sender_session: s.sender_session }
    });
    if (!error) captured++;
  }

  // 1b) SD-...-001-D / FR-5: capture Adam's reciprocal responses into a DISTINCT
  // category (coordinator_adam_review), flag-gated (default-OFF → byte-identical).
  const adamReviewOn = process.env.COORD_ADAM_REVIEW_V1 === 'on';
  if (adamReviewOn) {
    for (const s of (sigs || [])) {
      const b = String((s.payload || {}).body || (s.payload || {}).message || '');
      if (!ADAM_RE.test(b)) continue;
      const key = String(s.sender_session || '').slice(0, 8) + ':' + (s.created_at || '').slice(0, 16);
      const { data: ex } = await db.from('feedback').select('id').eq('category', 'coordinator_adam_review').eq('metadata->>review_key', key).limit(1);
      if (ex && ex.length) continue;
      const { error } = await db.from('feedback').insert({
        type: 'enhancement', source_application: 'EHG_Engineer', source_type: 'auto_capture',
        category: 'coordinator_adam_review', status: 'new', severity: 'low',
        title: 'Coordinator<->Adam review — ' + key, description: b, metadata: { review_key: key, sender_session: s.sender_session }
      });
      if (!error) captured++;
    }
  }

  // 2) WORK GATE — fire the review only after REVIEW_EVERY completed SDs since the last review
  const { count: completedNow } = await db.from('strategic_directives_v2').select('sd_key', { count: 'exact', head: true }).eq('status', 'completed');
  let state = {}; try { state = JSON.parse(readFileSync(STATE, 'utf8')); } catch { state = {}; }
  const base = (typeof state.lastReviewCompletedCount === 'number') ? state.lastReviewCompletedCount : (completedNow || 0);
  const delta = (completedNow || 0) - base;
  const dueByWork = delta >= REVIEW_EVERY;

  if (!dueByWork) {
    console.log('[COORD-REVIEW] captured ' + captured + ' new; ' + delta + '/' + REVIEW_EVERY + ' completed SDs toward next review (WORK-triggered, not clock). No solicit.');
    if (!('lastReviewCompletedCount' in state)) { try { writeFileSync(STATE, JSON.stringify({ ...state, lastReviewCompletedCount: completedNow })); } catch {} }
    return;
  }

  // 3) DUE — solicit fresh critique from active workers + synthesize, then reset the counter
  const { data: sess } = await db.from('claude_sessions').select('session_id,metadata,heartbeat_at').gte('heartbeat_at', new Date(t - 30 * 60000).toISOString());
  // SD-...-001-D / FR-4: split workers vs Adam participants (default-OFF byte-identical).
  const { workers, adamParticipants } = partitionParticipants(sess, me, adamReviewOn);
  let solicited = 0;
  const body = 'COORDINATOR-FEEDBACK REQUEST (recurring review of the COORDINATOR, triggered by ' + delta + ' SDs shipped since the last review): candid critique of how the coordinator is running the fleet — (1) what worked (routing/sourcing/RCA/conflict-resolution/keeping you fed), (2) friction caused BY the coordinator (slow/missing replies, mis-routing, bad SD sourcing, unclear guidance, missed signals), (3) ONE concrete thing to do differently. Be blunt. Reply: /signal feedback, prefix "COORDINATOR-FEEDBACK".';
  for (const w of workers) {
    await insertCoordinationRow(db, { target_session: w, sender_session: me, subject: 'Coordinator review (every ' + REVIEW_EVERY + ' SDs) — your candid feedback', message_type: 'COACHING', payload: { kind: 'coordinator_reply', body } });
    solicited++;
  }
  // SD-...-001-D / FR-5: bidirectional coordinator<->Adam solicitation (default-OFF).
  let adamSolicited = 0;
  if (adamReviewOn && adamParticipants.length) {
    const adamBody = 'ADAM-REVIEW REQUEST (bidirectional coordinator<->Adam review, ' + delta + ' SDs shipped since last review): candid critique of how the COORDINATOR works WITH Adam — (1) assignment clarity, (2) comms latency / reply timeliness on the advisory lane, (3) dependency handling for Adam-sourced work. Adam: reciprocate with your OWN friction. Reply: /signal feedback, prefix "ADAM-COORD-FEEDBACK". Both sides self-improve (coordinator.md + CLAUDE_ADAM.md).';
    for (const a of adamParticipants) {
      await insertCoordinationRow(db, { target_session: a, sender_session: me, subject: 'Coordinator<->Adam review (every ' + REVIEW_EVERY + ' SDs) — candid bidirectional feedback', message_type: 'COACHING', payload: { kind: 'coordinator_reply', body: adamBody } });
      adamSolicited++;
    }
  }
  try { writeFileSync(STATE, JSON.stringify({ lastReviewCompletedCount: completedNow, lastReviewAt: t })); } catch {}

  const since7 = new Date(t - 14 * 24 * 3600 * 1000).toISOString();
  const { data: all } = await db.from('feedback').select('description,created_at').eq('category', 'coordinator_review').gte('created_at', since7).order('created_at', { ascending: false }).limit(30);
  console.log('[COORD-REVIEW] DUE (' + delta + ' SDs since last review). captured ' + captured + ' new; solicited ' + solicited + ' worker(s)' + (adamReviewOn ? ' + ' + adamSolicited + ' adam' : '') + '; ' + ((all || []).length) + ' reviews on file.');
  if ((all || []).length) {
    console.log('--- recent coordinator reviews (cluster what-worked / friction / one-fix; ADJUST + source concrete fixes as DRAFT SDs) ---');
    for (const r of (all || []).slice(0, 12)) console.log('  ' + (r.created_at || '').slice(5, 16) + ' | ' + String(r.description || '').replace(/\s+/g, ' ').slice(0, 160));
    console.log('[ACTION] Coordinator: cluster -> ADJUST + source concrete coordinator-tooling fixes as SDs; surface a digest to the operator.');
  }
}

// Main-guard: run only when invoked directly (the cron path), not on import (tests).
if (process.argv[1] && /coordinator-self-review\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  selfReviewMain();
}
