// SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001 — SECURITY sub-agent evidence writer (EXEC phase).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
// Adversarial COMMUNICATION-INTEGRITY threat model of the promotion-ack change on
// branch feat/SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001, PR #6786.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = '1182898f-1725-4b46-8a14-ed171d7685aa';
const SD_KEY = 'SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001';
const PHASE = 'EXEC';
const CODE = 'SECURITY';

const results = {
  verdict: 'FAIL',
  confidence: 92,
  validation_mode: 'prospective',
  execution_time_ms: 0,
  summary:
    'The CORE control is sound and correctly aimed: stampRouted() no longer stamps acknowledged_at, the ' +
    'non-disposing default is the right failure direction, and the two guarded sweeps (stale-session-sweep ' +
    'STUCK-drain, convergeAckTTL) are genuinely guarded. Verified by EXECUTION against the live database, not ' +
    'by reading: the PostgREST guard predicate .is(`payload->>promotion_ack`, null) applies cleanly (guarded ' +
    'count 4779 == baseline 4779, inverse 0, no error), and the guards fail CLOSED (a select failure returns ' +
    '{converged:0,error} / catches to [] — the row is KEPT, never drained). No new exposure of signal bodies. ' +
    'BUT THE PR CANNOT MERGE AS-IS, on two independently blocking findings. (1) It BREAKS 4 EXISTING TESTS: ' +
    'tests/unit/retention/session-coordination-ack-convergence.test.js is 5/5 PASS on origin/main and 1/5 PASS ' +
    'on HEAD — the new second .is() is not present on the suite\'s mock query builder, so convergeAckTTL now ' +
    'returns "select failed: ....is is not a function". Scoped by running 304 files: exactly this one file, ' +
    'exactly these 4 tests, 3618 other tests green. Ironically this red suite is what PROVES the fail-closed ' +
    'direction, and the PR\'s own guard test stays GREEN through it because that test asserts the guard by ' +
    'GREPPING THE SOURCE STRING (toMatch(/\\.is\\(`payload->>\\${PROMOTION_ACK_KEY}`, null\\)/)) rather than by ' +
    'executing convergeAckTTL — a source-text assertion cannot see a function whose runtime behaviour it just ' +
    'broke. (2) THE ENUMERATION OF ACK-WRITERS IS INCOMPLETE AND THE CODE ASSERTS OTHERWISE. promotion-ack.cjs ' +
    'states "TWO such writers were found and guarded". A THIRD exists: scripts/drain-dead-letter-coordination.mjs ' +
    '(+ lib/coordination/dead-letter-drain.js), which selects on the same bare .is(\'acknowledged_at\', null), ' +
    'filters to rows whose target_session is not live, and writes acknowledged_at AND read_at. I ran its real ' +
    'classifier against the 9 real swallowed rows: ALL NINE classify action=\'stamp\', reason "noise kind INFO ' +
    'to a non-live session -> drained". That path is strictly WORSE than the two that were guarded, because it ' +
    'also sets read_at — which defeats the new isRouterSwallowed predicate (it requires !read_at), leaves no ' +
    'auto_acked marker so isGenuinelyAcknowledged() reads it as a HUMAN answer and the starvation gauge goes ' +
    'silent, and makes the row immediately reapable by cleanup_expired_coordination. It is also NEWLY REACHABLE ' +
    'BECAUSE OF THIS FIX: pre-fix promoted rows carried acknowledged_at and never entered that selector at all. ' +
    'Reachability is not hypothetical — 221 of the 227 in-window unacked signals already target a non-live ' +
    'session, so coordinator rotation before disposition is the NORM. Mitigating: the script is manual (--apply, ' +
    'no scheduler found) and has never been applied (0 rows carry payload.dead_letter_drained). The SD\'s own ' +
    'FR-8 rationale — "guarding one and not the other would have left the fix self-reverting on a longer fuse" ' +
    '— applies verbatim to this third sibling. Both blockers are cheap: fix the mock, guard the third writer (or ' +
    'at minimum correct the false completeness claim in the header and file the guard as a tracked follow-up). ' +
    'Separately and NOT introduced by this diff, one CRITICAL pre-existing platform finding on the exact table ' +
    'this SD designates as the communication-integrity substrate: role `authenticated` holds a TRUNCATE grant on ' +
    'session_coordination, and RLS DOES NOT GATE TRUNCATE — proven with a positive control on a scratch table ' +
    'built to mirror the live policy/grant posture exactly (UPDATE blocked 0-rows by RLS, TRUNCATE SUCCEEDED, ' +
    'all inside a rolled-back transaction; real table untouched at 5214 rows). Any holder of a user JWT can ' +
    'destroy the entire coordination bus, bypassing the archive-before-delete design entirely.',
  findings: [
    {
      id: 'S0-BLOCKING-four-tests-broken-by-this-pr',
      severity: 'critical',
      note: 'tests/unit/retention/session-coordination-ack-convergence.test.js: origin/main = 5 passed / 5. ' +
        'HEAD = 4 FAILED / 1 passed. Established two-sided by checking out ONLY origin/main:lib/retention/' +
        'session-coordination-ack-convergence.js into the worktree, re-running (5/5 green), then restoring HEAD ' +
        '(4/5 red) — so the cause is this file\'s change, not a pre-existing flake or an unrelated main drift. ' +
        'Error: "select failed: supabase.from(...).select(...).is(...).lte(...).is is not a function" — the ' +
        'suite\'s mockSupabase builder exposes .is() once, and convergeAckTTL now calls .is() twice ' +
        '(acknowledged_at, then payload->>promotion_ack). Blast radius scoped by running 304 test files across ' +
        'tests/unit/coordinator, tests/unit/retention, tests/unit/fleet, tests/unit/coordination and ' +
        'lib/coordinator: 4 failed | 3618 passed | 1 skipped — exactly this one file. ' +
        'SECOND-ORDER FINDING, which is the more important half: the PR\'s OWN guard test ' +
        '(tests/unit/coordinator/promotion-ack-guards.test.js) is GREEN across this breakage, because it ' +
        'asserts the guard by reading the source file and regex-matching the filter string, never by calling ' +
        'convergeAckTTL. A test that greps for a line cannot observe that the function containing that line now ' +
        'returns an error on every invocation. The guard is currently proven only in the sense that the ' +
        'characters are present in the file.',
      recommendation: 'Add the missing .is() to the mock query builder in session-coordination-ack-convergence.' +
        'test.js and re-run (target 5/5). Then add ONE EXECUTING guard assertion to promotion-ack-guards.test.js ' +
        '— call convergeAckTTL against a mock returning both a promotion-marked and an unmarked candidate and ' +
        'assert the marked row is NOT in `updates` — so the guard is proven by behaviour and not only by grep.'
    },
    {
      id: 'S1-BLOCKING-third-unguarded-ack-writer-and-a-false-completeness-claim',
      severity: 'critical',
      note: 'S1 (enumerate EVERY path that can set acknowledged_at or otherwise retire a signal). I enumerated ' +
        'all 24 non-test, non-archive sites that assign acknowledged_at on session_coordination and classified ' +
        'each by whether a promoted worker friction signal (message_type=INFO, payload.signal_type set, ' +
        'target=a coordinator session) can enter its selector. THIRD UNGUARDED PATH FOUND: ' +
        'scripts/drain-dead-letter-coordination.mjs L37 selects `.is(\'acknowledged_at\', null)` across the whole ' +
        'table, filters to rows whose target_session is absent-or-not-live, and at L64 writes ' +
        '`{acknowledged_at: now, read_at: now, payload:{...,dead_letter_drained}}`. VERIFIED BY EXECUTION, not by ' +
        'reading: I imported the real lib/coordination/dead-letter-drain.js classifyDeadLetterRow() and ran it ' +
        'over the 9 real swallowed rows fetched from the live DB — all 9 returned {action:\'stamp\', reason:' +
        '"noise kind INFO to a non-live session -> drained"}. They classify as noise because kind resolves to ' +
        '`payload.kind || message_type` = "INFO" (worker signals carry no payload.kind — confirmed, kind=(none) ' +
        'on all 9) and "INFO" is not in HIGH_VALUE_KINDS, and resolveTargetRole finds no "-> COORD" arrow in the ' +
        '[WORKER_SIGNAL:*] subject convention. WHY THIS PATH IS WORSE THAN THE TWO THAT WERE GUARDED: it stamps ' +
        'read_at as well as acknowledged_at, so (a) the row leaves the coordinator inbox AND the sender\'s ' +
        'outstanding view (both gate on acknowledged_at IS NULL), (b) it carries NO auto_acked marker, so ' +
        'isGenuinelyAcknowledged() in detectors.cjs counts it as a genuine human answer and REPLY_STARVATION goes ' +
        'silent, (c) the new isRouterSwallowed() cannot see it because that predicate requires !read_at, and (d) ' +
        'acknowledged_at IS NOT NULL makes it immediately eligible for cleanup_expired_coordination (all 9 rows ' +
        'carry expires_at = created + 24h, all already past by the time any drain would plausibly run). NEWLY ' +
        'REACHABLE BECAUSE OF THIS FIX: pre-fix, promoted rows had acknowledged_at set and could never enter that ' +
        'selector. REACHABILITY IS THE NORM, NOT AN EDGE CASE: measured live, 221 of the 227 in-window unacked ' +
        'signals target a session that is not in the live set, i.e. coordinator rotation before disposition is ' +
        'the default outcome. MITIGATING: the script is manual (--apply; grep across json/js/cjs/mjs/yml/yaml/md ' +
        'found no scheduler, cron or sweep reference) and has demonstrably never been applied with markers ' +
        '(0 rows carry payload.dead_letter_drained, 0 carry payload.dead_letter_retargeted). THE FALSE CLAIM IS ' +
        'THE BLOCKING PART: lib/coordinator/promotion-ack.cjs states "TWO such writers were found and guarded... ' +
        'the second was found only because a reviewer enumerated the writers instead of trusting that the first ' +
        'was the only one." That sentence asserts a completeness the enumeration did not achieve, and it is ' +
        'exactly the sentence a future maintainer will trust instead of re-enumerating. ' +
        'PATHS CHECKED AND CLEARED (so the enumeration is auditable rather than assertive): ' +
        'lib/sweep/passes/dead-letter-planning.cjs (automatic, in-sweep, selects ack NULL + read NULL — but ' +
        'planDeadLetters writes read_at + dead_letter, NEVER acknowledged_at, so it does not ack; it does hide ' +
        'the row from unread selectors and start a 7-day cleanup fuse, noted separately as S2b); ' +
        'lib/fleet/orphan-reroute-sweep.js (retargets, never acks — improves delivery); ' +
        'scripts/adam-advisory.cjs + scripts/solomon-advisory.cjs ackRows (explicit id list + ownership-scoped to ' +
        'their own target_session); scripts/worker-ack-directive.cjs (single id, refuses non-DIRECTIVE_KIND, ' +
        'refuses target mismatch); scripts/worker-checkin.cjs (worker\'s OWN inbox, target=worker, never a ' +
        'coordinator-targeted signal); scripts/fleet-coaching.cjs (single replyToSignalId, and it genuinely ' +
        'sends a reply); lib/coordinator/relay-queue.cjs (ack-as-claim on relay rows, id-scoped, unclaims on ' +
        'send failure); lib/fleet/canary-session.js (pre-stamps its own INSERT); scripts/coordinator-ack-signal.cjs ' +
        '(the legitimate human disposition path); scripts/hooks/coordination-inbox.cjs (L156 explicitly SKIPS ' +
        'rows carrying payload.signal_type — friction signals are deferred to the dashboard, never acked here); ' +
        'scripts/fleet-dashboard.cjs printInbox (stamps read_at on render, NEVER acknowledged_at — verified at ' +
        'L1481-1487); lib/coordinator/signal-router.cjs stampRoutedToCoordinator (unreachable, and the disclosure ' +
        'is accurate — confirmed 0 rows have ever carried payload.routed_to_coordinator).',
      recommendation: 'Add the same `.is(`payload->>${PROMOTION_ACK_KEY}`, null)` guard to the candidate select ' +
        'in scripts/drain-dead-letter-coordination.mjs (L37), OR — better, because it fixes the class rather than ' +
        'the instance — teach classifyDeadLetterRow() that a row carrying payload.signal_type is never "noise ' +
        'kind INFO"; a friction signal orphaned to a dead coordinator is the canonical RETARGET case, not the ' +
        'drain case. Minimum acceptable to merge: correct the "TWO such writers were found and guarded" sentence ' +
        'in promotion-ack.cjs to name the third and state that it is unguarded and why, and file the guard as a ' +
        'tracked completion flag. Shipping a header that overstates the enumeration is how the next maintainer ' +
        'inherits a false floor.'
    },
    {
      id: 'S2a-retention-net-improvement-but-the-nine-victims-are-not-backfilled',
      severity: 'high',
      note: 'S2 (does any retention/TTL path now DELETE or archive differently?). NET DIRECTION IS AN ' +
        'IMPROVEMENT, established from the LIVE function body (pg_get_functiondef, not the migration file): ' +
        'cleanup_expired_coordination() reaps `expires_at < now() AND (acknowledged_at IS NOT NULL OR (read_at ' +
        'IS NOT NULL AND read_at <= now() - 7 days))`. Pre-fix a promoted signal was acked instantly and ' +
        'therefore archived+deleted at expires_at; post-fix acknowledged_at stays NULL so it is NOT reaped. The ' +
        'fix strictly EXTENDS retention of the signals it protects. The convergeAckTTL exposure the SD ' +
        'identifies is real and correctly guarded (14-day TTL ack -> immediate cleanup eligibility). ' +
        'THE GAP: the fix is forward-only and ships no backfill. All 9 measured victims are live RIGHT NOW with ' +
        'acknowledged_at SET, read_at NULL, and expires_at = created + 24h — every one of them falls due on ' +
        '2026-08-04 (00:52Z through 19:49Z). At the next cleanup tick past each row\'s expires_at they are ' +
        'archived to retention_archive and DELETED from session_coordination. Their subjects are the reason this ' +
        'matters: "LIVE DATA-LOSS EXPOSURE, LARGER THAN THE INCIDENT", "DO NOT FF THE ROOT YET", "STOP — the ' +
        'QF-450 PROPOSED migration is now DESTRUCTIVE", "I SHIPPED A GATE THAT WILL SILENTLY DISCARD 35 CRITICAL ' +
        'IT[EMS]" — all severity=critical, all read_at NULL, i.e. never rendered to anyone. All 9 currently ' +
        'target a LIVE session, so a backfill would put them straight into the coordinator inbox where the fix ' +
        'intends them to be. The SD\'s own evidence population is on a <24h fuse.',
      recommendation: 'Ship a one-off backfill alongside the fix: for the 9 rows matching (payload->>' +
        'routed_to_feedback_id IS NOT NULL AND acknowledged_at IS NOT NULL AND read_at IS NULL), set ' +
        'acknowledged_at = NULL and merge payload.promotion_ack = true + promotion_ack_source. Without it the ' +
        'fix rescues future signals while the nine it was written for are deleted, and the "before" state ' +
        'survives only inside retention_archive where no operational surface reads it.'
    },
    {
      id: 'S2b-unbounded-growth-and-the-surfaces-that-hide-the-oldest',
      severity: 'high',
      note: 'S2 (does the inbox grow unboundedly; is there a display cap that pushes older unread signals out ' +
        'of view?). YES to growth, and the truncation question has a more serious answer than the cap. LIVE ' +
        'COUNTS (COUNT head:true, never fetch-to-count): 5214 session_coordination rows total; 438 carry ' +
        'payload.signal_type; 247 of those are acknowledged_at IS NULL. Promotion no longer retires any of them ' +
        'and the ONLY disposition path is scripts/coordinator-ack-signal.cjs, a manual one-id-at-a-time CLI — so ' +
        'the queue is now monotonically increasing with no drain, and the SD ships no bulk-disposition verb to ' +
        'match. THREE SEPARATE HIDERS in scripts/fleet-dashboard.cjs printInbox (L1402-1410), in increasing order ' +
        'of harm: (i) `.limit(20)` with `.order(created_at, ascending:false)` shows the NEWEST 20 and pushes the ' +
        'oldest below the fold — but this is DISCLOSED, the code deliberately re-queries the true set with ' +
        'fetchAllPaginated and prints "N unread signal(s) (showing newest 20)", so it is visible truncation and I ' +
        'do not treat it as the harm. Worth noting for consistency: the sibling module lib/fleet/outstanding-' +
        'signals.cjs states in its header that "The cap must drop the NEWEST rows" and orders ascending — the ' +
        'sender side and the coordinator side cap in OPPOSITE directions. (ii) `.gte(\'created_at\', now-7d)` — a ' +
        'signal older than seven days silently leaves the inbox AND leaves trueCount, while remaining unacked and ' +
        'undeleted. Measured: 20 unacked signals are already past that window and are invisible with no marker, ' +
        'no alarm and no state change. Post-fix, promoted signals live past 7 days by design, so this window is ' +
        'now the default terminus for them. (iii) `.eq(\'target_session\', coordinatorId)` — the inbox is scoped ' +
        'to the CURRENT coordinator session id, so a signal addressed to a previous coordinator never appears for ' +
        'the successor. Measured: only 6 of the 227 in-window unacked signals target a live session; 221 are ' +
        'orphaned. orphan-reroute-sweep.js would retarget them but gates on read_at IS NULL, and printInbox ' +
        'stamps read_at on render — so a signal that was rendered once and never acked can never be rerouted. ' +
        'Net: the fix correctly stops the router from retiring signals, but the surface it hands them to cannot ' +
        'hold them — (ii) and (iii) are pre-existing and out of this SD\'s diff, yet they are what determines ' +
        'whether the fix delivers its intended outcome.',
      recommendation: 'Out of scope to fix here, in scope to STATE. Add a bulk/queue disposition path for the ' +
        'coordinator (the growth this SD creates has no drain), and file the printInbox 7-day window and the ' +
        'target_session=coordinatorId scoping as follow-ups — a promoted signal that survives the router only to ' +
        'age out of the render window in 7 days, or to be orphaned by the next coordinator rotation, has been ' +
        'retired by a different door.'
    },
    {
      id: 'S3-marker-write-surface-equals-the-service-role-key',
      severity: 'medium',
      note: 'S3 (can an untrusted or lower-privileged writer SET payload.promotion_ack to make a row ' +
        'permanently undrainable?). Established by EXECUTING as each role over the pooler inside a transaction ' +
        'that was ROLLED BACK (verified after: probe row untainted, 0 rows carrying the probe key, real table ' +
        'unchanged at 5214 rows). LIVE POSTURE, read from pg_policy/pg_class rather than the migration file: RLS ' +
        'IS ENABLED and there is exactly ONE policy, `service_role_full_access`, polcmd=\'r\' (SELECT ONLY), ' +
        'polroles=PUBLIC, using=true, withcheck=NULL. RESULTS — anon: SELECT succeeds (5214 rows, bodies ' +
        'readable), UPDATE denied 42501 at the GRANT layer, so anon CANNOT set the marker. authenticated: SELECT ' +
        'succeeds, UPDATE returns 0 ROWS (RLS, since no permissive UPDATE policy exists), INSERT explicitly ' +
        'denied by RLS. service_role: UPDATE/INSERT/DELETE all succeed. CONCLUSION: NO untrusted or lower-' +
        'privileged writer can set promotion_ack today. But the block on `authenticated` rests ENTIRELY on RLS ' +
        'having no permissive write policy — the TABLE GRANTS for authenticated are wide open (INSERT, UPDATE, ' +
        'DELETE, TRUNCATE, SELECT). One `CREATE POLICY ... FOR ALL USING(true) WITH CHECK(true)` would ' +
        'instantly hand every user-JWT holder full write, and THAT EXACT STATEMENT IS STILL IN THE REPO at ' +
        'supabase/ehg_engineer/migrations/20260309_session_coordination.sql L67-71, with no TO clause (it would ' +
        'apply to PUBLIC). The live database has diverged to the safer SELECT-only form; the file has not. ' +
        'ON THE SD\'S "payload vs column" DECISION: within the fleet trust model the choice does not widen the ' +
        'write surface, because every worker/sweep/agent process runs with the SAME service-role key — a column ' +
        'would be writable by exactly the same set. The honest statement is that the marker\'s write surface IS ' +
        'the service-role key, so a buggy or misbehaving first-party process can make a row permanently ' +
        'undrainable. That denial-of-cleanup fails in the SAFE direction (rows accumulate; nothing is lost) and ' +
        'is bounded by the same growth already covered in S2b. No HTTP/API route writes session_coordination ' +
        'with caller-supplied payload (grep across server/route/api handlers: none).',
      recommendation: 'Not blocking for this PR. Correct the stale policy in ' +
        'supabase/ehg_engineer/migrations/20260309_session_coordination.sql to match the live SELECT-only, ' +
        'service-role-scoped posture (add TO service_role, drop FOR ALL) so a re-apply cannot silently open ' +
        'write access to every authenticated user, and revoke the unused INSERT/UPDATE/DELETE grants from ' +
        '`authenticated` so the control does not rest on RLS alone.'
    },
    {
      id: 'S3b-CRITICAL-authenticated-can-truncate-the-coordination-bus-rls-does-not-gate-truncate',
      severity: 'critical',
      note: 'PRE-EXISTING, NOT INTRODUCED BY THIS DIFF, and out of scope for this PR — but it lands on the exact ' +
        'table this SD designates as the communication-integrity substrate, so it belongs in this threat model. ' +
        'information_schema.role_table_grants shows `authenticated` holds TRUNCATE on session_coordination. ' +
        'Postgres RLS applies to SELECT/INSERT/UPDATE/DELETE and NOT to TRUNCATE. I did not test this on the ' +
        'real table (the cost of being wrong is destroying the fleet\'s comms bus). Instead I built a POSITIVE ' +
        'CONTROL: a scratch table mirroring the live posture exactly — RLS enabled, one SELECT-only PUBLIC ' +
        'policy USING(true), and the identical grant set to `authenticated` — then acted as `authenticated` on ' +
        'it. RESULT: UPDATE -> "BLOCKED (0 rows — RLS)", TRUNCATE -> SUCCEEDED, table emptied. Entire ' +
        'transaction rolled back; scratch table confirmed gone (to_regclass = null) and the real table confirmed ' +
        'unchanged at 5214 rows. So any holder of a Supabase user JWT can wipe the whole coordination lane in ' +
        'one statement, bypassing cleanup_expired_coordination\'s archive-before-delete design entirely — no ' +
        'retention_archive copy, no count-integrity check, nothing to revive. This is a strictly larger version ' +
        'of the harm this SD exists to prevent: the SD stops 9 signals being silently retired; this destroys all ' +
        '5214 rows with no archive.',
      recommendation: 'File as its own SD/QF, not on this PR. `REVOKE TRUNCATE, INSERT, UPDATE, DELETE ON ' +
        'session_coordination FROM authenticated;` (nothing in the codebase writes this table as anything but ' +
        'service_role — verified). Then sweep for the same pattern: a blanket TRUNCATE grant to `authenticated` ' +
        'is RLS-invisible on EVERY table that has it, so the fix is a grants audit, not one revoke.'
    },
    {
      id: 'S4-fails-closed-on-error-but-fails-OPEN-on-a-missing-or-renamed-key',
      severity: 'medium',
      note: 'S4 (if the filter errors or the key is absent/malformed, does the sweep drain the row or skip it?). ' +
        'Answered by reading the code paths AND by execution. ON ERROR: FAIL-CLOSED, which is the safe direction ' +
        'here — stale-session-sweep.cjs wraps the candidate read in try/catch and sets stuckSignals = [] (no ' +
        'drain, rows kept); convergeAckTTL catches and returns {converged:0, error} without updating anything. ' +
        'This is not a reading, it is observed behaviour: the 4 broken tests in finding S0 are literally the ' +
        'error case executing, and convergeAckTTL converged 0. ON A MISSING OR RENAMED KEY: FAIL-OPEN, and this ' +
        'is the sharper risk. `payload->>\'<absent key>\'` is SQL NULL, so `.is(<expr>, null)` MATCHES the row ' +
        'and the sweep drains it. Measured live: a probe filter on a deliberately nonexistent key ' +
        '(`payload->>zzz_no_such_key is null`) returned 5217 of ~5214 rows — i.e. a typo in the key name turns ' +
        'BOTH guards into silent no-ops with no error and no observable difference. Well mitigated by importing ' +
        'the shared PROMOTION_ACK_KEY constant at all three sites, and the guards test pins that the literal ' +
        'string form is NOT used — good design, worth keeping. SECOND, UNGUARDED ISSUE — THE SQL PREDICATE AND ' +
        'THE JS PREDICATE DISAGREE. isPromotionAcked() requires strictly `=== true`; the SQL guard excludes on ' +
        'ANY non-null extraction. Proven against live Postgres across six payload shapes: {"promotion_ack":false} ' +
        '-> ->> yields \'false\' -> SWEEP SKIPS (row kept) but isPromotionAcked() is false -> the detector treats ' +
        'the routed row as ANSWERED and REPLY_STARVATION stays SILENT. Same for "yes" and 0. So a row carrying ' +
        'promotion_ack:false is simultaneously permanently undrainable AND invisible to the alarm — the worst ' +
        'combination available, reachable by any service-role writer (see S3) and by a future refactor that ' +
        'writes the key as a tri-state. THIRD: stampRouted() issues its payload update with NO error check and ' +
        'no writeback verification (`await supabase...update(...).eq(\'id\', r.id);`, return value discarded). ' +
        'The entire protection now rides on that one unverified write, in a lane whose whole thesis is that a ' +
        'silent write failure is the harm — and the repo already ships lib/db/writeback-verify.mjs for exactly ' +
        'this.',
      recommendation: 'Make the two predicates agree: either have the SQL guard test `payload->>promotion_ack ' +
        'IS DISTINCT FROM \'true\'` (or .neq(...,\'true\')) so only the literal true is protected, or relax ' +
        'isPromotionAcked to "key present" — but not one of each. And check stampRouted\'s update error: ' +
        '`.select(\'id\')`, assert one row came back, log loudly on mismatch. A guard keyed on a marker whose ' +
        'write is never verified is a guard keyed on an assumption.'
    },
    {
      id: 'S5-promotion_ack_source-is-inert-provenance',
      severity: 'low',
      note: 'S5 (is promotion_ack_source trustworthy; does anything make a security decision on it?). NOTHING ' +
        'MAKES A SECURITY DECISION ON IT — so there is no impersonation risk, because there is nothing to ' +
        'impersonate INTO. Full-repo grep for promotion_ack_source / PROMOTION_ACK_SOURCE: written once in ' +
        'buildPromotionAckPayload, exported, and read in exactly one place — an assertion in ' +
        'lib/coordinator/signal-router.test.js. Zero production readers. The field\'s own docstring says it ' +
        'exists "so a later reader can tell WHICH automated writer set the marker", but BOTH sweep guards and ' +
        'both consumers (detectors.cjs, outstanding-signals.cjs) key on the bare `promotion_ack` boolean and ' +
        'never consult the source. So the trust decision is made on a value any service-role writer can set, ' +
        'while the field that would let a reader attribute it is written and discarded. This is the same shape ' +
        'the SD itself warns against in outstanding-signals.cjs ("a field nobody reads — the same shape as a ' +
        'marker written but never consumed"): the principle was applied to `routed` and not to ' +
        'promotion_ack_source. Low severity precisely because nothing depends on it — but it means the ' +
        'provenance claim in the header is aspirational, not enforced.',
      recommendation: 'Either key the two sweep guards on `payload->>promotion_ack_source = ' +
        '\'signal_router_promotion\'` (which makes the provenance load-bearing and narrows the guard to rows the ' +
        'router actually filed), or delete the field and drop the provenance sentence. Writing a provenance ' +
        'field that no reader consults is indistinguishable from not having one.'
    },
    {
      id: 'S6-no-new-exposure-of-signal-bodies',
      severity: 'info',
      note: 'S6 (anything in the diff that logs, persists or exposes signal BODIES to a new surface?). NO. ' +
        'Reviewed every added line touching body/subject/payload/console across the 9 changed files. ' +
        'buildPromotionAckPayload adds two scalar keys to an existing jsonb column already holding the same ' +
        'row\'s metadata. outstanding-signals.cjs adds a boolean `routed` per row and a COUNT of routed rows to ' +
        'the warning sentence — no body text, no subject, no sender identity beyond what the surface already ' +
        'emitted. stampRouted removed a column write and added none. No new console/log/persist sink for body ' +
        'content anywhere in the diff. CONTEXT WORTH RECORDING THOUGH, from the S3 probe: role `anon` can ' +
        'already SELECT every row of session_coordination including `body` — I read "LIVE DATA-LOSS EXPOSURE, ' +
        'LARGER THAN THE..." as anon. Pre-existing (single PUBLIC SELECT policy, USING(true)), not introduced ' +
        'here — but this diff DOES extend the residency of those bodies, since promoted signals are no longer ' +
        'acked and therefore no longer reaped by cleanup_expired_coordination at expires_at. The confidentiality ' +
        'exposure is unchanged in kind and longer in duration.',
      recommendation: 'No action on this PR. Fold the anon-SELECT-on-signal-bodies exposure into the grants ' +
        'audit recommended in S3b — operational STOP/DO-NOT orders and data-loss disclosures are not anon-read ' +
        'material, and the retention extension this SD (correctly) introduces makes that more true, not less.'
    },
    {
      id: 'S7-unwired-detector-is-acceptable-as-disclosed-but-its-predicate-is-blind-to-the-likeliest-instance',
      severity: 'medium',
      note: 'S7 (is shipping an unwired detector for a security-relevant class acceptable as disclosed?). THE ' +
        'DISCLOSURE ITSELF IS ACCURATE AND UNUSUALLY GOOD — I verified it rather than accepting it: grep across ' +
        'the repo confirms isRouterSwallowed has zero callers outside its own unit test, and it is NOT present ' +
        'in lib/governance/gauge-registry.js. The header says so plainly and says why a zero from an unrun ' +
        'predicate is not evidence of health. On the narrow question, YES this is acceptable as disclosed: it is ' +
        'a pure total function, two-sidedly unit-tested, adds no attack surface, changes no behaviour, and the ' +
        'wiring is tracked as a completion flag. A control that exists on paper AND SAYS SO is materially ' +
        'different from one that is silently inert. THE REAL PROBLEM IS THE PREDICATE, NOT THE WIRING: ' +
        'isRouterSwallowed requires `Boolean(acknowledged_at) && !read_at && isPromotionAcked(row)`. The third ' +
        'ack-writer found in S1 (drain-dead-letter-coordination.mjs) stamps read_at ALONGSIDE acknowledged_at, ' +
        'so a signal retired by that path scores FALSE. Given 221 of 227 in-window unacked signals are already ' +
        'orphaned to non-live coordinator sessions, that path is the LIKELIEST future instance of this defect ' +
        'class — and the detector written to catch the class would be structurally unable to see it even after ' +
        'it is wired. The predicate encodes the shape of the ONE instance that was measured (ack set, read null, ' +
        'the 9 rows) rather than the class (a promotion-marked row retired by anything other than a human).',
      recommendation: 'When wiring it, widen the predicate to the class: a promotion-marked row whose ' +
        'acknowledged_at was set by anything other than coordinator-ack-signal.cjs — i.e. ' +
        'isPromotionAcked(row) && row.acknowledged_at && !isGenuinelyHumanAck(row) — and drop the !read_at ' +
        'clause, which only encodes that the coordinator inbox had not rendered the nine measured rows yet. As ' +
        'written it will report a clean zero through the exact scenario it exists to catch.'
    }
  ],
  recommendations: [
    'BLOCKING: repair the mock in tests/unit/retention/session-coordination-ack-convergence.test.js (add the ' +
      'second .is()) — origin/main is 5/5, HEAD is 1/5, and the regression is caused by this PR.',
    'BLOCKING: guard scripts/drain-dead-letter-coordination.mjs (or teach classifyDeadLetterRow that a row with ' +
      'payload.signal_type is never "noise kind INFO"), and correct the "TWO such writers were found and ' +
      'guarded" sentence in lib/coordinator/promotion-ack.cjs — verified by execution that all 9 real swallowed ' +
      'rows classify action=stamp on that path.',
    'HIGH: add an EXECUTING assertion to promotion-ack-guards.test.js — the current guard proof is a regex over ' +
      'the source text and stayed green while the guarded function returned an error on every call.',
    'HIGH: backfill the 9 existing victims (acknowledged_at -> NULL, payload.promotion_ack -> true). They are ' +
      'unread, severity=critical, target a live session, and every one expires 2026-08-04 — after which ' +
      'cleanup_expired_coordination archives and deletes them.',
    'MEDIUM: reconcile the SQL guard (any non-null) with isPromotionAcked (=== true) — proven divergent against ' +
      'live Postgres; promotion_ack:false is currently undrainable AND silent to the starvation gauge.',
    'MEDIUM: check stampRouted\'s payload update for error / verify the writeback — the whole control now rides ' +
      'on one unverified write in a lane whose thesis is that silent write failure is the harm.',
    'MEDIUM: when wiring isRouterSwallowed, drop the !read_at clause — it encodes the one measured instance, not ' +
      'the class, and is blind to the third ack-writer.',
    'OUT OF SCOPE, FILE SEPARATELY (CRITICAL): revoke TRUNCATE/INSERT/UPDATE/DELETE on session_coordination from ' +
      '`authenticated` — positive-control proven that RLS does not gate TRUNCATE, so any user-JWT holder can ' +
      'destroy the entire coordination bus with no archive. Sweep other tables for the same grant pattern.',
    'OUT OF SCOPE, FILE SEPARATELY: printInbox\'s 7-day created_at window and its target_session=coordinatorId ' +
      'scoping retire signals by a different door (20 rows already aged out; 221 of 227 orphaned) — the fix ' +
      'hands signals to a surface that structurally cannot hold them.',
    'OUT OF SCOPE, FILE SEPARATELY: supabase/ehg_engineer/migrations/20260309_session_coordination.sql still ' +
      'contains FOR ALL USING(true) WITH CHECK(true) with no TO clause; the live DB has diverged to SELECT-only. ' +
      'Re-applying the file would grant every authenticated user full write on this table.'
  ],
  warnings: [
    'The PR\'s guard test proves the guard by GREPPING THE SOURCE STRING, not by executing it. It stayed green ' +
      'through a change that made the guarded function return an error on every invocation. Treat "guards test ' +
      'passes" as evidence that the characters are present, not that the guard runs.',
    'The completeness claim "TWO such writers were found and guarded" is false as written. A third exists and ' +
      'is strictly worse (it stamps read_at too, defeating the new detector and the starvation gauge ' +
      'simultaneously). The claim is the part that will be trusted instead of re-enumerated.',
    'The fix is forward-only. The nine signals it was written for are still acked, still unread, and all expire ' +
      '2026-08-04 — cleanup_expired_coordination will archive and delete them unless they are backfilled.',
    'Every measurement in this review was taken with COUNT head:true or from a full paginated fetch, never by ' +
      'fetching-to-count; and every claim about the live database (policies, grants, the cleanup function body, ' +
      'the classifier verdicts, the guard filter semantics) was read from the LIVE database or produced by ' +
      'EXECUTING the real code, not inferred from migration files or from the diff\'s own comments.'
  ],
  critical_issues: [
    'BLOCKING — PR breaks 4 existing tests: tests/unit/retention/session-coordination-ack-convergence.test.js is ' +
      '5/5 PASS on origin/main and 1/5 PASS on HEAD. Cause: convergeAckTTL now calls .is() twice and the ' +
      'suite\'s mock builder exposes it once ("select failed: ....is is not a function"). Established two-sided ' +
      'by swapping only that one file to origin/main and back. Scoped across 304 test files: exactly this file.',
    'BLOCKING — A THIRD unguarded acknowledged_at writer exists and the code asserts that only two do. ' +
      'scripts/drain-dead-letter-coordination.mjs selects the same bare .is(acknowledged_at, null), filters to ' +
      'non-live targets, and writes acknowledged_at + read_at. Verified by running the REAL classifier over the ' +
      'REAL 9 swallowed rows: all 9 return action=stamp, "noise kind INFO to a non-live session -> drained". It ' +
      'is worse than the two guarded siblings because read_at is stamped too — the row becomes invisible to the ' +
      'coordinator inbox, to the sender\'s outstanding view, to isRouterSwallowed (needs !read_at) and to ' +
      'REPLY_STARVATION (no auto_acked marker, so isGenuinelyAcknowledged reads it as a human answer), and it ' +
      'becomes immediately reapable by cleanup_expired_coordination. It is NEWLY REACHABLE because of this fix ' +
      '(pre-fix promoted rows were acked and never entered that selector), and 221 of 227 in-window unacked ' +
      'signals already target a non-live session, so it is the norm rather than an edge case. Mitigating: manual ' +
      '--apply only, no scheduler, 0 rows ever drained by it.',
    'CRITICAL but PRE-EXISTING and OUT OF SCOPE for this PR — role `authenticated` holds TRUNCATE on ' +
      'session_coordination and Postgres RLS does not gate TRUNCATE. Proven with a positive control on a ' +
      'scratch table mirroring the live policy/grant posture exactly (UPDATE blocked 0-rows by RLS; TRUNCATE ' +
      'SUCCEEDED), inside a rolled-back transaction; real table verified untouched at 5214 rows. Any user-JWT ' +
      'holder can destroy the entire coordination bus, bypassing archive-before-delete. Must be filed separately.'
  ],
  detailed_analysis:
    'SCOPE: threat-modelled as a COMMUNICATION INTEGRITY control per the review brief — the asset is a worker\'s ' +
    'ability to deliver a STOP/DO-NOT order, a data-loss exposure or a destructive-migration warning to the ' +
    'coordinator, and the harm is silent destruction of that message.\n\n' +
    'METHOD: every load-bearing claim below was produced by EXECUTION against the live database or the real ' +
    'code, never by reading the diff\'s own comments. Live reads: pg_policy / pg_class (RLS posture), ' +
    'information_schema.role_table_grants (grants), pg_get_functiondef (the deployed ' +
    'cleanup_expired_coordination body, which I did NOT take from the migration file), COUNT head:true for ' +
    'every population figure, fetchAllPaginated for every set. Executions: the real classifyDeadLetterRow over ' +
    'the real 9 rows; the real isPromotionAcked over six crafted jsonb shapes cross-checked against live ' +
    'Postgres ->> semantics; role-scoped SELECT/UPDATE/INSERT/DELETE as anon, authenticated and service_role in ' +
    'a rolled-back transaction; a positive-control scratch table for the RLS-vs-TRUNCATE question; and 304 test ' +
    'files run at HEAD and the regressing file re-run against origin/main.\n\n' +
    'WHAT THE CHANGE GETS RIGHT. stampRouted() no longer writes acknowledged_at, and the choice of a ' +
    'NON-DISPOSING DEFAULT over a disposing-default-with-a-guard is the correct security posture: a future bug ' +
    'in that function leaves a signal VISIBLE rather than destroyed. routed_to_feedback_id is preserved, so ' +
    'dedup survives. The FR-4 detector carve-out is the necessary consumer half — marking a row without ' +
    'teaching the gauge to skip the mark would have been an inert mechanism. Both guarded sweeps are genuinely ' +
    'guarded and both fail CLOSED on read error. FR-9 correctly refuses to collapse "filed" and "untouched" on ' +
    'the sender side, and correctly surfaces the new field in the rendered sentence rather than adding a field ' +
    'nobody reads. No new exposure of message bodies. The disclosures on stampRoutedToCoordinator and on ' +
    'isRouterSwallowed are both accurate — I checked each rather than accepting them (zero rows have ever ' +
    'carried payload.routed_to_coordinator; isRouterSwallowed has zero non-test callers and is absent from ' +
    'gauge-registry.js).\n\n' +
    'WHY IT STILL FAILS. Two blockers, both cheap. First, the PR is RED: it breaks 4 tests that are green on ' +
    'main, and the reason the breakage was not noticed is itself the finding — the PR\'s own guard test asserts ' +
    'the guard by regex-matching the SOURCE TEXT of the file, so it stayed green while convergeAckTTL began ' +
    'returning an error on every call. A grep-shaped test cannot observe the runtime death of the line it ' +
    'greps for. Second, the enumeration of ack-writers is incomplete AND the code claims it is complete. I ' +
    'enumerated all 24 non-test assignment sites and cleared 21 of them with a stated reason each (id-scoped, ' +
    'ownership-scoped, own-inbox, reply-bearing, or read_at-only); the twenty-second is ' +
    'scripts/drain-dead-letter-coordination.mjs, which selects on the identical bare acknowledged_at-IS-NULL ' +
    'predicate the SD calls out as the shared defect shape in its two siblings. Running its real classifier ' +
    'over the real nine rows returns action=stamp on all nine. The SD\'s own FR-8 sentence — "guarding one and ' +
    'not the other would have left the fix self-reverting on a longer fuse" — is the exact argument for ' +
    'guarding the third.\n\n' +
    'THE ASYMMETRY THAT MAKES THE THIRD PATH THE WORST ONE. The two guarded sweeps stamp acknowledged_at and ' +
    'leave a marker (auto_acked), so isGenuinelyAcknowledged() still reports the row as unanswered and the ' +
    'gauge can alarm. The dead-letter drain stamps acknowledged_at AND read_at AND leaves no auto_acked marker. ' +
    'That single difference simultaneously (a) removes the row from the coordinator inbox and the sender\'s ' +
    'banner, (b) converts it to "genuinely acknowledged" in the starvation detector so the gauge goes silent, ' +
    '(c) puts it outside isRouterSwallowed\'s !read_at clause so the new classifier cannot see it even once ' +
    'wired, and (d) makes it immediately reapable. Four independent surfaces blinded by one write. And the fix ' +
    'is what makes that write reachable: pre-fix, promoted rows carried acknowledged_at and could never enter ' +
    'the selector.\n\n' +
    'ON RETENTION (S2). The direction is good and should be stated plainly: reading the DEPLOYED function body, ' +
    'cleanup_expired_coordination reaps `expires_at < now() AND (acknowledged_at IS NOT NULL OR (read_at IS NOT ' +
    'NULL AND read_at <= now()-7d))`, so removing the ack removes the row from the reaper. Pre-fix a promoted ' +
    'signal died at expires_at (created+24h, measured on all 9); post-fix it survives. The cost is a queue that ' +
    'grows with no drain — 247 unacked signals today, one manual per-id CLI as the only disposition path — and ' +
    'a set of surfaces that cannot hold what the fix hands them: printInbox windows to 7 days (20 rows already ' +
    'past it, invisible with no marker and no state change) and scopes to the CURRENT coordinator session id ' +
    '(only 6 of 227 in-window unacked signals target a live session). The .limit(20) cap is the least of these ' +
    'because it is honestly disclosed via a separately-paginated true count; the window and the session scoping ' +
    'are not disclosed anywhere. None of that is in this diff, but it determines whether the diff achieves its ' +
    'purpose, so it is stated rather than waved through.\n\n' +
    'ON THE MARKER (S3/S4/S5). Within this trust model there is no lower-privileged writer: anon cannot write ' +
    '(42501 at the grant layer), authenticated cannot write (0 rows, blocked by RLS having no permissive write ' +
    'policy), and every legitimate fleet process holds the same service-role key — so putting the marker in ' +
    'payload rather than a column does not widen the write surface at all, and the SD\'s stated reason ' +
    '(reviveArchivedSignal rebuilds through an explicit field map and would silently drop a new column) is a ' +
    'good one. Two real defects remain. The SQL guard and the JS predicate disagree on every encoding except ' +
    'literal true — proven live: promotion_ack:false is skipped by both sweeps (undrainable) while ' +
    'isPromotionAcked returns false (gauge silent), the worst available combination. And promotion_ack_source, ' +
    'the field whose stated purpose is telling a later reader WHICH writer set the marker, has zero production ' +
    'readers; both guards key on the bare boolean. The SD applies exactly the right principle to `routed` in ' +
    'outstanding-signals.cjs ("a field nobody reads — the same shape as a marker written but never consumed") ' +
    'and then does not apply it to its own provenance field.\n\n' +
    'ON FAIL DIRECTION (S4). Fail-closed on ERROR (observed, not reasoned — the 4 red tests ARE the error path, ' +
    'and convergeAckTTL converged 0). Fail-OPEN on a MISSING key: a probe on a nonexistent key matched 5217 of ' +
    '~5214 rows, so a rename or typo silently converts both guards into no-ops with no error. Importing the ' +
    'shared constant at all three sites is the right mitigation and the guards test pins that the literal ' +
    'string is not used — keep both.\n\n' +
    'BOTTOM LINE: the control is correctly conceived and mostly correctly built. It cannot merge with a red ' +
    'suite it caused, and it should not merge asserting an enumeration it did not complete — particularly when ' +
    'the unenumerated path is the one that blinds four surfaces at once and is now reachable only because of ' +
    'this change.',
  metadata: {
    version: '1.0.0',
    review_type: 'adversarial_communication_integrity_threat_model_live_db_verified',
    worktree_path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001',
    branch: 'feat/SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001',
    pr: 6786,
    brief_sections_answered: {
      S1_can_a_signal_still_be_silently_retired: 'FAIL — third unguarded ack-writer found (drain-dead-letter-coordination.mjs); 21 other sites enumerated and cleared with stated reasons',
      S2_availability_retention_side_effect: 'MIXED — deletion posture strictly IMPROVED (ack removal takes rows out of cleanup_expired_coordination); unbounded growth REAL (247 unacked, no drain); display cap disclosed, but the 7-day window and target_session scoping hide 20 + 221 rows respectively; the 9 existing victims are NOT backfilled and expire 2026-08-04',
      S3_marker_integrity: 'PASS with caveats — anon cannot write (grant), authenticated cannot write (RLS only, grants wide open); marker write surface == service-role key == every fleet process; payload-vs-column does NOT widen it',
      S4_fail_open_or_closed: 'FAIL-CLOSED on error (observed); FAIL-OPEN on a missing/renamed key (probe matched 5217/5214 rows); SQL guard and JS predicate proven divergent at promotion_ack:false',
      S5_privilege_provenance: 'INERT — promotion_ack_source has zero production readers; both guards key on the bare boolean; no security decision depends on it',
      S6_new_exposure_of_signal_bodies: 'PASS — none in the diff; pre-existing anon SELECT on bodies is extended in DURATION by the retention change',
      S7_unwired_classifier: 'ACCEPTABLE AS DISCLOSED (disclosure verified accurate) but the PREDICATE is blind to the third path because it requires !read_at'
    },
    live_measurements: {
      session_coordination_total: 5214,
      signal_rows_total: 438,
      unacked_signals: 247,
      unacked_signals_within_printinbox_7d_window: 227,
      unacked_signals_older_than_7d_permanently_invisible: 20,
      unacked_in_window_signals_targeting_a_live_session: 6,
      unacked_in_window_signals_orphaned_to_a_dead_session: 221,
      rows_with_routed_to_feedback_id: 9,
      swallowed_rows_ack_set_read_null: 9,
      rows_with_promotion_ack_marker: 0,
      rows_with_dead_letter_drained_marker: 0,
      live_session_set_size: 11,
      guard_filter_probe_guarded_vs_baseline: '4779 == 4779 (filter applies cleanly, no error)',
      guard_filter_probe_inverse: 0,
      nonexistent_key_probe_matched_rows: 5217,
      nine_victims_expires_at: 'all 2026-08-04 (created + 24h)'
    },
    test_results: {
      ack_convergence_suite_on_origin_main: '5 passed / 5',
      ack_convergence_suite_on_HEAD: '4 FAILED / 1 passed',
      broad_run_at_HEAD: '304 test files: 4 failed | 3618 passed | 1 skipped — regression confined to session-coordination-ack-convergence.test.js',
      sd_own_new_tests: 'promotion-ack.test.js and promotion-ack-guards.test.js both PASS (guards test is source-grep-based, see finding S0)'
    },
    files_reviewed: [
      'lib/coordinator/promotion-ack.cjs (new)',
      'lib/coordinator/signal-router.cjs',
      'lib/coordinator/detectors.cjs',
      'lib/fleet/outstanding-signals.cjs',
      'lib/retention/session-coordination-ack-convergence.js',
      'scripts/stale-session-sweep.cjs (stuck-drain + planDeadLetters + loadLiveSessionIds)',
      'tests/unit/coordinator/promotion-ack.test.js',
      'tests/unit/coordinator/promotion-ack-guards.test.js',
      'lib/coordinator/signal-router.test.js',
      'scripts/drain-dead-letter-coordination.mjs (read-only — THIRD PATH)',
      'lib/coordination/dead-letter-drain.js (read-only + EXECUTED against live rows)',
      'lib/sweep/passes/dead-letter-planning.cjs (read-only)',
      'lib/fleet/orphan-reroute-sweep.js (read-only)',
      'scripts/fleet-dashboard.cjs printInbox (read-only)',
      'scripts/hooks/coordination-inbox.cjs (read-only)',
      'scripts/adam-advisory.cjs / solomon-advisory.cjs / worker-checkin.cjs / worker-ack-directive.cjs / fleet-coaching.cjs / relay-queue.cjs / canary-session.js / coordinator-ack-signal.cjs (ack-writer enumeration)',
      'supabase/ehg_engineer/migrations/20260309_session_coordination.sql',
      'database/migrations/20260713_fix_cleanup_expired_coordination_where_clause.sql'
    ],
    empirical_verifications: [
      'LIVE pg_policy: session_coordination has RLS enabled and exactly ONE policy — service_role_full_access, polcmd=r (SELECT ONLY), polroles=PUBLIC, using=true, withcheck=NULL. The in-repo migration file still says FOR ALL USING(true) WITH CHECK(true) with no TO clause — live has diverged to the safer form',
      'LIVE grants: anon = SELECT/REFERENCES/TRIGGER; authenticated = SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER; service_role = full',
      'EXECUTED as anon (rolled back): SELECT 5214 rows OK, body of a critical STOP signal READABLE, UPDATE payload -> DENIED 42501 at the grant layer',
      'EXECUTED as authenticated (rolled back): SELECT OK, UPDATE payload -> 0 rows (RLS), INSERT -> RLS violation',
      'EXECUTED as service_role (rolled back): UPDATE/INSERT/DELETE all succeed — confirms the probe row was reachable, so the 0-row results above are RLS and not a bad WHERE clause',
      'POSITIVE CONTROL on a scratch table mirroring the live posture (RLS on, one SELECT-only PUBLIC policy, identical authenticated grants): as authenticated, UPDATE -> BLOCKED 0 rows, TRUNCATE -> SUCCEEDED (table emptied). Proves RLS does not gate TRUNCATE. Rolled back; to_regclass = null; real table verified unchanged at 5214 rows',
      'LIVE pg_get_functiondef of cleanup_expired_coordination — read the DEPLOYED body rather than the migration file; confirms the reap predicate is expires_at < now() AND (ack NOT NULL OR read_at <= now()-7d) with archive-before-delete and a count-integrity RAISE',
      'EXECUTED the real classifyDeadLetterRow() from lib/coordination/dead-letter-drain.js over the 9 real swallowed rows fetched live: 9/9 -> action=stamp, "noise kind INFO to a non-live session -> drained"',
      'LIVE ->> semantics cross-checked against isPromotionAcked() over 6 jsonb shapes: true -> SKIP/alarms; false, "yes", 0 -> SKIP but SILENT; null and absent -> DRAIN',
      'PostgREST probe on a nonexistent payload key returned 5217 of ~5214 rows — a renamed/typo key silently disarms both guards',
      'Guard filter probe: ack-NULL 4779 == ack-NULL + promotion_ack IS NULL 4779, inverse 0 — the filter applies at PostgREST without error',
      'git checkout of ONLY lib/retention/session-coordination-ack-convergence.js to origin/main and back, re-running the suite each time: 5/5 green on main, 4/5 red at HEAD — two-sided attribution of the regression to this PR',
      'npx vitest run across tests/unit/coordinator, tests/unit/retention, tests/unit/fleet, tests/unit/coordination, lib/coordinator: 304 files, 4 failed | 3618 passed | 1 skipped',
      'grep: isRouterSwallowed has zero callers outside its own unit test and is absent from lib/governance/gauge-registry.js — the unwired disclosure is accurate',
      'grep: promotion_ack_source has zero production readers (one assertion in signal-router.test.js only)',
      'grep across json/js/cjs/mjs/yml/yaml/md: drain-dead-letter-coordination.mjs has no scheduler, cron or sweep caller — manual --apply only',
      'LIVE: 0 rows carry payload.dead_letter_drained or payload.dead_letter_retargeted — that script has never been applied with markers'
    ],
    notes_on_method: 'All probe scripts were transient and deleted; the two mutating probes ran inside explicit ' +
      'transactions that were ROLLED BACK, with post-checks confirming zero tainted rows and an unchanged table ' +
      'row count. No live data was modified by this review.'
  }
};

// results.summary and results.findings are NOT mapped columns on sub_agent_execution_results
// (verified by reading the row back: both landed NULL). Fold them into detailed_analysis, which IS
// mapped and uncapped, so the per-section S1-S7 evidence is not silently discarded.
const NL = String.fromCharCode(10);
const HR = '-'.repeat(72);
results.detailed_analysis = [
  'SUMMARY',
  '=======',
  results.summary,
  '',
  results.detailed_analysis,
  '',
  'PER-SECTION FINDINGS (threat-model sections S1-S7 from the review brief)',
  '='.repeat(72),
  '',
  results.findings.map((f) => (
    '[' + String(f.severity).toUpperCase() + '] ' + f.id + NL +
    'FINDING: ' + f.note + NL +
    'RECOMMENDATION: ' + (f.recommendation || '(none - informational)')
  )).join(NL + NL + HR + NL + NL)
].join(NL);

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: CODE,
  targetApplication: 'EHG_Engineer',
  fallback: 'EHG_Engineer'
});
applySubAgentRepoVerdict(results, resolution);

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
