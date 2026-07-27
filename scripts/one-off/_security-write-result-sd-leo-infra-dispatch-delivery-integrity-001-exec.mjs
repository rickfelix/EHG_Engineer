#!/usr/bin/env node
/**
 * Write SECURITY (Chief Security Architect) EXEC-phase verdict for
 * SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001.
 *
 * Scope: database/migrations/20260727_release_sd_qf_reopen.sql (FR-2 holder CAS +
 * guarded status revert on release_sd's QF branch), lib/fleet/best-effort-release.mjs
 * clearAndReopenQf (FR-1), the three call sites now routed through it in
 * scripts/stale-session-sweep.cjs (FR-3), the append-only detection record (amendment),
 * scripts/coordinator-idle-qf-hint.mjs skip-and-continue dispatch loop + delivery-ratio
 * alarm (FR-5/FR-6), and lib/coordinator/qf-supply-predicate.cjs (FR-4). Reviewed for
 * CAS bypassability, NULL-semantics footguns, terminal/merge-witnessed row resurrection,
 * unscoped-update risk, injection, RLS/repo-filter drift, and whether the FR-5 catch can
 * mask a systemic failure as a routine skip.
 *
 * Uses the canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + canonical storage (lib/sub-agent-executor/
 * results-storage.js storeSubAgentResults) per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'b165653a-5857-4678-beb6-193ade75478f';
const SD_KEY = 'SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001';

const findings = [
  {
    id: 'S1-holder-cas-null-semantics-safe',
    severity: 'INFO',
    summary: 'PASS. The QF branch CAS (database/migrations/20260727_release_sd_qf_reopen.sql:94-97, `WHERE id = v_sd_key AND claiming_session_id = p_session_id`) cannot be bypassed via NULL. A NULL p_session_id can never reach this branch at all: the function first does `SELECT sd_key INTO v_sd_key FROM claude_sessions WHERE session_id = p_session_id` (lines 60-62) and returns early with `success:true, message:"No SD to release"` when v_sd_key IS NULL (lines 64-69) -- and `session_id = NULL` matches zero rows under standard three-valued SQL logic, so v_sd_key stays NULL and the QF branch is unreachable. Separately, a row whose claiming_session_id is already NULL (i.e. already stranded by some other path) cannot be matched by this CAS for a non-null p_session_id either: `NULL = \'some-session\'` evaluates to NULL, not TRUE, so the WHERE clause is false and the UPDATE affects zero rows -- a safe no-op, never an unintended match. Verified this is not merely reasoning-from-spec: tests/unit/db/release-sd-qf-branch-sql.test.js:78-81 pins the literal `AND claiming_session_id = p_session_id` text in the QF branch region (scoped extraction, not the whole function body).',
  },
  {
    id: 'S2-terminal-and-merge-witnessed-rows-cannot-be-resurrected',
    severity: 'INFO',
    summary: 'PASS. The status revert is gated by `CASE WHEN status = \'in_progress\' AND pr_url IS NULL AND commit_sha IS NULL THEN \'open\' ELSE status END` (20260727_release_sd_qf_reopen.sql:87-93). A terminal row (completed/cancelled/escalated/closed) fails the `status = \'in_progress\'` arm outright and falls to `ELSE status` (unchanged), REGARDLESS of whether the CAS matches -- terminal-ness is checked independently of ownership, so there is no path (holder-matching or not) that flips a terminal row\'s status. Same for a merge-witnessed row (pr_url or commit_sha set): the CASE\'s AND-conjunction excludes it explicitly. The unconditional `claiming_session_id = NULL` in the same UPDATE (line 86) can still clear the claim column on a terminal/merge-witnessed row if the CAS matches, but that is inert: every open-only chokepoint (worker-checkin.cjs isAutoStartableQF, its two candidate queries, lib/checkin/steps/critical-qf-jump.cjs, coordinator-idle-qf-hint.mjs) gates on status=\'open\', so a claim-cleared-but-still-terminal/still-merge-witnessed row remains exactly as unreachable as before -- clearing that column changes no observable behaviour. Confirmed against the pre-existing (unconditional, no-CAS) behaviour too, so this is not a regression the CAS introduces. tests/unit/fleet/qf-clear-and-reopen.test.js:134-139 (completed row) and :113-125 (pr_url/commit_sha) pin the equivalent JS-side guard with the identical predicate shape.',
  },
  {
    id: 'S3-security-definer-search-path-preserved-verbatim',
    severity: 'INFO',
    summary: 'PASS. 20260727_release_sd_qf_reopen.sql:54-55 carries `SECURITY DEFINER` / `SET search_path TO \'public\'`, byte-identical to the prior definition at database/migrations/20260502_release_clear_worktree_state.sql:27-28. Diffed directly, not assumed. Nothing in the new QF-branch body is search-path-sensitive: it references only `quick_fixes` (no unqualified function/type/operator that could resolve differently under an attacker-controlled search_path), and search_path is pinned to \'public\' regardless. tests/unit/db/release-sd-qf-branch-sql.test.js:108-112 pins both strings so a future edit to this migration cannot silently drop either.',
  },
  {
    id: 'S4-non-holder-noop-blast-radius-grepped-against-every-caller',
    severity: 'INFO',
    summary: 'PASS on the stated behaviour-change question. Grepped every call site of `rpc(\'release_sd\'` in the repo (17 sites: lib/claim-guard.mjs:503,609; lib/commands/claim-command.js:182; lib/fleet/best-effort-release.mjs:71; lib/session-manager.mjs:864; scripts/hooks/reclaim-sd-after-compaction.cjs:153,166; scripts/hooks/session-state-sync.cjs:248; scripts/modules/claim-health/self-heal.js:92; scripts/modules/complete-quick-fix/orchestrator.js:713; scripts/modules/handoff/claim-swapper.js:117; scripts/modules/handoff/executors/lead-final-approval/helpers.js:441; scripts/modules/sd-next/claim-analysis.js:280; scripts/sd-start.js:1134,1171,1394). release_sd takes only p_session_id/p_reason -- there is no separate "caller identity" parameter distinct from the session whose claim is released, so "force-release someone else\'s claim" has only ever meant "call with p_session_id = the OTHER (usually stale/dead) session\'s own id", resolved from THAT session\'s own claude_sessions.sd_key. Every admin-style caller (reclaim-sd-after-compaction.cjs:153-166, self-heal.js:92) follows exactly this shape: pass the stale session\'s own id, and the RPC releases whatever THAT session currently holds. The new CAS (`claiming_session_id = p_session_id`) only produces a no-op in the ONE scenario the migration\'s own comment names: p_session_id no longer matches the QF\'s actual current claiming_session_id because a DIFFERENT session has since claimed it. No grepped caller relies on clobbering a claim currently held by someone other than p_session_id -- that was the race/bug the CAS closes, never a depended-upon feature. claim-swapper.js:97-99 even pre-checks session.sd_key===sdKey caller-side specifically because the RPC has always been session-scoped this way. No live path is exposed to an unwanted silent no-op.',
  },
  {
    id: 'S5-release-sd-cannot-repair-an-already-stranded-row',
    severity: 'LOW',
    summary: 'Scope boundary, not a defect, but worth stating precisely: because the CAS requires `claiming_session_id = p_session_id`, release_sd (the RPC) can only clear+reopen a row that is STILL held by the session named in p_session_id. It cannot repair a row whose claiming_session_id is ALREADY NULL (i.e. already stranded by some prior clear-without-revert) -- `NULL = p_session_id` is NULL, so the WHERE never matches and the CASE never runs. That "already-cleared" repair shape exists and is tested in the JS helper (clearAndReopenQf with expectedHolder omitted, best-effort-release.mjs:168-169, `.is(\'claiming_session_id\', null)`) but this RPC does not attempt it. This is a correct scope choice (release_sd answers "let go of what I hold", not "repair any row"), not a hole in the CAS itself -- flagged here because it is directly relevant to finding S9 below (the interim-exposure question).',
  },
  {
    id: 'S6-clearAndReopenQf-argument-validation-and-predicate-completeness',
    severity: 'INFO',
    summary: 'PASS. lib/fleet/best-effort-release.mjs:156 `if (!supabase || !qfId) return { changed: false, reason: \'missing_argument\' }` runs before any query builder call, so a missing/undefined supabase or qfId can never reach `.from()` -- there is no code path that constructs an update lacking `.eq(\'id\', qfId)`, i.e. no path to an unscoped (all-rows) UPDATE. `opts.expectedHolder ?? null` (line 157) collapses `undefined` (omitted) to the same safe branch as an explicit `null`. All five predicates (id, status=in_progress, the claim-column check, pr_url IS NULL, commit_sha IS NULL -- lines 162-174) are always applied regardless of which expectedHolder branch is taken; tests/unit/fleet/qf-clear-and-reopen.test.js:141-148 pins `predicateCount === 5` specifically so a future edit dropping one predicate cannot pass silently. Fail-soft on a DB error (line 179, `update_failed:<msg>`, never throws) -- verified by the dedicated test at qf-clear-and-reopen.test.js:262-273.',
  },
  {
    id: 'S7-expectedHolder-empty-string-is-a-minor-input-hygiene-gap',
    severity: 'LOW',
    summary: 'Non-blocking. `opts.expectedHolder ?? null` (best-effort-release.mjs:157) only nullish-coalesces `null`/`undefined`; an explicit empty string (`expectedHolder: \'\'`) would NOT collapse to the IS-NULL branch and would instead build `.eq(\'claiming_session_id\', \'\')` (line 170), matching nothing today since no real claiming_session_id value is ever the empty string. No caller in this diff or the wider grep passes \'\' -- both production call sites (scripts/stale-session-sweep.cjs:1171 `expectedHolder: qf.claiming_session_id`, :2650 `expectedHolder: evict.session_id`) pass values already known non-empty (a session_id column). Not exploitable today; recommend `opts.expectedHolder || null` (or an explicit `=== \'\'` check) as cheap defense-in-depth against a future caller passing a falsy-but-not-nullish placeholder.',
  },
  {
    id: 'S8-fr3-terminal-sites-confirmed-untouched-no-resurrection-path-added',
    severity: 'INFO',
    summary: 'PASS. `git diff $(git merge-base HEAD origin/main) HEAD --stat` touches exactly 12 files; scripts/modules/complete-quick-fix/orchestrator.js and lib/sd-creation/source-adapters/qf.js are absent from that list -- both legitimately-terminal sites are untouched by construction, not merely by inspection. The pre-existing terminal-QF pass inside stale-session-sweep.cjs itself (lines 1061-1092, `clearStaleQfClaims`\'s FIRST loop: `.in(\'status\', [\'completed\',\'cancelled\',\'escalated\',\'closed\']).not(\'claiming_session_id\',\'is\',null)`, unconditional `.update({claiming_session_id: null})`) is also untouched by this diff (outside the changed hunks) and never writes to `status` at all, so it structurally cannot resurrect anything. The two sites that DID change (stale-session-sweep.cjs:1170 dead-holder loop and :2650 the CONFLICT-eviction mirror) are both ADDITIVE calls to clearAndReopenQf with an explicit expectedHolder -- neither replaces nor widens the terminal pass. tests/unit/stale-sweep-qf211-claim-guards.test.js still asserts (post-refactor from a brittle fixed-offset slice to a function-scoped extractor, lines 17-32) that the terminal-unconditional-clear behaviour and the race-guard behaviour both still exist in the file; ran the full suite live (`npx vitest run` across the 5 touched test files) -- 65/65 passed.',
  },
  {
    id: 'S9-detection-record-genuinely-fail-soft-cannot-alter-outcome',
    severity: 'INFO',
    summary: 'PASS. best-effort-release.mjs:183-197: `onDetect` is invoked only after `changed` is already computed from the real UPDATE result (line 181), inside its own `try { } catch { /* fail-soft */ }` (line 197), and its return value is never consulted -- the function\'s return statement (line 202, `return { changed, reason: ... }`) does not depend on onDetect in any way. It cannot suppress a release (a throwing onDetect still returns `changed:true` -- pinned by qf-clear-and-reopen.test.js:234-244) nor manufacture a fake success (it only fires when `changed && typeof opts.onDetect === \'function\'`, i.e. never on a guard-refusal -- pinned at qf-clear-and-reopen.test.js:218-225). Append-only in practice: the two production call sites insert a new `feedback` row per detection (scripts/stale-session-sweep.cjs onDetect callback -> `supabase.from(\'feedback\').insert({...})`) rather than upserting/patching a shared column, so multiple detections of the same QF id do not overwrite each other -- pinned by the multiplicity test (qf-clear-and-reopen.test.js:246-259).',
  },
  {
    id: 'S10-fr5-catch-is-broad-but-recorded-not-blind-with-one-real-blind-spot',
    severity: 'MEDIUM',
    summary: 'CONCERN, narrow and non-regressive. The try/catch in scripts/coordinator-idle-qf-hint.mjs:235-244 wraps `insertRow(...)` (default `insertCoordinationRow`, lib/coordinator/dispatch.cjs:718) and catches indiscriminately -- it does not distinguish DISPATCH_TARGET_STALE/UNKNOWN/INVALID/LOOKUP_FAILED (the intended "unreachable addressee" class, thrown by assertValidTarget, dispatch.cjs:129-178) from DISPATCH_SD_TERMINAL/DISPATCH_SD_NOT_FOUND (assertSdDispatchable, dispatch.cjs:210-254, about the QF itself, not the worker), DISPATCH_WORK_ASSIGNMENT_TYPE_MISMATCH/DISPATCH_BAD_ROW (a row-construction bug in buildHintRow, which would be a PROGRAMMING defect, not routine staleness), or a fleet-role/tier violation (assertFleetAssignmentTarget/assertWorkerTierAllowed). Mitigating: every skip is recorded with `e.code` (or message) in `summary.undeliveredReasons` (coordinator-idle-qf-hint.mjs:239), so an operator reading the FR-6 alarm text CAN distinguish a genuine staleness pattern from a systemic one after the fact, and the "put the QF back in the pool, try the next worker" recovery (line 243) is safe regardless of which of these fires (worst case the QF is retried against remaining candidates this tick and re-evaluated fresh next tick, since eligibleIdleWorkers/ranked carry no persisted backoff). REAL BLIND SPOT, not just breadth: insertCoordinationRow does NOT throw for every insert failure. Its final act (dispatch.cjs:861-897) is `const res = await q; ... return res;` -- a raw Postgres/PostgREST error on the literal INSERT (e.g. an RLS/permission denial, a NOT NULL or check-constraint violation) resolves normally as `{data, error}` and is only escalated to a throw if the message matches `/invalid input value for enum/i` (dispatch.cjs:887-896, a narrowly-scoped carve-out for one specific historical incident). deliverHints never inspects the resolved value\'s `.error` field -- it only reacts to a REJECTED promise (coordinator-idle-qf-hint.mjs:236-244) and otherwise falls through to `summary.hinted += 1` (line 247) unconditionally. So an insert that fails at the DB layer WITHOUT throwing is counted as a SUCCESSFUL delivery in the FR-6 ratio -- invisible to both `undelivered` and the alarm, which is the exact "camouflage" class this SD\'s own FR-6 framing names, just for a failure mode the new instrumentation does not observe. This is NOT a regression: the pre-existing code (before this diff) never checked `.error` either, so the gap is pre-existing and orthogonal to the fix, not introduced by it -- but it means FR-6 compensates specifically for the THROWN-validation-guard failure class (which is what the observed 2026-07-26 incident actually was), not for a silent same-call insert error. tests/unit/coordinator/idle-qf-hint-delivery.test.js exercises only the throwing case (lines 36-49, 56-59, 74), not a resolved-with-error case.',
  },
  {
    id: 'S11-no-injection-anywhere-in-the-diff',
    severity: 'INFO',
    summary: 'PASS. Every new/changed DB access in this diff goes through either the supabase-js query builder (.eq/.is/.in/.filter -- parameterized by the client, not string-built) or supabase.rpc() with named JSON parameters (p_session_id, p_reason). The one raw SQL client in the diff, scripts/one-off/verify-release-sd-qf-branch.mjs:41-43, issues a single fully-static string (`SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ... WHERE n.nspname = \'public\' AND p.proname = \'release_sd\'`) with zero interpolation and zero external input -- there is nothing for an attacker to control. Grepped the full diff for template-literal-into-SQL and raw .query(`...`) patterns (`\\$\\{.*\\}.*(SELECT|UPDATE|INSERT|DELETE|WHERE)`, `.raw(`) -- zero hits.',
  },
  {
    id: 'S12-no-repo-application-filter-or-rls-change',
    severity: 'INFO',
    summary: 'PASS. Grepped the full diff for target_application/repo_path/local_path/applications and for GRANT/REVOKE/POLICY/ROW LEVEL/RLS -- zero hits in either search. No repo/application scoping was added or tightened anywhere, and no RLS or permission surface changed. The only DDL in the diff is the CREATE OR REPLACE FUNCTION for release_sd, which carries forward its pre-existing SECURITY DEFINER/search_path exactly (S3).',
  },
  {
    id: 'S13-interim-exposure-unmigrated-rpc-callers-and-untriggered-repair-shape',
    severity: 'MEDIUM',
    summary: 'CONCERN, explicitly the known-honest state, but with a sharper edge worth naming precisely. The FR-2 migration is NOT applied live (verify-release-sd-qf-branch.mjs fails all 5 checks against the deployed function, by design -- this is CHAIRMAN-GATED DDL, correctly not self-stamped). Of the 17 grepped `release_sd` RPC callers (S4), only stale-session-sweep.cjs\'s two sites were rewired in THIS diff to the fixed JS helper; the other ~13 (lib/claim-guard.mjs, lib/commands/claim-command.js, lib/session-manager.mjs, scripts/hooks/reclaim-sd-after-compaction.cjs, scripts/hooks/session-state-sync.cjs, scripts/modules/claim-health/self-heal.js, scripts/modules/complete-quick-fix/orchestrator.js:713 [the RPC call, not the terminal-write site named in scope], scripts/modules/handoff/claim-swapper.js, scripts/modules/handoff/executors/lead-final-approval/helpers.js, scripts/modules/sd-next/claim-analysis.js, scripts/sd-start.js) all call the RAW, still-unpatched RPC directly. Until the DDL ships, an ORDINARY QF release through any of those ~13 paths (e.g. a worker session ending, or being reclaimed, while it holds a QF) still hits the original clear-without-revert QF branch -- Part A of the original bug is fully live for the majority of real release paths, not merely a theoretical residue. Sharper point beyond what the prompt\'s known-honest-state note already says: grepping every production call of clearAndReopenQf (only 2 exist -- stale-session-sweep.cjs:1170 and :2650, both with an explicit expectedHolder) confirms that the "already-cleared row" repair shape the helper explicitly supports and tests (expectedHolder omitted, matching `claiming_session_id IS NULL`) is NOT invoked anywhere in production. A row stranded via one of the ~13 un-migrated callers presents exactly that shape (claiming_session_id already NULL, status still in_progress), so nothing shipped in this deployment will auto-heal it -- it is not a "will be caught by the sweep" case, it needs a future call site (or a one-off backfill) using clearAndReopenQf WITHOUT expectedHolder. Two real mitigations DO ship in this same diff and measurably shrink the damage without eliminating the exposure: FR-4 (lib/coordinator/qf-supply-predicate.cjs) narrows both supply gauges to status=\'open\' only, so a newly-stranded row will no longer manufacture a false "supply is healthy" signal; and the three rewired stale-session-sweep.cjs paths are fully fixed for the specific stranding mode they cover (a claim still held by a determined-dead session). Net effect: strictly better than pre-PR (gauge stops lying; 3 of the highest-frequency stranding paths are closed; the SSOT liveness widening in the same file makes the sweep\'s own re-claim strictly MORE conservative, not less), but the Part-A defect itself remains live and unrepaired-by-anything-shipped for the ~13 other paths until the DDL lands.',
  },
];

