#!/usr/bin/env node
// scripts/michael/checkpoint-send.mjs — the Tier-2 personal checkpoint send verb (ratification
// 561878ae): texts the chairman a fixed-template checkpoint at 4 daily ET windows, plus an
// on-demand send outside those windows (chairman ratification eb7e84b3, SD-LEO-INFRA-MICHAEL-
// CHAIRMAN-TEXTING-001), and can do nothing else.
//
// Usage (absolute path from the repo root; normally invoked by Task Scheduler via
// scripts/setup-michael-host-tasks.mjs's checkpoint-send entry, which appends --apply):
//   node scripts/michael/checkpoint-send.mjs --apply [--json]
//   node scripts/michael/checkpoint-send.mjs --apply --now [--reason "<text>"] [--json]
//     (on-demand: sends immediately outside the 4 fixed windows. --reason is optional and is
//     NEVER persisted -- michael_checkpoint_send_ledger has no free-text column for it; a send
//     with or without --reason behaves identically. Every existing guard still applies --
//     recipient pin, identity, enable/disable, daily cap -- PLUS a newly-wired quiet-hours
//     (22:00-06:00 ET) guard that has no equivalent on the fixed-window path, since none of the
//     4 fixed windows ever fall inside it by construction.)
//   node scripts/michael/checkpoint-send.mjs [--now] [--et-date YYYY-MM-DD] [--json]   (dry-run
//     only -- --et-date is REFUSED under --apply, SECURITY SEC-H1: a live send has no legitimate
//     use for an operator-supplied date, and allowing one lets --apply --et-date <fresh-date>
//     mint an unlimited number of real 4-per-day budgets by walking the calendar.)
//
// FR-1: same-day cap of 4, fail-closed on BOTH tables_absent and a generic ledger-read error --
//   read BEFORE the recipient/identity/send steps, so a failed cap read never falls through to a
//   live send. Counts outcome='sent' OR refusal_code='SEND_IN_PROGRESS' (SECURITY SEC-H2): an
//   unresolved staged row (crash, throw, or a concurrent fire racing the same window) must count
//   against the cap exactly like a confirmed send, or the cap can be silently exceeded.
// FR-2: recipient hash-pinned (tamper-evidence, not secrecy) -- QF-20260914-300: the pin is read
//   FRESH, every attempt, from the private service-role-only michael_checkpoint_send_enabled table
//   (config_key='recipient_pin', hash string in `reason` -- reuses the existing column, no new
//   column/table) rather than a hardcoded source constant. This repo is public, and a sha256 of a
//   ten-digit phone number is reversible by brute-force enumeration in minutes, so a hardcoded pin
//   would have published the chairman's number the moment it was set. A missing/unreadable pin row
//   fails exactly like a mismatched one (RECIPIENT_HASH_MISMATCH) -- fail-closed by construction.
// FR-3: identity via lib/michael/checkpoint-identity.mjs (all MICHAEL_TWILIO_* or null) threaded
//   through twilio-provider.js's additive `identity` parameter -- never the fleet-lane TWILIO_* vars.
// FR-4: body is a fixed template + counts + an as-of pointer, never raw personal text.
// FR-5: enable/disable row (michael_checkpoint_send_enabled) read fresh every attempt, fail-closed.
// FR-6: an "attempt" is an in-window, non-dry-run invocation. Out-of-window fires and dry-runs
//   write NO ledger row and make NO external call. Every other attempt (sent/held/refused) writes
//   exactly one row. A SEND attempt specifically stages the row BEFORE the external call (outcome
//   'refused'/SEND_IN_PROGRESS) and finalizes it after, so a crash between the Twilio call and the
//   DB write still leaves an audit trail rather than an uncounted send.
// FR-7: per-slot dedup via the window's own `start` string (lib/michael/feeder.mjs windowIdFor,
//   app-level, same sent-OR-in-progress set as FR-1) plus the DB's partial unique index on
//   (et_date, window_slot) WHERE outcome='sent' (defense in depth, proven at
//   tests/ddl/michael-checkpoint-send-ddl.db.test.js). SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001's
//   on-demand path mints its own non-null, per-minute-stamped slot (`on-demand:HH:MM`) so it
//   participates in this exact same dedup/cap mechanism -- see TR-4/TR-5 below.
// SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001:
//   FR-1: an on-demand invocation (--now) bypasses ONLY the fixed-window check; every guard
//     after it (enable/disable, cap, dedup, pin, identity, staged-ledger-before-send) is the
//     SAME code path as a fixed-window send, not a duplicate.
//   FR-2: readProducingFeederCounts now selects the latest row with finished_at IS NOT NULL per
//     feeder (in plain JS over an unfiltered read -- the unit-tier fake only applies .eq()
//     filters, so a query-level .not()/.order() would be invisible to it), never the previous
//     highest-`attempt`-regardless-of-completion row -- closes the 2026-09-14 22:00Z race
//     (ledger a8388820) where an in-flight run was read as if it were finished.
//   FR-3: a feeder with no finished run for the date is named "no run yet today" rather than
//     silently omitted from the composed text.
//   FR-4: the as-of pointer renders in plain ET; when the producing feeders' finished_at values
//     span more than 60 minutes, the body discloses that counts are from different times.
//   FR-5: a quiet-hours (22:00-06:00 ET) guard is wired into the on-demand path ONLY (the fixed
//     windows never intersect it by construction) -- composes lib/time/chairman-et-wall-clock.js's
//     isSmsQuietHour (the actual in-window predicate) with lib/comms/adam-outbound/
//     quiet-hours-extension.js's resolveQuietHoursContext (the batched chairman-zone + override
//     resolver -- NOT resolveAllowQuietHours alone, which cannot supply chairmanZone), mirroring
//     the live composition at scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs:339. Sits
//     immediately after the window/on-demand branch, before every other guard including the
//     dry-run return -- a guard placed later would burn a cap slot on a refusal (SEC-H2) or let a
//     later guard's refusal_code mask the real reason.
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, readRows, writeRows, refusal, emit, todayEt, sha256Hex } from '../../lib/michael/db.mjs';
import { FEEDERS, windowIdFor, etMinuteOfDay, isUniqueViolation } from '../../lib/michael/feeder.mjs';
import { resolveCheckpointIdentity } from '../../lib/michael/checkpoint-identity.mjs';
import twilioProvider from '../../lib/messaging/providers/twilio-provider.js';
import { isSmsQuietHour } from '../../lib/time/chairman-et-wall-clock.js';
import { resolveQuietHoursContext } from '../../lib/comms/adam-outbound/quiet-hours-extension.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CAP_PER_DAY = 4;
// TESTING L4: a NAMED key per feeder, never "the first numeric key" -- counts is JSONB, and
// Postgres does not preserve object-key insertion order (it orders by length then bytewise), so
// Object.entries(...).find(numeric) would pick a DIFFERENT field in production than in a JS-object
// test fixture (which does preserve insertion order), and the template's bare unlabelled number
// made a wrong pick invisible. Each entry is {feeder, key, label} so the composed body always
// names what the number counts.
const PRODUCING_FEEDER_COUNTS = Object.freeze([
  { feeder: 'calendar-read', key: 'meetings', label: 'meetings today' },
  { feeder: 'gmail-triage', key: 'unmatched', label: 'untriaged mail' },
  { feeder: 'todoist-brief', key: 'due_or_overdue', label: 'tasks due/overdue' },
]);
const PRODUCING_FEEDERS = Object.freeze(PRODUCING_FEEDER_COUNTS.map((c) => c.feeder));

