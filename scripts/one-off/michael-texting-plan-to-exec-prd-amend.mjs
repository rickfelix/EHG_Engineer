#!/usr/bin/env node
// SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001 -- PLAN-TO-EXEC TESTING sub-agent PRD amendment.
// Additive only: adds TR-4..TR-11 mechanism pins, adds acceptance criteria to FR-1/FR-2/FR-4/FR-5,
// clarifies TS-1/TS-4/TS-12, and adds TS-13..TS-20. Removes nothing.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001';

const { data: prd, error: readErr } = await sb
  .from('product_requirements_v2')
  .select('id, functional_requirements, technical_requirements, test_scenarios, acceptance_criteria, metadata')
  .eq('id', PRD_ID).single();
if (readErr) { console.error('READ FAILED', readErr); process.exit(1); }

const fr = JSON.parse(JSON.stringify(prd.functional_requirements));
const tr = JSON.parse(JSON.stringify(prd.technical_requirements));
const ts = JSON.parse(JSON.stringify(prd.test_scenarios));
const ac = JSON.parse(JSON.stringify(prd.acceptance_criteria));

const byId = (arr, id) => arr.find((x) => x.id === id);

// -- FR acceptance criteria additions (additive; nothing removed) ----------------------------
byId(fr, 'FR-1').acceptance_criteria.push(
  "TESTING-PIN (flag shape): the on-demand flag is exactly `--now`, a boolean flag, combined with `--apply` (`--apply --now`). `--now` WITHOUT `--apply` stays a dry-run and must return the existing dry_run shape with the on-demand window_slot -- never a send. A test asserts the literal string '--now' in argv is what enables the path (not '--on-demand'/'--force'/'--send-now'), so the flag name is pinned by a test rather than invented at EXEC time.",
  "TESTING-PIN (--reason): `--reason` is OPTIONAL and is NOT PERSISTED -- michael_checkpoint_send_ledger has no free-text reason column (id, et_date, window_slot, outcome, refusal_code, provider_message_id, body_sha256, body_len, created_at, updated_at) and adding one would be a chairman-gated migration outside this SD's scope. An on-demand send with no --reason must behave identically to one with a --reason; a test asserts both invocations produce the same ledger row shape. If EXEC concludes --reason MUST be durable, that is a scope escalation back to PLAN, not an ad-hoc column.",
  "TESTING-PIN (guard order): the quiet-hours check sits IMMEDIATELY AFTER the window/on-demand branch and BEFORE the dry-run return, the enable/disable read, the cap read, the dedup check, the pin read, the identity resolution and the staged-ledger write. FR-1's prose enumerates it last for narrative reasons only; implementing it literally last (after the :195 staged row) would stage a SEND_IN_PROGRESS row that counts against the 4/day cap under SEC-H2 and only THEN refuse, permanently burning a cap slot on a refusal. TS-15 is the ordering proof.",
);
byId(fr, 'FR-2').acceptance_criteria.push(
  "TESTING-PIN (in-JS selection, not a query-level filter): the finished_at/attempt selection MUST be done in plain JS over an unfiltered read, NOT via a query-level .not('finished_at','is',null) or order+limit. This is the convention this very file already documents at checkpoint-send.mjs:143-144 ('Read unfiltered-by-outcome so both the real Supabase client and the in-memory test double can apply this OR in plain JS'). Reason: scripts/michael/checkpoint-send.test.js's fakeSb applies ONLY `eq` operations when answering a read -- .order(), .not(), .is() and .limit() are recorded into `ops` and then ignored. A query-level implementation is therefore invisible to the unit tier: the fake returns every fixture row in fixture order, so a CORRECT query-level implementation fails TS-1 and an INCORRECT one can pass it by fixture accident.",
  "TESTING-PIN (attempt must be selected): readProducingFeederCounts currently reads `{ select: 'counts,finished_at,status' }` -- `attempt` is NOT in the select list, even though the existing code orders by it (legal in Postgres, but undefined on the returned JS objects). Any in-JS sort/max over `attempt` therefore operates on `undefined` for every row and silently degrades to 'first row Postgres happened to return' -- replacing the ordering bug with a different nondeterminism bug. The select list MUST be widened to include `attempt`, and a test must assert it (either by asserting the recorded select string contains 'attempt', or via an adversarially-ordered fixture per TS-1).",
);
byId(fr, 'FR-4').acceptance_criteria.push(
  "TESTING-PIN (threshold is 60 minutes, not 'simply differ'): the multi-time disclosure fires when max(finished_at) - min(finished_at) across the producing feeders that CONTRIBUTED A COUNT exceeds 60 minutes. The existing AC's '(or simply differ)' escape clause is unfalsifiable and operationally wrong: the three producing feeders are scheduled at 04:00/04:30/04:45 ET (lib/michael/feeder.mjs FEEDERS), so their finished_at values essentially ALWAYS differ -- a 'simply differ' rule fires the disclosure on every single send and becomes noise the chairman learns to ignore. TS-4 must assert BOTH sides of the 60-minute boundary (a 45-minute spread does NOT disclose; a 90-minute spread DOES).",
);
byId(fr, 'FR-5').acceptance_criteria.push(
  "TESTING-PIN (use resolveQuietHoursContext, not resolveAllowQuietHours): FR-5's prose names resolveAllowQuietHours but quotes the TWO-variable expression isSmsQuietHour(now, chairmanZone), which that resolver cannot supply -- it returns only a boolean. The live precedent FR-5 cites actually imports and calls resolveQuietHoursContext (scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs:75 import, :311 dep, :322 call, :339 use), the BATCHED resolver returning { allowQuietHours, chairmanZone } in a single round trip. Using resolveAllowQuietHours alone leaves chairmanZone undefined, silently falling back to America/New_York and discarding the chairman's configured notifications.timezone -- the exact capability SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 FR-2 added. Use resolveQuietHoursContext; isSmsQuietHour remains the in-window predicate (FR-5's core correction stands).",
  "TESTING-PIN (injectable dep, or TS-9/TS-10 cannot run at the unit tier): runCheckpointSend's deps are today { sb, argv, now, sendFn, resolveIdentity, recipientSha256 } -- there is NO injection point for the quiet-hours resolver, and resolveQuietHoursContext/resolveAllowQuietHours construct a REAL ChairmanPreferenceStore (lib/eva/chairman-preference-store.js:144 -> createSupabaseServiceClient()) when no store is passed. A unit test would hit the live database or fail opaquely. Add a resolveQuietHours dep following the established precedent at backstop-sweep:311 (`const resolveQuietHours = deps.resolveQuietHoursContext || resolveQuietHoursContext;`). A test must assert the production default is the real resolver (the dep is undefined-by-default, not a permissive stub).",
  "TESTING-PIN (resolver failure is fail-closed and must stay that way): resolveQuietHoursContext returns { allowQuietHours: false, chairmanZone: DEFAULT_ZONE } on ANY throw -- i.e. a failed preference read ENFORCES quiet hours rather than bypassing them. checkpoint-send.mjs must NOT wrap the call in its own try/catch that substitutes a permissive default. TS-17 proves it.",
);

