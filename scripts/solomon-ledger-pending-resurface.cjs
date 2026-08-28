#!/usr/bin/env node
/**
 * solomon-ledger-pending-resurface.cjs — QF-20260704-598 (chairman directive 2026-07-04:
 * "when Solomon speaks, we should listen"). solomon_advice_outcome_ledger rows sit at
 * decision='pending' indefinitely once nothing re-checks them -- live specimen: a >24h-old
 * pending recommendation only got adopted when a chairman question forced it 3h later.
 * Read-mostly sweep (mirrors feedback-sla-gauge.cjs's dedup-before-insert discipline): finds
 * ledger rows pending longer than the threshold and resurfaces each into Adam's inbox at most
 * once per row per day (payload.dedup_key checked before insert). Stamps nothing on the ledger
 * row itself -- it stays visible every day until a real decision is recorded.
 * Usage: node scripts/solomon-ledger-pending-resurface.cjs [--threshold-hours 72]
 */
require('dotenv').config();
const crypto = require('node:crypto');
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const { getActiveAdamId } = require('../lib/coordinator/adam-identity.cjs');
// QF-20260725-027: the default IS the operating threshold, sourced from the shared constant.
const { OPERATING_THRESHOLD_HOURS } = require('../lib/coordination/resurface-threshold.cjs');

// QF-20260725-027. This was the literal 24 while the operating threshold was 72, and QF-20260725-342
// "fixed" that by passing --threshold-hours 72 at the three call sites it could FIND — leaving the
// default those sites fall back to still disagreeing with them.
//
// WHY THAT COULD NOT WORK: the bare invocation is an UNENUMERABLE FOURTH CALL SITE. Cron prompt
// bodies, human batches, ad-hoc debugging and any future caller get the wrong answer, and you cannot
// fix that by enumerating callers because the failing one is every invocation nobody wrote down. A
// hand-maintained inventory of call sites cannot detect a call site nobody added to it.
//
// OBSERVED, twice in ~40 minutes: a bare invocation inserted digests of 64 then 65 members. At 72h
// the same query returns ZERO, so those were 100% sub-threshold noise landing in the Adam inbox
// looking exactly like a genuine backlog spike. The dedupe is CONTENT-HASHED, so one new ledger
// member changes the key and a whole new digest is inserted — the wrong default therefore re-fires on
// every growth tick rather than emitting once. The unchanged-or-already-notified guard stops a repeat
// of the IDENTICAL set and nothing else.
//
// Sourcing the default FROM the shared constant (rather than typing 72 here) makes the two unable to
// drift apart again — a re-divergence would now require deliberately reintroducing a literal.
const DEFAULT_THRESHOLD_HOURS = OPERATING_THRESHOLD_HOURS;
const DEFAULT_PAGE_SIZE = 50;
// Safety cap on pages per invocation (10 * 50 = 500 rows/run) -- bounds worst-case query
// volume for a sweep script without reintroducing the head-of-queue starvation this fixes.
const DEFAULT_MAX_PAGES = 10;

// SD-LEO-INFRA-RESURFACE-DIGEST-BATCHING-001.
// The LEGACY per-item kind. Still read (never written) for the one-day transition guard in
// collectLegacyNotifiedIds, and still recognised by lib/coordination/lane-lint-gauge.cjs.
const RESURFACE_KIND = 'solomon_ledger_pending_resurface';
// The kind this script now WRITES: one digest row per run instead of one row per item.
// Deliberately NOT registered in lib/fleet/worker-status.cjs PAYLOAD_KINDS / DRAIN_SETS.adam
// (PRD TR-2): registering it flips isAdamInboxRow true (scripts/adam-advisory.cjs:639) and a
// generic drain would then ACK the digest without dispositioning a single ledger row --
// converting a noisy-but-visible problem into a silently-swallowed one.
const DIGEST_KIND = 'solomon_ledger_pending_digest';
// Bound the digest. The >24h bucket measured 29 on 2026-07-25 only because the ledger
// population was ~34h deep (near-uniform age histogram, hard cliff at 36h, ~88 new rows/24h) --
// that is NOT equilibrium, so this is sized for 100+ members with explicit truncation
// disclosure rather than silent dropping (PRD FR-6).
const DEFAULT_DIGEST_MAX_ITEMS = 100;
const SUMMARY_MAX_CHARS = 100;

