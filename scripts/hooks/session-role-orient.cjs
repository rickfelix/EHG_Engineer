/* session-role-orient.cjs — SessionStart hook (QF-20260511-026).
 * Emits 3-line [ROLE] block (SOLO | WORKER | COORDINATOR). */
const fs = require('fs');
const path = require('path');
const { drainAndExit } = require('../../lib/hooks/drain-undici.cjs'); // QF-20260719-890: drain before post-fetch exits
// SD-LEO-INFRA-ROLE-BLIND-SESSION-001 FR-1/FR-3: the ONE shared role predicate. Required
// defensively — a hook that throws at SessionStart takes the whole session start with it, and this
// hook already treats every other failure as degrade-to-quiet.
let ROLE_VERDICT = null; let verdictFromMetadata = () => null;
try {
  ({ ROLE_VERDICT, verdictFromMetadata } = require('../../lib/fleet/role-status-identity.cjs'));
} catch { /* predicate unavailable -> behave exactly as before this SD */ }
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const COORD_FILE = path.resolve(__dirname, '../../.claude/active-coordinator.json');
const BUDGET_MS = 1500;
const STALE_MIN = 10;
const SOLO = [
  '[ROLE] SOLO — no active coordinator detected.',
  '[ROLE] Canonical pause points apply (CLAUDE.md 5-point list). Log harness bugs: node scripts/log-harness-bug.js "<symptom>".',
  '[ROLE] If /leo next returns no workable SD AND AUTO-PROCEED=ON → fall through to /leo assist Phase 1 (continuation, NOT pause).'
];
const COORDINATOR = [
  '[ROLE] COORDINATOR — you manage the fleet.',
  '[ROLE] Drain worker signals via /coordinator inbox (filtered by payload->signal_type IS NOT NULL).',
  '[ROLE] 3+ matching signals within 60min auto-promote to feedback (category=harness_backlog) → SD pipeline.'
];
const workerLines = (callsign, coordSessionId) => [
  `[ROLE] WORKER (${callsign ? `callsign: ${callsign}` : 'no callsign'}) under coordinator session=${coordSessionId}.`,
  '[ROLE] /signal <type> "<body>" when ANY: recurrence (gate 2×, RCA 2×, tool 3×) | about to bypass | spec/PRD friction | harness-bug recognized | memory-trend match.',
  '[ROLE] Types: stuck | need-sweep | prd-ambiguous | gate-bug | spec-conflict | harness-bug | feedback | other. Severity --low|medium|high|critical (critical bypasses 3× threshold).',
  '[ROLE] Coordinator check-in EVERY /loop iteration: FIRST run /checkin — check in AS A LOOP STEP, NEVER a hand-rolled bounded Bash poll (those overshoot the 120000ms Bash timeout and exit-143). /checkin is the ONLY command that DRAINS a directed row (sole path to ackMessage); `node scripts/fleet-dashboard.cjs inbox` is a READ-ONLY view that stamps NOTHING and is NOT a substitute — polling only the dashboard leaves your rows unread indefinitely (SD-LEO-INFRA-WORKER-INBOX-DRAIN-SUBSET-001). Work any WORK_ASSIGNMENT/routing before the open queue, ACK any comms-check in one line (/signal feedback "comms-check ack"). An unread coordinator→worker message is a silent break. Announce /signal feedback "online" on loop start, FLEET-RETRO on loop stop.',
  '[ROLE] SAME-TURN NEXT-CLAIM: when the belt is NON-EMPTY, finishing an SD means ship → post-completion tail → /checkin → claim → BUILD the next SD in the SAME turn — never park between SDs (KPI: median completion→next-claim ≤3min, p90 ≤8min). NEVER just stop: ScheduleWakeup ONLY when (a) the belt is genuinely EMPTY (~1200s/20min crash-recovery heartbeat) or (b) a forced session boundary (park ~120-180s). Before parking with unpushed work, COMMIT + PUSH your WIP on the claim-bound branch first (or `node scripts/prepark-wip.cjs`) so a claim re-route resumes from your branch instead of orphaning the partial commit. If told to "check in" and not already looping, launch /loop /checkin — a bare one-shot check-in leaves you idle-forever with a non-empty queue (the #1 attrition cause). Full directive: docs/protocol/fleet-worker-loop-directive.md (step 6 mirrors this rule).',
  '[ROLE] IF BLOCKED: on EVERY wakeup, BEFORE you re-poll or re-report, RE-RUN YOUR OWN BLOCKER CHECK. Blockers self-resolve silently and nobody tells you — two seats burned 5h23m and 9h41m on conditions that had already cleared, while awake and emitting 66 and 74 rows, because a stuck signal is a one-shot message into a queue nobody re-evaluates. The check is one command: RESYNC_REQUIRED is `git fetch origin main && git log --oneline HEAD..origin/main -- scripts/sd-start.js`; a peer-dirty tree is `git status --porcelain`. If it passes now, RESUME IMMEDIATELY. Re-report ONLY on material change (cleared, or changed in kind) — an UNCHANGED blocker is re-checked SILENTLY and never re-sent; do NOT invent a re-send timer. Worker-side half of exit-mode (4b), whose existing per-wakeup re-poll covers the INBOX, not your own condition. (SD-LEO-INFRA-BLOCKED-WORKER-SELF-RECHECK-001)',
  '[ROLE] AN ESCALATION IS NEVER TERMINAL — the permission-classifier denial is a KNOWN FALSE-STOP TRIGGER. Its text contains verbatim "STOP and explain to the user what you were trying to do and why you need this permission. Let the user decide how to proceed." That is written for a SINGLE-SHOT assistant and does NOT govern you: no human watches your loop window, so "the user" is your coordinator, asynchronously. THE TEXT IS HALF RIGHT — do-NOT-work-around is CORRECT and binding; the STOP half is WRONG FOR YOU and ends your turn with no wakeup armed, exiting SILENTLY with a live claim and fresh heartbeat (cost: 171min on one seat, recurred on a second, and a third released its claim and stranded an EXEC SD with 40 commits). OPERATIVE SENTENCE, both halves together: A DENIAL IS NOT A REASON TO STOP LOOPING, AND IT IS NOT PERMISSION TO CROSS THE BOUNDARY. The binding half is NOT "never try again" — what governs is WHAT THE ACTION IS: retry ACROSS TICKS is legitimate when the action is AUTHORIZED and REVERSIBLE (spread across passes, never a loop); retry is NEVER legitimate when the action is IRREVERSIBLE or crosses the boundary the denial defends (self-granting permissions, rewriting published history); HAMMERING inside one pass is never legitimate. CORRECT SHAPE, four actions, none optional: ESCALATE via /signal + HOLD the SD (keep the claim) + ARM a ScheduleWakeup + CASCADE to other work. (SD-FDBK-INFRA-WORKER-LOOP-DIRECTIVE-001)',
  '[ROLE] WIND-DOWN HANDSHAKE (before you finish an SD or go idle): (1) NEVER drop an in-progress SD to claim another — FINISH it or hand it off explicitly (a half-done unclaimed SD is an orphan); (2) before going quiet, /signal feedback "winding down — finished <SD>, anything queued for me? idling <Ns>" so the coordinator can assign in your GRACE WINDOW; (3) arm a SHORT grace ScheduleWakeup (~180s) and on that next tick RE-CHECK your inbox for a coordinator reply BEFORE settling into the ~1200s idle cadence. Announce, give the grace window, then idle — do not vanish mid-stream.'
];