// -- New technical requirements --------------------------------------------------------------
tr.push(
  { id: 'TR-4', title: 'window_slot on the on-demand path: windowIdFor returns null, and the column is NOT NULL',
    description: "checkpoint-send.mjs:118 computes windowSlot = windowIdFor(minuteOfDay, windowConfig). windowIdFor (lib/michael/feeder.mjs:112-119) returns **null** when the minute falls in no window -- which is the defining condition of the on-demand path. michael_checkpoint_send_ledger.window_slot is TEXT NOT NULL (database/migrations/20260914_michael_checkpoint_send.sql:36). Removing or branching around the inWindow early-return WITHOUT also substituting a non-null slot makes EVERY on-demand ledger write (the quiet-hours refusal row, the DISABLED held row, the CAP_EXCEEDED row, the pin/identity refusal rows, and the staged SEND_IN_PROGRESS row) a NOT NULL violation in production. The in-memory fakeSb does NOT enforce NOT NULL, so the entire on-demand unit suite would pass green over a verb that fails on its first real invocation. EXEC must compute the on-demand slot explicitly and never let null reach an insert." },
  { id: 'TR-5', title: 'on-demand window_slot VALUE: a per-minute-stamped variant, not a bare constant',
    description: "The on-demand window_slot is on-demand:HH:MM (the ET hour:minute of the invocation, zero-padded), NOT a bare 'on-demand'. Rationale, both limbs load-bearing: (a) the app-level dedup at checkpoint-send.mjs:157 refuses when any sent-or-in-progress row shares this slot value -- with a bare constant, the SECOND on-demand send of any day refuses ALREADY_SENT_THIS_WINDOW, making FR-1's 'on-demand sends count toward the same 4/day cap' unreachable (the real on-demand ceiling would be 1/day, not 4); (b) the DB partial unique index michael_checkpoint_send_ledger_sent_slot_uniq on (et_date, window_slot) WHERE outcome='sent' would reject the second on-demand 'sent' row at FINALIZE time, yielding LEDGER_FINALIZE_RACE_LOST for a text that was actually delivered -- an audit trail that lies about a real send. The per-minute stamp keeps dedup meaningful (two fires in the same ET minute still dedup, which is the crash/double-fire case the dedup exists for) while leaving four on-demand sends reachable. It also cannot collide with a fixed-window slot value, which is always a bare HH:MM from the FEEDERS registry." },
  { id: 'TR-6', title: 'the on-demand path is a BRANCH, not a deletion of the window gate',
    description: "The fixed-window path must keep the exact inert { ok: true, inert: true, reason: 'outside_et_window' } return for an out-of-window fire with no --now (the Task Scheduler fires checkpoint-send ~96 times/day and ~88 of those are inert, writing no row and making no call -- FR-6). The on-demand flag branches around that return; it does not remove it. TS-11 plus the existing 'window gate (FR-6/M6)' describe block are the regression proof; a run where that block still passes but --now is accepted is the required end state." },
  { id: 'TR-7', title: 'fakeSb answers reads with eq-filters ONLY -- the unit tier cannot observe query-level operators',
    description: "scripts/michael/checkpoint-send.test.js's fakeSb builds its result set as (tables[table]||[]).filter(r => every eq matches); every other recorded operation (.order, .not, .is, .limit, .single on a read) is pushed into ops and never applied. Any FR-2/FR-3 behavior expressed as a query-level operator is therefore untested AND appears broken at the unit tier while being correct in production (and vice versa). Two consequences EXEC must honour: (1) implement selection logic in plain JS over unfiltered reads (TR-8 / FR-2's TESTING-PIN); (2) a test that wants to assert a query-level operator WAS issued must inspect the recorded ops array, not the returned rows." },
  { id: 'TR-8', title: 'the completion predicate is finished_at IS NOT NULL, applied in JS, with a deterministic tiebreak',
    description: "Per FR-2, finished_at IS NOT NULL is the only unambiguous completion signal (status has no 'finished' literal and 'skipped' is dual-purpose). Implemented in JS: filter the feeder's rows to those with a non-null/non-empty finished_at, then take the one with the HIGHEST attempt (which requires TR-9's select widening). A tie on attempt is impossible under the michael_feeder_runs_date_feeder_attempt_uniq unique index on (et_date, feeder, attempt), so no further tiebreak rule is needed -- but the implementation must not silently depend on array order for the non-tie case." },
  { id: 'TR-9', title: 'widen readProducingFeederCounts select list to include attempt',
    description: "checkpoint-send.mjs:88 reads { select: 'counts,finished_at,status' }. attempt must be added. Without it, TR-8's in-JS max-by-attempt reads undefined on every row, the comparison is always false, and selection silently degrades to 'whatever row Postgres returned first' -- a fresh nondeterminism bug wearing the fix's clothes. This is the single most likely way for this SD to ship green tests over an unfixed verb." },
  { id: 'TR-10', title: 'db-tier tests collect ZERO from inside a .worktrees checkout and exit 0',
    description: "vitest.config.js's db project sets passWithNoTests: true and the shared exclude list drops **/.worktrees/** (the constraint tests/ddl/michael-checkpoint-send-ddl.db.test.js documents in its own header). A db-tier test added for this SD and run from this worktree therefore collects zero tests and exits 0 -- indistinguishable from a passing run. Any db-tier scenario in this PRD must be verified from the MAIN checkout post-merge, and EXEC must not present a bare exit-0 from inside the worktree as evidence it ran." },
  { id: 'TR-11', title: 'quiet-hours refusal writes a ledger row and must NOT consume cap budget',
    description: "FR-5 requires the quiet-hours refusal to write a ledger row -- deliberately unlike the out-of-window inert case (FR-6) and unlike the backstop sweep's drop-no-row behavior, because an on-demand attempt is an operator-initiated act that should leave a trace. That row is outcome='refused', refusal_code='QUIET_HOURS'. Because the cap filter at checkpoint-send.mjs:151 counts only outcome='sent' OR refusal_code='SEND_IN_PROGRESS', a QUIET_HOURS row correctly does NOT count against the 4/day cap -- a chairman who fires three on-demand sends at 2am and then one at 9am must still have four sends available. TS-16 asserts this rather than leaving it to inference." },
);

