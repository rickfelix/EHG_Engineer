// SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001 — SECURITY sub-agent RE-REVIEW evidence writer (EXEC phase).
// Re-verification of commit 9fc14a16 against the two BLOCKING findings in the prior SECURITY row
// (cdb59cda-89cb-4df0-8e43-0d55a1bdf85b, verdict FAIL). Canonical path:
// resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = '1182898f-1725-4b46-8a14-ed171d7685aa';
const SD_KEY = 'SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001';
const PHASE = 'EXEC';
const CODE = 'SECURITY';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  validation_mode: 'prospective',
  execution_time_ms: 0,
  summary:
    'RE-REVIEW of 9fc14a16 against the prior SECURITY FAIL (row cdb59cda). BOTH BLOCKERS ARE GENUINELY CLOSED, ' +
    'and I verified each adversarially rather than accepting the commit message. B1: the 304-file scope that ' +
    'previously read 4 failed | 3618 passed now reads 309 files, 3652 passed, 1 skipped, ZERO failed — and the ' +
    'convergence suite is 6/6. B2: scripts/drain-dead-letter-coordination.mjs:37 now carries the exclusion ' +
    'importing PROMOTION_ACK_KEY, and the module header is corrected from TWO to THREE with the count ' +
    'explicitly labelled current-knowledge-not-a-closed-set. I upgrade on measurement, not on the report. ' +
    'THE SPECIFIC QUESTION ASKED — is the grep-cannot-see-runtime-death gap CLOSED or merely RELOCATED — is ' +
    'answered by a six-mutation harness that PROVES each mutation landed (git diff non-empty) before running: ' +
    'CLOSED for convergeAckTTL (deleting the guard, commenting it out, and the wrong-key import rebind all turn ' +
    'the suite RED) and CLOSED for the STUCK-drain (relocating the guard to an unrelated query turns it RED, so ' +
    'the block-scoping works). RELOCATED for the dead-letter drain: M5 — delete the guard from the real query ' +
    'and bolt an identical .is() onto an unrelated helper in the same file — leaves the suite 14/14 GREEN. The ' +
    'guard IS present and correct in shipped code (proven separately by a live positive control), but its ' +
    'regression protection is defeatable by exactly the evasion the commit says it killed, on the newest guard ' +
    'and the one the commit itself calls "the worst of the three". The test-file header claiming the residual ' +
    'assertions "scope to the enclosing query block" is true of the sweep and NOT true of the dead-letter site. ' +
    'FOURTH PATH FOUND, as asked. Not an ack-writer, which is why neither my first enumeration nor the three ' +
    'guards cover it: lib/sweep/passes/dead-letter-planning.cjs (and its twin lib/sweep/legacy-fallback.cjs) ' +
    'writes a COMPUTED patch (dl.update) rather than a literal acknowledged_at, so a grep for "acknowledged_at:" ' +
    'cannot see it. Its selector is .is(acknowledged_at,null).is(read_at,null) — EXACTLY the post-fix promoted ' +
    'state, and newly reachable for the same reason as path 3. Confirmed by EXECUTING the real planDeadLetters ' +
    'against a crafted post-fix promoted row: 1 row planned, patch sets read_at + dead_letter, with a negative ' +
    'control (same row, target alive) returning 0. It runs AUTOMATICALLY every sweep tick, unlike the manual ' +
    'path 3. Harm is materially smaller than paths 1-3 and I will not inflate it: it never sets ' +
    'acknowledged_at, so the coordinator inbox, the sender view and REPLY_STARVATION all keep showing the row; ' +
    'what it does is stamp read_at and start a 7-day cleanup_expired_coordination fuse, after which the row is ' +
    'ARCHIVED (not destroyed) while its content survives in the feedback row it was promoted into. ' +
    'I ALSO RETRACT MY OWN S2a BACKFILL RECOMMENDATION — the coordinator is right and I was wrong. Measured: 8 ' +
    'of the 10 promoted feedback rows are status=resolved, so disposition is recorded in feedback.status, not ' +
    'in session_coordination.acknowledged_at. Un-acking them would resurface answered work as unhandled, which ' +
    'is a different false state, not a repair. My error was treating session_coordination as the custody ' +
    'surface when promotion exists precisely to move custody to feedback. S3b ROUTING IS CORRECT and I verified ' +
    'the escalation actually happened rather than accepting that it was sent: row 8ef9f9d6 -> feedback 2c6555e3 ' +
    '"PRE-EXISTING CRITICAL, found during SECURITY review of SIGNAL-ROUTER-A...". It is pre-existing and out of ' +
    'scope; filing rather than blocking is the right call. S4 and S5 should NOT block. Two conditions remain, ' +
    'both follow-ups against a control that is live and correct, neither a defect in shipped behaviour — which ' +
    'is why this is CONDITIONAL_PASS and not FAIL, and equally why it is not a clean PASS.',
  conditions: [
    { action: 'Block-scope the dead-letter guard assertion in tests/unit/coordinator/promotion-ack-guards.test.js the same way the STUCK-drain assertion was scoped (slice to the enclosing query), and correct the test-file header, which claims the residual source assertions scope to the enclosing query block — true of the sweep, not of the dead-letter site. Mutation M5 proves the current assertion survives guard relocation.', priority: 'high', blocking: false },
    { action: 'Assess lib/sweep/passes/dead-letter-planning.cjs and its twin lib/sweep/legacy-fallback.cjs as the FOURTH path: automatic, every sweep tick, selector .is(acknowledged_at,null).is(read_at,null) matches the post-fix promoted state, confirmed by executing planDeadLetters with a negative control. Either exclude promotion-marked rows or record in promotion-ack.cjs why a 7-day archive fuse on a promoted row is acceptable.', priority: 'medium', blocking: false }
  ],
  findings: [
    {
      id: 'R1-B1-CLOSED-red-tier-is-green',
      severity: 'info',
      note: 'VERIFIED CLOSED. I re-ran the IDENTICAL 304-file scope I used to raise the original finding — ' +
        'tests/unit/coordinator, tests/unit/retention, tests/unit/fleet, tests/unit/coordination, lib/coordinator ' +
        '(plus tests/unit/sweep) — so the before/after numbers span the same extent rather than a scope chosen ' +
        'after the fact. BEFORE: 4 failed | 3618 passed | 1 skipped. NOW: 309 files, 3652 passed | 1 skipped, ' +
        'ZERO failed. The three previously-red suites (session-coordination-ack-convergence, ' +
        'promotion-ack-guards, promotion-ack) run 29/29. The mock rewrite is the right shape: a self-returning ' +
        'builder that RECORDS filters instead of encoding their arrival order, which is what made the old mock ' +
        'fail on a change the SUT handled correctly. I did not re-run the full 35k tier and do not claim to have ' +
        'verified the "7 failed / 34998 passed baseline-identical" figure — that specific claim is RELAYED, NOT ' +
        'VERIFIED-BY-ME. What I verified is that the regression I raised is gone in the scope I raised it in.',
      recommendation: 'None. Closed.'
    },
    {
      id: 'R2-B2-CLOSED-third-writer-guarded-and-the-guard-mechanism-proven-live',
      severity: 'info',
      note: 'VERIFIED CLOSED, and I proved the MECHANISM rather than the presence of a line. ' +
        'scripts/drain-dead-letter-coordination.mjs:37 now chains .is(`payload->>${PROMOTION_ACK_KEY}`, null) ' +
        'onto the candidate select, importing the key via createRequire. THE PROBLEM WITH TESTING THAT GUARD ' +
        'TODAY: zero live rows carry promotion_ack (the router fix is unmerged), so any assertion about it ' +
        'CANNOT FAIL and a green reading would be inert. So I ran a POSITIVE CONTROL on a POPULATED key with the ' +
        'identical filter shape: total rows 5253; rows carrying payload.routed_to_feedback_id = 10; ' +
        '.is(payload->>routed_to_feedback_id, null) = 5243. 5243 == 5253 - 10 exactly, so the ' +
        '.is(payload->>KEY, null) shape genuinely EXCLUDES rows carrying the key at the PostgREST layer. ' +
        'Because the exclusion sits in the SELECT, a promoted row never enters `unacked`, is never passed to ' +
        'classifyDeadLetterRow, and is therefore never reached by the L64 update that writes acknowledged_at AND ' +
        'read_at together. That is the specific four-surface blinding I raised — coordinator inbox, sender ' +
        'outstanding view, isRouterSwallowed (needs !read_at) and REPLY_STARVATION (no auto_acked marker, so ' +
        'isGenuinelyAcknowledged reads it as a human answer) — and it is prevented at the selector, which is the ' +
        'strongest place to prevent it. The header correction from TWO to THREE, with the count labelled as ' +
        'current knowledge rather than a closed set, is the right fix for the false-completeness half.',
      recommendation: 'None on the control itself. See R3 for its regression protection.'
    },
    {
      id: 'R3-CONDITION-the-grep-gap-is-CLOSED-twice-and-RELOCATED-once',
      severity: 'medium',
      note: 'THE DIRECT ANSWER TO THE QUESTION ASKED. I built a six-mutation harness that, for each mutation, ' +
        'FIRST proves the mutation actually landed (git diff must be non-empty, else the case is reported ' +
        'INVALID rather than passing) and then runs promotion-ack-guards + session-coordination-ack-convergence. ' +
        'Baseline unmutated: 14/14 green. RESULTS — M1 delete the convergeAckTTL guard line: RED. M2 rebind the ' +
        'convergeAckTTL import as { PROMOTION_ACK_SOURCE_KEY: PROMOTION_ACK_KEY } so it filters the WRONG ' +
        'column: RED. M3 comment the convergeAckTTL guard out: RED. M4 delete the STUCK-drain guard from its ' +
        'query and bolt an identical .is() elsewhere in the 3800-line file: RED (the slice-scoping works). ' +
        'M6 rebind the dead-letter import to the wrong key: RED. So five of six evasions are genuinely dead, ' +
        'and the behavioural spy on convergeAckTTL is real — it observes the filters actually applied and ' +
        'asserts the exact column string, which is why M2 dies. THE ONE THAT SURVIVED — M5: delete the guard ' +
        'from the dead-letter drain\'s real query and bolt an identical .is() onto an unrelated helper in the ' +
        'same file. Suite stayed 14/14 GREEN. So the gap is CLOSED for convergeAckTTL and for the STUCK-drain, ' +
        'and RELOCATED onto the dead-letter drain — the newest guard, and the one this very commit calls "the ' +
        'worst of the three". The assertion at that site is file-global ' +
        '(expect(deadLetter).toMatch(/\\.is\\(`payload->>\\${PROMOTION_ACK_KEY}`, null\\)/)) while the sweep\'s ' +
        'equivalent was hardened with slice()-scoping in the same commit. The test-file header states that the ' +
        'residual source assertions "(a) strip comments, and (b) scope to the enclosing query block rather than ' +
        'matching file-globally" — (b) is true of the sweep and NOT true of the dead-letter site, so that ' +
        'header is the same overclaim class the commit was written to remove, one file over. TO BE FAIR TO THE ' +
        'FIX: drain-dead-letter-coordination.mjs is ~95 lines, not 3800, so accidental satisfaction is far less ' +
        'likely there than it was in the sweep, and the shipped guard is correct today (R2). This is a ' +
        'regression-protection gap, not a defect in the control — which is exactly why it is a CONDITION and ' +
        'not a blocker.',
      recommendation: 'Two lines: scope the dead-letter assertion with the same slice() idiom used for the ' +
        'STUCK-drain (anchor on "session_coordination\', \'id,target_session" and cut at the closing paren), ' +
        'and amend the test-file header so claim (b) describes what the file actually does at each of the three ' +
        'sites. main() there has no injection point, so a behavioural spy would need a refactor — the scoped ' +
        'source assertion is the proportionate fix.'
    },
    {
      id: 'R4-FOURTH-PATH-dead-letter-planning-automatic-and-newly-reachable',
      severity: 'medium',
      note: 'ASKED FOR, AND FOUND. It is NOT an acknowledged_at writer, which is precisely why my first ' +
        'enumeration missed it and why none of the three guards cover it: ' +
        'lib/sweep/passes/dead-letter-planning.cjs:64 and its twin lib/sweep/legacy-fallback.cjs:101 both write ' +
        'a COMPUTED patch — `.update(dl.update)` — so my original grep for the literal token "acknowledged_at:" ' +
        'could never see them. THAT IS THE METHOD LESSON: I enumerated by ASSIGNMENT SYNTAX, and any writer ' +
        'that builds its patch object elsewhere is invisible to that search. I re-enumerated by CALL SITE ' +
        'instead and found three computed-patch updates on this table; the third ' +
        '(scripts/hooks/coordination-inbox.cjs:735 `.update(upd)`, where upd.acknowledged_at is set ' +
        'conditionally) I cleared BY EXECUTION rather than by reading — calling the real classifier on a ' +
        'promoted-signal row shape returns {skip:true}, so it never reaches the ack branch. ' +
        'WHY PATH 4 MATTERS: its selector is .is(acknowledged_at,null).is(read_at,null), which is EXACTLY the ' +
        'state a promoted row now sits in, and it is newly reachable for the same reason as path 3 — pre-fix ' +
        'those rows carried acknowledged_at and the caller filter excluded them. Confirmed by EXECUTING the real ' +
        'exported planDeadLetters() against a crafted post-fix promoted row (ack null, read null, ' +
        'promotion_ack true, target a stale coordinator UUID, past expires_at): 1 row planned, patch = ' +
        '{read_at, payload:{...dead_letter:true, dead_letter_reason:target_dead}}, acknowledged_at NOT in the ' +
        'patch. NEGATIVE CONTROL (identical row, target alive): 0 rows planned — so the probe discriminates and ' +
        'is not just returning everything. It runs AUTOMATICALLY on every sweep tick, unlike the manual path 3. ' +
        'I WILL NOT INFLATE THE HARM: because it never sets acknowledged_at, the coordinator inbox, the ' +
        'sender\'s outstanding view and REPLY_STARVATION all continue to show the row (the starvation detector ' +
        'deliberately does not skip read rows). What it actually does is stamp read_at and thereby start the ' +
        'cleanup_expired_coordination fuse (expires_at < now AND read_at <= now-7d), after which the row is ' +
        'ARCHIVED to retention_archive and deleted — 7 days, not instant, and archived rather than destroyed, ' +
        'with the signal content independently preserved in the feedback row it was promoted into. So this is a ' +
        'real fourth removal path, correctly characterised as slow and bounded rather than as a fifth ' +
        'four-surface blinding. ALSO CLEARED IN THIS PASS, as classes my first enumeration never checked at ' +
        'all: server-side writers (pg_proc across the public schema — only cleanup_expired_coordination, which ' +
        'is DELETE-only, and an INSERT-lint function; neither updates acknowledged_at), TRIGGERS (one, BEFORE ' +
        'INSERT, lint only), and REWRITE RULES (none). No hidden database-layer path exists.',
      recommendation: 'Either add the promotion_ack exclusion to the dead-letter candidate read in both ' +
        'dead-letter-planning.cjs and legacy-fallback.cjs (they are kept in lockstep by ' +
        'sweep-legacy-twin-parity.test.js, so both or neither), or record explicitly in promotion-ack.cjs why a ' +
        '7-day archive fuse on a promoted row is acceptable given the content lives in feedback. Do not leave ' +
        'it unstated — an unenumerated path is how this SD got to a third writer.'
    },
    {
      id: 'R5-RETRACTION-my-S2a-backfill-recommendation-was-wrong',
      severity: 'info',
      note: 'THE COORDINATOR IS RIGHT AND I WAS WRONG. Stating it as a retraction rather than burying it, ' +
        'because a recommendation to mutate 9 production rows is the kind of advice that gets acted on. ' +
        'MEASURED: of the 10 feedback rows the promoted signals were filed into, 8 are status=resolved ' +
        '(dcf92daa, 66b0f7e7, 9d06bdb8, a8e7138e, f65e82a7, 48461d0a, 8b33b021, 26d2bccf); the 2 that are ' +
        'status=new are the newest signal and my own S3b escalation filed minutes ago. So the disposition ' +
        'record for these signals lives in feedback.status, NOT in session_coordination.acknowledged_at. ' +
        'Un-acking them would push 8 already-answered items back into the coordinator inbox as unhandled — a ' +
        'different false state, not a repair, and the mirror image of the defect this SD closes. MY ERROR: I ' +
        'treated session_coordination as the custody surface, when promotion exists precisely to MOVE custody ' +
        'to feedback; deletion of the coordination row therefore loses nothing operationally (content in ' +
        'feedback, row in retention_archive). To answer the question as asked — "if you still think a backfill ' +
        'is right, say what it should restore them TO" — there is no correct target state, which is itself the ' +
        'proof the recommendation was wrong. Forward-only is right. ' +
        'ONE FORWARD-LOOKING CONSEQUENCE WORTH RECORDING, which the same measurement surfaced: all 9 original ' +
        'rows return hasCorrelatedReply=false even though 8 are resolved in feedback. After this fix, promoted ' +
        'rows stay acknowledged_at-NULL with no correlated reply, so REPLY_STARVATION will alarm on them ' +
        'indefinitely while feedback says resolved. The only state that silences the gauge is a manual ' +
        'scripts/coordinator-ack-signal.cjs run, one id at a time, against 247 unacked signals — so the fix ' +
        'removes the wrong auto-silencer without adding a right one. That is not a reason to backfill and not a ' +
        'blocker; it is a reason to give the coordinator a bulk disposition verb, or to teach ' +
        'isGenuinelyAcknowledged to consult the promoted feedback row\'s status, before the gauge gets tuned ' +
        'out as noisy.',
      recommendation: 'Do NOT backfill. Do consider, as a follow-up, either a bulk disposition verb or teaching ' +
        'the starvation gauge to treat a promoted row whose feedback row is resolved as answered — otherwise ' +
        'the gauge this SD just restored will alarm on resolved work.'
    },
    {
      id: 'R6-S3b-routing-is-correct-and-the-escalation-was-verified-not-assumed',
      severity: 'info',
      note: 'THE ROUTING IS RIGHT — filing it, not blocking this PR, is the correct call and I would push back ' +
        'if it were blocked here. The authenticated-role TRUNCATE exposure is pre-existing, sits entirely ' +
        'outside this diff, and its fix is a grants audit (a REVOKE plus a sweep for the same pattern on other ' +
        'tables), not anything this PR can carry. Blocking a communication-integrity fix on an unrelated ' +
        'platform grant would delay a control that reduces harm while fixing nothing. I VERIFIED THE ' +
        'ESCALATION ACTUALLY LANDED rather than accepting that it was sent: session_coordination row 8ef9f9d6 ' +
        'exists (read_at SET, correlated reply present) and was promoted into feedback 2c6555e3, titled ' +
        '"PRE-EXISTING CRITICAL, found during SECURITY review of SIGNAL-ROUTER-A...", status=new. Both related ' +
        'notes are in scope of that filing: the migration file still shipping FOR ALL USING(true) WITH ' +
        'CHECK(true) with no TO clause while live has diverged to a SELECT-only policy, and anon holding SELECT ' +
        'on every signal body. One addition for the filed item: the TRUNCATE grant is RLS-invisible on EVERY ' +
        'table that carries it, so the finding is a grants audit rather than a single revoke.',
      recommendation: 'Keep the routing as filed. Add "sweep all tables for a TRUNCATE grant to authenticated" ' +
        'to the filed item — the class, not the instance.'
    },
    {
      id: 'R7-S4-and-S5-should-not-block',
      severity: 'low',
      note: 'ASKED DIRECTLY, ANSWERED DIRECTLY: NEITHER SHOULD BLOCK. S4 (fail-open on a missing or renamed ' +
        'key) — the failure requires someone to rename or mistype the key, and the single-constant import at ' +
        'all three sites plus the now-mutation-proven wrong-key assertions (M2 and M6 both RED) make that the ' +
        'hard path rather than the easy one. The residual SQL/JS divergence at promotion_ack:false remains real ' +
        '(SQL skips the row, isPromotionAcked returns false, so it is undrainable AND silent to the gauge) but ' +
        'it is reachable only by a service-role writer choosing to write a non-true value, and it fails toward ' +
        'RETENTION. S5 (promotion_ack_source has no readers) — the commit now frames it as provenance for a ' +
        'human rather than a control, which is an honest description of what it is, and once described that ' +
        'way it is not a defect. Neither is worth holding a control that reduces live harm. Both are correctly ' +
        'stated rather than claimed otherwise, and that is the property that matters.',
      recommendation: 'No action required to merge. If either is ever touched again, prefer making the SQL and ' +
        'JS predicates agree over deleting either one.'
    },
    {
      id: 'R8-why-conditional-pass-and-not-fail',
      severity: 'info',
      note: 'STATED EXPLICITLY BECAUSE THE INSTRUCTION WAS NOT TO UPGRADE AS A FORMALITY. The two findings that ' +
        'produced the FAIL were defects in SHIPPED BEHAVIOUR: a red test tier reported green, and a live ' +
        'unguarded writer that retired unread operational orders. Both are now closed and I verified each by ' +
        'execution — a re-run at the identical scope, a live positive control on the guard mechanism, and a ' +
        'mutation harness that proves it mutated before it reports. What remains is categorically different: ' +
        'R3 is a weakness in a TEST protecting a guard that is present and correct, and R4 is a slow, ' +
        'archived, bounded removal path whose content survives in feedback. Neither makes the deliverable ' +
        'wrong; both are follow-ups. Holding FAIL for them would make the verdict a statement about my ' +
        'thoroughness rather than about the artifact, and would block a control that measurably reduces harm ' +
        'today. Equally, PASS would be wrong: a surviving mutation on the newest guard and an unenumerated ' +
        'automatic fourth path are exactly the kind of residue that should be recorded as conditions rather ' +
        'than waved through. CONDITIONAL_PASS is the accurate instrument, and the two conditions are named ' +
        'above so they are auditable rather than remembered.',
      recommendation: 'Merge with the two conditions tracked as completion flags. If only one is taken, take ' +
        'R3 — it is two lines and it protects the guard that the commit itself calls the worst of the three.'
    }
  ],
  recommendations: [
    'CONDITION 1 (high, non-blocking): block-scope the dead-letter guard assertion in promotion-ack-guards.test.js with the same slice() idiom used for the STUCK-drain, and correct the test-file header — its claim that the residual assertions "scope to the enclosing query block" is true of the sweep and false of the dead-letter site. Mutation M5 proves the assertion currently survives guard relocation.',
    'CONDITION 2 (medium, non-blocking): decide and record the disposition of the FOURTH path — lib/sweep/passes/dead-letter-planning.cjs and its lockstep twin lib/sweep/legacy-fallback.cjs. Selector .is(acknowledged_at,null).is(read_at,null) matches the post-fix promoted state; confirmed by executing planDeadLetters with a negative control. Either exclude promotion-marked rows in both files, or state in promotion-ack.cjs why a 7-day archive fuse is acceptable.',
    'DO NOT BACKFILL the 9/10 promoted rows — retracting my own prior recommendation. 8 of 10 promoted feedback rows are status=resolved; disposition lives in feedback.status, and un-acking would resurface answered work as unhandled.',
    'FOLLOW-UP (medium): the fix removes the wrong auto-silencer without adding a right one — promoted rows stay ack-NULL with no correlated reply, so REPLY_STARVATION will alarm on rows whose feedback row says resolved. Give the coordinator a bulk disposition verb, or teach the gauge to consult the promoted feedback row status, before the restored gauge is tuned out as noisy.',
    'KEEP S3b FILED, NOT BLOCKING — verified the escalation landed (session_coordination 8ef9f9d6 -> feedback 2c6555e3). Add "sweep every table for a TRUNCATE grant to authenticated" to that item: the grant is RLS-invisible wherever it exists, so it is a grants audit, not one revoke.',
    'S4 and S5 should not block. Both are honestly stated; the single-constant import plus the now-mutation-proven wrong-key assertions make the S4 rename path hard rather than easy.',
    'METHOD NOTE FOR THE NEXT ENUMERATION: enumerate ack-writers by CALL SITE, never by assignment syntax. My first pass grepped the literal "acknowledged_at:" and was structurally blind to the three computed-patch writers (.update(dl.update) x2, .update(upd) x1) — one of which is the fourth path. Also check pg_proc, pg_trigger and pg_rewrite; I did this pass and they are clean, but no JS grep can see them.'
  ],
  warnings: [
    'The grep-cannot-see-runtime-death gap is CLOSED for convergeAckTTL and the STUCK-drain and RELOCATED onto the dead-letter drain. Mutation M5 (delete the guard from the real query, bolt an identical .is() onto an unrelated helper) leaves the suite 14/14 GREEN. Five of six mutations correctly turn it red; this one does not.',
    'The prior enumeration was blind by CONSTRUCTION, not by carelessness: grepping "acknowledged_at:" cannot see a writer that builds its patch object elsewhere. Three such writers exist on this table and one of them is the fourth path. Any future count of writers on session_coordination must be taken by call site.',
    'The "7 failed / 34998 passed, baseline-identical" full-tier figure is RELAYED-UNVERIFIED — I did not re-run the full tier. What I VERIFIED-BY-ME is that the 304-file scope in which I raised the regression is now 309 files / 3652 passed / 0 failed.',
    'The guard on the dead-letter drain cannot be tested against live data today because zero rows carry promotion_ack — a green assertion on that key is currently unfalsifiable. The mechanism was therefore proven with a positive control on a populated key of identical shape (5243 == 5253 - 10), not by observing the marker itself.',
    'After this fix REPLY_STARVATION will alarm indefinitely on promoted rows whose feedback row is already resolved (all 9 show hasCorrelatedReply=false while 8 are resolved). The only reachable silencer is a manual per-id CLI against a 247-row backlog. A gauge that cannot be silenced by the workflow that actually dispositions the work gets tuned out.'
  ],
  critical_issues: [],
  detailed_analysis:
    'RE-REVIEW SCOPE: commit 9fc14a16 against the two BLOCKING findings in SECURITY row cdb59cda (FAIL). The ' +
    'instruction was explicit — do not upgrade as a formality — so every claim below is either VERIFIED-BY-ME ' +
    'by execution or labelled RELAYED-UNVERIFIED.\n\n' +
    'B1 — CLOSED. Re-run at the IDENTICAL 304-file scope used to raise it, so the before and after span the ' +
    'same extent rather than a scope chosen after the fact: 4 failed | 3618 passed BEFORE, 309 files / 3652 ' +
    'passed / 1 skipped / ZERO failed NOW. The mock rewrite is structurally right — recording filters instead ' +
    'of encoding their arrival order is what stops it failing on changes the SUT handles correctly. I did NOT ' +
    're-run the full 35k tier; the "baseline-identical" figure is relayed.\n\n' +
    'B2 — CLOSED, and proven at the mechanism rather than at the line. The guard is in the SELECT, so a ' +
    'promoted row never enters the candidate set, is never classified, and never reaches the L64 write that ' +
    'sets acknowledged_at AND read_at together — which is the four-surface blinding I raised. Testing that ' +
    'guard directly today is unfalsifiable (zero rows carry promotion_ack), so I ran a positive control on a ' +
    'POPULATED key of identical shape: 5253 total, 10 carrying routed_to_feedback_id, 5243 returned by ' +
    '.is(payload->>routed_to_feedback_id, null). 5243 == 5253 - 10 exactly. The exclusion shape works.\n\n' +
    'THE QUESTION ASKED — CLOSED OR RELOCATED. Six mutations, each proving it landed (non-empty git diff) ' +
    'before running, else reported INVALID. Baseline 14/14 green. M1 delete convergeAckTTL guard: RED. M2 ' +
    'rebind its import to the wrong key: RED. M3 comment it out: RED. M4 relocate the STUCK-drain guard to an ' +
    'unrelated query in the same 3800-line file: RED. M6 rebind the dead-letter import: RED. M5 relocate the ' +
    'DEAD-LETTER guard the same way M4 did: GREEN — SURVIVED. So: closed twice, relocated once, onto the ' +
    'newest guard and the one the commit calls the worst of the three. The behavioural spy on convergeAckTTL is ' +
    'genuine (M2 dying proves it asserts the exact column string, not merely that some filter was applied). ' +
    'The test-file header claiming the residual assertions "scope to the enclosing query block" describes the ' +
    'sweep accurately and the dead-letter site inaccurately — the same overclaim shape the commit set out to ' +
    'remove, one file over. Mitigating and stated in fairness: that file is ~95 lines, not 3800, so accidental ' +
    'satisfaction is far less likely, and the shipped guard is correct today.\n\n' +
    'THE FOURTH PATH. Found, and the reason it was missed is the useful part. My first enumeration searched by ' +
    'ASSIGNMENT SYNTAX ("acknowledged_at:"), which is structurally blind to any writer that builds its patch ' +
    'object elsewhere. Re-enumerating by CALL SITE surfaced three computed-patch updates on this table. Two are ' +
    'the fourth path: lib/sweep/passes/dead-letter-planning.cjs:64 and its lockstep twin ' +
    'lib/sweep/legacy-fallback.cjs:101, both `.update(dl.update)`. Their selector is ' +
    '.is(acknowledged_at,null).is(read_at,null) — exactly the post-fix promoted state, newly reachable for the ' +
    'same reason path 3 was. Confirmed by EXECUTING the real exported planDeadLetters against a crafted ' +
    'post-fix promoted row: 1 row planned, patch sets read_at and dead_letter, acknowledged_at absent; negative ' +
    'control with the target alive returns 0, so the probe discriminates. It runs automatically every sweep ' +
    'tick. The third computed-patch writer (coordination-inbox.cjs:735) I cleared BY EXECUTION — the real ' +
    'classifier returns {skip:true} on a promoted-signal shape, so it never reaches the ack branch. I also ' +
    'cleared three classes the first pass never checked at all: server-side functions (pg_proc — only the ' +
    'DELETE-only cleanup and an INSERT lint), triggers (one, BEFORE INSERT, lint), and rewrite rules (none). ' +
    'HARM, NOT INFLATED: path 4 never sets acknowledged_at, so the inbox, the sender view and REPLY_STARVATION ' +
    'all keep showing the row; it stamps read_at and starts a 7-day cleanup fuse, after which the row is ' +
    'ARCHIVED, with content independently preserved in feedback. Slow, bounded, and worth guarding or ' +
    'explicitly accepting — not a fifth emergency.\n\n' +
    'MY OWN RETRACTION. The backfill recommendation in my prior row was wrong and the coordinator was right. ' +
    '8 of the 10 promoted feedback rows are status=resolved, so disposition is recorded in feedback.status, ' +
    'not in acknowledged_at; un-acking would push answered work back into the inbox as unhandled. Asked what ' +
    'the backfill should restore them TO, there is no correct target — which is the proof. My error was ' +
    'treating session_coordination as the custody surface when promotion exists to move custody to feedback. ' +
    'The same measurement did surface a genuine forward-looking issue: all 9 show hasCorrelatedReply=false ' +
    'while 8 are resolved, so post-fix the restored gauge will alarm indefinitely on resolved work and its only ' +
    'reachable silencer is a manual per-id CLI against 247 rows.\n\n' +
    'S3b ROUTING. Correct as filed, and I verified it landed rather than accepting that it was sent (row ' +
    '8ef9f9d6 -> feedback 2c6555e3). It is pre-existing, its fix is a grants audit, and blocking this PR on it ' +
    'would delay a harm-reducing control while fixing nothing.\n\n' +
    'VERDICT. Both behaviour-level blockers are closed and independently verified. What remains is one weak ' +
    'test protecting a correct guard and one slow, archived, bounded removal path. That is CONDITIONAL_PASS ' +
    'with two named conditions — not FAIL, which would make the verdict about my thoroughness rather than the ' +
    'artifact, and not PASS, which would wave through a surviving mutation on the newest guard and an ' +
    'unenumerated automatic fourth path.',
  metadata: {
    version: '2.0.0',
    review_type: 'adversarial_re_review_with_mutation_harness_and_live_positive_controls',
    supersedes_row: 'cdb59cda-89cb-4df0-8e43-0d55a1bdf85b',
    prior_verdict: 'FAIL',
    reviewed_commit: '9fc14a164bce5ba400a36164a0f2d46c1723b5cf',
    branch: 'feat/SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001',
    pr: 6786,
    blocker_status: {
      B1_red_tier: 'CLOSED — verified at the identical 304-file scope: 4 failed -> 0 failed (309 files, 3652 passed)',
      B2_third_writer: 'CLOSED — guard in the SELECT; mechanism proven by live positive control (5243 == 5253 - 10)'
    },
    mutation_harness: {
      method: 'each mutation proves it landed (non-empty git diff) before the suite runs; otherwise reported INVALID rather than passing',
      baseline: '14/14 green',
      M1_converge_delete_guard: 'RED (correct)',
      M2_converge_rebind_import_to_wrong_key: 'RED (correct — proves the spy asserts the exact column string)',
      M3_converge_comment_guard_out: 'RED (correct)',
      M4_sweep_relocate_guard_to_unrelated_query: 'RED (correct — block-scoping works)',
      M5_deadletter_relocate_guard_to_unrelated_line: 'GREEN — SURVIVED. The gap is relocated here.',
      M6_deadletter_rebind_import_to_wrong_key: 'RED (correct)',
      verdict: 'closed for convergeAckTTL and the STUCK-drain; relocated onto the dead-letter drain'
    },
    fourth_path: {
      files: ['lib/sweep/passes/dead-letter-planning.cjs:64', 'lib/sweep/legacy-fallback.cjs:101'],
      why_missed_first_time: 'writes a COMPUTED patch (.update(dl.update)), invisible to a grep for the literal "acknowledged_at:"',
      selector: '.is(acknowledged_at, null).is(read_at, null) — exactly the post-fix promoted state',
      automatic: true,
      proof: 'executed the real exported planDeadLetters on a crafted post-fix promoted row -> 1 row planned, patch sets read_at + dead_letter, acknowledged_at absent',
      negative_control: 'identical row with target alive -> 0 rows planned',
      harm: 'does NOT ack, so inbox / sender view / REPLY_STARVATION all keep showing it; stamps read_at and starts a 7-day cleanup fuse; row is ARCHIVED and content survives in feedback'
    },
    classes_cleared_this_pass: {
      computed_patch_writers: '3 found by call-site enumeration; coordination-inbox.cjs:735 cleared BY EXECUTION (classifier returns {skip:true} on a promoted signal)',
      server_side_functions: 'pg_proc scan — only cleanup_expired_coordination (DELETE-only) and session_coordination_insert_lint; neither updates acknowledged_at',
      triggers: 'one, BEFORE INSERT, lint only',
      rewrite_rules: 'none'
    },
    s2_backfill_retraction: {
      prior_recommendation: 'backfill the 9 victims (acknowledged_at -> NULL, promotion_ack -> true)',
      status: 'RETRACTED — the coordinator was right',
      evidence: '8 of 10 promoted feedback rows are status=resolved; disposition lives in feedback.status, not acknowledged_at; there is no correct target state to restore them to',
      residual_issue: 'all 9 show hasCorrelatedReply=false while 8 are resolved, so post-fix REPLY_STARVATION will alarm indefinitely on resolved work; only silencer is a manual per-id CLI against 247 rows'
    },
    s3b_routing: {
      assessment: 'routing is CORRECT — file, do not block',
      escalation_verified: 'session_coordination 8ef9f9d6 -> feedback 2c6555e3 "PRE-EXISTING CRITICAL, found during SECURITY review of SIGNAL-ROUTER-A...", status=new',
      addition_requested: 'the TRUNCATE grant is RLS-invisible on EVERY table carrying it — file as a grants audit, not a single revoke'
    },
    live_measurements: {
      session_coordination_total: 5253,
      rows_with_routed_to_feedback_id: 10,
      positive_control_is_filter: '5243 returned == 5253 total - 10 marked (PASS)',
      unacked_rows_drain_candidate_pool: 4802,
      promoted_feedback_rows_resolved: '8 of 10',
      test_scope_before: '304 files, 4 failed | 3618 passed',
      test_scope_after: '309 files, 0 failed | 3652 passed | 1 skipped'
    },
    provenance: {
      verified_by_me: ['B1 re-run at identical scope', 'B2 guard mechanism via live positive control', 'six-mutation harness with landing proof', 'fourth path via executed planDeadLetters with negative control', 'coordination-inbox classifier via execution', 'pg_proc/pg_trigger/pg_rewrite scan', 'feedback.status of all 10 promoted rows', 'S3b escalation row and feedback row'],
      relayed_unverified: ['the full-tier "7 failed / 34998 passed, baseline-identical" figure']
    }
  }
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: CODE,
  targetApplication: 'EHG_Engineer',
  fallback: 'EHG_Engineer'
});
applySubAgentRepoVerdict(results, resolution);

// results.summary and results.findings are NOT mapped columns (verified: both land NULL).
// Fold them into detailed_analysis, which IS mapped, so the per-section evidence persists.
const NL = String.fromCharCode(10);
const HR = '-'.repeat(72);
results.detailed_analysis = [
  'SUMMARY',
  '=======',
  results.summary,
  '',
  results.detailed_analysis,
  '',
  'PER-SECTION FINDINGS (re-review R1-R8)',
  '='.repeat(72),
  '',
  results.findings.map((f) => (
    '[' + String(f.severity).toUpperCase() + '] ' + f.id + NL +
    'FINDING: ' + f.note + NL +
    'RECOMMENDATION: ' + (f.recommendation || '(none - informational)')
  )).join(NL + NL + HR + NL + NL)
].join(NL);

const stored = await storeSubAgentResults(
  CODE,
  SD_ID,
  { name: 'Chief Security Architect' },
  results,
  { sdKey: SD_KEY, phase: PHASE }
);

console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_CONFIDENCE=' + results.confidence);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('REPO_RESOLVED=' + results.metadata.repo_resolved);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