function parseThresholdHours(argv) {
  const idx = argv.indexOf('--threshold-hours');
  const n = idx >= 0 ? Number(argv[idx + 1]) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_THRESHOLD_HOURS;
}

/** Pure: today's dedup key for a ledger row's resurface (rate limit: one per row per day).
 *  LEGACY key shape. No longer written -- retained because collectLegacyNotifiedIds reads it
 *  for one transition day, and existing rows in the 30-day gauge window still carry it. */
function dedupKeyFor(ledgerId, nowMs) {
  return `solomon_ledger_pending:${ledgerId}:${new Date(nowMs).toISOString().slice(0, 10)}`;
}

/**
 * Pure: the digest's dedup key -- a CONTENT HASH over the sorted, de-duplicated member id set.
 *
 * DELIBERATELY NOT DATE-KEYED (PRD FR-3). A date-keyed digest suppresses a genuinely CHANGED
 * member set for the rest of the day, which is exactly the head-of-queue starvation class
 * QF-20260710-743 already closed for the paging query -- a newly-crossed item would wait until
 * tomorrow. Hashing the membership instead means: unchanged set => same key => no re-send;
 * changed set => new key => the digest re-issues in the SAME run the membership changes.
 *
 * No per-tick-varying value (count, max age, timestamp) may enter this key --
 * lib/adam/inbound-backlog-watchdog.js:76-81 documents that doing so defeats dedup entirely.
 * @param {string[]} ledgerIds
 * @returns {string}
 */
function digestDedupKey(ledgerIds) {
  const canonical = [...new Set((ledgerIds || []).map((id) => String(id)))].sort().join('\n');
  const hash = crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
  return `solomon_ledger_digest:${hash}`;
}

/** Pure: `count` items starting at `offset` into `arr`, wrapping around the end. */
function rotatedWindow(arr, offset, count) {
  const n = arr.length;
  if (n === 0 || count <= 0) return [];
  if (count >= n) return arr.slice();
  const o = ((offset % n) + n) % n;
  const head = arr.slice(o, Math.min(n, o + count));
  const rest = count - head.length;
  return rest > 0 ? head.concat(arr.slice(0, rest)) : head;
}

/**
 * Pure: assemble the digest payload/body from ordered candidates (oldest first, as
 * planStalePending returns them).
 *
 * Every member carries correlation_id because scripts/coordinator-ack-adam.cjs upserts the
 * ledger with onConflict:'correlation_id' -- without it a member cannot be dispositioned from
 * the digest at all, which would reduce "actionable" to "a summary plus a lookup" (PRD FR-2).
 * @param {Array<object>} candidates
 * @param {{nowMs?: number, maxItems?: number}} [opts]
 */
