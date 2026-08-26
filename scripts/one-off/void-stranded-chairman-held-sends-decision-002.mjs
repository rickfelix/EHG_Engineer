// SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-6) — void the 2 confirmed-live stranded
// chairman_held_sends rows Explore/VALIDATION identified at LEAD-TO-PLAN: 1d7b5399-f1f8-49a5-
// 8104-d5b16459fd05 and e49771f2-4721-4d29-87d2-a66964e77586, both decision_id=9e5aac51-ff7e-
// 424d-9003-77ce7d3c723f.
//
// PROVENANCE (measured live 2026-08-26, re-verified independently at EXEC before this write):
//  - chairman_decisions row 9e5aac51-ff7e-424d-9003-77ce7d3c723f no longer exists (0 rows).
//  - chairman_notifications has 0 rows for decision_id=9e5aac51 either.
//  - Both facts together mean neither held row can EVER complete a release: releaseHeldSend's
//    dispatch path re-enters sendChairmanSMS -> stageDecisionSmsNotification, which requires a
//    live chairman_decisions row to stage against. There is nothing left to stage. This is not a
//    rubric/plumbing bug this SD's fixes could close -- the decision object itself is gone.
//  - e49771f2 (correlation 20efff9b-9a28-4c74-bfd8-5e2bda07e27c): 0 matching session_coordination
//    answer rows -- genuinely never answered by anyone, at any point.
//  - 1d7b5399 (correlation ef7d9ce3-2130-4bba-b5ea-62384a43c9aa): DOES have a genuine verified
//    Solomon "VERDICT: SEND" answer (session_coordination id 657f01de-aeae-4432-9aee-65bbd0a34543,
//    sender_type='solomon'), which is why it was retried 6 times (attempts=6) before this SD's
//    fixes existed -- but even a correct verdict cannot release into a deleted decision. The
//    decision was evidently handled through some other channel before or shortly after that
//    verdict was recorded; this hold is a stale echo of it, not a pending obligation.
//
// Status is set to 'abandoned' (not 'suppressed' or 'released'): the
// chairman_held_sends_suppressed_requires_citation_check and ..._released_requires_citation_check
// CHECK constraints both require release_verdict_answer_row_id IS NOT NULL, which e49771f2
// genuinely has none of (0 answer rows exist to cite) -- an 'abandoned'/'expired' status carries
// no such citation requirement, so this write is honest about what evidence exists for each row
// rather than forcing a citation that isn't there.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const VOIDS = [
  {
    id: '1d7b5399-f1f8-49a5-8104-d5b16459fd05',
    reason: 'void: decision_id 9e5aac51 has no chairman_decisions row (deleted/superseded elsewhere) -- cannot stage a release regardless of the genuine Solomon SEND verdict on session_coordination 657f01de. SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 FR-6.',
  },
  {
    id: 'e49771f2-4721-4d29-87d2-a66964e77586',
    reason: 'void: decision_id 9e5aac51 has no chairman_decisions row (deleted/superseded elsewhere); zero session_coordination answer rows ever matched this correlation -- genuinely unanswered and now un-stageable. SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 FR-6.',
  },
];

const nowIso = new Date().toISOString();
const results = [];
for (const v of VOIDS) {
  const { data, error } = await supabase
    .from('chairman_held_sends')
    .update({
      status: 'abandoned',
      released_at: nowIso,
      last_error: v.reason.slice(0, 500),
      metadata: { void_reason: v.reason, voided_at: nowIso, voided_by: 'SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002' },
    })
    .eq('id', v.id)
    .eq('status', 'held')
    .select('id, status')
    .maybeSingle();
  results.push({ id: v.id, data, error: error ? error.message : null });
}

console.log('VOID_RESULTS', JSON.stringify(results, null, 2));
