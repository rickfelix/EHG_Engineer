/**
 * SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 FR-1a.
 *
 * Pure JS-level suite (no DB) proving getPreference's hardened multi-row handling:
 * .select('*') + explicit length check instead of .single(), ordered by updated_at
 * DESC, and a logged (not silent) observation when a scope that should be unique
 * returns more than one row.
 *
 * The DB-level proof of the actual constraint fix (UNIQUE NULLS NOT DISTINCT, verified
 * against a disposable TEMP TABLE) lives in
 * tests/database/chairman-preferences-nulls-not-distinct.db.test.js — that suite needs
 * a real Postgres connection to prove constraint semantics (not meaningfully mockable),
 * so it is routed to the gated `db` vitest project rather than this always-running
 * unit-project file, per this repo's DB-test guard (scripts/audit-db-test-guards.mjs).
 */
import { describe, it, expect } from 'vitest';
import { ChairmanPreferenceStore } from '../../../lib/eva/chairman-preference-store.js';

describe('FR-1a — getPreference multi-row handling (pure JS, no DB)', () => {
  function makeMockSupabase(rowsByCall) {
    let callIndex = 0;
    return {
      from() {
        const calls = rowsByCall[callIndex] ?? [];
        callIndex += 1;
        const builder = {
          select: () => builder,
          eq: () => builder,
          is: () => builder,
          order: () => Promise.resolve({ data: calls, error: null }),
        };
        return builder;
      },
    };
  }

  it('returns null when zero rows match (no throw, no .single() PGRST116)', async () => {
    const store = new ChairmanPreferenceStore({ supabaseClient: makeMockSupabase([[]]) });
    const result = await store.getPreference({ chairmanId: 'ehg_chairman', key: 'notifications.timezone' });
    expect(result).toBeNull();
  });

  it('returns the single row when exactly one matches', async () => {
    const row = { id: '1', preference_key: 'notifications.timezone', preference_value: 'America/Jamaica', value_type: 'string', source: 'chairman_directive', updated_at: '2026-08-08T00:00:00Z' };
    const store = new ChairmanPreferenceStore({ supabaseClient: makeMockSupabase([[row]]) });
    const result = await store.getPreference({ chairmanId: 'ehg_chairman', key: 'notifications.timezone' });
    expect(result.value).toBe('America/Jamaica');
  });

  it('when 2+ rows match a unique scope, returns the most-recently-updated one AND logs the violation (not silent null)', async () => {
    const older = { id: '1', preference_key: 'notifications.quiet_hours_extended_until', preference_value: 'old', value_type: 'string', source: 'chairman_directive', updated_at: '2026-07-25T00:00:00Z' };
    const newer = { id: '2', preference_key: 'notifications.quiet_hours_extended_until', preference_value: 'new', value_type: 'string', source: 'chairman_directive', updated_at: '2026-08-08T00:00:00Z' };
    // Mock's .order() call returns rows verbatim -- the store's own query already requests
    // ascending:false, so the test asserts the store picks index [0] after that ordering by
    // supplying rows pre-sorted newest-first, matching what a real ORDER BY would return.
    const errorLog = [];
    const logger = { error: (...args) => errorLog.push(args) };
    const store = new ChairmanPreferenceStore({ supabaseClient: makeMockSupabase([[newer, older]]), logger });
    const result = await store.getPreference({ chairmanId: 'ehg_chairman', key: 'notifications.quiet_hours_extended_until' });
    expect(result.value).toBe('new');
    expect(errorLog.length).toBe(1);
    expect(errorLog[0][0]).toBe('chairman_preference.multi_row_scope_violation');
    expect(errorLog[0][1].rowCount).toBe(2);
  });
});