// -- Clarify existing scenarios (field edits, none removed) -----------------------------------
Object.assign(byId(ts, 'TS-1'), {
  scenario: "readProducingFeederCounts with an ADVERSARIALLY ORDERED fixture: for the same feeder + et_date, an in-flight row with finished_at NULL and the HIGHER attempt number (e.g. attempt 3), plus an older FINISHED row with a LOWER attempt number (e.g. attempt 2, finished_at set) -- and, in the fixture array, the in-flight row listed FIRST. All three properties are load-bearing: a fixture that puts the finished row at the higher attempt does not exercise the bug at all (the current code already picks the highest attempt), and a fixture that lists the finished row first passes even with no fix, because fakeSb ignores .order() and returns rows in fixture order.",
  expected: "The finished (attempt 2) row's counts are used; the in-flight (attempt 3, finished_at NULL) placeholder is ignored -- reproducing the 2026-09-14 22:00Z race (ledger a8388820). Must additionally assert the read selected attempt (TR-9), otherwise the in-JS max-by-attempt is comparing undefined and the pass is an accident.",
});
Object.assign(byId(ts, 'TS-4'), {
  scenario: "composeCheckpointBody / summarizeCounts at BOTH sides of the 60-minute disclosure threshold (FR-4 TESTING-PIN): case A, three feeders whose finished_at values span 45 minutes; case B, three feeders whose finished_at values span 90 minutes.",
  expected: "Case A: NO multi-time disclosure (a 45-minute spread is the normal 04:00/04:30/04:45 schedule and must not fire). Case B: the body discloses that counts are drawn from different times. A test asserting only case B would be satisfied by an implementation that discloses unconditionally.",
});
Object.assign(byId(ts, 'TS-12'), {
  scenario: "On-demand send's ledger row: assert window_slot is the non-null per-minute-stamped value on-demand:HH:MM (TR-4/TR-5), never null and never a bare 'on-demand'",
  expected: "window_slot is a non-null string matching the on-demand:HH:MM shape, distinguishable from a fixed-window slot (bare HH:MM), participates in FR-7 dedup, and counts toward the shared 4/day cap. NOTE: the in-memory fake does NOT enforce the column's NOT NULL constraint, so this assertion is the ONLY unit-tier protection against the null-slot production failure TR-4 describes -- it must assert the value explicitly, not merely that a write occurred.",
});