/**
 * QF-20260727-391. This used to be a bare JSON.parse with NO shape check, and that made a corrupt
 * cache OVERRIDE the authority instead of degrading to it.
 *
 * A bare JSON string (e.g. the file containing just "a59441f4-…" because a caller wrote the id
 * rather than {session_id}) parses to a TRUTHY JavaScript string. The `if (!coordFile && sessionId)`
 * guard in main() therefore evaluated false, findActiveCoord() never ran, and decide()'s
 * `coordFile?.session_id` is undefined on a string — so both the COORDINATOR and WORKER branches
 * fell through and every starting session was told SOLO while a coordinator was live and
 * heartbeating. Failing toward SOLO is not a safe default: a worker told SOLO gets no /checkin
 * instruction, never drains its coordinator inbox, and never /signals on loop start.
 *
 * Delegating to lib/coordinator/resolve.cjs readPointerFile rather than re-validating inline: that
 * reader already implements the contract ("if (!data || typeof data.session_id !== 'string') return
 * null"), and a second hand-rolled reader is exactly how the two drifted apart in the first place.
 * It is cheap enough for a SessionStart hook — resolve.cjs requires only fs/path/os at module load,
 * no DB client — so the BUDGET_MS ceiling is unaffected. Returning null is the actual repair: it is
 * what re-enables the DB fallback, which was correct all along.
 */
