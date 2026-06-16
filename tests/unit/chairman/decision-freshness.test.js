/**
 * SD-LEO-INFRA-FIX-CHAIRMAN-HOURLY-001 (FR-4) — chairman action-list freshness.
 * Proves the email drops stale chairman_approvals for dead ventures and collapses the
 * auto-generated "Corrective:" gap findings into ONE ref-preserving line, so the action
 * count reflects real, actionable decisions (not resolved/cancelled/noise items).
 */
import { describe, it, expect } from 'vitest';
import {
  isCorrectiveFlag,
  prepareDecisions,
  buildDecisionItems,
  renderDecisionLines,
  DEAD_VENTURE_STATUSES,
} from '../../../lib/chairman/decision-layman.mjs';

const NOW = new Date('2026-06-16T12:00:00Z');

const rows = () => [
  { id: 'f1', decision_type: 'flag_review', title: 'CRITICAL FLEET BLOCKER — disk full', priority: 'critical', created_at: '2026-06-16T11:00:00Z' },
  { id: 'a1', decision_type: 'chairman_approval', title: 'Stage 21 Chairman Approval', venture_id: 'v-dead', priority: 'critical', created_at: '2026-06-15T11:00:00Z' },
  { id: 'c1', decision_type: 'flag_review', title: 'Corrective: Vision Gap — decision_filter_engine_escalation (V04)', priority: 'high', created_at: '2026-06-15T14:00:00Z' },
  { id: 'c2', decision_type: 'flag_review', title: 'Corrective: Architecture Gap — event_bus_integration (A05)', priority: 'high', created_at: '2026-06-15T14:01:00Z' },
  { id: 'c3', decision_type: 'flag_review', title: 'Corrective: Vision Gap — cli_authoritative_workflow (V06)', priority: 'high', created_at: '2026-06-16T01:00:00Z' },
];

describe('isCorrectiveFlag', () => {
  it('matches only "Corrective:" flag_reviews', () => {
    expect(isCorrectiveFlag({ decision_type: 'flag_review', title: 'Corrective: Vision Gap — x' })).toBe(true);
    expect(isCorrectiveFlag({ decision_type: 'flag_review', title: 'security-linter failed' })).toBe(false);
    expect(isCorrectiveFlag({ decision_type: 'chairman_approval', title: 'Corrective: x' })).toBe(false);
  });
});

describe('prepareDecisions — drop dead-venture approvals + mark correctives', () => {
  it('drops a chairman_approval whose venture is dead', () => {
    const out = prepareDecisions(rows(), { deadVentureIds: new Set(['v-dead']) });
    expect(out.find((r) => r.id === 'a1')).toBeUndefined();
  });
  it('keeps a chairman_approval whose venture is alive', () => {
    const out = prepareDecisions(rows(), { deadVentureIds: new Set() });
    expect(out.find((r) => r.id === 'a1')).toBeDefined();
  });
  it('marks corrective flag_reviews with _corrective and leaves others alone', () => {
    const out = prepareDecisions(rows(), {});
    expect(out.find((r) => r.id === 'c1')._corrective).toBe(true);
    expect(out.find((r) => r.id === 'f1')._corrective).toBeUndefined();
  });
  it('does not mutate the input rows', () => {
    const input = rows();
    prepareDecisions(input, {});
    expect(input.find((r) => r.id === 'c1')._corrective).toBeUndefined();
  });
  it('DEAD_VENTURE_STATUSES covers cancelled/killed/archived', () => {
    for (const s of ['cancelled', 'killed', 'archived']) expect(DEAD_VENTURE_STATUSES.has(s)).toBe(true);
    expect(DEAD_VENTURE_STATUSES.has('active')).toBe(false);
  });
});

describe('buildDecisionItems — corrective rows collapse into one group', () => {
  it('groups all _corrective rows into a single item carrying every row (refs preserved)', () => {
    const prepared = prepareDecisions(rows(), { deadVentureIds: new Set(['v-dead']) });
    const items = buildDecisionItems(prepared);
    const corrective = items.filter((it) => it.type === 'corrective');
    expect(corrective).toHaveLength(1);
    expect(corrective[0].rows).toHaveLength(3); // c1, c2, c3
    // the non-corrective flag_review stays its own single item
    expect(items.filter((it) => it.type === 'flag_review')).toHaveLength(1);
  });
});

describe('renderDecisionLines — end-to-end count + collapsed line', () => {
  it('reduces 5 raw rows (1 dead-venture + 3 correctives) to 2 actionable lines', () => {
    const prepared = prepareDecisions(rows(), { deadVentureIds: new Set(['v-dead']) });
    const { count, lines } = renderDecisionLines(prepared, NOW);
    expect(count).toBe(2); // a1 dropped; f1 (1) + collapsed corrective group (counts as 1 advisory) = 2
    expect(lines).toHaveLength(2); // disk-blocker line + one collapsed corrective line
    const collapsed = lines.find((l) => /auto-flagged vision\/architecture-gap finding/.test(l));
    expect(collapsed).toBeTruthy();
    // refs to all three underlying findings are preserved on the collapsed line
    expect(collapsed).toContain('flag_review:c1');
    expect(collapsed).toContain('flag_review:c2');
    expect(collapsed).toContain('flag_review:c3');
  });
});