const warnings = [
  'S7: clearAndReopenQf\'s expectedHolder nullish-coalesce (`?? null`) does not also collapse an explicit empty string to the safe IS-NULL branch. Not exploitable today (no caller passes \'\'), but cheap to close defensively.',
  'S10: the FR-5 catch in coordinator-idle-qf-hint.mjs is a blanket catch of every thrown error from insertCoordinationRow, not scoped to the addressee-staleness codes the FR-5 docstring describes -- mitigated by recording e.code per skip, but a programming-bug throw (e.g. DISPATCH_WORK_ASSIGNMENT_TYPE_MISMATCH from a future buildHintRow edit) would be silently treated as "one more unreachable worker" rather than surfaced distinctly.',
  'S10 (sharper): insertCoordinationRow resolves normally with {data, error} (never throws) for any insert failure that is not the specific enum-violation regex (dispatch.cjs:887-896) -- e.g. an RLS/permission denial or constraint violation on session_coordination. deliverHints never inspects the resolved .error, so that failure class is counted as a successful delivery in the FR-6 ratio and is invisible to the new alarm. Pre-existing gap, not introduced by this diff, and not demonstrated as live-exploitable (session_coordination writes run under the coordinator\'s own service-role credentials), but the ratio/alarm should not be read as a complete compensating control for every delivery-failure mode.',
  'S13: only stale-session-sweep.cjs is rewired to clearAndReopenQf in this diff; ~13 other release_sd RPC callers remain on the unpatched function until the chairman-gated DDL is applied, and the "already-cleared row" repair shape (expectedHolder omitted) that would auto-heal rows stranded via those callers is implemented and tested but not invoked by any production call site yet.',
];

