/**
 * SD-LEO-INFRA-DEFINITION-DONE-ACTIVATION-001 (G3, FR-6) — 30-day retro sweep.
 * Detection-only: must never write, must correctly separate machinery-class from
 * non-machinery, and must classify UNWIRED vs ACTIVATED/ARMED correctly.
 */
import { describe, it, expect } from 'vitest';
import { fetchRecentCompletedSds, evaluateSdForSweep, runSweep } from '../../../scripts/machinery-class-retro-sweep.mjs';

const WORKER_SD = { sd_key: 'SD-DORMANT-WATCHER-001', id: 'sd-1', key_changes: [{ type: 'watcher', change: 'eva-scheduler watcher' }] };
const DOCS_SD = { sd_key: 'SD-DOCS-001', id: 'sd-2', key_changes: [{ type: 'documentation', change: 'docs' }] };

function fakeSb({ sds = [], activationRows = [], armedRows = [] } = {}) {
  const writeCalls = [];
  return {
    writeCalls,
    from(table) {
      if (table === 'strategic_directives_v2') {
        return {
          select() {
            const chain = {
              eq: () => chain,
              gte: () => chain,
              order: () => chain,
              range: () => Promise.resolve({ data: sds, error: null }),
            };
            return chain;
          },
          upsert: (...args) => { writeCalls.push({ table, args }); return Promise.resolve({ error: null }); },
          update: (...args) => { writeCalls.push({ table, args }); return { eq: () => Promise.resolve({ error: null }) }; },
        };
      }
      // scope_completion_chain / periodic_process_registry — same shape both tables need.
      return {
        select() {
          const chain = {
            in: () => chain,
            eq: () => chain,
            not: () => chain,
            contains: () => chain,
            limit: () => Promise.resolve({
              data: table === 'scope_completion_chain' ? activationRows : armedRows,
              error: null,
            }),
          };
          return chain;
        },
        upsert: (...args) => { writeCalls.push({ table, args }); return Promise.resolve({ error: null }); },
      };
    },
  };
}

describe('fetchRecentCompletedSds', () => {
  it('returns rows on success', async () => {
    const sb = fakeSb({ sds: [WORKER_SD] });
    const result = await fetchRecentCompletedSds(sb, 30);
    expect(result).toEqual([WORKER_SD]);
  });
});

describe('evaluateSdForSweep', () => {
  it('returns null for a non-machinery-class SD (excluded from the sweep entirely)', async () => {
    const sb = fakeSb();
    expect(await evaluateSdForSweep(sb, DOCS_SD)).toBeNull();
  });

  it('classifies a machinery-class SD with no evidence as UNWIRED', async () => {
    const sb = fakeSb();
    const result = await evaluateSdForSweep(sb, WORKER_SD);
    expect(result).toMatchObject({ sd_key: 'SD-DORMANT-WATCHER-001', machineryClass: true, kind: 'watcher', state: 'UNWIRED' });
  });

  it('classifies a machinery-class SD with real-event evidence as ACTIVATED (not would-have-failed)', async () => {
    const sb = fakeSb({ activationRows: [{ id: 'row-1' }] });
    const result = await evaluateSdForSweep(sb, WORKER_SD);
    expect(result.state).toBe('ACTIVATED');
  });
});

describe('runSweep — the smoke test of the classifier (detection only, zero writes)', () => {
  it('separates machinery-class from non-machinery and flags only UNWIRED as would-have-failed', async () => {
    const sb = fakeSb({ sds: [WORKER_SD, DOCS_SD] });
    const result = await runSweep(sb, 30);
    expect(result.totalScanned).toBe(2);
    expect(result.machineryClassCount).toBe(1);
    expect(result.wouldHaveFailed).toHaveLength(1);
    expect(result.wouldHaveFailed[0].sd_key).toBe('SD-DORMANT-WATCHER-001');
  });

  it('reports zero would-have-failed when the machinery-class SD has evidence', async () => {
    const sb = fakeSb({ sds: [WORKER_SD], activationRows: [{ id: 'row-1' }] });
    const result = await runSweep(sb, 30);
    expect(result.wouldHaveFailed).toHaveLength(0);
  });

  it('makes ZERO writes — the sweep is read-only by construction', async () => {
    const sb = fakeSb({ sds: [WORKER_SD, DOCS_SD] });
    await runSweep(sb, 30);
    expect(sb.writeCalls).toHaveLength(0);
  });

  it('handles an empty result set without throwing', async () => {
    const sb = fakeSb({ sds: [] });
    const result = await runSweep(sb, 30);
    expect(result).toEqual({ totalScanned: 0, machineryClassCount: 0, wouldHaveFailed: [] });
  });
});
