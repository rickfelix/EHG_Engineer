/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-J (FR-10) -- the weekly graduation-gauge runner
 * stamps ONLY on a clean lint sweep AND a registry that matches the live venture_stages table.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { STAGE_KEY_BY_NUMBER } from '../../../lib/eva/stage-templates/stage-key-registry.js';

const execFileSyncMock = vi.fn();
const stampLastFiredMock = vi.fn().mockResolvedValue({ stamped: true });
let ventureStagesRows = Object.entries(STAGE_KEY_BY_NUMBER).map(([num, key]) => ({ stage_number: Number(num), stage_key: key }));

const createClientMock = vi.fn().mockReturnValue({
  from: (table) => {
    if (table !== 'venture_stages') throw new Error(`unexpected table: ${table}`);
    return { select: () => ({ limit: () => Promise.resolve({ data: ventureStagesRows, error: null }) }) };
  },
});

vi.mock('node:child_process', () => ({ execFileSync: (...args) => execFileSyncMock(...args) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: (...args) => createClientMock(...args) }));
vi.mock('../../../lib/periodic-liveness/stamp-last-fired.js', () => ({ stampLastFired: (...args) => stampLastFiredMock(...args) }));

const { runWeeklyStampCheck, checkRegistryDrift } = await import('../../../scripts/cron/eva-stage-literal-lint-weekly-stamp.mjs');

beforeEach(() => {
  execFileSyncMock.mockReset();
  stampLastFiredMock.mockClear();
  ventureStagesRows = Object.entries(STAGE_KEY_BY_NUMBER).map(([num, key]) => ({ stage_number: Number(num), stage_key: key }));
});

describe('eva-stage-literal-lint-weekly-stamp', () => {
  it('stamps standard_loop:eva-stage-literal-lint-weekly on a clean sweep + matching registry', async () => {
    execFileSyncMock.mockReturnValue('✅ eva-stage-literal-lint (all): 655 file(s) checked, 0 violations\n');
    const code = await runWeeklyStampCheck();
    expect(code).toBe(0);
    expect(stampLastFiredMock).toHaveBeenCalledWith(expect.anything(), 'standard_loop:eva-stage-literal-lint-weekly');
  });

  it('does NOT stamp on a dirty sweep, and preserves the lint\'s exit code', async () => {
    const err = new Error('exit 1');
    err.status = 1;
    err.stdout = '❌ eva-stage-literal-lint (all): 1 violation(s)\n';
    err.stderr = '';
    execFileSyncMock.mockImplementation(() => { throw err; });

    const code = await runWeeklyStampCheck();
    expect(code).toBe(1);
    expect(stampLastFiredMock).not.toHaveBeenCalled();
  });

  it('does NOT stamp when the sweep is clean but the registry has drifted from the live table', async () => {
    execFileSyncMock.mockReturnValue('✅ eva-stage-literal-lint (all): 655 file(s) checked, 0 violations\n');
    ventureStagesRows = ventureStagesRows.map((r) => (r.stage_number === 24 ? { ...r, stage_key: 'renamed_stage_key' } : r));

    const code = await runWeeklyStampCheck();
    expect(code).toBe(1);
    expect(stampLastFiredMock).not.toHaveBeenCalled();
  });
});

describe('checkRegistryDrift', () => {
  it('returns no mismatches when the static map matches the live table exactly', async () => {
    const mismatches = await checkRegistryDrift(createClientMock());
    expect(mismatches).toEqual([]);
  });

  it('reports a mismatch when a live stage_key differs from the registry', async () => {
    ventureStagesRows = ventureStagesRows.map((r) => (r.stage_number === 5 ? { ...r, stage_key: 'renamed' } : r));
    const mismatches = await checkRegistryDrift(createClientMock());
    expect(mismatches).toContainEqual({ stage_number: 5, registry: STAGE_KEY_BY_NUMBER[5], live: 'renamed' });
  });

  it('reports a mismatch when the live table has a stage the registry lacks', async () => {
    ventureStagesRows = [...ventureStagesRows, { stage_number: 28, stage_key: 'future_stage' }];
    const mismatches = await checkRegistryDrift(createClientMock());
    expect(mismatches).toContainEqual({ stage_number: 28, registry: 'MISSING_FROM_REGISTRY', live: 'future_stage' });
  });
});