const recommendations = [
  'Apply database/migrations/20260727_release_sd_qf_reopen.sql as soon as chairman sign-off on the DDL is obtained -- this is the only remaining step that closes S13\'s dominant exposure (Part A live on ~13 un-migrated callers).',
  'Follow-on (cheap): add a repair pass (sweep tick or one-off backfill) that calls clearAndReopenQf WITHOUT expectedHolder to catch rows already stranded by the un-migrated callers -- the shape exists and is tested (best-effort-release.mjs:168-169) but nothing production calls it that way today.',
  'Follow-on: in dispatch.cjs, consider surfacing res.error from the terminal insertCoordinationRow insert (dispatch.cjs:866-897) to callers rather than only throwing on the enum-violation regex, so a delivery-loop consumer like coordinator-idle-qf-hint.mjs can count a same-call DB error as undelivered instead of it silently inflating `hinted`. Non-blocking for this SD; pre-existing gap this SD\'s instrumentation does not (and was not scoped to) close.',
  'Non-blocking hygiene: `opts.expectedHolder || null` (or an explicit === \'\' check) in clearAndReopenQf, closing S7.',
  'No changes required for: the holder CAS itself (correct and non-bypassable against NULL and against every grepped caller), terminal/merge-witnessed row protection (provably impossible to resurrect via either the RPC or the JS helper), SECURITY DEFINER/search_path (preserved verbatim, pinned by test), FR-3 routing (terminal sites confirmed untouched by the diff itself), the detection record (genuinely fail-soft, cannot influence the outcome), injection surface (none found), or repo/RLS scope (unchanged).',
];

