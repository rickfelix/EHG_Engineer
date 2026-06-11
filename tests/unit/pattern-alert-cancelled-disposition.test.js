/**
 * QF-20260611-851 — cancelled SD-PAT-FIX SDs must not regenerate.
 *
 * Pre-fix, hasExistingSD excluded cancelled SDs, so a bulk-cancelled draft was
 * invisible and the generator re-created it next cycle (14 cancelled at 13:31Z
 * 2026-06-11; 10 regenerated within ~25 min). Now: a cancelled SD counts as
 * existing unless the pattern has NEW occurrences after the cancellation.
 *
 * TEST_REQUIRES_DB: false — @supabase/supabase-js is vi.mock'd below; the env
 * values set before import only satisfy the module's construction guard.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const queries = [];
let sdRows = [];
const patternUpdates = [];

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({
            or: () => ({
              neq: () => ({
                order: () => ({
                  limit: () => {
                    queries.push(table);
                    return Promise.resolve({ data: sdRows, error: null });
                  },
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'issue_patterns') {
        return {
          update: (payload) => ({
            eq: (col, val) => {
              patternUpdates.push({ payload, col, val });
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      }
      return {};
    },
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://fake.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';

const { hasExistingSD } = await import('../../scripts/pattern-alert-sd-creator.js');

const T0 = '2026-06-11T13:00:00Z'; // pattern last activity
const T_CANCEL = '2026-06-11T13:31:00Z'; // bulk-cancel time (after T0)

beforeEach(() => {
  queries.length = 0;
  sdRows = [];
  patternUpdates.length = 0;
});

describe('QF-20260611-851: hasExistingSD cancelled-disposition', () => {
  it('live (non-cancelled) SD still short-circuits as before', async () => {
    sdRows = [{ id: '1', sd_key: 'SD-PAT-X-001', status: 'draft', updated_at: T_CANCEL }];
    const r = await hasExistingSD('PAT-X', { updated_at: T0 });
    expect(r.sd_key).toBe('SD-PAT-X-001');
    expect(r.disposition).toBeUndefined();
  });

  it('cancelled SD with NO new occurrences blocks regeneration and stamps disposition', async () => {
    sdRows = [{ id: '1', sd_key: 'SD-PAT-X-001', status: 'cancelled', updated_at: T_CANCEL }];
    const r = await hasExistingSD('PAT-X', { updated_at: T0, metadata: { keep: true } });
    expect(r.disposition).toBe('cancelled_no_new_occurrences');
    expect(patternUpdates).toHaveLength(1);
    const d = patternUpdates[0].payload.metadata.disposition;
    expect(d.kind).toBe('sd_cancelled_no_new_occurrences');
    expect(d.cancelled_sd).toBe('SD-PAT-X-001');
    expect(patternUpdates[0].payload.metadata.keep).toBe(true); // merge, not clobber
    expect(patternUpdates[0].val).toBe('PAT-X');
  });

  it('cancelled SD but pattern has NEW occurrences after cancel → regeneration allowed (returns null)', async () => {
    sdRows = [{ id: '1', sd_key: 'SD-PAT-X-001', status: 'cancelled', updated_at: T_CANCEL }];
    const r = await hasExistingSD('PAT-X', { updated_at: '2026-06-11T14:00:00Z' });
    expect(r).toBeNull();
    expect(patternUpdates).toHaveLength(0);
  });

  it('no SDs at all → null (creation proceeds)', async () => {
    const r = await hasExistingSD('PAT-X', { updated_at: T0 });
    expect(r).toBeNull();
  });

  it('missing pattern timestamps fail SAFE (treated as no new occurrences — skip)', async () => {
    sdRows = [{ id: '1', sd_key: 'SD-PAT-X-001', status: 'cancelled', updated_at: T_CANCEL }];
    const r = await hasExistingSD('PAT-X', null);
    expect(r.disposition).toBe('cancelled_no_new_occurrences');
  });
});
