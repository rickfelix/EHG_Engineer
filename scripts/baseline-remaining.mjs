#!/usr/bin/env node
/**
 * SD-LEO-INFRA-FILING-TOOLS-ENFORCE-001 (FR-5)
 *
 * Read-only reader for the frozen harness-backlog baseline (chairman ratification e38df53f,
 * feedback row 58cc4231-1710-4693-97ff-723e3685a2e4). Recomputes the ORIGINAL freeze sha256
 * over the row's live metadata.baseline content and fails loud on mismatch, then prints
 * BASELINE_REMAINING sd=<N> qf=<M> -- counts of baseline ids that are still non-terminal.
 *
 * Non-terminal definition is PINNED to the deny-list (metadata.finish_line's prose: "every
 * sd_key and qf_id in baseline reaches completed or cancelled") over the allow-list
 * (metadata.open_definition's explicit status sets) -- fail-closed: a future status value not
 * yet in either list still counts as remaining under the deny-list, never silently dropped
 * into a false zero. metadata.open_definition is read and logged for cross-check only.
 *
 * NEVER writes to the feedback table (immutability trigger:
 * database/chairman-gated/20260907_feedback_immutability_trigger.sql rejects all updates).
 *
 * Usage: node scripts/baseline-remaining.mjs
 */

import 'dotenv/config';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { recordPendingDecision } from '../lib/chairman/record-pending-decision.mjs';
import { isMainModule } from '../lib/utils/is-main-module.js';

export const BASELINE_FEEDBACK_ID = '58cc4231-1710-4693-97ff-723e3685a2e4';
const FINISH_LINE_DECISION_TYPE = 'harness_baseline_finish_line';
const TERMINAL_STATUSES = new Set(['completed', 'cancelled']);

/** Pure: the confirmed original freeze algorithm. CAMELCASE keys are load-bearing. */
export function computeBaselineHash({ sdKeys, qfIds }) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ sdKeys, qfIds }))
    .digest('hex');
}

/**
 * Fetch the baseline row's current status counts for sd_keys/qf_ids, using the deny-list
 * (finish_line) definition of non-terminal. Throws on any query error -- never coerces an
 * errored select to a zero count.
 */
export async function computeRemaining(supabase, { sdKeys, qfIds }) {
  const { data: sds, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, status')
    .in('sd_key', sdKeys);
  if (sdErr) throw new Error(`BASELINE_QUERY_FAILED: strategic_directives_v2 query failed: ${sdErr.message}`);

  const { data: qfs, error: qfErr } = await supabase
    .from('quick_fixes')
    .select('id, status')
    .in('id', qfIds);
  if (qfErr) throw new Error(`BASELINE_QUERY_FAILED: quick_fixes query failed: ${qfErr.message}`);

  const remainingSd = (sds || []).filter((s) => !TERMINAL_STATUSES.has(s.status)).length;
  const remainingQf = (qfs || []).filter((q) => !TERMINAL_STATUSES.has(q.status)).length;
  return { remainingSd, remainingQf, sdRows: sds || [], qfRows: qfs || [] };
}

/**
 * FR-6: surface the finish line to the chairman exactly once, when sd=0 and qf=0.
 * Idempotent on decisionType -- checks for an existing chairman_decisions row of
 * decisionType before recording another.
 */
export async function maybeSurfaceFinishLine(supabase, { remainingSd, remainingQf }) {
  if (remainingSd !== 0 || remainingQf !== 0) return { surfaced: false, reason: 'not_at_finish_line' };

  const { data: existing, error } = await supabase
    .from('chairman_decisions')
    .select('id')
    .eq('decision_type', FINISH_LINE_DECISION_TYPE)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`BASELINE_QUERY_FAILED: chairman_decisions idempotency check failed: ${error.message}`);
  if (existing) {
    console.log(`Finish line already surfaced (chairman_decisions ${existing.id}) -- no-op.`);
    return { surfaced: false, reason: 'already_surfaced', id: existing.id };
  }

  const result = await recordPendingDecision(supabase, {
    title: 'Harness backlog baseline reached zero — clean-slate test venture ready (ratification 3c4a6781)',
    decisionType: FINISH_LINE_DECISION_TYPE,
    context: `The harness backlog baseline frozen in feedback ${BASELINE_FEEDBACK_ID} (chairman ratification e38df53f, 2026-09-14) has reached zero remaining items (sd=0, qf=0). Per ratification 3c4a6781, this is the signal to bring the clean-slate test venture back to the chairman.`,
    recommendation: 'Review the clean-slate test venture (ratification 3c4a6781) and decide whether to proceed.',
    blocking: true,
  });
  if (!result.recorded) throw new Error(`BASELINE_FINISH_LINE_RECORD_FAILED: ${result.error || 'unknown error'}`);
  console.log(`Finish line surfaced: chairman_decisions ${result.id}`);
  return { surfaced: true, id: result.id };
}

export async function run(supabase) {
  const { data: row, error } = await supabase
    .from('feedback')
    .select('id, metadata')
    .eq('id', BASELINE_FEEDBACK_ID)
    .maybeSingle();
  if (error) throw new Error(`BASELINE_QUERY_FAILED: feedback row query failed: ${error.message}`);
  if (!row) throw new Error(`BASELINE_ROW_NOT_FOUND: feedback row ${BASELINE_FEEDBACK_ID} does not exist`);

  const baseline = row.metadata?.baseline;
  const storedHash = row.metadata?.sha256;
  if (!baseline?.sd_keys || !baseline?.qf_ids || !storedHash) {
    throw new Error('BASELINE_MALFORMED: feedback row is missing metadata.baseline.sd_keys/qf_ids or metadata.sha256');
  }

  const recomputed = computeBaselineHash({ sdKeys: baseline.sd_keys, qfIds: baseline.qf_ids });
  if (recomputed !== storedHash) {
    throw new Error(
      `BASELINE_HASH_MISMATCH: recomputed sha256 (${recomputed}) does not match stored metadata.sha256 (${storedHash}) -- ` +
      'the baseline row has been tampered with or corrupted. Refusing to report a count.'
    );
  }

  const { remainingSd, remainingQf } = await computeRemaining(supabase, {
    sdKeys: baseline.sd_keys,
    qfIds: baseline.qf_ids,
  });

  console.log(`BASELINE_REMAINING sd=${remainingSd} qf=${remainingQf}`);
  await maybeSurfaceFinishLine(supabase, { remainingSd, remainingQf });
  return { remainingSd, remainingQf };
}

if (isMainModule(import.meta.url)) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  run(supabase).catch((err) => {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  });
}