const summary = 'CONDITIONAL_PASS (confidence 85; reported to the requesting agent as CONCERNS). The core fix (the FR-2 holder CAS + guarded status revert, and the FR-1 clearAndReopenQf helper it shares with FR-3) is sound and adversarially defensible: the CAS cannot be bypassed via NULL p_session_id (unreachable -- an earlier guard returns before the QF branch) or NULL claiming_session_id (three-valued SQL logic makes the WHERE clause false, a safe no-op, never an unintended match); terminal and merge-witnessed rows are structurally impossible to resurrect because the CASE checks status/pr_url/commit_sha independently of the CAS; SECURITY DEFINER and search_path are preserved byte-for-byte from the prior migration and pinned by a new test; the stated "non-holder release becomes a no-op" behaviour change was checked against all 17 grepped RPC callers and matches no live dependency (every caller either releases its own claim or acts on a stale session\'s OWN previously-held claim, never on a claim currently held by someone else); the four legitimately-terminal FR-3 sites are confirmed untouched by the diff itself (absent from the 12-file changed-files list); the append-only detection record is genuinely fail-soft and cannot alter or suppress the release outcome; no SQL injection anywhere in the diff; no repo/application filter or RLS/permission surface changed. Two MEDIUM findings, both non-blocking for this SD but worth tracking: (S10) the FR-5 skip-and-continue catch in coordinator-idle-qf-hint.mjs is a blanket catch (mitigated by recording e.code per skip) AND has one real blind spot -- insertCoordinationRow resolves normally with an unthrown {error} for any insert failure other than the one specific enum-violation regex it escalates, so that failure class is silently counted as delivered and is invisible to the new FR-6 ratio/alarm; this is a pre-existing gap the new instrumentation does not close, not a regression. (S13) the FR-2 migration is correctly NOT self-stamped (chairman-gated DDL), and per the prompt\'s own known-honest-state framing this is expected -- but the sharper finding is that ~13 of the 17 release_sd callers remain fully exposed to the original Part-A stranding bug until the DDL lands (only stale-session-sweep.cjs was rewired), and the "repair an already-stranded row" shape the helper supports is implemented/tested but invoked by zero production call sites, so rows stranded via those 13 paths will not be auto-healed by anything in this deployment. Ran the full test suite for the 5 touched/added test files live: 65/65 passed.';

