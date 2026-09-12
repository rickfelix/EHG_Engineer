#!/usr/bin/env node
/**
 * Store the PLAN-phase DESIGN sub-agent verdict for
 * SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D via the canonical evidence path.
 * Run from inside the SD worktree so executed_from_cwd reflects the tree analysed.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '..'), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const SD_ID = '3f128d5c-8168-4415-86cc-ab5da4663d11';
const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D';
const SESSION_ID = '85c82b18-0984-4948-bd86-1992cdf5170d';
const COMMIT = 'daf75d6dfd76de465642187810c460ac767f4680';
const REPORT_PATH = 'C:/Users/rickf/AppData/Local/Temp/claude/C--Users-rickf-Projects--EHG-EHG-Engineer/85c82b18-0984-4948-bd86-1992cdf5170d/scratchpad/design-plan-d-report.md';

const reportText = fs.readFileSync(REPORT_PATH, 'utf8');
const contentHash = createHash('sha256').update(reportText, 'utf8').digest('hex');

const F = (id, severity, title, detail, action) => ({ id, severity, title, detail, action });

const findings = [
  F('F1', 'HIGH',
    'inWindow boundary semantics conflict: FR-1(a) re-imports the tick\'s INCLUSIVE predicate while FR-1(b) specifies a HALF-OPEN window. Half-open removes one retry from every host feeder.',
    'scripts/michael-quiet-tick.mjs:45 is inclusive on both ends (`minuteOfDay >= s && minuteOfDay <= e`). FR-1(a) moves that exact function to lib/michael/feeder.mjs with "no third copy"; FR-1(b) states inert outside [window.start, window.end). Both cannot hold. Measured consequence: /SC MINUTE /MO 15 /ST 00:00 fires on :00/:15/:30/:45 and EVERY host feeder window ends exactly on a fire minute (tasks-classifier 04:30, calendar-read 05:00, gmail-triage 05:30). Inclusive gives tasks-classifier 4 fires (03:45/04:00/04:15/04:30), half-open gives 3; calendar-read 5 vs 4; gmail-triage 5 vs 4. That is one lost retry per feeder on a laptop whose dominant failure mode is being asleep. Half-open would also break the tick\'s 62 existing tests, which FR-1 itself requires to stay green.',
    'Keep inclusive [start, end] and restate FR-1(b). Additionally drop the `window = WINDOW_ET` DEFAULT parameter when the function moves: WINDOW_ET is the SEAT window 04:30-07:30 (michael-quiet-tick.mjs:30) and must not silently become a feeder default. Make `window` required and have the tick pass WINDOW_ET explicitly at its two call sites, lines 98 and 127.'),

  F('F2', 'HIGH',
    'runFeeder cannot see argv, so no CLI flag reaches the window gate or the et_date natural key.',
    'FR-1 specifies runFeeder({ feeder, venue, window, upstream, run }, { sb, env, now, logger }). Neither bag carries argv nor a date override, yet the harness owns the window gate and the et_date key. Both existing act verbs support a date override (gmail-act.mjs:49, todoist-act.mjs:51) and every acceptance test needs one to pin an ET date. NOTE: the two-argument (payload, deps) shape itself is CORRECT and is not a TR-1 violation - TR-1 governs runX verbs, and the library layer already uses (payload, deps): lib/michael/gmail-client.mjs:26 modifyThread({ threadId, addLabelIds, removeLabelIds }, { auth, gmailFactory, sb, enc, env }).',
    'Add etDateOverride to the config object (each feeder runX parses argv per family convention and passes it down), or add argv to the deps bag. Pick one and state it in FR-1 so five feeders do not each invent a path.'),

  F('F3', 'HIGH',
    'The ET-date flag is already inconsistent inside the michael family; five new feeders will copy both spellings unless the PRD pins one.',
    'gmail-act.mjs:49 reads `--date`; todoist-act.mjs:51 reads `--et-date`. The PRD names no flag at all for the feeders. Two feeders, two spellings, no rule.',
    'Standardize on --et-date for all five feeders and queue-read: it matches the et_date column, matches the newer of the two verbs, and leaves --date unambiguous inside calendar-read where "date" otherwise collides with calendar event dates. Document --date as unsupported on feeders. Name the choice in FR-1.'),

  F('F4', 'HIGH',
    'The exit-code contract omits its middle value; a failed RUN and a REFUSAL are not the same event, and the code is chairman-visible in Task Scheduler.',
    'TR-1 names only 0 and 2. The family already uses both non-zero values: retention.mjs:109 exits 1 on job failure; gmail-act.mjs:88 and todoist-act.mjs:114 exit 2 on refusal. A status=failed run (row written, work attempted, gauge will see it) is not a refusal (no row, nothing attempted). Under Task Scheduler the exit code is the chairman\'s "Last Result" column.',
    'State the three-way explicitly in TR-1: 0 = inert/ok/degraded; 1 = a failed run row was written; 2 = refusal with no row and no work (coded throw, bad args, APPLY_NOT_LANDED, wrong venue). This also keeps the harness consistent with retention.mjs, which already ships exit 1 on failure.'),

  F('F5', 'HIGH',
    '--apply is undefined for calendar-read and tasks-classifier, yet FR-8 registers all three host feeders with --apply.',
    'FR-8 registers `scripts/michael/<feeder>.mjs --apply` for all three. FR-4/FR-5 define --apply for gmail-triage only. FR-3 (calendar-read) and FR-6 (tasks-classifier) never mention it and both write rows, with tasks-classifier also CREATING Todoist tasks. If EXEC implements dry-run-by-default without wiring the flag, the registered task writes nothing every morning and still exits 0 - invisible to child G\'s gauge, since a successful no-op run is indistinguishable from a successful run.',
    'State that every feeder is dry-run by default with --apply executing (the retention.mjs shape, which is what both the workflow and the registrar invoke), and add a per-feeder acceptance criterion that --apply is required for any write. Also record the merge-order constraint: PR 7 must not merge before PR 4b, because PR 4a refuses --apply with APPLY_NOT_LANDED while PR 7 registers a task that passes it.'),

  F('F6', 'HIGH',
    'The FR-1(i) harness log line on stdout will corrupt --json output, violating a rule this family states in a header and attributes to prior DESIGN evidence.',
    'FR-1(i) requires single-line JSON logs `[michael:<feeder>] {...}`. scripts/michael-quiet-tick.mjs:17 states the family rule verbatim: "--json prints ONLY the result object (no QUIET_TICK lines) - DESIGN evidence 8601cbdd". A harness log on stdout breaks every --json consumer, including the seat and any future gauge parser. `logger` also has no michael-family precedent; the nearest is the setup-*-task.mjs family\'s `deps.logger || console` (setup-alarm-cron-tasks.mjs:202).',
    'Default the harness logger to a STDERR writer (or suppress it entirely under --json), and add an acceptance criterion that under --json stdout contains exactly one parseable JSON object.'),

  F('F12', 'HIGH',
    'The eight-PR plan does not fit FR-10\'s own 400 LOC ceiling; four of eight PRs overshoot at this family\'s measured test:source ratio.',
    'MEASURED test:source in-family, close to 1:1 - db.mjs 119/93, rules.mjs 95/95, gmail-client.mjs 41/38, retention.mjs 114/112, autonomy-read.mjs 134/156. MEASURED insertions of the sibling -B/-C child PRs via git show --stat: 505, 562, 283, 341, 310, 311 (two already over 400). Projecting child D at that ratio: PR1 (feeder.mjs ~300 with ten enumerated behaviours + assembleReadiness + window helpers + gracefulExit, plus rules-match.mjs ~120, plus two tests at 1:1) lands near 840; PR6 (todoist-brief + workflow + wiring test + unit test) near 520; PR8 (queue-read + classify-apply + two tests + contract paragraph) near 480; PR2 near 440. PRs 3, 4a, 4b and 5 fit as scoped (~380/330/220/390).',
    'Go to eleven PRs: split PR1 into 1a (harness + test + tick import) and 1b (matcher + test); split PR6 into 6a (feeder + test) and 6b (workflow + wiring test); split PR8 into 8a (queue-read + test) and 8b (classify-apply + test + contract paragraph); and take the builder-REUSE path in PR7 per F13 (~330 reuse vs ~450 mirror). Per-FILE sizing is healthy - every source file lands in the 100-300 band; feeder.mjs at ~300 is at the top of it and should be re-checked at PR 1a review, but splitting its window predicates out would defeat FR-1(a)\'s single-import goal for the tick.'),

  F('F7', 'MEDIUM',
    'gracefulExit should be DEFINED in the harness, not imported from a cron script; importing it would invert the lib/scripts dependency direction.',
    'gracefulExit(exitCode, { backstopMs = 4000 }) exists in TEN cron scripts (chairman-morning-brief-sweep.mjs:137, eva-scheduler-watcher.mjs:347, chairman-decision-sla-sweep.mjs:257, and seven more) with ZERO cross-script imports - only a test imports one. lib/michael/feeder.mjs importing scripts/cron/chairman-morning-brief-sweep.mjs would pull that script\'s whole module graph into all five feeders.',
    'Define gracefulExit inside lib/michael/feeder.mjs. One copy serves all five feeders, which is the same "no third copy" logic FR-1(a) applies to the window helpers.'),

  F('F8', 'MEDIUM',
    'Feeder ids have no database CHECK, so a typo writes a valid row that child E and child G silently never match.',
    'michael_feeder_runs.feeder is bare `TEXT NOT NULL` (20260906_michael_tables.sql:153), unlike venue and status which carry CHECKs (lines 156-157). A misspelled id produces a well-formed row; assembleReadiness and the feeder-health gauge simply never see it, and the failure presents as a MISSING run, not as a typo. This is the dead-by-construction class.',
    'Export a frozen FEEDERS registry from feeder.mjs covering calendar-read, gmail-triage, tasks-classifier, todoist-brief, seat-classify and the already-shipped retention (retention.mjs:87 writes feeder: \'retention\'). Have runFeeder refuse an unregistered id and have assembleReadiness\'s requirement table reference the same constants. Add it as an acceptance criterion so the constraint is falsifiable.'),

  F('F9', 'MEDIUM',
    'assembleReadiness({ runs, now }) hard-codes the 05:45 deadline and the required-feeder set, duplicating a constant the tick already holds privately.',
    'scripts/michael-quiet-tick.mjs:32 holds `const BRIEF_DEADLINE_ET = \'05:45\'` privately. FR-1 puts the same 05:45 inside assembleReadiness. Child E then cannot vary either the deadline or the required-feeder set in a test, and the deadline exists in two files with nothing linking them.',
    'Signature: assembleReadiness({ runs, now, required = READINESS_REQUIREMENTS, deadlineEt = BRIEF_DEADLINE_ET }) with both constants EXPORTED from feeder.mjs, and have the tick import BRIEF_DEADLINE_ET in the same PR-1 edit that moves hhmmToMinutes/inWindow.'),

  F('F10', 'MEDIUM',
    'michael_staged_items has no natural key and no et_date, so FR-6\'s staged rows duplicate on any retry - and FR-6 has no idempotency acceptance criterion.',
    'The table (20260906_michael_tables.sql:315-329) has only `CREATE INDEX ... (kind) WHERE dispositioned_at IS NULL` - no et_date column, no unique index. FR-6 stages task_route and tasks_cleanup rows with no dedupe, so a second fire inside the 03:45-04:30 window after a degraded run stages the same items again and the seat grades duplicates. FR-4 received an explicit idempotency criterion ("re-running with the same fixture writes no duplicate rows"); FR-6 did not.',
    'No DDL needed: put a deterministic payload.dedupe_key (ET date + source item id) on each staged row, read undispositioned rows of that kind first through the bounded readRows, skip keys already staged, and add the matching acceptance criterion to FR-6.'),

  F('F11', 'MEDIUM',
    'michael_gmail_labels has NO writer anywhere in the repo, so two FR-4 branches are unreachable on the first run - the requirement reads as wired and yields nothing.',
    'keep_in_inbox, class and summarize default to false/NULL (20260906_michael_tables.sql:83-93). A repo-wide grep for michael_gmail_labels across scripts/ and lib/ returns exactly one hit: retention.mjs:31, which lists the table as NEVER_TOUCHED. Nothing writes it. FR-4 both (a) excludes "every keep_in_inbox label" from threads.list and (b) degrades when "a configured label" is missing from Gmail. With an empty registry the exclusion is a no-op and the degrade branch is unreachable.',
    'Name the seeding path in the PRD (child F\'s Cowork import per docs/michael/02-SPEC.md:143, or a documented chairman DML insert), and add an acceptance criterion that the reconcile upsert writes ONLY label_id, name and last_seen_in_gmail_at and never clobbers class/keep_in_inbox/summarize - the same discipline as "never overwrite a row whose action_taken_at is set".'),

  F('F13', 'MEDIUM',
    'FR-8 leaves "reused or mirrored" open for the Task Scheduler builders; the choice is worth ~120 LOC and decides whether PR 7 clears the ceiling.',
    'scripts/setup-alarm-cron-tasks.mjs already EXPORTS buildWrapperScript, buildHiddenTrAction, buildCreateArgs, buildRemoveArgs, buildQueryArgs, buildQueryXmlArgs and verifyHiddenLaunch, all pure. /RU and /NP can be appended to buildCreateArgs output (schtasks accepts them after /F); setup-eva-watcher-task.mjs:97-108 is the precedent and resolves the user via process.env.USERNAME || process.env.USER || os.userInfo().username (line 61), skipping /NP for well-known service accounts. Mirroring adds ~120 duplicated lines and a SEVENTH copy of a pattern that file\'s own header calls "the house pattern, repeated independently across 6 sibling setup-*-task.mjs scripts with no shared library".',
    'Choose REUSE and say so in FR-8. Caution: that module also exports its own parseArgs and main, and parseArgs collides by name with lib/michael/db.mjs:95 - import the builders by name only.'),

  F('F14', 'MEDIUM',
    'TASK_NAME_ILLEGAL_CHARS is a consumer-only guard: it is referenced by a TEST, never by the code path that builds the schtasks argv.',
    'setup-alarm-cron-tasks.mjs:58 exports TASK_NAME_ILLEGAL_CHARS; the only other references in the repo are tests/unit/fleet/setup-alarm-cron-tasks.test.js lines 16, 29 and 31. buildCreateArgs (line 125) validates taskName for TRUTHINESS only and never checks the constant. QF-20260906-961 - the colon that made schtasks /Create fail with "The parameter is incorrect" on the chairman\'s elevated run - is one day old and nothing in the code path prevents its recurrence in a new registrar.',
    'Validate the three task names against the imported constant INSIDE the new registrar\'s build path, and have its test assert the throw rather than asserting the constant\'s contents.'),

  F('F15', 'LOW',
    'Do not privatize the registrar\'s main: the setup-*-task.mjs family EXPORTS main(argv, deps), and that export is what the spec\'s "main(argv, deps)" wording refers to.',
    'setup-alarm-cron-tasks.mjs:200 is `export async function main(argv = process.argv, deps = {})` returning { exitCode, action }, and the sibling tests drive it. TR-1\'s "private main()" is a michael-family VERB rule. Applying it uniformly to the registrar would remove the test entry point its six siblings use.',
    'State the split in the PRD: michael-family feeders keep a private main() behind isMainModule; the registrar keeps the exported main(argv, deps) returning { exitCode, action }.'),

  F('F16', 'LOW',
    'Workflow cron math is CORRECT as measured, but TR-7 cites the wrong skeleton for the DST pair, and two wiring-test fork details are order- and regex-sensitive.',
    'VERIFIED: EDT (UTC-4) `*/15 8-9 * * *` yields ET 04:00-05:45 and EST (UTC-5) `*/15 9-10 * * *` yields the same, both covering the 04:45-05:30 window with four in-window fires. But TR-7 says workflows use "the michael-retention-cron.yml skeleton with both DST cron lines" and that workflow is WEEKLY with a single cron line (\'0 4 * * 0\') - it has no DST pair to copy. The both-DST-with-trailing-ET-comment convention lives in chairman-morning-brief-cron.yml:29-30 and drive-report-cron.yml:48-49. Fork details: (1) michael-retention-wiring.test.js:18 forbids /GOOGLE|OAUTH|TODOIST|ENCRYPTION|LEO_KEYS|ANTHROPIC|CLIENT_SECRET|REFRESH_TOKEN/i, so the fork must drop TODOIST from that alternation while keeping the exact-secret-set assertion at line 15; (2) line 23 asserts env keys with an ORDER-SENSITIVE toEqual([...]), so TODOIST_API_TOKEN\'s position must be fixed in the PRD or the test and workflow will disagree on ordering alone. ALSO VERIFIED: no file under .github/workflows/ references GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET or MICHAEL_ENCRYPTION_KEY today, so FR-7\'s grep acceptance criterion is satisfiable.',
    'Cite michael-retention-cron.yml for the secrets/env/steps skeleton and chairman-morning-brief-cron.yml for the DST cron pair. Fix TODOIST_API_TOKEN as the LAST env key, after the Supabase trio, and note the forbidden-token regex edit in the FR-7 acceptance criteria.'),

  F('F17', 'LOW',
    'The three .cmd wrappers are gitignored generated artifacts, but the implementation approach lists them as Phase 3 deliverables.',
    '.gitignore:498 ignores `scripts/cron/*-task.cmd`, and FR-8\'s scripts/cron/michael-<feeder>-task.cmd matches the glob - correct by construction, matching setup-alarm-cron-tasks.mjs whose wrappers are also uncommitted. But the wrappers embed the HOST-ABSOLUTE repo root via `cd /d "<repoRoot>"` (buildWrapperScript line 95), so force-adding one would commit a host path.',
    'State in the PRD that the wrappers are generated at register time, are gitignored, and must not be force-added. (One legacy exception exists in tree: scripts/cron/account-usage-sample-task.cmd is committed.)'),

  F('F18', 'LOW',
    'The FR-1(c) inert envelope drops the tables_absent flag the rest of the family sets.',
    'FR-1(c) returns { ok:true, action:\'inert\', reason:\'tables_absent\' }; retention.mjs:80 returns { ok:true, tables_absent:true, ... }. Nothing consumes the feeder envelope programmatically today, so this is safe now.',
    'Set tables_absent: true on that branch as well, so a future reader that greps the flag the rest of the family uses is not silently wrong.'),

  F('F19', 'LOW',
    'FR-4/FR-6/FR-7 say "active michael_rules domain X" without naming the loader that already exists, inviting a fourth read path.',
    'lib/michael/rules.mjs:14 exports loadRulesAndClosures(sb, { domain, includeSuperseded, now }) with the status=\'active\' filter and deterministic ordering. RULE_DOMAINS (line 7) already contains gmail, todoist and tasks; AUTO_APPLY_VERBS (line 8) already contains label, archive and reschedule, of which FR-7 uses the label/reschedule subset.',
    'Name loadRulesAndClosures in FR-4, FR-6 and FR-7. It also fetches closures the feeders do not need, which is harmless.'),

  F('F20', 'LOW',
    'Adding the harness makes a third copy of the ET minute-of-day expression.',
    '`etLocalHour(now) * 60 + etLocalMinute(now)` appears at scripts/michael-quiet-tick.mjs:96 and scripts/periodic-liveness-watcher.mjs:248.',
    'Export etMinuteOfDay(now) from feeder.mjs and use it in the tick during the same PR-1 edit that moves hhmmToMinutes/inWindow.'),

  F('F21', 'LOW',
    'The spec\'s stampLastFired self-stamp is dropped from every FR without the PRD saying so.',
    'docs/michael/02-SPEC.md:105 requires host feeders to be "self-stamping stampLastFired". No FR mentions it. The drop is DEFENSIBLE: michael_feeder_runs is the liveness signal child G reads, stampLastFired only UPDATES an already-registered self_stamped row, and lib/governance/orphan-writers-registry.js has no michael entry today. But that registry exists to catch exactly this class - its line 191 documents a process that never calls stampLastFired while a watcher evaluates its last_fired_at.',
    'State the drop and its reason in the PRD so child G does not register a periodic-liveness row that nobody stamps.'),
];

const conditions = [
  { action: 'F1: resolve the inWindow boundary conflict - keep INCLUSIVE [start,end] (half-open costs each host feeder one */15 retry and breaks the tick\'s 62 tests) and drop the WINDOW_ET default when the helper moves', priority: 'high', blocking: true },
  { action: 'F2: give runFeeder a path to argv or an etDateOverride - as specified the harness owns the window gate and et_date key but cannot see any CLI flag', priority: 'high', blocking: true },
  { action: 'F3: pin the ET-date flag name (recommend --et-date) before PR 3, since gmail-act uses --date and todoist-act uses --et-date', priority: 'high', blocking: true },
  { action: 'F4: state the three-way exit-code contract in TR-1 (0 inert/ok/degraded, 1 failed run row written, 2 refusal) - TR-1 currently omits 1, which retention.mjs already ships', priority: 'high', blocking: true },
  { action: 'F5: define --apply for calendar-read and tasks-classifier (dry-run default, retention.mjs shape) since FR-8 registers all three with --apply; record the PR 4b before PR 7 merge order', priority: 'high', blocking: true },
  { action: 'F6: default the harness logger to stderr or suppress under --json - stdout logs violate the tick\'s stated --json purity rule (DESIGN evidence 8601cbdd)', priority: 'high', blocking: true },
  { action: 'F12: revise the PR plan from eight to eleven (split 1, 6 and 8; reuse builders in 7) - at the measured 1:1 test:source ratio four of eight PRs exceed the 400 LOC ceiling FR-10 claims', priority: 'high', blocking: false },
  { action: 'F8/F10/F11: add the missing enforceability - a frozen FEEDERS registry (the feeder column has no CHECK), a dedupe key for staged items (no natural key on michael_staged_items), and the michael_gmail_labels seeding path plus a no-clobber upsert criterion', priority: 'medium', blocking: false },
  { action: 'F13/F14/F15: choose builder REUSE for the registrar, move the task-name illegal-char guard from the test into the build path, and keep the registrar\'s exported main(argv, deps)', priority: 'medium', blocking: false },
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence_score: 88,
  findings,
  critical_issues: findings.filter((f) => f.severity === 'HIGH').map((f) => `${f.id}: ${f.title}`),
  recommendations: conditions,
  justification: 'CONDITIONAL_PASS: the PRD is well-grounded (every column it names exists in the migration; the DST cron math is correct as measured; shape decisions cite real precedent), but seven HIGH findings are contract-level and would each ship a feeder that reads correct and is not. Six must be pinned before PR 1 and PR 3 are written (F1 window boundary, F2 argv path, F3 date flag, F4 exit codes, F5 --apply, F6 --json purity) and one revises the PR plan (F12, measured against this family\'s 1:1 test:source ratio and the sibling PRs\' 283-562 insertion range).',
  detailed_analysis: [
    'PLAN-phase DESIGN review for SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D. NO UI SURFACE: the deliverables are one ESM harness library, one pure matcher, three Google client modules, five CLI feeders, two seat CLI verbs, one GitHub Actions workflow and one Windows Task Scheduler registrar, all in EHG_Engineer (backend, no src/client per SD-ARCH-EHG-007). WCAG 2.1 AA, contrast, keyboard navigation, ARIA, responsive breakpoints, touch targets and React component-sizing checks are NOT APPLICABLE and were not run - see metadata.skip_reason. The review was reframed to the design surfaces that do exist: API shape, CLI ergonomics, file contracts, naming, and file/PR sizing.',
    '',
    'VERDICT: CONDITIONAL_PASS with 21 numbered findings (7 HIGH, 7 MEDIUM, 7 LOW). Six HIGH findings are contract-level and cheap now, expensive after five feeders have copied a wrong pattern; the seventh (F12) changes the PR plan.',
    '',
    'THE THROUGH-LINE. The harness is the right idea and the two-argument runFeeder(payload, deps) shape is CORRECT - it matches lib/michael/gmail-client.mjs:26 modifyThread(payload, deps), and TR-1\'s one-argument rule governs runX VERBS, not library functions. The spec\'s "main(argv, deps)" wording (02-SPEC.md:103) is satisfied in substance by runRetention({ sb, argv, now }): injectable deps, no process.argv read inside the tested unit. What is missing is not the shape but the CONTRACT AROUND it - four of the six blocking findings (F2 argv, F3 flag name, F4 exit codes, F5 --apply) are the same gap: the harness owns a decision (the window gate, the et_date key, the exit code, the write/no-write mode) that no specified interface can reach or express.',
    '',
    'F1 IS THE ONE WITH A MEASURED COST. FR-1(a) says re-import the tick\'s window predicate with no third copy; FR-1(b) says half-open. The predicate at michael-quiet-tick.mjs:45 is inclusive. Because Task Scheduler fires at */15 from 00:00 and every host feeder window ENDS exactly on a fire minute (04:30, 05:00, 05:30), half-open silently deletes one retry from each of the three host feeders - on a laptop whose dominant failure mode, per the PRD\'s own risk table, is being asleep. Keep inclusive.',
    '',
    'TWO DEAD-BY-CONSTRUCTION RISKS, both found by reading the migration rather than the PRD. (F8) michael_feeder_runs.feeder is bare TEXT with NO CHECK, unlike venue and status - a typo writes a valid row that assembleReadiness and child G\'s gauge never match, and it presents as a MISSING run rather than a typo. (F11) michael_gmail_labels has no writer anywhere in the repo (grep across scripts/ and lib/ returns one hit: retention.mjs:31, listing it as NEVER_TOUCHED), so on the first run FR-4\'s keep_in_inbox exclusion is a no-op and its "configured label missing" degrade branch is unreachable. Both requirements read as wired and yield nothing.',
    '',
    'ONE IDEMPOTENCY GAP THE ACS DO NOT COVER. FR-4 got an explicit "re-running writes no duplicate rows" criterion. FR-6 did not - and michael_staged_items (migration:315-329) has no et_date and no unique index, only an index on (kind) WHERE dispositioned_at IS NULL. A retry inside the 03:45-04:30 window stages the same items again and the seat grades duplicates. Fixable without DDL via a deterministic payload.dedupe_key plus a read-first skip.',
    '',
    'ON SIZING (F12). Measured, not asserted. Test:source in this family runs ~1:1 (db 119/93, rules 95/95, gmail-client 41/38, retention 114/112, autonomy-read 134/156), and the six sibling -B/-C child PRs measured 283, 310, 311, 341, 505 and 562 insertions via git show --stat - two already over 400. At that ratio PR1 projects near 840, PR6 near 520, PR8 near 480 and PR2 near 440. Eleven PRs, not eight. PER-FILE sizing is healthy: every source file lands in the 100-300 band, comfortably inside the 300-400 ceiling; feeder.mjs at ~300 sits at the top of it and should be re-checked at PR 1a review, but splitting its window predicates into a separate module would defeat FR-1(a)\'s single-import goal for the tick.',
    '',
    'ON THE REGISTRAR AND THE WORKFLOW. Both are close to right. The registrar\'s CLI surface (register default, --dry-run, --status, --verify, --remove, win32 guard exit 2, refuse when run-hidden.vbs is absent) matches setup-alarm-cron-tasks.mjs:186-279 exactly; task names carry no colon per QF-20260906-961. Three refinements: choose builder REUSE over mirroring (F13, ~120 LOC and the difference between passing and failing the ceiling), move the illegal-char guard out of the test and into the build path (F14 - TASK_NAME_ILLEGAL_CHARS is referenced ONLY by its test today, a consumer-only discriminator), and keep the exported main(argv, deps) that the sibling tests drive (F15). For the workflow: the DST cron pair is CORRECT as measured in both offsets, but TR-7 cites michael-retention-cron.yml for it, and that file is weekly with a single cron line - the pair convention lives in chairman-morning-brief-cron.yml:29-30 (F16).',
    '',
    'THE VERDICT-FILE CONTRACT IS THE STRONGEST PART. classify-apply satisfies the gate-evidence provenance ratification (6c263823) properly: producer, run_id, and a content_hash recomputed over canonicalJson(items+tasks) with db.mjs:80,87 - the same hash-subject discipline todoist-act.mjs:27 uses for content_sha256 - with PROVENANCE_MISSING and HASH_MISMATCH as named REFUSALS, not warnings. Every field it names exists in the migration. The tick already names classify-apply.mjs (michael-quiet-tick.mjs:148) and already counts the class-IS-NULL (line 107) and effort_grade-IS-NULL (line 109) queues, so FR-9\'s "no tick change needed beyond the harness import" holds as measured. Two small gaps: say that the hash subject deliberately excludes the envelope (so a later `version` field does not invalidate existing hashes), and define counts.sample (count of sampled threads, or rate) since child G renders it.',
    '',
    'EMPIRICAL BASIS. Every claim was measured against the worktree at daf75d6d. Column existence read directly from database/migrations/20260906_michael_tables.sql (all FR-3..FR-9 columns present; venue CHECK admits task_scheduler/gha/seat; status CHECK admits ok/degraded/failed/skipped/imported; feeder has NO check). Window semantics read at michael-quiet-tick.mjs:42-46 and fire minutes derived from /SC MINUTE /MO 15 /ST 00:00 in setup-alarm-cron-tasks.mjs:131. Exit codes read at retention.mjs:109, gmail-act.mjs:88, todoist-act.mjs:114. Date flags read at gmail-act.mjs:49 and todoist-act.mjs:51. gracefulExit copies counted by grep across lib/ and scripts/ (10 definitions, 1 importer, that importer a test). michael_gmail_labels writers counted by grep across scripts/ and lib/ (zero). TASK_NAME_ILLEGAL_CHARS references counted repo-wide (definition + 3 test references, zero in the build path). LOC ratios from wc -l; sibling PR sizes from git show --stat on 94aebeba809, 24c439dad23, 95f81fcf886, 2d14a920375, 9e722e6988c, 80e2542971b. DST cron coverage computed for both UTC offsets. Workflow secret grep run across all of .github/workflows/ (no GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / MICHAEL_ENCRYPTION_KEY). Wrapper ignore status confirmed via git check-ignore -v (.gitignore:498).',
  ].join('\n'),
  metadata: {
    session_id: SESSION_ID,
    content_hash: contentHash,
    report_sha256: contentHash,
    content_hash_note: 'metadata.content_hash is stamped by results-storage.js:840 over the ROW own final values (SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-A) and overwrites any caller value. report_sha256 is the sha256 of the full DESIGN report markdown at report_path, which is what binds the report to this row.',
    evaluated_commit_sha: COMMIT,
    branch: 'feat/SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D',
    report_path: REPORT_PATH,
    phase: 'PLAN',
    prd_id: 'PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D',
    skip_reason: 'UI/WCAG/accessibility/responsive/React-component-sizing checks NOT RUN: this child has no UI surface. Deliverables are a backend ESM harness library, a pure matcher, three Google client modules, five CLI feeders, two seat CLI verbs, one GitHub Actions workflow and one Windows Task Scheduler registrar, all in EHG_Engineer, which serves no UI (no src/client, backend API only per SD-ARCH-EHG-007). Applicable design surfaces reviewed instead: API shape, CLI ergonomics, file contracts, naming consistency, and file/PR sizing.',
    findings_by_severity: { HIGH: 7, MEDIUM: 7, LOW: 7 },
    blocking_conditions: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'],
    plan_conditions: conditions,
    measured_sizing: {
      family_test_to_source: { 'lib/michael/db.mjs': '119/93', 'lib/michael/rules.mjs': '95/95', 'lib/michael/gmail-client.mjs': '41/38', 'scripts/michael/retention.mjs': '114/112', 'scripts/michael/autonomy-read.mjs': '134/156' },
      sibling_child_pr_insertions: [505, 562, 283, 341, 310, 311],
      projected_pr_loc: { PR1: 840, PR2: 440, PR3: 380, 'PR4a': 330, 'PR4b': 220, PR5: 390, PR6: 520, PR7: '330 reuse / 450 mirror', PR8: 480 },
      recommended_pr_count: 11,
      per_file_band: '100-300 LOC, inside the 300-400 ceiling; feeder.mjs ~300 is the one to re-check at review',
    },
    verified_no_action_needed: [
      'Every column named across FR-3..FR-9 exists in database/migrations/20260906_michael_tables.sql (FR-10 no-missing-column claim holds as measured)',
      'venue CHECK admits task_scheduler|gha|seat; status CHECK admits ok|degraded|failed|skipped|imported',
      '(et_date, feeder, attempt) unique index matches the attempt-derivation and 23505-retry design',
      'DST cron pair */15 8-9 (EDT) and */15 9-10 (EST) both cover 04:45-05:30 ET with four in-window fires',
      'No .github/workflows file references GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET or MICHAEL_ENCRYPTION_KEY, so FR-7 grep AC is satisfiable',
      'scripts/cron/*-task.cmd is gitignored (.gitignore:498), matching the registrar wrapper naming',
      'michael-quiet-tick.mjs:148 already names classify-apply.mjs and lines 107/109 already count the class-null and effort_grade-null queues',
      'runFeeder two-argument (payload, deps) shape is consistent with lib/michael/gmail-client.mjs:26 and is not a TR-1 violation',
    ],
    analysis_trees: ['C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D (SD worktree at daf75d6d - the only tree scanned)'],
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'DESIGN',
  fallback: 'EHG_Engineer',
  probeExistsRelative: 'package.json',
  supabase,
});
console.log('Repo resolution:', JSON.stringify(resolution, null, 2));

applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('DESIGN', SD_ID, { name: 'DESIGN' }, results, {
  phase: 'PLAN',
  source: 'sub_agent_executor',
  sdKey: SD_KEY,
});

console.log('\n=== STORED ===');
console.log(JSON.stringify(stored, null, 2));
console.log('\ncontent_hash:', contentHash);