/** Pure: best-effort counts-only summary + the oldest (most conservative) as-of timestamp across
 * the 3 producing feeders' latest FINISHED runs, plus every contributing finished_at (asOfAll,
 * FR-4's multi-time-disclosure input). Never touches raw text fields. A feeder with no finished
 * row is named explicitly (FR-3) rather than silently omitted. */
export function summarizeCounts(rowsByFeeder) {
  const parts = [];
  const asOfCandidates = [];
  for (const { feeder, key, label } of PRODUCING_FEEDER_COUNTS) {
    const row = rowsByFeeder[feeder];
    const hasCount = row && row.counts && typeof row.counts === 'object' && typeof row.counts[key] === 'number';
    if (hasCount) {
      parts.push(`${row.counts[key]} ${label}`);
      if (typeof row.finished_at === 'string') asOfCandidates.push(row.finished_at);
    } else {
      // FR-3: no finished row for this feeder today -- name it, never silently drop it.
      parts.push(`${feeder}: no run yet today`);
    }
  }
  const sorted = [...asOfCandidates].sort();
  return { summary: parts.length ? parts.join(', ') : 'no counts available', asOf: sorted[0] || null, asOfAll: asOfCandidates };
}

const ET_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });

/** Pure: formats an ISO-8601 timestamp as a plain ET time, e.g. "12:30pm ET" (FR-4). Returns null on an unparseable input. */
export function formatEtTime(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return null;
  const parts = ET_TIME_FORMATTER.formatToParts(d);
  const hour = parts.find((p) => p.type === 'hour')?.value;
  const minute = parts.find((p) => p.type === 'minute')?.value;
  const dayPeriod = parts.find((p) => p.type === 'dayPeriod')?.value?.toLowerCase();
  if (!hour || !minute || !dayPeriod) return null;
  return `${hour}:${minute}${dayPeriod} ET`;
}

