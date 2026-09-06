import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = 'bb4b1b7d-598c-4880-9d6e-186586d020ba';
const SD_KEY = 'SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001';
const PRD_ID = `PRD-${SD_ID}`;
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const prd = {
  id: PRD_ID,
  directive_id: SD_ID,
  sd_id: SD_ID,
  title: 'Periodic-liveness ladder: route to owning role, not chairman',
  status: 'approved',
  executive_summary:
    'Rung 2 of the periodic-liveness ladder emails the chairman for EVERY laddered process regardless of owner. Route it to the live owning role seat instead; reach the chairman only on a dead owner or a chairman-owned process, as one non-blocking row/day; fix the okr-day28-hardstop cadence misdeclaration that fires it nightly.',
  functional_requirements: [
    {
      id: 'FR-1',
      requirement: 'Rung 2 routes to the live owning role seat as an ack-required directive, not a chairman row',
      description: 'scripts/periodic-liveness-watcher.mjs already resolves ownerTarget = resolveOwnerTarget(supabase, row.owner) at the rung-1 call site (line 622) and passes it into climbLadder, but climbLadder (lib/periodic-liveness/ladder-escalation.mjs:115-126) sets laddered:true purely from the consecutive-miss counter -- ownerTarget never gates entry into ladderCandidates or the emitLadderDigest call (line 663). Add a NEW exported pure function `decideLadderRoute({rawOwner, ownerTarget, climb})` (the watcher\'s tick loop is unexported and must not become the only place this decision is testable) that returns `{route: \'owner_directive\'|\'chairman_awareness\', target}`; the watcher calls it at the ladderCandidates.push site (around line 622-629) instead of unconditionally laddering. Gate on `ownerTarget.live === true` (NOT on `ownerTarget.target` truthiness -- resolveOwnerTarget\'s fallback is `target: coordinatorId || \'broadcast-coordinator\'`, a sentinel string that is always truthy even when no live coordinator exists, per security-agent finding S2). When the route is owner_directive, write an ack-required session_coordination row to that seat\'s inbox using `payload.kind` set to a value REGISTERED in lib/fleet/worker-status.cjs\'s `DIRECTIVE_KINDS` closed allowlist (a brand-new unregistered kind is silently auto-read-and-dropped by scripts/hooks/coordination-inbox.cjs before any ack path ever sees it, and scripts/worker-ack-directive.cjs / worker-ack-advisory.cjs hard-refuse to ack an out-of-allowlist kind -- confirmed via direct code read, this is not optional). Register a new `periodic_liveness_owner_directive` entry in DIRECTIVE_KINDS as part of this FR. NO chairman_decisions row is written and NO email is sent for a role-owned, live-owner process.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'lib/fleet/worker-status.cjs\'s DIRECTIVE_KINDS allowlist includes the new `periodic_liveness_owner_directive` kind, and scripts/worker-ack-directive.cjs successfully acks a row of that kind in a unit test (proving the row is not silently auto-read-and-dropped by coordination-inbox.cjs before any ack path sees it).',
        'Given a registry row with owner=coordinator-fleet that crosses LADDER_THRESHOLD, when decideLadderRoute is called with the live-resolved coordinator ownerTarget, then it returns route=owner_directive; the watcher writes a session_coordination row with the registered directive kind and target_session=the resolved coordinator session, and zero chairman_decisions rows are inserted and zero escalateChairmanDecision calls occur for that row in that tick.',
        'Given a registry row with owner=eva-scheduler that crosses LADDER_THRESHOLD, when decideLadderRoute evaluates it, then the directive routes via the coordinator\'s EVA lane (the same coordinator target resolveOwnerTarget already returns for this label) -- not the chairman path.',
        'The 3-tick unacked fallback (FR-1b, see below) reuses climbLadder\'s own atomic consecutive-miss counter (`climb.count`, already incremented once per OVERDUE tick via the periodic_registry_increment_consecutive_miss RPC and zeroed on recovery by resetConsecutiveMiss) rather than a new read_at-based SLA -- a read_at-based timer is incompatible with a deliver-and-leave-unread directive design, since read_at would stay null forever once the auto-read-on-first-poll behavior above is fixed to route through the DIRECTIVE_KINDS ack path instead.',
      ],
    },
    {
      id: 'FR-1b',
      requirement: 'An owner directive unacknowledged after 3 extra ladder ticks falls through to the dead-owner chairman path',
      description: 'climbLadder (ladder-escalation.mjs:115-126) currently returns laddered:true on exactly ONE tick per episode (an exact-match `count !== LADDER_THRESHOLD` check, deliberate per PR #5940) -- so "3 consecutive watcher ticks" is not a concept the current laddered-gate branch can observe more than once. Instead, evaluate the fallback OUTSIDE the laddered gate: climbLadder already returns `count` (the atomic consecutive-miss counter), so the fallback condition is `climb.count >= LADDER_THRESHOLD + 3`, checked on every tick regardless of whether `laddered` is freshly true this tick. When that condition is met AND the process still has no ack recorded on its owner-directive row, route it to FR-2(a)\'s dead-owner chairman-awareness path instead. This closes the "live-per-discriminator but never acks" gap without inventing a new tick-counting mechanism.',
      priority: 'HIGH',
      acceptance_criteria: [
        'A registry row whose owner-directive row has no ack after climb.count reaches LADDER_THRESHOLD+3 is routed to the FR-2(a) dead-owner chairman-awareness path on the next watcher evaluation.',
        'A registry row that recovers (climb.count reset to 0 by resetConsecutiveMiss) before reaching LADDER_THRESHOLD+3 never reaches the fallback, and its owner-directive row is resolved per FR-3.',
      ],
    },
    {
      id: 'FR-2',
      requirement: 'Chairman reached only on a dead owner or a chairman-owned process, as one non-blocking row per day',
      description: 'CORRECTED DURING EXEC (real finding, missed by both prior adversarial reviews): `emitLadderDigest` (ladder-escalation.mjs:207-277, including its :267 `blocking:true` literal) is NOT exclusive to the periodic-liveness watcher -- `lib/coordination/lane-dead-letter-alarm.cjs` explicitly documents it as its ONLY allow-listed chairman-paging surface for an unrelated concern (comms-lane dead-letter breach alerting), with a "HARD, LOAD-BEARING CONSTRAINT" comment naming emitLadderDigest specifically (never its sibling emitCoordinatorRung). That module has zero production callers today (only its own unit test imports it) but is fully built, tested, and merged, awaiting a future wiring effort -- changing emitLadderDigest\'s email-firing contract now would silently break that future wiring with no one connecting the two SDs. THE FIX IS THEREFORE AT THE WATCHER\'S CALL SITE, NOT INSIDE ladder-escalation.mjs: scripts/periodic-liveness-watcher.mjs simply STOPS calling emitLadderDigest for its own periodic_process_registry-sourced candidates -- decideLadderRoute routes them to the two NEW writer modules below instead. `emitLadderDigest` itself, including line 267\'s `blocking:true` literal, is LEFT UNCHANGED to preserve lane-dead-letter-alarm.cjs\'s contract exactly. (Non-behavioral hardening to the shared findRecentlyDismissedSignatures/emitLadderDigest code -- forensic-context preservation on refresh, loud logging on a suppression-lookup failure -- remains safe and in scope per FR-3, since neither changes any externally observable email/blocking behavior for lane-dead-letter-alarm.cjs.) (a) Dead-owner case (route=chairman_awareness from decideLadderRoute, i.e. ownerTarget.live!==true): keep escalation but implement it as a NEW non-blocking-awareness write, not the current blocking:true insert. (b) Chairman-owned case: owner-target-resolver.mjs\'s KNOWN_PEERS set (adam, solomon, coordinator) does NOT include chairman, so both eva-scheduler and chairman-fleet owner labels resolve to an identical {kind:coordinator, resolvedPeer:null} fallback shape today -- add an explicit raw-label check, normalized as `String(row.owner ?? \'\').trim().toLowerCase()` matched against /^chairman(-fleet)?$/ (security-agent finding C2: match on the normalized string, not the raw column, so a stray space does not slip past the anchored regex) at the watcher\'s call site, BEFORE relying on resolveOwnerTarget\'s return shape, so a chairman-owned row is distinguished from an eva-scheduler row; a label that should have matched but does not (a future unseen spelling) falls to the coordinator fallback (misrouted to a live inbox, not silently dropped -- bounded by FR-1b\'s 3-tick timeout). In both (a) and (b), write a NEW venture-less awareness row via a purpose-built writer in lib/periodic-liveness/ (NOT lib/eva/chairman-decision-watcher.js\'s createAdvisoryNotification, which hard-guards on `!ventureId || stageNumber===undefined` and returns null for null venture_id) with the FULL required insert shape `{venture_id:null, lifecycle_stage:0, decision:\'advisory\', decision_type:\'advisory\', status:\'approved\', blocking:false, summary, brief_data}` -- security-agent found chairman_decisions.lifecycle_stage and decision_type are NOT NULL with no default and are absent from an earlier draft of this write shape; omitting them throws a 23502 that the surrounding fail-soft catch would swallow, reproducing exactly the total-silence failure this FR exists to prevent. `decision_type:\'advisory\'` is also a security/consumer invariant, not cosmetic: lib/eva/stage-execution-worker.js and lib/eva/artifact-persistence-service.js both discriminate a machine advisory from a genuine chairman approval on this exact field. The awareness row\'s `summary` MUST use a distinct prefix that does NOT match `Periodic-liveness ladder:%` (ladder-escalation.mjs\'s DIGEST_PREFIX) -- findRecentlyDismissedSignatures (ladder-escalation.mjs:164-199) selects any non-pending row under that summary prefix with a fresh updated_at as a "dismissal", so a same-prefixed, daily-refreshed, status=approved awareness row would be read as a standing dismissal and permanently suppress re-escalation of every process it names. Throttle to at most one such row per calendar day (a NEW throttle, not a reuse of shouldAutoEscalate\'s blocking-based gate, since disabling blocking entirely would also silence this legitimate case).',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'Given a registry row whose decideLadderRoute result is chairman_awareness because ownerTarget.live!==true, when it ladders, then exactly one non-blocking (blocking:false) chairman_decisions row is written or refreshed that day with the full insert shape (venture_id:null, lifecycle_stage:0, decision:advisory, decision_type:advisory, status:approved, blocking:false), and zero standout emails fire from it.',
        'Given a registry row whose normalized owner (trim+lowercase) matches /^chairman(-fleet)?$/, when it ladders, then it reaches the same one-row-per-day non-blocking awareness path (not the FR-1 role-directive path).',
        'Given two distinct chairman_awareness-routed processes ladder on the same calendar day, when the second one ladders, then no second chairman_decisions row is inserted -- the existing row is refreshed/appended.',
        'The awareness row\'s summary does not begin with "Periodic-liveness ladder:" (ladder-escalation.mjs\'s DIGEST_PREFIX); a unit test asserts that minting an awareness row for process X does NOT cause findRecentlyDismissedSignatures to report X as dismissed on a subsequent, unrelated ladder digest for X.',
        'scripts/periodic-liveness-watcher.mjs no longer calls emitLadderDigest for any periodic_process_registry-sourced candidate (verified via a test asserting emitLadderDigest is never invoked by the watcher\'s tick loop); emitLadderDigest itself (including line 267\'s blocking:true literal) is unchanged, so lib/coordination/lane-dead-letter-alarm.cjs\'s unrelated chairman-paging contract is preserved byte-for-byte.',
      ],
    },
    {
      id: 'FR-3',
      requirement: 'Digest self-resolves on recovery; refresh no longer destroys mint-time forensic data',
      description: 'When every process in a digest returns to OK, the ladder resolves its own row (the FR-1 owner-directive session_coordination row via resolveOwnerDirective, or the FR-2 chairman-awareness chairman_decisions row) with the recovery time -- no hand disposition required. CORRECTED DURING EXEC (see FR-2\'s corrected description): the two secondary defects originally named here (ladder-escalation.mjs:255-258\'s brief_data overwrite-on-refresh, and :195-197\'s silent catch{} in findDismissedSignatures) live inside emitLadderDigest/findRecentlyDismissedSignatures -- functions this SD no longer calls from the periodic-liveness watcher (they remain the exclusive, unmodified allow-listed surface of lib/coordination/lane-dead-letter-alarm.cjs, an unrelated concern). Fixing them is OUT OF SCOPE for this SD; they do not affect FR-3\'s correctness once the watcher routes through the two NEW writer modules instead. This SD\'s OWN forensic-preservation equivalent is built directly into the new writers: owner-directive-writer.mjs\'s writeOwnerDirective is idempotent per process_key (never overwrites an existing unresolved row), and chairman-awareness-writer.mjs\'s writeChairmanAwareness MERGES new process keys into the existing day\'s row rather than overwriting, explicitly preserving brief_data.minted_context from the original mint.',
      priority: 'HIGH',
      acceptance_criteria: [
        'Given an owner-directive row exists for a process that returns to OK on a subsequent tick, when the watcher processes that tick, then resolveOwnerDirective stamps payload.ladder_resolved_at within one watcher tick of recovery, with no manual disposition.',
        'Given a chairman-awareness row exists for a process that returns to OK, when the watcher processes that tick, then the awareness writer\'s resolve path stamps brief_data.ladder_resolved_at for that specific process_key within one tick, without needing a human to approve/reject anything (the row is already status=approved at mint).',
        'Given a chairman-awareness row refreshed 3+ times across days with different process sets each time, when any forensic read inspects it, then the original mint-time process_keys are still recoverable from brief_data.minted_context, not overwritten by the latest day\'s set (already implemented in chairman-awareness-writer.mjs\'s writeChairmanAwareness).',
      ],
    },
    {
      id: 'FR-4',
      requirement: 'Correct the declared-vs-designed cadence for okr-day28-hardstop (and the class of misdeclaration)',
      description: 'periodic_process_registry row scheduler_round:okr-day28-hardstop declares expected_interval_seconds=86400 (daily), disagreeing with lib/eva/eva-master-scheduler.js:1054\'s own registration of cadenceDays:30 (2592000s) for the same job -- confirmed via direct read that lib/eva/jobs/okr-day28-hardstop.js:35 (isDay28OrLater: date.getUTCDate()>=28) only fires the job from day 28 onward, so a daily-cadence declaration reads OVERDUE every day it is not the very end of the month. This exact row is already interim-mitigated by the coordinator (currently_expected_active=false, last_state=INTENTIONALLY_DOWN) so it is not an active fire risk today, but the declared cadence itself is still wrong and must be corrected: set expected_interval_seconds=2592000 and restore currently_expected_active=true. TESTING-agent found stage_health and portfolio_review are BOTH also genuinely misdeclared at 86400 (declaring cadence:\'monthly\' and cadence:\'weekly\' respectively in eva-master-scheduler.js, both currently INTENTIONALLY_DOWN) -- correct both, not just okr-day28-hardstop. The generic CI predicate is NOT a single `expected_interval_seconds === cadenceDays*86400` equality: eva-master-scheduler.js has TWO separate job-registration APIs -- `registerJob({cadenceDays: <number>})`, used by only 4 okr-* jobs, and `registerRound({cadence: \'weekly\'|\'monthly\'|...})`, a STRING cadence used by the other 14 of 18 live scheduler_round rows (including stage_health and portfolio_review). The predicate must map BOTH shapes to seconds (registerJob: cadenceDays*86400; registerRound: a fixed weekly=604800/monthly=2592000/etc. lookup table matching the string values actually used in eva-master-scheduler.js) before comparing to expected_interval_seconds, or it will read UNSATISFIABLE/undefined for 14 of the 18 rows it must cover.',
      priority: 'HIGH',
      acceptance_criteria: [
        'okr-day28-hardstop\'s periodic_process_registry row has expected_interval_seconds=2592000 and currently_expected_active=true after this FR ships.',
        'stage_health\'s row (declares cadence:monthly in eva-master-scheduler.js) is corrected to expected_interval_seconds=2592000, currently_expected_active=true.',
        'portfolio_review\'s row (declares cadence:weekly in eva-master-scheduler.js) is corrected to expected_interval_seconds=604800, currently_expected_active=true.',
        'A new CI-checkable predicate handles both eva-master-scheduler.js registration shapes (registerJob\'s numeric cadenceDays AND registerRound\'s string cadence, mapped to seconds via a fixed lookup) and asserts expected_interval_seconds matches the derived seconds for every scheduler_round:* row (all 18 live rows, not just the 4 okr-* rows); run against current production data it is GREEN for all 18 rows including the 3 corrected ones.',
      ],
    },
    {
      id: 'FR-5',
      requirement: 'Preventive exit predicates in CI (ratification 49656c8c)',
      description: 'Five fixture-backed CI predicates, mirroring the pattern established in SD-LEO-INFRA-CLAIM-GUARD-BRANCH-DERIVED-001\'s FR-5: (a) a fixture with an OVERDUE coordinator-owned row past LADDER_THRESHOLD asserts a session_coordination directive to the coordinator AND zero chairman_decisions inserts AND zero escalateChairmanDecision calls. (b) a fixture with a dead/unresolvable owner asserts exactly one non-blocking (blocking:false) chairman awareness row. (c) a live-data count of chairman_decisions rows with brief_data.recorded_via=\'ladder-escalation\' whose process owner was a LIVE role seat at creation time, asserted at ZERO from the merge commit forward (reports INSUFFICIENT_DATA rather than a false PASS at zero denominator, matching the FR-5a precedent in the CLAIM-GUARD SD). (d) FR-4\'s scheduler_round cadence-parity check (both eva-master-scheduler.js registration shapes), asserted GREEN. (e) NEW, per testing-agent finding: a POSITIVE live predicate -- count of session_coordination rows with the registered owner-directive kind since the merge commit -- asserted NON-ZERO once real fleet traffic has landed, so the suite is not negative-only and cannot pass merely because the new writer path was never exercised.',
      priority: 'HIGH',
      acceptance_criteria: [
        'CORRECTED DURING EXEC: (a)/(b) are pure-function decision fixtures over decideLadderRoute -- since control-seed-test-lint.mjs only scans scripts/lint/** and scripts/audit/** (verified via direct read of its SPEC_PATH/scan-dir constants), and this SD\'s (a)/(b) scenarios are plain unit-testable pure-function inputs (not a source-text-scanning lint), they are satisfied directly by tests/unit/periodic-liveness/ladder-escalation.test.js\'s decideLadderRoute describe block (already covers: live coordinator-owned row -> owner_directive; dead/unresolvable owner -> chairman_awareness) -- no separate scripts/ci fixture or control-seed-specs.json registration is needed or would avoid duplicating the same assertion twice.',
        'scripts/ci/chairman-awareness-live-owner-count.mjs (c) queries chairman_decisions for brief_data.recorded_via=\'ladder-escalation-advisory\' rows since a given --since timestamp, asserts every row\'s brief_data.reason is dead_owner or chairman_owned (the only two reasons decideLadderRoute can ever produce for this path), and reports PASS/FAIL/INSUFFICIENT_DATA (never a bare PASS at zero denominator).',
        'scripts/ci/scheduler-round-cadence-parity.mjs (d) handles both registerJob/cadenceDays and registerRound/cadence-string shapes (via a brace-balanced source parse, not a non-greedy regex that truncates at a nested handler function\'s own closing brace) and is GREEN against all 18 live scheduler_round rows (verified: PASS, 17 covered + 1 self-heartbeat row correctly excluded + 1 unmapped \'frequent\' cadence correctly flagged advisory rather than silently passed).',
        'scripts/ci/owner-directive-positive-count.mjs (e) counts session_coordination rows carrying the registered owner-directive kind since the merge commit and reports INSUFFICIENT_DATA at zero (not a false PASS), distinguishing "the writer has never fired" from "the writer correctly fires zero times for zero-eligible rows".',
      ],
    },
    {
      id: 'FR-6',
      requirement: 'Backfill disposition notes on historical ladder-raised rows',
      description: 'The six ladder rows since 2026-08-28 originally cited by the SD (27f1cdcf, c720180f, 33034701, 47baa32e, 0d449890, 0dd5f899) are, per validation-agent\'s direct live-query verification, all blocking=false and share brief_data.recorded_via=\'ladder-escalation\' (each refreshed at least once) -- they are NOT "the blocking-critical subset" as an earlier corrections pass on this SD asserted; that pass\'s own claim did not match a live re-query. The ONE row in the same window that is genuinely blocking=true (315ef490, 2026-09-02T00:28Z, decided_by=coordinator-cli) is absent from the six-row list. This FR adds a disposition note citing this SD to all SEVEN rows (the original six plus 315ef490), not six, since 315ef490 is the row that actually reached the chairman as a hard block and is the most important one to annotate. The already-pending row (0dd5f899) is rejected by Adam at mint as not-a-decision, matching the SD\'s original intent for that row.',
      priority: 'MEDIUM',
      acceptance_criteria: [
        'All seven rows (27f1cdcf, c720180f, 33034701, 47baa32e, 0d449890, 0dd5f899, 315ef490) carry a disposition note in brief_data or a dedicated disposition field citing SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001.',
        '0dd5f899 is explicitly rejected/dispositioned as not-a-decision.',
        'The disposition-note write is a canonical, auditable update (not a raw ad-hoc UPDATE bypassing fn_chairman_decide/approve_chairman_decision/reject_chairman_decision for any row whose status also changes) -- RCA found 3/35 historical rows already carry stale blocking=true specifically because manual disposals bypassed those functions\' blocking=false side effect; this FR\'s backfill writes must not add a fourth.',
      ],
    },
  ],
  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'FR-1\'s owner-gate lives at the watcher\'s ladderCandidates.push call site (scripts/periodic-liveness-watcher.mjs, near line 622-629), consulting the ownerTarget already computed by resolveOwnerTarget -- do not duplicate owner resolution inside ladder-escalation.mjs. climbLadder remains completely untouched (still owner-agnostic, still the sole source of the laddered/count decision). emitLadderDigest is also left BEHAVIORALLY UNCHANGED (see FR-2\'s corrected description) -- the watcher simply stops calling it for periodic-liveness candidates, routing them to the two new writer modules instead, so lib/coordination/lane-dead-letter-alarm.cjs\'s unrelated allow-listed use of emitLadderDigest is never touched.',
      rationale: 'climbLadder\'s laddered:true decision (based purely on the consecutive-miss counter) must stay separable from the owner-routing decision so existing ladder-threshold tests remain valid; only the CALLER\'s branching on ownerTarget/decideLadderRoute changes. emitLadderDigest is a shared, explicitly allow-listed cross-module surface (lane-dead-letter-alarm.cjs) discovered during EXEC -- modifying its behavior was the original (incorrect) plan and would have been an undetected cross-SD regression.',
    },
    {
      id: 'TR-2',
      requirement: 'The FR-2 chairman-owned raw-label check is applied to `String(row.owner ?? \'\').trim().toLowerCase()` matched against /^chairman(-fleet)?$/ (NOT the raw, un-normalized column, and not case/whitespace-sensitive), and is applied at the watcher/decideLadderRoute call site -- not to resolveOwnerTarget\'s return shape. resolveOwnerTarget\'s contract and KNOWN_PEERS set are explicitly OUT OF SCOPE (owned by SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-B) and must not be modified by this SD.',
      rationale: 'Changing owner-target-resolver.mjs\'s KNOWN_PEERS or return contract would touch a shared resolver other SDs/consumers depend on; a call-site-local, normalized raw-label check achieves the same distinguishing power without a breaking-change risk and without a trailing-space false-negative (security-agent finding C2).',
    },
    {
      id: 'TR-3',
      requirement: 'The new FR-1 ack-required directive payload shape generalizes lib/coordinator/adam-action-ack.cjs\'s action_required/action_kind (set at send)/actioned_at (set on genuine ack, distinct from read_at transport-only) convention to an arbitrary target_session rather than adam-hardcoded/coordinator-hardcoded routing, AND uses a payload.kind value that is registered in lib/fleet/worker-status.cjs\'s DIRECTIVE_KINDS closed allowlist (see FR-1) -- an unregistered kind is auto-read-and-dropped by scripts/hooks/coordination-inbox.cjs before any ack path exists, per testing-agent\'s direct-code-verified finding.',
      rationale: 'adam-action-ack.cjs is the only existing ack-required-directive precedent in the codebase; reusing its semantics keeps the fleet\'s directive-tracking machinery uniform, and DIRECTIVE_KINDS registration is load-bearing -- without it the entire FR-1 mechanism is dead by construction (100% of directives fall through unacked).',
    },
    {
      id: 'TR-4',
      requirement: 'The FR-2 non-blocking awareness writer is a NEW function in lib/periodic-liveness/ (not a call into lib/eva/chairman-decision-watcher.js\'s createAdvisoryNotification, which hard-returns null for venture_id=null) that inserts a chairman_decisions row with the FULL required shape: venture_id:null, lifecycle_stage:0, decision:\'advisory\', decision_type:\'advisory\', status:\'approved\', blocking:false, plus a summary using a distinct (non-DIGEST_PREFIX) prefix and brief_data. The insert error path MUST log loudly (not silently swallow) since a schema-shape mistake here (e.g. a missing NOT NULL column) must never reproduce the total-silence failure this FR exists to prevent.',
      rationale: 'All 35 live ladder rows have venture_id=null; the existing function would silently no-op for every one of them. security-agent found lifecycle_stage and decision_type are NOT NULL with no default and were missing from an earlier draft of this shape -- both are also consumer-facing security/routing invariants (lib/eva/stage-execution-worker.js, lib/eva/artifact-persistence-service.js discriminate on decision_type=advisory), not merely schema compliance.',
    },
    {
      id: 'TR-5',
      requirement: 'No schema/migration changes: periodic_process_registry.owner is already populated on all 246 live rows and chairman_decisions.blocking/decision_type/lifecycle_stage already exist as plain columns -- FR-1/FR-2 are resolver-and-writer-logic changes, not column additions. Confirmed via the DATABASE sub-agent\'s PASS verdict (0 migration files, no schema changes required) run during this SD\'s PRD creation.',
      rationale: 'Avoids unnecessary migration risk/review overhead for a routing-logic-only fix.',
    },
    {
      id: 'TR-6',
      requirement: 'A NEW exported pure function `decideLadderRoute({rawOwner, ownerTarget, climb})` in lib/periodic-liveness/ (returning `{route, target}`) is the single seam both the watcher and unit tests use for the FR-1/FR-2 routing decision -- the watcher\'s own tick loop (periodic-liveness-watcher.mjs:574-667) is unexported today, so without this seam TS-1/TS-2/TS-5/TS-6-style scenarios have no composite decision to call directly.',
      rationale: 'testing-agent (prospective review) found no story required extracting this decision, leaving 4 of 10 planned test scenarios with nothing to run against; matches this repo\'s established pure-decision/impure-resolution separation pattern (CLAUDE_EXEC.md "Testability-Aware Implementation").',
    },
  ],
  system_architecture: {
    overview:
      'The periodic-liveness watcher (scripts/periodic-liveness-watcher.mjs) evaluates periodic_process_registry rows each tick, climbs a 2-rung ladder (lib/periodic-liveness/ladder-escalation.mjs) for OVERDUE rows past threshold, and currently folds every laddered row into ONE per-tick chairman_decisions digest via emitLadderDigest regardless of the row\'s owner. This SD inserts an owner-routing branch between rung-1\'s existing resolveOwnerTarget call and rung-2\'s digest emission: a live-owner-resolved row is diverted to a new ack-required session_coordination directive (never reaching emitLadderDigest at all); only a dead-owner or chairman-owned row still reaches a chairman-facing row, now written via a new non-blocking, once-per-day awareness writer instead of the current blocking:true insert.',
    components: [
      { name: 'periodic-liveness-watcher.mjs (call site)', responsibility: 'Per-tick evaluation loop; new owner-gate branch decides whether a laddered row becomes an owner-directive or continues to emitLadderDigest', technology: 'Node.js ESM script' },
      { name: 'owner-target-resolver.mjs (unchanged)', responsibility: 'Resolves a registry row\'s owner label to a live peer session or a coordinator-fallback shape; consumed as-is, not modified', technology: 'Node.js ESM module' },
      { name: 'ladder-escalation.mjs (emitLadderDigest, emitCoordinatorRung)', responsibility: 'Rung-1 coordinator notice (unchanged) and rung-2 digest logic; modified to accept blocking:false + daily-throttle semantics for the dead-owner/chairman-owned path, and to preserve mint-time context on refresh', technology: 'Node.js ESM module' },
      { name: 'NEW: owner-directive writer', responsibility: 'Writes an ack-required session_coordination row to an arbitrary target_session, generalizing adam-action-ack.cjs\'s convention', technology: 'Node.js ESM module under lib/periodic-liveness/' },
      { name: 'NEW: non-blocking awareness writer', responsibility: 'Writes/refreshes a venture-less chairman_decisions row with decision:advisory, blocking:false, throttled to one per day', technology: 'Node.js ESM module under lib/periodic-liveness/' },
      { name: 'record-pending-decision.mjs (unchanged)', responsibility: 'shouldAutoEscalate/recordPendingDecision/escalateChairmanDecision -- consumed as-is; FR-2 stops passing blocking:true rather than modifying this module', technology: 'Node.js ESM module' },
    ],
    data_flow:
      'periodic_process_registry row -> watcher evaluation (OVERDUE + threshold) -> resolveOwnerTarget(owner) -> [live peer: new owner-directive session_coordination row, ack-tracked, timeout-escalates to dead-owner path after 3 ticks] OR [dead/unresolvable/chairman-owned: new non-blocking awareness chairman_decisions row, throttled to 1/day] -> on recovery, either path self-resolves via FR-3.',
    integration_points: [
      'session_coordination table (new directive rows, generalized ack convention)',
      'chairman_decisions table (existing table, new non-blocking write path replacing the current blocking:true path)',
      'periodic_process_registry table (FR-4 cadence corrections, read-only for FR-1/FR-2 routing)',
      'lib/eva/eva-master-scheduler.js (read-only, FR-4\'s cadence-parity source of truth)',
    ],
  },
  test_scenarios: [
    { id: 'TS-1', scenario: 'Coordinator-owned OVERDUE row routes to a directive, not the chairman', test_type: 'unit', given: 'decideLadderRoute called with rawOwner=coordinator-fleet, ownerTarget={live:true, target:<coordinatorId>}, climb={laddered:true, count:LADDER_THRESHOLD}', when: 'decideLadderRoute evaluates the inputs', then: 'Returns {route:owner_directive, target:<coordinatorId>}; the watcher then writes a session_coordination row with the registered DIRECTIVE_KINDS kind and zero chairman_decisions inserts occur; zero standout emails fire' },
    { id: 'TS-2', scenario: 'eva-scheduler-owned OVERDUE row routes via the coordinator EVA lane, not chairman', test_type: 'unit', given: 'decideLadderRoute called with rawOwner=eva-scheduler, ownerTarget={live:true, target:<coordinatorId>} (the existing resolveOwnerTarget fallback for this label)', when: 'decideLadderRoute evaluates the inputs', then: 'Returns {route:owner_directive, target:<coordinatorId>}, never chairman_awareness' },
    { id: 'TS-3', scenario: 'Dead/unresolvable owner escalates as one non-blocking awareness row', test_type: 'unit', given: 'decideLadderRoute called with ownerTarget.live!==true (resolveOwnerTarget could not resolve a live peer)', when: 'It evaluates', then: 'Returns route:chairman_awareness; the awareness writer inserts exactly one chairman_decisions row with the full shape (venture_id:null, lifecycle_stage:0, decision:advisory, decision_type:advisory, status:approved, blocking:false); zero standout emails fire (shouldAutoEscalate returns false)' },
    { id: 'TS-4', scenario: 'Chairman-owned row is distinguished from eva-scheduler despite both hitting the coordinator-fallback shape', test_type: 'unit', given: 'A registry row with raw owner="Chairman-Fleet " (mixed case, trailing space)', when: 'The normalized check String(row.owner).trim().toLowerCase() is matched against /^chairman(-fleet)?$/', then: 'It matches and decideLadderRoute returns route:chairman_awareness, not owner_directive, despite resolveOwnerTarget itself returning the identical {kind:coordinator, resolvedPeer:null} shape it would for eva-scheduler' },
    { id: 'TS-5', scenario: 'Two chairman_awareness-routed processes ladder the same day -> one row, not two', test_type: 'integration', given: 'Process A and Process B both route to chairman_awareness and both ladder on the same calendar day', when: 'Process B ladders after Process A already wrote today\'s awareness row', then: 'No second chairman_decisions row is inserted; the existing row is refreshed to include Process B, under a summary prefix distinct from DIGEST_PREFIX' },
    { id: 'TS-6', scenario: 'Recovery self-resolves without hand disposition', test_type: 'integration', given: 'A digest row (either an owner-directive session_coordination row or a chairman_decisions awareness row) exists for a currently-escalating process', when: 'The process returns to OK on a subsequent tick (resetConsecutiveMiss fires)', then: 'The corresponding row is marked resolved (brief_data.ladder_resolved_at timestamp written; chairman_decisions has no resolved_at column) within one tick, with brief_data.minted_context still showing the original mint-time process_keys/signatures unmodified' },
    { id: 'TS-7', scenario: 'Unacked owner directive times out to the dead-owner chairman path', test_type: 'unit', given: 'A registry row\'s climb.count has reached LADDER_THRESHOLD+3 (the atomic consecutive-miss counter, not a wall-clock or read_at-based timer) with no ack recorded on its owner-directive row', when: 'The watcher evaluates it on this tick', then: 'It routes to FR-2(a)\'s chairman_awareness path (treated as owner-not-responsive), not silently dropped, and climb.count has NOT been reset (proving the fallback did not require recovery to trigger)' },
    { id: 'TS-8', scenario: 'okr-day28-hardstop no longer reads OVERDUE by declaration', test_type: 'unit', given: 'okr-day28-hardstop\'s registry row corrected to expected_interval_seconds=2592000, currently_expected_active=true, on a day before the 28th', when: 'The watcher evaluates it', then: 'It reads OK or intentionally-inactive per its designed cadence, never OVERDUE purely from a daily-cadence misdeclaration' },
    { id: 'TS-9', scenario: 'FR-5(c) live count reports INSUFFICIENT_DATA at zero denominator, never a false PASS', test_type: 'unit', given: 'No enriched chairman_decisions rows exist yet since the merge commit timestamp', when: 'The FR-5(c) CI script runs', then: 'It reports status=INSUFFICIENT_DATA, not PASS' },
    { id: 'TS-10', scenario: 'FR-4 cadence-parity predicate is green against live production data across BOTH registration shapes', test_type: 'integration', given: 'All 18 live scheduler_round:* rows in periodic_process_registry -- 4 registered via eva-master-scheduler.js registerJob({cadenceDays}) and 14 via registerRound({cadence:<string>}), including the 3 corrected rows (okr-day28-hardstop, stage_health, portfolio_review)', when: 'The cadence-parity check runs (mapping registerJob\'s cadenceDays*86400 AND registerRound\'s string-cadence lookup to seconds before comparing)', then: 'expected_interval_seconds matches the derived seconds for all 18 rows, not just the 4 okr-* rows' },
    { id: 'TS-11', scenario: 'The registered owner-directive kind is genuinely ackable, closing the dead-by-construction risk', test_type: 'integration', given: 'A session_coordination row written with the new payload.kind registered in DIRECTIVE_KINDS, target_session=a live test session', when: 'scripts/worker-ack-directive.cjs is run against that row', then: 'It successfully stamps payload.actioned_at (not refused as an out-of-allowlist kind, and not silently auto-read-and-dropped by coordination-inbox.cjs before this point)' },
  ],
  acceptance_criteria: [
    'A late role-owned loop (coordinator-fleet, standard_loop, eva-scheduler, adam, solomon) never reaches the chairman_decisions table or the chairman\'s email -- verified via FR-5(c)\'s live-data count reading zero from the merge commit forward, and via TS-11 proving the directive kind is genuinely ackable (not dead by construction).',
    'The owning role seat receives and can ack the FR-1 directive using the registered DIRECTIVE_KINDS pathway; a directive left unacked past climb.count=LADDER_THRESHOLD+3 correctly falls through to the dead-owner chairman path rather than vanishing.',
    'A recovered laddered process resolves its own escalation row within one watcher tick, with no hand disposition and no loss of mint-time forensic data on refresh, and without accidentally poisoning findRecentlyDismissedSignatures\'s dismissal map for an unrelated process.',
    'No scheduler_round registry row is declared at a cadence its own eva-master-scheduler.js registration disagrees with (across BOTH registerJob and registerRound shapes), verified by a new CI-checkable parity predicate green against all 18 live rows.',
    'All seven historical ladder rows (the six originally cited plus 315ef490, the omitted genuinely-blocking row) carry a disposition note citing this SD.',
  ],
  risks: [
    {
      risk: 'CRITICAL, confirmed via direct code read (testing-agent): a session_coordination row with an unregistered payload.kind is auto-read-and-dropped by scripts/hooks/coordination-inbox.cjs before any ack path ever sees it, and scripts/worker-ack-directive.cjs/worker-ack-advisory.cjs hard-refuse to ack an out-of-allowlist kind. Without registering the new kind in lib/fleet/worker-status.cjs\'s DIRECTIVE_KINDS, FR-1\'s entire mechanism is dead by construction and 100% of directives silently fall through to the chairman path, defeating the SD\'s core purpose.',
      probability: 'HIGH (certain, if unmitigated)',
      impact: 'HIGH',
      mitigation: 'FR-1/TR-3 require registering the new kind in DIRECTIVE_KINDS as part of this SD, and TS-11 is a dedicated integration test proving a row of that kind is genuinely ackable via worker-ack-directive.cjs before this SD is considered complete.',
      rollback_plan: 'Revert the DIRECTIVE_KINDS registration and the owner-gate branch at the watcher call site together; every laddered row reverts to unconditionally reaching emitLadderDigest as before this SD.',
    },
    {
      risk: 'CRITICAL, confirmed via direct code read (security-agent): the FR-2 non-blocking awareness row, if minted under the same summary prefix as ladder digests (DIGEST_PREFIX, "Periodic-liveness ladder:"), is read by ladder-escalation.mjs\'s own findRecentlyDismissedSignatures as a standing dismissal (any non-pending row under that prefix with a fresh updated_at), permanently suppressing re-escalation of every process it names.',
      probability: 'HIGH (certain, if unmitigated)',
      impact: 'HIGH',
      mitigation: 'FR-2/TR-4 require the awareness writer to use a distinct, non-DIGEST_PREFIX summary, and FR-2\'s acceptance criteria include a dedicated unit test asserting minting an awareness row does not cause a subsequent, unrelated ladder digest for the same process to be suppressed.',
      rollback_plan: 'If suppression is observed in production, immediately rename the awareness row\'s summary prefix and re-run FR-3\'s resolution logic against any already-poisoned dismissal-map entries.',
    },
    {
      risk: 'An owner-directive sent to a role seat that is technically "live" per the fleet liveness discriminator but operationally stuck/unresponsive could silently swallow a real late-loop signal forever if no timeout fallback exists.',
      probability: 'MEDIUM',
      impact: 'HIGH',
      mitigation: 'FR-1b\'s acceptance criteria require the fallback to key off climb.count (the atomic consecutive-miss counter already maintained by climbLadder, reaching LADDER_THRESHOLD+3) rather than a wall-clock or read_at-based timer, since read_at is incompatible with a deliver-and-leave-unread directive design once TS-11\'s ack path is wired correctly.',
      rollback_plan: 'Revert the owner-gate branch at the watcher call site; every laddered row reverts to unconditionally reaching emitLadderDigest as before this SD (the pre-existing, if noisy, behavior).',
    },
    {
      risk: 'The chairman-owned raw-label check could miss a future owner-label spelling variant not yet seen live (only 3/246 registry rows are chairman-owned today), silently misrouting a chairman-owned process to the FR-1 directive path where it has no live inbox to receive it.',
      probability: 'LOW',
      impact: 'MEDIUM',
      mitigation: 'FR-5(c)\'s live-data count monitors for chairman_decisions rows whose owner resolved to a live role seat at creation -- an inverse miss (a chairman-owned row that WAS routed as a directive) would surface as a directive with no ack ever recorded, which the FR-1 timeout already escalates back to the chairman path, bounding the blast radius to one extra tick of delay.',
      rollback_plan: 'Widen the regex or add explicit registry-row owner values to a small allowlist if a new chairman-owned label spelling is observed.',
    },
    {
      risk: 'The FR-2 one-per-day throttle for the non-blocking awareness row could merge two operationally distinct dead-owner incidents into one row, making it harder to tell which specific process is still down from the digest alone.',
      probability: 'LOW',
      impact: 'LOW',
      mitigation: 'The refresh path already accumulates all currently-escalating process_keys into the row\'s context (existing emitLadderDigest behavior, extended per-day rather than per-tick); the awareness row remains a legitimate single point of chairman visibility, and FR-3\'s mint-time-context preservation ensures the full history of what triggered it is not lost even as it is appended to.',
      rollback_plan: 'Reduce the throttle window from 1/day to 1/tick (reverting to closer-to-current granularity) if the merged-incident awareness row proves too coarse in practice.',
    },
    {
      risk: 'Manually backfilling disposition notes on 7 historical chairman_decisions rows (FR-6) via an ad-hoc script could itself become a fourth instance of the raw-UPDATE-bypasses-fn_chairman_decide drift RCA found in 3/35 existing rows, if the backfill script updates status/blocking without going through the canonical closer functions.',
      probability: 'LOW',
      impact: 'LOW',
      mitigation: 'FR-6\'s acceptance criteria explicitly require the backfill write to be a disposition-note-only update (brief_data field), never a raw status/blocking mutation outside fn_chairman_decide/approve_chairman_decision/reject_chairman_decision.',
      rollback_plan: 'If a backfill row is found with drifted blocking/status, re-run it through the canonical closer function to correct the side effect.',
    },
  ],
  implementation_approach: {
    phases: [
      {
        phase: 'Phase 1: Owner-gate at the watcher call site (FR-1)',
        description: 'Add the live-owner-resolved branch at scripts/periodic-liveness-watcher.mjs\'s ladderCandidates.push call site, plus the new owner-directive writer under lib/periodic-liveness/ and its 3-tick ack-timeout fallback.',
        deliverables: ['owner-directive writer module', 'watcher call-site branch', 'ack-timeout fallback logic', 'unit + integration tests (TS-1, TS-2, TS-7)'],
      },
      {
        phase: 'Phase 2: Non-blocking chairman path (FR-2)',
        description: 'Add the chairman-owned raw-label check, the new non-blocking awareness writer, and the daily throttle; change ladder-escalation.mjs:267 to stop passing blocking:true.',
        deliverables: ['non-blocking awareness writer module', 'raw-label chairman check', 'daily throttle logic', 'unit + integration tests (TS-3, TS-4, TS-5)'],
      },
      {
        phase: 'Phase 3: Self-resolve + forensic-preservation fixes (FR-3)',
        description: 'Implement resolution on recovery for both new row types; fix the brief_data overwrite-on-refresh defect and the silent catch{} in findDismissedSignatures.',
        deliverables: ['resolution logic for both directive and awareness rows (resolveOwnerDirective, chairman-awareness-writer\'s resolve path)', 'test TS-6'],
      },
      {
        phase: 'Phase 4: Cadence correction (FR-4)',
        description: 'Correct okr-day28-hardstop\'s registry row, review stage_health/portfolio_review, add the generic scheduler_round cadence-parity predicate.',
        deliverables: ['corrected registry row(s)', 'cadence-parity CI predicate', 'test TS-8, TS-10'],
      },
      {
        phase: 'Phase 5: CI exit predicates + historical backfill (FR-5, FR-6)',
        description: 'Wire fixtures (a)/(b) into control-seed-specs.json, build the FR-5(c) live-count script (INSUFFICIENT_DATA-aware), fold FR-4\'s predicate in, and backfill disposition notes on the 7 historical rows.',
        deliverables: ['CI fixture scripts', 'FR-5(c) live-count script', 'backfill script (disposition-note-only, no raw status/blocking mutation)', 'test TS-9'],
      },
    ],
    technical_decisions: [
      'Keep climbLadder/LADDER_THRESHOLD owner-agnostic; put all owner-routing logic in the watcher call site and new writer modules, per TR-1 -- minimizes blast radius on existing ladder-threshold tests.',
      'Do not modify owner-target-resolver.mjs\'s KNOWN_PEERS or contract (TR-2) -- that module is explicitly owned by SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-B; a call-site-local raw-label check achieves FR-2(b)\'s distinguishing requirement without touching shared resolver code.',
      'Reuse adam-action-ack.cjs\'s ack-directive semantics (generalized) rather than inventing a new convention (TR-3), and reuse createAdvisoryNotification\'s ROW SHAPE (not its function, due to the venture/stage hard-guard) for the new non-blocking writer (TR-4).',
      'No schema/migration changes required (TR-5) -- confirmed by the DATABASE sub-agent\'s PASS verdict during PRD creation.',
    ],
  },
  integration_operationalization: {
    consumers: [
      { name: 'Coordinator seat', interaction: 'Receives and acks FR-1 owner-directive rows for coordinator-fleet/standard_loop/eva-scheduler-owned processes', frequency: 'Per laddered episode, up to several times/day under current volume (11 rows since 08-28)' },
      { name: 'Adam / Solomon seats', interaction: 'Receive and ack FR-1 owner-directive rows for adam/solomon-owned processes', frequency: 'Rare (1 adam-owned registry row today)' },
      { name: 'Chairman', interaction: 'Receives at most one non-blocking awareness chairman_decisions row per day, only for dead-owner or chairman-owned processes', frequency: 'Expected near-zero under current data (3 chairman-fleet rows, 0 currently-dead-owner rows observed)' },
    ],
    dependencies: [
      { name: 'owner-target-resolver.mjs (resolveOwnerTarget)', type: 'upstream', contract: 'Consumed read-only; not modified by this SD', failure_handling: 'A resolver error/timeout falls through to the existing coordinator-fallback shape (unchanged pre-existing behavior)' },
      { name: 'lib/chairman/record-pending-decision.mjs (recordPendingDecision, escalateChairmanDecision, shouldAutoEscalate)', type: 'downstream', contract: 'Consumed as-is; FR-2 changes the CALLER\'s blocking argument, not this module\'s logic', failure_handling: 'Existing fail-soft behavior in escalateChairmanDecision (any error swallowed, durable row unaffected) is unchanged' },
      { name: 'lib/eva/eva-master-scheduler.js (job cadenceDays registrations)', type: 'upstream', contract: 'Read-only source of truth for FR-4\'s cadence-parity predicate', failure_handling: 'If a job is unregistered/removed from the scheduler, the parity check should report the mismatch rather than silently passing' },
      { name: 'session_coordination table', type: 'downstream', contract: 'New ack-required directive rows written here (FR-1); existing table, existing ack-tracking conventions generalized from adam-action-ack.cjs', failure_handling: 'A write failure is fail-soft (logged, does not crash the watcher tick) matching the file\'s existing fail-soft philosophy' },
    ],
    data_contracts: [
      { contract_name: 'owner-directive session_coordination row', schema: 'payload.rung=owner_directive, payload.action_required=true, payload.action_kind, target_session=<resolved live peer session id>, payload.actioned_at (set on genuine ack)', validation: 'Generalized from lib/coordinator/adam-action-ack.cjs\'s existing shape', versioning: 'New payload.rung value; additive, no breaking change to session_coordination consumers' },
      { contract_name: 'non-blocking awareness chairman_decisions row', schema: 'decision:advisory, status:approved (pre-resolved), blocking:false, venture_id:null, brief_data.recorded_via=\'ladder-escalation-advisory\'', validation: 'Matches createAdvisoryNotification\'s row shape without its venture/stage guard', versioning: 'Additive; existing chairman_decisions consumers already filter on status=pending for actionable rows, so an advisory/approved row is inert to them by construction' },
    ],
    runtime_config: {
      environment_variables: [],
      feature_flags: [],
      deployment_considerations: 'No new env vars or feature flags; behavior change is unconditional once merged (matches this SD\'s FR-5 CI-predicate-as-the-safety-net approach rather than a flag-gated rollout, consistent with the ratification 49656c8c pattern already used for the sibling CLAIM-GUARD SD).',
    },
    observability_rollout: {
      monitoring: ['FR-5(c) live-count script (chairman_decisions rows with a live-owner-at-creation, asserted zero)', 'FR-4 cadence-parity predicate (scheduler_round rows vs eva-master-scheduler.js registrations)'],
      alerts: ['A non-zero FR-5(c) count post-merge indicates the owner-gate regressed', 'A cadence-parity mismatch indicates a new scheduler_round misdeclaration'],
      rollout_strategy: 'Direct merge to main, no phased rollout (infrastructure fix, small diff, ratification 49656c8c requires the zero-asserting count ship in the SAME PR)',
      rollback_trigger: 'FR-5(c) count goes non-zero, or a role seat reports never receiving an owner-directive for a process it clearly owns',
      rollback_procedure: 'Revert the watcher call-site owner-gate branch; ladder rows resume reaching emitLadderDigest unconditionally (the pre-existing, if noisy, behavior) while a fix is prepared',
    },
  },
  exploration_summary: {
    files_read: [
      'lib/periodic-liveness/ladder-escalation.mjs',
      'lib/periodic-liveness/owner-target-resolver.mjs',
      'lib/chairman/record-pending-decision.mjs',
      'scripts/periodic-liveness-watcher.mjs',
      'lib/eva/eva-master-scheduler.js',
      'lib/eva/jobs/okr-day28-hardstop.js',
      'lib/eva/chairman-decision-watcher.js',
      'lib/coordinator/adam-action-ack.cjs',
    ],
    patterns_identified: [
      'Pure-decision/impure-resolution separation (climbLadder\'s owner-agnostic threshold logic vs. the watcher call site\'s owner-aware branching)',
      'Ack-required directive convention (adam-action-ack.cjs\'s action_required/action_kind/actioned_at)',
      'Advisory/non-blocking chairman_decisions row shape (createAdvisoryNotification, reused as a shape not a function)',
      'CI fixture + control-seed-specs.json exit-predicate pattern (established by SD-LEO-INFRA-CLAIM-GUARD-BRANCH-DERIVED-001\'s FR-5)',
    ],
    key_decisions: [
      'FR-2\'s real fix targets ladder-escalation.mjs:267 (the blocking:true literal), not line 259\'s refresh-branch escalate() call, which RCA confirmed is dedup-neutered and not the flood source.',
      'The chairman-owned vs eva-scheduler distinction requires a NEW raw-label check at the call site rather than a change to owner-target-resolver.mjs, to avoid touching a resolver owned by a different in-flight SD.',
      'The non-blocking awareness writer must be a NEW module, not a direct call to createAdvisoryNotification, because that function null-guards on venture_id which is null for all 35 live ladder rows.',
      'FR-6\'s backfill list is corrected from 6 to 7 rows (adding 315ef490, the omitted genuinely-blocking row) based on a live-query correction of an earlier Step-0 corrections pass\'s own claim.',
      'An explicit 3-tick ack-timeout on FR-1\'s directive, falling through to FR-2(a)\'s dead-owner path, closes a safety-net gap not present in the SD\'s original text (a role seat that never acks must not silently swallow a real signal).',
    ],
    exploration_date: new Date().toISOString().slice(0, 10),
  },
};

async function main() {
  const { data, error } = await supabase.from('product_requirements_v2').upsert(prd, { onConflict: 'id' }).select('id');
  if (error) { console.error('PRD INSERT FAILED:', error.message); process.exitCode = 1; return; }
  console.log('PRD inserted:', data?.[0]?.id, 'for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main();
}
