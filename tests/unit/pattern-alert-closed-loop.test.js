// SD-FDBK-FIX-PATTERN-ALERT-CREATOR-001 — closed-loop suppression regression.
// Pins the cancel->no-refile loop at the filter seam: an assigned SD cancelled
// WITH evidence drops the pattern; a bare cancel keeps the legacy requeue.
import { describe, it, expect } from 'vitest';
import {
  filterPatternsForLearning,
  fetchAssignedSdStatuses,
  REJECT_REASONS,
} from '../../scripts/modules/learning/filter.mjs';

const basePattern = (over = {}) => ({
  pattern_id: 'PAT-TEST-1',
  source: 'retrospective',
  category: 'protocol',
  severity: 'high',
  occurrence_count: 9,
  trend: 'stable',
  issue_summary: 'test pattern',
  proven_solutions: [{ solution: 'x' }],
  metadata: {},
  ...over,
});

describe('checkAssignedSd evidence-cancelled suppression (b)', () => {
  it('drops a pattern whose assigned SD was cancelled WITH evidence', () => {
    const p = basePattern({ assigned_sd_id: 'sd-1' });
    const result = filterPatternsForLearning([p], {
      sdStatusMap: new Map([['sd-1', 'cancelled_with_evidence']]),
      sourceSdStatusMap: new Map(),
    });
    expect(result.kept).toHaveLength(0);
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.EVIDENCE_CANCELLED_ASSIGNED_SD);
  });

  it('keeps a pattern whose assigned SD had a bare cancel (requeue allowed)', () => {
    const p = basePattern({ assigned_sd_id: 'sd-2' });
    const result = filterPatternsForLearning([p], {
      sdStatusMap: new Map([['sd-2', 'cancelled']]),
      sourceSdStatusMap: new Map(),
    });
    expect(result.kept).toHaveLength(1);
  });

  it('still rejects patterns assigned to open SDs', () => {
    const p = basePattern({ assigned_sd_id: 'sd-3' });
    const result = filterPatternsForLearning([p], {
      sdStatusMap: new Map([['sd-3', 'draft']]),
      sourceSdStatusMap: new Map(),
    });
    expect(result.kept).toHaveLength(0);
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.ALREADY_ASSIGNED_OPEN_SD);
  });
});

describe('fetchAssignedSdStatuses sentinel mapping (b)', () => {
  const mockSupabase = (rows) => ({
    from: () => ({
      select: () => ({
        in: async () => ({ data: rows, error: null }),
      }),
    }),
  });

  it('maps cancelled+reason to cancelled_with_evidence, bare cancel stays cancelled', async () => {
    const map = await fetchAssignedSdStatuses(
      mockSupabase([
        { id: 'sd-a', status: 'cancelled', cancellation_reason: 'superseded by #4640 with live evidence' },
        { id: 'sd-b', status: 'cancelled', cancellation_reason: '   ' },
        { id: 'sd-c', status: 'in_progress', cancellation_reason: null },
      ]),
      [{ assigned_sd_id: 'sd-a' }, { assigned_sd_id: 'sd-b' }, { assigned_sd_id: 'sd-c' }],
    );
    expect(map.get('sd-a')).toBe('cancelled_with_evidence');
    expect(map.get('sd-b')).toBe('cancelled');
    expect(map.get('sd-c')).toBe('in_progress');
  });
});
