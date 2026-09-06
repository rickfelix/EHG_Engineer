/**
 * SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-D FR-1 — planRepairs pure core.
 */
import { describe, it, expect } from 'vitest';
import { planRepairs, buildBackfillReason } from '../../../scripts/sourcing-engine/repair-reasonless-roadmap-links.mjs';

const NOW = '2026-09-06T12:00:00.000Z';

function row({ sd_key, status, created_at, title, exception, plan_linkage }) {
  return {
    sd_key, status, created_at, title,
    metadata: { roadmap_link_exception: exception, plan_linkage },
  };
}

describe('TS-1 — repair rebuilds a bare-string exception through the builder', () => {
  it('preserves the string as operator_reason and falls back recorded_at to created_at', () => {
    const r = row({
      sd_key: 'SD-X-001', status: 'draft', created_at: '2026-09-05T17:13:00Z', title: 'X',
      exception: 'chairman order: some real reason',
    });
    const plan = planRepairs([r], { nowIso: NOW });
    expect(plan).toHaveLength(1);
    expect(plan[0].shape).toBe('bare_string');
    expect(plan[0].next.operator_reason).toBe('chairman order: some real reason');
    expect(plan[0].next.reason_supplied).toBe(true);
    expect(plan[0].next.recorded_at).toBe('2026-09-05T17:13:00Z');
    expect(plan[0].prior).toBe('chairman order: some real reason');
  });
});

describe('TS-2 — repair backfills a canonical no-reason marker honestly', () => {
  it('names this SD and the plan_linkage bucket, never claims the minter supplied it', () => {
    const r = row({
      sd_key: 'SD-Y-001', status: 'draft', created_at: '2026-09-06T06:41:17Z', title: 'Apply pending LEO',
      exception: { sd_key: 'SD-Y-001', operator_reason: 'no-reason-supplied', reason_supplied: false, recorded_at: '2026-09-06T06:41:16Z' },
      plan_linkage: { unlinked_reason: 'emergent-fix' },
    });
    const plan = planRepairs([r], { nowIso: NOW });
    expect(plan).toHaveLength(1);
    expect(plan[0].shape).toBe('no_reason_marker');
    expect(plan[0].next.operator_reason).toContain('backfilled by SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-D');
    expect(plan[0].next.operator_reason).toContain('emergent-fix');
    expect(plan[0].next.reason_supplied).toBe(true);
    // recorded_at is PRESERVED from the prior record, not overwritten to now.
    expect(plan[0].next.recorded_at).toBe('2026-09-06T06:41:16Z');
  });

  it('buildBackfillReason names bucket=none when plan_linkage is absent', () => {
    const r = row({ sd_key: 'SD-Z-001', status: 'draft', title: 'Z', exception: { reason_supplied: false } });
    expect(buildBackfillReason(r)).toContain('bucket=none');
  });
});

describe('TS-3 — repair never selects terminal rows or already-reasoned rows', () => {
  it('selects exactly the one draft+reasonless row out of a mixed set', () => {
    const rows = [
      row({ sd_key: 'SD-A', status: 'completed', exception: { reason_supplied: false } }),
      row({ sd_key: 'SD-B', status: 'draft', exception: { reason_supplied: true, operator_reason: 'ok' } }),
      row({ sd_key: 'SD-C', status: 'draft', exception: { reason_supplied: false, operator_reason: 'no-reason-supplied' } }),
    ];
    const plan = planRepairs(rows, { nowIso: NOW });
    expect(plan.map((p) => p.sd_key)).toEqual(['SD-C']);
  });

  it('respects an injectable terminalStatuses list', () => {
    const rows = [row({ sd_key: 'SD-D', status: 'my_custom_closed', exception: { reason_supplied: false } })];
    const plan = planRepairs(rows, { nowIso: NOW, terminalStatuses: ['my_custom_closed'] });
    expect(plan).toHaveLength(0);
  });
});

describe('malformed_object shape', () => {
  it('is treated as reasonless and gets an honest backfill', () => {
    const r = row({ sd_key: 'SD-E', status: 'active', title: 'E', exception: { operator_reason: 'x' } });
    const plan = planRepairs([r], { nowIso: NOW });
    expect(plan).toHaveLength(1);
    expect(plan[0].shape).toBe('malformed_object');
    expect(plan[0].next.reason_supplied).toBe(true);
  });
});

describe('idempotency', () => {
  it('a row already repaired (canonical_reasoned) produces zero further plan entries', () => {
    const first = planRepairs([row({
      sd_key: 'SD-F', status: 'draft', created_at: '2026-09-01T00:00:00Z', title: 'F',
      exception: 'a real reason',
    })], { nowIso: NOW });
    const repaired = row({ sd_key: 'SD-F', status: 'draft', exception: first[0].next });
    const second = planRepairs([repaired], { nowIso: NOW });
    expect(second).toHaveLength(0);
  });
});
