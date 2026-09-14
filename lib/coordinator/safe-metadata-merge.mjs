/**
 * lib/coordinator/safe-metadata-merge.mjs — QF-20260720-597.
 *
 * Shared ATOMIC JSONB partial-merge helper. Exists so future metadata stampers (Adam's
 * ad-hoc passes, dispatch.cjs's audit-trail writes, any future tooling) cannot reintroduce
 * the read-spread-write anti-pattern that silently RESURRECTS a concurrently-cleared
 * coordinator hold flag (needs_coordinator_review, requires_human_action) from a stale
 * snapshot — the flag reads false at write time but the write still lands with a full-blob
 * overwrite of an OLDER metadata copy. Live near-miss: an Adam LEO name-stamp pass (RCA
 * a4587e48, Solomon advisory a91b0569); verified NO resurrection occurred that time, but
 * the pattern is unsafe by construction. Exemplar fix:
 * lib/coordinator/clear-coordinator-review.js (documents a prior REAL "RE-FENCE #3").
 *
 * mergeMetadataKeys(sdKey, patch) writes ONLY the keys present in `patch` via a Postgres
 * JSONB `||` merge — every OTHER key (including any hold flag a concurrent process just
 * cleared) is left completely untouched by this write, eliminating the read-then-write
 * TOCTOU race a `.update({ metadata: { ...spread, ...patch } })` full-blob write has by
 * construction. supabase-js's `.update()` cannot express a JSONB `||` merge directly, so
 * this goes through the raw pg connection (same seam clear-coordinator-review.js uses).
 *
 * QF-20260902-928 (Solomon CAPA 9d8d34b3 CA-11): opt-in {writer, reason} provenance. When
 * BOTH opts.writer and opts.reason are supplied, the merge additionally stamps
 * metadata.last_metadata_write {writer, reason, at, keys} and inserts one audit_log row.
 * Deliberately opt-in, not a hard refuse without them: mergeMetadataKeys had many live
 * production callers not passing writer/reason at fix time — hard-refusing an unlabeled
 * call would break drift-guard bookkeeping, hold/unfence flows, and dispatch's own audit
 * trail immediately. Migrating every existing caller to a genuine, per-call writer/reason
 * (not a placeholder, which would recreate the exact blindness this fix exists to close)
 * is a separate, larger follow-up.
 *
 * SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001: the three exports below (mergeMetadataKeys,
 * removeMetadataKey, removeMetadataKeyIfClaimedBy) are now thin, strategic_directives_v2-
 * specific wrappers over a generic, table-parameterized core (mergeJsonbColumn /
 * removeJsonbColumnKey below). Every existing export keeps its exact original signature
 * and return shape — this refactor is provably zero-behavior-change for all real call
 * sites (see tests/unit/coordinator/safe-metadata-merge.test.js). The generic core exists
 * so a FUTURE table (verified live-schema-compatible: product_requirements_v2, whose
 * metadata jsonb column and nullable-with-'{}'::jsonb-default shape match exactly — see
 * tests/unit/coordinator/generic-jsonb-merge.test.js) has a safe atomic-merge primitive to
 * reach for instead of reinventing the unsafe read-spread-write pattern that caused
 * SD-LEARN-FIX-ADDRESS-PAT-LES-012's incident (1,570 rows blind-replaced on
 * product_requirements_v2.metadata, 7,743 keys destroyed).
 *
 * Table/column names are validated against an explicit allowlist (JSONB_MERGE_ALLOWLIST)
 * before being interpolated into SQL text — this is a deliberate identifier allowlist, not
 * caller-supplied free text, since Postgres has no parameterized-identifier placeholder.
 */
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';
import {
  checkDeciderPairing, isHumanActionRequested, namedDecider,
} from '../governance/human-action-decider.mjs';

/**
 * SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001: explicit allowlist of (table, keyColumn,
 * jsonbColumn, extraGuardColumns) combinations the generic core will ever interpolate into
 * SQL. A caller naming anything outside this set is refused — this is the only thing
 * standing between a generalized "accept a table name" API and an identifier-injection
 * surface, since Postgres has no bind-parameter form for a table/column name.
 *
 * SECURITY (EXEC-phase review, findings SEC-1/SEC-2): the allowlist is deep-frozen below so
 * it cannot be mutated at runtime to admit an unreviewed table/column, and lookups use
 * Object.hasOwn() (never bare bracket access) so an inherited Object.prototype member
 * (`constructor`, `toString`, `__proto__`) can never be mistaken for a real entry.
 */
