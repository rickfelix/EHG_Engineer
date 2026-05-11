// Read-after-write verification for metadata-class column UPDATEs.
// Closes QF-20260509-650 (witness feedback 5e04c8c1) — makes column-disambiguation
// silent-success bugs impossible by binding write-target column to verify-read column.
// Usage + when-to-apply rules: .claude/agents/database-agent.partial "Read-After-Write Verification".

export class WritebackVerificationError extends Error {
  constructor({ table, column, missing, foundInSibling, row }) {
    const parts = [`writeback verification failed on ${table}.${column}`, `missing keys: ${JSON.stringify(missing)}`];
    if (foundInSibling) parts.push(`note: keys present in sibling column "${foundInSibling}" — likely column-disambiguation bug`);
    super(parts.join(' | '));
    this.name = 'WritebackVerificationError';
    Object.assign(this, { table, column, missing, foundInSibling: foundInSibling || null, row: row || null });
  }
}

const METADATA_SIBLINGS = ['metadata', 'governance_metadata'];
const applyMatch = (q, m) => Object.entries(m).reduce((acc, [k, v]) => acc.eq(k, v), q);
const diffMissing = (obj, keys) => (obj && typeof obj === 'object') ? keys.filter((k) => !(k in obj)) : [...keys];

export async function updateAndVerify({ client, table, match, column, patch, verifyKeys, replace = false }) {
  if (!client || !table || !column || !match || !patch || !Array.isArray(verifyKeys) || verifyKeys.length === 0) {
    throw new Error('updateAndVerify: client, table, match, column, patch, verifyKeys[] required');
  }
  let mergedValue = patch;
  if (!replace) {
    const r = await applyMatch(client.from(table).select(column), match).single();
    if (r.error) throw new Error(`updateAndVerify: read-before failed: ${r.error.message}`);
    mergedValue = { ...((r.data && r.data[column]) || {}), ...patch };
  }
  const upd = await applyMatch(client.from(table).update({ [column]: mergedValue }), match);
  if (upd.error) throw new Error(`updateAndVerify: update failed: ${upd.error.message}`);
  const readCols = Array.from(new Set([...METADATA_SIBLINGS, column])).join(', ');
  const v = await applyMatch(client.from(table).select(readCols), match).single();
  if (v.error) throw new Error(`updateAndVerify: read-after-write failed: ${v.error.message}`);
  const row = v.data || {};
  const missing = diffMissing(row[column], verifyKeys);
  if (missing.length === 0) return { row };
  let foundInSibling = null;
  for (const sib of METADATA_SIBLINGS) {
    if (sib === column) continue;
    const sv = row[sib];
    if (sv && typeof sv === 'object' && verifyKeys.some((k) => k in sv)) { foundInSibling = sib; break; }
  }
  throw new WritebackVerificationError({ table, column, missing, foundInSibling, row });
}
