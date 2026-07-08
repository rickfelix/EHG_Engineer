#!/usr/bin/env node
// SD-LEO-INFRA-DECISION-BINDING-PRIMITIVE-001 FR-4: consult-answer-binding consumer.
//
// Closes Solomon's Mode-B "ANSWER-DELIVERED-not-CONSUMER-UNBLOCKED" finding: a
// consult answer delivered via the advisory lane (scripts/solomon-advisory.cjs,
// scripts/adam-advisory.cjs) is recorded here as a disposition_row AND the
// specific strategic_directives_v2.metadata field it was meant to unblock is
// transitioned in the same call -- so "answered" and "unblocked" can no longer
// silently diverge.
//
// question_key is derived from the question TEXT content scoped to
// (sdKey, blockedStateKey) -- never from correlation_id -- so a re-asked
// question in a brand-new session dedups against the same disposition row
// instead of creating a phantom duplicate. Scoping by sdKey/blockedStateKey
// (not just raw question text) prevents two unrelated SDs that happen to ask
// an identically-worded question from colliding onto the same disposition row.

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { recordDisposition } from '../lib/decision-binding/disposition.js';

/**
 * Bind a delivered consult answer to the SD-metadata blocked-state it
 * unblocks, recording the disposition and flipping the named metadata field
 * to unblocked in one call.
 *
 * @param {object} supabase
 * @param {object} params
 * @param {string} params.sdKey - strategic_directives_v2.sd_key to update
 * @param {string} params.blockedStateKey - dot-path metadata field to clear, e.g. "blocked_on_solomon_consult"
 * @param {string} params.questionText - the consult question, verbatim (the dedup key content)
 * @param {string} params.answer - the delivered answer
 * @param {string} params.authority - who answered (e.g. "solomon", "adam", session id)
 * @returns {Promise<{disposition: object, sdUpdated: boolean}>}
 */
export async function bindConsultAnswer(supabase, { sdKey, blockedStateKey, questionText, answer, authority }) {
  if (!sdKey) throw new Error('bindConsultAnswer: sdKey is required');
  if (!blockedStateKey) throw new Error('bindConsultAnswer: blockedStateKey is required');
  if (!questionText) throw new Error('bindConsultAnswer: questionText is required');

  const { row } = await recordDisposition(supabase, {
    decisionType: 'consult_answer',
    subject: { sd_key: sdKey, blocked_state_key: blockedStateKey, question_text: questionText },
    decisionKey: `${sdKey}:${blockedStateKey}`,
    authority,
    answerPayload: { answer },
  });

  const { data: sdRow, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', sdKey)
    .single();
  if (fetchError) {
    throw new Error(`bindConsultAnswer: could not read SD "${sdKey}": ${fetchError.message}`);
  }

  const nextMetadata = {
    ...(sdRow.metadata || {}),
    [blockedStateKey]: false,
    [`${blockedStateKey}_disposition_question_key`]: row.payload.question_key,
    [`${blockedStateKey}_unblocked_at`]: new Date().toISOString(),
  };

  // .select() + affected-row check: a bare .update() can silently no-op on
  // zero matched rows (stale/mismatched sd_key, RLS) and still report no
  // error -- the known supabase-js false-success pattern in this codebase.
  const { data: updatedRows, error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: nextMetadata })
    .eq('sd_key', sdKey)
    .select('sd_key');
  if (updateError) {
    throw new Error(`bindConsultAnswer: could not update SD "${sdKey}" metadata: ${updateError.message}`);
  }
  if (!updatedRows || updatedRows.length === 0) {
    throw new Error(`bindConsultAnswer: update matched 0 rows for SD "${sdKey}" -- metadata was NOT cleared, blocked-state remains set`);
  }

  return { disposition: row, sdUpdated: true };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sd-key') out.sdKey = argv[++i];
    else if (a === '--blocked-state-key') out.blockedStateKey = argv[++i];
    else if (a === '--question') out.questionText = argv[++i];
    else if (a === '--answer') out.answer = argv[++i];
    else if (a === '--authority') out.authority = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const result = await bindConsultAnswer(supabase, args);
  console.log(`Consult answer bound: question_key=${result.disposition.payload.question_key}, SD "${args.sdKey}".${args.blockedStateKey} unblocked.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('consult-answer-bind: FAILED:', err.message);
    process.exit(1);
  });
}
