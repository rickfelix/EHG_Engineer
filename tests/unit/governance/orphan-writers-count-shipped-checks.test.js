/**
 * SD-LEO-INFRA-COMPLETION-GATE-DATA-001-B: discriminates ALL-vs-ANY semantics for the two new
 * shipped-but-not-applied check functions -- EXEC-phase TESTING found both live specimens are
 * fully absent (found=[]), which cannot distinguish "ALL columns required" from "ANY column
 * required" in practice. A stubbed pgClient with a PARTIAL column set closes that gap.
 */
import { describe, it, expect } from 'vitest';
import { evaluateShippedButNotApplied } from '../../../scripts/orphan-writers-count.mjs';

function stubPgClient(rows) {
  return {
    query: async () => ({ rows }),
    end: async () => {},
  };
}

describe('orphan-writers-count shipped-but-not-applied ALL-columns semantics', () => {
  it('context-usage-log-leo-phase-tagging-migration: reports ORPHANED on a PARTIAL column set (2 of 3 present)', async () => {
    const entry = { id: 'context-usage-log-leo-phase-tagging-migration' };
    const partialRows = [{ column_name: 'loop_name' }, { column_name: 'sd_key' }]; // leo_phase missing
    const result = await evaluateShippedButNotApplied(entry, async () => stubPgClient(partialRows));
    expect(result.verdict).toBe('ORPHANED');
    expect(result.reason).toContain('found=[loop_name,sd_key]');
  });

  it('context-usage-log-leo-phase-tagging-migration: reports PASS only when ALL 3 columns are present', async () => {
    const entry = { id: 'context-usage-log-leo-phase-tagging-migration' };
    const fullRows = [{ column_name: 'loop_name' }, { column_name: 'sd_key' }, { column_name: 'leo_phase' }];
    const result = await evaluateShippedButNotApplied(entry, async () => stubPgClient(fullRows));
    expect(result.verdict).toBe('PASS');
  });

  it('operator-cash-burn-manual-revenue-provenance-migration: reports ORPHANED on a PARTIAL column set (1 of 2 present)', async () => {
    const entry = { id: 'operator-cash-burn-manual-revenue-provenance-migration' };
    const partialRows = [{ column_name: 'manual_revenue_usd' }]; // manual_revenue_last_synced_at missing
    const result = await evaluateShippedButNotApplied(entry, async () => stubPgClient(partialRows));
    expect(result.verdict).toBe('ORPHANED');
  });

  it('operator-cash-burn-manual-revenue-provenance-migration: reports PASS only when BOTH columns are present', async () => {
    const entry = { id: 'operator-cash-burn-manual-revenue-provenance-migration' };
    const fullRows = [{ column_name: 'manual_revenue_usd' }, { column_name: 'manual_revenue_last_synced_at' }];
    const result = await evaluateShippedButNotApplied(entry, async () => stubPgClient(fullRows));
    expect(result.verdict).toBe('PASS');
  });
});
