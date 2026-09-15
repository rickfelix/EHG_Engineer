#!/usr/bin/env node
/**
 * SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001 — SECURITY evidence at EXEC-TO-PLAN.
 *
 * Independent security review of the on-demand send path (--now), the newly-wired quiet-hours
 * guard, and the readProducingFeederCounts / composeCheckpointBody changes in
 * scripts/michael/checkpoint-send.mjs. Every claim below was MEASURED by executing the shipped
 * module against adversarial inputs (a stateful in-memory client that persists inserts across
 * invocations -- unlike the repo suite's per-call fake, which cannot prove a rapid-fire loop is
 * capped), never inferred from the diff's own comments.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'PASS',
    confidence: 92,
    phase: 'EXEC-TO-PLAN',
    execution_time_ms: 0,
    summary: "Independent SECURITY review of the on-demand (--now) send path, the newly-wired quiet-hours guard, and the feeder/body changes. All four blocking-class questions are cleanly negative, each proven by executing the shipped module rather than by reading its comments. (1) NO CAP BYPASS: the cap read at checkpoint-send.mjs:271 filters on .eq('et_date', etDate) ONLY -- it never filters or groups by window_slot -- and counts outcome='sent' OR refusal_code='SEND_IN_PROGRESS' across every slot, so the per-minute 'on-demand:HH:MM' stamp cannot mint budget. Measured: 8 sequential --apply --now fires across 8 DISTINCT ET minutes against one shared ledger produced exactly 4 Twilio calls and 4 CAP_EXCEEDED refusals. (2) QUIET HOURS FAIL CLOSED, NOT OPEN: allowQuietHours is initialised false BEFORE the try, and the catch resets it to false with chairmanZone=undefined (which correctly falls through to isSmsQuietHour's America/New_York default parameter). Measured at 23:00 ET against 12 malformed resolver shapes -- throws, rejects, returns undefined, returns null, returns {}, omits the zone, synchronous throw, allowQuietHours:0 -- every one refused QUIET_HOURS with ZERO Twilio calls. (3) NO GUARD BYPASS: the enable/disable (:253-263), cap (:271-281), dedup (:283-286), recipient-pin (:290-304) and identity (:307-311) guards are a SINGLE implementation with no isOnDemand branching anywhere in them -- the only two isOnDemand branches in the file (the window_slot substitution at :198-213 and the quiet-hours guard at :220-244) both sit strictly BEFORE them, so an on-demand send traverses byte-identical guard code in the identical order. (4) NO INJECTION SURFACE: every DB call goes through the Supabase query builder with parameterised values; there is zero string concatenation or template interpolation into any query. --reason is inert -- the only argv keys read anywhere in the file are a.apply, a['et-date'] and a.now, and a hostile --reason carrying SQL, XSS and a phone number appeared in no persisted row, no SMS body (byte-identical with and without it), and no result envelope. window_slot derives solely from etMinuteOfDay(now), bounded [0,1439]; values injected via '--now <value>' and '--now=<value>' left the stamp at 'on-demand:08:00' unchanged. Four findings recorded, all LOW: two are hardening items in new code that I proved UNREACHABLE through the production wiring, and two are pre-existing conditions I measured against origin/main and confirmed this change does not widen. Also confirmed positively: no secrets or phone numbers anywhere in the diff, the recipient hash-pin mechanism is untouched (still read fresh from the private store, still no hardcoded number in this public repo), the Task Scheduler entry still passes only --apply so --now did not leak into the automated path, and the FR-3/FR-4 body changes cannot route DB-controlled text into an SMS (feeder names are frozen constants, counts pass a typeof==='number' guard, the as-of pointer goes through Intl) -- the SEC-M1 redaction posture is preserved.",
    critical_issues: [],
    warnings: [
      {
        id: 'SEC-1',
        severity: 'LOW',
        issue: "Type-coercion hardening (NOT production-reachable): the quiet-hours guard at checkpoint-send.mjs:232 tests truthiness (`!allowQuietHours`) rather than the strict `!== true` idiom this same file already uses for its most security-critical existing guard (`enabledRow.enabled !== true`, :260). A resolver returning the STRING 'false' -- truthy in JS -- bypasses the quiet-hours refusal entirely; measured, that case SENT during quiet hours while all 11 other malformed shapes refused. This is NOT exploitable in production: main() never injects resolveQuietHours, so the default resolveQuietHoursContext is always used, and I measured it returning a strict boolean across 10 adversarial chairman_preferences row shapes (garbage zone, null value, numeric value, legacy alias, Etc/GMT, unparseable and future- and past-dated extension keys) plus a preference store that throws outright. The injectable seam is the only route, and only tests use it. Recommend `allowQuietHours !== true` for consistency with :260 -- it makes the guard robust to any future writer of that seam rather than relying on the current resolver's discipline.",
        evidence: "Probe P3 case allowFalseString -> 'SENT | twilioCalls=1' at 23:00 ET, versus QUIET_HOURS/twilioCalls=0 for throws, rejects, returnsUndefined, returnsNull, emptyObject, missingZone, allowZero and syncThrowNonAsync. Probe P7 drove the real resolveQuietHoursContext with an injected store across 10 preference shapes plus a throwing store: allowQuietHours was typeof 'boolean' in every case.",
      },
      {
        id: 'SEC-2',
        severity: 'LOW',
        issue: "Never-throws contract (NOT production-reachable): the `isSmsQuietHour(now, chairmanZone)` call at checkpoint-send.mjs:232 sits OUTSIDE the try/catch that wraps resolveQuietHours (:223-231). Intl throws a RangeError on a null or non-canonical timeZone, so a resolver returning chairmanZone:null or a garbage zone propagates an exception out of runCheckpointSend -- violating the function's documented 'Never throws' contract. The delivery consequence is still fail-CLOSED (measured: zero Twilio calls in both cases, since the throw precedes every send path), but the operator-visible degradation is real: main()'s top-level catch yields exit code 1 and a raw stack trace instead of the structured refusal envelope and exit 2, and NO QUIET_HOURS ledger row is written, so an operator-initiated attempt would leave no audit trace. Unreachable in production for the same reason as SEC-1 -- deriveChairmanZone only ever returns DEFAULT_ZONE or a value that passed isValidCanonicalZone, measured as a non-empty string in all 10 adversarial shapes. Recommend either moving the isSmsQuietHour call inside the existing try, or normalising with `chairmanZone ?? undefined` so the default parameter engages on null.",
        evidence: "Probe P3 cases nullZone -> 'THREW(Invalid time zone specified: null) | twilioCalls=0' and garbageZone -> 'THREW(Invalid time zone specified: Not/AZone) | twilioCalls=0'. Probe P7 confirmed the production resolver always returns a non-empty string zone, including when the preference store throws (-> America/New_York).",
      },
      {
        id: 'SEC-3',
        severity: 'LOW',
        issue: "PRE-EXISTING, measured NOT widened by this SD: the 4/day cap is an application-level check-then-act, read at :271 but not committed until the staged SEND_IN_PROGRESS row at :321, so N processes running in parallel all pass the cap read before any of them stages. I measured this against origin/main to establish attribution rather than assuming it: 8 CONCURRENT fires on origin/main's fixed-window path produced 8 Twilio calls, and 8 concurrent fires on HEAD's on-demand path (both same-minute and 8 distinct minutes) also produced 8 -- identical magnitude, so the per-minute slot does not widen the race, and HEAD's fixed-window path is unchanged from baseline. Worth stating precisely: the DB partial unique index on (et_date, window_slot) WHERE outcome='sent' is a RECORDING backstop evaluated at finalize, AFTER the Twilio call, so it bounds recorded 'sent' rows rather than delivered texts -- that is equally true on main. What this SD does change is reachability, not width: concurrent invocation moves from scheduler-only (Task Scheduler serialises one process per window) to operator-invokable. The realistic operator behaviour, sequential rapid-fire, is correctly capped -- measured at exactly 4 sends from 8 back-to-back fires. Genuine overage requires deliberately backgrounding parallel processes, by an operator who already holds service-role DB credentials, MICHAEL_TWILIO_* credentials and the pin-matching CHAIRMAN_PHONE, and could therefore call Twilio directly. Not chargeable to this SD; recorded so the condition is documented rather than discovered later.",
        evidence: "Probe P3 (comparative): origin/main FIXED-WINDOW 8 concurrent -> twilioCalls=8; HEAD FIXED-WINDOW -> 8; HEAD ON-DEMAND same minute -> 8; HEAD ON-DEMAND 8 distinct minutes -> 8. Probe P1 (sequential, one shared stateful ledger): 8 fires -> sent=4 capped=4 twilioCalls=4 distinctSlots=8. Caveat recorded in good faith: the in-memory client does not model Postgres unique-index semantics, so the concurrent 'sent' row counts overstate what real Postgres would record; the Twilio call count, which is what matters for spam, is the measured quantity.",
      },
      {
        id: 'SEC-4',
        severity: 'LOW',
        issue: "PRE-EXISTING, effect nil, unchanged by this diff: SEC-H1's guard at :187 tests `typeof a['et-date'] === 'string'`, but lib/michael/db.mjs's parseArgs converts a REPEATED flag into an ARRAY (QF-20260907-847), so `--apply --now --et-date=X --et-date=Y` evades the ET_DATE_OVERRIDE_NOT_ALLOWED refusal. The attack SEC-H1 exists to stop -- minting unlimited fresh 4-per-day budgets by walking the calendar -- does NOT work, because the identical typeof test on the very next line (:190) makes etDate fall back to todayEt(now): measured, the ledger row was written with the real ET date 2026-09-14, not the attacker's 2099-01-01. So the refusal is evadable but the guard's purpose holds and it fails safe. Both the guard and parseArgs's array behaviour predate this SD and appear as unchanged context in the diff. Recommend widening the test to `a['et-date'] !== undefined` if SEC-H1's refusal is meant to be unconditional.",
        evidence: "Probe P5: `['--apply','--now','--et-date','2099-01-01']` -> refusal=ET_DATE_OVERRIDE_NOT_ALLOWED with zero ledger writes (guard fires before any read). `['--apply','--now','--et-date=2099-01-01','--et-date=2099-01-02']` -> refusal NOT raised, but et_date written = ['2026-09-14']. git diff origin/main...HEAD confirms :187-191 are context lines, not additions.",
      },
    ],
    recommendations: [
      "Apply SEC-1 and SEC-2 together as a single small hardening edit to the quiet-hours block (use `allowQuietHours !== true`, and bring the isSmsQuietHour call inside the existing try). Both are defence-in-depth on a seam that only tests currently reach, so neither blocks this SD -- but they remove the file's reliance on a downstream resolver's type discipline, which is exactly the kind of cross-module assumption that breaks silently when the resolver is later changed by someone who never reads this consumer.",
      "Leave SEC-3 and SEC-4 alone in this SD -- both are pre-existing and measured not to be widened here, and fixing the cap race properly means a DB-level constraint or advisory lock, which is a separate scoped change rather than something to bolt onto a texting SD.",
      "Post-merge, run tests/ddl/michael-checkpoint-send-ddl.db.test.js from the main checkout: TS-20 is the ONLY tier that can prove the on-demand slot's NOT NULL and partial-unique behaviour against real Postgres, and it is excluded from this worktree by design, so that schema-level claim is currently evidenced by the DDL text plus an unexecuted test rather than by a run.",
    ],
    detailed_analysis: {
      checks_performed: {
        cap_and_spam_abuse: "PASS. Traced runCheckpointSend end to end. The cap read (:271) is `.eq('et_date', etDate)` with select 'window_slot,outcome,refusal_code' -- no window_slot predicate -- and the count (:277) filters `outcome==='sent' || refusal_code==='SEND_IN_PROGRESS'` over ALL rows for the date, so on-demand and fixed-window sends draw on one shared budget. Verified by execution, not by reading the comment: 8 sequential on-demand fires across 8 distinct ET minutes -> 4 sent, 4 CAP_EXCEEDED, 4 Twilio calls, 8 distinct slots. Guard position is identical for both paths because there is only one cap implementation and no isOnDemand branch anywhere near it.",
        quiet_hours_fail_open: "PASS -- fails CLOSED. `let allowQuietHours = false` precedes the try; the catch (:225-231) re-asserts false and sets chairmanZone=undefined so isSmsQuietHour's default ET zone engages. 12 malformed resolver shapes probed at 23:00 ET; zero produced a send. Two exotic shapes throw out of isSmsQuietHour rather than refusing cleanly (SEC-2) -- still zero sends. The production resolver cannot produce either shape (P7).",
        pin_identity_enable_bypass: "PASS. RECIPIENT_HASH_MISMATCH (:301-304), IDENTITY_UNCONFIGURED (:308-311) and DISABLED (:260-263) are single implementations reached unconditionally by both paths -- I confirmed by reading the whole function that `isOnDemand` appears in exactly two places (:199 and :220), both upstream of all of them, and that there is no duplicated/parallel on-demand implementation that could drift. The pin is still read FRESH from the private store per invocation (:292) with no cache and no on-demand exemption.",
        reason_flag: "PASS. `a.reason` is never referenced anywhere in the file -- the only argv keys read are a.apply, a['et-date'] and a.now. A hostile --reason value carrying SQL injection, an XSS payload and a phone number was absent from every persisted row, produced a byte-identical SMS body, produced an identical ledger column set, did not alter the outcome, and was not echoed into the result envelope (so it cannot reach Task Scheduler host logs via emit()).",
        injection_surface: "PASS. All reads/writes go through lib/michael/db.mjs's readRows/writeRows, which pass a builder callback to the Supabase client; every value is a parameterised builder argument. Zero string concatenation or template literals inside any .eq()/.insert()/.update(). The sole argv-derived value that reaches a query is et_date, which is regex-validated /^\\d{4}-\\d{2}-\\d{2}$/ and refused outright under --apply.",
        window_slot_construction: "PASS. Built only from etMinuteOfDay(now) -- `Math.floor(minuteOfDay/60)` and `minuteOfDay % 60`, zero-padded -- so it is bounded to on-demand:00:00..23:59 by construction. `a.now` is coerced through Boolean() and never interpolated. Injection attempts via a positional value consumed by --now, and via --now=<value>, both left the stamp at 'on-demand:08:00'. Cannot collide with a fixed-window slot (a bare HH:MM from the frozen FEEDERS registry). Schema-checked against database/migrations/20260914_michael_checkpoint_send.sql: window_slot is unconstrained TEXT NOT NULL, refusal_code is unconstrained TEXT NULL, and outcome's CHECK includes 'refused' -- so the QUIET_HOURS ledger row is schema-valid and the on-demand stamp carries no format constraint to violate.",
        test_coverage_of_security_paths: "PASS, and these are real assertions rather than happy-path coverage. TS-17 injects a resolver that throws and asserts refusal QUIET_HOURS -- a genuine fail-closed proof. TS-15 is a true guard-ORDER proof: it makes EVERY later guard fail simultaneously (enabled:false, four cap-filling rows, a non-matching pin, resolveIdentity returning null) and still asserts the refusal is QUIET_HOURS with exactly ONE ledger write, so a misordered guard could not pass it. TS-16 proves QUIET_HOURS rows do not consume cap budget; TS-14 proves the different-minute/same-minute dedup split; TS-8/TS-13 proves mixed fixed+on-demand rows sum toward one cap; TS-19 pins the SEC-H1 regression. I executed the suite: 53/53 passing.",
      },
      additional_positive_findings: [
        "Secret scan of every added line across scripts/michael/ and tests/ for E.164 numbers, dashed phone formats, Twilio AC/SK SIDs, sk- keys, JWTs, and password/api_key assignments -> zero hits. The test fixture recipient is the literal string 'a-test-recipient-not-the-real-number', not a phone number.",
        "The recipient hash-pin mechanism is entirely untouched by this diff -- still a fresh per-invocation DB read of the private-store row, still compared against sha256Hex(process.env.CHAIRMAN_PHONE), still no number in the repo. The public-repo brute-force concern that motivated the pin design is unaffected.",
        "scripts/setup-michael-host-tasks.mjs still registers 'scripts/michael/checkpoint-send.mjs --apply' -- --now did NOT leak into the scheduled task, so the automated path retains its fixed-window discipline and the new capability is operator-initiated only.",
        "The FR-3/FR-4 body changes cannot route DB-controlled text into an SMS: feeder identifiers come from the frozen PRODUCING_FEEDER_COUNTS constant, counts must pass typeof === 'number', and the as-of pointer is rendered through Intl.DateTimeFormat. Probed with counts objects carrying an XSS payload, a phone number and an object with a hostile toString on the NAMED key -- none reached the body; worst-case all-missing body is 168 chars. SEC-M1's redaction posture is preserved and SEC-M1/M2 themselves are unchanged.",
        "Quiet-hours refusals correctly do NOT burn cap budget: 20 refused on-demand fires inside quiet hours wrote 20 outcome='refused'/QUIET_HOURS rows and zero Twilio calls, after which a full budget of exactly 4 sends remained available once the clock left the window.",
        "An on-demand fire INSIDE a fixed window consumes that window's own slot rather than minting an 'on-demand:' slot, so the subsequent scheduled fire dedups to ALREADY_SENT_THIS_WINDOW -- one text, not two.",
        "Migration RLS posture re-read and unchanged: both michael_* tables are service_role-only with anon/authenticated SELECT/INSERT/UPDATE/DELETE asserted absent in the migration's own verify block. This SD adds no table, no policy and no grant.",
      ],
      commands_run: [
        'git diff origin/main...HEAD -- scripts/michael/checkpoint-send.mjs (247 lines, read in full) + cat -n of the complete current file (380 lines) -> guard order traced end to end',
        'npx vitest run scripts/michael/checkpoint-send.test.js -> 53/53 passed (executed, not inferred from the TESTING evidence row)',
        'Probe P1 (stateful ledger, sequential): 8 --apply --now fires across 8 distinct ET minutes -> sent=4 capped=4 twilioCalls=4 -- per-minute slots do not mint budget',
        'Probe P2: 20 quiet-hour fires -> 0 Twilio calls, 20 refused/QUIET_HOURS rows, then exactly 4 sends still available post-window',
        'Probe P3: 12 malformed resolveQuietHours shapes at 23:00 ET -> 10 refused QUIET_HOURS with 0 sends, 2 threw with 0 sends (SEC-2), 1 sent (SEC-1, string coercion)',
        'Probe P4: hostile --reason (SQL + XSS + phone number) -> absent from all rows, identical body, identical column set, identical outcome, absent from the result envelope',
        'Probe P5: window_slot/et_date injection via a positional after --now, --now=<value>, --et-date under --apply, and repeated --et-date -> no injection; SEC-H1 refusal fires before any ledger write; repeated-flag form evades the refusal but writes the real ET date (SEC-4)',
        'Probe P6: --now inside a fixed window -> consumes slot 06:00, scheduled fire dedups, 1 Twilio call total',
        'Probe P7: drove the real resolveQuietHoursContext with an injected store across 10 adversarial chairman_preferences shapes + a throwing store -> allowQuietHours always a strict boolean, chairmanZone always a non-empty valid string (proves SEC-1/SEC-2 unreachable in production)',
        'Probe P8/comparative: 8 CONCURRENT fires against origin/main fixed-window (8 calls) vs HEAD fixed-window (8) vs HEAD on-demand same-minute (8) vs HEAD on-demand 8 distinct minutes (8) -> TOCTOU pre-existing, identical magnitude, not widened (SEC-3)',
        'Probe P9: summarizeCounts/composeCheckpointBody fed DB-controlled XSS/phone/hostile-toString values -> no raw text, no ISO timestamp, 168-char worst case',
        'Secret/PII scan over all added lines (E.164, dashed phone, AC/SK SIDs, sk- keys, JWT, password/api_key) -> zero hits',
        'grep of scripts/setup-michael-host-tasks.mjs -> scheduled entry is `--apply` only, no --now',
        'Read database/migrations/20260914_michael_checkpoint_send.sql -> outcome CHECK admits refused, refusal_code unconstrained, window_slot TEXT NOT NULL unconstrained, RLS service_role-only verified in-migration',
      ],
      files_reviewed: [
        'scripts/michael/checkpoint-send.mjs (full, 380 lines)',
        'scripts/michael/checkpoint-send.test.js (full diff + TS-5..TS-19 bodies)',
        'tests/ddl/michael-checkpoint-send-ddl.db.test.js (TS-20 hunk)',
        'lib/michael/db.mjs (parseArgs, readRows, writeRows, refusal, emit)',
        'lib/michael/feeder.mjs (FEEDERS window config, inWindow, windowIdFor, etMinuteOfDay)',
        'lib/time/chairman-et-wall-clock.js (isSmsQuietHour, etLocalHour, isValidCanonicalZone, SMS quiet constants)',
        'lib/comms/adam-outbound/quiet-hours-extension.js (resolveQuietHoursContext, deriveAllowQuietHours, deriveChairmanZone)',
        'database/migrations/20260914_michael_checkpoint_send.sql',
        'scripts/setup-michael-host-tasks.mjs (scheduled-task wiring)',
      ],
      boundary_verified: "The 4 fixed windows are 06:00-06:15, 10:00-10:15, 14:00-14:15 and 18:00-18:15 ET; quiet hours are hour>=22 || hour<6. The 06:00 window sits exactly on the boundary and is correctly OUTSIDE quiet hours (hour===6 satisfies neither limb), so the claim that no fixed window intersects the quiet window is true with no off-by-one -- and TS-10 pins that boundary explicitly.",
      threat_model_note: "Worth stating plainly for whoever reads this later: every guard here is a governance control against bugs, operator error and runaway automation -- not an adversarial boundary. Anyone able to run this verb with --apply already holds the service-role Supabase key, the MICHAEL_TWILIO_* credentials and a CHAIRMAN_PHONE that matches the pinned hash, and could text the chairman directly without this script. That is why SEC-3's concurrent overage is rated LOW rather than treated as a spam vulnerability, and why the cap's real job -- making an accidental loop or a crashed-and-retried scheduler incapable of flooding the chairman -- is the property I verified hardest.",
    },
    metadata: {
      independent_verification: true,
      verified_by_execution: true,
      baseline_comparison_against_origin_main: true,
      probes_executed: 9,
      findings: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 4 },
      new_code_findings_production_reachable: 0,
      pre_existing_findings_widened_by_this_sd: 0,
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    probeExistsRelative: 'scripts/one-off/michael-texting-exec-to-plan-security-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('SECURITY', sdRow.id, { code: 'SECURITY', name: 'Security' }, results, { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN' });
  console.log('STORED:', 'SECURITY', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
