/**
 * Unit tests for Unified Inbox Builder
 * SD-LEO-ORCH-SELF-IMPROVING-LEO-001-D
 */

import { describe, it, expect } from 'vitest';
import {
  mapFeedbackLifecycle,
  mapPatternLifecycle,
  mapAuditLifecycle,
  mapSDLifecycle,
  normalizeFeedback,
  normalizePattern,
  normalizeAudit,
  normalizeSD,
  applyDeduplication,
  groupByLifecycle,
  sortItems,
  LIFECYCLE_SECTIONS
} from '../../../lib/inbox/unified-inbox-builder.js';

// ---------------------------------------------------------------------------
// Lifecycle mapping tests (FR-4)
// ---------------------------------------------------------------------------

describe('Lifecycle mapping', () => {
  describe('mapFeedbackLifecycle', () => {
    it('maps "new" to NEW', () => expect(mapFeedbackLifecycle('new')).toBe('NEW'));
    it('maps "backlog" to ON_THE_SHELF', () => expect(mapFeedbackLifecycle('backlog')).toBe('ON_THE_SHELF'));
    it('maps "resolved" to COMPLETED', () => expect(mapFeedbackLifecycle('resolved')).toBe('COMPLETED'));
    it('defaults unknown to NEW', () => expect(mapFeedbackLifecycle('unknown')).toBe('NEW'));
  });

  describe('mapPatternLifecycle', () => {
    it('maps "active" to NEW', () => expect(mapPatternLifecycle('active')).toBe('NEW'));
    it('maps "resolved" to COMPLETED', () => expect(mapPatternLifecycle('resolved')).toBe('COMPLETED'));
    it('defaults unknown to NEW', () => expect(mapPatternLifecycle('foo')).toBe('NEW'));
  });

  describe('mapAuditLifecycle', () => {
    it('maps "open" to NEW', () => expect(mapAuditLifecycle('open')).toBe('NEW'));
    it('maps "in_progress" to IN_PROGRESS', () => expect(mapAuditLifecycle('in_progress')).toBe('IN_PROGRESS'));
    it('maps "resolved" to COMPLETED', () => expect(mapAuditLifecycle('resolved')).toBe('COMPLETED'));
    it('maps "closed" to COMPLETED', () => expect(mapAuditLifecycle('closed')).toBe('COMPLETED'));
    it('defaults unknown to NEW', () => expect(mapAuditLifecycle(null)).toBe('NEW'));
  });

  describe('mapSDLifecycle', () => {
    it('maps "draft" to PENDING_SDS', () => expect(mapSDLifecycle('draft')).toBe('PENDING_SDS'));
    it('maps "planning" to PENDING_SDS', () => expect(mapSDLifecycle('planning')).toBe('PENDING_SDS'));
    it('maps "in_progress" to IN_PROGRESS', () => expect(mapSDLifecycle('in_progress')).toBe('IN_PROGRESS'));
    it('maps "completed" to COMPLETED', () => expect(mapSDLifecycle('completed')).toBe('COMPLETED'));
    it('maps "cancelled" to COMPLETED', () => expect(mapSDLifecycle('cancelled')).toBe('COMPLETED'));
    it('defaults unknown to PENDING_SDS', () => expect(mapSDLifecycle('foo')).toBe('PENDING_SDS'));
  });
});

// ---------------------------------------------------------------------------
// Normalizer tests (FR-1)
// ---------------------------------------------------------------------------

