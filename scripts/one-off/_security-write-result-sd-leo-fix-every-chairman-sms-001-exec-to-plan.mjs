#!/usr/bin/env node
/**
 * Write SECURITY sub-agent EXEC-TO-PLAN verdict for SD-LEO-FIX-EVERY-CHAIRMAN-SMS-001
 * (chairman-SMS inbound `no_open_question` outcome, escalated from QF-20260913-173).
 *
 * Canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js applySubAgentRepoVerdict)
 * + canonical storage (lib/sub-agent-executor/results-storage.js storeSubAgentResults) —
 * no hand-rolled INSERT, per CLAUDE.md prologue rule 11.
 *
 * Provenance: the CHECK-constraint definition below was read LIVE from pg_constraint via
 * scripts/discover-schema-constraints.js discoverConstraintsViaSupabase, not from the .sql file.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '179db363-b3bd-4e62-b805-90a627476626';
const SD_KEY = 'SD-LEO-FIX-EVERY-CHAIRMAN-SMS-001';

const LIVE_CONSTRAINT_DEF = "CHECK ((outcome = ANY (ARRAY['answered'::text, 'expired'::text, 'no_match'::text, 'invalid_signature'::text, 'rate_limited'::text, 'ambiguous'::text, 'suspended'::text, 'undone'::text, 'no_open_question'::text])))";

const findings = [
  {
    id: 'S1-abuse-counter-narrowed-by-reclassification',
    severity: 'LOW',
    summary: "GENUINE SECURITY DELTA, contained and intentional. checkAndApplyUnmatchedAutoSuspend (sms-bridge.js:655-660) counts sms_inbound_log rows WHERE outcome IN UNMATCHED_OUTCOMES = ['no_match','ambiguous'] over a 60-min window and persistently suspends a sender at AUTO_SUSPEND_UNMATCHED_THRESHOLD=3. `no_open_question` is NOT in that list, so inbound replies that previously landed in this branch as `no_match` (and therefore accrued suspension credit on any LATER invocation of the counter, since the counter re-reads the table by outcome) no longer accrue it. CONTAINMENT, measured not assumed: (a) an attacker cannot reach this branch at all without a VALID Twilio signature — `if (!signatureValid)` returns at :725 with outcome invalid_signature, long before candidate lookup; (b) the sender must already be a recipient of an SMS *decision notification* (a chairman_notifications row with channel='sms', recipient_phone=from, decision_id NOT NULL) or candidateIds is empty and the code returns `no_match` at :754 via logInboundUnmatched, which DOES still count; (c) the all-outcome rate limiter at :731-740 (INBOUND_RATE_LIMIT=5 per 60 min) has NO outcome filter and is therefore completely unaffected — the sender is still hard-capped at 5 inbound rows/hour; (d) the verified CHAIRMAN_PHONE was ALREADY exempt from this counter (:644), so the delta is exactly zero for the chairman's own number. Residual impact for the narrow remaining population (a non-chairman number the system itself texted a decision to, whose most recent candidate has gone terminal): loss of one defence-in-depth suspension signal, with no resolution power gained — the branch returns {resolved:false} and writes nothing to chairman_decisions. Accepted as intentional; see recommendation R1."
  },
  {
    id: 'S2-VERIFIED-terminal-candidate-cannot-be-reconsumed',
    severity: 'INFO',
    summary: "VERIFICATION ASK (a) — CLEAN. The only variable that can become an actionable decision is `const decision = eligible[0] || null` (:818), and `eligible` (:807-809) is filtered on d.status === 'pending' && !d.sms_reply_used_at && d.sms_reply_token_expires_at && new Date(...) >= now. Those three lines are BYTE-IDENTICAL to main — `git diff main...HEAD -- lib/chairman/sms-bridge.js` produces exactly TWO hunks (@@ -91,12 +91,17 @@ and @@ -814,11 +819,22 @@), neither of which touches the eligibility filter, the UNDO path, the atomic claim UPDATE ... .is('sms_reply_used_at', null) (:882-887), or consumeSmsReply. The new branch executes ONLY inside `if (!decision)`, i.e. after eligibility has already failed, and its entire effect is one `logInbound` INSERT plus `return { resolved: false, outcome }`. No brief_data merge, no sms_reply_used_at stamp, no undo_deadline, no stampSmsChannel, no consumed_at. `no_open_question` and `expired` are therefore structurally incapable of approval-equivalent side effects."
  },
  {
    id: 'S3-VERIFIED-signature-and-eligibility-gating-unchanged',
    severity: 'INFO',
    summary: "VERIFICATION ASK (b) — CLEAN, verified against the diff rather than the claim. Order of gates in handleInboundSmsReply is unchanged: (1) checkAndApplyAutoSuspend fail-closed on an active persistent suspension (:720-723, BEFORE signature — deliberate); (2) `if (!signatureValid)` -> log invalid_signature, feed the invalid-signature flood counter, return (:725-729); (3) rate limit (:731-740); (4) candidate lookup bounded by CANDIDATE_NOTIFICATION_LOOKBACK=5 (:742-749). None of these lines appear in either diff hunk. The set of decisions eligible for MATCHING is likewise unwidened — the fix only relabels a reply that has ALREADY been refused. Note also that `invalid_signature` is absent from PARK_OUTCOMES, so a spoofed sender claiming the chairman's number never reaches the park/route block at :1074 regardless of this change."
  },
  {
    id: 'S4-VERIFIED-migration-additive-only-live-confirmed',
    severity: 'INFO',
    summary: `VERIFICATION ASK (migration) — CLEAN, and confirmed AGAINST THE LIVE CATALOG, not against the .sql file. Read via discoverConstraintsViaSupabase(supabase,'sms_inbound_log') at review time: ${LIVE_CONSTRAINT_DEF}. That is the original 8 values plus 'no_open_question', and the CHECK is present/enforced (not dropped). The migration body is exactly: BEGIN; DROP CONSTRAINT IF EXISTS; ADD CONSTRAINT ... CHECK (9 values); COMMENT ON COLUMN; COMMIT. A case-insensitive scan for rls|grant|revoke|policy|role|security|drop table|alter column returns ZERO hits — no RLS enablement/disablement, no policy, no grant/revoke, no column or table mutation. Additive: a live count of sms_inbound_log rows WHERE outcome='no_open_question' returns 0 against 574 total rows, so no historical row was reclassified by the widening. The applied-state matters for security, not just correctness: logInbound is fail-soft (:579-581, warn-and-continue), so had the constraint NOT been widened, every no_open_question insert would have silently dropped the whole audit row AND under-counted all three abuse controls that COUNT this table (the file's own documented blast radius). It is applied, so that hazard is closed.`
  },
  {
    id: 'S5-VERIFIED-no-new-privileged-path-from-attacker-controlled-body',
    severity: 'INFO',
    summary: "VERIFICATION ASK (PARK/ADAM widening) — CLEAN. Reaching the routing block requires ALL of: a valid Twilio signature (invalid_signature is not in PARK_OUTCOMES), PARK_OUTCOMES.includes(outcome) AND `isVerifiedChairman` — phoneKey(row.from_phone) === phoneKey(process.env.CHAIRMAN_PHONE) (:1071-1074). A non-chairman number emitting no_open_question gets a log row and nothing else: no park, no route, no coordination row. For the chairman number the behaviour is IDENTICAL to what these same messages already did before the fix, because `no_match` was ALREADY in both PARK_OUTCOMES and ADAM_ROUTABLE_OUTCOMES — the widening moves the outcome label, not the privilege. The delivered artefact is a coordination row with message_type 'INFO' and payload.kind 'adam_action_required' carrying a 320-char-truncated body (:1120-1134) — an informational lane item, not an executable directive; it grants no capability and is the same lane no_match, rate_limited and scripts/adam-adherence-staleness-check.mjs already use. The outcome string itself is a hardcoded literal (:832/834/836) and is never derived from the message body, so it is not attacker-selectable."
  },
  {
    id: 'S6-VERIFIED-no-injection-no-new-query-surface-no-new-pii',
    severity: 'INFO',
    summary: "VERIFICATION ASKS (c) and (4) — CLEAN. (Injection) The new branch issues ZERO queries; it reads an already-fetched Map. Every surrounding query uses the supabase-js parameterised builder (.eq/.in/.gte/.is) — no string-built SQL anywhere in handleInboundSmsReply, and `body` is never interpolated into a query. The candidate set stays bounded by .limit(CANDIDATE_NOTIFICATION_LOOKBACK=5) plus .in(candidateIds), so no unbounded query surface is added. (Secrets/PII) The branch adds NO new field to any log row or payload — the logInbound call at :838 is byte-identical to main apart from the value of the existing `outcome` string, and the insertCoordinationRow payload at :1127 is not in the diff at all. Worth recording positively: the candidate select at :760 deliberately fetches sms_reply_token_expires_at but NOT sms_reply_token, so the single-use reply token is never loaded into this code path and cannot leak into a log row or an Adam-lane payload. body_raw/from_phone persistence in sms_inbound_log is pre-existing audit behaviour, unchanged."
  },
  {
    id: 'S7-errored-candidate-select-degrades-into-the-no_match-arm',
    severity: 'INFO',
    summary: "PRE-EXISTING, NOT INTRODUCED, but the new three-way branch now depends on it. Line 758 destructures only `{ data: candidateDecisions }` and discards `error`. On a transient failure, data is null -> byId is empty -> mostRecent is undefined -> the new if/else-if both fail -> outcome is `no_match`. That is fail-CLOSED for resolution (eligible is likewise empty, so nothing can be granted), which is the security-critical property and it holds. The residual is diagnostic: a database error reads as 'the chairman matched nothing', the exact class of conflation this SD exists to remove — one layer up. Not attributable to this change and not blocking; noted so PLAN can decide whether the SD's own thesis should extend to it."
  },
  {
    id: 'S8-adam-subject-line-misdescribes-the-new-outcome',
    severity: 'INFO',
    summary: "Cosmetic/diagnostic, not a security defect. The routed coordination row's subject (:1124-1126) is a two-way ternary that special-cases only 'rate_limited'; a no_open_question row is therefore titled 'Chairman free-form SMS matched no known pattern' — the precise mischaracterisation this SD removes from sms_inbound_log is reproduced in the Adam-facing subject. The truth is recoverable: the body string interpolates `outcome=${outcome.outcome}` verbatim. Flagged because Adam triages by subject."
  },
];

const recommendations = [
  "R1 (NON-BLOCKING, security-documentation): add an explicit one-line comment at UNMATCHED_OUTCOMES (sms-bridge.js:86) recording that `no_open_question` is DELIBERATELY excluded and why (a candidate notification provably exists, so the reply is genuine-but-late, consistent with expired/rate_limited already being excluded). Today both sibling lists (PARK_OUTCOMES, ADAM_ROUTABLE_OUTCOMES) carry explicit QF-20260913-173 rationale for the value's PRESENCE, while the one list where the value's ABSENCE is the security-relevant decision carries none — the rationale currently lives only in a TESTING evidence row, so a future reader cannot distinguish 'deliberate' from 'forgotten' and may 'fix' it either way.",
  "R2 (NON-BLOCKING): extend the :1124 subject ternary to name no_open_question explicitly (e.g. 'Chairman SMS answered an already-decided question'), so the Adam lane's triage surface does not reproduce the conflation this SD removes from sms_inbound_log (S8).",
  "R3 (INFO, out of scope): consider checking the discarded `error` on the candidateDecisions select (:758) so a transient DB failure is distinguishable from a genuine no_match (S7). Fail-closed today; purely a diagnostic-honesty gap.",
];

const summary = "PASS. All four verification asks were checked against the code and the live catalog, not against the change description. The diff is exactly two hunks; the signature gate (:725), the persistent-suspension fail-closed check (:720), the rate limiter (:731), the eligibility filter (:807-809), the atomic single-use claim (:882-887) and consumeSmsReply are all byte-identical to main. The new branch runs only after a reply has ALREADY been refused and its entire effect is one audit INSERT plus a return — a terminal or token-lapsed decision remains structurally incapable of yielding an approval-equivalent side effect. The migration was confirmed applied by reading pg_get_constraintdef LIVE (9 values, CHECK present and enforced) with 0 of 574 existing rows reclassified, and contains no RLS/grant/policy/column DDL. The PARK/ADAM widening grants nothing new: routing is gated on a valid signature AND the verified CHAIRMAN_PHONE, delivers an INFO-class coordination row on the lane no_match already used, and the outcome string is a hardcoded literal never derived from the message body. No new secrets or PII — notably the candidate select fetches sms_reply_token_expires_at but never sms_reply_token, so the single-use token cannot leak into a log row or an Adam payload. ONE genuine security delta exists (S1): reclassifying these events out of `no_match` removes them from the FR-4 unmatched auto-suspend counter's outcome filter. It is intentional and contained — unreachable without a valid Twilio signature, requires the sender to already be a decision-notification recipient, leaves the all-outcome 5/hour rate limiter untouched, and is a zero-delta for the chairman number which was already exempt. LOW severity, no privilege gained, so PASS with a documentation recommendation rather than CONDITIONAL_PASS.";

const justification = `VERDICT BASIS — what was read and measured, not what was asserted.

READ #1 (diff shape, the load-bearing check for asks (a) and (b)):
  git diff main...HEAD -- lib/chairman/sms-bridge.js | grep '^@@'
  => EXACTLY two hunks: "@@ -91,12 +91,17 @@" (the two outcome-list constants) and
     "@@ -814,11 +819,22 @@" (the diagnostic-label if/else-if/else).
  A targeted grep of the diff's +/- lines for signatureValid | eligible | sms_reply_token_expires_at
  | UNMATCHED_OUTCOMES returned only the relabelled condition itself. Therefore the signature gate,
  the suspension fail-closed check, the rate limiter, the eligibility filter, the UNDO path, the
  atomic claim and consumeSmsReply are unchanged by construction, not by inspection alone.

READ #2 (full function, :690-902, plus :540-690 and :1020-1150):
  Confirmed the ONLY route from inbound text to a mutated chairman_decisions row is
  eligible[0] -> the .is('sms_reply_used_at', null) conditional UPDATE, and that the new branch
  sits strictly inside the already-refused 'if (!decision)' arm.

MEASURED #3 (live catalog, read-only, via scripts/discover-schema-constraints.js):
  sms_inbound_log_outcome_check => ${LIVE_CONSTRAINT_DEF}
  ACCEPTS_no_open_question = true. Rows already carrying the new value = 0 of 574 total.
  This matters beyond correctness: logInbound is fail-soft, so an UNAPPLIED constraint would have
  silently dropped the entire audit row for every no_open_question event and under-counted all
  three abuse controls that count this table. Verified applied, hazard closed.

MEASURED #4 (consumer sweep for a silently-dropping allow-list):
  grep for 'no_match' across scripts/ lib/ api/ server/ — no sms_inbound_log consumer filters on
  an outcome allow-list. parked-sms-audit.mjs:32 tests outcome === 'answered' only (so a
  no_open_question row is never auto-classified as handled — conservative, fails toward
  visibility); sms-relay-drain.cjs:74 builds an open-ended tally keyed by outcome. No consumer
  drops the new value.

WHY PASS AND NOT CONDITIONAL_PASS: every asked-for property holds, verified at the level the ask
demanded (diff bytes for the signature claim, live catalog for the migration claim). The single
genuine delta (S1) trades a defence-in-depth suspension signal for correct classification, is
gated behind Twilio signature validation and the unchanged 5/hour rate limiter, is zero-impact
for the chairman number that this channel exists to serve, and grants no capability whatsoever.
Documenting the deliberate exclusion (R1) is the right remedy, and it does not need to gate the
EXEC-TO-PLAN handoff.`;

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 93,
    findings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [],
    metadata: {
      measured: true,
      review_type: 'adversarial code review + live catalog introspection (read-only)',
      diff_hunks: ['@@ -91,12 +91,17 @@ (PARK_OUTCOMES / ADAM_ROUTABLE_OUTCOMES)', '@@ -814,11 +819,22 @@ (diagnostic outcome label)'],
      unchanged_verified_byte_level: [
        'signature gate sms-bridge.js:725-729',
        'persistent-suspension fail-closed check :720-723',
        'inbound rate limiter :731-740 (no outcome filter)',
        'eligibility filter :807-809 (status pending + unused + unexpired token)',
        'atomic single-use claim :882-887 (.is(sms_reply_used_at, null))',
        'UNDO path :772-805',
        'consumeSmsReply :934-993',
        "UNMATCHED_OUTCOMES declaration :86 (['no_match','ambiguous'])",
      ],
      live_constraint_read: {
        source: "pg_constraint via discoverConstraintsViaSupabase(supabase,'sms_inbound_log')",
        constraint_name: 'sms_inbound_log_outcome_check',
        definition: LIVE_CONSTRAINT_DEF,
        accepts_no_open_question: true,
        enforced: true,
        rows_with_new_value: 0,
        total_rows: 574,
      },
      migration_ddl_scan: 'case-insensitive scan for rls|grant|revoke|policy|role|security|drop table|alter column => ZERO hits; body is DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT CHECK(9) + COMMENT ON COLUMN inside BEGIN/COMMIT',
      owasp_checks: {
        injection: 'PASS — new branch issues no query; all surrounding queries use the parameterised supabase-js builder; body never interpolated into SQL',
        broken_access_control: 'PASS — routing gated on valid signature AND phoneKey(from)===phoneKey(CHAIRMAN_PHONE); no_open_question grants no capability',
        sensitive_data_exposure: 'PASS — no new field logged; candidate select fetches sms_reply_token_expires_at but NEVER sms_reply_token',
        security_misconfiguration: 'PASS — migration touches no RLS/grant/policy',
        insufficient_logging: 'PASS (improved) — the fix increases audit fidelity by splitting a conflated bucket; constraint verified applied so rows are not silently dropped',
        rate_limiting: 'PASS — INBOUND_RATE_LIMIT=5/60min counts ALL outcomes, unaffected by the relabel',
      },
      security_delta: {
        finding: 'S1',
        control_affected: 'FR-4 unmatched auto-suspend (checkAndApplyUnmatchedAutoSuspend, threshold 3 per 60 min)',
        direction: 'narrowed (fewer rows counted)',
        severity: 'LOW',
        containment: [
          'valid Twilio signature required to reach the branch at all',
          'sender must already hold a chairman_notifications row with a decision_id',
          'all-outcome rate limiter (5/60min) unaffected',
          'verified CHAIRMAN_PHONE was already exempt from this counter (:644) — zero delta there',
          'branch returns {resolved:false} and mutates no chairman_decisions row',
        ],
        disposition: 'ACCEPTED as intentional; documentation recommendation R1 raised',
      },
      consumer_sweep: 'no sms_inbound_log consumer filters outcomes by allow-list; parked-sms-audit.mjs only tests === "answered" (conservative); sms-relay-drain.cjs tallies open-endedly',
      files_reviewed: [
        'lib/chairman/sms-bridge.js (:540-690, :690-902, :1020-1150)',
        'database/migrations/20260913_sms_inbound_log_no_open_question.sql',
        'lib/coordinator/insert-coordination-row-callers.cjs (comment-only re-pin 1104->1120)',
        'lib/chairman/parked-sms-audit.mjs',
        'scripts/sms-relay-drain.cjs',
      ],
      branch: 'feat/SD-LEO-FIX-EVERY-CHAIRMAN-SMS-001',
      head_commit: '3ad7c192052',
      escalated_from: 'QF-20260913-173',
      model: 'Opus 5 (1M context)',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      phase_assessed: 'EXEC-TO-PLAN (post-implementation security review)',
      checks_performed: {
        terminal_decision_cannot_be_reconsumed: 'VERIFIED — decision = eligible[0] only; eligibility filter byte-identical to main; new branch is inside the already-refused arm and performs one INSERT + return',
        signature_gating_unchanged: 'VERIFIED at diff-byte level — :725-729 absent from both hunks',
        matching_eligibility_not_widened: 'VERIFIED — :807-809 absent from both hunks',
        migration_additive_only: 'VERIFIED against the LIVE catalog (9-value CHECK, enforced) not the .sql file; zero RLS/grant/policy DDL; 0 of 574 rows reclassified',
        park_adam_widening_privilege_check: 'VERIFIED — gated on valid signature AND verified CHAIRMAN_PHONE; INFO-class coordination row on the lane no_match already used',
        injection_and_query_surface: 'VERIFIED — zero new queries; parameterised builder throughout; candidate set bounded at 5',
        secrets_pii: 'VERIFIED — no new logged field; sms_reply_token never selected in this path',
        abuse_counter_delta: 'FOUND (S1, LOW) — no_open_question excluded from UNMATCHED_OUTCOMES; contained by signature gate, notification prerequisite, and the unchanged 5/60min rate limiter',
      },
    },
    phase: 'EXEC_TO_PLAN',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_ID,
    { name: 'Chief Security Architect (security-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC_TO_PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch((e) => { console.error('WRITE FAILED:', e); process.exit(1); });