export const JSONB_MERGE_ALLOWLIST = Object.freeze({
  strategic_directives_v2: Object.freeze({
    keyColumns: Object.freeze(['sd_key', 'id']),
    jsonbColumn: 'metadata',
    // The one real extra-guard use case (removeMetadataKeyIfClaimedBy's claim CAS).
    extraGuardColumns: Object.freeze(['claiming_session_id']),
  }),
  // product_requirements_v2: PK is `id` (varchar 'PRD-SD-XXX', not a UUID, not sd_key-shaped
  // — verified live via information_schema during this SD's LEAD-phase investigation).
  // metadata is jsonb, nullable, DEFAULT '{}'::jsonb — same COALESCE-guard shape as above.
  // No production caller uses this entry yet (SD-LEARN-FIX-ADDRESS-PAT-LES-012's own
  // consumer is on an unmerged branch); it exists so the generic core is proven correct
  // against a real second-table shape (see generic-jsonb-merge.test.js) without taking on
  // that branch as a dependency.
  product_requirements_v2: Object.freeze({
    keyColumns: Object.freeze(['id']),
    jsonbColumn: 'metadata',
    extraGuardColumns: Object.freeze([]),
  }),
});

function getAllowlistSpec(table) {
  if (typeof table !== 'string' || !Object.hasOwn(JSONB_MERGE_ALLOWLIST, table)) return null;
  return JSONB_MERGE_ALLOWLIST[table];
}

function assertAllowedTarget(table, keyColumn, jsonbColumn) {
  const spec = getAllowlistSpec(table);
  if (!spec) {
    throw new Error(`mergeJsonbColumn: table '${table}' is not in JSONB_MERGE_ALLOWLIST`);
  }
  if (!spec.keyColumns.includes(keyColumn)) {
    throw new Error(`mergeJsonbColumn: keyColumn '${keyColumn}' is not allowed for table '${table}'`);
  }
  if (jsonbColumn !== spec.jsonbColumn) {
    throw new Error(`mergeJsonbColumn: jsonbColumn '${jsonbColumn}' is not allowed for table '${table}'`);
  }
  return spec;
}

/**
 * Generic, table-parameterized atomic JSONB `||` merge. Table/column identifiers are
 * validated against JSONB_MERGE_ALLOWLIST before being interpolated into SQL text — the
 * only values passed as actual bind parameters are keyValue and the patch JSON.
 *
 * @param {object} args
 * @param {string} args.table - must be a key in JSONB_MERGE_ALLOWLIST
 * @param {string} args.keyColumn - must be listed in that table's allowlist entry
 * @param {string} args.keyValue - the row's key value (bind parameter, not interpolated)
 * @param {string} args.jsonbColumn - must match that table's allowlist entry
 * @param {object} args.patch - plain object to merge in via jsonb `||`
 * @param {object} args.client - an already-connected raw pg client (caller owns lifecycle)
 * @returns {Promise<{rowCount: number}>}
 */
export async function mergeJsonbColumn({ table, keyColumn, keyValue, jsonbColumn, patch, client }) {
  assertAllowedTarget(table, keyColumn, jsonbColumn);
  const sql = `UPDATE ${table}
       SET ${jsonbColumn} = COALESCE(${jsonbColumn}, '{}'::jsonb) || $2::jsonb
       WHERE ${keyColumn} = $1`;
  return client.query(sql, [keyValue, JSON.stringify(patch)]);
}

/**
 * Generic, table-parameterized atomic JSONB `-` key-remove. Same identifier-allowlist
 * guard as mergeJsonbColumn. An OPTIONAL extra equality guard (e.g. a claim compare-and-
 * swap) can be appended via `extraGuardColumn`/`extraGuardValue` — the column name is
 * validated against that table's `extraGuardColumns` allowlist entry (never caller-supplied
 * free text) and the value is always passed as a bind parameter.
 *
 * SECURITY (EXEC-phase review, SEC-1): an earlier version of this function accepted a raw
 * `extraGuardSql` string fragment from the caller. Nothing validated it, and a hostile or
 * merely careless caller (e.g. `extraGuardSql: 'OR 1=1'`) could widen the WHERE predicate to
 * match every row, silently defeating the very compare-and-swap this parameter exists to
 * express. No production caller ever did this (only one real call site exists,
 * removeMetadataKeyIfClaimedBy, passing a fixed literal), but the primitive itself is the
 * right place to close the surface, not "no current caller misuses it." Replaced with a
 * closed-shape column+value pair so free-text SQL never reaches this function's public API.
 *
 * @param {object} args
 * @param {string} args.table
 * @param {string} args.keyColumn
 * @param {string} args.keyValue
 * @param {string} args.jsonbColumn
 * @param {string} args.key - top-level JSONB key to remove
 * @param {object} args.client
 * @param {string} [args.extraGuardColumn] - must be listed in the table's extraGuardColumns allowlist entry
 * @param {*} [args.extraGuardValue] - bind parameter for the extra guard; required iff extraGuardColumn is given
 * @returns {Promise<{rowCount: number}>}
 */
