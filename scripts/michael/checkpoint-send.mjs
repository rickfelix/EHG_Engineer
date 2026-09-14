#!/usr/bin/env node
// scripts/michael/checkpoint-send.mjs — the Tier-2 personal checkpoint send verb (ratification
// 561878ae): texts the chairman a fixed-template checkpoint at 4 daily ET windows, and can do
// nothing else. SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001.
//
// Usage (absolute path from the repo root; normally invoked by Task Scheduler via
// scripts/setup-michael-host-tasks.mjs's checkpoint-send entry, which appends --apply):
//   node scripts/michael/checkpoint-send.mjs --apply [--json]
//   node scripts/michael/checkpoint-send.mjs [--et-date YYYY-MM-DD] [--json]   (dry-run only --
//     --et-date is REFUSED under --apply, SECURITY SEC-H1: a live send has no legitimate use for
//     an operator-supplied date, and allowing one lets --apply --et-date <fresh-date> mint an
//     unlimited number of real 4-per-day budgets by walking the calendar.)
//
// FR-1: same-day cap of 4, fail-closed on BOTH tables_absent and a generic ledger-read error --
//   read BEFORE the recipient/identity/send steps, so a failed cap read never falls through to a
//   live send. Counts outcome='sent' OR refusal_code='SEND_IN_PROGRESS' (SECURITY SEC-H2): an
//   unresolved staged row (crash, throw, or a concurrent fire racing the same window) must count
//   against the cap exactly like a confirmed send, or the cap can be silently exceeded.
// FR-2: recipient hash-pinned (tamper-evidence, not secrecy) -- RECIPIENT_SHA256 below is a
//   HARDCODED module constant (never an env var -- an env-configurable pin could be changed
//   alongside CHAIRMAN_PHONE, defeating the whole point). It ships as an unset placeholder, which
//   never matches any real resolved value, so every live send safely refuses
//   RECIPIENT_HASH_MISMATCH until the chairman's real number's sha256 is set here directly in a
//   reviewed code change -- an additional chairman-adjacent dependency, named here so it is never
//   silently discovered as "why did this never send".
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
//   tests/ddl/michael-checkpoint-send-ddl.db.test.js).
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, readRows, writeRows, refusal, emit, todayEt, sha256Hex } from '../../lib/michael/db.mjs';
import { FEEDERS, inWindow, windowIdFor, etMinuteOfDay, isUniqueViolation } from '../../lib/michael/feeder.mjs';
import { resolveCheckpointIdentity } from '../../lib/michael/checkpoint-identity.mjs';
import twilioProvider from '../../lib/messaging/providers/twilio-provider.js';

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

// FR-2 / TESTING M9: sha256 of the chairman's RAW expected E.164 string, hardcoded here (never an
// env var). The empty-string placeholder's hash never equals any real phone number's hash, so this
// ships fail-closed by construction until a reviewed code change sets the real value.
export const RECIPIENT_SHA256 = '';

/** Pure: best-effort counts-only summary + the oldest (most conservative) as-of timestamp across the 3 producing feeders' latest runs. Never touches raw text fields. */
export function summarizeCounts(rowsByFeeder) {
  const parts = [];
  const asOfCandidates = [];
  for (const { feeder, key, label } of PRODUCING_FEEDER_COUNTS) {
    const row = rowsByFeeder[feeder];
    if (!row) continue;
    if (row.counts && typeof row.counts === 'object' && typeof row.counts[key] === 'number') {
      parts.push(`${row.counts[key]} ${label}`);
    }
    if (typeof row.finished_at === 'string') asOfCandidates.push(row.finished_at);
  }
  asOfCandidates.sort();
  return { summary: parts.length ? parts.join(', ') : 'no counts available', asOf: asOfCandidates[0] || null };
}

/** Pure: the fixed-template body -- counts and an as-of pointer only, never raw personal text. */
export function composeCheckpointBody({ summary, asOf }) {
  const asOfText = asOf ? `as of ${asOf}` : 'as-of unavailable';
  return `Michael checkpoint: ${summary} (${asOfText}). Reply if anything looks wrong.`;
}

async function readProducingFeederCounts(sb, etDate) {
  const rowsByFeeder = {};
  for (const feeder of PRODUCING_FEEDERS) {
    const read = await readRows(
      sb, 'michael_feeder_runs',
      (q) => q.eq('et_date', etDate).eq('feeder', feeder).order('attempt', { ascending: false }),
      { select: 'counts,finished_at,status' },
    );
    if (!read.tables_absent && !read.error && read.rows.length) rowsByFeeder[feeder] = read.rows[0];
  }
  return rowsByFeeder;
}

/** The verb. deps: { sb, argv, now, sendFn, resolveIdentity, recipientSha256 }. Never throws.
 * recipientSha256 defaults to the real hardcoded RECIPIENT_SHA256 constant -- the override
 * parameter exists ONLY so tests can exercise the full send path without waiting on the real
 * chairman-number hash to be set; main() below never passes it, so production always uses the
 * real constant. */
export async function runCheckpointSend({ sb, argv = [], now = new Date(), sendFn = twilioProvider.send, resolveIdentity = resolveCheckpointIdentity, recipientSha256 = RECIPIENT_SHA256 } = {}) {
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
  if (!inWindow(minuteOfDay, windowConfig)) {
    // FR-6: an out-of-window fire is inert -- no ledger row, no external call, matching every other
    // Michael feeder's inert-outside-window convention.
    return { ok: true, inert: true, reason: 'outside_et_window' };
  }
  const windowSlot = windowIdFor(minuteOfDay, windowConfig);

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

  // FR-2: recipient hash-pin, raw string, tamper-evidence not secrecy.
  const recipient = process.env.CHAIRMAN_PHONE || '';
  if (!recipient || sha256Hex(recipient) !== recipientSha256) {
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