function buildDigest(candidates, { nowMs = Date.now(), maxItems = DEFAULT_DIGEST_MAX_ITEMS } = {}) {
  const all = candidates || [];
  // QF-20260729-654: a fixed oldest-N slice never advances past a static head -- rank
  // (maxItems+1)+ rows starve forever while the head stays pending (same age, same day,
  // opposite fate). Offset the window by a per-day cursor so the FULL backlog cycles through
  // within ceil(len/maxItems) days instead of the same N being carried (rest dropped) forever.
  const dayIndex = Math.floor(nowMs / (24 * 60 * 60 * 1000));
  const offset = all.length > maxItems ? (dayIndex * maxItems) % all.length : 0;
  const kept = rotatedWindow(all, offset, maxItems);
  const truncated = all.length > kept.length;
  const items = kept.map((r) => ({
    ledger_id: r.id,
    correlation_id: r.correlation_id ?? null,
    sd_key: r.sd_key ?? null,
    age_hours: Math.floor((nowMs - new Date(r.created_at).getTime()) / (60 * 60 * 1000)),
    // Collapse ALL whitespace before truncating. The digest body is a multi-line list, so an
    // unsanitised newline inside a summary would let that text forge an extra "- [id] aged Nh"
    // member line, or a fake "NOTE: list truncated ..." line, inside an otherwise-trustworthy
    // row. This class did not exist pre-digest (one item per row = no peer list to forge into).
    // The structured payload was never forgeable -- a newline stays JSON-escaped inside
    // items[].summary and cannot manufacture a ledger_ids[] entry -- but the body IS rendered
    // raw into an Adam model context by scripts/hooks/coordination-inbox.cjs, so it is sanitised
    // at the producer, once, for every consumer.
    summary: String(r.proposal_summary || '').replace(/\s+/g, ' ').trim().slice(0, SUMMARY_MAX_CHARS),
  }));
  const ledgerIds = items.map((i) => i.ledger_id);
  // The FULL member set, BEFORE the cap. The dedup key must hash this, not the truncated
  // `ledgerIds` -- otherwise a stable first-100 with churn beyond the cap yields an unchanging
  // key and no digest ever re-issues, which is a bounded re-run of the very FR-3 starvation
  // class the content hash exists to prevent.
  const allLedgerIds = all.map((r) => r.id);
  const oldestAge = items.length ? Math.max(...items.map((i) => i.age_hours)) : 0;
  const lines = items.map((i) => `- [${i.ledger_id}] aged ${i.age_hours}h${i.sd_key ? ` (${i.sd_key})` : ''}: ${i.summary}`);
  // Non-empty body is REQUIRED: lane-contract readCanonicalBody counts a bodyless row as
  // bodyless_row, and this kind is not in LEGITIMATELY_BODYLESS_KINDS.
  const body = [
    `${items.length} Solomon ledger item(s) still pending, oldest ${oldestAge}h.`,
    'Disposition individually by correlation_id.',
    '',
    ...lines,
    ...(truncated ? ['', `NOTE: list truncated to ${maxItems} of ${all.length} pending items; ${all.length - kept.length} omitted.`] : []),
  ].join('\n');
  const subject = `[SOLOMON_LEDGER_PENDING_DIGEST] ${items.length} pending, oldest ${oldestAge}h${truncated ? ` (truncated from ${all.length})` : ''}`;
  return { items, ledgerIds, allLedgerIds, body, subject, truncated, totalCandidates: all.length, oldestAge };
}

/**
 * One-day transition guard (PRD FR-5): ledger ids already resurfaced TODAY under the legacy
 * per-item key. Without this, the first digest run re-notifies every item that the old code
 * path already announced today -- into the very lane this change exists to unclog (29 such
 * rows existed at cutover).
 *
 * ONE query, not one per candidate: scoped by kind + today's rows, then matched client-side
 * against today's legacy keys. Deliberately NOT an .in() over per-candidate keys -- that URL
 * grows with the backlog (up to 500 keys) and would risk a PostgREST URL-length failure.
 * Self-expiring: tomorrow no row carries today's key, so the guard evaporates with no cleanup.
 * FAIL-OPEN on error: returning an empty set means "exclude nothing", which can at worst
 * re-notify, never silently swallow.
 */
async function collectLegacyNotifiedIds(supabase, adamId, candidates, nowMs = Date.now()) {
  const notified = new Set();
  if (!candidates || candidates.length === 0) return notified;
  const startOfDay = `${new Date(nowMs).toISOString().slice(0, 10)}T00:00:00.000Z`;
  const wanted = new Map(candidates.map((r) => [dedupKeyFor(r.id, nowMs), r.id]));
  try {
    const { data, error } = await supabase
      .from('session_coordination')
      .select('payload')
      .eq('target_session', adamId)
      .eq('payload->>kind', RESURFACE_KIND)
      .gte('created_at', startOfDay);
    if (error) return notified;
    for (const row of data || []) {
      const key = row && row.payload && row.payload.dedup_key;
      if (key && wanted.has(key)) notified.add(wanted.get(key));
    }
  } catch { /* fail-open */ }
  return notified;
}

/**
 * Fetches ALL ledger rows still pending past the threshold (primary-state check — no
 * caching). QF-20260710-743: the original single .limit(50) query starved rows 51+ forever
 * whenever the oldest 50 stale-pending rows never resolved -- pages via .range() past that
 * window (bounded by maxPages) so the whole backlog surfaces over successive/single runs.
 */
/**
 * SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001 (FR-3): an informational (fire-and-forget)
 * advisory is not a workload — admission-scoped, not aging-scoped. This is a DIFFERENT axis than
 * lib/solomon/conduct-probes.js's staleOpenAdviceCount (decision='pending' alone), which holds its
 * own explicit anti-aging principle ("the drain must not be able to retire the backlog signal by
 * aging it") and is a SEPARATE governance consumer — DO NOT extract a shared predicate helper
 * between the two; that would silently narrow conduct-probes.js's visibility too.
 * @param {*} query - a query builder already filtered to .eq('decision','pending')
 */
