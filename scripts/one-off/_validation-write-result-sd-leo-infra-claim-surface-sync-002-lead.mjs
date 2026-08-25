#!/usr/bin/env node
/**
 * One-off: Write VALIDATION sub-agent LEAD-phase verdict for
 * SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002 (facet-3 of SD-LEO-INFRA-CLAIM-SURFACE-SYNC-001)
 * ahead of its LEAD-TO-PLAN handoff.
 *
 * Corrected scope under validation: route releaseSessionClaim() + claim-swapper
 * releaseClaim() through bestEffortReleaseSd({expectedSdKey}), add a structural CI lint
 * against NEW raw supabase.rpc('release_sd', ...) call sites, plus regression tests.
 *
 * Uses the canonical repo-evidence + storage pattern per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = '3b7fe486-2597-4e42-a5ce-c68c7d2e3395';
const SD_KEY = 'SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002';

const findings = [
  {
    id: 'F1-no-duplicate-or-overlapping-work-item',
    severity: 'INFO',
    summary: 'NO DUPLICATE / NO OVERLAP for the corrected remaining scope. Searched strategic_directives_v2 (title + description + scope ilike) and quick_fixes (title + description ilike) for release_sd / claim / mirror / bestEffortReleaseSd / expectedSdKey / CLAIM-SURFACE-SYNC. Adjacent items, all distinct: (a) QF-20260825-146 [completed] "Remove dangerous sd_key-mirror-predicate one-off from main" — this IS the originally-scoped file-deletion item, CONFIRMED already done, independently corroborating LEAD Explore ce28f75a; scripts/one-off/sweep-stale-claim-first-customer-001.mjs still exists in THIS worktree but that is stale-base, not un-done work (verify against origin/main at PLAN). (b) QF-20260726-593 [completed] — the parent defect QF that DEFINED the sanctioned mitigation ("have every caller assert the session holds the SD it intends to release before calling"); it was closed at 3-of-16 adoption, so this SD FINISHES a partially-closed QF rather than duplicating it. (c) SD-LEO-INFRA-CLAIM-SURFACE-SYNC-001 [completed] scope = swapClaim() claiming_session_id release + stale-claim sweep + claim-sets-column regression — a DIFFERENT function (swapClaim, switch_sd_claim RPC) on a different axis. (d) SD-LEO-INFRA-CLAIM-FITNESS-FAILOPEN-BYPASS-001 [completed] authored bestEffortReleaseSd itself and migrated only the 3 sd-start.js fail-closed sites. NOTHING in flight claims the two remaining call sites or the lint.'
  },
  {
    id: 'F2-two-escalated-non-terminal-qfs-adjacent-but-distinct',
    severity: 'WARNING',
    summary: 'TWO NON-TERMINAL (status=escalated) QFs sit adjacent and should be explicitly dispositioned at PLAN so this SD is not later read as their duplicate. (1) QF-20260712-817 [escalated] "Claim-release desync: release paths must clear BOTH surfaces atomically" — a DIFFERENT axis (dual-surface co-clear of strategic_directives_v2.claiming_session_id + claude_sessions.sd_key), already addressed by lib/claim/release-claim-both-surfaces.mjs releaseClaimBothSurfaces(), which calls the release_session RPC, NOT release_sd. It is orthogonal to SD-scoping and is NOT closed by this SD. (2) QF-20260824-154 [escalated] "Stale claim-on-switch strands SDs from dispatch" — this is the QF that escalated INTO SD-LEO-INFRA-CLAIM-SURFACE-SYNC-001, which is now completed; the QF status was never reconciled to completed. Neither QF claims this SD scope, but PLAN should note (2) as a status-reconciliation flag, not new work.'
  },
  {
    id: 'F3-sd-row-title-scope-still-describes-superseded-scope',
    severity: 'WARNING',
    summary: 'SCOPE DRIFT IN THE DB ROW — BLOCKS NOTHING BUT MUST BE FIXED AT PLAN. strategic_directives_v2 for SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002 still carries title AND scope = "Claim-surface sync facet-3: per-claim mirror-null attribution + shouldHoldClaim guard at the release choke + remove the defective sweep one-off from main". That text describes the SUPERSEDED scope, including the "remove the defective sweep one-off" item that LEAD Explore ce28f75a proved already-done via QF-20260825-146/PR #7539. The corrected scope (2 call-site migrations + 1 CI lint + regression tests) exists only in session context, not in the database — which is the source of truth. PLAN MUST rewrite title + scope + description before PRD creation, or the PRD will be generated against a requirement set whose first item is a no-op and whose actual items are absent.'
  },
  {
    id: 'F4-helpers-releaseSessionClaim-exact-current-shape',
    severity: 'INFO',
    summary: 'CALL SITE 1 — scripts/modules/handoff/executors/lead-final-approval/helpers.js:399-465, releaseSessionClaim(sd, supabase). Sole SD-completion release choke: called once from lead-final-approval/index.js:852 (re-exported via index.js:88/1464 and LeadFinalApprovalExecutor.js:29). CURRENT SHAPE: (1) session resolved by resolveOwnSession(supabase, {select: "session_id, sd_key, status", warnOnFallback:false}) accepting the result only when resolved.source !== "heartbeat_fallback"; (2) on failure, FALLS BACK to sessionManager.getOrCreateSession(); (3) const claimId = sd.sd_key || sd.id; (4) INLINE GUARD `if (session.sd_key === claimId)` wrapping BOTH the raw rpc AND the heartbeat stop; (5) `const { error } = await supabase.rpc("release_sd", { p_session_id: session.session_id, p_reason: "completed" })`; (6) branches ONLY on `error` — the RPC `data` payload is never read; (7) inside the same guard, stops the heartbeat when heartbeatManager.isHeartbeatActive() reports active AND sessionId matches; (8) whole body wrapped in try/catch that logs and swallows. RETURNS VOID — no caller consumes a return value, so bestEffortReleaseSd\'s {released,error,skipped,heldSdKey} shape needs NO mapping here. The substitution is therefore shape-safe at this site: replace steps (4)+(5) with `const rel = await bestEffortReleaseSd(supabase, session.session_id, "completed", console.log, { expectedSdKey: claimId })` and branch the log on rel.released / rel.skipped / rel.error.'
  },
  {
    id: 'F5-helpers-session-provenance-is-the-actual-rca-vector',
    severity: 'CRITICAL',
    summary: 'WHY THE helpers.js INLINE GUARD DID NOT PREVENT RCA a7d374f4b77ae2a1b — THE GUARD READS A DIFFERENT SOURCE THAN THE RPC ACTS ON. The primary path (resolveOwnSession) reads claude_sessions LIVE from the DB. But the FALLBACK path, sessionManager.getOrCreateSession() -> findExistingSession() (lib/session-manager.mjs:167), reads session state from a LOCAL JSON FILE on disk (SESSION_DIR/*.json), NOT from claude_sessions. So on the fallback path `session.sd_key` is a FILE-CACHED value while release_sd acts on whatever claude_sessions currently says. When the file says sd_key===claimId but the DB row has since moved to a different SD, the inline guard PASSES and the unscoped RPC releases the OTHER SD — the exact QF-20260726-593 / RCA a7d374f4b77ae2a1b defect, reachable through a guard that looks correct. bestEffortReleaseSd({expectedSdKey}) closes this precisely because it re-reads claude_sessions.sd_key itself, moments before the RPC, so the predicate and the action finally read the SAME surface. This makes the migration a genuine defect fix at this site, not a stylistic refactor.'
  },
  {
    id: 'F6-claim-swapper-releaseClaim-exact-current-shape',
    severity: 'INFO',
    summary: 'CALL SITE 2 — scripts/modules/handoff/claim-swapper.js:94-138, releaseClaim(supabase, sessionId, sdKey). CURRENT SHAPE: (1) pre-check SELECT sd_key FROM claude_sessions WHERE session_id = sessionId .maybeSingle(); (2) `if (selectError) return {success:false, reason:"DB error: "+msg}`; (3) `if (!session) return {success:false, reason:"Session <id> not found"}`; (4) `if (session.sd_key !== sdKey) return {success:false, reason:"Session does not hold claim on <sdKey>"}`; (5) raw `supabase.rpc("release_sd", {p_session_id, p_reason:"release_claim"})`; (6) `if (error) return {success:false, reason:"DB error: ..."}`; (7) `if (data && data.success === false) return {success:false, reason: data.error || data.message || "release_sd RPC reported failure"}`; (8) `return {success:true, reason:"Released <sdKey>"}`. KEY: the pre-check at (1)-(4) is BYTE-EQUIVALENT to bestEffortReleaseSd\'s internal expectedSdKey guard — SAME table, SAME select, SAME .eq, SAME .maybeSingle, SAME strict-inequality predicate. Substituting is therefore a pure de-duplication of an already-identical query, with zero new DB round-trips relative to today. sdKey is a REQUIRED FUNCTION PARAMETER, so expectedSdKey needs no computation and carries no timing risk whatsoever.'
  },
  {
    id: 'F7-claim-swapper-return-shape-mapping-required-and-sufficient',
    severity: 'WARNING',
    summary: 'RETURN-SHAPE MAPPING IS REQUIRED AT CALL SITE 2 (unlike site 1). releaseClaim\'s contract is {success:boolean, reason:string}; bestEffortReleaseSd returns {released, error, skipped, heldSdKey}. A bare substitution WOULD break callers. Required mapping, which preserves every distinction the current code makes: rel.released===true -> {success:true, reason:`Released ${sdKey}`}; rel.skipped==="sd_mismatch" && rel.heldSdKey===null -> {success:false, reason:`Session ${sessionId} not found`} (preserves case (3)); rel.skipped==="sd_mismatch" && rel.heldSdKey!==null -> {success:false, reason:`Session does not hold claim on ${sdKey}`} (preserves case (4)); rel.skipped==="scope_unverifiable" -> {success:false, reason:`DB error: ${rel.error}`} (preserves case (2)); rel.error && !rel.skipped -> {success:false, reason:`DB error: ${rel.error}`} (preserves case (6)). NOTE the wrapper CONFLATES "session row absent" and "session holds a different SD" into one skipped code, but heldSdKey===null vs non-null distinguishes them, so NO information is lost provided the mapping keys on heldSdKey. Also note bestEffortReleaseSd NEVER THROWS, whereas releaseClaim currently has its own try/catch returning {success:false, reason:`Exception: ...`} — that catch becomes unreachable for the release leg and can stay as a harmless outer net.'
  },
  {
    id: 'F8-release-sd-never-returns-success-false-dead-branch',
    severity: 'WARNING',
    summary: 'THE ONE SIGNAL THE WRAPPER DROPS IS DEAD CODE TODAY — VERIFIED AT THE MIGRATION, NOT ASSUMED. bestEffortReleaseSd checks only res.error (the PostgREST transport error) and never inspects res.data, so claim-swapper step (7) `if (data && data.success === false)` has no equivalent in the wrapper. Read BOTH live definitions of the RPC: database/migrations/20260502_release_clear_worktree_state.sql (release_sd, lines 26-100) and the superseding database/migrations/20260727_release_sd_qf_reopen.sql (lines 65-127). EVERY return path in BOTH versions is jsonb_build_object("success", true, ...) — the early "No SD to release" return and the terminal released_sd return. There is NO success:false return anywhere in either version. So step (7) is UNREACHABLE today and substituting the wrapper loses NOTHING observable. RESIDUAL RISK (accepted-debt or fix): if release_sd is ever amended to return success:false, bestEffortReleaseSd would silently report released:true and every caller would believe a failed release succeeded. RECOMMENDATION to PLAN: harden the wrapper with a ~3-line `if (res?.data?.success === false) return { released:false, error: res.data.error || res.data.message }` — it benefits all 4 wrapper consumers at once and makes the dropped branch permanently non-dead, rather than recording accepted debt at one call site.'
  },
  {
    id: 'F9-lint-precedent-is-whole-corpus-not-diff-scoped',
    severity: 'WARNING',
    summary: 'LINT PRECEDENT READ IN FULL (scripts/lint/require-main-guard-in-one-off-lint.mjs, 199 lines) — AND IT IS NOT DIFF-SCOPED. Correcting the SD framing: this control performs a WHOLE-CORPUS recursive walk (SCAN_DIRS=["scripts/one-off"], SCAN_EXTENSIONS={.mjs,.cjs,.js}, EXCLUDE_DIR_SEGMENTS=[node_modules,.git,.worktrees,dist,build,coverage,archive,_deprecated], EXCLUDE_FILE_RE=/(\\.test\\.|\\.spec\\.)/i) and achieves "only NEW violations block" ENTIRELY via the grandfather allowlist, not via git-diff scoping. Structure to copy: (1) detection lives in a separate eslint-rules/*.js rule loaded through ESLint\'s Linter API with an inline FLAT_CONFIG — deliberately NOT wired into eslint.config.js; (2) loadAllowlist() (exported for tests) reads a JSON map filePath->reason, THROWS LOUD on any empty/non-string reason, and returns {} on a MISSING file (fail-open on absence, fail-closed on malformed); (3) hits partition into `violations = hits.filter(h => !(h.filePath in allow))` and `grandfathered`; (4) exit(violations.length > 0 ? 1 : 0); (5) message shape `  ${filePath}:${line}:${column}  ${message}` followed by a "Fix:" line and an "Or, if this file is genuinely pending retrofit, add a reason-required entry to <allowlist path>" line; (6) --json and --root flags. CI: .github/workflows/require-main-guard-in-one-off-lint.yml, pull_request path-filtered, no continue-on-error. HARD CONSTRAINT INHERITED FROM THAT WORKFLOW (it cost a documented 32-day CI blindness on the sibling control): GitHub Actions does NOT expand brace alternation, so path filters MUST be listed ONE ENTRY PER EXTENSION — never scripts/**/*.{mjs,cjs}.'
  },
  {
    id: 'F10-accurate-day-one-allowlist-count-lead-list-was-wrong',
    severity: 'CRITICAL',
    summary: 'DAY-ONE ALLOWLIST COUNT RE-DERIVED BY MY OWN GREP — THE LEAD-PHASE LIST IS WRONG ON 3 OF ITS 12 FILES. Grepped rpc(\'release_sd\' / rpc("release_sd" / rpc(`release_sd` across *.js/*.mjs/*.cjs/*.ts excluding node_modules. TRUE PRODUCTION RAW CALL SITES = 15, in 11 files: lib/claim-guard.mjs (:613, :731), lib/commands/claim-command.js:184, lib/session-manager.mjs:864, scripts/hooks/reclaim-sd-after-compaction.cjs (:153, :166), scripts/hooks/session-state-sync.cjs:248, scripts/modules/claim-health/self-heal.js:92, scripts/modules/complete-quick-fix/orchestrator.js:1040, scripts/modules/sd-next/claim-analysis.js:283, scripts/sd-start.js (:1207, :1244, :1467), PLUS the 2 this SD fixes (scripts/modules/handoff/claim-swapper.js:122, scripts/modules/handoff/executors/lead-final-approval/helpers.js:441). AFTER this SD lands: 13 raw sites across 9 files need allowlist entries — NOT the "~14" the LEAD list implied. THE LEAD LIST\'S 3 ERRORS, each verified: scripts/fleet-kill.mjs ALREADY routes through bestEffortReleaseSd (import at :24, call at :113); scripts/stale-session-sweep.cjs ALREADY routes through it (dynamic import :223, call :224); lib/checkin/steps/release-request.cjs ALREADY routes through it (dynamic import :85, call :91) — its release_sd mentions are COMMENTS ONLY. All three are already-migrated consumers and must NOT be allowlisted. Existing adopters are therefore 4 files (fleet-kill, stale-session-sweep, release-request, spawn-control.js:1048) plus sd-start.js\'s 3 wrapper calls (:1404,:1443,:1455) — a higher adoption baseline than the "3 of ~17" in the SD framing.'
  },
  {
    id: 'F11-lint-needs-exactly-one-structural-exemption',
    severity: 'INFO',
    summary: 'LINT EXEMPTION SURFACE IS CLEAN — EXACTLY ONE FILE. lib/fleet/best-effort-release.mjs:71 is the sanctioned wrapper\'s own implementation and must be structurally exempt (not allowlisted, since it is correct-by-definition and should never be "retrofitted"). VERIFIED that the OTHER sanctioned wrapper needs no exemption: lib/claim/release-claim-both-surfaces.mjs calls rpc("release_session", ...) at :193 — a DIFFERENT RPC — and its only release_sd occurrences (:13, :72) are comments. So a lint keyed on release_sd sees it not at all. Test-file noise is already handled by copying the precedent\'s EXCLUDE_FILE_RE: the 4 test references (tests/integration/worktree-state-atomicity.test.js:113, tests/unit/multi-session-coordination.test.js:173, tests/unit/claim-guard-session-fixes.test.js:213 [comment], scripts/hooks/__tests__/supabase-operative.test.js:21 [assertion string]) all match /(\\.test\\.|\\.spec\\.)/i. Two COMMENT-ONLY mentions (lib/fleet/best-effort-release.mjs:5, scripts/sd-start.js:18) mean a naive regex lint would false-positive — the detector must parse (AST/ESLint rule per the precedent) or at minimum strip comments; an ESLint rule matching CallExpression callee .rpc with a first-argument Literal "release_sd" is the precedent-consistent choice and is comment-immune for free.'
  },
  {
    id: 'F12-file-keyed-allowlist-blinds-mixed-files-highest-value-lint-finding',
    severity: 'CRITICAL',
    summary: 'DO NOT COPY THE PRECEDENT\'S FILE-KEYED ALLOWLIST VERBATIM — IT WOULD BE BLIND ON THIS CORPUS IN A WAY IT IS NOT ON ITS OWN. The precedent keys the allowlist on filePath, and documents this exact weakness in its own KNOWN LIMITATION block ("a guard token appearing ANYWHERE in the file silences a genuinely unconditional call elsewhere in that same file"). That limitation is far MORE damaging here because this corpus is full of MIXED files: scripts/sd-start.js contains 3 raw release_sd calls AND 3 already-correct bestEffortReleaseSd calls; lib/claim-guard.mjs contains 2 raw calls AND uses releaseClaimBothSurfaces as its fallback. A single filePath allowlist entry for sd-start.js would permanently blind the lint to a 4th, NEWLY-ADDED raw call in that same file — precisely the "new/ungoverned violations block" property the SD exists to create. RECOMMENDATION to PLAN (this is the single highest-value design decision in the lint FR): make allowlist entries COUNT-ANCHORED or LINE-ANCHORED, e.g. {"scripts/sd-start.js": {"reason": "...", "expected": 3}}, and FAIL when the observed occurrence count in an allowlisted file EXCEEDS its recorded expected count. That keeps the grandfather ergonomics of the precedent while making a new raw call in an already-allowlisted file a hard failure. It also makes the allowlist self-ratcheting: migrating one site forces the count down, and the entry disappears at zero.'
  },
  {
    id: 'F13-risk-no-legitimate-completion-race-at-either-site',
    severity: 'INFO',
    summary: 'RISK Q4 ANSWERED — NO, expectedSdKey CANNOT PLAUSIBLY FAIL A LEGITIMATE COMPLETION AT EITHER SITE, AND THE TIMING WINDOW STRICTLY SHRINKS. Site 2 (claim-swapper): sdKey is a required parameter already validated against the identical query one statement earlier; expectedSdKey is available with zero computation and zero new timing exposure. Site 1 (helpers.js): claimId = sd.sd_key || sd.id is computed from the SD record the completion path already holds, and is the SAME value the current inline guard uses — so any null/undefined mismatch that would skip AFTER the change ALREADY skips TODAY, identically. Specifically the `|| sd.id` UUID fallback is structurally dead in BOTH worlds: claude_sessions.sd_key stores an SD-KEY string and can never equal a UUID, so that branch fails the comparison before and after. Crucially the RACE WINDOW NARROWS: today sd_key is read at helpers.js:414 (or from a disk file) and compared at :440 with the RPC firing at :441, whereas bestEffortReleaseSd reads and compares immediately before its own rpc call inside one function. Every divergence case resolves in the safe direction — file/DB agree: releases as today; file matches but DB moved on: TODAY releases the wrong SD, AFTER refuses (the fix); file stale-null but DB holds the SD: TODAY leaks the claim, AFTER releases correctly IF the redundant inline guard is dropped.'
  },
  {
    id: 'F14-the-one-genuine-new-failure-mode-fail-closed-on-transient-read-error',
    severity: 'WARNING',
    summary: 'THE ONE GENUINE NEW FAILURE MODE, NAMED RATHER THAN GLOSSED. bestEffortReleaseSd is FAIL-CLOSED on an unverifiable scope check: if the claude_sessions SELECT returns an error (or the client lacks .from), it returns {released:false, error:"scope_unverifiable"} and REFUSES to release. Today, a transient read error at that moment would not prevent the release — helpers.js reads sd_key earlier via a different call, and claim-swapper returns a DB error without ever attempting the RPC (so site 2 is actually UNCHANGED here). So the new exposure is site 1 only: a transient DB blip during SD completion now leaves the claim HELD instead of released. ASSESSMENT: acceptable and correct. It is recoverable by design (stale-session-sweep.cjs + CLAIM_TTL expiry both reclaim a held-but-idle claim, and the very next /leo start or checkin re-resolves), and it is strictly preferable to the alternative failure it replaces — silently releasing an unrelated live claim, which is unrecoverable-by-automation and is what actually happened in RCA a7d374f4b77ae2a1b. REQUIREMENT for PLAN: log this branch LOUDLY at the completion site (the wrapper already logs, but helpers.js currently swallows into a generic warning) and state the tradeoff explicitly in the PRD so it is not later re-discovered as a regression.'
  },
  {
    id: 'F15-heartbeat-stop-placement-is-a-real-behavior-decision',
    severity: 'WARNING',
    summary: 'A BEHAVIOR DECISION HIDES INSIDE THE helpers.js REFACTOR — DO NOT LET IT LAND IMPLICITLY. The heartbeat-stop block (helpers.js:456-460) currently sits INSIDE the `if (session.sd_key === claimId)` guard, so the heartbeat is stopped ONLY when the sd_key guard passes. If PLAN drops that inline guard and delegates scoping to bestEffortReleaseSd (which is the recommended shape, since it fixes the stale-null leak in F13), the heartbeat-stop must be explicitly re-placed. Options: (a) keep it conditional on rel.released — preserves today\'s semantics exactly; (b) make it unconditional, still keyed on its existing `heartbeatStatus.sessionId === session.session_id` check — arguably more correct (a completed SD should not leave a heartbeat running) but IS a behavior change. RECOMMENDATION: choose (b) and cover it with a test, because under (a) a scope_unverifiable skip would leave BOTH the claim held AND the heartbeat running, which would make the F14 failure mode look like a live worker to every liveness gauge — actively harmful. Either way this must be a stated PRD decision with a regression test, not an incidental diff artifact.'
  },
  {
    id: 'F16-regression-test-substrate-already-exists',
    severity: 'INFO',
    summary: 'TEST SUBSTRATE FOR FR-4 ALREADY EXISTS AND SHOULD BE EXTENDED, NOT RE-DERIVED. tests/unit/fleet/best-effort-release-sd-scoping.test.js already proves the wrapper\'s guard semantics directly against QF-20260726-593 (7 cases incl. holds-different-SD, holds-nothing, no-.from, query-error). tests/unit/fleet/best-effort-release.test.js covers the no-throw contract. tests/unit/fleet/release-request.test.js demonstrates the established mocking idiom for a CALLER (vi.mock of best-effort-release.mjs capturing args, asserting bestEffortReleaseSd was/was not called with the right expectedSdKey) — that is exactly the pattern the two new call-site regressions should copy, and it lets the tests assert the RCA a7d374f4b77ae2a1b scenario (session mirrors SD-Y, completion runs for SD-X, release must NOT fire) at the call site rather than only in the wrapper. For the lint fixture test, tests/unit/claim/release-dual-surface-guard.test.js is the in-repo precedent for a source-shape guard test, and scripts/lint/venture-artifacts-write-lint.test.js is the precedent for a lint that ships with its own colocated test. CAUTION from repo memory: source-pin assertions must END-ANCHOR rather than slice fixed character ranges, and a bare regexp value passed to toMatchObject is silently ignored.'
  }
];

