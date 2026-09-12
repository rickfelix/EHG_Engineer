#!/usr/bin/env node
/**
 * SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A — SECURITY review at EXEC (EXEC-TO-PLAN handoff evidence).
 *
 * Scope reviewed: FR-1..FR-6 (FR-7/8/9 cancelled in 0063719464b). Surfaces:
 *   lib/governance/feedback-correction.js, lib/governance/resolve-feedback.js,
 *   server/routes/feedback.js, the 3 converted sweep/CLI write sites, and
 *   tests/unit/governance/feedback-correction.test.js "GAP-1".
 *
 * Every mechanical claim below was settled by ATTEMPTING it against the live database
 * (BEGIN/ROLLBACK for writes, read-only SELECT for the filter-injection proof), not by
 * reading the migration text. Probe scripts: .artifacts/sec-*.mjs in this worktree.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = 'aaf65001-7031-46aa-882f-9f51281dc572';
const SD_KEY = 'SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 93,
  execution_time_ms: 0,
  critical_issues: [],
  warnings: [
    {
      id: 'SEC-0',
      severity: 'HIGH',
      issue: "FR-1..FR-6's stated premise is falsified by the same migration that cancelled FR-7/8/9, and the mechanism chosen instead is the strictly weaker one. Every code comment asserting 'UPDATE is rejected unconditionally' is false against live main.",
      evidence: "feedback_no_update is a BEFORE UPDATE trigger with a column-scoped WHEN clause (38 frozen columns) since 20260912_feedback_no_update_lifecycle_allowlist.sql. Settled by attempt (BEGIN/ROLLBACK, .artifacts/sec-update-permitted.mjs): a single UPDATE setting status + resolution_notes + resolved_at + updated_at + metadata + archived_at on a live row was ACCEPTED (1 row); UPDATEs touching rubric_score / title / error_hash were each REJECTED with P0001 'feedback is append-only'. Every column the 5 converted write sites touch (status, resolved_at, resolution_sd_id, resolution_notes, resolution_type, quick_fix_id, duplicate_of_id, archived_at, metadata, updated_at) is outside the frozen set.",
      location: 'lib/governance/feedback-correction.js:2-6, :27-29; server/routes/feedback.js:119-121, :241-242; lib/governance/resolve-feedback.js:185-186',
      recommendation: 'PLAN decision required: either (a) revert FR-1..FR-6 to narrow UPDATEs of the allowlisted lifecycle columns — the trigger-respecting write the DB now permits, which eliminates SEC-2/3/4/5/6 by construction — or (b) keep the correction-chain design and record an explicit rationale for preferring it, then close SEC-1..SEC-4. Option (a) is the same disposition already applied to FR-7/8/9 for the same falsified premise.',
    },
    {
      id: 'SEC-1',
      severity: 'HIGH',
      issue: 'PostgREST filter-string injection: rootId, read from the untyped JSONB field metadata->>corrects_feedback_id, is interpolated raw into a .or() filter. Breakout PROVEN against live data.',
      evidence: "Read-only proof (.artifacts/sec-or-injection.mjs): with rootId='64fec1a5-dbab-43bc-bf02-70b191eaae95' the helper resolved to that row; with rootId='64fec1a5-...-70b191eaae95,status.eq.new' it resolved to 00fe5ffc-7675-4802-b42a-5cdcdc5a9c21, an unrelated live row created the same day. The injected branch is appended to the OR list, so the ORDER BY created_at DESC, id DESC + limit(1) returns the newest row matching the ATTACKER'S predicate, not the requested chain. Consequence: all 5 call sites would build a correction from, and write lifecycle fields onto, a FOREIGN feedback chain; POST /:id/promote-to-sd would additionally read the foreign row's resolution_sd_id for its idempotency decision and mint an SD from foreign title/description. Reachability today is internal-writer-only and no live row is poisoned (0 rows where metadata->>corrects_feedback_id is non-NULL and non-UUID): anon INSERT on public.feedback is blocked (anon_feedback_ingress_bounds is RESTRICTIVE with no permissive anon INSERT counterpart — settled by attempt, SET LOCAL ROLE anon INSERT -> 42501, with the rate limiter measured unsaturated at 3/200 and 20/250, so the refusal is structural not transient), and none of the 3 API routes accept `metadata` from the request body.",
      location: 'lib/governance/feedback-correction.js:104',
      recommendation: 'Validate rootId against the UUID regex inside fetchLatestFeedback and return { error } when it fails (fail-closed, consistent with the existing contract). ~3 lines. Do not rely on call-site discipline: rootIdOf() reads a JSONB text field that no column type constrains, and the helper is now shared by 5 sites including 2 unattended service-role sweeps.',
    },
    {
      id: 'SEC-2',
      severity: 'MEDIUM',
      issue: "buildFeedbackCorrection neutralizes 3 of the 4 live partial UNIQUE indexes on public.feedback. The docblock enumerates three and claims the approach 'structurally avoids all three without per-index special-casing'; the fourth rejects the correction insert.",
      evidence: "Live pg_indexes shows FOUR partial UNIQUE indexes, not three: idx_feedback_error_capture_hash, idx_feedback_venture_error_hash, idx_feedback_telemetry_dedup (all handled via error_hash=null / dedup_hash strip) AND idx_feedback_chairman_override_dedup ON (category, source_type, (metadata->>'override_key')) WHERE category='chairman_override' AND source_type='auto_capture' — whose key, metadata.override_key, is carried forward verbatim. Settled by attempt (.artifacts/sec-4th-index.mjs, BEGIN/ROLLBACK): inserted an override row, then inserted buildFeedbackCorrection(original, {status:'triaged'}) -> 23505, constraint idx_feedback_chairman_override_dedup, detail 'Key (category, source_type, (metadata ->> override_key))=(chairman_override, auto_capture, probe|...) already exists'. Currently latent: 0 such rows exist. Blast radius when lib/governance/chairman-override-record.js writes the first one: scripts/feedback-staleness-check.js has NO category filter and calls process.exit(1) on insert error, so one override row aging past 90 days aborts the entire unattended sweep on every subsequent run, not just that row.",
      location: "lib/governance/feedback-correction.js:33-38 (comment), :62-68 (only dedup_hash stripped); scripts/feedback-staleness-check.js:117-120 (exit-on-error)",
      recommendation: "Strip metadata.override_key alongside dedup_hash, and correct the docblock's count. Better root-cause fix: derive the strip-set from the live index definitions (or pin it with a test that reads pg_indexes) so a fifth index cannot silently reintroduce this — a hand-maintained comment is what made the fourth index invisible. Separately, make the sweeps skip-and-continue on 23505 rather than exit(1), so one poison row cannot halt a whole sweep.",
    },
    {
      id: 'SEC-3',
      severity: 'MEDIUM',
      issue: 'The correction pattern is a general-purpose bypass of the feedback_freeze immutability trigger, and the shared helper applies no allowlist to `changes`. The shipped code already exercises the bypass.',
      evidence: "feedback_no_update is BEFORE UPDATE only (verified via pg_get_triggerdef); an INSERT is invisible to it, and a correction INSERT rewrites all 38 frozen columns by copying them. buildFeedbackCorrection spreads arbitrary `changes` with no deny-list — verified against the real helper (.artifacts/sec-payload-shape.mjs): buildFeedbackCorrection(base, {title:'REWRITTEN', rubric_score:100}) yields a payload carrying exactly those values. This is not hypothetical: error_hash IS a frozen column (old.error_hash IS DISTINCT FROM new.error_hash appears in the trigger's WHEN clause) and the helper NULLs it on every single correction, so the latest-state row of any corrected error-capture chain loses a value the chairman-gated migration declares immutable. Not reachable from the API today (PATCH /:id/status whitelists 5 lifecycle fields; promote-to-sd sets 2) and no current caller passes a frozen column other than error_hash.",
      location: 'lib/governance/feedback-correction.js:57-69',
      recommendation: "Make buildFeedbackCorrection throw when `changes` contains any column in the trigger's frozen set (mirror the WHEN-clause list, ideally pinned by a test that reads pg_get_triggerdef so the two cannot drift). That reduces the helper's permitted-change set to exactly what the DB already allows via UPDATE, which is the correct invariant either way — and under SEC-0 option (a) it becomes moot.",
    },
    {
      id: 'SEC-4',
      severity: 'MEDIUM',
      issue: "The two self-duplicate CHECK constraints are structurally unenforceable in the correction path, the app-level guard compares the wrong identity, and GAP-1's coverage of both constraints is vacuous.",
      evidence: "chk_feedback_no_self_duplicate (duplicate_of_id IS NULL OR duplicate_of_id <> id) and chk_duplicate_requires_reference (... AND duplicate_of_id <> id) both compare the row's OWN id. A correction always receives a fresh id, so neither predicate can fire for a reference anywhere inside the same chain. lib/quality/feedback-resolution-validator.js validateDuplicate compares effective.duplicate_of_id against the URL :id (server/routes/feedback.js:219 passes feedbackId: id), not against the resolved row or the chain root — so PATCH /api/feedback/<correction-id>/status {status:'duplicate', duplicate_of_id:<rootId>} clears the app gate (rootId !== correctionId) and both DB constraints (rootId <> the new row's fresh id), marking a chain a duplicate of itself. GAP-1's satisfiesNoSelfDuplicate / satisfiesDuplicateRequiresReference assert against row.id, but buildFeedbackCorrection DELETES id from its output — verified: Object.hasOwnProperty(payload,'id') === false, payload.id === undefined — so both predicates are vacuously true for every correction payload, as is the line-257 assertion expect(correction.duplicate_of_id).not.toBe(correction.id). The block's negative control exercises only the `resolved` predicates, so the vacuity is undetected. GAP-1's header claim that 'a payload that clears the app-level gate is proven, here, to also clear the DB constraint' does not hold for these two constraints.",
      location: 'lib/quality/feedback-resolution-validator.js:124-152 (validateDuplicate); server/routes/feedback.js:219; tests/unit/governance/feedback-correction.test.js:220-225, :254-258',
      recommendation: 'Compare duplicate_of_id against rootIdOf(existing) (and reject any id already in the chain), not the URL :id. Add a negative control to GAP-1 for the duplicate predicates so a payload that lacks `id` cannot pass them vacuously — e.g. assert the predicates FAIL for a deliberately self-referential row — and state in the block that the DB cannot enforce these two for corrections, so the app gate is the only real barrier.',
    },
    {
      id: 'SEC-5',
      severity: 'MEDIUM',
      issue: 'The correction pattern trips the public-ingress rate limiter. A single staleness sweep now exceeds the RESTRICTIVE policy ceiling by 2.6x, where the previous UPDATE-based sweep consumed none of the budget.',
      evidence: "anon_feedback_ingress_bounds (RESTRICTIVE, roles=public) bounds inserts via fn_anon_ingress_prior_hour_count(source_type), whose body counts ALL rows in public.feedback by created_at within the last hour, with no scoping to the inserting role. Every correction is a new row with created_at=now() carrying the original's source_type. Measured live (.artifacts/sec-ratelimit-size.mjs): scripts/feedback-staleness-check.js has 524 manual_feedback candidates and 73 auto_capture candidates, each producing one correction INSERT in a single --apply run, against ceilings of 200/hour and 250/hour respectively — manual_feedback goes to ~527 against a 200 ceiling. Direction of harm is denial of legitimate public ingress for the following hour, not attacker bypass. Dormant today because no permissive anon INSERT policy exists (see SEC-1 evidence), so nothing legitimate currently flows through the bounded path.",
      location: 'scripts/feedback-staleness-check.js:112-121; public.fn_anon_ingress_prior_hour_count(text)',
      recommendation: 'Root cause is that the limiter counts rows by created_at regardless of inserting role, so internal service-role writes pollute a control meant to bound anon — worth a separate SD to scope the counter. For THIS SD: under SEC-0 option (a) the problem disappears (UPDATEs are not counted); if the correction design is kept, batch or throttle the sweep so one run cannot exhaust an hourly ingress budget.',
    },
    {
      id: 'SEC-6',
      severity: 'LOW',
      issue: 'Dedup is NOT bypassed — but occurrence counters now accumulate on the superseded row, invisible to any reader of latest state.',
      evidence: "Answering the dedup question directly: every dedup reader is SELECT-based on the hash, not index-based (lib/factory/feedback-writer.js:32-37 .eq('error_hash',h); lib/feedback-capture.js:114; scripts/clockwork/gh-failure-monitor.cjs:95; lib/governance/emit-feedback.js:272 and :405 .eq('metadata->>dedup_hash',h); lib/governance/chairman-override-record.js:146-148 .eq('metadata->>override_key',k)). Append-only retention guarantees the ORIGINAL hash-bearing row is never deleted, so every dedup check still matches and nulling error_hash / stripping dedup_hash on the correction does not open a duplicate-report path. The residual: lib/feedback-capture.js:107-116 writes occurrence_count via .update(...).eq('error_hash',hash).order(created_at desc).limit(1), which after a correction can only ever match the SUPERSEDED row, because the correction's error_hash is NULL. The counter advances on a row no latest-state reader sees — the same writer/consumer asymmetry (PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001) that resolve-feedback.js's own header cites as its reason for existing.",
      location: 'lib/feedback-capture.js:107-116; lib/governance/feedback-correction.js:60',
      recommendation: 'No action required for this SD to proceed. If the correction design is kept, note the occurrence_count split in the helper docblock so the next consumer of that column does not trust the latest row.',
    },
    {
      id: 'SEC-7',
      severity: 'LOW',
      issue: "promote-to-sd's idempotency guard DOES read the resolved latest row as claimed, but it is a read-then-write TOCTOU with no conditional insert — concurrent requests still mint two SDs.",
      evidence: 'server/routes/feedback.js:36-49 resolves via fetchLatestFeedback before checking resolution_sd_id, so the stale-row concern the SD set out to fix is genuinely addressed. The remaining window: fetchLatestFeedback -> check -> insert SD -> insert correction has no conditional insert, no unique index on the chain root, and no post-insert re-read. Pre-existing in kind (the prior .update().eq(id) path had the same window), but the append model changes the failure shape: instead of last-writer-wins on one row, two sibling corrections carry different resolution_sd_id values and the loser becomes orphaned-and-invisible while both SDs persist in strategic_directives_v2.',
      location: 'server/routes/feedback.js:36-135',
      recommendation: "Not introduced by this SD; no action required to proceed. If hardened: a partial UNIQUE index on (metadata->>'corrects_feedback_id') WHERE resolution_sd_id IS NOT NULL, or re-read the chain after insert and roll back the SD on a detected sibling.",
    },
    {
      id: 'SEC-8',
      severity: 'LOW',
      issue: 'Adjacent file: a threat-model comment that justifies a live security property is now factually false.',
      evidence: "lib/governance/chairman-override-record.js:136-146 justifies scoping its dedup read to source_type with 'The telegram_bot_insert_feedback policy constrains ONLY source_type, so an anon actor can insert a row with category=chairman_override and any metadata it likes.' Live pg_policies shows no such INSERT policy: the only anon-applicable INSERT policy is anon_feedback_ingress_bounds (RESTRICTIVE, no permissive counterpart), and anon INSERT is refused outright (42501, verified by attempt). The CODE remains correct — scoping to source_type is harmless and still desirable — but the reason attached to it no longer holds.",
      location: 'lib/governance/chairman-override-record.js:136-146',
      recommendation: 'Out of scope for this SD. Worth a follow-up comment correction: a correct control resting on a false stated reason is the kind of thing that gets "simplified away" by a later reader who checks the premise and finds it untrue.',
    },
  ],
  conditions: [
    { action: 'SEC-1: validate rootId against the UUID regex in fetchLatestFeedback before interpolating it into the .or() filter, and fail closed when it does not match (filter-string breakout PROVEN live)', priority: 'high', blocking: false },
    { action: 'SEC-2: strip metadata.override_key as well as dedup_hash, and correct the docblock from three to four live partial UNIQUE indexes (23505 PROVEN live against idx_feedback_chairman_override_dedup)', priority: 'high', blocking: false },
    { action: 'SEC-3: give buildFeedbackCorrection a deny-list mirroring the feedback_freeze frozen-column set, so a correction cannot rewrite a column the DB declares immutable', priority: 'medium', blocking: false },
    { action: 'SEC-4: compare duplicate_of_id against the chain root rather than the URL :id, and add a non-vacuous negative control to GAP-1 for the two duplicate predicates', priority: 'medium', blocking: false },
    { action: 'SEC-0: PLAN to rule on whether FR-1..FR-6 survive at all, given a plain UPDATE of every column these 5 sites touch is accepted live — the same falsified premise that cancelled FR-7/8/9', priority: 'high', blocking: false },
  ],
  justification: 'CONDITIONAL_PASS: no vulnerability reachable from untrusted input — anon INSERT on public.feedback is structurally refused (verified by attempt, 42501, limiter unsaturated) and the three API routes accept no metadata from the request body, so the proven filter-injection breakout has no current untrusted writer. The reviewed code does what it claims on its two headline contracts: fetchLatestFeedback is genuinely fail-closed at every one of its 5 call sites with no stale-row fallback, the footer regexes carry no ReDoS, short-id expansion is prefix-validated and ambiguity-guarded, and the rubric_score correction makes a previously dead gate live and strictly stricter rather than opening a bypass. Conditional on four integrity defects, three of them settled by attempting them against the live database rather than by reading the migration: a PostgREST .or() filter breakout that redirects the helper to a foreign feedback chain; a fourth live partial UNIQUE index the helper does not neutralize, which will hard-fail an unattended sweep once the first chairman-override row ages out; the correction pattern being an INSERT-shaped bypass of the BEFORE-UPDATE immutability trigger with no allowlist on the helper; and two self-duplicate CHECK constraints that cannot fire for corrections while the test block pinning them is vacuous. Overarching: the premise that UPDATE is rejected unconditionally is false against live main, so PLAN should decide whether this mechanism is warranted at all before the four fixes are invested in.',
  recommendations: [
    'SEC-0 first, then SEC-1..SEC-4: the same lifecycle allowlist migration that cancelled FR-7/8/9 also falsifies FR-1..FR-6. A plain UPDATE of status/resolution_*/resolved_at/quick_fix_id/duplicate_of_id/archived_at/metadata/updated_at is ACCEPTED live (settled by attempt); only the 38 frozen columns are refused. Reverting to narrow UPDATEs eliminates SEC-2, SEC-3, SEC-4 and SEC-5 by construction, so ruling on SEC-0 before fixing the four is the cheaper order.',
    'If the correction design is kept, SEC-1 and SEC-2 are small and should land in this SD: SEC-1 is ~3 lines of UUID validation on a proven breakout; SEC-2 is one more key in the strip-set plus a count correction in a docblock that currently asserts completeness it does not have.',
    'Two findings are pre-existing and explicitly NOT blocking: SEC-7 (promote-to-sd TOCTOU double-mint, same window as the prior UPDATE path) and SEC-8 (a stale threat-model comment in an adjacent file). SEC-5 and SEC-6 need no action for this SD to proceed.',
    'The TS-12 change is a genuine security improvement and should be preserved under any SEC-0 disposition: returning 500 when the feedback->SD link fails, instead of warn-and-succeed, closes the window where a repeat click minted a second SD because the idempotency guard never saw resolution_sd_id land.',
  ],
  detailed_analysis: [
    'SECURITY review at EXEC for SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A, branch feat/SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A, HEAD 0063719464b. Scope: FR-1..FR-6 (FR-7/8/9 cancelled this session).',
    '',
    'METHOD. Every mechanical claim was settled by attempting it against the live database, not inferred from migration text. Writes were run inside BEGIN/ROLLBACK with a persistence check after rollback (all confirmed 0 rows persisted); the filter-injection proof is a read-only SELECT. Probes: .artifacts/sec-feedback-introspect.mjs (constraints/indexes/triggers/FKs), sec-feedback-rls.mjs + sec-pol-mode.mjs (policies, permissive vs restrictive, grants), sec-anon-plant.mjs + sec-anon-plant2.mjs (anon INSERT capability, limiter saturation), sec-or-injection.mjs (.or() breakout), sec-4th-index.mjs (23505), sec-payload-shape.mjs (helper output shape), sec-update-permitted.mjs (frozen vs allowlisted UPDATE), sec-ratelimit-size.mjs (sweep volume vs ceilings).',
    '',
    'THE FOUR QUESTIONS ASKED, ANSWERED DIRECTLY:',
    '',
    '(1) Does nulling error_hash / stripping dedup_hash bypass dedup or rate limiting, and is fetchLatestFeedback fail-closed as claimed? Dedup: NO bypass. Every dedup reader is a SELECT on the hash, and append-only retention guarantees the original hash-bearing row survives, so the check still matches (SEC-6). The collision-avoidance reasoning is sound for three indexes and WRONG for a fourth it does not know about (SEC-2). Rate limiting: YES, a regression, though in the denial direction rather than the bypass direction — correction rows are counted by the anon ingress limiter and one staleness run exceeds the manual_feedback ceiling 2.6x (SEC-5). Fail-closed contract: IMPLEMENTED AS CLAIMED. Both DB error paths return { error } with no fallback to the raw root row, and all 5 callers honour it — routes 404, sweeps skip/continue, resolveFeedback returns { updated:false, error }. I traced each call site; none reintroduces the stale-row trust the module exists to close.',
    '',
    '(2) promote-to-sd / PATCH status: injection in id resolution, does the idempotency guard read the RESOLVED row, does the rubric_score correction open a bypass? Injection: YES but not on the :id path — .eq() encodes its value, and a malformed :id yields a uuid cast error and a fail-closed 404. The injection is one layer deeper, in the .or() built from metadata (SEC-1), and it is proven. Idempotency guard: YES, it reads the resolved latest row as claimed; that part of the fix is real. It is still a read-then-write race with no conditional insert (SEC-7), which is pre-existing in kind. rubric_score: NO new bypass — it converts a gate that was always a no-op (quality_score does not exist on the table) into a live one, strictly stricter. NULL-scored rows still pass, matching documented intent. Worth noting the adjacent fact: rubric_score IS a frozen column, so it cannot be raised by UPDATE — but it CAN be rewritten by a correction INSERT, which is SEC-3.',
    '',
    '(3) Footer parsing: can crafted commit text resolve an arbitrary row, and is there a ReDoS? Arbitrary row: YES by design, and it is not an escalation — the capability gained (flip lifecycle fields on a feedback row) is strictly less than the capability required (land a merged commit or PR body that the QF orchestrator parses). One residual worth tightening: resolveFeedback guards only status === "resolved", so a footer can flip a wont_fix / duplicate / invalid row to resolved, overwriting a deliberate triage decision; the guard should cover the full terminal set. ReDoS: NO. Neither FOOTER_REGEX nor FOOTER_REGEX_LOOSE nests quantifiers over overlapping classes; the capture is bounded {7,35} so the lookahead backtrack is <=29 attempts per start position; the ^ anchor under /m limits start positions to line starts and the [-\\s]+ runs partition the input, so the worst case is linear. Short-id expansion is injection-safe: the prefix is gated by ^[0-9a-f]{8}$ BEFORE the range bounds are built, the bounds cover exactly that prefix, and limit(2) with exact-1 acceptance correctly refuses ambiguous prefixes rather than guessing.',
    '',
    '(4) Can the 6 CHECK constraints be bypassed to forge a resolution / duplicate-of / audit trail, and is GAP-1 sufficient? Four of the six (chk_resolved_requires_reference, chk_feedback_terminal_resolution, chk_wont_fix_requires_notes, feedback_status_check) are row-local predicates over lifecycle columns that a correction carries forward, and GAP-1 covers them adequately with a real negative control. The two duplicate constraints are NOT covered and cannot be: they compare duplicate_of_id against the row\'s own id, a correction always gets a fresh id, and GAP-1\'s mirrored predicates assert against payload.id which buildFeedbackCorrection deletes — so they are vacuously true (SEC-4). The forgeable outcome is concrete: PATCH /api/feedback/<correction-id>/status with duplicate_of_id=<rootId> clears the app gate and both DB constraints and marks a chain a duplicate of itself. The broader audit-trail answer is SEC-3: because the immutability trigger is BEFORE UPDATE only, a correction INSERT can rewrite any of the 38 frozen columns, and the shipped helper already does so for error_hash on every single correction.',
    '',
    'WHAT I DID NOT FIND. No SQL injection (no raw SQL anywhere in the reviewed surface). No hardcoded secrets. No missing authentication — /api/feedback sits behind requireAuth (server/index.js:248), though with no role check, so any authenticated principal can promote or patch; that is pre-existing and consistent with the rest of the router table. No XSS surface in the reviewed code. No cross-schema foreign keys. RLS is enabled on public.feedback with service_role-only write policies.',
  ].join('\n'),
  metadata: {
    reviewed_commit: '0063719464b',
    reviewed_branch: 'feat/SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A',
    scope: 'FR-1..FR-6 (FR-7/8/9 cancelled in 0063719464b)',
    proven_live: {
      or_filter_breakout: 'rootId "<uuid>,status.eq.new" resolved to foreign row 00fe5ffc-7675-4802-b42a-5cdcdc5a9c21 (read-only)',
      fourth_unique_index: '23505 idx_feedback_chairman_override_dedup on a buildFeedbackCorrection payload (BEGIN/ROLLBACK)',
      anon_insert_refused: '42501 under SET LOCAL ROLE anon for telegram/auto_capture/manual_feedback; limiter measured 3/200, 20/250, 0/50 (BEGIN/ROLLBACK)',
      lifecycle_update_accepted: 'UPDATE of status+resolution_notes+resolved_at+updated_at+metadata+archived_at ACCEPTED; rubric_score/title/error_hash each P0001 (BEGIN/ROLLBACK)',
      gap1_vacuity: 'buildFeedbackCorrection payload has no own `id` property, so the two duplicate predicates cannot fail',
      ratelimit_overrun: 'staleness-check: 524 manual_feedback correction inserts per run vs a 200/hour ceiling',
    },
    must_fix: ['SEC-1', 'SEC-2', 'SEC-3', 'SEC-4'],
    premise_finding: ['SEC-0'],
    non_blocking: ['SEC-5', 'SEC-6', 'SEC-7', 'SEC-8'],
    probe_scripts: '.artifacts/sec-*.mjs in worktree SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A',
  },
};

async function main() {
  const resolution = await resolveSubAgentRepo({
    sdId: SD_UUID,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_UUID,
    { name: 'Chief Security Architect', code: 'SECURITY' },
    results,
    { phase: 'EXEC', sdKey: SD_KEY },
  );
  console.log('STORED ID:', stored?.id, '| verdict:', stored?.verdict, '| phase:', stored?.phase, '| sd_id:', stored?.sd_id);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('FAILED:', err.message);
    process.exit(1);
  });
}