// -- New scenarios ----------------------------------------------------------------------------
ts.push(
  { id: 'TS-13', type: 'unit',
    scenario: 'Cap accumulation ACROSS both kinds: a ledger pre-seeded with 2 fixed-window sent rows (window_slot 06:00, 10:00) and 2 on-demand sent rows (window_slot on-demand:08:12, on-demand:09:30), then a 5th attempt of EACH kind',
    expected: "Both the 5th fixed-window attempt and the 5th on-demand attempt refuse CAP_EXCEEDED -- proving FR-1's 'on-demand sends count toward the same 4/day cap' is a single shared budget, not two budgets of four. TS-8 only tests a cap already at 4 from fixed-window rows and cannot distinguish a shared budget from a separate one." },
  { id: 'TS-14', type: 'unit',
    scenario: 'A SECOND on-demand send on the same ET day, at a different ET minute, with only one prior on-demand sent row and the cap not reached',
    expected: "Succeeds -- does NOT refuse ALREADY_SENT_THIS_WINDOW. This is the direct falsification of the bare-'on-demand' constant slot value (TR-5): with a constant, the dedup check at checkpoint-send.mjs:157 refuses here and the real on-demand ceiling is 1/day rather than 4. Companion assertion: two on-demand fires in the SAME ET minute DO dedup to ALREADY_SENT_THIS_WINDOW (the per-minute stamp must not disable dedup entirely)." },
  { id: 'TS-15', type: 'unit',
    scenario: 'Guard ORDER proof: an on-demand invocation inside quiet hours where EVERY later guard would also refuse -- checkpoint-send disabled, ledger already at the 4/day cap, CHAIRMAN_PHONE unset (pin mismatch), and resolveIdentity returning null',
    expected: "The returned refusal_code is the QUIET_HOURS one, not DISABLED / CAP_EXCEEDED / RECIPIENT_HASH_MISMATCH / IDENTITY_UNCONFIGURED -- proving the quiet-hours guard sits BEFORE all of them (FR-1 TESTING-PIN). Additionally assert EXACTLY ONE ledger write occurred and it is the QUIET_HOURS row: a guard placed after the :195 staged-ledger write would produce a SEND_IN_PROGRESS row first, which counts against the cap under SEC-H2 and permanently burns a cap slot on a refusal. TS-9 in isolation passes under either ordering." },
  { id: 'TS-16', type: 'unit',
    scenario: 'Three QUIET_HOURS-refused ledger rows already exist for the ET date, then a valid on-demand send outside quiet hours',
    expected: "Sends successfully -- QUIET_HOURS rows (outcome='refused', not 'sent' and not SEND_IN_PROGRESS) do NOT count against the 4/day cap (TR-11). Guards against an implementation that stages a row before the quiet-hours check or that writes outcome='held' in a way the cap filter would later count." },
  { id: 'TS-17', type: 'unit',
    scenario: 'The injected quiet-hours resolver THROWS (or the underlying ChairmanPreferenceStore read fails) during an on-demand invocation at an ET minute inside 22:00-06:00',
    expected: "Fail-closed: refuses QUIET_HOURS. Proves checkpoint-send.mjs did not wrap the resolver in its own try/catch substituting a permissive default, and that resolveQuietHoursContext's own catch ({ allowQuietHours: false, chairmanZone: DEFAULT_ZONE }) is what governs (FR-5 TESTING-PIN)." },
  { id: 'TS-18', type: 'unit',
    scenario: 'CLI shape pinning: --apply --now (no --reason), --apply --now --reason "chairman asked", and --now WITHOUT --apply',
    expected: "The first two behave IDENTICALLY (same ledger row shape, same send) -- --reason is optional and not persisted (FR-1 TESTING-PIN); michael_checkpoint_send_ledger has no column for it. The third returns the dry_run shape with the on-demand window_slot and writes NO ledger row and makes NO external call (FR-6's dry-run rule is not weakened by the on-demand path). A test asserting the literal --now token is what enables the path pins the flag name against ad-hoc renaming." },
  { id: 'TS-19', type: 'unit',
    scenario: 'SEC-H1 regression under the new flag: --apply --now --et-date 2099-01-01',
    expected: "Still refuses ET_DATE_OVERRIDE_NOT_ALLOWED before any read (sb.froms is empty), exactly as TR-3 requires. The on-demand path must not become a second route to the calendar-walking cap bypass SEC-H1 closed -- an on-demand send is a live send for the real current ET date." },
  { id: 'TS-20', type: 'db',
    scenario: "DB-tier (vitest --project db, or the tests/ddl ephemeral-Postgres tier): insert a ledger row with the on-demand window_slot value produced by the implementation, and a second 'sent' row with the SAME on-demand window_slot for the same et_date",
    expected: "The first insert succeeds (window_slot is NOT NULL and the value is non-null -- the in-memory fake cannot prove this, TR-4), and the second 'sent' insert is rejected by michael_checkpoint_send_ledger_sent_slot_uniq (23505), confirming the on-demand slot participates in the same DB-level FR-7 dedup as a fixed-window slot. MUST be run from the MAIN checkout post-merge: the db project excludes **/.worktrees/** and sets passWithNoTests:true, so a run from this worktree collects zero tests and exits 0 (TR-10)." },
);