const warnings = [
  'PLAN MUST first rewrite the SD row title/scope/description — the DB (source of truth) still describes the superseded scope whose lead item is already done via QF-20260825-146. Generating a PRD against the current row would encode a no-op requirement and omit all three real ones.',
  'claim-swapper.js releaseClaim() returns {success, reason} and CANNOT take bestEffortReleaseSd\'s {released,error,skipped,heldSdKey} directly — a mapping is mandatory. Key the mapping on heldSdKey (null vs non-null) to preserve the "session not found" vs "holds a different SD" distinction the current code makes.',
  'The dropped `data.success === false` branch is verified-dead in BOTH release_sd migration versions, so nothing is lost today — but prefer hardening bestEffortReleaseSd to inspect res.data.success (3 lines, benefits all 4 consumers) over recording accepted debt at one call site.',
  'The lint precedent is WHOLE-CORPUS + allowlist, NOT diff-scoped. Do not build diff-scoping; replicate the allowlist partition, which is what makes only NEW violations block.',
  'Do NOT copy the precedent\'s file-keyed allowlist verbatim: sd-start.js and claim-guard.mjs are MIXED files (raw calls alongside already-correct wrapper calls), so a filePath entry would blind the lint to newly-added raw calls in exactly the files most likely to grow one. Use count-anchored or line-anchored entries.',
  'GitHub Actions path filters must list ONE ENTRY PER EXTENSION — brace alternation silently matches nothing and already caused a documented 32-day CI blindness on the sibling control.',
  'Site 1 gains one genuine new failure mode: fail-closed scope_unverifiable on a transient read error leaves the claim held. Acceptable (TTL/sweep-recoverable, strictly safer than the alternative) but must be logged loudly and stated in the PRD.',
  'The heartbeat-stop currently sits inside the inline guard being removed. Its new placement is a deliberate behavior decision requiring a test — if left conditional, a scope_unverifiable skip leaves the claim held AND the heartbeat running, which reads as a live worker to every liveness gauge.'
];