describe('Normalizers', () => {
  it('normalizeFeedback produces correct shape', () => {
    const row = {
      id: 'abc-123',
      type: 'bug',
      title: 'Login broken',
      description: 'Cannot login',
      status: 'new',
      priority: 'high',
      category: 'auth',
      severity: 'critical',
      sd_id: null,
      resolution_sd_id: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z'
    };
    const item = normalizeFeedback(row);

    expect(item.item_id).toBe('feedback-abc-123');
    expect(item.item_type).toBe('feedback');
    expect(item.title).toBe('Login broken');
    expect(item.lifecycle_status).toBe('NEW');
    expect(item.source_ref).toEqual({ table: 'feedback', pk: 'abc-123' });
    expect(item.assigned_sd_id).toBeNull();
    expect(item.linked_items).toBeNull();
  });

  it('normalizeAudit produces correct shape', () => {
    const row = {
      id: 'audit-1', title: 'Missing RLS on table', status: 'open',
      severity: 'high', category: 'security', assigned_sd_id: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z'
    };
    const item = normalizeAudit(row);
    expect(item.item_id).toBe('audit-audit-1');
    expect(item.item_type).toBe('audit');
    expect(item.title).toBe('Missing RLS on table');
    expect(item.lifecycle_status).toBe('NEW');
    expect(item.source_ref).toEqual({ table: 'audit_findings', pk: 'audit-1' });
  });

  it('normalizeFeedback uses description when title is missing', () => {
    const row = { id: '1', title: null, description: 'A long description of the feedback item that should be truncated', status: 'new', created_at: '2026-01-01T00:00:00Z' };
    const item = normalizeFeedback(row);
    expect(item.title).toBe('A long description of the feedback item that should be truncated');
  });

  it('normalizeFeedback sets assigned_sd_id from resolution_sd_id', () => {
    const row = { id: '1', title: 'Test', status: 'resolved', resolution_sd_id: 'SD-FIX-001', created_at: '2026-01-01T00:00:00Z' };
    const item = normalizeFeedback(row);
    expect(item.assigned_sd_id).toBe('SD-FIX-001');
  });

  it('normalizePattern produces correct shape', () => {
    const row = {
      id: 1,
      pattern_id: 'PAT-TEST-001',
      category: 'validation',
      severity: 'medium',
      issue_summary: 'Validator fails silently',
      occurrence_count: 3,
      trend: 'increasing',
      status: 'active',
      assigned_sd_id: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-05T00:00:00Z'
    };
    const item = normalizePattern(row);

    expect(item.item_id).toBe('pattern-PAT-TEST-001');
    expect(item.item_type).toBe('pattern');
    expect(item.title).toBe('Validator fails silently');
    expect(item.lifecycle_status).toBe('NEW');
    expect(item.source_ref).toEqual({ table: 'issue_patterns', pk: 'PAT-TEST-001' });
    expect(item.priority).toBe('medium');
  });

  it('normalizeSD produces correct shape with linked_items array', () => {
    const row = {
      id: 'uuid-123',
      sd_key: 'SD-TEST-001',
      title: 'Test directive',
      sd_type: 'feature',
      status: 'in_progress',
      current_phase: 'EXEC',
      priority: 'high',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-10T00:00:00Z',
      is_working_on: true,
      parent_sd_id: null
    };
    const item = normalizeSD(row);

    expect(item.item_id).toBe('sd-SD-TEST-001');
    expect(item.item_type).toBe('sd');
    expect(item.lifecycle_status).toBe('IN_PROGRESS');
    expect(item.linked_items).toEqual([]);
    expect(item.metadata.sd_key).toBe('SD-TEST-001');
    expect(item.metadata.uuid).toBe('uuid-123');
  });
});

// ---------------------------------------------------------------------------
// Deduplication tests (FR-3)
// ---------------------------------------------------------------------------

describe('Smart deduplication', () => {
  const makeFeedback = (id, title, assignedSd = null) => ({
    item_id: `feedback-${id}`, item_type: 'feedback', title,
    lifecycle_status: 'NEW', created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    source_ref: { table: 'feedback', pk: id },
    assigned_sd_id: assignedSd, linked_items: null, priority: null, metadata: {}
  });

  const makePattern = (patternId, title, assignedSd = null) => ({
    item_id: `pattern-${patternId}`, item_type: 'pattern', title,
    lifecycle_status: 'NEW', created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    source_ref: { table: 'issue_patterns', pk: patternId },
    assigned_sd_id: assignedSd, linked_items: null, priority: null, metadata: {}
  });

  const makeSD = (sdKey, uuid = null) => ({
    item_id: `sd-${sdKey}`, item_type: 'sd', title: `SD: ${sdKey}`,
    lifecycle_status: 'IN_PROGRESS', created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    source_ref: { table: 'strategic_directives_v2', pk: sdKey },
    assigned_sd_id: null, linked_items: [], priority: null,
    metadata: { sd_key: sdKey, uuid }
  });

  it('items without assigned_sd_id remain top-level', () => {
    const fb = [makeFeedback('1', 'Unlinked feedback')];
    const pat = [makePattern('PAT-001', 'Unlinked pattern')];
    const sd = [makeSD('SD-001', 'uuid-001')];

    const { topLevelItems } = applyDeduplication(fb, pat, [], sd);
    expect(topLevelItems).toHaveLength(3); // fb + pat + sd
  });

  it('feedback linked by sd_key is folded under SD', () => {
    const fb = [makeFeedback('1', 'Linked feedback', 'SD-001')];
    const sd = [makeSD('SD-001', 'uuid-001')];

    const { topLevelItems, linkedCount } = applyDeduplication(fb, [], [], sd);
    expect(topLevelItems).toHaveLength(1); // only SD
    expect(topLevelItems[0].item_type).toBe('sd');
    expect(topLevelItems[0].linked_items).toHaveLength(1);
    expect(topLevelItems[0].linked_items[0].item_id).toBe('feedback-1');
    expect(linkedCount.feedback).toBe(1);
  });

  it('pattern linked by UUID is folded under SD', () => {
    const pat = [makePattern('PAT-001', 'Linked pattern', 'uuid-001')];
    const sd = [makeSD('SD-001', 'uuid-001')];

    const { topLevelItems, linkedCount } = applyDeduplication([], pat, [], sd);
    expect(topLevelItems).toHaveLength(1);
    expect(topLevelItems[0].linked_items).toHaveLength(1);
    expect(linkedCount.pattern).toBe(1);
  });

  it('multiple items linking to same SD appear in linked_items', () => {
    const fb = [
      makeFeedback('1', 'FB 1', 'SD-001'),
      makeFeedback('2', 'FB 2', 'SD-001')
    ];
    const pat = [makePattern('PAT-001', 'PAT linked', 'uuid-001')];
    const sd = [makeSD('SD-001', 'uuid-001')];

    const { topLevelItems } = applyDeduplication(fb, pat, [], sd);
    expect(topLevelItems).toHaveLength(1);
    expect(topLevelItems[0].linked_items).toHaveLength(3);
  });

  it('linked_items are sorted by created_at ascending', () => {
    const fb = [
      { ...makeFeedback('2', 'Later', 'SD-001'), created_at: '2026-01-10T00:00:00Z' },
      { ...makeFeedback('1', 'Earlier', 'SD-001'), created_at: '2026-01-01T00:00:00Z' }
    ];
    const sd = [makeSD('SD-001', 'uuid-001')];

    const { topLevelItems } = applyDeduplication(fb, [], [], sd);
    expect(topLevelItems[0].linked_items[0].title).toBe('Earlier');
    expect(topLevelItems[0].linked_items[1].title).toBe('Later');
  });

  it('item with assigned_sd_id not matching any SD stays top-level', () => {
    const fb = [makeFeedback('1', 'Orphan link', 'SD-NONEXISTENT')];
    const sd = [makeSD('SD-001', 'uuid-001')];

    const { topLevelItems } = applyDeduplication(fb, [], [], sd);
    expect(topLevelItems).toHaveLength(2); // fb + sd (not linked)
  });
});

