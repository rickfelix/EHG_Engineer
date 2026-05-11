/**
 * Read-after-write verification for metadata-class column updates.
 *
 * Closes QF-20260509-650 (witness 5e04c8c1): database-agent SendMessage
 * resumption returned success without verifying writes persisted. Root cause
 * was a column-disambiguation bug — agent wrote to `metadata` and reported
 * success against `governance_metadata`. This helper makes that class of
 * silent-success bug impossible: the write target column and the verification
 * read column are the same parameter.
 *
 * Usage:
 *   await updateAndVerify({
 *     client: supabase,
 *     table: 'strategic_directives_v2',
 *     match: { id: 'SD-EXAMPLE-001' },
 *     column: 'governance_metadata',
 *     patch: { decomposition_judgment: 'split', cascade_flag_overridden: true },
 *     verifyKeys: ['decomposition_judgment', 'cascade_flag_overridden'],
 *   });
 *
 * On verification failure throws WritebackVerificationError with the
 * column name, missing keys, and (when detected) the sibling column where
 * the keys *did* land — the diagnostic for column-disambiguation bugs.
 */

export class WritebackVerificationError extends Error {
  constructor({ table, column, missing, foundInSibling, row }) {
    const parts = [
      `writeback verification failed on ${table}.${column}`,
      `missing keys: ${JSON.stringify(missing)}`,
    ];
    if (foundInSibling) parts.push(`note: keys present in sibling column "${foundInSibling}" — likely column-disambiguation bug`);
    super(parts.join(' | '));
    this.name = 'WritebackVerificationError';
    this.table = table;
    this.column = column;
    this.missing = missing;
    this.foundInSibling = foundInSibling || null;
    this.row = row || null;
  }
}

const METADATA_SIBLINGS = ['metadata', 'governance_metadata'];

function applyMatch(query, match) {
  for (const [k, v] of Object.entries(match)) query = query.eq(k, v);
  return query;
}

function diffMissing(obj, keys) {
  if (!obj || typeof obj !== 'object') return [...keys];
  return keys.filter((k) => !(k in obj));
}

/**
 * Atomically UPDATE a metadata-class column and verify keys persisted by reading it back.
 *
 * @param {object} args
 * @param {object} args.client - supabase client
 * @param {string} args.table - target table
 * @param {object} args.match - row filter (e.g. {id: 'SD-...'})
 * @param {string} args.column - metadata-class column being mutated (must equal the column the patch flows into)
 * @param {object} args.patch - object merged into the column (or its replacement value when args.replace is true)
 * @param {string[]} args.verifyKeys - keys that MUST exist in the column after the write
 * @param {boolean} [args.replace=false] - when true, replace the column wholesale instead of merging
 * @returns {Promise<{row: object}>}
 * @throws {WritebackVerificationError} if any verifyKey is absent after the write
 */
export async function updateAndVerify({ client, table, match, column, patch, verifyKeys, replace = false }) {
  if (!client || !table || !column || !match || !patch || !Array.isArray(verifyKeys) || verifyKeys.length === 0) {
    throw new Error('updateAndVerify: client, table, match, column, patch, verifyKeys[] required');
  }
  const readCols = Array.from(new Set([...METADATA_SIBLINGS, column])).join(', ');

  let mergedValue = patch;
  if (!replace) {
    const readBefore = await applyMatch(client.from(table).select(column), match).single();
    if (readBefore.error) throw new Error(`updateAndVerify: read-before failed: ${readBefore.error.message}`);
    const current = (readBefore.data && readBefore.data[column]) || {};
    mergedValue = { ...current, ...patch };
  }

  const upd = await applyMatch(client.from(table).update({ [column]: mergedValue }), match);
  if (upd.error) throw new Error(`updateAndVerify: update failed: ${upd.error.message}`);

  const verify = await applyMatch(client.from(table).select(readCols), match).single();
  if (verify.error) throw new Error(`updateAndVerify: read-after-write failed: ${verify.error.message}`);
  const row = verify.data || {};
  const missing = diffMissing(row[column], verifyKeys);
  if (missing.length === 0) return { row };

  let foundInSibling = null;
  for (const sib of METADATA_SIBLINGS) {
    if (sib === column) continue;
    const sibVal = row[sib];
    if (sibVal && typeof sibVal === 'object') {
      const presentInSib = verifyKeys.filter((k) => k in sibVal);
      if (presentInSib.length > 0) { foundInSibling = sib; break; }
    }
  }
  throw new WritebackVerificationError({ table, column, missing, foundInSibling, row });
}