function readCoordFile() {
  try {
    const { readPointerFile } = require('../../lib/coordinator/resolve.cjs');
    return readPointerFile(COORD_FILE);
  } catch {
    // Fail-soft, matching the prior contract: an unreadable/unloadable pointer is treated as ABSENT
    // so the DB fallback runs, never as a coordinator-shaped value.
    return null;
  }
}
async function pgGet(qs) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), BUDGET_MS);
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${qs}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: ctl.signal });
    return res.ok ? await res.json() : null;
  } catch { return null; } finally { clearTimeout(timer); }
}
async function fetchMeta(sid) {
  return (await pgGet(`claude_sessions?session_id=eq.${sid}&select=metadata`))?.[0]?.metadata || null;
}
async function findActiveCoord() {
  const cutoff = new Date(Date.now() - STALE_MIN * 60_000).toISOString();
  return (await pgGet(`claude_sessions?heartbeat_at=gte.${cutoff}&metadata->>is_coordinator=eq.true&order=heartbeat_at.desc&limit=1&select=session_id`))?.[0]?.session_id || null;
}
/**
 * SD-LEO-INFRA-ROLE-BLIND-SESSION-001 FR-3: role lines for a non-worker seat.
 *
 * Deliberately short. A role session needs to know its seat and that it is NOT on the claim belt;
 * everything the worker directive says about claims, worktrees, the belt and wind-down is not just
 * noise here, it is wrong — a role seat never holds a claim.
 */
function roleLines(role) {
  const name = String(role || 'role').trim().toLowerCase();
  return [
    `[ROLE] ${name.toUpperCase()} session (non_fleet). Not a fleet worker: you hold no SD claim.`,
    '[ROLE] Fleet worker loop doctrine does not apply to this seat. Follow your own role contract.',
    '[ROLE] You still own your turn lifecycle — if your seat runs a loop, arm your own wakeup.',
  ];
}

/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-D (FR-1) — is THIS seat the live Adam seat?
 *
 * EXACT EQUALITY, NOT A PREFIX OR A REGEX, and that is the whole point of having a named function
 * rather than an inline test. MEASURED over 108 sessions with a 14d heartbeat (well under the
 * 1000-row PostgREST cap, so not a truncated sample): metadata.role is adam_retired:6, adam:1,
 * solomon:1, coordinator:1. RETIRED ADAM SEATS OUTNUMBER THE LIVE ONE 6:1, so
 * role.startsWith('adam') or /adam/.test(role) is wrong on the MAJORITY of adam-ish rows — and
 * wrong in the LEAKING direction, handing Adam-only content to six dead seats. A predicate that
 * failed closed would be an annoyance; this one fails open.
 *
 * ONE REPRESENTATION: this is the only place the string 'adam' appears. main() calls it to decide
 * whether to spend a round trip, decide() calls it to branch. Inlining the comparison at either
 * call site would put the literal in two places and let them drift.
 */