export async function removeJsonbColumnKey({ table, keyColumn, keyValue, jsonbColumn, key, client, extraGuardColumn, extraGuardValue }) {
  const spec = assertAllowedTarget(table, keyColumn, jsonbColumn);
  const params = [keyValue, key];
  let extraSql = '';
  if (extraGuardColumn !== undefined) {
    if (!spec.extraGuardColumns.includes(extraGuardColumn)) {
      throw new Error(`removeJsonbColumnKey: extraGuardColumn '${extraGuardColumn}' is not allowed for table '${table}'`);
    }
    extraSql = ` AND ${extraGuardColumn} = $3`;
    params.push(extraGuardValue);
  }
  const sql = `UPDATE ${table}
       SET ${jsonbColumn} = COALESCE(${jsonbColumn}, '{}'::jsonb) - $2::text
       WHERE ${keyColumn} = $1${extraSql}`;
  return client.query(sql, params);
}

/**
 * @param {string} sdKey
 * @param {object} patch - plain, JSON-serializable object of ONLY the keys to set/overwrite.
 *   A nested object REPLACES (not deep-merges) the corresponding top-level key — the same
 *   semantics as Postgres jsonb `||`.
 * @param {object} [opts]
 * @param {Function} [opts.createClientFn] test-injection seam (defaults to createDatabaseClient)
 * @param {string} [opts.writer] identity of the calling module/script (e.g. 'hold-writer').
 *   Providing writer WITHOUT reason (or vice versa) is refused — partial provenance is worse
 *   than none, since it reads as audited without actually being reconstructable.
 * @param {string} [opts.reason] human-readable reason for this specific write.
 * @returns {Promise<{merged: boolean, sdKey: string, error?: string}>}
 */