function applyDecisionRequestedFilter(query) {
  return query.eq('decision_requested', true);
}

async function planStalePending(supabase, { thresholdHours = DEFAULT_THRESHOLD_HOURS, nowMs = Date.now(), pageSize = DEFAULT_PAGE_SIZE, maxPages = DEFAULT_MAX_PAGES } = {}) {
  const cutoff = new Date(nowMs - thresholdHours * 60 * 60 * 1000).toISOString();
  const all = [];
  // SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001 (FR-3/TS-5a): mirrors captureLedgerRow's
  // sequencing fallback on the read side. If decision_requested is queried before the chairman
  // applies 20260821_solomon_ledger_decision_requested.sql, fall back to the pre-SD query
  // (decision='pending' alone) instead of throwing — FR-1b's DEFAULT true guarantees this fallback
  // returns exactly the same rows the post-migration query would return for every existing row.
  let decisionRequestedColumnMissing = false;
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    let query = supabase
      .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — chairman-apply-gated table, not yet in the live snapshot
      .select('id, correlation_id, sd_key, proposal_summary, created_at')
      .eq('decision', 'pending');
    if (!decisionRequestedColumnMissing) query = applyDecisionRequestedFilter(query);
    let { data, error } = await query
      .lte('created_at', cutoff)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    // 42703 (undefined_column) is the REAL live code for this query shape — an .eq() filter on a
    // missing column surfaces Postgres's own error, verified live against the unmigrated table.
    // PGRST204 (schema-cache-miss) is accepted too, belt-and-braces: this codebase has already
    // hit THREE different error shapes for the identical missing-column condition depending on
    // query type (write/upsert vs. head-count-read vs. normal-read) — see checkLedgerCaptureHealth.
    const missingColumnCodes = new Set(['42703', 'PGRST204']);
    if (error && !decisionRequestedColumnMissing && missingColumnCodes.has(error.code) && /decision_requested/.test(error.message || '')) {
      decisionRequestedColumnMissing = true;
      console.error(`WARN: decision_requested column missing — falling back to pre-SD query (apply database/migrations/20260821_solomon_ledger_decision_requested.sql) — ${error.message}`);
      ({ data, error } = await supabase
        .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — same table, degraded-fallback read
        .select('id, correlation_id, sd_key, proposal_summary, created_at')
        .eq('decision', 'pending')
        .lte('created_at', cutoff)
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1));
    }
    if (error) throw new Error(`planStalePending query failed: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break; // last page
  }
  return all;
}

/**
 * Deduped resurface as a SINGLE DIGEST ROW (SD-LEO-INFRA-RESURFACE-DIGEST-BATCHING-001).
 *
 * WAS: one session_coordination row per stale item per day, so notification volume scaled with
 * the pending backlog and crowded the oldest-first surfaces Adam actually renders
 * (scripts/adam-quiet-tick.mjs display cap 50; scripts/read-adam-directives.cjs renders 20).
 * NOW: exactly ONE row per run for any member count -- volume is O(1) in the backlog while
 * every member stays individually dispositionable via payload.items[].correlation_id.
 *
 * Returns the same {candidates, resurfaced} shape; `resurfaced` is the member id list of a
 * digest that was actually inserted (empty when deduped or when there is nothing to send).
 */
async function resurfaceStalePending(supabase, adamId, { thresholdHours = DEFAULT_THRESHOLD_HOURS, nowMs = Date.now(), maxItems = DEFAULT_DIGEST_MAX_ITEMS } = {}) {
  const candidates = await planStalePending(supabase, { thresholdHours, nowMs });
  if (candidates.length === 0) return { candidates, resurfaced: [] };

  // One-day transition guard -- see collectLegacyNotifiedIds.
  const alreadyNotified = await collectLegacyNotifiedIds(supabase, adamId, candidates, nowMs);
  const members = candidates.filter((r) => !alreadyNotified.has(r.id));
  if (members.length === 0) {
    console.log(`[solomon-ledger-pending-resurface] all ${candidates.length} candidate(s) already resurfaced today under the legacy per-item key — no digest`);
    return { candidates, resurfaced: [] };
  }

  const digest = buildDigest(members, { nowMs, maxItems });
  // Hash the FULL member set, not the post-cap slice -- see buildDigest's allLedgerIds note.
  // QF-20260729-654: when the window is rotating (truncated), the exposed subset changes by
  // day even while the full pending set does not -- fold in the day index so day 2's rotated
  // window is never suppressed as "unchanged" by day 1's identical full-set hash.
  const dayIndex = Math.floor(nowMs / (24 * 60 * 60 * 1000));
  const key = digest.truncated ? `${digestDedupKey(digest.allLedgerIds)}:day${dayIndex}` : digestDedupKey(digest.allLedgerIds);

  // Content-hash dedup: an unchanged member set is a no-op; a changed set re-issues NOW.
  const { data: existing } = await supabase.from('session_coordination').select('id')
    .eq('target_session', adamId).eq('payload->>dedup_key', key).limit(1);
  if (existing && existing.length) {
    console.log(`[solomon-ledger-pending-resurface] digest unchanged (${key}, ${digest.items.length} member(s)) — skipping`);
    return { candidates, resurfaced: [] };
  }

  const { error } = await supabase.from('session_coordination').insert({
    sender_session: null,
    // 'sweep' is in lane-lint-gauge LEGITIMATE_EMPTY_SENDER_TYPES -- changing it would trip
    // empty_sender_row.
    sender_type: 'sweep',
    target_session: adamId,
    message_type: 'INFO',
    subject: digest.subject,
    body: digest.body,
    payload: {
      kind: DIGEST_KIND,
      dedup_key: key,
      // ledger_ids is the flat membership list lane-lint-gauge reads for drift detection;
      // items[] is the per-member actionable detail.
      ledger_ids: digest.ledgerIds,
      items: digest.items,
      item_count: digest.items.length,
      total_candidates: digest.totalCandidates,
      truncated: digest.truncated,
      // Countable dropped-this-run figure (option C, QF-20260729-654) -- previously only
      // visible as a parenthetical on a success log line, with nothing anywhere counting it.
      omitted_count: digest.totalCandidates - digest.items.length,
    },
  });
  if (error) {
    console.log(`[solomon-ledger-pending-resurface] FAILED to insert digest (${digest.items.length} member(s)): ${error.message}`);
    return { candidates, resurfaced: [] };
  }
  console.log(`[solomon-ledger-pending-resurface] digest inserted: ${digest.items.length} member(s)${digest.truncated ? ` (truncated from ${digest.totalCandidates})` : ''} key=${key}`);
  return { candidates, resurfaced: digest.ledgerIds };
}

async function main() {
  let supabase;
  try { supabase = createSupabaseServiceClient(); }
  catch (e) { console.error('ERROR: supabase client unavailable:', e.message); process.exit(1); }
  // SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-3): stamp on every successful tick, before
  // the no-active-Adam early-return (both are a completed tick — supabase is already live here).
  try {
    const { stampLastFired } = await import('../lib/periodic-liveness/stamp-last-fired.js');
    await stampLastFired(supabase, 'standard_loop:solomon-ledger-resurface');
  } catch (err) {
    console.error(`[solomon-ledger-pending-resurface] stampLastFired failed (non-fatal): ${err.message}`);
  }

  const adamId = await getActiveAdamId(supabase);
  if (!adamId) { console.log('SOLOMON LEDGER PENDING RESURFACE: no active Adam session found — nothing to resurface into.'); return; }
  const thresholdHours = parseThresholdHours(process.argv.slice(2));
  const { candidates, resurfaced } = await resurfaceStalePending(supabase, adamId, { thresholdHours });
  console.log(`SOLOMON LEDGER PENDING RESURFACE — ${candidates.length} candidate(s) pending >${thresholdHours}h, ${resurfaced.length ? `1 digest row covering ${resurfaced.length} item(s)` : 'no digest (unchanged or already notified)'}`);
}

if (require.main === module) {
  main().catch(err => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
}

module.exports = {
  parseThresholdHours, dedupKeyFor, planStalePending, resurfaceStalePending, DEFAULT_THRESHOLD_HOURS,
  digestDedupKey, buildDigest, collectLegacyNotifiedIds,
  RESURFACE_KIND, DIGEST_KIND, DEFAULT_DIGEST_MAX_ITEMS,
};
