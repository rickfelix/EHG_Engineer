#!/usr/bin/env node
/**
 * One-off: VALIDATION sub-agent LEAD-TO-PLAN verdict for
 * SD-LEO-INFRA-ADAM-HANDOFF-MAIL-FORWARDING-001.
 *
 * Canonical evidence path per CLAUDE.md prologue rule 11:
 * resolveSubAgentRepo + applySubAgentRepoVerdict (metadata.repo_path / executed_from_cwd),
 * then storeSubAgentResults. No hand-rolled INSERT, no top-level repo_path column.
 *
 * Run FROM the worktree so executed_from_cwd stamps the worktree.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'ae41dc6c-42fe-4d63-b9c5-c6b40c7f91f8';
const SD_KEY = 'SD-LEO-INFRA-ADAM-HANDOFF-MAIL-FORWARDING-001';

const findings = [
  {
    id: 'V-1-explore-claims-independently-reverified',
    severity: 'INFO',
    summary: 'ALL FOUR Explore claims independently re-verified by direct source read, not by trusting the summary. (a) lib/fleet/worker-status.cjs:192 ADAM_EXCLUDED_KINDS = Object.freeze([canary_request, comms_check, ack, coordinator_ack, cross_party_ping]) — FIVE entries, confirming the SD text naming only 3 is STALE (cross_party_ping was added by SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001 FR-5; ack/coordinator_ack predate it). (b) scripts/adam-advisory.cjs:1355-1373 drainAdamOutbound predicate confirmed verbatim: .in(target_session, olds).is(read_at, null).gte(created_at, now-24h). (c) lib/coordinator/adam-identity.cjs:174-189 retargetStaleAdamInbound predicate confirmed verbatim: .eq(target_session, staleOriginator).eq(sender_type, coordinator).is(acknowledged_at, null). (d) Retirement-marker divergence confirmed: database/migrations/20260615_role_handoff_atomic_adam_flag.sql:33-41 clear_adam_flag DROPS role+adam_since+non_fleet (only when role=adam), while scripts/adam-register.cjs:208 JS-merge fallback sets {...priorMeta, role: adam_retired, non_fleet: true} — which PRESERVES adam_since via the spread. The two paths therefore leave DIFFERENT metadata residue, and the RPC path leaves NO positive marker at all.'
  },
  {
    id: 'V-2-BLOCKING-kind-lives-in-payload-not-a-kind-column',
    severity: 'HIGH',
    summary: 'SCHEMA TRAP PLAN MUST NOT WALK INTO. session_coordination has NO `kind` column. Measured live columns: id, target_session, target_sd, message_type, subject, body, payload, sender_session, sender_type, created_at, expires_at, read_at, acknowledged_at, correlation_id, delivered_at. A select/filter on `kind` returns error "column session_coordination.kind does not exist". The ADAM_EXCLUDED_KINDS vocabulary is matched against payload->>kind — see the one existing SQL-level consumer, scripts/coordinator-hourly-review.cjs:622: .or(\'payload->>kind.is.null,payload->>kind.not.in.(\' + ADAM_EXCLUDED_KINDS.join(\',\') + \')\'). message_type is a COARSE envelope field (all 212 stranded rows measured message_type=INFO) and is NOT the kind discriminator. PLAN must write the exclusion as payload->>kind with a null-tolerant OR (a row with no payload.kind must be KEPT, not dropped — the existing consumer models this correctly). Note also that .not.in.() interpolates raw tokens, so PLAN should reuse the SAFE_KIND_TOKEN regex discipline already established by SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C FR-4 rather than interpolating unsanitized.'
  },
  {
    id: 'V-3-premise-mechanism-CONFIRMED-severity-numbers-DO-NOT-REPRODUCE',
    severity: 'HIGH',
    summary: 'DEFECT MECHANISM CONFIRMED; SD SEVERITY FIGURES STALE. Live measurement (2026-08-16, service-role, server-side filters + exact counts, NOT an in-memory group over a capped page): claude_sessions has 13,108 rows total; role=adam:1, role=adam_retired:18, role=solomon:1, role=coordinator:0. Across ALL 18 retired Adam seats, session_coordination holds 213 rows, 212 with acknowledged_at IS NULL. Breakdown by payload.kind: cross_party_ping 210, solomon_ledger_pending_digest 1, coordinator_reply 1. So the ACTIONABLE stranded set right now is TWO rows, not the SD narrative\'s 28 (8 coordinator_reply, 10 coordinator_reminder, 1 coordinator_request, 1 review_request, 2 adam_action_required, 6 solomon adam_advisory) — none of coordinator_reminder / coordinator_request / review_request / adam_action_required / adam_advisory appear in the current stranded population at all. The SD\'s 148/28 figures were presumably measured at one register event against one seat and have since been consumed, expired, or drained. PLAN MUST RE-MEASURE at PRD time and MUST NOT encode 148/28 as acceptance criteria — inherited SD constraints must be measured before being encoded. This does NOT invalidate the SD: the mechanism is independently corroborated by code reading AND by lib/adam/inbound-backlog.js fetchInboundBacklog:192-198, whose docstring already documents this exact defect internally. It DOES mean the SD is lower-yield than its text implies, which is a LEAD scope-sizing input.'
  },
  {
    id: 'V-4-read_at-is-the-dominant-leak-not-the-kind-list',
    severity: 'HIGH',
    summary: 'HIGHEST-YIELD FINDING, AND IT REFRAMES THE FIX. Of the 212 unacked rows stranded at retired seats, read_at IS NULL matches ZERO (212/212 have read_at set) and created_at >= now-24h matches ZERO (212/212 are older than the drain window). Therefore drainAdamOutbound as currently written would move EXACTLY 0 of the 212 currently-stranded rows — it is defeated twice over, by read_at AND by the 24h window, before the kind list is ever reached. The SD title already names this correctly ("drops read-but-unacked rows"); the kinds question is a SECOND-ORDER concern by comparison. IDEMPOTENCE IS SAFE TO SWITCH: drainAdamOutbound\'s docstring justifies read_at IS NULL as the idempotence guarantee ("consumed rows never re-move"), but that guarantee is actually carried by the .in(target_session, olds) clause — the new session is filtered out of olds (line 1357: s !== newSessionId), so a re-run matches nothing regardless of the read_at gate. PLAN can move to acknowledged_at IS NULL WITHOUT losing idempotence, and should say so explicitly in the PRD so a reviewer does not restore the read_at gate on idempotence grounds. The 24h window is the other half and must be widened or removed; if PLAN keeps a bound, it should be justified against ACK_TTL_DAYS=14 (lib/retention/session-coordination-ack-convergence.js:21, local/unexported) rather than left at 24h.'
  },
  {
    id: 'V-5-sender_type-widening-blast-radius-tests-BLIND-runtime-REAL',
    severity: 'HIGH',
    summary: 'ANSWER TO THE BLAST-RADIUS QUESTION, TWO-PART. (A) TEST-LEVEL: ZERO existing tests break, but equally ZERO existing tests would CATCH a bad widening — this is fixture blindness, not coverage. tests/unit/coordinator/adam-reply-target-integrity.test.js\'s makeSb mock (lines 17-49) implements .eq(), .is(), .gte(), .filter(), .select() as NO-OP passthroughs that `return builder` and record NOTHING; only .update(patch) is recorded (into calls.updates). The single pin at line 103-108 asserts ONLY the update patch shape (expect(patch).toEqual({target_session:\'live\'})), which a predicate widening does not touch. The three FR-2 behavioural tests (lines 81-96) assert counts driven by the injected retargetRows fixture, which is returned regardless of any filter. So the sender_type filter is literally unobservable by the current suite. (B) The second cited test, tests/unit/coordinator-ack-adam-reply-ordering.test.js:77, is a SOURCE-TEXT ordering pin (helper.indexOf(\'retargetStaleAdamInbound\') vs indexOf(\'if (isFullUuid(originator))\')) scoped to scripts/coordinator-ack-adam.cjs — a different file from lib/coordinator/adam-identity.cjs, so an adam-identity predicate change cannot break it. It WOULD break if PLAN reorders or re-guards the call site. (C) RUNTIME-LEVEL RISK IS REAL AND IS THE ACTUAL CONCERN — see V-6.'
  },
  {
    id: 'V-6-BLOCKING-widening-needs-a-retired-seat-gate-or-it-can-hijack-a-live-inbox',
    severity: 'CRITICAL',
    summary: 'THE ONE GENUINELY BLOCKING DESIGN CONCERN. retargetStaleAdamInbound\'s staleOriginator is only ever proven to be "a full UUID that is not the currently-live Adam" — it is NEVER proven to be a RETIRED ADAM SEAT. resolveAdamReplyTarget (adam-identity.cjs:160-165) sets retargeted=true whenever a live Adam resolves AND differs from the originator; both call sites (scripts/coordinator-reply.cjs:146, scripts/coordinator-ack-adam.cjs:385) then pass that originator straight in, guarded only by isFullUuid. TODAY the .eq(sender_type,\'coordinator\') filter incidentally contains the blast radius. REMOVE IT WITHOUT A REPLACEMENT GATE and the UPDATE sweeps EVERY unacked row targeted at that session from ANY sender. Measured sender_type population over unacked rows table-wide: worker 495, periodic-liveness-watcher 242, coordinator 88, system 48, adam 48, adam-coordinator-health 34, sweep 24, solomon 8, orchestrator 8, drive-state-forcing 3, dashboard 2. If staleOriginator ever resolves to a non-Adam session (a worker that authored an advisory, a stale non-Adam sender), the widened UPDATE would re-point that session\'s entire inbox to Adam — a silent, hard-to-reverse mail hijack, and an UPDATE matching rows it should not is indistinguishable from success. MANDATORY PRD REQUIREMENT: the widened predicate MUST be gated on the target being a VERIFIED retired Adam seat. This converts the "retired seats resolver" from a code-reuse nicety into a SAFETY PRECONDITION — it is the thing that makes the widening legal, and it must ship in the SAME change, not as a follow-on. Note the safety asymmetry between movers: drainAdamOutbound is already safe on this axis (adam-register computes retired[] itself and only passes seats it just retired), so this gate is needed specifically for the retargetStaleAdamInbound side.'
  },
  {
    id: 'V-7-guidance-ADAM_EXCLUDED_KINDS-reuse-all-five',
    severity: 'INFO',
    summary: 'GUIDANCE (question 3): REUSE THE FULL 5-ENTRY ADAM_EXCLUDED_KINDS AS-IS. Do not author a new 3-entry list. Reasoning, not just a flag: (1) The constant is already the canonical shared home — its own header comment states it lives in the kinds module "so adam-advisory.cjs, read-adam-directives.cjs and adam-quiet-tick.mjs share one list without a require cycle", and it has five in-tree consumers (adam-advisory.cjs:514/531/702, adam-quiet-tick.mjs:369/404, read-adam-directives.cjs:34, coordinator-hourly-review.cjs:622). Forking a second 3-entry list to match stale SD prose would be a single-representation violation and would drift on the next kind addition — exactly what happened to the SD text itself. (2) The two "extra" entries are correct on the merits for THIS predicate. The constant\'s comment gives the reason: ack and coordinator_ack are "a terminal acknowledgement nobody ever acks", so under an acknowledged_at IS NULL filter they would accumulate FOREVER and be re-forwarded to every successor Adam in perpetuity. Forwarding a terminal ack to a successor delivers nothing actionable, so including them costs a successor nothing and excluding them prevents unbounded pollution. (3) EMPIRICAL CHECK: the ack/coordinator_ack delta over the current stranded population is ZERO rows — the 5-kind and 3-kind exclusions both yield the same 2 actionable rows today. So the choice is currently a no-op on delivered mail and is decided purely on correctness and drift-resistance, both of which favour reuse. (4) ACTION FOR PLAN: amend the SD/PRD prose to say FIVE kinds and name them, so the next reader does not re-litigate this. That is a documentation correction, NOT a scope change — the behaviour PLAN should implement is unchanged either way.'
  },
  {
    id: 'V-8-guidance-retired-seat-resolver-in-scope-migration-is-not-required',
    severity: 'INFO',
    summary: 'GUIDANCE (question 4): A MINIMAL RESOLVER IS IN SCOPE (~15-25 LOC) AND DOES NOT REQUIRE TOUCHING THE MIGRATION. Decisive measurement: clear_adam_flag is ABSENT from the live database — calling it returns PGRST202 "Could not find the function public.clear_adam_flag(p_session_id) in the schema cache". Corroborated independently by the live data shape: all 18 retired seats carry metadata.role=adam_retired AND non_fleet=true (17 of 18 also retain adam_since), which is the exact signature of the adam-register.cjs:208 JS-merge FALLBACK. Had the RPC been live, those seats would carry NO role key at all. This matches QF-20260703-883 and the standing measurement recorded at scripts/hooks/session-role-orient.cjs:112. CONCLUSION: metadata->>role = \'adam_retired\' is today a complete and reliable discriminator (18/18), so PLAN can build the resolver on it cheaply and safely, and the SD does NOT need to touch database/migrations/20260615_role_handoff_atomic_adam_flag.sql. IMPORTANT CAVEAT — THIS IS SAFETY BY COINCIDENCE: it holds only because the chairman-gated migration is unapplied. The instant clear_adam_flag is applied, the RPC path drops the role key entirely, leaving a retired seat metadata-INDISTINGUISHABLE from a session that was never Adam, and the resolver returns zero with no error while both movers silently stop forwarding. PLAN MUST NOT ship the resolver without addressing this. Two options, in preference order: (OPTION A, RECOMMENDED) converge the marker — amend clear_adam_flag to SET role=\'adam_retired\' instead of dropping the key, so both retirement paths agree on ONE marker. This is a ~3-5 line edit to an UNAPPLIED function (editing dead code, not migrating live data), materially lower risk than "touching a migration" sounds; PLAN must still confirm whether the chairman-gated apply governance applies to editing a staged-but-unapplied file before committing. (OPTION B, MINIMUM ACCEPTABLE) keep the resolver on role=adam_retired and add a REGRESSION PIN that fails LOUDLY if clear_adam_flag becomes present or the marker set changes, so the degradation is noisy rather than silent. Do NOT reuse resolveAdamSessionIds (lib/adam/inbound-backlog-watchdog.js:96-106) — it filters metadata->>role=\'adam\', which matches NEITHER retirement path and would return zero retired seats.'
  },
  {
    id: 'V-9-test-infrastructure-gap-must-be-closed-by-this-SD',
    severity: 'HIGH',
    summary: 'TEST INFRASTRUCTURE REQUIREMENT FOR PLAN. Because the existing mock cannot observe filters (V-5A), a predicate change to retargetStaleAdamInbound would ship completely unverified — a green suite proving nothing about the very thing this SD changes. PLAN MUST include, as an explicit PRD deliverable: upgrade makeSb in tests/unit/coordinator/adam-reply-target-integrity.test.js so .eq()/.is()/.in()/.or()/.gte() RECORD their (column, value) arguments, then assert the resulting filter chain positively — specifically that the retired-seat gate is present, that sender_type is no longer constrained, that acknowledged_at IS NULL is applied, and that the payload->>kind exclusion carries all five ADAM_EXCLUDED_KINDS with null-tolerance. Without this the SD has no way to demonstrate its own fix, and a future reader cannot tell the widening from a regression.'
  },
  {
    id: 'V-10-scope-and-loc-assessment',
    severity: 'INFO',
    summary: 'SCOPE ASSESSMENT vs the ~100 LOC budget. Realistic shape: retired-seat resolver ~20 LOC (paginated select, fail-open, exported); shared predicate builder reused by both movers ~25 LOC; drainAdamOutbound rewire (read_at -> acknowledged_at, widen window, add kind exclusion) ~10 LOC; retargetStaleAdamInbound rewire (drop sender_type, add retired-seat gate, add kind exclusion) ~10 LOC; mock upgrade + new assertions ~40-60 LOC of test. Production LOC lands near 65 and total near 125 with tests — within a defensible Tier-3 envelope, and the test portion is the part that should NOT be trimmed. If Option A (converge clear_adam_flag) is taken, add ~5 LOC. The SD\'s stated non-goals ("DOES NOT change ack semantics; auto-ack anything; touch the worker or coordinator handoff paths") remain TRUE under this plan with ONE clarification PLAN should record: the change is to a helper CALLED FROM coordinator paths (coordinator-reply.cjs, coordinator-ack-adam.cjs), so while the coordinator handoff LOGIC is untouched, the coordinator reply path\'s observable side-effect scope DOES widen. That is a wording correction to the non-goal, not a scope violation — but it should be stated plainly so a reviewer is not surprised.'
  },
  {
    id: 'V-11-no-duplicate-implementation',
    severity: 'INFO',
    summary: 'DUPLICATE CHECK (GATE 1): NO existing shared implementation duplicates this work. Confirmed there is no shared retired-seat resolver — adam-register.cjs builds retired[] locally (lines 183-213) and never persists or exports it; the reply path derives staleOriginator through a wholly different mechanism (resolveAdamReplyTarget). retargetStaleAdamInbound has exactly two production call sites (coordinator-reply.cjs:146, coordinator-ack-adam.cjs:385) plus one documentation reference in scripts/one-off/. drainAdamOutbound has exactly one production call site (adam-register.cjs:221). A parallel Solomon pair exists (retargetStaleSolomonInbound / drainSolomonOutbound in lib/coordinator/solomon-identity.cjs) with the same shape — PLAN should note it as a likely SAME-DEFECT sibling but keep it OUT of this SD\'s scope and capture it as a completion-flags follow-on rather than silently widening scope.'
  }
];

const warnings = [
  'SD severity figures (148 stranded / 28 actionable) DO NOT reproduce against live state as of 2026-08-16 — measured actionable stranded set is 2 rows across all 18 retired seats. PLAN must re-measure at PRD time and must not encode the inherited numbers as acceptance criteria. Mechanism is confirmed; magnitude is not.',
  'PROVENANCE CAVEAT on the clear_adam_flag absence: the finding rests on a PostgREST schema-cache response (PGRST202), NOT a pg_proc catalog read — direct pooler access failed with 28P01 (password authentication failed for user "postgres") from this seat. The conclusion is corroborated by the 18/18 adam_retired+non_fleet data shape and by QF-20260703-883, but a catalog-level confirmation over the pooler is the stronger instrument and PLAN should obtain it before choosing Option A over Option B in finding V-8.',
  'The 210 cross_party_ping rows dominating the stranded population are CORRECTLY excluded by ADAM_EXCLUDED_KINDS and are not a delivery defect. Any PRD metric phrased as "rows stranded at retired seats" will be swamped by them and will look alarming while measuring nothing actionable — phrase acceptance criteria over the POST-exclusion set.',
  'Solomon has a structurally identical mover pair (retargetStaleSolomonInbound / drainSolomonOutbound). Out of scope here, but the same defect almost certainly applies; capture as a completion-flags finding at SD close rather than dropping it.'
];

const recommendations = [
  'PROCEED to PLAN. The defect mechanism is independently confirmed at the source level and corroborated by an in-tree docstring (lib/adam/inbound-backlog.js:192-198). No duplicate implementation exists. GATE 1 duplicate/infrastructure checks PASS.',
  'BLOCKING PRD REQUIREMENT (V-6): the sender_type widening MUST ship together with a verified-retired-seat gate on retargetStaleAdamInbound. Widening the predicate without it permits a silent whole-inbox hijack of any non-Adam session that resolves as staleOriginator. Do not split these across SDs.',
  'BLOCKING PRD REQUIREMENT (V-2): write the kind exclusion against payload->>kind with null-tolerance, NOT against a `kind` column (does not exist) and NOT against message_type (coarse envelope; all stranded rows are INFO). Model it on scripts/coordinator-hourly-review.cjs:622 and sanitize interpolated tokens.',
  'PRIORITISE the read_at -> acknowledged_at switch and the 24h-window widening (V-4) over the kinds work: those two gates alone defeat 212/212 of the currently-stranded rows, whereas the kinds delta is 0. State in the PRD that idempotence survives the switch because it is carried by .in(target_session, olds), not by read_at.',
  'REUSE ADAM_EXCLUDED_KINDS in full (all five entries) rather than authoring a 3-entry list, and amend the SD/PRD prose to say five (V-7). This is a doc correction, not a scope change.',
  'Build the retired-seat resolver on metadata->>role=\'adam_retired\' (valid for 18/18 seats today) — it is in budget and does not require touching the migration. Pair it with EITHER converging clear_adam_flag onto the same marker (preferred, ~5 LOC to an unapplied function, confirm gating governance first) OR a loud regression pin that fails if the marker set changes (V-8). Do NOT reuse resolveAdamSessionIds — it matches neither retirement path.',
  'ADD the test-fixture upgrade to the PRD as a first-class deliverable (V-9): the current mock records no filter arguments, so the change would otherwise ship unobserved by a green suite.',
  'Re-measure the stranded population at PRD time and set acceptance criteria on the post-exclusion actionable set, not on the raw stranded count.',
  'Capture the Solomon sibling pair as a completion-flags follow-on at SD close rather than widening this SD.'
];

const summary = 'LEAD-TO-PLAN VALIDATION: PASS WITH CONDITIONS (confidence 88) for SD-LEO-INFRA-ADAM-HANDOFF-MAIL-FORWARDING-001. All four Explore claims independently re-verified at source (ADAM_EXCLUDED_KINDS is 5 entries not 3; both mover predicates confirmed verbatim; no shared retired-seat resolver exists; RPC-drops-role vs JS-sets-adam_retired divergence confirmed). PROCEED, but three conditions bind PLAN. (1) BLOCKING SAFETY: dropping .eq(sender_type,\'coordinator\') from retargetStaleAdamInbound is NOT safe on its own — staleOriginator is only proven to be "a UUID that is not the live Adam", never proven to be a retired Adam seat, so the current sender_type filter is incidentally the only thing containing blast radius. Widened without a verified-retired-seat gate, the UPDATE sweeps every unacked row at that session from any sender (measured table-wide unacked senders: worker 495, periodic-liveness-watcher 242, coordinator 88, ...), silently hijacking a live inbox. The retired-seat resolver is therefore a SAFETY PRECONDITION, not a code-reuse nicety, and must ship in the same change. (2) BLOCKING SCHEMA: session_coordination has NO `kind` column — the vocabulary lives in payload->>kind (message_type is a coarse envelope; all 212 stranded rows are INFO). (3) PREMISE: the mechanism is real and corroborated by lib/adam/inbound-backlog.js:192-198, but the SD\'s 148/28 severity figures DO NOT reproduce — live measurement across all 18 retired seats finds 212 unacked rows of which 210 are correctly-excluded cross_party_ping, leaving TWO actionable. PLAN must re-measure rather than inherit. HIGHEST-YIELD REFRAME: read_at IS NULL and the 24h window each independently defeat 212/212 of the stranded rows, so drainAdamOutbound would move ZERO today — those two gates matter far more than the kinds list, whose ack/coordinator_ack delta is exactly 0 rows. Idempotence survives the read_at->acknowledged_at switch because it is carried by .in(target_session, olds). GUIDANCE: reuse ADAM_EXCLUDED_KINDS in full (five entries — canonical, already shared by 5 consumers, and ack/coordinator_ack are terminal-by-definition so excluding them prevents perpetual re-forwarding at zero delivery cost) and amend the stale SD prose. The retired-seat resolver IS in the ~100 LOC budget (~20 LOC on metadata->>role=\'adam_retired\', valid 18/18 today) and does NOT require touching the migration — but it is safe only by coincidence, because clear_adam_flag is measurably ABSENT from the live DB (PGRST202; catalog-level confirmation blocked by 28P01 from this seat). If that migration is ever applied, the RPC path drops the role key entirely and the resolver goes blind with no error; PLAN must either converge clear_adam_flag onto role=adam_retired (~5 LOC to an unapplied function) or add a loud regression pin. FINALLY, the existing test mock records no filter arguments (.eq/.is are no-op passthroughs; the only pin asserts the update patch shape), so the change would ship unobserved by a green suite — the fixture upgrade must be a first-class PRD deliverable. No duplicate implementation exists; GATE 1 duplicate/infrastructure checks PASS.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence_score: 88,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      validation_type: 'LEAD_PRE_APPROVAL_GATE_1',
      branch: 'feat/SD-LEO-INFRA-ADAM-HANDOFF-MAIL-FORWARDING-001',
      gate_1_checks: {
        duplicate_check: 'PASS — no shared retired-seat resolver exists; each mover has a single production call site; Solomon sibling pair noted as out-of-scope follow-on',
        infrastructure_check: 'PASS with condition — ADAM_EXCLUDED_KINDS is reusable as-is (all 5); resolveAdamSessionIds is NOT reusable (filters role=adam, matches neither retirement path)',
        claims_verification: 'PARTIAL — mechanism confirmed at source; severity figures (148/28) do not reproduce live',
        backlog_check: 'not evaluated by this agent'
      },
      source_reverification: {
        'lib/fleet/worker-status.cjs:192': "ADAM_EXCLUDED_KINDS = Object.freeze(['canary_request','comms_check','ack','coordinator_ack','cross_party_ping']) — 5 entries",
        'scripts/adam-advisory.cjs:1355-1373': 'drainAdamOutbound: .in(target_session, olds).is(read_at, null).gte(created_at, now-24h)',
        'lib/coordinator/adam-identity.cjs:174-189': 'retargetStaleAdamInbound: .eq(target_session, stale).eq(sender_type, coordinator).is(acknowledged_at, null)',
        'scripts/adam-register.cjs:208': "JS fallback: { ...priorMeta, role: 'adam_retired', non_fleet: true } — preserves adam_since via spread",
        'database/migrations/20260615_role_handoff_atomic_adam_flag.sql:33-41': 'clear_adam_flag drops role + adam_since + non_fleet when role=adam — leaves NO positive retirement marker',
        'scripts/coordinator-hourly-review.cjs:622': "only SQL-level consumer of the kinds list: .or('payload->>kind.is.null,payload->>kind.not.in.(...)')"
      },
      live_measurements_2026_08_16: {
        claude_sessions_total: 13108,
        role_adam: 1,
        role_adam_retired: 18,
        role_solomon: 1,
        role_coordinator: 0,
        retired_seat_marker_shape: 'all 18 carry role=adam_retired + non_fleet=true; 17/18 also retain adam_since (JS-fallback signature)',
        clear_adam_flag_rpc: 'ABSENT (PGRST202 schema-cache miss); pooler catalog confirmation blocked by 28P01',
        rows_at_retired_seats_total: 213,
        rows_unacked: 212,
        unacked_by_payload_kind: { cross_party_ping: 210, solomon_ledger_pending_digest: 1, coordinator_reply: 1 },
        actionable_after_5_kind_exclusion: 2,
        actionable_after_sd_named_3_kind_exclusion: 2,
        ack_coordinator_ack_delta: 0,
        unacked_with_read_at_null: 0,
        unacked_within_24h_window: 0,
        drain_would_move_today: 0,
        retarget_would_move_today: 211,
        unacked_not_sender_type_coordinator: 1,
        table_wide_unacked_sender_types: { worker: 495, 'periodic-liveness-watcher': 242, coordinator: 88, system: 48, adam: 48, 'adam-coordinator-health': 34, sweep: 24, solomon: 8, orchestrator: 8, 'drive-state-forcing': 3, dashboard: 2 }
      },
      blocking_conditions_for_plan: [
        'V-6 CRITICAL: widened predicate requires a verified-retired-seat gate in the SAME change',
        'V-2 HIGH: use payload->>kind (null-tolerant), never a `kind` column or message_type',
        'V-9 HIGH: upgrade the filter-blind test mock as a first-class deliverable',
        'V-3 HIGH: re-measure severity; do not inherit 148/28 as acceptance criteria'
      ],
      schema_note: 'session_coordination columns: id, target_session, target_sd, message_type, subject, body, payload, sender_session, sender_type, created_at, expires_at, read_at, acknowledged_at, correlation_id, delivered_at — NO kind column'
    },
    phase: 'LEAD-TO-PLAN',
    validation_mode: 'prospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_ID,
    { name: 'Principal Systems Analyst (validation-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD-TO-PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  created_at:', stored.created_at);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
