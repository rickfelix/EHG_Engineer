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
  parseArgs, routeDecision, sortPending, effectivePriority, formatAge, renderPendingLine, USAGE,
  partitionQueue,
} from '../lib/chairman/decision-queue.mjs';
import { indexDispositions, ageClockFor, DEFERRAL_CATEGORY, DISPOSITION_SELECT } from '../lib/chairman/decision-disposition.mjs';
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
    // FR-c (QF-20260818-249): chairman_unified_decisions excludes rows whose
    // details->>source_decision_type = 'session_question' (they never reach this view), so a
    // real pending session_question is otherwise invisible to this CLI. Fetch them separately and
    // fold in under decision_type='chairman_approval' — the same flattening chairman_all_decision_
    // signals applies to every chairman_decisions row — so `decide` routes them exactly as it would
    // if the view had not excluded them. Fail-soft: a read error here must not blank the real queue.
    let sessionQuestions = [];
    const { data: sq, error: sqErr } = await db.from('chairman_decisions')
      .select('id,decision_type,summary,recommendation,blocking,created_at')
      .eq('decision_type', 'session_question').eq('status', 'pending');
    if (sqErr) {
      console.error('[chairman-decisions] session_question read failed, rendering without it: ' + sqErr.message);
    } else {
      sessionQuestions = (sq || []).map((r) => ({
        id: r.id, decision_type: 'chairman_approval', title: 'session_question: ' + (r.summary || '(no summary)'),
        priority: r.blocking ? 'critical' : 'medium', status: 'pending', blocking: !!r.blocking,
        created_at: r.created_at, recommendation: r.recommendation,
        details: { source_decision_type: 'session_question' },
      }));
    }

    // FR-a/FR-b (QF-20260818-249): 29 of 31 live rows were phantoms drowning the 2 genuine pending
    // decisions — 14 flag_review rows are captured RECORDS of decisions already given verbally
    // (chairman_decision_capture / chairman_ruling_capture / g2_apply_evidence categories), and 14
    // more are automated /heal vision-gap or architecture-gap corrective findings, not chairman
    // asks. Both get their own lane instead of rendering as pending.
    const { pending, records, correctives } = partitionQueue([...(data || []), ...sessionQuestions]);
    // Sort client-side with the same semantics as the view (also covers a
    // pre-migration view that lacks blocking/effective_priority columns).
    const rows = sortPending(pending);
    // FR-6: read the dispositions the queue has never read. Measured live, SEVEN of seven rows
    // carry a deferral — several twice — every one within ~1.3 days. (An early estimate said five
    // of seven; the measurement superseded it.) Ageing them from created_at is what makes a
    // settled queue present as stale and escalating.
    // Fail-soft: a disposition read that errors leaves the prior behaviour intact rather than
    // taking down the chairman's list.
    let dispositions = null;
    try {
      // DISPOSITION_SELECT, not a hand-written column list: the provenance fence needs
      // source_type/venture_id/feedback_type, and a list that drifts from it silently disables
      // FR-6 entirely (it already did once — see DISPOSITION_SELECT's docstring).
      const { data: disp, error: dErr } = await db.from('feedback')
        .select(DISPOSITION_SELECT)
        .eq('category', DEFERRAL_CATEGORY);
      // supabase-js RETURNS PostgREST failures in `error`; it does not throw. So the catch below
      // never sees them, and an `if (!dErr)` with no else left the most likely failure — a drifted
      // DISPOSITION_SELECT yielding a 400 — completely silent, rendering an uncorrected queue that
      // looks healthy. That is the same blindness that let a dead FR-6 ship green, arriving through
      // the error channel instead of the empty-result one.
      if (dErr) {
        console.error('[chairman-decisions] disposition query FAILED, rendering uncorrected: ' + dErr.message);
      } else {
        dispositions = indexDispositions(disp || []);
      }
    } catch (e) {
      // Fail-soft: render without the correction rather than not at all. NOT silent — a swallowed
      // error here is indistinguishable from "no deferrals exist", which is the failure mode that
      // let a dead FR-6 look healthy.
      console.error('[chairman-decisions] disposition read failed, rendering uncorrected: ' + (e?.message || e));
    }

    if (parsed.json) {
      console.log(JSON.stringify(rows.map((r) => {
        const clock = ageClockFor(r, dispositions);
        const deferred = clock.source === 'deferral';
        const ep = effectivePriority(deferred ? { ...r, created_at: clock.since } : r);
        return {
          ...r,
          effective_priority: deferred ? ep.label : (r.effective_priority ?? ep.label),
          age_escalated: deferred ? ep.escalated : (r.age_escalated ?? ep.escalated),
          // Surfaced so a machine reader can see WHY the clock moved, not just that it did.
          disposition: clock.disposition
            ? { deferred_at: clock.disposition.deferredAt, decided_by: clock.disposition.decidedBy, cited_record: clock.disposition.sourceId }
            : null,
          age_since: clock.since,
          age_clock_source: clock.source
        };
      }), null, 2));
    } else {
      if (!rows.length) console.log('No pending chairman decisions.');
      for (const r of rows) console.log(renderPendingLine(r, { dispositions }));
      console.log('\n' + rows.length + ' pending. Decide: node scripts/chairman-decisions.mjs decide <decision_type:id> <approve|reject|defer> --rationale "..."');
      // FR-a/FR-b (QF-20260818-249): own lane, not silently dropped — a chairman who wants to see
      // WHY the count changed can still find them, without them drowning the real pending items.
      if (records.length) console.log(records.length + ' captured decision record(s) hidden (already decided — verbal/ruling capture or G2 apply evidence).');
      if (correctives.length) console.log(correctives.length + ' vision/architecture-gap corrective finding(s) hidden — see /heal status.');
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