const recommendations = [
  'PLAN: update strategic_directives_v2 title/scope/description for SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002 to the corrected 3-item scope (2 call-site migrations + CI lint + regression tests) BEFORE running add-prd-to-database.js.',
  'PLAN/EXEC site 1 (helpers.js:440-461): DROP the inline `session.sd_key === claimId` guard entirely and delegate scoping to bestEffortReleaseSd(supabase, session.session_id, "completed", console.log, {expectedSdKey: claimId}). Dropping it (rather than keeping both) is what fixes the stale-file-null leak; keeping it would preserve that leak. Function returns void, so no caller mapping is needed.',
  'PLAN/EXEC site 2 (claim-swapper.js:96-132): delete the now-duplicated pre-check SELECT and route through bestEffortReleaseSd(supabase, sessionId, "release_claim", log, {expectedSdKey: sdKey}), mapping the result to {success, reason} keyed on rel.released / rel.skipped / rel.heldSdKey per F7. Net LOC should be negative at this site.',
  'PLAN: add the ~3-line res.data.success===false check to bestEffortReleaseSd so the one branch claim-swapper loses is closed for every consumer rather than accepted as debt at one site.',
  'PLAN/EXEC lint: implement as eslint-rules/no-raw-release-sd-rpc.js (CallExpression, callee.property.name==="rpc", first arg Literal "release_sd") + scripts/lint/no-raw-release-sd-rpc-lint.mjs driver via the ESLint Linter API, mirroring require-main-guard-in-one-off-lint.mjs. AST detection is comment-immune, which matters because 2 comment-only mentions would false-positive a regex. Structurally exempt lib/fleet/best-effort-release.mjs only; reuse EXCLUDE_FILE_RE for tests.',
  'PLAN/EXEC lint allowlist: seed with 13 sites across 9 files (lib/claim-guard.mjs x2, lib/commands/claim-command.js, lib/session-manager.mjs, scripts/hooks/reclaim-sd-after-compaction.cjs x2, scripts/hooks/session-state-sync.cjs, scripts/modules/claim-health/self-heal.js, scripts/modules/complete-quick-fix/orchestrator.js, scripts/modules/sd-next/claim-analysis.js, scripts/sd-start.js x3), each with a required non-empty reason AND a count anchor. Do NOT allowlist fleet-kill.mjs, stale-session-sweep.cjs or lib/checkin/steps/release-request.cjs — all three already route through the wrapper.',
  'PLAN/EXEC CI: add .github/workflows/no-raw-release-sd-rpc-lint.yml, pull_request-triggered, no continue-on-error, with ONE path-filter entry per extension covering lib/**, scripts/**, the rule, the driver, the allowlist and the workflow itself.',
  'PLAN/EXEC tests: extend the tests/unit/fleet/release-request.test.js vi.mock idiom to both new call sites, asserting the RCA a7d374f4b77ae2a1b scenario (session mirrors SD-Y while completion runs for SD-X => release must NOT fire and, at site 1, the claim stays held); add a lint fixture test proving the rule fires on a synthetic raw-release_sd file and stays silent on a wrapper-routed one; end-anchor any source-pin assertions.'
];

