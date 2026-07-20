/**
 * SD-LEO-INFRA-ADAM-CREATION-PROCESS-001 (FR-3 / activation test).
 *
 * The PURE core of the one-step child-linkage helper: given a parent SD row and a child
 * key, computeChildLinkage returns (a) the child fields (parent_sd_id + relationship_type
 * ='child') and (b) the parent's new metadata registering the child — idempotently. This
 * is the activation invariant: a canonical-path child is fully wired (no manual DB surgery)
 * AND a child is NEVER an 'orchestrator'. No DB/IO — every assertion is over the pure fn.
 */
import { describe, it, expect } from 'vitest';
import { computeChildLinkage, computeInheritedSourcedBy, deriveChildLetter } from '../../lib/sd/child-linkage.js';

const AUTONOMY_PARENT = {
  id: 'SD-LEO-INFRA-ADAM-AUTONOMY-HARDENING-001',
  uuid_id: '11111111-1111-1111-1111-111111111111',
  sd_key: 'SD-LEO-INFRA-ADAM-AUTONOMY-HARDENING-001',
  metadata: {
    autonomy_children: {
      A: { sd_key: 'SD-LEO-INFRA-AUTOMATED-ONE-ROADMAP-001', role: 'VDR', status: 'draft', uuid_id: 'aaaa', registered_by: 'adam', registered_on: '2026-06-13' },
    },
  },
};

const GENERIC_PARENT = {
  id: '22222222-2222-2222-2222-222222222222',
  uuid_id: '22222222-2222-2222-2222-222222222222',
  sd_key: 'SD-EHG-FEAT-SOMETHING-001',
  metadata: { source: 'leo' },
};

describe('computeChildLinkage — child fields', () => {
  it('sets parent_sd_id (parent.id) and relationship_type="child"', () => {
    const { childFields } = computeChildLinkage(AUTONOMY_PARENT, 'SD-LEO-INFRA-ADAM-CREATION-PROCESS-001-F', { today: '2026-06-15' });
    expect(childFields.parent_sd_id).toBe('SD-LEO-INFRA-ADAM-AUTONOMY-HARDENING-001');
    expect(childFields.relationship_type).toBe('child');
  });

  it('falls back to uuid_id for parent_sd_id when id is absent', () => {
    const noId = { ...GENERIC_PARENT, id: undefined };
    const { childFields } = computeChildLinkage(noId, 'SD-EHG-FEAT-SOMETHING-001-B', { today: '2026-06-15' });
    expect(childFields.parent_sd_id).toBe('22222222-2222-2222-2222-222222222222');
  });

  it('relationship_type is ALWAYS "child" — never inherits orchestrator (no opt can change it)', () => {
    const r = computeChildLinkage(AUTONOMY_PARENT, 'X-001-Z', { relationship_type: 'orchestrator', today: '2026-06-15' });
    expect(r.childFields.relationship_type).toBe('child');
  });
});

describe('computeChildLinkage — autonomy_children registry (letter-keyed)', () => {
  it('registers a new child under its derived letter, preserving existing siblings', () => {
    const r = computeChildLinkage(AUTONOMY_PARENT, 'SD-LEO-INFRA-ADAM-CREATION-PROCESS-001-F', { role: 'creation process', today: '2026-06-15', childUuid: 'ffff', registeredBy: 'leo-create-sd' });
    expect(r.registryKind).toBe('autonomy_children');
    expect(r.alreadyRegistered).toBe(false);
    expect(r.parentMetadata.autonomy_children.A).toBeTruthy();          // sibling preserved
    expect(r.parentMetadata.autonomy_children.F).toEqual({
      sd_key: 'SD-LEO-INFRA-ADAM-CREATION-PROCESS-001-F',
      role: 'creation process', status: 'draft', uuid_id: 'ffff',
      registered_by: 'leo-create-sd', registered_on: '2026-06-15',
    });
  });

  it('is IDEMPOTENT — re-registering the same sd_key yields no metadata rewrite', () => {
    const parent = {
      ...AUTONOMY_PARENT,
      metadata: { autonomy_children: { A: AUTONOMY_PARENT.metadata.autonomy_children.A, F: { sd_key: 'SD-LEO-INFRA-ADAM-CREATION-PROCESS-001-F' } } },
    };
    const r = computeChildLinkage(parent, 'SD-LEO-INFRA-ADAM-CREATION-PROCESS-001-F', { today: '2026-06-15' });
    expect(r.alreadyRegistered).toBe(true);
    expect(r.parentMetadata).toBeNull();   // no duplicate entry, no rewrite
  });

  it('does not register (no letter derivable) but still returns child fields', () => {
    const r = computeChildLinkage(AUTONOMY_PARENT, 'SD-NO-LETTER-SUFFIX-001', { today: '2026-06-15' });
    expect(r.childFields.relationship_type).toBe('child');
    expect(r.parentMetadata).toBeNull();
  });
});

