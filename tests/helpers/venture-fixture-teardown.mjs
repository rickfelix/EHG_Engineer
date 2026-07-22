/**
 * Reusable LOUD fixture-venture teardown for integration tests.
 * SD-LEO-INFRA-VENTURES-DATA-HYGIENE-001 (FR-4a).
 *
 * Mirrors the s17-parity `cleanParityFixtures` pattern: delete the known FK child rows
 * FIRST, then the venture rows, and THROW on any delete error. The failure mode this
 * prevents is the historical one — an unchecked ventures.delete() hits an FK violation,
 * fails SILENTLY, and fixtures leak live for days while every later run's self-clean
 * keeps silently failing too. A teardown that throws makes a future leak fail the suite
 * instead of hiding it.
 *
 * Two entry points:
 *   teardownFixtureVentures(supabase, ids)        — by explicit venture id list
 *   teardownFixtureVenturesByName(supabase, like) — by name-prefix pattern (e.g. 'parity-test-%')
 */

// FK children observed blocking ventures.delete() in the 2026-06-10 leak. HARD-deleted
// first so the ventures.delete() below cannot FK-violate. Order: children before parents.
const FK_CHILD_TABLES = [
  { table: 'chairman_decisions', column: 'venture_id' },
  { table: 'venture_analysis_artifacts', column: 'venture_id' },
  { table: 'factory_guardrail_state', column: 'venture_id' },
];

/**
 * Delete fixture ventures + their FK children by explicit id list. THROWS on any error.
 * @param {object} supabase - supabase client
 * @param {string[]} ids - venture ids to remove
 */
export async function teardownFixtureVentures(supabase, ids) {
  if (!ids || ids.length === 0) return;
  for (const { table, column } of FK_CHILD_TABLES) {
    const { error } = await supabase.from(table).delete().in(column, ids);
    // A missing optional child table must not mask a real FK blocker — surface it.
    if (error) throw new Error(`fixture teardown: ${table}.${column} delete failed: ${error.message}`);
  }
  const { error } = await supabase.from('ventures').delete().in('id', ids);
  if (error) {
    throw new Error(
      `fixture venture teardown FAILED (fixtures would leak): ${error.message} — ` +
      'an FK child is blocking the delete; find it and add it to FK_CHILD_TABLES.'
    );
  }
}

/**
 * Name-pattern variant: resolve ids via a `LIKE` prefix, then delegate. THROWS on error.
 * @param {object} supabase - supabase client
 * @param {string} likePattern - e.g. 'parity-test-%'
 */
export async function teardownFixtureVenturesByName(supabase, likePattern) {
  const { data, error } = await supabase.from('ventures').select('id').like('name', likePattern);
  if (error) throw new Error(`fixture teardown: name lookup '${likePattern}' failed: ${error.message}`);
  await teardownFixtureVentures(supabase, (data ?? []).map((v) => v.id));
}
