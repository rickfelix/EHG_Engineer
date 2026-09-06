#!/usr/bin/env node
/**
 * One-off: SECURITY sub-agent EXEC-TO-PLAN verdict for
 * SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001.
 * Canonical evidence path per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001';

const findings = [
  {
    id: 'S-1-all-added-insert-values-are-static-literals-no-untrusted-input-flow',
    severity: 'INFO',
    summary: 'CHECKS 1+2 CLEAR, VERIFIED MECHANICALLY NOT BY EYE. Extracted every added sender_session/kind/body line from git diff HEAD~1 across lib/ + scripts/ (16 lines). All payload.kind values are hardcoded string literals: SET_IDENTITY (x3 sites), worker_signal, node_modules_lock, stale_heartbeat_warning. Three of the four sender_session fallbacks are bare literals with no expression at all (fleet-dashboard, periodic-liveness-watcher x2, stale-session-sweep x2). The fourth, assign-fleet-identities x2, is (_mySessionId || "assign-fleet-identities"): traced _mySessionId to lib/coordinator-mutation-guard.mjs resolveOwnSessionId() -> process.env.CLAUDE_SESSION_ID else local .claude/session-id.json .session_id else null. Both are local-process/operator-controlled, never request- or peer-supplied, and it is the SAME value the guardMutation() canonical-coordinator check authenticates against two lines earlier (lines 462-463), so it cannot name a principal other than the one already authorized to run the loop. No new field echoes any untrusted or remote data. No injection sink of any class introduced.'
  },
  {
    id: 'S-2-new-body-fields-add-no-new-data-source-same-strings-already-in-subject',
    severity: 'INFO',
    summary: 'The only two non-literal additions are the template body strings in scripts/periodic-liveness-watcher.mjs (emitOverdueSignal / emitPersistentUnverifiedSignal). They interpolate row.display_name || row.process_key and liveness_source_ref?.required_invocation, all read from the periodic_process_registry DB row. Checked the surrounding pre-existing code: the IDENTICAL interpolations already flowed into subject on the very same insert before this diff. So the change adds a second plain-text column carrying an already-present string, not a new data source and not a new sink class (both are text columns; no HTML, shell, or SQL sink downstream - grep found zero renderers of these rows in src/).'
  },
  {
    id: 'S-3-migration-is-pure-additive-insert-matches-sibling-and-is-not-applied',
    severity: 'INFO',
    summary: 'CHECK 3 CLEAR. database/migrations/20260906_role_drain_sets_add_worker_signal.sql: keyword scan for drop/alter/grant/revoke/truncate/delete/update/create function|trigger|policy/execute/concat returned ONLY the word "altered" inside a comment. Body is one INSERT with four inline literal tuples and ON CONFLICT (role, kind, direction) DO NOTHING, plus NOTIFY pgrst. Zero string concatenation, zero external input, so parameterization is moot. Structurally byte-parallel to its sibling database/migrations/20260830_role_drain_sets_add_parent_completion.sql, including the same "@approved-by: PENDING - chairman-gated apply required" header. Validated against the real DDL (20260720_role_drain_sets_STAGED.sql): the omitted direction column is NOT NULL DEFAULT inbound so the short column list is safe; the ON CONFLICT target exactly matches CONSTRAINT role_drain_sets_role_kind_direction_key UNIQUE (role, kind, direction); worker_signal satisfies CHECK (kind ~ regex ^[A-Za-z][A-Za-z0-9_]*$); and the table has ENABLE ROW LEVEL SECURITY with a service_role-only policy, so no anon/authenticated exposure is created. Confirmed live that the migration is NOT applied: SELECT on role_drain_sets WHERE kind=worker_signal returns zero rows, matching the PENDING marker.'
  },
  {
    id: 'S-4-sender_session-stamping-exposes-nothing-new',
    severity: 'INFO',
    summary: 'CHECK 4 CLEAR. Three independent reasons stamping a real coordinator session id on previously-null SET_IDENTITY / signal_resolved rows exposes nothing to a party that could not already see it. (a) No renderer: grep for sender_session across src/ returns ZERO hits, so it reaches no UI and no less-trusted surface. (b) No read boundary to cross: the sibling fleet tables in the same base migration (claude_sessions, sd_claims) carry CREATE POLICY "Allow all for anon" ... USING (true), so every session id in the fleet is ALREADY readable by any party that can read a coordination row at all - the coordinator session id is not secret. (c) The rows are already addressed to that specific worker and already carried sender_type=coordinator, so the recipient already knew who wrote them. The value is a correlation label, not a credential. Also confirmed the column accepts non-UUID text (live row sender_session=batch-mint-sweep, sender_type=system), so the four named-principal literals introduce no constraint violation and follow shipped precedent (batch-mint-sweep, chairman, sweep).'
  },
  {
    id: 'S-5-CORRECTION-drain-sets-edit-DOES-widen-the-fail-closed-adam-send-gate',
    severity: 'MEDIUM',
    summary: 'CHECK 5 PREMISE IS FALSE - CORRECTED BY EXECUTION, NOT BY READING. The brief asserted the DRAIN_SETS.worker_signal registration is READ-side classification only and touches no write authorization. It is not. scripts/adam-advisory.cjs:566 defines ADAM_INBOX_KINDS = Object.freeze(DRAIN_SETS.adam.filter(k => !ADAM_EXCLUDED_KINDS.includes(k))) - the drain set IS the source of that allowlist - and lib/coordinator/dispatch.cjs:1311-1323 consumes isAdamInboxRow() in a FAIL-CLOSED send refusal (DISPATCH_UNTYPED_ADAM_KIND, rethrown at 1326 specifically so it fails closed). Executed both row shapes rather than trusting the trace: pre-fix set => isAdamInboxRow=false => REFUSED=true; post-fix set => isAdamInboxRow=true => REFUSED=false. Confirmed the path is live for this writer: scripts/worker-signal.cjs:25 imports insertCoordinationRow from lib/coordinator/dispatch.cjs and uses it at lines 256/410/576/739, so /signal --to adam really does traverse this gate. SECURITY IMPACT ASSESSED LOW, NOT ZERO: the gate is a KIND-SHAPE allowlist whose documented purpose (QF-20260709-053, comment at dispatch.cjs:1307) is preventing undrainable silent-drop orphans, NOT a principal or privilege boundary; it grants no new principal any capability (worker-signal.cjs already held session_coordination write access, and any holder of the client can bypass dispatch entirely via a raw insert - roughly 28 such sites remain in the classguard backlog); and Adam is a same-trust-domain machine role. Net effect is a deliverability fix in the good direction. But it is an undocumented, untested widening of a fail-closed gate, so it must be named rather than absorbed.'
  },
  {
    id: 'S-6-orphan-reroute-blast-radius-checked-and-defused-including-the-npm-mutex',
    severity: 'INFO',
    summary: 'THE NON-OBVIOUS ONE I WENT LOOKING FOR, AND IT CLEARS. lib/fleet/orphan-reroute-sweep.js isOrphanCandidate() returns false on a falsy kind (line 63), so previously-UNTYPED rows were structurally IMMUNE to reroute; newly stamping payload.kind makes them eligible for the first time, and the sweep really does rewrite target_session (line 177: .update({ target_session: coordinatorTarget, payload: mergedPayload })) - i.e. it can divert a row away from its intended recipient. Executed DRAIN_SETS membership for all five kinds: node_modules_lock and stale_heartbeat_warning are registered in NO role at all, which is exactly the at-risk shape. Both are nevertheless UNREACHABLE: the sweep resolves role via lib/coordinator/dispatch.cjs resolveTargetRole, which returns null for target "broadcast" (line 123 - npm-install-lock.cjs writes target_session: broadcast) and null for a plain worker uuid (fleet-dashboard STALE_WARNING targets a worker), and the sweep continues on a null role at line 149. Verified the npm-install mutex is reroute-safe even if that guard ever changed: findActiveLock (lib/npm-install-lock.cjs:36-44) keys ONLY on message_type/read_at/payload->>lock_type/payload->>status and never on target_session, and the sweep mergedPayload spreads the original payload so lock_type/status survive - no concurrent-npm-install corruption path exists. Conversely worker_signal DOES target the role seats where resolveTargetRole succeeds, which is precisely why the DRAIN_SETS registration was REQUIRED: without it those /signal rows would have been rerouted away from their target. The diff reasoning holds, including the explicit uppercase-SET_IDENTITY casing argument (SET_IDENTITY is in DRAIN_SETS.worker; a lowercase variant would not have been).'
  },
  {
    id: 'S-7-operational-noise-not-security-hourly-review-undelivered-check',
    severity: 'LOW',
    summary: 'NON-SECURITY SIDE EFFECT, RECORDED FOR COMPLETENESS. scripts/coordinator-hourly-review.cjs:619 selects the coordinator outbound rows with .eq(sender_session, myId).is(read_at, null). SET_IDENTITY rows were excluded from this check purely because sender_session was null; now that FR-2 stamps the coordinator real id they will match, and SET_IDENTITY is not in ADAM_EXCLUDED_KINDS so the or(kind.is.null, kind.not.in(...)) leg keeps them. Expect new UNDELIVERED OUTBOUND lines in the hourly review for any SET_IDENTITY a worker has not yet read. Noise and a truer picture of delivery, not a vulnerability and not a regression - flagged so it is not later misread as an incident.'
  }
];

const warnings = [
  {
    severity: 'MEDIUM',
    issue: 'The DRAIN_SETS.adam addition of worker_signal widens the FAIL-CLOSED DISPATCH_UNTYPED_ADAM_KIND send gate (via ADAM_INBOX_KINDS = DRAIN_SETS.adam.filter(...) at scripts/adam-advisory.cjs:566), contrary to the review brief premise that the change is read-side only. Verified by execution: an Adam-directed worker_signal row was REFUSED pre-fix and is ADMITTED post-fix.',
    recommendation: 'Non-blocking (no privilege escalation: the gate allowlists kinds, not principals, and worker-signal.cjs already held write access). Pin the behaviour with a regression test asserting isAdamInboxRow({payload:{kind:"worker_signal"}}) === true, so a future kind rename cannot silently re-break or silently re-widen the Adam friction lane. This overlaps the TESTING unclaimed-win finding on the same commit; one shared test satisfies both.'
  },
  {
    severity: 'LOW',
    issue: 'Two newly-introduced payload.kind literals (node_modules_lock, stale_heartbeat_warning) are registered in NO role drain set, which is the shape that makes a row orphan-reroute-eligible for the first time (untyped rows were immune).',
    recommendation: 'Safe today only because resolveTargetRole returns null for "broadcast" and for plain worker session ids, so the sweep skips them. If either writer is ever re-targeted at a ROLE seat (coordinator/solomon/michael/adam), register the kind first or the row will be diverted to the coordinator. Consider a comment at both sites recording that dependency.'
  }
];

const recommendations = [
  'Merge is safe from a security standpoint. No new untrusted-input flow, no injection sink, no secret or credential handling, no privilege escalation, no data exposure, and no RLS/policy change.',
  'Add the one-line isAdamInboxRow(worker_signal) regression test before merge or as an immediate follow-up, to pin the fail-closed-gate widening that this SD delivers but neither documents nor covers.',
  'Leave database/migrations/20260906_role_drain_sets_add_worker_signal.sql at @approved-by: PENDING and unapplied. It is verified safe (pure additive INSERT, RLS service_role-only, ON CONFLICT matches the real unique constraint) and the JS floor already delivers the behaviour, so there is no pressure to apply it outside the chairman-gated path.',
  'No SECURITY-owned blocker on the EXEC-TO-PLAN handoff.'
];

const summary = 'EXEC-TO-PLAN SECURITY review for SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001 at 66b336647f5 plus the uncommitted follow-up: PASS (confidence 92). Scope was the diff only, not a general audit of the six files. ALL FIVE BRIEFED CHECKS RESOLVED, FOUR CLEAN AND ONE PREMISE CORRECTED. (1)+(2) Extracted all 16 added sender_session/kind/body lines mechanically: every payload.kind is a hardcoded literal and three of four sender_session fallbacks are bare literals; the fourth (_mySessionId || "assign-fleet-identities") resolves from CLAUDE_SESSION_ID or the local .claude/session-id.json and is the SAME value guardMutation() authenticates one line earlier, so it can never name an unauthorized principal. Zero untrusted input reaches any new field; zero injection sinks. The only non-literal additions are two periodic-liveness-watcher body templates whose identical interpolations already flowed into subject on the same pre-existing insert. (3) Migration is a pure additive INSERT + NOTIFY: DDL keyword scan clean (sole hit is the word "altered" in a comment), no concatenation, ON CONFLICT target matches the real UNIQUE constraint, the omitted direction column is NOT NULL DEFAULT inbound, kind passes the CHECK regex, the table is RLS-enabled service_role-only, it mirrors sibling 20260830 exactly, and I confirmed LIVE that it is not applied (zero worker_signal rows). (4) sender_session stamping exposes nothing: zero renderers in src/, and the sibling fleet tables are RLS allow-all-for-anon so every fleet session id is already broadly readable - it is a correlation label, not a credential. (5) THE PREMISE WAS WRONG AND I CORRECTED IT BY EXECUTION: ADAM_INBOX_KINDS is DERIVED from DRAIN_SETS.adam (adam-advisory.cjs:566), and dispatch.cjs:1311-1326 consumes it in a FAIL-CLOSED refusal, so the DRAIN_SETS edit DOES widen a write-path gate - an Adam-directed worker_signal row was REFUSED pre-fix and is ADMITTED post-fix, and worker-signal.cjs genuinely traverses that choke via insertCoordinationRow. Impact is LOW: the gate allowlists KINDS not PRINCIPALS, its stated purpose is anti-silent-drop, no principal gains capability, and raw inserts bypass it anyway - a deliverability fix, but an untested one that deserves a pinning test. I additionally hunted the blast radius nobody briefed: newly stamping kind makes previously-untyped rows orphan-reroute-eligible for the first time (isOrphanCandidate returns false on a falsy kind) and the sweep really does rewrite target_session; node_modules_lock and stale_heartbeat_warning are registered in no drain set, but both are unreachable because resolveTargetRole returns null for "broadcast" and for worker uuids, and the npm-install mutex is reroute-safe regardless since findActiveLock keys on payload lock_type/status and never on target_session - so no concurrent-install corruption path. PASS rather than CONDITIONAL_PASS because no security defect exists; the single MEDIUM finding is a premise correction plus a test-coverage gap TESTING already owns.';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'SECURITY', supabase });

  let results = {
    verdict: 'PASS',
    confidence_score: 92,
    findings,
    warnings,
    recommendations,
    summary,
    justification: 'PASS: the diff introduces no untrusted-input flow, no injection sink, no secret handling, no privilege escalation, no data exposure and no RLS/policy change. The one MEDIUM finding corrects a false premise in the review brief (the DRAIN_SETS edit does widen a fail-closed send gate) but carries no security impact, since that gate allowlists message kinds rather than principals and grants no principal a capability it lacked.',
    detailed_analysis: {
      sd_key: SD_KEY,
      review_type: 'EXEC_TO_PLAN_SECURITY_REVIEW',
      scope: 'diff-only (git diff HEAD~1 + uncommitted working tree), NOT a general audit of the touched files',
      branch: 'feat/SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001',
      worktree_head: '66b336647f5f71ca609d893a1e9aa7acebcaf954',
      uncommitted_reviewed: [
        'lib/coordinator/dispatch.cjs (comment-only)',
        'scripts/assign-fleet-identities.cjs (sender_session fallback literal + resolved-error check)',
        'tests/static-guards/session-coordination-writer-census.test.js'
      ],
      briefed_checks: {
        '1_untrusted_input_into_new_inserts': 'CLEAR - all 16 added values are literals; no request/peer data reaches any new field',
        '2_sender_session_fallbacks_are_literals': 'CLEAR - 3 of 4 are bare literals; assign-fleet-identities uses _mySessionId (env/local-file, guard-authenticated) with a hardcoded literal fallback',
        '3_sql_migration_safety': 'CLEAR - pure additive INSERT + NOTIFY, no DROP/ALTER/GRANT/DELETE/UPDATE, no concatenation, matches sibling 20260830, RLS service_role-only, verified NOT applied',
        '4_sender_session_exposure': 'CLEAR - no src/ renderer, sibling fleet tables are RLS allow-all-for-anon, rows already worker-targeted and already sender_type=coordinator',
        '5_drain_sets_write_authorization': 'PREMISE FALSE - corrected. DRAIN_SETS.adam feeds ADAM_INBOX_KINDS which feeds the fail-closed DISPATCH_UNTYPED_ADAM_KIND send gate. Widening verified by execution. Security impact LOW (kind allowlist, not principal boundary).'
      },
      adam_gate_execution_probe: {
        method: 'executed scripts/adam-advisory.cjs isAdamInboxRow/isReplyRow/EXCLUDED_KINDS against the worker_signal row shape with the post-fix ADAM_INBOX_KINDS and with a simulated pre-fix set (worker_signal filtered out)',
        pre_fix_refused: true,
        post_fix_refused: false,
        gate_site: 'lib/coordinator/dispatch.cjs:1311-1326 (DISPATCH_UNTYPED_ADAM_KIND, rethrown to fail CLOSED)',
        allowlist_derivation: 'scripts/adam-advisory.cjs:566 ADAM_INBOX_KINDS = DRAIN_SETS.adam.filter(k => !ADAM_EXCLUDED_KINDS.includes(k))',
        writer_traverses_gate: 'scripts/worker-signal.cjs:25 imports insertCoordinationRow from lib/coordinator/dispatch.cjs (used at 256/410/576/739)',
        assessed_impact: 'LOW - kind-shape allowlist for anti-silent-drop, not a principal/privilege boundary; no new capability granted; raw inserts bypass dispatch entirely'
      },
      orphan_reroute_blast_radius: {
        why_it_matters: 'lib/fleet/orphan-reroute-sweep.js isOrphanCandidate() returns false on a falsy kind, so previously-UNTYPED rows were immune; newly stamping kind makes them eligible, and the sweep rewrites target_session (line 177)',
        unregistered_new_kinds: ['node_modules_lock', 'stale_heartbeat_warning'],
        why_unreachable: 'resolveTargetRole (lib/coordinator/dispatch.cjs:123) returns null for target broadcast and for plain worker uuids; the sweep continues on a null role at line 149',
        npm_mutex_safe_regardless: 'findActiveLock (lib/npm-install-lock.cjs:36-44) keys on message_type/read_at/payload->>lock_type/payload->>status, never target_session; the sweep mergedPayload spreads the original payload so lock_type/status survive - no concurrent-install corruption path',
        worker_signal_correctly_registered: 'targets role seats where resolveTargetRole succeeds, so the DRAIN_SETS registration was REQUIRED to prevent diversion'
      },
      migration_review: {
        file: 'database/migrations/20260906_role_drain_sets_add_worker_signal.sql',
        applied: false,
        applied_verified_live: 'SELECT role,kind FROM role_drain_sets WHERE kind=worker_signal => 0 rows',
        ddl_keyword_scan: 'clean (only match is the word "altered" inside a comment)',
        constraint_parity: 'ON CONFLICT (role,kind,direction) matches CONSTRAINT role_drain_sets_role_kind_direction_key',
        omitted_column_safe: 'direction text NOT NULL DEFAULT inbound',
        check_constraint_satisfied: 'kind matches ^[A-Za-z][A-Za-z0-9_]*$',
        rls: 'ENABLE ROW LEVEL SECURITY with role_drain_sets_service_role_all policy - no anon/authenticated exposure',
        sibling_pattern: 'database/migrations/20260830_role_drain_sets_add_parent_completion.sql'
      },
      security_classes_checked_and_absent: [
        'SQL injection / string concatenation into SQL - ABSENT (migration uses inline literals only)',
        'XSS / output sanitization - N/A (zero renderers of these rows in src/)',
        'Hardcoded secrets or credentials - ABSENT (no secret material in the diff)',
        'AuthN/AuthZ escalation - ABSENT (no principal gains capability; see S-5 for the kind-allowlist nuance)',
        'RLS / policy change - ABSENT (migration touches data rows only, table RLS unchanged)',
        'Cross-schema foreign keys - ABSENT',
        'PII / sensitive data exposure - ABSENT (session ids already fleet-readable under existing allow-all policies)'
      ],
      not_verified: [
        'The live database RLS policy list for session_coordination itself (no exec_sql RPC available to this client); assessed instead from the sibling fleet tables in the same base migration (claude_sessions, sd_claims => allow-all for anon/authenticated) and from the absence of any src/ renderer.',
        'Runtime behaviour of the orphan-reroute-sweep against production rows - reasoning is from source plus executed DRAIN_SETS membership, not from a live sweep tick.'
      ]
    },
    phase: 'EXEC',
    validation_mode: 'retrospective',
    metadata: { measured: true, review_scope: 'diff-only' }
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_KEY,
    { name: 'Chief Security Architect (security-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  sd_id:', stored.sd_id);
  console.log('  created_at:', stored.created_at);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
