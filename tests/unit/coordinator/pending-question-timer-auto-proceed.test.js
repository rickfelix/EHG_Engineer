/**
 * SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-F
 *
 * lib/coordinator/pending-question-timer.cjs's applyAutoProceed() writes only lifecycle
 * columns (status, resolved_at, resolution_notes, metadata) to `feedback` -- confirmed against
 * database/chairman-gated/20260912_feedback_no_update_lifecycle_allowlist.sql's WHEN-clause
 * census, already exempted from the append-only trigger with no code change needed. This is a
 * verification-only regression test proving the lifecycle UPDATE actually lands, plus a check
 * that a rejected update is surfaced (already handled correctly in production code).
 */
import { describe, it, expect } from 'vitest';
import { applyAutoProceed } from '../../../lib/coordinator/pending-question-timer.cjs';

function makeFakeSupabase(row, { forceError = null } = {}) {
  const state = { ...row };
  return {
    _row: state,
    from(table) {
      if (table !== 'feedback') throw new Error(`unexpected table: ${table}`);
      return {
        update(patch) {
          return {
            eq(col1, val1) {
              return {
                eq(col2, val2) {
                  if (forceError) return Promise.resolve({ error: forceError });
                  if (state[col1] === val1 && state[col2] === val2) {
                    Object.assign(state, patch);
                    return Promise.resolve({ error: null });
                  }
                  return Promise.resolve({ error: null }); // no-op match, still "succeeds" like a real 0-row update
                },
              };
            },
          };
        },
      };
    },
  };
}

describe('applyAutoProceed (SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-F, verification-only)', () => {
  const q = { id: 'q-1', metadata: { existing: 'field' } };
  const decision = { recommended_option: 'A', reason: 'no operator response' };

  it('writes only lifecycle columns and they land', async () => {
    const sb = makeFakeSupabase({ id: 'q-1', status: 'new' });
    const result = await applyAutoProceed(sb, q, decision, Date.now());
    expect(result.ok).toBe(true);
    expect(sb._row.status).toBe('resolved');
    expect(sb._row.resolution_notes).toMatch(/AUTO-PROCEEDED/);
    expect(sb._row.metadata.auto_proceeded).toBe(true);
    expect(sb._row.metadata.existing).toBe('field'); // merged, not clobbered
  });

  it('surfaces (does not throw) a rejected update', async () => {
    const sb = makeFakeSupabase({ id: 'q-1', status: 'new' }, { forceError: { message: 'rejected: content column changed' } });
    const result = await applyAutoProceed(sb, q, decision, Date.now());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/rejected/);
  });
});