// FR-4 TESTING-PIN: 60 minutes, not "simply differ" -- the 3 producing feeders are scheduled at
// 04:00/04:30/04:45 ET, so their finished_at values essentially always differ by a small amount;
// disclosing on any difference would fire on every send and become noise.
const MULTI_TIME_DISCLOSURE_THRESHOLD_MS = 60 * 60 * 1000;

/** Pure: the fixed-template body -- counts and an as-of pointer only, never raw personal text. */
export function composeCheckpointBody({ summary, asOf, asOfAll = [] }) {
  const formatted = asOf ? formatEtTime(asOf) : null;
  const asOfText = formatted ? `as of ${formatted}` : 'as-of unavailable';
  let disclosure = '';
  const times = asOfAll.map((t) => new Date(t).getTime()).filter((t) => !Number.isNaN(t));
  if (times.length > 1 && Math.max(...times) - Math.min(...times) > MULTI_TIME_DISCLOSURE_THRESHOLD_MS) {
    disclosure = ' Counts are from different times.';
  }
  return `Michael checkpoint: ${summary} (${asOfText}).${disclosure} Reply if anything looks wrong.`;
}

async function readProducingFeederCounts(sb, etDate) {
  const rowsByFeeder = {};
  for (const feeder of PRODUCING_FEEDERS) {
    const read = await readRows(
      sb, 'michael_feeder_runs',
      (q) => q.eq('et_date', etDate).eq('feeder', feeder),
      { select: 'attempt,counts,finished_at,status' },
    );
    if (read.tables_absent || read.error || !read.rows.length) continue;
    // FR-2/TR-8: finished_at IS NOT NULL is the only unambiguous completion signal (status has no
    // 'finished' literal and 'skipped' is dual-purpose -- claimAttempt writes it as the START
    // placeholder too). Selection is done in plain JS over an unfiltered read (TR-7): the
    // unit-tier fake only applies .eq() filters, so a query-level .not()/.order()/.limit() would
    // be invisible to it and let an incorrect implementation pass by fixture accident.
    const finished = read.rows.filter((r) => typeof r.finished_at === 'string' && r.finished_at);
    if (!finished.length) continue;
    // TR-9: `attempt` MUST be in the select list above, or this comparison is undefined on every
    // row and silently degrades to "whichever row Postgres happened to return first".
    let latest = finished[0];
    for (const r of finished) {
      if (r.attempt > latest.attempt) latest = r;
    }
    rowsByFeeder[feeder] = latest;
  }
  return rowsByFeeder;
}

