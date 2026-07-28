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

module.exports = { TABLE, ALLOWED_STATES, sanitizeName, toSnapshotRow, persistReadings };