// ---------------------------------------------------------------------------
// Grouping tests
// ---------------------------------------------------------------------------

describe('groupByLifecycle', () => {
  it('groups items into correct sections', () => {
    const items = [
      { lifecycle_status: 'NEW', item_id: '1' },
      { lifecycle_status: 'IN_PROGRESS', item_id: '2' },
      { lifecycle_status: 'COMPLETED', item_id: '3' },
      { lifecycle_status: 'PENDING_SDS', item_id: '4' },
      { lifecycle_status: 'ON_THE_SHELF', item_id: '5' }
    ];
    const sections = groupByLifecycle(items);

    expect(sections.NEW).toHaveLength(1);
    expect(sections.ON_THE_SHELF).toHaveLength(1);
    expect(sections.PENDING_SDS).toHaveLength(1);
    expect(sections.IN_PROGRESS).toHaveLength(1);
    expect(sections.COMPLETED).toHaveLength(1);
  });

  it('returns empty arrays for sections with no items', () => {
    const sections = groupByLifecycle([]);
    for (const section of LIFECYCLE_SECTIONS) {
      expect(sections[section]).toEqual([]);
    }
  });

  it('puts unknown lifecycle into NEW', () => {
    const items = [{ lifecycle_status: 'UNKNOWN_STATUS', item_id: '1' }];
    const sections = groupByLifecycle(items);
    expect(sections.NEW).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Sorting tests (FR-1 deterministic ordering)
// ---------------------------------------------------------------------------

describe('sortItems', () => {
  it('sorts by updated_at descending', () => {
    const items = [
      { updated_at: '2026-01-01T00:00:00Z', item_type: 'feedback', item_id: '1' },
      { updated_at: '2026-01-10T00:00:00Z', item_type: 'feedback', item_id: '2' },
      { updated_at: '2026-01-05T00:00:00Z', item_type: 'feedback', item_id: '3' }
    ];
    const sorted = sortItems([...items]);
    expect(sorted[0].item_id).toBe('2');
    expect(sorted[1].item_id).toBe('3');
    expect(sorted[2].item_id).toBe('1');
  });

  it('uses item_type + item_id as tie-breaker', () => {
    const items = [
      { updated_at: '2026-01-01T00:00:00Z', item_type: 'sd', item_id: 'sd-B' },
      { updated_at: '2026-01-01T00:00:00Z', item_type: 'feedback', item_id: 'fb-A' },
      { updated_at: '2026-01-01T00:00:00Z', item_type: 'feedback', item_id: 'fb-B' }
    ];
    const sorted = sortItems([...items]);
    expect(sorted[0].item_id).toBe('fb-A');
    expect(sorted[1].item_id).toBe('fb-B');
    expect(sorted[2].item_id).toBe('sd-B');
  });
});

// ---------------------------------------------------------------------------
// LIFECYCLE_SECTIONS constant test
// ---------------------------------------------------------------------------

describe('LIFECYCLE_SECTIONS', () => {
  it('contains exactly five sections in correct order', () => {
    expect(LIFECYCLE_SECTIONS).toEqual([
      'NEW', 'ON_THE_SHELF', 'PENDING_SDS', 'IN_PROGRESS', 'COMPLETED'
    ]);
  });
});
