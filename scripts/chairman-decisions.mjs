#!/usr/bin/env node
// chairman-decisions.mjs — chairman decision queue CLI.
// SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-001.
//
//   list [--json]                                          render the pending queue
//   decide <decision_type:id> <approve|reject|defer|...> --rationale "..."
//
// CONSTITUTIONAL: nothing auto-decides. `decide` without an explicit decision
// argument exits 1 with usage. Every decide performs EXACTLY ONE source write
// and prints what was written. Interactive tool — errors are loud, no fail-soft.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  parseArgs, routeDecision, sortPending, effectivePriority, formatAge, USAGE,
} from '../lib/chairman/decision-queue.mjs';
import { armCliTeardown } from '../lib/cli-graceful-exit.js';
import { CHAIRMAN_FEEDBACK_TYPE } from '../lib/chairman/feedback-decision-type.mjs';

const parsed = parseArgs(process.argv.slice(2));
if (parsed.error) {
  console.error('ERROR: ' + parsed.error + '\n\n' + (parsed.usage || USAGE));
  process.exit(1);
}

const db = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const DECIDED_BY = process.env.CHAIRMAN_DECIDED_BY || 'chairman-cli';

if (parsed.command === 'list') {
  const { data, error } = await db.from('chairman_pending_decisions').select('*').limit(200);
  if (error) {
    console.error('LIST_ERR ' + error.message);
    await armCliTeardown(1); // graceful drain — never process.exit() after a query (UV abort class)
  } else {
    // Sort client-side with the same semantics as the view (also covers a
    // pre-migration view that lacks blocking/effective_priority columns).
    const rows = sortPending(data || []);
    if (parsed.json) {
      console.log(JSON.stringify(rows.map((r) => ({
        ...r,
        effective_priority: r.effective_priority ?? effectivePriority(r).label,
        age_escalated: r.age_escalated ?? effectivePriority(r).escalated,
      })), null, 2));
    } else {
      if (!rows.length) console.log('No pending chairman decisions.');
      for (const r of rows) {
        const ep = effectivePriority(r);
        const pri = (r.effective_priority ?? ep.label) + ((r.age_escalated ?? ep.escalated) ? '^ (age-escalated)' : '');
        const block = r.blocking ? ' BLOCKING' : '';
        console.log(`[${formatAge(r.created_at)}] [${r.decision_type}:${r.id}] [${pri}${block}] ${r.title}` +
          (r.recommendation ? ' — ' + r.recommendation : ''));
      }
      console.log('\n' + rows.length + ' pending. Decide: node scripts/chairman-decisions.mjs decide <decision_type:id> <approve|reject|defer> --rationale "..."');
    }
    await armCliTeardown(0);
  }
}

// ---- decide: exactly ONE source write, routed by decision_type ----
const writers = {
  // chairman_decisions rows — the existing atomic RPC (fn_chairman_decide; the
  // planned name decide_chairman_decision does not exist on the live DB).
  chairmanDecide: async (id, action, rationale) => {
    const { data, error } = await db.rpc('fn_chairman_decide', {
      p_decision_id: id, p_action: action, p_decided_by: DECIDED_BY, p_rationale: rationale,
    });
    if (error) throw new Error('fn_chairman_decide: ' + error.message);
    if (data && data.success === false) throw new Error('fn_chairman_decide refused: ' + (data.error || data.code));
    return { table: 'chairman_decisions', via: 'fn_chairman_decide RPC', id, action, data };
  },
  // feedback rows — resolve with a resolution note.
  resolveFeedback: async (id, status, note) => {
    const { data, error } = await db.from('feedback')
      .update({ status, resolved_at: new Date().toISOString(), resolution_notes: note, resolution_type: 'chairman_decision' })
      .eq('id', id).select('id,status');
    if (error) throw new Error('feedback update: ' + error.message);
    if (!data?.length) throw new Error('feedback row ' + id + ' not found');
    return { table: 'feedback', id, status, note };
  },
  // flag rows — record the chairman call as a feedback row; do NOT toggle the flag.
  recordFlagCall: async (id, decision, rationale) => {
    const { data: flag } = await db.from('leo_feature_flags').select('flag_key').eq('id', id).maybeSingle();
    const { data, error } = await db.from('feedback').insert({
      type: CHAIRMAN_FEEDBACK_TYPE, source_application: 'EHG_Engineer', source_type: 'auto_capture',
      category: 'chairman_flag_decision', status: 'new', severity: 'low',
      title: `Chairman call on flag ${flag?.flag_key || id}: ${decision}`,
      description: rationale || '(no rationale provided)',
      metadata: { flag_id: id, flag_key: flag?.flag_key || null, decision, decided_by: DECIDED_BY, decided_at: new Date().toISOString() },
    }).select('id');
    if (error) throw new Error('flag-call feedback insert: ' + error.message);
    return { table: 'feedback', recorded_decision: decision, flag_id: id, feedback_id: data?.[0]?.id, note: 'flag NOT toggled — use the flag tooling to enact' };
  },
  // okr rows — the existing accept path / reject the generation log row.
  okrAccept: async (id) => {
    const { acceptPendingOkrGeneration } = await import('../lib/eva/jobs/okr-accept-generation.js');
    const r = await acceptPendingOkrGeneration({ supabase: db, generationId: id });
    return { table: 'okr_generation_log (+objectives/key_results)', via: 'acceptPendingOkrGeneration', ...r };
  },
  okrReject: async (id, rationale) => {
    const { data, error } = await db.from('okr_generation_log')
      .update({ status: 'rejected', error_message: '[chairman:reject] ' + (rationale || '(no rationale provided)') })
      .eq('id', id).eq('status', 'pending_chairman_acceptance').select('id,status');
    if (error) throw new Error('okr_generation_log update: ' + error.message);
    if (!data?.length) throw new Error('okr generation ' + id + ' not found or not pending');
    return { table: 'okr_generation_log', id, status: 'rejected' };
  },
  // deferral — durable audit row; the item stays pending (visibility act, not a decision).
  recordDeferral: async (d) => {
    const { data, error } = await db.from('feedback').insert({
      type: CHAIRMAN_FEEDBACK_TYPE, source_application: 'EHG_Engineer', source_type: 'auto_capture',
      category: 'chairman_decision_deferred', status: 'new', severity: 'low',
      title: `Chairman deferred ${d.decisionType}:${d.id}`,
      description: d.rationale || '(no rationale provided)',
      metadata: { decision_type: d.decisionType, target_id: d.id, decided_by: DECIDED_BY, deferred_at: new Date().toISOString() },
    }).select('id');
    if (error) throw new Error('deferral feedback insert: ' + error.message);
    return { table: 'feedback', feedback_id: data?.[0]?.id, note: 'item remains pending' };
  },
};

if (parsed.command === 'decide') {
  try {
    const out = await routeDecision(parsed, writers);
    if (out.error) {
      console.error('ERROR: ' + out.error + '\n\n' + USAGE);
      await armCliTeardown(1);
    } else {
      console.log('DECIDED ' + parsed.decisionType + ':' + parsed.id + ' -> ' + parsed.decision);
      console.log('WROTE (' + out.writer + '): ' + JSON.stringify(out.result));
      await armCliTeardown(0);
    }
  } catch (e) {
    console.error('DECIDE_ERR: ' + e.message);
    await armCliTeardown(1);
  }
}