export async function mergeMetadataKeys(sdKey, patch, opts = {}) {
  if (!sdKey || typeof sdKey !== 'string') {
    throw new Error('mergeMetadataKeys: sdKey is required');
  }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('mergeMetadataKeys: patch must be a plain object');
  }
  const { createClientFn = createDatabaseClient, writer, reason } = opts;
  const hasWriter = typeof writer === 'string' && writer.length > 0;
  const hasReason = typeof reason === 'string' && reason.length > 0;
  if (hasWriter !== hasReason) {
    return { merged: false, sdKey, error: 'writer_and_reason_must_both_be_present_or_both_absent' };
  }
  const provenance = hasWriter ? { writer, reason } : null;

  let client;
  try {
    client = await createClientFn('engineer', { verify: false });
  } catch (connErr) {
    return { merged: false, sdKey, error: `db_connect_failed: ${connErr.message}` };
  }

  try {
    // QF-20260727-858: requires_human_action=true must name a decider. This helper is the
    // canonical chokepoint for hold-flag writes (see docblock above — it exists precisely to stop
    // future stampers reintroducing an unsafe hold-flag write), so the pairing rule belongs here
    // rather than in each caller. Only a patch that TURNS THE FLAG ON is constrained; the row's
    // existing decider satisfies it, so re-stamping an already-routed row is unaffected.
    if (isHumanActionRequested(patch.requires_human_action) && !namedDecider(patch)) {
      const { rows } = await client.query(
        'SELECT metadata FROM strategic_directives_v2 WHERE sd_key = $1',
        [sdKey],
      );
      const verdict = checkDeciderPairing(patch, rows?.[0]?.metadata || null);
      if (!verdict.ok) return { merged: false, sdKey, error: verdict.reason };
    }

    const now = new Date().toISOString();
    const writePatch = provenance
      ? { ...patch, last_metadata_write: { writer: provenance.writer, reason: provenance.reason, at: now, keys: Object.keys(patch) } }
      : patch;

    // COALESCE guards a SQL-NULL metadata column (NULL::jsonb || x evaluates to NULL in
    // Postgres — see clear-coordinator-review.js's identical guard) from silently wiping
    // the whole blob on a row whose metadata has never been set.
    const result = await mergeJsonbColumn({
      table: 'strategic_directives_v2', keyColumn: 'sd_key', keyValue: sdKey,
      jsonbColumn: 'metadata', patch: writePatch, client,
    });
    const merged = result.rowCount > 0;
    if (merged && provenance) {
      // Fail-open: the metadata write already landed; an audit-table hiccup must never undo
      // or fail the caller's write.
      try {
        await client.query(
          `INSERT INTO audit_log (event_type, entity_type, entity_id, new_value, metadata, severity, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            'sd_metadata_merge', 'strategic_directive', sdKey,
            JSON.stringify(patch),
            JSON.stringify({ writer: provenance.writer, reason: provenance.reason, keys: Object.keys(patch) }),
            'info', provenance.writer,
          ]
        );
      } catch { /* best-effort — the merge itself already succeeded */ }
    }
    return { merged, sdKey };
  } catch (queryErr) {
    return { merged: false, sdKey, error: queryErr.message };
  } finally {
    try { await client.end(); } catch { /* best-effort close */ }
  }
}

/**
 * SD-LEO-FIX-STRATEGIC-DIRECTIVES-UPDATED-001: sibling primitive for the one call shape
 * mergeMetadataKeys cannot express -- REMOVING a top-level key while also enforcing a
 * claiming_session_id compare-and-swap (the caller only owns the delete if it still holds the
 * claim). lib/checkin/steps/release-request.cjs previously did this via a client-side
 * read-spread-delete-full-blob-write, which is safe against claim-stealing (the WHERE guard)
 * but NOT against a DIFFERENT concurrent stamper's key landing between the read and the write
 * -- that key would be silently clobbered by the full-blob replace. This does the delete
 * server-side (jsonb `-` operator) under the SAME id+claiming_session_id guard, so a 0-row
 * result means "the claim moved out from under you" exactly as before, but no other metadata
 * key is ever touched.
 *
 * @param {string} id - strategic_directives_v2.id (varchar, UUID for some rows only --
 *   corrected 2026-09-14, SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001, was previously
 *   documented as always-UUID)
 * @param {string} key - top-level metadata key to remove
 * @param {string} claimingSessionId - the session that must still hold the claim
 * @param {object} [opts]
 * @param {Function} [opts.createClientFn] test-injection seam (defaults to createDatabaseClient)
 * @returns {Promise<{removed: boolean, id: string, error?: string}>}
 */
/**
 * Sibling to removeMetadataKeyIfClaimedBy for the unguarded case (no claim to compare against
 * -- e.g. a coordinator reconciliation job clearing a stale flag by sd_key). Same server-side
 * jsonb `-` delete, no client-side read-then-write.
 *
 * @param {string} sdKey
 * @param {string} key - top-level metadata key to remove
 * @param {object} [opts]
 * @param {Function} [opts.createClientFn] test-injection seam (defaults to createDatabaseClient)
 * @returns {Promise<{removed: boolean, sdKey: string, error?: string}>}
 */
export async function removeMetadataKey(sdKey, key, opts = {}) {
  if (!sdKey || typeof sdKey !== 'string') throw new Error('removeMetadataKey: sdKey is required');
  if (!key || typeof key !== 'string') throw new Error('removeMetadataKey: key is required');
  const { createClientFn = createDatabaseClient } = opts;
  let client;
  try {
    client = await createClientFn('engineer', { verify: false });
  } catch (connErr) {
    return { removed: false, sdKey, error: `db_connect_failed: ${connErr.message}` };
  }
  try {
    const result = await removeJsonbColumnKey({
      table: 'strategic_directives_v2', keyColumn: 'sd_key', keyValue: sdKey,
      jsonbColumn: 'metadata', key, client,
    });
    return { removed: result.rowCount > 0, sdKey };
  } catch (queryErr) {
    return { removed: false, sdKey, error: queryErr.message };
  } finally {
    try { await client.end(); } catch { /* best-effort close */ }
  }
}

export async function removeMetadataKeyIfClaimedBy(id, key, claimingSessionId, opts = {}) {
  if (!id || typeof id !== 'string') throw new Error('removeMetadataKeyIfClaimedBy: id is required');
  if (!key || typeof key !== 'string') throw new Error('removeMetadataKeyIfClaimedBy: key is required');
  if (!claimingSessionId || typeof claimingSessionId !== 'string') {
    throw new Error('removeMetadataKeyIfClaimedBy: claimingSessionId is required');
  }
  const { createClientFn = createDatabaseClient } = opts;
  let client;
  try {
    client = await createClientFn('engineer', { verify: false });
  } catch (connErr) {
    return { removed: false, id, error: `db_connect_failed: ${connErr.message}` };
  }
  try {
    const result = await removeJsonbColumnKey({
      table: 'strategic_directives_v2', keyColumn: 'id', keyValue: id,
      jsonbColumn: 'metadata', key, client,
      extraGuardColumn: 'claiming_session_id', extraGuardValue: claimingSessionId,
    });
    return { removed: result.rowCount > 0, id };
  } catch (queryErr) {
    return { removed: false, id, error: queryErr.message };
  } finally {
    try { await client.end(); } catch { /* best-effort close */ }
  }
}