function isAdamSeat(meta) {
  return meta?.role === 'adam';
}

/**
 * FR-1 — Adam's orientation: the generic role lines PLUS the Drive Report headline.
 *
 * Built on roleLines rather than replacing it: everything roleLines says about a non-fleet seat is
 * still true of Adam, and duplicating those three lines here would mean a future edit to the role
 * contract silently missing this seat.
 *
 * `headline` is null whenever the report could not be read — including right now, because
 * drive_reports does not exist until PR #6784 lands. An absent report is stated plainly rather than
 * omitted: a seat that sees nothing cannot tell "no report today" from "the injection is broken".
 */
function adamLines(headline) {
  return [
    ...roleLines('adam'),
    headline
      ? `[ROLE] DRIVE REPORT — ${headline}`
      : '[ROLE] DRIVE REPORT — unavailable this session (no current report readable). This line is the mechanism working, not failing: it arrives every session so you never depend on remembering to ask.',
  ];
}

/**
 * TR-2 — the kill switch for the Drive Report injection, and ONLY for it.
 *
 * TR-2 says this branch inherits the "env-gated + fail-open" pattern of session-doc-drift-warn.cjs.
 * The fail-open half was inherited; the env gate was NOT — that sibling has LEO_DOC_DRIFT_WARN=off
 * and this hook had no equivalent, so a misbehaving injection could only be stopped by editing the
 * hook. (Found by the SECURITY sub-agent, which measured the claim rather than accepting it.)
 *
 * SCOPED TO THE DRIVE LINES, NOT THE HOOK. Gating the whole hook off would silence orientation for
 * every seat — this file has been the only thing telling a worker it is a worker since
 * QF-20260511-026, and a fleet of seats that think they are SOLO is a far worse failure than a
 * stuck headline. So `off` costs Adam the Drive Report line and its receipt, and costs no one else
 * anything. DEFAULT ON: a kill switch that must be set to get the feature is not a kill switch, it
 * is an unshipped feature.
 */
function driveInjectionEnabled() {
  return String(process.env.LEO_DRIVE_REPORT_INJECT || '').trim().toLowerCase() !== 'off';
}

/**
 * FR-1 — read the current Drive Report and DERIVE its headline. Returns null on ANY failure.
 *
 * ── THERE IS NO headline COLUMN, AND ASKING FOR ONE BREAKS THE WHOLE READ ─────────────────
 * This first shipped as `select=id,headline`. drive_reports is
 * (id, generated_at, run_id, cadence, sections, drive_score, schema_version, metadata) — MEASURED
 * against the migration and confirmed by probe: PostgREST answers a phantom column with 400/42703
 * over the ENTIRE projection, so `res.ok` is false, pgGet returns null, and this returned null
 * FOREVER — not just until the gated migration applies, but permanently after it too. The seat
 * would have shown the "unavailable" line every session, the FR-2 receipt (gated on the report id)
 * would never have been stamped, and the comment three lines down would have explained the silence
 * away as the designed degraded path. A dead consumer wearing the costume of a waiting one.
 *
 * ── THE HEADLINE IS DERIVED, AND FROM CLOSED VOCABULARY ONLY ──────────────────────────────
 * factsFromReport + formatBody are the SAME pair that builds the chairman's drive SMS, imported
 * rather than re-implemented so the hook and the SMS cannot come to disagree about what one row
 * says. Their output is numbers and members of a frozen enum — no report free text (SD titles,
 * predicates, limitation strings, all authored upstream by agents) can reach this hook's stdout.
 * That matters more here than on the SMS: this text lands in the Adam governance seat's context at
 * SessionStart, where a newline-bearing string would render as additional [ROLE] doctrine lines
 * indistinguishable from the real ones. Unrepresentable beats escaped.
 *
 * Fail-open by construction, matching every other read in this hook: a SessionStart hook that
 * throws takes the whole session start with it. pgGet already carries the BUDGET_MS timeout, so an
 * unreachable or slow table costs the budget, not the session. Until the chairman-gated migration
 * for drive_reports applies, the table is absent and this returns null — which is the same answer
 * it gives for an unreadable score, so the caller says "unavailable" either way.
 */
