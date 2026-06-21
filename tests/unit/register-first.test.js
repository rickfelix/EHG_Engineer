/**
 * SD-LEO-INFRA-SOURCING-ENGINE-REGISTER-FIRST-001 — pure register-first helper tests.
 * Covers FR-1 roadmap-item derivation, FR-3 two-way stamp payload, FR-2 warn-only decision (PATH_A),
 * and FR-4 lane routing via the shipped router.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveSdFieldsFromRoadmapItem,
  buildTwoWayStamp,
  shouldWarnRegisterFirst,
  laneForRoadmapItem,
} from '../../lib/sourcing-engine/register-first.js';

describe('register-first — deriveSdFieldsFromRoadmapItem (FR-1)', () => {
  it('derives title/type/metadata from a roadmap item', () => {
    const f = deriveSdFieldsFromRoadmapItem({
      id: 'item-1', title: 'Build the thing', source_type: 'conversion_ledger', source_id: 'led-1', item_disposition: 'BUILD',
    });
    expect(f.title).toBe('Build the thing');
    // SD-LEO-INFRA-AUTOTYPE-INFRA-KEYS-001: the deriver no longer bakes a 'feature' default — it returns
    // null when metadata.sd_type is absent so the createSD SSOT (resolveSdType) can apply the key-prefix default.
    expect(f.type).toBeNull();
    expect(f.metadata).toMatchObject({ source: 'roadmap_item', source_id: 'item-1', roadmap_item_source_type: 'conversion_ledger', roadmap_item_source_id: 'led-1', item_disposition: 'BUILD' });
  });
  it('honors metadata.sd_type and tolerates a missing title', () => {
    const f = deriveSdFieldsFromRoadmapItem({ id: 'x', metadata: { sd_type: 'infrastructure' } });
    expect(f.type).toBe('infrastructure');
    expect(f.title).toContain('Roadmap item x');
  });
  it('is total on null', () => {
    const f = deriveSdFieldsFromRoadmapItem(null);
    // SD-LEO-INFRA-AUTOTYPE-INFRA-KEYS-001: null default (was 'feature') — SSOT applies the prefix default.
    expect(f.type).toBeNull();
    expect(f.metadata.source).toBe('roadmap_item');
  });
});

describe('register-first — buildTwoWayStamp (FR-3)', () => {
  it('always stamps the roadmap side; stamps the ledger side only for a conversion_ledger source', () => {
    const s = buildTwoWayStamp({ id: 'i1', source_type: 'conversion_ledger', source_id: 'led-9' }, 'SD-LEO-FOO-001', 'PROPOSAL-X.json');
    expect(s.roadmap).toEqual({ promoted_to_sd_key: 'SD-LEO-FOO-001' });
    expect(s.ledger).toEqual({ linked_sd_key: 'SD-LEO-FOO-001', promoted_proposal_path: 'PROPOSAL-X.json' });
  });
  it('no ledger stamp when the source is not a conversion_ledger row', () => {
    const s = buildTwoWayStamp({ id: 'i1', source_type: 'todoist_todo', source_id: 't1' }, 'SD-LEO-BAR-001');
    expect(s.roadmap.promoted_to_sd_key).toBe('SD-LEO-BAR-001');
    expect(s.ledger).toBeNull();
  });
  it('omits promoted_proposal_path when not provided', () => {
    const s = buildTwoWayStamp({ source_type: 'conversion_ledger', source_id: 'led-1' }, 'SD-X-001');
    expect(s.ledger).toEqual({ linked_sd_key: 'SD-X-001' });
  });
});

describe('register-first — shouldWarnRegisterFirst (FR-2, PATH_A warn-only)', () => {
  it('warns when an ordinary SD has no roadmap registration', () => {
    expect(shouldWarnRegisterFirst({ sd_key: 'SD-LEO-INFRA-FOO-001', metadata: {} }, false)).toBe(true);
  });
  it('does NOT warn when a registration exists', () => {
    expect(shouldWarnRegisterFirst({ sd_key: 'SD-LEO-INFRA-FOO-001', metadata: {} }, true)).toBe(false);
  });
  it('does NOT warn for a roadmap-sourced SD (already linked)', () => {
    expect(shouldWarnRegisterFirst({ sd_key: 'SD-LEO-FOO-001', metadata: { source: 'roadmap_item' } }, false)).toBe(false);
  });
  it('does NOT warn for fixtures', () => {
    expect(shouldWarnRegisterFirst({ sd_key: 'SD-TEST-FOO-001', metadata: {} }, false)).toBe(false);
    expect(shouldWarnRegisterFirst({ sd_key: 'SD-LEO-FOO-001', metadata: { is_fixture: true } }, false)).toBe(false);
  });
  it('does NOT warn for a child SD in its REAL shape (parentId arg + metadata.parent_sd_key)', () => {
    // The real createChild path passes parentId to createSD and stamps metadata.parent_sd_key/child_index
    // (source:'leo'), NOT source:'child'/parent_sd_id — so the skip must key on those shapes.
    expect(shouldWarnRegisterFirst({ sd_key: 'SD-LEO-FOO-001-A', metadata: { source: 'leo', parent_sd_key: 'SD-LEO-FOO-001', child_index: 1 } }, false, 'SD-LEO-FOO-001')).toBe(false);
    expect(shouldWarnRegisterFirst({ sd_key: 'SD-LEO-FOO-001-A', metadata: { source: 'leo', parent_sd_key: 'SD-LEO-FOO-001' } }, false)).toBe(false);
    // legacy shapes still skip
    expect(shouldWarnRegisterFirst({ sd_key: 'SD-LEO-FOO-001', metadata: { source: 'child' } }, false)).toBe(false);
  });
});

describe('register-first — laneForRoadmapItem (FR-4, via the shipped router)', () => {
  it('routes a novel item to belt-ready and passes disposition through', () => {
    const r = laneForRoadmapItem({ id: 'i1', title: 'A novel capability', item_disposition: 'BUILD' }, { existing: [] });
    expect(r.lane).toBe('belt-ready');
    expect(r.disposition).toBe('BUILD');
  });
  it('routes a duplicate (exact title match) to the dedup lane', () => {
    const r = laneForRoadmapItem(
      { id: 'i2', title: 'duplicate cap' },
      { existing: [{ sd_key: 'SD-DUP-001', title: 'duplicate cap' }] }
    );
    expect(r.lane).toBe('dedup');
    expect(r.dedup_match_sd_key).toBe('SD-DUP-001');
  });
});
