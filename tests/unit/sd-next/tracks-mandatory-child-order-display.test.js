// QF-20260907-152 (QF-20260904-708 remainder): a parent orchestrator's OWN declared
// metadata.mandatory_child_order was invisible in sd:next -- only a held CHILD's row showed
// "held: after <KEY>". This pins the new parent-row "mandatory order: ..." display line,
// including the free-text-form deprecation suffix and the two no-display cases (no children,
// no declared order).

import { describe, it, expect, vi } from 'vitest';
import { displayTrackSection } from '../../../scripts/modules/sd-next/display/tracks.js';

const baseItem = (overrides) => ({
  sd_key: overrides.sd_key,
  sequence_rank: 1,
  is_working_on: false,
  title: overrides.title || 'Some SD',
  metadata: overrides.metadata || {},
  parent_sd_id: overrides.parent_sd_id ?? null,
  status: 'draft',
  kind: 'sd',
});

async function runTrack(items, sessionContext = { claimedSDs: new Map(), currentSession: null, activeSessions: [] }) {
  const logs = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    logs.push(args.join(' '));
  });
  try {
    await displayTrackSection('A', 'Infrastructure/Safety', items, sessionContext);
  } finally {
    spy.mockRestore();
  }
  return logs.join('\n');
}

describe('QF-20260907-152: parent-row mandatory_child_order display', () => {
  it('shows the structured order with no deprecation suffix', async () => {
    const parent = baseItem({
      sd_key: 'SD-PARENT-001',
      metadata: { mandatory_child_order: { order: ['E', 'A'], reason: 'ship E first' } },
    });
    const childE = baseItem({ sd_key: 'SD-PARENT-001-E', parent_sd_id: 'SD-PARENT-001' });
    const childA = baseItem({ sd_key: 'SD-PARENT-001-A', parent_sd_id: 'SD-PARENT-001' });

    const output = await runTrack([parent, childE, childA]);

    expect(output).toMatch(/mandatory order: E → A/);
    expect(output).not.toMatch(/deprecated/);
  });

  it('shows a free-text order WITH the deprecation suffix', async () => {
    const parent = baseItem({
      sd_key: 'SD-PARENT-002',
      metadata: { mandatory_child_order: 'E -> A: ship E first' },
    });
    const childE = baseItem({ sd_key: 'SD-PARENT-002-E', parent_sd_id: 'SD-PARENT-002' });
    const childA = baseItem({ sd_key: 'SD-PARENT-002-A', parent_sd_id: 'SD-PARENT-002' });

    const output = await runTrack([parent, childE, childA]);

    expect(output).toMatch(/mandatory order: E → A/);
    expect(output).toMatch(/free-text form.*deprecated.*amend-sd\.js --mandatory-child-order/);
  });

  it('does not show the line when the parent declares no order', async () => {
    const parent = baseItem({ sd_key: 'SD-PARENT-003' });
    const child = baseItem({ sd_key: 'SD-PARENT-003-E', parent_sd_id: 'SD-PARENT-003' });

    const output = await runTrack([parent, child]);

    expect(output).not.toMatch(/mandatory order:/);
  });

  it('does not show the line when the parent has no children (nothing to sequence)', async () => {
    const parent = baseItem({
      sd_key: 'SD-PARENT-004',
      metadata: { mandatory_child_order: { order: ['E', 'A'], reason: null } },
    });

    const output = await runTrack([parent]);

    expect(output).not.toMatch(/mandatory order:/);
  });
});