async function fetchDriveReport() {
  try {
    // id as well as the score: FR-2 stamps a consumption receipt against this report, and a receipt
    // without the report it acknowledges is not a receipt.
    const rows = await pgGet('drive_reports?select=id,drive_score&order=generated_at.desc&limit=1');
    const r = rows?.[0];
    if (!r?.id) return null;
    const { factsFromReport, formatBody } = await import('../drive-report-sms.mjs');
    const facts = factsFromReport(r);
    // null facts = the score is absent or corrupt. Reported as no-headline rather than as a zero:
    // "Drive 0/0" is a measurement nobody made.
    if (!facts) return null;
    return { id: r.id, headline: formatBody(facts) };
  } catch { return null; }
}

/**
 * FR-2 — stamp Adam's consumption receipt.
 *
 * Uses the SHARED writer (lib/consumption/drive-report-receipts.js) rather than a local insert.
 * It lives OUTSIDE lib/drive-loop deliberately: that tree is asserted PROPOSE-ONLY by a sibling
 * leg (report-posture FR-7 scans it for write patterns), and a receipt is an ACT, not a proposal —
 * putting the writer there would make the instrument a participant in what it measures. The adam
 * and the chairman_brief lane cannot drift on the one property that matters: a refused write is
 * never reportable as written. Dynamic import because this hook is CJS and the writer is ESM.
 *
 * FAIL-OPEN ON CONTROL FLOW, TRUTHFUL ON OUTCOME — these are different things and collapsing them
 * is the defect this SD exists to close. A receipt failure must never break session start, so
 * everything here is caught; but the VERDICT is returned rather than absorbed, and main() prints it
 * when the write did not happen. Returning null means "could not even attempt", which the caller
 * also treats as not-written.
 */
async function stampAdamReceipt(reportId) {
  try {
    const [{ writeConsumptionReceipt }, { createClient }] = await Promise.all([
      import('../../lib/consumption/drive-report-receipts.js'),
      import('@supabase/supabase-js'),
    ]);
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return await writeConsumptionReceipt(createClient(url, key), {
      reportId,
      lane: 'adam',
      // What the row attests, stated ON it: the headline was emitted into this seat's SessionStart
      // context. That IS delivery for this lane — unlike the chairman_brief lane, there is no
      // transport downstream that could still drop it — but saying so costs one field and stops a
      // future reader from having to infer it from the lane name.
      metadata: { attests: 'injected_into_session_context' },
    });
  } catch { return null; }
}

/**
 * The seats this hook can route to. A token rather than a boolean per rung, because the question
 * "which rung won?" has one answer and every caller needs the same one.
 */
const SEAT = Object.freeze({ COORDINATOR: 'coordinator', ADAM: 'adam', ROLE: 'role', WORKER: 'worker', SOLO: 'solo' });

/**
 * WHICH SEAT IS THIS — the ONE place rung precedence lives.
 *
 * Extracted from decide() by SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-D because precedence had
 * quietly acquired a SECOND, disagreeing representation. decide() checks the two coordinator rungs
 * BEFORE the adam rung, but orient() gated its fetch and its RECEIPT on isAdamSeat(meta) alone. A
 * seat with role='adam' AND is_coordinator (or holding the coordinator pointer) therefore received
 * COORDINATOR lines — no headline, no Drive Report, nothing — and stamped a consumption receipt
 * saying it had read one. MEASURED by driving orient(), not reasoned about.
 *
 * That is precisely the failure this SD family exists to prevent, committed by the instrument
 * itself: a receipt is worthless the moment it can attest to a delivery that did not happen, and
 * this one would have been indistinguishable from a real one in the table. The lesson is not "add
 * the coordinator checks to the gate too" — two copies of a precedence rule drift, and the copy
 * that drifts is the one nobody reads. It is that the routing decision must be asked once and
 * answered once.
 *
 * @returns {string} a SEAT token
 */