describe('computeChildLinkage — generic children array', () => {
  it('appends a new child entry to a children array on a non-autonomy parent', () => {
    const r = computeChildLinkage(GENERIC_PARENT, 'SD-EHG-FEAT-SOMETHING-001-A', { today: '2026-06-15', childUuid: 'cccc' });
    expect(r.registryKind).toBe('children');
    expect(Array.isArray(r.parentMetadata.children)).toBe(true);
    expect(r.parentMetadata.children).toHaveLength(1);
    expect(r.parentMetadata.children[0].sd_key).toBe('SD-EHG-FEAT-SOMETHING-001-A');
    expect(r.parentMetadata.source).toBe('leo');   // existing metadata preserved
  });

  it('is IDEMPOTENT — re-appending the same child is a no-op', () => {
    const parent = { ...GENERIC_PARENT, metadata: { source: 'leo', children: [{ sd_key: 'SD-EHG-FEAT-SOMETHING-001-A' }] } };
    const r = computeChildLinkage(parent, 'SD-EHG-FEAT-SOMETHING-001-A', { today: '2026-06-15' });
    expect(r.alreadyRegistered).toBe(true);
    expect(r.parentMetadata).toBeNull();
  });
});

describe('computeChildLinkage — invariants', () => {
  it('throws on a missing parent or childKey (fail-loud, not silent)', () => {
    expect(() => computeChildLinkage(null, 'X-001-A')).toThrow();
    expect(() => computeChildLinkage(GENERIC_PARENT, '')).toThrow();
  });

  it('deriveChildLetter extracts the trailing letter suffix or null', () => {
    expect(deriveChildLetter('SD-X-001-F')).toBe('F');
    expect(deriveChildLetter('SD-X-001')).toBeNull();
    expect(deriveChildLetter('')).toBeNull();
  });
});

describe('computeInheritedSourcedBy — provenance inheritance (QF-20260720-054)', () => {
  it('returns the parent stamp when the child has none', () => {
    expect(computeInheritedSourcedBy({ sourced_by: 'solomon' }, {})).toBe('solomon');
    expect(computeInheritedSourcedBy({ sourced_by: 'adam' }, { source: 'leo' })).toBe('adam');
  });

  it('never overwrites an existing child stamp', () => {
    expect(computeInheritedSourcedBy({ sourced_by: 'solomon' }, { sourced_by: 'chairman' })).toBeNull();
  });

  it('returns null when the parent has nothing to inherit', () => {
    expect(computeInheritedSourcedBy({}, {})).toBeNull();
    expect(computeInheritedSourcedBy({ sourced_by: '' }, {})).toBeNull();
    expect(computeInheritedSourcedBy(null, {})).toBeNull();
  });

  it('tolerates null / array metadata without throwing', () => {
    expect(computeInheritedSourcedBy(undefined, undefined)).toBeNull();
    expect(computeInheritedSourcedBy([{ sourced_by: 'x' }], {})).toBeNull();          // array parent → no stamp
    expect(computeInheritedSourcedBy({ sourced_by: 'solomon' }, ['x'])).toBe('solomon'); // array child → no existing stamp
  });
});
