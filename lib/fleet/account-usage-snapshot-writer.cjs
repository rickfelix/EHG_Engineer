// Persist account quota readings so a last-known value survives an account becoming unreadable.
// SD-LEO-INFRA-ACCOUNT-QUOTA-STRIP-001 (FR-4/FR-6).
//
// THE POINT OF RETAINING THESE. An exhausted account currently collapses to "Unavailable" and its
// FINAL reading — 100% across the board, the number that explains why the fleet stopped — is gone.
// Persisting each successful read is what lets the strip say "exhausted, last read at X" instead of
// erasing the history exactly when it matters.
//
// FAIL-SOFT, ALWAYS. Persistence is a side effect of rendering a strip; it must never be able to
// break the thing it observes. Every failure path here — no client, no table (the migration is
// chairman-gated and may not be applied yet), a transport error, a malformed reading — resolves to
// a counted skip, never a throw. A read path that dies because its logging died would be a worse
// defect than the one this SD fixes.
//
// WHAT IS AND IS NOT WRITTEN. Display name, percentages, reset timestamps, fetchedAt, state, and the
// accountUuid8 discriminator. NEVER a bearer token. NEVER an email — identity resolves to a display
// name in lib/fleet/account-identity.cjs before anything reaches here, so this table cannot become a
// credential or PII surface. sanitizeName below is belt-and-braces on the one free-text column.

'use strict';

const TABLE = 'account_usage_snapshots';

/** States the migration's CHECK constraint accepts. A reading outside this set is skipped rather
 *  than written, because a constraint violation would surface as a thrown error on the read path. */
const ALLOWED_STATES = Object.freeze(new Set([
  'ok', 'not_configured', 'unauthorized', 'unexpected_shape',
  'timeout', 'unreachable', 'exhausted', 'duplicate_identity',
]));

/** Clamp + strip control characters from the one free-text column that reaches the DB. */
function sanitizeName(value) {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const stripped = value.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
  return stripped ? stripped.slice(0, 128) : null;
}

function toNumericOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function toIsoOrNull(v) {
  if (typeof v !== 'string' || !v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * Map one reader reading to a snapshot row, or null when it cannot be represented.
 *
 * Pure and exported so the shape contract is testable without a database — which is the only way
 * to assert the negative (no token, no email) cheaply and on every run.
 *
 * @param {object} reading one element of readAllAccounts()'s result
 * @param {string|null} [accountUuid8] identity discriminator for that slot, when resolvable
 */
function toSnapshotRow(reading, accountUuid8 = null) {
  if (!reading || typeof reading !== 'object') return null;
  const account_name = sanitizeName(reading.name);
  if (!account_name) return null;

  // The reader reports state 'ok' | 'unavailable'; the STORE records the specific reason, because
  // collapsing 'exhausted' back into 'unavailable' here would throw away the very distinction FR-3
  // exists to create — and it would be unrecoverable from history afterwards.
  const state = reading.state === 'ok' ? 'ok' : reading.reason;
  if (!ALLOWED_STATES.has(state)) return null;

  const fetched_at = toIsoOrNull(reading.fetchedAt);
  if (!fetched_at) return null; // no timestamp = no usable history row

  return {
    account_name,
    account_uuid8: typeof accountUuid8 === 'string' && accountUuid8 ? accountUuid8.slice(0, 64) : null,
    weekly_pct: toNumericOrNull(reading.weeklyPct),
    five_hour_pct: toNumericOrNull(reading.fiveHourPct),
    weekly_resets_at: toIsoOrNull(reading.weeklyResetsAt),
    five_hour_resets_at: toIsoOrNull(reading.fiveHourResetsAt),
    state,
    fetched_at,
  };
}

/**
 * Persist a batch of readings. Never throws.
 *
 * @param {object[]} readings readAllAccounts() output
 * @param {object} [opts]
 * @param {object} [opts.supabase] injected client — omit and nothing is written (no ambient client
 *   is constructed here, so a unit test can never accidentally reach a real database)
 * @param {Map<string,string|null>} [opts.identities] account_name -> accountUuid8
 * @param {object} [opts.logger]
 * @returns {Promise<{written:number, skipped:number, error:string|null}>}
 */
async function persistReadings(readings, opts = {}) {
  const logger = opts.logger || console;
  const rows = [];
  let skipped = 0;
  for (const r of Array.isArray(readings) ? readings : []) {
    const uuid8 = opts.identities instanceof Map ? opts.identities.get(r?.name) ?? null : null;
    const row = toSnapshotRow(r, uuid8);
    if (row) rows.push(row); else skipped++;
  }

  // No client is not an error — it is the default. The reader is used in contexts (unit tests, CLI
  // probes) where persistence is neither wanted nor available.
  if (!opts.supabase || rows.length === 0) {
    return { written: 0, skipped: skipped + rows.length, error: null };
  }

  try {
    // onConflict on the natural key makes a retried tick a no-op rather than a duplicate.
    const { error } = await opts.supabase
      .from(TABLE)
      .upsert(rows, { onConflict: 'account_name,fetched_at', ignoreDuplicates: true });
    if (error) {
      // The migration is chairman-gated, so "relation does not exist" is an EXPECTED state before
      // it is applied — logged at debug volume rather than as an alarm, because a nightly stream of
      // scary warnings about a known-pending migration trains people to ignore the channel.
      const msg = String(error.message || error);
      logger?.warn?.(JSON.stringify({
        event: 'account_usage.snapshot_write_failed',
        rows: rows.length,
        pending_migration: /does not exist|relation .* does not exist/i.test(msg),
        error: msg.slice(0, 200),
      }));
      return { written: 0, skipped: skipped + rows.length, error: msg };
    }
    return { written: rows.length, skipped, error: null };
  } catch (e) {
    const msg = e?.message || String(e);
    logger?.warn?.(JSON.stringify({ event: 'account_usage.snapshot_write_threw', error: msg.slice(0, 200) }));
    return { written: 0, skipped: skipped + rows.length, error: msg };
  }
}

/**
 * Most recent stored reading per account. Never throws.
 *
 * FR-6: an account that stops being readable must still show its FINAL value with the timestamp it
 * was read, rather than collapsing to "Unavailable" and erasing the number that explains why the
 * fleet stopped. This is the read side of that.
 *
 * Fail-soft for the same reason the writer is: the migration is chairman-gated, so "table does not
 * exist" is an EXPECTED state, and a strip that went blank because its history store was missing
 * would be a worse failure than the one being fixed.
 *
 * @returns {Promise<Map<string, object>>} account_name -> newest snapshot row (empty on any failure)
 */
async function fetchLastKnown(supabase, accountNames = [], opts = {}) {
  const names = [...new Set(
    (Array.isArray(accountNames) ? accountNames : []).filter((n) => typeof n === 'string' && n),
  )];
  if (!supabase || names.length === 0) return new Map();

  // ONE QUERY PER ACCOUNT, each capped at a single row — NOT one shared query with a global cap.
  //
  // The shared form ordered fetched_at DESC across ALL accounts under a single row budget, so the
  // healthy accounts crowded the exhausted one out of the window: at ~1 row/account/minute a
  // 60-row budget covers only ~20-30 minutes, while exhaustion lasts HOURS (the 5-hour and weekly
  // windows are the whole reason this feature exists). The strip recovered the number for the first
  // half hour and then silently lost it again — the original erasure, merely delayed.
  //
  // The registry is 3 accounts, and idx_account_usage_snapshots_name_fetched is
  // (account_name, fetched_at DESC), so this is a handful of cheap index seeks, not a scan.
  const out = new Map();
  await Promise.all(names.map(async (name) => {
    try {
      // THE NUMBER FILTER IS LOAD-BEARING, NOT AN OPTIMISATION. The route persists the CURRENT
      // reading before reading history back, so for an exhausted account the newest row is the one
      // just written — percentages NULL, newest fetched_at. Without this filter that row shadows
      // the very reading we are trying to recover. "Last KNOWN" means the last row that actually
      // carried a number, so the filter belongs here, at the definition.
      const { data, error } = await supabase
        .from(TABLE)
        .select('account_name, weekly_pct, five_hour_pct, weekly_resets_at, five_hour_resets_at, state, fetched_at')
        .eq('account_name', name)
        .or('weekly_pct.not.is.null,five_hour_pct.not.is.null')
        .order('fetched_at', { ascending: false })
        .limit(1);
      if (error || !Array.isArray(data) || !data[0]) return;
      out.set(name, data[0]);
    } catch {
      /* history is a nicety; the live reading is the product */
    }
  }));
  return out;
}

/**
 * Attach a last-known reading to any account that currently has no number.
 *
 * DELIBERATELY NON-DESTRUCTIVE: the live `state`/`reason` are preserved exactly, and history is
 * added under separate keys. Overwriting the live state with a stored one would make a stale value
 * indistinguishable from a current reading — which is the failure mode FR-6 exists to END, not to
 * relocate. The consumer decides how to present "exhausted, and here is what it last read".
 */
function withLastKnown(readings, lastKnown) {
  if (!(lastKnown instanceof Map) || lastKnown.size === 0) return readings;
  return (Array.isArray(readings) ? readings : []).map((r) => {
    if (!r || r.state === 'ok') return r;              // a live number needs no history
    // DUPLICATE IDENTITY GETS NO NUMBER, EVER — not even a historical one.
    //
    // When two registry slots resolve to one account we cannot say WHOSE usage this is; that is the
    // defect this SD was filed for. Attaching a retained percentage here would put a number back
    // under a label the system has just declared unattributable — the originating defect returning
    // through the new path. The refusal belongs at THIS layer, not in the component, so the API
    // response is honest too and no future consumer can re-render what the UI declines to show.
    if (r.reason === 'duplicate_identity') return r;
    const prior = lastKnown.get(r.name);
    if (!prior) return r;
    const hasNumber = typeof prior.weekly_pct === 'number' || typeof prior.five_hour_pct === 'number';
    if (!hasNumber) return r;                          // a stored unavailable adds nothing
    return {
      ...r,
      lastKnownWeeklyPct: prior.weekly_pct ?? null,
      lastKnownFiveHourPct: prior.five_hour_pct ?? null,
      lastKnownAt: prior.fetched_at,
      // The state OF THE READING THAT CARRIED THE NUMBER — not the state at the moment of failure.
      // Since fetchLastKnown only returns number-bearing rows, this is essentially always 'ok'.
      // Named explicitly here because a future reader could easily take it for "why it failed",
      // which is `reason` on the live reading, preserved untouched above.
      lastKnownState: prior.state,
    };
  });
}

module.exports = {
  TABLE, ALLOWED_STATES, sanitizeName, toSnapshotRow, persistReadings,
  fetchLastKnown, withLastKnown,
};