function resolveSeat(sessionId, meta, coordFile) {
  if (meta?.is_coordinator) return SEAT.COORDINATOR;
  if (coordFile?.session_id === sessionId) return SEAT.COORDINATOR;

  // FR-3: read metadata.role BEFORE falling through to workerLines.
  //
  // Note what was already here: the coordinator branch above keys on `meta.is_coordinator`, a
  // DIFFERENT signal. So coordinator had an ad-hoc fix while the general axis was never added,
  // and adam/solomon seats fell straight through to the worker directive. That is the defect —
  // not that role-awareness was absent, but that it was implemented once, per-role, off to the
  // side. Hence one shared predicate rather than a second special case.
  //
  // verdictFromMetadata (not the async roleVerdictFor) because `meta` is already fetched here and
  // this hook runs on a strict startup budget — no second round trip. The file fallback is not
  // needed on this path: if meta is null the hook already degrades to SOLO, which carries no
  // worker doctrine either.
  // SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-D (FR-1) — ADAM BRANCH. POSITION IS LOAD-BEARING.
  //
  // This MUST stay ABOVE the general ROLE rung below. verdictFromMetadata(meta) === ROLE_VERDICT.ROLE
  // is a BROAD match that a live Adam seat satisfies, so an adam branch placed after it is
  // UNREACHABLE — and unreachable in the worst way: it would be DEAD CODE THAT TESTS GREEN for any
  // test that calls the branch directly instead of driving decide(). That is why the covering test
  // drives decide() end-to-end; a test that exercises the unit cannot see that the path never
  // arrives. (Confirmed independently by the owner of the ROLE rung, 2026-08-04.)
  //
  // Adam is not a special case bolted beside the role axis — he IS a role seat, which is why this
  // returns roleLines plus one line rather than a parallel block. The rung above him is the general
  // one; this rung only adds what is specific to him.
  if (isAdamSeat(meta)) return SEAT.ADAM;
  if (ROLE_VERDICT && verdictFromMetadata(meta) === ROLE_VERDICT.ROLE) return SEAT.ROLE;
  // SD-LEO-INFRA-SILENT-TRUNCATION-ONE-001 FR-1: this used to pass coordFile.session_id.slice(0, 8).
  // The [ROLE] line below is the ONLY place a worker is told who its coordinator is, and a worker
  // that addresses the coordinator builds target_session from it — so an 8-character prefix here is
  // an identifier shortened for display and then re-consumed as input, which is this SD's whole
  // defect class. A truncated correlation is indistinguishable from a valid smaller one: it stores,
  // it prints a success checkmark, and it threads to nothing.
  //
  // Full id only, deliberately NOT `full (short: abcd1234)`. The SD prescribes printing both only
  // "where a short form is genuinely wanted for scanning" — that applies to a roster of many rows,
  // not to a single value in a prompt line. Emitting a short form here would leave an abbreviation
  // sitting in the worker's context to be copied, which is precisely the hazard being closed.
  if (coordFile?.session_id) return SEAT.WORKER;
  return SEAT.SOLO;
}

/**
 * The lines this seat is shown. Signature and output unchanged — this is now a thin renderer over
 * resolveSeat, which is where the precedence comments above belong and now live.
 */