const justification = [
  'CONDITIONAL_PASS (confidence 85, reported as CONCERNS per the requested PASS/CONCERNS/FAIL vocabulary) -- SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 EXEC-phase security review.',
  '',
  'REVIEWED: database/migrations/20260727_release_sd_qf_reopen.sql (diffed against the prior 20260502_release_clear_worktree_state.sql), lib/fleet/best-effort-release.mjs (clearAndReopenQf + its existing sibling bestEffortReleaseSd), scripts/stale-session-sweep.cjs (both FR-3 call sites + the liveness-SSOT widening around them), lib/coordinator/qf-supply-predicate.cjs + its two callers in lib/coordinator/coordination-events.cjs, scripts/coordinator-idle-qf-hint.mjs (deliverHints/FR-5, computeDeliveryRatio+shouldAlarmDelivery/FR-6), lib/coordinator/dispatch.cjs (assertValidTarget, assertSdDispatchable, insertCoordinationRow -- to characterise what the FR-5 catch actually catches), scripts/one-off/verify-release-sd-qf-branch.mjs, and all 5 touched/added unit test files (ran live, 65/65 passed). Also grepped every one of the 17 `rpc(\'release_sd\'` call sites in the repository and every clearAndReopenQf call site, to answer the blast-radius and interim-exposure questions with evidence rather than assumption.',
  '',
  '1. CAS CORRECTNESS (scope item 1) -- PASS. NULL p_session_id cannot reach the QF branch (early-return guard on v_sd_key IS NULL, lines 64-69, upstream of a NULL-input SELECT INTO). NULL claiming_session_id vs a non-null p_session_id produces SQL NULL in the comparison, which is not TRUE, so the WHERE clause excludes the row -- cannot produce an unintended match. Terminal rows (completed/cancelled/escalated/closed) and merge-witnessed rows (pr_url/commit_sha set) can never be resurrected: the CASE\'s WHEN clause checks status/pr_url/commit_sha independently of whether the CAS matched, so even a CAS-matching call on a terminal/merge-witnessed row leaves status untouched. The "non-holder release is now a no-op" behaviour change was checked against every grepped caller (17 sites) -- none depends on force-clearing a claim actually held by a session other than p_session_id; every admin-style caller (reclaim-sd-after-compaction.cjs, self-heal.js) already operates by passing the STALE session\'s own id, which the CAS does not obstruct. SECURITY DEFINER / SET search_path TO \'public\' preserved verbatim, diffed directly against the prior migration.',
  '2. clearAndReopenQf ARGUMENT VALIDATION (scope item 2) -- PASS. Missing supabase/qfId is guarded before any query is built, so no unscoped update is reachable (`.eq(\'id\', qfId)` is unconditional). All five guard predicates (id, status, claim-column, pr_url, commit_sha) are always applied and pinned by an explicit predicateCount test. Fail-soft on a DB error, never throws.',
  '3. FR-3 ROUTING (scope item 3) -- PASS. `git diff --stat` proves the four legitimately-terminal sites (stale-session-sweep.cjs\'s own separate terminal-QF pass at lines 1061-1092, complete-quick-fix/orchestrator.js, lib/sd-creation/source-adapters/qf.js) are outside the 12 changed files. The two sites that DID change are additive calls into the new helper, not replacements of the terminal pass.',
  '4. DETECTION RECORD (scope item 4) -- PASS. Genuinely fail-soft: wrapped in its own try/catch, executed only after the real UPDATE result already determined `changed`/`reason`, one-way (never read back to influence the outcome), and append-only in practice (each detection is a new feedback row, not a shared-column upsert).',
  '5. FR-5 SKIP-AND-CONTINUE (scope item 5) -- CONCERNS. The catch is broad (catches every thrown error class from insertCoordinationRow\'s cascade of guards, not narrowly the addressee-staleness codes), but it is not blind: every skip records e.code in undeliveredReasons, giving an operator the ability to distinguish a staleness pattern from a systemic one post-hoc, and the "put the QF back, try the next worker" recovery is safe regardless of cause. The sharper finding: insertCoordinationRow does not throw for every failure -- a same-call insert error that is not the one specific enum-violation regex resolves normally as {error} and is silently counted as delivered by deliverHints, which never inspects the resolved value. FR-6\'s ratio/alarm therefore compensates specifically for the thrown-validation-guard failure class (which is what the observed incident actually was), not for every delivery-failure mode. Pre-existing gap, not a regression introduced by this diff.',
  '6. INJECTION (scope item 6) -- PASS. No string-built SQL anywhere in the diff. The one raw pg.Client query (verify-release-sd-qf-branch.mjs) is fully static with zero interpolation. Every other access goes through the parameterized supabase-js builder or rpc() with named params.',
  '7. REPO/RLS SCOPE (scope item 7) -- PASS. Grepped the full diff for target_application/repo_path/local_path/applications and for GRANT/REVOKE/POLICY/ROW LEVEL/RLS: zero hits. No repo/application filter added or tightened; no permission surface changed.',
  '',
  'INTERIM EXPOSURE (explicitly requested) -- CONCERNS, sharper than the prompt\'s own framing. The FR-2 migration is correctly not self-stamped (chairman-gated DDL) and is NOT live. Of 17 grepped release_sd RPC callers, only stale-session-sweep.cjs\'s two sites were rewired to the fixed JS helper in this diff; ~13 others (lib/claim-guard.mjs, lib/session-manager.mjs, scripts/hooks/reclaim-sd-after-compaction.cjs, scripts/hooks/session-state-sync.cjs, scripts/modules/claim-health/self-heal.js, scripts/modules/handoff/claim-swapper.js, scripts/modules/handoff/executors/lead-final-approval/helpers.js, scripts/modules/sd-next/claim-analysis.js, scripts/sd-start.js, etc.) still call the raw unpatched RPC. An ordinary QF release through any of them still strands the row (Part A of the original bug, fully live) until the DDL ships. Additionally, the helper\'s "repair an already-stranded row" mode (expectedHolder omitted) -- which is exactly the shape those un-migrated callers would produce -- is implemented and tested but invoked by ZERO production call sites, so nothing shipped in this deployment auto-heals that class. Mitigating: FR-4\'s gauge-narrowing means a row stranded this way will not be miscounted as available supply (the visible symptom is contained even though the underlying stranding is not), and this is a net improvement over pre-PR state (3 high-frequency paths fully fixed, the sweep\'s own re-claim logic made strictly more conservative by the liveness-SSOT widening) rather than a defect introduced by the PR.',
  '',
  'RATIONALE FOR CONDITIONAL_PASS (not FAIL): no exploitable vulnerability was found -- no injection, no CAS bypass, no resurrection path, no RLS/repo-scope drift, no unscoped-update risk. Both MEDIUM findings are either a documented, honest, chairman-gated interim state whose blast radius I measured precisely rather than assumed (S13), or a narrow, non-regressive, already-mitigated (via recorded error codes) instrumentation gap that the SD never claimed to fully close (S10). Recommend applying the DDL promptly to close S13\'s dominant exposure, and tracking the two follow-ons (repair-shape wiring; res.error visibility in dispatch.cjs) as explicit non-blocking work.',
].join('\n');

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
    confidence: 85,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [
      'Apply database/migrations/20260727_release_sd_qf_reopen.sql once chairman DDL sign-off is obtained (closes the dominant share of S13).',
      'Track wiring a "repair already-stranded row" call site (clearAndReopenQf without expectedHolder) as explicit open follow-on work -- implemented/tested but currently invoked by zero production call sites (S13).',
      'Track dispatch.cjs surfacing res.error from the terminal insertCoordinationRow insert so a same-call DB error is counted as undelivered rather than silently inflating the FR-6 hinted ratio (S10).',
    ],
    metadata: {
      review_type: 'EXEC_PHASE_SECURITY_REVIEW',
      files_reviewed: [
        'database/migrations/20260727_release_sd_qf_reopen.sql',
        'database/migrations/20260502_release_clear_worktree_state.sql',
        'lib/fleet/best-effort-release.mjs',
        'scripts/stale-session-sweep.cjs',
        'lib/coordinator/qf-supply-predicate.cjs',
        'lib/coordinator/coordination-events.cjs',
        'scripts/coordinator-idle-qf-hint.mjs',
        'lib/coordinator/dispatch.cjs',
        'scripts/one-off/verify-release-sd-qf-branch.mjs',
        'tests/unit/db/release-sd-qf-branch-sql.test.js',
        'tests/unit/fleet/qf-clear-and-reopen.test.js',
        'tests/unit/coordinator/idle-qf-hint-delivery.test.js',
        'tests/unit/coordinator/qf-supply-gauge-agreement.test.js',
        'tests/unit/stale-sweep-qf211-claim-guards.test.js',
      ],
      review_dimensions: {
        holder_cas_correctness: 'PASS -- non-bypassable via NULL p_session_id or NULL claiming_session_id; checked against all 17 RPC callers',
        terminal_merge_witnessed_protection: 'PASS -- structurally impossible to resurrect via either the RPC or the JS helper',
        clear_and_reopen_argument_validation: 'PASS -- no unscoped-update path; all 5 predicates always applied',
        fr3_routing_scope: 'PASS -- 4 terminal sites confirmed untouched via diff --stat',
        detection_record_fail_soft: 'PASS -- cannot influence or suppress the release outcome',
        fr5_fr6_catch_and_alarm: 'CONCERNS -- broad but recorded catch; one real blind spot for non-throwing insert errors',
        injection: 'PASS -- zero hits on interpolation-into-SQL grep across the full diff',
        repo_rls_scope: 'PASS -- zero hits on repo/application-filter and RLS/GRANT/POLICY grep across the full diff',
        interim_exposure_unpatched_rpc: 'CONCERNS -- ~13 of 17 callers remain exposed to Part A until the DDL ships; repair-shape for already-stranded rows unwired in production',
      },
      model: 'Sonnet 5',
      model_id: 'claude-sonnet-5',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001',
    },
    phase: 'EXEC',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_ID,
    { name: 'Chief Security Architect (security-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC' }
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

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
