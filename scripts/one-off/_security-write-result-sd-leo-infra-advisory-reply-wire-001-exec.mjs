#!/usr/bin/env node
/**
 * Write SECURITY (Chief Security Architect) EXEC-TO-PLAN verdict for
 * SD-LEO-INFRA-ADVISORY-REPLY-WIRE-001 (PR #7536, commits 23f808143cd + 98d493f3d9d).
 *
 * Scope: scripts/solomon-advisory.cjs REPLY_ELIGIBLE_KINDS /
 * resolveOriginatorFromCorrelation / resolveConsultOriginator / ensureOriginatorCc and
 * tests/unit/solomon-consult-originator-cc.test.js. The lane decides WHO RECEIVES A COPY
 * of internal fleet reply content, so it was reviewed as an information-disclosure /
 * misdelivery surface: CC-target resolution under crafted input, the adversarial-review I4
 * kind-scoping guard in BOTH branches, the FR-5 Solomon-role live-remap provenance, the
 * dedup/idempotency key, and PostgREST filter injection.
 *
 * Proportionality: internal agent-to-agent fleet-coordination CLI (session_coordination),
 * service-role only, no external/user-facing input, no auth/payment/PII path.
 *
 * Uses the canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + canonical storage (lib/sub-agent-executor/
 * results-storage.js storeSubAgentResults) per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = 'b0d54b9f-8848-4cab-a7d8-fba9ad3e31fb';
const SD_KEY = 'SD-LEO-INFRA-ADVISORY-REPLY-WIRE-001';

const findings = [
  {
    id: 'S1-cc-target-resolution-is-bounded-and-no-live-collision-shape-exists',
    severity: 'INFO',
    summary:
      'PASS on review item 1 (information disclosure via mis-resolved CC target), with the guarantee stated precisely rather than assumed. Tracing the data flow rather than the comments: main() derives replyRef = replyToArg || replyTo (solomon-advisory.cjs:1215, :1285) — the RAW --reply-to argument — and replyTo = resolveReplyToCorrelation(replyToArg) (:1189), which returns the SAME payload.correlation_id field the by-id fall-through reads at :632. The two therefore cannot diverge: a reply posted on thread C always resolves its CC against thread C. The ACTUAL invariant the shipped code enforces is: CC target is an element of { payload.origin_session, else sender_session } of the OLDEST non-reply row of kind IN (solomon_consult, adam_advisory) sharing the reply correlation_id. Nothing else can be reached. Measured against live session_coordination (30d): 447 eligible non-reply rows, 7 distinct sender sessions, 3 sender_types (adam 309, adam-coordinator-health 84, solomon 14) — every candidate is an in-boundary fleet role; no worker, chairman, or external identity can enter the set. Collision shapes probed and ABSENT: 0 of 361 correlations carrying a non-reply eligible ask have more than one distinct candidate sender (so "oldest wins" cannot currently pick a wrong session), and the largest eligible-row count on any correlation is 3 against the .limit(20) cap (~7x headroom, no truncation). correlation_id is crypto.randomUUID() (:1161, :1185) so a collision is not a practical input. Cross-thread probe (an eligible reply row by id whose correlation_id names another thread) resolves that other thread owner — but the reply is POSTED on that same thread by :1189, so the CC follows the message, which is correct.',
  },
  {
    id: 'S2-I4-guard-enforced-in-both-branches-fall-through-cannot-bypass-it',
    severity: 'INFO',
    summary:
      'PASS on review item 2, verified by EXECUTING the shipped exported functions, not by reading. (a) BY-ID BRANCH: the kind check at :625 (`if (!REPLY_ELIGIBLE_KINDS.includes(p.kind)) return null;`) runs BEFORE the new isReplyRow fall-through at :631, so a non-eligible row can never reach the correlation door through the by-id door. Executed: a chairman_directive row by id => null; a coordinator_reply row by id (a REPLY of a non-eligible kind, the shape that would exercise the fall-through) => null. The fall-through is structurally unreachable for non-eligible kinds. (b) CORRELATION BRANCH: the allowlist is independently re-applied server-side via .in(\'payload->>kind\', REPLY_ELIGIBLE_KINDS) at :590, so recursion into resolveOriginatorFromCorrelation with an attacker-chosen p.correlation_id (:632) still cannot escape the two admitted kinds. (c) The set itself is a frozen module constant (:570, Object.freeze) with a test asserting it is exactly {solomon_consult, adam_advisory} — no silent widening. (d) Mutation-confirmed live-bearing: deleting the :625 guard turns the suite RED (1 failed), i.e. EXEC-TST-W1 pins the by-id half correctly. The guard is enforced. See S3 for the test-adequacy gap on the correlation half.',
  },
  {
    id: 'S3-correlation-branch-half-of-the-I4-guard-is-load-bearing-but-NOT-test-pinned',
    severity: 'MEDIUM',
    summary:
      'CONCERN, and the one finding review item 2 did not anticipate: the .in(\'payload->>kind\', REPLY_ELIGIBLE_KINDS) allowlist at :590 — the correlation-branch half of the I4 security scoping — can be DELETED or WIDENED with the entire suite green. MEASURED BY MUTATION with applied-verification (the mutation script hard-exits 3 if the pattern is absent, so a no-op cannot masquerade as a survivor): mutant IN_DELETE (drop line :590 entirely) => 27/27 PASSED; mutant IN_ALLOWLIST (widen to [solomon_consult, adam_advisory, coordinator_reply, chairman_directive, ack]) => 27/27 PASSED. It survives because every correlation-branch fixture seeds ONLY eligible-kind rows, so no test can observe the filter — even though the upgraded fakeSb DOES implement in() faithfully (test file :47, :57-59), meaning this is a missing fixture, not a double limitation. The guard is genuinely LOAD-BEARING, proven by direct execution of the shipped module against a correlation whose oldest non-reply row is a chairman_directive: unmutated resolves \'legit-adam\' (the eligible row, correct); with :590 deleted it resolves \'CHAIRMAN-LANE-SENDER\'. That is precisely the "CC on arbitrary non-reply-worthy kinds" scope creep I4 exists to prevent, in the disclosure direction (chairman-lane and ack senders becoming recipients of Solomon reply bodies). Contrast with the guards that WERE pinned this round: ascending:true=>false KILLED (1 failed), .limit(20)=>.limit(1) KILLED (1 failed), rows.find(!isReplyRow)=>rows[0] KILLED (2 failed), :625 I4 by-id guard deleted KILLED (1 failed). The prior EXEC-TO-PLAN TESTING blockers (EXEC-TST-C1 cap/direction, EXEC-TST-C2 replies-only) are confirmed CLOSED; this is the remaining half of the same class, on the security-scoping predicate specifically. Source verified byte-identical after every mutation: git hash-object == git rev-parse HEAD:scripts/solomon-advisory.cjs == 118a430561d24639a943af2ca0eb986133379123.',
  },
  {
    id: 'S4-resolved-cc-target-is-written-with-zero-validation',
    severity: 'MEDIUM',
    summary:
      'CONCERN. ensureOriginatorCc takes whatever resolveConsultOriginator returns and writes it verbatim as target_session (:693-697) with no shape, sentinel, or existence check. Executed against the shipped function with insertRow stubbed to a capture array (no rows written), three values are accepted and reported as SUCCESS (inserted:true, so main():1286 prints "cc_originator: <value>" and no warning fires): (1) payload.origin_session=\'broadcast\' => wroteTarget \'broadcast\', which is a LIVE FAN-OUT SENTINEL, not a dead letter — scripts/ack-chairman-directive.cjs:106 uses it explicitly "so the per-role gauge reads every role\'s ack" and scripts/coordinator-quiet-tick.mjs:298 rides chairman_directive on it — so a single poisoned field turns a targeted CC into a fleet-wide broadcast of Solomon reply content; (2) origin_session = the nil UUID => wroteTarget 00000000-…, the exact silent-swallow sentinel of QF-20260727-862 (3 worker signals, 2 critical, lost with no dead_letter stamp, invisible to sender and recipient); (3) sender_session=\'adam-coordinator-health-cron\' => wroteTarget \'adam-coordinator-health-cron\', a non-UUID cron identity nothing drains. target_session is confirmed NOT FK-constrained (4 orphan target values live in 30d, including \'broadcast\' and \'broadcast-coordinator\'), so all three insert cleanly. THE REPO ALREADY OWNS BOTH THE GUARD AND THE PRECEDENT: lib/coordinator/session-id-guard.cjs exports isUsableSessionId, and scripts/coordinator-ack-adam.cjs:388-392 (QF-20260727-380) established the exact rule — "validate the RESOLVED TARGET instead of the originator" — for this same lane. ensureOriginatorCc applies neither. HONEST REACHABILITY: latent today, not live-exploitable. payload.origin_session has ZERO writers in the entire repo (grep across lib/ + scripts/ finds only the three READ sites at :595, :608, :634) and ZERO rows carry it live; and 0 of the 62 live health-cron eligible asks carry a correlation_id, so that identity cannot currently be reached through either door. Rated MEDIUM rather than INFO because the widening measurably grew the carrier population that could ever hold origin_session: 38 non-reply rows / 2 sessions / 1 sender_type BEFORE (solomon_consult only) vs 445 / 7 / 3 AFTER — an 11.7x row and 3.5x session increase — and the fix is one line reusing an existing export.',
  },
  {
    id: 'S5-origin_session-preference-is-unverified-prose-with-no-writer',
    severity: 'LOW',
    summary:
      'CONCERN, documentation-integrity class. The doc comment at :607-608 states that payload.origin_session is "set by relay paths that preserve the true originator". There is no such relay path. A grep for origin_session across lib/ and scripts/ returns exactly three hits, all in this file and all READS (:595, :608, :634); there is no writer anywhere in the repo, and a live query returns 0 rows carrying the key. So the highest-precedence input to CC-target resolution is a field that nothing produces and nothing validates — a dormant, sender-controlled override of who receives reply content, described in the source as though it were wired. Mutation-confirmed unpinned: removing the origin_session preference at :595 leaves the suite 27/27 green. Inherited from QF-20260705-488, not introduced here, but this SD is what multiplied the population of rows that could carry it (S4). Either wire a writer or narrow the comment to say the field is a reserved, currently-unproduced hook; leaving unverified prose in place is how a future reader concludes the value is trustworthy.',
  },
  {
    id: 'S6-solomon-role-remap-fr5-introduces-no-new-input-surface',
    severity: 'INFO',
    summary:
      'PASS on review item 3, traced to the leaf. getActiveSolomonId (lib/coordinator/solomon-identity.cjs:147) delegates to electSolomonFromDb -> fetchFreshSolomons, which reads claude_sessions filtered on metadata->>role=\'solomon\' AND heartbeat_at >= now-10min, then pickCanonicalSolomon elects deterministically (solomon_since DESC NULLS LAST, then session_id ASC). getActiveAdamId is the mirror. NO process.env read, NO CLI argument, NO payload field reaches either module — the entire input is internal fleet state, so no --reply-to value, correlation id, or crafted payload can steer the remap. STALENESS IS BOUNDED, not unbounded: the 10-minute freshness window is the ceiling, and when no fresh Solomon elects, electSolomonFromDb returns null and :666 falls back to `|| originator`, i.e. exactly the pre-FR-5 behavior (fail-open, never worse). ATTACKER INFLUENCE requires writing claude_sessions.metadata.role=\'solomon\' with a fresh heartbeat — service-role-key territory, which already permits inserting the CC row directly, so no capability is gained; and the election already filters the nil UUID via isUsableSessionId (QF-20260727-862), the one identity that would otherwise win the session_id ASC tiebreak. ORDERING IS CORRECT: the remap (:662-668) runs BEFORE the self/target guard (:669), so `originator === target || originator === sessionId` evaluates the POST-remap value — a remap that lands on the running session is correctly skipped rather than self-CC\'d. FR-5 adds a symmetric branch to an existing, already-reviewed mechanism and introduces no new trust assumption.',
  },
  {
    id: 'S7-dedup-key-is-not-scoped-by-sender-and-a-suppressed-CC-is-silent',
    severity: 'LOW',
    summary:
      'CONCERN on review item 4, in the suppression direction. The idempotency key is target_session + payload->>reply_to, plus message_kind and part_index ONLY when the outgoing payload carries them (:681-689). It is NOT scoped by sender_session, sender_type, or payload->>via — so ANY row already targeting the resolved originator with the same reply_to satisfies it, regardless of who wrote it. Live surface is real, not hypothetical: of 78 rows carrying payload.reply_to in 30d, 9 were authored by non-Solomon senders (adam 5, coordinator 4), so the slot IS occupiable by a third party; a coordinator reply already delivered to the originator on correlation C would pre-empt Solomon\'s CC on C. This became reachable BECAUSE of the widening — before it, an adam_advisory correlation resolved originator=null and the dedup was never consulted. LIVE SPECIMENS: ZERO. I reconstructed every 30d correlation carrying a Solomon reply (993 correlations, 10 with a Solomon reply, 5 where the new resolver yields an originator distinct from both target and sender) and found 0 pre-empted CCs. OBSERVABILITY IS THE SHARPER HALF: suppression returns {inserted:false} with NO error, and main():1286-1287 prints the cc_originator line only when inserted is true and the warning only when error is set — so a wrongly-suppressed CC produces NO output at all, indistinguishable from a correct skip. On the NOT-suppress direction: the FR-5/W3 live-remap makes the key rotation-dependent, so re-running the same --reply-to after a seat rotation resolves a different originator, misses the dedup, and inserts a second copy to the new seat. That is arguably the intent (heal into the live seat) and the duplicate stays within the same role, so it is a note rather than a defect. The part_index clause is correct: payload.part_index is stored as a JSON number and ->> extracts it as text, which String(n) matches, and buildAdvisoryPayload enforces 1 <= pi <= pt so a 0 can never reach the `!= null` test.',
  },
  {
    id: 'S8-no-injection-verified-by-capturing-the-built-query-url',
    severity: 'INFO',
    summary:
      'PASS on review item 5, verified directly rather than assumed from appearance. Both new filters are supabase-js/PostgREST query-builder calls; there is no raw SQL, no .rpc(), and no string concatenation anywhere in the changed code. .in(\'payload->>kind\', REPLY_ELIGIBLE_KINDS) (:590) takes a FROZEN module constant, never user input, so it has no injection surface at all; postgrest-js additionally quotes any element matching PostgrestReservedCharsRegexp (node_modules/@supabase/postgrest-js/dist/index.cjs:1896-1903). .eq(\'payload->>correlation_id\', String(correlationId)) (:589) DOES take user input, and eq() is `this.url.searchParams.append(column, \'eq.\' + value)` (same file :1359-1362) — a URLSearchParams append, which percent-encodes on serialization. PROOF BY CAPTURED URL: feeding the hostile value `x,y).or(payload->>kind.eq.ack*\'\\n--` (a PostgREST horizontal-filter breakout attempt) produced ...&payload-%3E%3Ecorrelation_id=eq.x%2Cy%29.or%28payload-%3E%3Ekind.eq.ack*%27%0A-- — comma %2C, parens %29/%28, quote %27, newline %0A. PostgREST receives one opaque filter value, cannot re-parse it as a nested or(), and parameterizes it server-side. Non-UUID input to .eq(\'id\', value) (:618) returns a 22P02 in the response body rather than throwing, so byId is null and control falls through to the correlation branch — the intended path, and fail-closed. No SQL injection, no filter-grammar injection, no command injection (no value in this diff reaches a shell).',
  },
];

const warnings = [
  'S3 is the finding to carry into PLAN: review item 2 asked whether the I4 guard is enforced in BOTH branches. In CODE it is (S2, execution-verified). In TESTS only the by-id half is pinned — the correlation-branch .in() allowlist at solomon-advisory.cjs:590 can be deleted or widened to admit coordinator_reply/chairman_directive/ack with the suite fully green, while direct execution proves it is load-bearing (a chairman_directive row becomes the CC target without it). One fixture closes it.',
  'S4 and S5 compose into the one mechanically-complete disclosure path in this lane: an unvalidated payload.origin_session (highest-precedence input, zero writers, zero validation) set to the live \'broadcast\' fan-out sentinel converts a targeted CC into a fleet-wide broadcast of Solomon reply content, and the CLI reports it as success. It is NOT reachable today (0 rows carry origin_session, 0 writers exist repo-wide), which is why it is MEDIUM and not CRITICAL — but the reachability argument rests entirely on the absence of a writer, not on any check in the code.',
  'The blast-radius delta is the honest framing of this SD\'s security cost: the widening took the set of rows whose sender can become a CC target from 38 rows / 2 sessions / 1 sender_type to 445 / 7 / 3 (30d measured, 11.7x). Every added candidate is an in-boundary fleet role (adam, solomon, adam-coordinator-health), so the boundary did not move — but the population inside it grew by an order of magnitude, which is what turns the missing target validation (S4) from theoretical into worth fixing.',
  'S7: a dedup-suppressed CC produces NO console output at all (ensureOriginatorCc returns {inserted:false} with no error; main():1286-1287 prints only on inserted or on error). A wrongly-suppressed delivery is therefore indistinguishable from a correct skip. 0 live specimens, but the observability gap would hide one if it occurred.',
  'The prior EXEC-TO-PLAN TESTING blockers were independently re-verified as CLOSED by mutation, not by reading the diff: ascending:true=>false KILLED, .limit(20)=>.limit(1) KILLED, rows.find(!isReplyRow)=>rows[0] KILLED. Source restored byte-identical (blob 118a430561d24639a943af2ca0eb986133379123) after every mutation run.',
];

const recommendations = [
  'S3 (recommended, one test): add a correlation-branch fixture containing a NON-eligible row that would win on ordering — e.g. byCorrelation = [{kind:\'chairman_directive\', sender:\'X\', created_at: oldest}, {kind:\'adam_advisory\', sender:\'Y\', created_at: newer}] — and assert resolveConsultOriginator returns Y and NOT X. The upgraded fakeSb already honours in() (test file :57-59), so no double work is needed. This kills both surviving mutants (IN_DELETE and IN_ALLOWLIST) and pins the correlation half of I4 the same way EXEC-TST-W1 pins the by-id half.',
  'S4 (recommended, one line, existing export): validate the RESOLVED target before writing it, per the precedent scripts/coordinator-ack-adam.cjs:388-392 already set for this lane — in ensureOriginatorCc after the role remap, `if (!isUsableSessionId(originator)) return { inserted: false, originator: null };` using isUsableSessionId from lib/coordinator/session-id-guard.cjs. Consider additionally refusing the broadcast sentinels (a value starting with \'broadcast\'), since a CC is by definition a targeted delivery and a broadcast CC is never the intent — that single condition is what closes the amplification path in S4.',
  'S5 (recommended, comment or wiring): either add the relay-path writer the comment at :607-608 asserts exists, or narrow the comment to state that origin_session is a reserved hook with no current producer. Whichever is chosen, gate it: `origin.payload.origin_session` should not outrank a measured sender_session unless it passes the same isUsableSessionId check recommended in S4.',
  'S7 (optional, observability): when ensureOriginatorCc returns {inserted:false} with a non-null originator and no error, have main() print a one-line note (e.g. "cc_originator: skipped (already delivered to <id>)"). It costs nothing and makes a wrongly-suppressed CC distinguishable from a correct skip, which is the failure mode the FR-5 discriminator comment at :673-679 already identifies as worse than the bug this SD fixes.',
  'S7 (optional, tightening): scope the dedup query at :681-689 with .eq(\'sender_type\', \'solomon\') or .eq(\'payload->>via\', \'cc_originator\') so a third-party row targeting the originator cannot occupy Solomon\'s idempotency slot. Zero live specimens today, so this is defense-in-depth, not a fix.',
  'Non-blocking, note only: the new console.error at :600 interpolates a DB-sourced correlationId into terminal output. Another session can write that field, so ANSI/newline log-forging into Solomon\'s terminal is possible. Severity is negligible for a CLI and the loud-but-fail-open design is the right call (it was silent before, which was worse) — recorded so it is not mistaken for a new defect later.',
];

const summary =
  'CONDITIONAL_PASS for EXEC-TO-PLAN. NO live-reachable information-disclosure defect exists in this change, and all three security guarantees the review explicitly asked about were verified BY EXECUTION rather than by reading comments. (1) CC-target resolution is bounded: the shipped code can only ever CC the {origin_session, else sender_session} of the oldest non-reply row of kind IN (solomon_consult, adam_advisory) on the reply own correlation — measured live at 7 candidate sessions across 3 in-boundary fleet roles, with 0 of 361 correlations carrying an ambiguous (multi-candidate) ask and a max of 3 eligible rows against a 20-row cap, so no collision or truncation shape exists. (2) The adversarial-review I4 kind guard IS enforced in both branches: the :625 check precedes the new :631 fall-through, so a coordinator_reply or chairman_directive hit by id returns null and can never reach the correlation door, and the correlation branch re-applies the allowlist server-side at :590 — both confirmed by executing the shipped functions against hostile fixtures. (3) The FR-5 Solomon remap is fed exclusively by internal fleet state (claude_sessions role + 10-minute heartbeat, deterministic nil-UUID-filtered election); no env var, CLI argument, or payload field reaches it, staleness is window-bounded, and it fails open to the raw originator. (4) No injection: the hostile value `x,y).or(...)` was captured percent-encoded as a single opaque eq. filter value in the built URL, and the .in() list is a frozen constant. Two MEDIUM findings, each fixable in roughly one line. S3: the correlation-branch half of the I4 guard is load-bearing but NOT test-pinned — deleting or widening .in(payload->>kind, REPLY_ELIGIBLE_KINDS) leaves the suite 27/27 green, while direct execution proves that without it a chairman_directive sender becomes the CC target. S4: the resolved originator is written as target_session with zero validation, and I executed three values it accepts while reporting success — the live \'broadcast\' fan-out sentinel (which would turn a targeted CC into a fleet-wide broadcast of reply content), the QF-20260727-862 nil UUID, and a non-UUID cron identity; the repo already exports the exact guard (isUsableSessionId) and already set the precedent to apply it to the resolved target (coordinator-ack-adam.cjs:388-392). Both are LATENT, not live: payload.origin_session has zero writers repo-wide and zero rows, and 0 of 62 live health-cron asks carry a correlation_id. The three prior EXEC-TO-PLAN TESTING blockers were independently re-verified CLOSED by mutation (cap, sort direction, and reply-exclusion all now kill their mutants), and source was restored byte-identical after every run.';

const justification =
  'CONDITIONAL_PASS rather than PASS because two real, measured findings remain, one of which (S3) is the direct subject of review item 2 — the security-scoping guard is correct in code but a future edit could delete it with a green suite, which is the same test-adequacy class the prior TESTING pass raised as CRITICAL and closed only for the JS-filter half. CONDITIONAL_PASS rather than FAIL because no finding is live-reachable: the disclosure-amplification path requires a payload.origin_session field that has zero writers in the entire repo and zero rows in the live table, every candidate CC target measured over 30 days is an in-boundary fleet role, no ambiguous-originator or over-cap correlation exists, and 0 dedup pre-emptions were found across 993 correlations. Content at risk is internal agent-to-agent coordination on a service-role-only CLI with no external input surface, no auth/payment/PII path — so proportionality argues for one test and one validation line, not an architectural change. Confidence 91: every claim here is backed by an executed probe (persisted, non-self-cleaning) or a mutation run with applied-verification, and the two places where reachability is ABSENT are stated as measured absence rather than inferred safety.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 91,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [
      'S3: add ONE correlation-branch fixture containing a non-eligible-kind row that wins on created_at ordering, asserting resolveConsultOriginator returns the eligible sender and NOT the non-eligible one. This kills the two surviving mutants (deleting and widening .in(payload->>kind, REPLY_ELIGIBLE_KINDS) at solomon-advisory.cjs:590) and pins the correlation half of the I4 security-scoping guard.',
      'S4: validate the RESOLVED CC target before writing it — `if (!isUsableSessionId(originator)) return { inserted: false, originator: null };` in ensureOriginatorCc after the role remap, reusing lib/coordinator/session-id-guard.cjs per the precedent scripts/coordinator-ack-adam.cjs:388-392 set for this same lane. Recommended additional clause: refuse a target beginning with \'broadcast\', which is what closes the fan-out amplification path.',
    ],
    metadata: {
      review_type: 'EXEC_TO_PLAN_SECURITY_REVIEW',
      commits_reviewed: ['23f808143cd', '98d493f3d9d'],
      pr: 7536,
      branch: 'feat/SD-LEO-INFRA-ADVISORY-REPLY-WIRE-001',
      source_blob_verified: '118a430561d24639a943af2ca0eb986133379123',
      files_reviewed: [
        'scripts/solomon-advisory.cjs',
        'tests/unit/solomon-consult-originator-cc.test.js',
        'lib/coordinator/solomon-identity.cjs',
        'lib/coordinator/adam-identity.cjs',
        'lib/coordinator/session-id-guard.cjs',
        'scripts/coordinator-ack-adam.cjs',
        'node_modules/@supabase/postgrest-js/dist/index.cjs',
      ],
      checklist: {
        information_disclosure_via_cc_target:
          'PASS (S1) — CC target provably bounded to {origin_session|sender_session} of the oldest non-reply eligible-kind row on the reply own correlation; 7 candidate sessions / 3 in-boundary fleet roles live; 0 ambiguous correlations; max 3 rows vs a 20 cap',
        i4_kind_guard_by_id_branch:
          'PASS (S2) — :625 precedes the :631 fall-through; chairman_directive and coordinator_reply by id both execute to null; mutation-killed',
        i4_kind_guard_correlation_branch:
          'CONCERN (S3) — enforced in code at :590 and proven load-bearing by execution, but NOT test-pinned: delete or widen => 27/27 green',
        fall_through_bypass:
          'PASS (S2) — the fall-through is structurally unreachable for non-eligible kinds, and the correlation branch re-applies the allowlist server-side',
        solomon_role_remap_fr5:
          'PASS (S6) — getActiveSolomonId/getActiveAdamId read only claude_sessions role + 10-min heartbeat with a deterministic nil-UUID-filtered election; no env/CLI/payload input path; fails open to the raw originator; remap correctly ordered before the self/target guard at :669',
        cc_target_validation:
          'CONCERN (S4) — no shape/sentinel/existence check; executed acceptance of \'broadcast\' (live fan-out sentinel), the nil UUID, and a non-UUID cron identity, each reported as success; target_session confirmed not FK-constrained',
        origin_session_provenance:
          'CONCERN (S5) — highest-precedence input, zero writers repo-wide, zero live rows, unpinned by tests, and described in-source as wired when it is not',
        dedup_idempotency:
          'CONCERN-LOW (S7) — key not scoped by sender/via so a third-party row can pre-empt the CC (9/78 reply_to rows in 30d are non-Solomon); 0 live specimens; suppression is SILENT (no console output); remap makes the key rotation-dependent so a rotation yields a duplicate',
        sql_and_filter_injection:
          'PASS (S8) — verified by capturing the built URL: hostile value percent-encoded as a single opaque eq. filter (%2C %29 %28 %27 %0A); .in() takes a frozen constant and additionally quotes reserved chars; no raw SQL, no rpc, no concatenation',
        command_injection: 'PASS — no value in this diff reaches a shell',
        log_injection: 'NOTE — new console.error at :600 interpolates a DB-sourced correlationId; negligible for a CLI, recorded only',
        privilege_escalation: 'PASS — no widening of what the pre-existing service-role client is used for',
      },
      empirical_evidence: {
        blast_radius_delta_30d:
          'eligible non-reply rows 38 -> 445 (11.7x); distinct sender sessions 2 -> 7; sender_types [adam] -> [adam, solomon, adam-coordinator-health]',
        ambiguous_originator_correlations: '0 of 361 correlations carrying a non-reply eligible ask have >1 distinct candidate sender',
        max_eligible_rows_per_correlation: '3 (vs the .limit(20) cap) — 0 correlations exceed the cap',
        origin_session_rows_live: 0,
        origin_session_writers_in_repo: 0,
        health_cron_asks_with_correlation_id: '0 of 62 (so the non-UUID cron identity is not reachable as a CC target today)',
        target_session_fk: 'NOT enforced — 4 orphan target values live in 30d including \'broadcast\' and \'broadcast-coordinator\'',
        dedup_preemption_live_specimens: '0 across 993 correlations (10 with a Solomon reply, 5 resolvable to a distinct originator)',
        reply_to_rows_by_sender_type_30d: 'solomon 69, adam 5, coordinator 4 (of 78) — the dedup slot is occupiable by a third party',
        executed_cc_target_acceptance:
          "origin_session='broadcast' => wroteTarget 'broadcast' inserted:true; origin_session=nil UUID => wroteTarget 00000000-… inserted:true; sender='adam-coordinator-health-cron' => wroteTarget same, inserted:true",
        executed_i4_guard:
          'by-id chairman_directive => null; by-id coordinator_reply (reply shape, exercises the fall-through) => null',
        executed_in_allowlist_load_bearing:
          "unmutated resolves 'legit-adam'; with :590 deleted resolves 'CHAIRMAN-LANE-SENDER'",
        mutation_results:
          'KILLED: ascending true->false (1 failed), .limit(20)->.limit(1) (1 failed), rows.find(!isReplyRow)->rows[0] (2 failed), delete :625 I4 by-id guard (1 failed). SURVIVED: delete :590 .in() allowlist (27/27), widen :590 allowlist to include coordinator_reply/chairman_directive/ack (27/27), remove origin_session preference at :595 (27/27). All mutations applied-verified (script exits 3 if the pattern is absent); source restored byte-identical each run.',
        injection_proof_url:
          "payload-%3E%3Ecorrelation_id=eq.x%2Cy%29.or%28payload-%3E%3Ekind.eq.ack*%27%0A--&payload-%3E%3Ekind=in.%28solomon_consult%2Cadam_advisory%29 (hostile input: x,y).or(payload->>kind.eq.ack*'\\n--)",
        postgrest_js_eq: 'dist/index.cjs:1359-1362 — url.searchParams.append(column, `eq.${value}`)',
        postgrest_js_in: 'dist/index.cjs:1896-1903 — quotes elements matching PostgrestReservedCharsRegexp; called here with a frozen constant',
        unit_tests: '27/27 passing in tests/unit/solomon-consult-originator-cc.test.js',
        probes_persisted: [
          '.artifacts-sec-probe-advisory-reply-wire.cjs',
          '.artifacts-sec-probe2-dedup-preemption.cjs',
          '.artifacts-sec-probe3-blastradius.cjs',
          '.artifacts-sec-probe4-exploit-trace.cjs',
          '.artifacts-sec-probe5-cron-reach.cjs',
          '.artifacts-sec-probe6-in-allowlist-loadbearing.cjs',
          '.artifacts-sec-mutate.cjs',
        ],
      },
      prior_reviews_verified_closed: {
        'EXEC-TST-C1 (cap + sort direction unpinned)': 'CLOSED — both mutants now killed',
        'EXEC-TST-C2 (replies-only correlation / reply-exclusion unpinned)': 'CLOSED — mutant now killed (2 failed)',
        'VALIDATION LEAD (naive kind-widening resolves the replier)': 'CLOSED — ASC + isReplyRow exclusion + by-id fall-through all verified by execution',
      },
      model: 'Opus 5',
      model_id: 'claude-opus-5[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree:
        'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-ADVISORY-REPLY-WIRE-001',
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

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