const summary = 'LEAD-phase VALIDATION PASS (confidence 92) for SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002 facet-3. (a) NO DUPLICATE/OVERLAP: searched strategic_directives_v2 + quick_fixes; QF-20260825-146 [completed] confirms the originally-scoped file deletion is already done (corroborating LEAD Explore ce28f75a independently); QF-20260726-593 [completed] is the parent defect closed at partial adoption, so this SD FINISHES it rather than duplicating it; SD-LEO-INFRA-CLAIM-SURFACE-SYNC-001 [completed] covered swapClaim/switch_sd_claim, a different function on a different axis. Two adjacent NON-TERMINAL escalated QFs (QF-20260712-817 dual-surface co-clear, which uses the release_session RPC not release_sd; QF-20260824-154 whose escalation target already completed) are distinct and flagged for disposition, not duplication. (b) BOTH CALL SITES READ IN FULL. helpers.js:399-465 returns VOID, so the wrapper\'s shape needs no mapping there; its inline guard is defeated because resolveOwnSession\'s FALLBACK (getOrCreateSession -> findExistingSession, lib/session-manager.mjs:167) reads a LOCAL JSON FILE, not claude_sessions — so the predicate and the RPC read DIFFERENT surfaces, which is precisely how RCA a7d374f4b77ae2a1b passed a guard that looks correct. claim-swapper.js:94-138 DOES need a mapping to {success,reason}, keyed on heldSdKey to preserve the not-found vs holds-other distinction; its existing pre-check is byte-equivalent to the wrapper\'s internal guard, so substitution is pure de-duplication with no added round-trips. The only signal the wrapper drops, `data.success === false`, is VERIFIED DEAD: every return path in BOTH release_sd migrations (20260502 and the superseding 20260727) is jsonb_build_object("success", true, ...). (c) LINT PRECEDENT read in full — and it is WHOLE-CORPUS + reason-required grandfather allowlist, NOT diff-scoped as the SD framing assumed; "only new violations block" comes entirely from the allowlist partition. ACCURATE DAY-ONE COUNT RE-DERIVED BY MY OWN GREP: 15 raw production call sites in 11 files today, 13 sites in 9 files after this SD — and the LEAD list is WRONG on 3 of its 12 files (fleet-kill.mjs, stale-session-sweep.cjs, lib/checkin/steps/release-request.cjs ALREADY route through bestEffortReleaseSd and must not be allowlisted), making the true adoption baseline 4 files + 3 sd-start sites, not "3 of ~17". Exactly ONE structural exemption is needed (the wrapper itself); the sibling wrapper releaseClaimBothSurfaces calls release_session and is invisible to a release_sd-keyed lint. (d) RISK: NO plausible race can fail a legitimate completion — expectedSdKey is a required parameter at site 2 and the same already-used value at site 1, and the read-to-RPC window strictly SHRINKS at both. Every divergence resolves safely. ONE genuine new failure mode exists and is named: fail-closed scope_unverifiable on a transient read error leaves the claim held at site 1 (site 2 is unchanged) — acceptable because it is TTL/sweep-recoverable and strictly safer than silently releasing an unrelated live claim, but it must be logged loudly and stated in the PRD. TWO BLOCKING-QUALITY DESIGN ITEMS ROUTED TO PLAN: (1) the SD row\'s title/scope still describe the superseded scope and MUST be rewritten before PRD creation; (2) the precedent\'s FILE-KEYED allowlist must NOT be copied verbatim — sd-start.js and claim-guard.mjs are mixed files (raw calls alongside correct wrapper calls), so a filePath entry would blind the lint to newly-added raw calls in exactly the files most likely to grow one; use count-anchored entries that fail when observed occurrences exceed the recorded expected count. Also flagged: the heartbeat-stop currently nested inside the guard being removed is a real behavior decision needing an explicit PRD choice and a test. Nothing blocks LEAD-TO-PLAN.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 92,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      parent_sd_key: 'SD-LEO-INFRA-CLAIM-SURFACE-SYNC-001',
      rca_ref: 'a7d374f4b77ae2a1b',
      defect_qf_ref: 'QF-20260726-593',
      duplicate_check: {
        verdict: 'NO_DUPLICATE',
        tables_searched: ['strategic_directives_v2 (title, description, scope)', 'quick_fixes (title, description)'],
        terms: ['release_sd', 'claim', 'mirror', 'bestEffortReleaseSd', 'expectedSdKey', 'CLAIM-SURFACE-SYNC'],
        adjacent_items: [
          { key: 'QF-20260825-146', status: 'completed', relation: 'IS the originally-scoped file-deletion item — already done, confirms LEAD Explore ce28f75a' },
          { key: 'QF-20260726-593', status: 'completed', relation: 'parent defect; defined the sanctioned mitigation, closed at partial adoption — this SD finishes it' },
          { key: 'SD-LEO-INFRA-CLAIM-SURFACE-SYNC-001', status: 'completed', relation: 'facets 1-2: swapClaim/switch_sd_claim — different function, different axis' },
          { key: 'SD-LEO-INFRA-CLAIM-FITNESS-FAILOPEN-BYPASS-001', status: 'completed', relation: 'authored bestEffortReleaseSd; migrated only the 3 sd-start fail-closed sites' },
          { key: 'QF-20260712-817', status: 'escalated (NON-TERMINAL)', relation: 'dual-surface co-clear via releaseClaimBothSurfaces -> release_session RPC. Orthogonal, NOT closed here' },
          { key: 'QF-20260824-154', status: 'escalated (NON-TERMINAL)', relation: 'escalated INTO SYNC-001 which is completed; QF status never reconciled — flag only' }
        ]
      },
      scope_drift: {
        severity: 'MUST_FIX_AT_PLAN',
        db_title_and_scope: 'Claim-surface sync facet-3: per-claim mirror-null attribution + shouldHoldClaim guard at the release choke + remove the defective sweep one-off from main',
        problem: 'DB row (source of truth) still describes the SUPERSEDED scope; its lead item is already done via QF-20260825-146/PR #7539. PRD generated from this row would encode a no-op and omit all 3 real requirements.'
      },
      call_site_1: {
        file: 'scripts/modules/handoff/executors/lead-final-approval/helpers.js',
        fn: 'releaseSessionClaim(sd, supabase)',
        lines: '399-465',
        rpc_line: 441,
        sole_caller: 'lead-final-approval/index.js:852',
        returns: 'void — NO caller consumes a value, so bestEffortReleaseSd shape needs NO mapping',
        current_guard: 'inline `session.sd_key === claimId` wrapping BOTH the rpc AND the heartbeat stop',
        branches_on: 'error only; RPC data payload never read',
        why_guard_fails: 'resolveOwnSession primary path reads claude_sessions LIVE, but the getOrCreateSession -> findExistingSession fallback (lib/session-manager.mjs:167) reads a LOCAL JSON FILE. Predicate and action read DIFFERENT surfaces — the RCA a7d374f4b77ae2a1b vector.',
        change: 'DROP the inline guard; call bestEffortReleaseSd(supabase, session.session_id, "completed", console.log, {expectedSdKey: claimId}); re-place heartbeat stop deliberately'
      },
      call_site_2: {
        file: 'scripts/modules/handoff/claim-swapper.js',
        fn: 'releaseClaim(supabase, sessionId, sdKey)',
        lines: '94-138',
        rpc_line: 122,
        returns: '{success: boolean, reason: string} — MAPPING REQUIRED',
        current_precheck: 'SELECT sd_key FROM claude_sessions .eq(session_id).maybeSingle() then strict !== compare — BYTE-EQUIVALENT to the wrapper internal guard, so substitution adds zero round-trips',
        expectedSdKey_source: 'sdKey is already a REQUIRED function parameter — zero computation, zero timing risk',
        mapping: {
          'rel.released===true': '{success:true, reason:`Released ${sdKey}`}',
          'skipped=sd_mismatch && heldSdKey===null': '{success:false, reason:`Session ${sessionId} not found`}',
          'skipped=sd_mismatch && heldSdKey!==null': '{success:false, reason:`Session does not hold claim on ${sdKey}`}',
          'skipped=scope_unverifiable': '{success:false, reason:`DB error: ${rel.error}`}',
          'rel.error && !rel.skipped': '{success:false, reason:`DB error: ${rel.error}`}'
        },
        dropped_branch: 'data.success===false — VERIFIED DEAD: every return path in BOTH 20260502 and 20260727 release_sd definitions is jsonb_build_object("success", true, ...)'
      },
      lint_precedent: {
        driver: 'scripts/lint/require-main-guard-in-one-off-lint.mjs (199 lines)',
        rule: 'eslint-rules/require-main-guard-in-one-off.js loaded via ESLint Linter API, NOT wired into eslint.config.js',
        scoping: 'WHOLE-CORPUS recursive walk — NOT diff-scoped. "Only new violations block" comes entirely from the allowlist partition.',
        allowlist: 'scripts/lint/require-main-guard-in-one-off-allowlist.json, 144 entries, filePath->reason map; loadAllowlist() THROWS on empty/non-string reason, returns {} on missing file',
        partition: 'violations = hits.filter(h => !(h.filePath in allow)); grandfathered = complement; exit(violations.length > 0 ? 1 : 0)',
        message_shape: '`  ${filePath}:${line}:${column}  ${message}` + a "Fix:" line + an "Or, if genuinely pending retrofit, add a reason-required entry to <allowlist>" line',
        flags: ['--json', '--root <dir>'],
        ci: '.github/workflows/require-main-guard-in-one-off-lint.yml — pull_request path-filtered, no continue-on-error',
        ci_hard_constraint: 'GitHub Actions does NOT expand brace alternation; path filters MUST be ONE ENTRY PER EXTENSION (a documented 32-day CI blindness on the sibling control)'
      },
      allowlist_day_one: {
        raw_sites_today: 15,
        raw_files_today: 11,
        sites_after_this_sd: 13,
        files_after_this_sd: 9,
        files: {
          'lib/claim-guard.mjs': [613, 731],
          'lib/commands/claim-command.js': [184],
          'lib/session-manager.mjs': [864],
          'scripts/hooks/reclaim-sd-after-compaction.cjs': [153, 166],
          'scripts/hooks/session-state-sync.cjs': [248],
          'scripts/modules/claim-health/self-heal.js': [92],
          'scripts/modules/complete-quick-fix/orchestrator.js': [1040],
          'scripts/modules/sd-next/claim-analysis.js': [283],
          'scripts/sd-start.js': [1207, 1244, 1467]
        },
        fixed_by_this_sd: {
          'scripts/modules/handoff/claim-swapper.js': [122],
          'scripts/modules/handoff/executors/lead-final-approval/helpers.js': [441]
        },
        lead_list_errors: 'LEAD Explore list is WRONG on 3 of 12 files — scripts/fleet-kill.mjs (:24 import, :113 call), scripts/stale-session-sweep.cjs (:223 import, :224 call) and lib/checkin/steps/release-request.cjs (:85 import, :91 call) ALREADY route through bestEffortReleaseSd; their release_sd hits are comments only. Do NOT allowlist them.',
        existing_adopters: ['scripts/fleet-kill.mjs:113', 'scripts/stale-session-sweep.cjs:224', 'lib/checkin/steps/release-request.cjs:91', 'lib/fleet/spawn-control.js:1048', 'scripts/sd-start.js:1404/1443/1455'],
        structural_exemption: 'lib/fleet/best-effort-release.mjs:71 ONLY. lib/claim/release-claim-both-surfaces.mjs calls rpc("release_session") at :193 — a different RPC, invisible to a release_sd-keyed lint.',
        allowlist_design_warning: 'file-keyed entries would BLIND the lint on MIXED files (sd-start.js: 3 raw + 3 wrapper; claim-guard.mjs: 2 raw + wrapper fallback). Use COUNT-ANCHORED entries that fail when observed > expected.'
      },
      risk_assessment: {
        legitimate_completion_race: 'NONE. Site 2: expectedSdKey is a required param. Site 1: claimId is the same value the current guard already uses, so any null/undefined skip already happens today identically; the `|| sd.id` UUID fallback is structurally dead in BOTH worlds (sd_key is never a UUID). Read-to-RPC window STRICTLY SHRINKS at both sites.',
        divergence_directions: {
          'agree': 'releases as today — no change',
          'file matches but DB moved on': 'TODAY releases the WRONG SD (the RCA); AFTER refuses — the fix',
          'file stale-null but DB holds the SD': 'TODAY leaks the claim; AFTER releases correctly IF the inline guard is dropped'
        },
        new_failure_mode: 'Site 1 only: fail-closed scope_unverifiable on a transient claude_sessions read error leaves the claim HELD. Site 2 UNCHANGED (already returns a DB error without attempting the RPC). Recoverable via stale-session-sweep + CLAIM_TTL; strictly safer than releasing an unrelated live claim. MUST be logged loudly and stated in the PRD.',
        behavior_decision: 'heartbeat-stop (helpers.js:456-460) currently nested inside the guard being removed. Recommend making it unconditional (still keyed on its existing sessionId match) + a test — otherwise a scope_unverifiable skip leaves the claim held AND the heartbeat running, which reads as a live worker to every liveness gauge.'
      },
      test_substrate: {
        wrapper_guard: 'tests/unit/fleet/best-effort-release-sd-scoping.test.js (7 cases, already proves QF-20260726-593 semantics)',
        no_throw: 'tests/unit/fleet/best-effort-release.test.js',
        caller_mock_idiom: 'tests/unit/fleet/release-request.test.js — vi.mock of best-effort-release.mjs capturing args; copy for both new call-site regressions',
        source_shape_guard: 'tests/unit/claim/release-dual-surface-guard.test.js',
        colocated_lint_test: 'scripts/lint/venture-artifacts-write-lint.test.js',
        cautions: ['end-anchor source pins, never fixed char slices', 'toMatchObject silently ignores a bare RegExp value']
      }
    },
    phase: 'LEAD',
    validation_mode: 'prospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_ID,
    { name: 'Principal Systems Analyst (validation-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.metadata?.phase || 'LEAD');
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