/** The verb. deps: { sb, argv, now, sendFn, resolveIdentity, recipientSha256, resolveQuietHours }.
 * Never throws. recipientSha256, when supplied, OVERRIDES the DB-read pin -- test-only (main()
 * below never passes it, so production always reads the live private-store row fresh).
 * resolveQuietHours, when supplied, overrides resolveQuietHoursContext -- FR-5 TESTING-PIN: the
 * production default (undefined -> the real resolver) constructs a live ChairmanPreferenceStore,
 * so a unit test MUST inject a double here rather than let it hit the database. */
export async function runCheckpointSend({ sb, argv = [], now = new Date(), sendFn = twilioProvider.send, resolveIdentity = resolveCheckpointIdentity, recipientSha256, resolveQuietHours = resolveQuietHoursContext } = {}) {
  const a = parseArgs(argv);
  const isApply = Boolean(a.apply);
  // SEC-H1: --et-date has no legitimate meaning for a LIVE send (you cannot send yesterday's
  // checkpoint) and, left allowed, lets --apply --et-date <fresh-date> mint an unlimited number of
  // real 4-per-day budgets. Refused BEFORE date-format validation -- the override itself is the
  // problem, not merely a malformed one.
  if (isApply && typeof a['et-date'] === 'string') {
    return refusal('ET_DATE_OVERRIDE_NOT_ALLOWED', '--et-date is not permitted under --apply -- a live send always uses the real current ET date');
  }
  const etDate = typeof a['et-date'] === 'string' ? a['et-date'] : todayEt(now);
  if (!DATE_RE.test(etDate)) return refusal('DATE_INVALID', '--et-date must be YYYY-MM-DD');

  const windowConfig = FEEDERS['checkpoint-send'].window;
  const minuteOfDay = etMinuteOfDay(now);
  // FR-1: --now bypasses ONLY the fixed-window check below; every guard after it is unchanged.
  const isOnDemand = Boolean(a.now);
  let windowSlot = windowIdFor(minuteOfDay, windowConfig);
  if (windowSlot === null) {
    if (!isOnDemand) {
      // FR-6: an out-of-window fire with no --now is inert -- no ledger row, no external call,
      // matching every other Michael feeder's inert-outside-window convention.
      return { ok: true, inert: true, reason: 'outside_et_window' };
    }
    // TR-4/TR-5: windowIdFor returns null off-window, but window_slot is TEXT NOT NULL -- never
    // let that null reach an insert. Stamp a per-minute on-demand slot instead: this keeps FR-7
    // dedup meaningful (two fires in the same ET minute still dedup -- the crash/double-fire case
    // dedup exists for) while leaving all 4 daily sends reachable on-demand (a bare 'on-demand'
    // constant would cap on-demand at 1/day via this same dedup check). Never collides with a
    // fixed-window slot, which is always a bare HH:MM from the FEEDERS registry.
    const hh = String(Math.floor(minuteOfDay / 60)).padStart(2, '0');
    const mm = String(minuteOfDay % 60).padStart(2, '0');
    windowSlot = `on-demand:${hh}:${mm}`;
  }

  // FR-5 / FR-1 TESTING-PIN (guard order): sits immediately after the window/on-demand branch,
  // before EVERYTHING else -- including the dry-run return, the enable/disable read, the cap
  // read, dedup, the pin read, identity, and the staged-ledger-before-send write. Scoped to the
  // on-demand path only: the 4 fixed windows never fall inside 22:00-06:00 ET by construction, so
  // the fixed-window path is unaffected (FR-5 AC4).
  if (isOnDemand) {
    let allowQuietHours = false;
    let chairmanZone;
    try {
      ({ allowQuietHours, chairmanZone } = await resolveQuietHours(now));
    } catch {
      // FR-5 TESTING-PIN: fail-closed, not permissive -- an injected resolver that throws (or a
      // real ChairmanPreferenceStore read that fails) must still enforce quiet hours, matching
      // resolveQuietHoursContext's own internal catch (allowQuietHours:false, default zone).
      allowQuietHours = false;
      chairmanZone = undefined;
    }
    if (!allowQuietHours && isSmsQuietHour(now, chairmanZone)) {
      if (isApply) {
        // TR-11: an operator-initiated on-demand attempt leaves a trace even when refused.
        // outcome='refused' (not 'held', not SEND_IN_PROGRESS) so it never counts against the
        // 4/day cap -- the cap filter below only counts outcome='sent' OR
        // refusal_code='SEND_IN_PROGRESS'.
        await writeRows(sb, 'michael_checkpoint_send_ledger', (t) => t.insert({
          et_date: etDate, window_slot: windowSlot, outcome: 'refused', refusal_code: 'QUIET_HOURS',
        }));
      }
      return refusal('QUIET_HOURS', 'on-demand send refused -- inside the chairman quiet hours (22:00-06:00 ET)');
    }
  }

  if (!isApply) {
    // FR-6: a dry-run, even in-window, writes NO ledger row and makes NO external call.
    return { ok: true, dry_run: true, et_date: etDate, window_slot: windowSlot, would_send: true };
  }

  // FR-5: enable/disable row, read fresh (no cache), fail-closed on tables_absent, a read error, or
  // a missing/false row.
  const enabledRead = await readRows(sb, 'michael_checkpoint_send_enabled', (q) => q.eq('config_key', 'checkpoint_send'), { select: 'enabled' });
  if (enabledRead.tables_absent || enabledRead.error) {
    const code = enabledRead.tables_absent ? 'TABLES_ABSENT' : 'READ_FAILED';
    await writeRows(sb, 'michael_checkpoint_send_ledger', (t) => t.insert({ et_date: etDate, window_slot: windowSlot, outcome: 'held', refusal_code: code }));
    return refusal(code, 'enable-row read failed -- fail-closed (held)');
  }
  const enabledRow = enabledRead.rows[0];
  if (!enabledRow || enabledRow.enabled !== true) {
    await writeRows(sb, 'michael_checkpoint_send_ledger', (t) => t.insert({ et_date: etDate, window_slot: windowSlot, outcome: 'held', refusal_code: 'DISABLED' }));
    return refusal('DISABLED', 'checkpoint-send is disabled (michael_checkpoint_send_enabled.enabled is not true)');
  }

  // FR-1: same-day cap of 4, read BEFORE sending, fail-closed on BOTH branches. SEC-H2: counts
  // outcome='sent' OR refusal_code='SEND_IN_PROGRESS' -- an unresolved staged row (the send call
  // crashed, threw, or is still racing a concurrent fire in the same window) must count against
  // the cap/dedup exactly like a confirmed send, or a crash/overlap silently lets sends escape the
  // 4-per-day budget the chairman ratification is built on. Read unfiltered-by-outcome so both the
  // real Supabase client and the in-memory test double can apply this OR in plain JS.
  const ledgerRead = await readRows(sb, 'michael_checkpoint_send_ledger', (q) => q.eq('et_date', etDate), { select: 'window_slot,outcome,refusal_code' });
  if (ledgerRead.tables_absent || ledgerRead.error) {
    const code = ledgerRead.tables_absent ? 'TABLES_ABSENT' : 'READ_FAILED';
    await writeRows(sb, 'michael_checkpoint_send_ledger', (t) => t.insert({ et_date: etDate, window_slot: windowSlot, outcome: 'refused', refusal_code: code }));
    return refusal(code, 'same-day cap read failed -- fail-closed (refused)');
  }
  const sentOrInProgressToday = ledgerRead.rows.filter((r) => r.outcome === 'sent' || r.refusal_code === 'SEND_IN_PROGRESS');
  if (sentOrInProgressToday.length >= CAP_PER_DAY) {
    await writeRows(sb, 'michael_checkpoint_send_ledger', (t) => t.insert({ et_date: etDate, window_slot: windowSlot, outcome: 'refused', refusal_code: 'CAP_EXCEEDED' }));
    return refusal('CAP_EXCEEDED', `already sent or in-progress ${sentOrInProgressToday.length}/${CAP_PER_DAY} today`);
  }
  // FR-7 app-level dedup (DB partial unique index is the independent second enforcement).
  if (sentOrInProgressToday.some((r) => r.window_slot === windowSlot)) {
    await writeRows(sb, 'michael_checkpoint_send_ledger', (t) => t.insert({ et_date: etDate, window_slot: windowSlot, outcome: 'refused', refusal_code: 'ALREADY_SENT_THIS_WINDOW' }));
    return refusal('ALREADY_SENT_THIS_WINDOW', `window ${windowSlot} already sent today`);
  }

  // FR-2 / QF-20260914-300: recipient hash-pin, raw string, tamper-evidence not secrecy. Read
  // FRESH from the private store (never source) unless a test override was supplied.
  let pinnedHash = recipientSha256;
  if (pinnedHash === undefined) {
    const pinRead = await readRows(sb, 'michael_checkpoint_send_enabled', (q) => q.eq('config_key', 'recipient_pin'), { select: 'reason' });
    if (pinRead.tables_absent || pinRead.error) {
      const code = pinRead.tables_absent ? 'TABLES_ABSENT' : 'READ_FAILED';
      await writeRows(sb, 'michael_checkpoint_send_ledger', (t) => t.insert({ et_date: etDate, window_slot: windowSlot, outcome: 'refused', refusal_code: code }));
      return refusal(code, 'recipient-pin read failed -- fail-closed (refused)');
    }
    pinnedHash = pinRead.rows[0]?.reason || '';
  }
  const recipient = process.env.CHAIRMAN_PHONE || '';
  if (!recipient || sha256Hex(recipient) !== pinnedHash) {
    await writeRows(sb, 'michael_checkpoint_send_ledger', (t) => t.insert({ et_date: etDate, window_slot: windowSlot, outcome: 'refused', refusal_code: 'RECIPIENT_HASH_MISMATCH' }));
    return refusal('RECIPIENT_HASH_MISMATCH', 'CHAIRMAN_PHONE does not match the pinned recipient hash');
  }

  // FR-3: identity, all-or-nothing (checkpoint-identity.mjs never returns a partial set).
  const identity = resolveIdentity();
  if (!identity) {
    await writeRows(sb, 'michael_checkpoint_send_ledger', (t) => t.insert({ et_date: etDate, window_slot: windowSlot, outcome: 'refused', refusal_code: 'IDENTITY_UNCONFIGURED' }));
    return refusal('IDENTITY_UNCONFIGURED', 'MICHAEL_TWILIO_* identity is not fully configured');
  }

  // FR-4: template body, counts + as-of only.
  const rowsByFeeder = await readProducingFeederCounts(sb, etDate);
  const body = composeCheckpointBody(summarizeCounts(rowsByFeeder));
  const bodySha256 = sha256Hex(body);
  const bodyLen = body.length;

  // FR-6: stage the ledger row BEFORE the external call so a crash between the Twilio call and the
  // DB write still leaves an audit trail (and never lets an uncounted send defeat FR-1's cap).
  const staged = await writeRows(sb, 'michael_checkpoint_send_ledger', (t) => t.insert({
    et_date: etDate, window_slot: windowSlot, outcome: 'refused', refusal_code: 'SEND_IN_PROGRESS',
  }).select('id').single());
  if (!staged.ok) {
    return refusal(staged.refusal || 'LEDGER_WRITE_FAILED', staged.error || 'could not stage the ledger row before sending -- refusing BEFORE the external call');
  }
  const ledgerId = staged.data.id;

  // SEC-M2: sendFn (twilioProvider.send by default) wraps a bare fetch with no try/catch of its
  // own, so a network-level rejection (DNS, ECONNREFUSED, TLS, socket reset) would otherwise
  // propagate out of this function -- past the staged row, contradicting this function's contract
  // of never throwing, and leaving SEND_IN_PROGRESS unresolved for longer than necessary (though
  // SEC-H2's fix above already makes that row count against the cap either way).
  let sendResult;
  try {
    sendResult = await sendFn({ to: recipient, body, identity });
  } catch (e) {
    await writeRows(sb, 'michael_checkpoint_send_ledger', (t) => t.update({
      outcome: 'refused', refusal_code: 'SEND_THREW', body_sha256: bodySha256, body_len: bodyLen,
    }).eq('id', ledgerId));
    return refusal('SEND_THREW', `the provider send threw: ${e && e.message ? e.message : e}`, { ledger_id: ledgerId });
  }
  if (sendResult.status !== 'queued') {
    // SEC-M1: the provider's raw reason can be free-text Twilio API prose that embeds the
    // recipient's own E.164 number (e.g. error 21211/21408) -- never write it verbatim into a
    // column whose entire design is redaction, or echo it to stdout (Task Scheduler host logs).
    // Only a small set of already-coded, non-PII reasons pass through as-is.
    const SAFE_REASON_RE = /^(twilio_not_configured|test_env_guard|http_\d+)$/;
    const safeReason = typeof sendResult.reason === 'string' && SAFE_REASON_RE.test(sendResult.reason) ? sendResult.reason : 'PROVIDER_ERROR';
    await writeRows(sb, 'michael_checkpoint_send_ledger', (t) => t.update({
      outcome: 'refused', refusal_code: safeReason, body_sha256: bodySha256, body_len: bodyLen,
    }).eq('id', ledgerId));
    return refusal(safeReason, 'the provider send failed', { ledger_id: ledgerId });
  }
  const finalize = await writeRows(sb, 'michael_checkpoint_send_ledger', (t) => t.update({
    outcome: 'sent', refusal_code: null, provider_message_id: sendResult.provider_message_id, body_sha256: bodySha256, body_len: bodyLen,
  }).eq('id', ledgerId).select('id').single());
  if (!finalize.ok) {
    // TESTING M1b: distinguish "a concurrent process already landed the 'sent' row for this exact
    // slot" (the DB partial unique index caught a race, code 23505 -- the Twilio send DID happen,
    // this row honestly stays SEND_IN_PROGRESS rather than claiming success it cannot verify) from
    // a genuinely transient DB failure (a different, retryable-in-principle problem) -- writeRows
    // passes error.code through for exactly this distinction (lib/michael/db.mjs), and
    // isUniqueViolation() is the established Michael-verb classifier for it.
    const code = isUniqueViolation(finalize) ? 'LEDGER_FINALIZE_RACE_LOST' : (finalize.refusal || 'LEDGER_FINALIZE_FAILED');
    return refusal(code, finalize.error || 'sent but could not finalize the ledger row', { ledger_id: ledgerId, provider_message_id: sendResult.provider_message_id });
  }
  return { ok: true, sent: true, ledger_id: ledgerId, provider_message_id: sendResult.provider_message_id };
}

async function main() {
  const argv = process.argv.slice(2);
  const r = await runCheckpointSend({ sb: createMichaelClient(), argv });
  emit(r, { json: argv.includes('--json') });
  process.exitCode = r.ok ? 0 : 2;
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[MICHAEL-CHECKPOINT-SEND] ${e && e.message ? e.message : e}`); process.exitCode = 1; });
}
