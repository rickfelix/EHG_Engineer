/**
 * SD-APEXNICHE-AI-LEO-GEN-WITNESS-LOOKUP-DURABLE-001 (FR-5)
 * logFindings()'s capability-gated repo write: only included once the
 * chairman-gated ship_review_findings.repo column exists (probed at
 * runtime), and always normalized ('owner/name', lowercase, no .git).
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { __resetRepoColumnProbeForTests } from '../../../lib/ship/repo-column-probe.mjs';
import { logFindings } from '../../../lib/ship/review-findings-logger.js';

const state = vi.hoisted(() => ({ insertedRows: [], probeError: null }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: (cols) => {
        // probeRepoColumnExists shape: select('repo').limit(1), awaited directly.
        if (cols === 'repo') {
          const p = Promise.resolve({ data: state.probeError ? null : [], error: state.probeError });
          p.limit = () => p;
          return p;
        }
        return {};
      },
      insert: (row) => {
        state.insertedRows.push(row);
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'row-1' }, error: null }) }) };
      },
    }),
  }),
}));

beforeEach(() => {
  state.insertedRows.length = 0;
  state.probeError = null;
  __resetRepoColumnProbeForTests();
});

const BASE = { prNumber: 1, reviewTier: 'light', riskScore: 0, verdict: 'pass' };

describe('logFindings — repo (FR-5)', () => {
  it('includes normalized repo when the column exists and repo is supplied', async () => {
    await logFindings({ ...BASE, repo: 'rickfelix/ApexNiche-AI.git' });
    expect(state.insertedRows[0].repo).toBe('rickfelix/apexniche-ai');
  });

  it('omits the repo key entirely when not supplied (byte-identical to pre-FR-5 insert shape)', async () => {
    await logFindings({ ...BASE });
    expect('repo' in state.insertedRows[0]).toBe(false);
  });

  it('omits the repo key when the column is absent (probe 42703), even though repo was supplied', async () => {
    state.probeError = { code: '42703' };
    await logFindings({ ...BASE, repo: 'rickfelix/apexniche-ai' });
    expect('repo' in state.insertedRows[0]).toBe(false);
    // Every other field still writes normally -- the insert is not blocked.
    expect(state.insertedRows[0].pr_number).toBe(1);
  });
});