// -- Top-level acceptance criteria additions --------------------------------------------------
ac.push(
  "No ledger write on the on-demand path ever passes window_slot=null -- windowIdFor returns null outside every window and the column is TEXT NOT NULL, and the in-memory test double does not enforce it (TR-4)",
  "Four on-demand sends are actually reachable in one ET day: the on-demand slot value is per-minute-stamped, so the app-level dedup and the DB partial unique index do not cap on-demand at one per day (TR-5, TS-14)",
  "The quiet-hours guard refuses BEFORE the enable/cap/pin/identity guards and before any staged ledger row, proven by a chained scenario in which every later guard would also have refused (TS-15)",
  "FR-2's selection is implemented in plain JS over an unfiltered read with attempt in the select list -- the unit tier's fake ignores .order()/.not(), so a query-level implementation is neither tested nor testable there (TR-7/TR-8/TR-9)",
);

const metadata = { ...(prd.metadata || {}) };
metadata.plan_to_exec_testing_amendment = {
  amended_at: new Date().toISOString(),
  amended_by: 'TESTING sub-agent (PLAN-TO-EXEC test-plan falsification)',
  gaps_closed: [
    'G-1 fakeSb ignores .order()/.not() -- TS-1 was vacuous or inverted',
    'G-2 attempt not in readProducingFeederCounts select list',
    'G-3 windowIdFor returns null off-window vs window_slot TEXT NOT NULL',
    'G-4 bare on-demand slot constant caps on-demand at 1/day',
    'G-5 FR-5 names resolveAllowQuietHours but quotes a two-variable expression',
    'G-6 no injection point for the quiet-hours resolver (unit tier would hit live DB)',
    'G-7 guard order unpinned; FR-1 prose reads as after the staged ledger row',
    'G-8 no scenario for the resolver own failure path',
    'G-9 TS-4 threshold unfalsifiable (or simply differ)',
    'G-10 --reason has no destination column',
    'G-11 db-tier collects zero tests from a worktree and exits 0',
    'G-12 --now flag name and --apply pairing never pinned',
  ],
  added: {
    technical_requirements: ['TR-4', 'TR-5', 'TR-6', 'TR-7', 'TR-8', 'TR-9', 'TR-10', 'TR-11'],
    test_scenarios: ['TS-13', 'TS-14', 'TS-15', 'TS-16', 'TS-17', 'TS-18', 'TS-19', 'TS-20'],
  },
  retier: { 'TS-20': 'db -- the only scenario a fully-mocked unit test cannot prove (NOT NULL + partial unique index)' },
};

const { error: writeErr } = await sb.from('product_requirements_v2').update({
  functional_requirements: fr, technical_requirements: tr, test_scenarios: ts,
  acceptance_criteria: ac, metadata, updated_at: new Date().toISOString(),
}).eq('id', PRD_ID);
if (writeErr) { console.error('WRITE FAILED', writeErr); process.exit(1); }

console.log(`AMENDED: ${PRD_ID}`);
console.log(`  functional_requirements: ${fr.length} FRs (ACs added to FR-1/FR-2/FR-4/FR-5)`);
console.log(`  technical_requirements: ${tr.length} (was ${prd.technical_requirements.length})`);
console.log(`  test_scenarios: ${ts.length} (was ${prd.test_scenarios.length})`);
console.log(`  acceptance_criteria: ${ac.length} (was ${prd.acceptance_criteria.length})`);
