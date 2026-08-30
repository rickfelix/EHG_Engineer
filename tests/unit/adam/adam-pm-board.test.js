/**
 * Unit pins for the chairman-curated PM board view's pure fixture-to-panel logic.
 * SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-B (Child B / FR-4).
 */
import { describe, it, expect } from 'vitest';
import { groupByParent, buildBoardView } from '../../../scripts/adam-pm-board.mjs';
import { encodeManualChildMeta } from '../../../lib/adam/task-ledger.js';

function fixtureRows() {
  return [
    { id: 'parent-1', tier: 'parent', title: 'Run#5 -> candidate#2', benefit: 'unblocks next venture cycle', risk: 'daemon reswap flaky', status: 'in_progress' },
    { id: 'child-1', tier: 'child', parent_id: 'parent-1', title: 'get-daemon-reswap', status: 'blocked', blocker: 'awaiting coordinator reswap', token_cost: 120 },
    { id: 'child-2', tier: 'child', parent_id: 'parent-1', title: 'launch-subject', status: 'done', token_cost: 80 },
    { id: 'parent-2', tier: 'parent', title: 'Adam-sourced SD-X', benefit: 'closes a gap', risk: null, status: 'open' },
  ];
}

describe('groupByParent', () => {
  it('TS-6: groups children under their parent by parent_id', () => {
    const groups = groupByParent(fixtureRows());
    expect(groups).toHaveLength(2);
    const p1 = groups.find((g) => g.parent.id === 'parent-1');
    expect(p1.children.map((c) => c.id)).toEqual(['child-1', 'child-2']);
    const p2 = groups.find((g) => g.parent.id === 'parent-2');
    expect(p2.children).toEqual([]);
  });

  it('handles an empty/non-array input without throwing', () => {
    expect(groupByParent([])).toEqual([]);
    expect(groupByParent(undefined)).toEqual([]);
  });
});

describe('buildBoardView', () => {
  it('TS-6: renders parents with rolled-up status, bubbled blockers, benefit/risk, and token-cost rollup', () => {
    const view = buildBoardView(fixtureRows());
    expect(view.panels).toHaveLength(2);

    const p1 = view.panels.find((p) => p.id === 'parent-1');
    expect(p1.status).toBe('blocked'); // rollupParentStatus: one blocked child -> blocked
    expect(p1.benefit).toBe('unblocks next venture cycle');
    expect(p1.risk).toBe('daemon reswap flaky');
    expect(p1.blockers).toEqual([{ id: 'child-1', title: 'get-daemon-reswap', blocker: 'awaiting coordinator reswap' }]);
    expect(p1.tokenCost).toBe(200); // sumTokenCost: 120 + 80

    const p2 = view.panels.find((p) => p.id === 'parent-2');
    expect(p2.status).toBe('open'); // no children -> open
    expect(p2.blockers).toEqual([]);
    expect(p2.tokenCost).toBe(0);
  });

  it('sums total token cost across all parents', () => {
    const view = buildBoardView(fixtureRows());
    expect(view.totalTokenCost).toBe(200);
  });

  it('handles an empty ledger without throwing', () => {
    const view = buildBoardView([]);
    expect(view.panels).toEqual([]);
    expect(view.totalTokenCost).toBe(0);
    expect(view.manualStale).toEqual([]);
  });

  it('QF-20260830-690: surfaces stale manual children with their owner/review_by', () => {
    const rows = [
      ...fixtureRows(),
      {
        id: 'manual-1', tier: 'child', parent_id: 'parent-1', source_kind: 'manual',
        title: 'groom me', status: 'open', updated_at: '2026-01-01T00:00:00.000Z',
        risk: encodeManualChildMeta('hotel-5', '2026-01-15T00:00:00.000Z'),
      },
    ];
    const view = buildBoardView(rows);
    expect(view.manualStale).toEqual([{
      id: 'manual-1', title: 'groom me', owner: 'hotel-5', review_by: '2026-01-15T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }]);
  });
});
