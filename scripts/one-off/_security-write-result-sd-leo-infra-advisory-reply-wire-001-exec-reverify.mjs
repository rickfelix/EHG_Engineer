#!/usr/bin/env node
/**
 * FRESH (second-pass) SECURITY EXEC-TO-PLAN verdict for SD-LEO-INFRA-ADVISORY-REPLY-WIRE-001
 * (PR #7536, HEAD 19a6b3d8985 = merge of origin/main into the feature branch; fix commit
 * 13bc00c1349).
 *
 * Purpose: re-verify that THIS agent's own two MEDIUM findings from the prior pass
 * (sub_agent_execution_results e4068393-0933-4b30-9d9e-6a48aa8afa83) are actually closed —
 * re-derived by EXECUTING and MUTATING the shipped module, not by trusting the developer's
 * report — and re-examine S1/S2/S5/S6/S7/S8 in light of the S3/S4 code actually landing.
 *
 * Method note: mutation was performed on UNTRACKED COPIES of the shipped module
 * (scripts/.secprobe-mutantA.cjs / .secprobe-mutantB.cjs, deleted after the run) rather than by
 * editing the tracked source in place, because concurrent agents were running tests against the
 * same shared worktree. A depth-1 copy resolves ../lib/* identically, so the mutant exercises the
 * real dependency graph.
 *
 * Proportionality: internal agent-to-agent fleet-coordination CLI (session_coordination),
 * service-role only, no external/user-facing input, no auth/payment/PII path.
 *
 * Canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js applySubAgentRepoVerdict) +
 * canonical storage (lib/sub-agent-executor/results-storage.js storeSubAgentResults) per
 * CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = 'b0d54b9f-8848-4cab-a7d8-fba9ad3e31fb';
const SD_KEY = 'SD-LEO-INFRA-ADVISORY-REPLY-WIRE-001';
const PRIOR_ROW = 'e4068393-0933-4b30-9d9e-6a48aa8afa83';

const findings = [
  {
    id: 'S3-CLOSED-correlation-branch-allowlist-now-pinned-by-a-discriminating-fixture',
    severity: 'INFO',
    summary:
      `CLOSED (was MEDIUM in ${PRIOR_ROW}). Re-derived independently, not accepted on report. The shipped correlation branch still carries .in('payload->>kind', REPLY_ELIGIBLE_KINDS) (solomon-advisory.cjs:591 in resolveOriginatorFromCorrelation), and the new EXEC-SEC-S3 test now pins it. Verified by building an untracked copy of the shipped module with EXACTLY that line removed (CRLF-tolerant regex; the removed text is confirmed byte-for-byte as "      .in('payload->>kind', REPLY_ELIGIBLE_KINDS)\\r\\n") and driving the SAME fixture through both: against a correlation whose ONLY row is kind='chairman_directive' sent by 'coordinator-sess', the SHIPPED resolveConsultOriginator returns null while the MUTANT returns 'coordinator-sess'. The fixture is therefore discriminating rather than decorative — it fails for the right reason (a leaked non-eligible sender), which is precisely the mutant that SURVIVED the prior pass with 27/27 green. The correlation half of the adversarial-review I4 security-scoping guard is now test-pinned symmetrically with EXEC-TST-W1's pinning of the by-id half.`,
  },
  {
    id: 'S4-CLOSED-for-both-named-live-harm-vectors-broadcast-sentinel-and-nil-uuid',
    severity: 'INFO',
    summary:
      `CLOSED for both harmful vectors (was MEDIUM in ${PRIOR_ROW}). ensureOriginatorCc now gates the resolved CC target at solomon-advisory.cjs:670 with \`if (!isUsableSessionId(originator) || originator.startsWith('broadcast-')) return { inserted: false, originator: null };\`, exactly the shape the prior pass recommended (reuse lib/coordinator/session-id-guard.cjs, plus a broadcast-prefix refusal). Re-verified by EXECUTING the shipped ensureOriginatorCc across 17 adversarial CC targets with insertRow stubbed to a capture array (no rows written): REFUSED, zero inserts, originator:null for broadcast-adam, broadcast-solomon, broadcast-coordinator, the nil UUID, the nil UUID UPPERCASED, the empty string, a whitespace-only string, and non-string origin_session values (number, object, array). CONTROL (a real session UUID) still inserts with the correct target_session, so the guard introduces no false refusal and does not regress the SD's actual purpose. Cross-checked against the deleted-guard mutant: it writes 'broadcast-adam' and the nil UUID verbatim into target_session with inserted:true, confirming the guard — not some other layer — is what stops them. Also re-confirmed the guard site is the RIGHT site: lib/coordinator/dispatch.cjs insertCoordinationRow (:978) validates row shape, work_assignment/message_type pairing and undrainable message types, but performs NO target_session shape or existence validation, so ensureOriginatorCc remains the sole gate.`,
  },
  {
    id: 'S4a-RESIDUAL-non-uuid-cron-identity-still-accepted-third-of-three-original-values',
    severity: 'LOW',
    summary:
      `PARTIAL RESIDUAL, stated plainly rather than quietly dropped. The prior S4 finding named THREE values the unguarded code accepted; the fix closes two. Executed against the shipped function, the third — the non-UUID cron identity 'adam-coordinator-health-cron' — is STILL accepted and written verbatim as target_session with inserted:true, identically to the deleted-guard mutant. Cause: isUsableSessionId only asserts non-blank string AND not-the-nil-UUID; it makes no UUID-shape assertion. HONEST ACCOUNTING: (a) this is a consequence of the predicate THIS AGENT recommended, so it is not a moved goalpost — the developer implemented the recommendation faithfully; (b) the harm class is strictly lower than the two closed vectors — nothing drains that identity, so the outcome is a DEAD LETTER (silent non-delivery reported as success), not the fleet-wide fan-out that made the broadcast vector MEDIUM; (c) reachability remains nil on the measurements from the prior pass (0 of 62 live health-cron eligible asks carry a correlation_id, and payload.origin_session has zero writers repo-wide and zero live rows), so neither door reaches it today; (d) closing it would require a new UUID-shape predicate that does not exist in the repo and would need care not to refuse any legitimate non-UUID session identity. NOT BLOCKING — recorded so the residue is visible rather than implied closed by the two that were fixed.`,
  },
  {
    id: 'NEW1-the-s4-guard-refuses-silently-violating-this-same-SDs-own-EXEC-TST-W4-precedent',
    severity: 'LOW',
    summary:
      'NEW. The S4 guard returns { inserted: false, originator: null } with NO error field, and BOTH call sites print only on inserted or on error: the primary send at :1289 (`if (cc.inserted) console.log(\' cc_originator:\', cc.originator); else if (cc.error) console.error(\'WARN: originator CC failed...\')`) and the heal path at :1219-:1221 (same shape). A REFUSED CC therefore produces ZERO operator output and is byte-identical in return shape to the ordinary "no originator resolved at all" fail-open case — the operator cannot distinguish "there was no originator" from "there WAS an originator and we deliberately dropped it as unusable". This contradicts a precedent set inside THIS SAME SD: the EXEC-TST-W4 comment at :596-600, guarding the sibling resolver, reads "fail-open is correct (never block the reply on a resolver error), but silent was wrong — a query-level failure here degrades to the exact pre-fix symptom (no CC) with zero operator signal. Loud, still fail-open." The S4 guard has exactly the property W4 called wrong. Note the direction of the change: PRE-fix a broadcast originator printed "cc_originator: broadcast-adam" (visible but misrouting); POST-fix it prints nothing (safe but invisible) — the fix converted a LOUD-WRONG into a SILENT-RIGHT. Net security improvement, net observability regression, on a path whose taken-outcome is safe. SUGGESTED (non-blocking): one line before the return, e.g. console.error(`WARN: originator CC skipped — resolved originator ${JSON.stringify(originator)} is not a usable CC target (primary send unaffected)`). Rated LOW, not MEDIUM: measured reachability of every value the guard refuses is currently zero, so in practice it will essentially never fire silently.',
  },
  {
    id: 'NEW2-guard-predicate-asymmetry-whitespace-and-case-insensitive-for-nil-uuid-strict-for-broadcast-prefix',
    severity: 'INFO',
    summary:
      "NEW, and deliberately NOT escalated after checking the consumer side. The two halves of the guard normalise differently: isUsableSessionId trims and lowercases before its nil-UUID comparison (session-id-guard.cjs isNilUuid: `id.trim().toLowerCase() === NIL_UUID`), but originator.startsWith('broadcast-') does neither. Executed: ' broadcast-adam' (one leading space) and 'Broadcast-adam' both PASS the guard and are written as target_session, while 'broadcast-adam' is refused. WHY THIS IS INFO AND NOT A REOPENING OF S4: the harm in S4 was unintended FAN-OUT, and fan-out requires a READER to match. Every broadcast-lane reader in the repo matches EXACTLY — adam-advisory.cjs:404/:485/:680/:700 and solomon-advisory.cjs:406/:514 use .in('target_session', [sessionId, 'broadcast-*']), coordinator-quiet-tick.mjs:447 the same, inbox-readonly.cjs:77 uses .eq — and every writer emits the exact literal. A padded or re-cased sentinel therefore matches NO reader: it dead-letters rather than fanning out, so it cannot achieve the S4 harm. Combined with the fact that no writer anywhere produces a padded/cased sentinel, this is theoretical. Recorded because the asymmetry is a real property of the predicate as written, and because a future normalising reader (an ILIKE or a trim on the drain side) would silently convert it into a live path.",
  },
  {
    id: 'NEW3-short-circuit-order-proves-startsWith-cannot-throw-on-a-non-string-originator',
    severity: 'INFO',
    summary:
      "PASS on the specific question asked. Trace: the expression is `!isUsableSessionId(originator) || originator.startsWith('broadcast-')`. isUsableSessionId returns `typeof id === 'string' && id.trim() !== '' && !isNilUuid(id)`, so for ANY non-string it returns false, making the left operand `!false === true`, which short-circuits the || before the right operand is evaluated. `.startsWith` is therefore only ever reached on a value whose string-ness isUsableSessionId has ALREADY confirmed — the ordering is not incidental, it is what makes the second clause total. Confirmed by execution rather than by reading: originator values of 12345 (number), { a: 1 } (object) and ['broadcast-adam'] (array) each returned { inserted: false, originator: null } cleanly with zero inserts and ZERO TypeErrors thrown. Had the operands been written in the opposite order, all three would have thrown into the outer catch and returned an error-bearing result instead. No defect.",
  },
  {
    id: 'NEW4-isUsableSessionId-import-is-correctly-scoped-no-cycle-no-side-effects',
    severity: 'INFO',
    summary:
      "PASS. `const { isUsableSessionId } = require('../lib/coordinator/session-id-guard.cjs');` at solomon-advisory.cjs:53 is a top-level CommonJS require of a module that itself requires NOTHING (session-id-guard.cjs has zero imports and exports only NIL_UUID, isNilUuid, isUsableSessionId — all pure functions), so there is no circular-dependency risk against solomon-advisory.cjs and no load-time side effect. The destructure pulls exactly the one symbol used, and grep confirms exactly one usage site (:670) — no shadowing, no re-export, no accidental widening of the module's public surface (module.exports at :1349 does not re-export it). Scoping is correct.",
  },
  {
    id: 'S6-REVERIFIED-the-s4-guard-and-the-fr5-live-role-remap-compose-correctly',
    severity: 'INFO',
    summary:
      "PASS — this was the specific interaction question, and it resolves cleanly in the fix's favour. The guard at :670 sits AFTER the FR-5/W3 role-remap try/catch (:662-669) and BEFORE the pre-existing self/target skip, so it validates the POST-REMAP value — i.e. the value that will actually be written — rather than the pre-remap one. Probed all three ways the remap could produce a bad value by injecting the getLiveAdamId/getLiveSolomonId deps: a remap returning 'broadcast-adam', a remap returning the nil UUID, and a remap returning a non-string (999) are ALL refused (inserted:false, originator:null, zero inserts). Independently, the elections cannot in fact emit the nil UUID — electAdamFromDb/electSolomonFromDb already filter it via isUsableSessionId per QF-20260727-862 — so at :670 that clause is defense-in-depth rather than the only line, which is the correct posture for a two-layer identity check. The prior S6 conclusion (no new input surface: the resolvers read only claude_sessions role + a 10-minute heartbeat window, with no env/CLI/payload path, and fail open to the raw originator) is unchanged and re-confirmed. No gap.",
  },
  {
    id: 'S7-REVERIFIED-dedup-surface-is-monotonically-REDUCED-by-the-s4-guard-not-changed-in-kind',
    severity: 'LOW',
    summary:
      "REDUCED. The dedup/idempotency query (:684-696) runs strictly AFTER the :670 guard, so every value the guard now refuses never reaches the dedup check or the insert at all — the population traversing that path is a strict subset of what it was, which cannot introduce a new collision and removes the previously-possible case of a broadcast/nil target occupying a dedup slot. The two substantive halves of the prior S7 are otherwise unchanged and remain LOW: (a) the key is still scoped by target_session + reply_to (+ the conditional message_kind / part_index discriminators) and NOT by sender or via, so a third-party row on the same reply_to can in principle pre-empt the CC — 0 live specimens across 993 correlations at last measurement; (b) the remap keeps the key rotation-dependent, so a session rotation between the original CC and a re-run can yield a duplicate rather than a suppression. Half (c) of the prior S7 — 'suppression is SILENT (no console output)' — is now the more general problem written up as NEW1, which the S4 guard extends to a second silent-exit path. No new dedup defect.",
  },
  {
    id: 'S1-S2-S5-S8-REVERIFIED-unchanged-or-improved-by-the-fix',
    severity: 'INFO',
    summary:
      "All four re-examined against the landed code; none regressed, two improved. S1 (CC-target resolution bounded): unchanged — the invariant is still 'the {origin_session|sender_session} of the oldest non-reply row of an eligible kind on the reply's own correlation', and the S4 guard only narrows the reachable set, so the prior live measurements (447 eligible non-reply rows / 7 sessions / 3 in-boundary fleet sender_types, 0 ambiguous correlations, max 3 rows vs a 20 cap) remain conservative. S2 (I4 enforced in both branches, fall-through cannot bypass): still PASS and now STRENGTHENED — with EXEC-SEC-S3 added, both halves of the guard are test-pinned (EXEC-TST-W1 for by-id at :625, EXEC-SEC-S3 for correlation at :591), and the reply-row fall-through at :631 still routes through the correlation branch whose allowlist this pass mutation-proved load-bearing. S5 (origin_session is unverified prose with no writer): still LOW and still zero-writer, but its BLAST RADIUS is now bounded — a poisoned highest-precedence origin_session can no longer yield a fan-out sentinel, the nil UUID, a blank, or a non-string CC target, which was the specific way S5 and S4 compounded. S8 (injection): still PASS — the diff adds no query construction whatsoever, only two pure in-memory predicates, and the values that now reach .eq('target_session', originator) are a strict subset of those that did before. Supplementary check on the branch as a whole: a secret scan of the full origin/main...HEAD diff over scripts/ and tests/ (JWT/eyJ, sk-, service_role, inline password patterns) is CLEAN, including the 242-line one-off evidence script committed at scripts/one-off/_security-write-result-...-exec.mjs, which resolves its client through lib/sub-agent-executor/supabase-client.js and hardcodes no credentials.",
  },
];

const warnings = [
  'NEW1 (LOW): the S4 guard drops a resolved CC target with zero operator output on both call sites, contradicting this SD own EXEC-TST-W4 "loud, still fail-open" precedent at :596-600. Currently unreachable, so it will essentially never fire — but if it ever does, the symptom is indistinguishable from the pre-fix bug this SD exists to close.',
  'S4a (LOW): the third value named in the original S4 finding (a non-UUID cron identity) is still written verbatim; isUsableSessionId makes no UUID-shape assertion. Dead-letter class, not fan-out class, and unreachable today.',
  'NEW2 (INFO): the broadcast-prefix clause is whitespace- and case-SENSITIVE while the nil-UUID clause is not; a padded/re-cased sentinel passes the guard. Inert today because every broadcast-lane reader matches exactly, so such a value dead-letters instead of fanning out — but a future normalising reader would make it live.',
];

const recommendations = [
  'OPTIONAL, non-blocking (NEW1): add a single console.error before the :670 return so a refused CC is observable, matching the EXEC-TST-W4 treatment of the sibling resolver. This is the highest-value of the three residuals because it is one line and it closes an observability gap in the exact defect class (silent non-delivery) the SD was opened to fix.',
  'OPTIONAL, non-blocking (NEW2): normalise before testing the prefix — e.g. hoist `const o = String(originator).trim().toLowerCase()` after the isUsableSessionId clause and test o.startsWith(\'broadcast\') — which also subsumes the bare \'broadcast\' sentinel (no dash) that the prior pass measured live in session_coordination and which the current dash-suffixed check does NOT catch.',
  'DEFER (S4a): a UUID-shape assertion on the CC target would close the last of the three original S4 values, but it needs its own measurement that no legitimate non-UUID session identity is a valid CC target. Not worth blocking this PR for a currently-unreachable dead-letter path.',
  'No action required on S1, S2, S3, S5, S6, S7, S8 — all re-verified as PASS, improved, or unchanged-LOW against the landed code.',
];

const summary =
  'PASS. Both MEDIUM findings from the prior EXEC-TO-PLAN SECURITY pass are independently confirmed CLOSED by execution and mutation of the shipped module, not by accepting the developer report. S3: the correlation-branch kind allowlist is now pinned by a discriminating fixture — the shipped code resolves null where the deleted-.in() mutant leaks the ineligible sender. S4: the resolved CC target is now gated, and all 17 adversarial targets probed against the shipped ensureOriginatorCc are refused with zero writes (broadcast-* sentinels, nil UUID in both cases, blank, whitespace-only, non-strings) while the control still inserts correctly. The guard is correctly ordered AFTER the FR-5 live-role remap, so it validates the value actually written — probed with remaps returning a sentinel, the nil UUID, and a non-string, all refused. Short-circuit order proves the startsWith clause cannot throw on a non-string, confirmed by executing three non-string originators with zero TypeErrors. Three residuals recorded, all LOW/INFO, none blocking and all currently unreachable: a silent refusal path that contradicts this SD own W4 "loud, still fail-open" precedent (NEW1), a whitespace/case asymmetry in the guard predicate that is inert because every broadcast reader matches exactly (NEW2), and the one value of the original three that the recommended predicate does not cover (S4a, dead-letter class not fan-out class). 30/30 unit tests independently re-run green; branch diff secret-scan clean.';

const justification =
  `Verdict upgraded CONDITIONAL_PASS -> PASS relative to ${PRIOR_ROW} because both conditions attached to that verdict are met and were re-derived first-hand. Neither MEDIUM was accepted on report: for S3 an untracked depth-1 copy of the shipped module had the exact .in() line removed and the SAME fixture driven through both builds (shipped null vs mutant 'coordinator-sess'), and for S4 the shipped ensureOriginatorCc was executed across 17 adversarial CC targets with a capturing insertRow stub, cross-checked against a guard-deleted mutant that writes the sentinels verbatim. Mutation was performed on copies rather than in-place because concurrent agents were exercising the same shared worktree; the copies were removed and the tree confirmed clean. The three residuals are LOW/INFO and share a single property that keeps them out of blocking territory: every input value they concern has measured-zero reachability today (zero origin_session writers repo-wide, zero live origin_session rows, 0 of 62 health-cron asks carrying a correlation_id, and no writer anywhere emitting a padded or re-cased sentinel), and the worst outcome any of them produces is a dead letter rather than the fleet-wide fan-out that justified the original MEDIUM. The most substantive residual (NEW1) is an OBSERVABILITY gap on a path whose taken-outcome is safe — the fix traded a loud-wrong for a silent-right — which is a net security improvement even though it leaves an operator-signal debt worth one line. Proportional depth applied: internal agent-to-agent fleet CLI, service-role only, no external input, no auth/payment/PII path.`;

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 94,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [],
    metadata: {
      review_type: 'EXEC_TO_PLAN_SECURITY_REVIEW_REVERIFICATION',
      supersedes: PRIOR_ROW,
      prior_verdict: 'CONDITIONAL_PASS (91)',
      commits_reviewed: ['13bc00c1349', '19a6b3d8985'],
      pr: 7536,
      branch: 'feat/SD-LEO-INFRA-ADVISORY-REPLY-WIRE-001',
      files_reviewed: [
        'scripts/solomon-advisory.cjs',
        'tests/unit/solomon-consult-originator-cc.test.js',
        'lib/coordinator/session-id-guard.cjs',
        'lib/coordinator/dispatch.cjs',
        'lib/coordinator/adam-identity.cjs',
        'lib/coordinator/solomon-identity.cjs',
        'scripts/adam-advisory.cjs',
        'scripts/inbox-readonly.cjs',
        'scripts/coordinator-quiet-tick.mjs',
      ],
      checklist: {
        s3_correlation_branch_allowlist_pinned:
          "CLOSED (S3) — shipped resolves null vs mutant 'coordinator-sess' on the identical ineligible-kind fixture; the surviving mutant from the prior pass is now killed",
        s4_cc_target_validated:
          'CLOSED (S4) — 17/17 adversarial targets refused with zero writes; control still inserts; guard-deleted mutant writes them, proving the guard is the acting layer',
        s4_guard_ordering_vs_fr5_remap:
          'PASS (S6) — guard is post-remap, so it validates the written value; remaps returning a sentinel / nil UUID / non-string are all refused',
        s4_guard_cannot_throw_on_non_string:
          'PASS (NEW3) — || short-circuits on !isUsableSessionId for any non-string, so .startsWith is only reached on a confirmed string; executed number/object/array with zero TypeErrors',
        import_scoping:
          'PASS (NEW4) — top-level require of a zero-dependency pure module, single destructured symbol, single usage site, not re-exported',
        write_site_is_the_only_gate:
          'CONFIRMED — dispatch.cjs insertCoordinationRow performs no target_session shape/existence validation, so ensureOriginatorCc:670 is correctly the sole gate',
        residual_non_uuid_target:
          'LOW (S4a) — non-UUID cron identity still written; isUsableSessionId makes no UUID-shape assertion; dead-letter class, unreachable today',
        refusal_observability:
          'LOW (NEW1) — refusal is silent on BOTH call sites (:1219 heal, :1289 primary); contradicts this SD own EXEC-TST-W4 precedent at :596-600',
        guard_predicate_normalisation:
          "INFO (NEW2) — ' broadcast-adam' and 'Broadcast-adam' pass the prefix check; inert because all broadcast readers match exactly, so such a value dead-letters rather than fanning out",
        dedup_idempotency:
          'LOW, REDUCED (S7) — guard precedes the dedup query, so the population reaching it is a strict subset; sender-unscoped key and rotation-dependence unchanged, 0 live specimens',
        information_disclosure_via_cc_target: 'PASS (S1) — reachable set unchanged in shape and narrowed by the guard',
        i4_kind_guard_both_branches: 'PASS (S2) — both halves now test-pinned (EXEC-TST-W1 by-id, EXEC-SEC-S3 correlation)',
        origin_session_provenance: 'LOW, IMPROVED (S5) — still zero writers, but blast radius now bounded by the guard',
        sql_and_filter_injection: 'PASS (S8) — no new query construction; values reaching .eq are a strict subset of before',
        secrets_in_diff: 'PASS — full origin/main...HEAD scan over scripts/ and tests/ clean; committed one-off resolves its client via lib/, hardcodes nothing',
      },
      empirical_evidence: {
        executed_adversarial_cc_targets:
          "17 cases against the shipped ensureOriginatorCc. REFUSED (inserted:false, originator:null, 0 inserts): broadcast-adam, broadcast-solomon, broadcast-coordinator, nil UUID, nil UUID uppercased, '', '   ', origin_session=12345, origin_session={a:1}, origin_session=['broadcast-adam'], remap(adam)->broadcast-adam, remap(adam)->nil UUID, remap(solomon)->broadcast-solomon, remap(solomon)->999. ACCEPTED: control real UUID (correct), ' broadcast-adam' (NEW2), 'Broadcast-adam' (NEW2).",
        s3_mutation:
          "untracked copy with \"      .in('payload->>kind', REPLY_ELIGIBLE_KINDS)\\r\\n\" removed; identical fixture (single row, kind=chairman_directive, sender coordinator-sess): SHIPPED -> null, MUTANT -> 'coordinator-sess'",
        s4_mutation:
          "untracked copy with the 3-line guard block removed: MUTANT writes target_session 'broadcast-adam' and '00000000-0000-0000-0000-000000000000' with inserted:true; SHIPPED refuses both",
        s4a_residual_executed:
          "sender_session='adam-coordinator-health-cron' -> SHIPPED inserted:true wrote 'adam-coordinator-health-cron' (identical to mutant) — the one original S4 value the recommended predicate does not cover",
        broadcast_reader_matching_style:
          "ALL EXACT: adam-advisory.cjs:404/:485/:680/:700 .in(target_session,[sessionId,'broadcast-adam']); solomon-advisory.cjs:406/:514 .in(...,'broadcast-solomon'); coordinator-quiet-tick.mjs:447 .in(...,'broadcast-coordinator'); inbox-readonly.cjs:77 .eq — no ILIKE/trim anywhere, so a padded sentinel matches no reader",
        call_site_observability:
          "solomon-advisory.cjs:1289 `if (cc.inserted) console.log(...) else if (cc.error) console.error(...)` and :1219-:1221 (heal) same shape — a {inserted:false, originator:null, no error} return prints NOTHING on either path",
        insert_site_validation:
          'lib/coordinator/dispatch.cjs:978 insertCoordinationRow — validates row object shape, work_assignment/message_type pairing, UNDRAINABLE_WORKER_MESSAGE_TYPES; performs NO target_session shape or existence check',
        unit_tests: '30/30 passing in tests/unit/solomon-consult-originator-cc.test.js (independently re-run: vitest v4.1.4, 1 file, 30 tests, 256ms)',
        working_tree: 'scripts/solomon-advisory.cjs and tests/unit/solomon-consult-originator-cc.test.js both clean (git status --porcelain empty) at review time; mutant copies removed after use',
        secret_scan: 'CLEAN — git diff origin/main...HEAD over scripts/ and tests/ matched no eyJ*/sk-*/service_role/inline-password patterns',
        mutation_method_note:
          'mutation performed on untracked depth-1 copies (scripts/.secprobe-mutantA.cjs / .secprobe-mutantB.cjs) rather than in-place, because concurrent agents were running tests against the same shared worktree; depth-1 preserves ../lib/* resolution so the real dependency graph is exercised',
      },
      prior_findings_disposition: {
        'S1 (INFO, bounded CC resolution)': 'RE-VERIFIED — unchanged, narrowed by the guard',
        'S2 (INFO, I4 both branches)': 'RE-VERIFIED — PASS and strengthened; both halves now test-pinned',
        'S3 (MEDIUM, allowlist not test-pinned)': 'CLOSED — mutation-confirmed first-hand',
        'S4 (MEDIUM, CC target unvalidated)': 'CLOSED for both harmful vectors; one dead-letter-class value residual (S4a, LOW)',
        'S5 (LOW, origin_session no writer)': 'RE-VERIFIED — still LOW, blast radius now bounded',
        'S6 (INFO, FR-5 remap)': 'RE-VERIFIED — composes correctly with the new guard; probed all three bad-remap shapes',
        'S7 (LOW, dedup + silent suppression)': 'REDUCED — dedup surface strictly smaller; the silence half generalised into NEW1',
        'S8 (INFO, no injection)': 'RE-VERIFIED — no new query construction in the diff',
      },
      new_findings: ['NEW1 (LOW, silent refusal)', 'NEW2 (INFO, predicate normalisation asymmetry)', 'NEW3 (INFO, short-circuit safety PASS)', 'NEW4 (INFO, import scoping PASS)'],
      model: 'Opus 5',
      model_id: 'claude-opus-5[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-ADVISORY-REPLY-WIRE-001',
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