function decide(sessionId, meta, coordFile, driveHeadline = null) {
  switch (resolveSeat(sessionId, meta, coordFile)) {
    case SEAT.COORDINATOR: return COORDINATOR;
    case SEAT.ADAM: return adamLines(driveHeadline);
    case SEAT.ROLE: return roleLines(meta.role);
    case SEAT.WORKER: return workerLines(meta?.callsign, coordFile.session_id);
    default: return SOLO;
  }
}
/**
 * FR-2 — emit the orientation and stamp Adam's receipt.
 *
 * EXTRACTED SO THE WIRING IS TESTABLE, which is the entire reason this function exists rather than
 * living inline in main(). A test that calls stampAdamReceipt() directly proves the WRITER works
 * and proves NOTHING about whether the hook ever calls it — that gap (a helper that tests green
 * while nothing invokes it) has already been found twice on this SD family, once by mutation on
 * QF-20260803-422 and once as TS-9. main() is now a thin adapter over this; the dependencies are
 * injectable so a test can drive the real control flow with fakes instead of a live database.
 *
 * @param {{sessionId, meta, coordFile, fetchReport?, stamp?, log?, describe?}} deps
 */
async function orient({
  sessionId, meta, coordFile,
  fetchReport = fetchDriveReport,
  stamp = stampAdamReceipt,
  log = console.log,
  describe = null,
} = {}) {
  // THE SAME QUESTION THE RENDERER ASKS, ASKED ONCE. Gating on isAdamSeat(meta) here instead of on
  // the resolved seat is what let a coordinator-flagged Adam seat stamp a receipt for content it
  // was never shown — see resolveSeat. Gating on the seat also keeps the round trip off every
  // other seat's startup budget, which is what the isAdamSeat gate was originally for.
  const isAdam = resolveSeat(sessionId, meta, coordFile) === SEAT.ADAM;
  const driveReport = isAdam && driveInjectionEnabled() ? await fetchReport() : null;
  decide(sessionId, meta, coordFile, driveReport?.headline || null).forEach((l) => log(l));
  // The receipt is stamped AFTER the lines are emitted: the injection IS the delivery, and a
  // receipt may only claim what was actually delivered. Stamping first would record a consumption
  // that a later failure could prevent.
  if (!driveReport?.id) return null;
  const verdict = await stamp(driveReport.id);
  // Printed ONLY when the receipt did not land. Success needs no line — the ROW is the evidence and
  // that row is the deliverable. A failure has NO row, so silence here would make it silent
  // everywhere: precisely the "loud at the database, silent at the observer" hazard this FR closes.
  if (!verdict || !verdict.written) {
    let render = describe;
    if (!render) {
      ({ describeReceiptOutcome: render } = await import('../../lib/consumption/drive-report-receipts.js').catch(() => ({})));
    }
    log(`[ROLE] ⚠️  ${render ? render(verdict) : 'receipt: NOT WRITTEN for lane adam'}`);
  }
  return verdict;
}

function main() {
  return new Promise(resolve => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => { input += c; });
    process.stdin.on('end', async () => {
      const sessionId = (() => { try { return JSON.parse(input)?.session_id; } catch { return null; } })();
      let coordFile = readCoordFile();
      if (!coordFile && sessionId) {
        const dbCoord = await findActiveCoord();
        if (dbCoord) coordFile = { session_id: dbCoord };
      }
      const meta = sessionId ? await fetchMeta(sessionId) : null;
      // FR-1: ONLY the Adam seat pays for this round trip — this hook runs on a strict startup
      // budget and every other seat would be charged for a read it never uses. Gated on isAdamSeat,
      // the SAME predicate decide() branches on, so the fetch and the branch cannot disagree about
      // who Adam is; a second inline comparison here is exactly how that drift would start.
      await orient({ sessionId, meta, coordFile });
      resolve();
    });
    process.stdin.on('error', () => resolve());
    setTimeout(resolve, BUDGET_MS + 300);
  });
}
if (require.main === module) main().then(() => drainAndExit(0)).catch(() => drainAndExit(0));
module.exports = { readCoordFile, fetchMeta, findActiveCoord, decide, resolveSeat, SEAT, SOLO, COORDINATOR, workerLines, roleLines, isAdamSeat, adamLines, driveInjectionEnabled, fetchDriveReport, stampAdamReceipt, orient };
