/**
 * Proposal-ingest dependency + provenance passthrough — SD-FDBK-INFRA-LEO-CREATE-PROPOSAL-001
 *
 * BUG: leo-create-sd.js --from-proposal (and the shared --proposal-b64 / --proposal-stdin
 * core via ingestProposalObject) dropped the proposal's declared dependency/provenance
 * metadata. mapProposalToCreateArgs used a closed metadata whitelist that never copied
 * metadata.depends_on / engine_child_index / parent_sd_key, and createSD never even
 * destructured `dependencies`, so the canonical dependencies column always wrote []. The
 * coordinator dispatcher gates BLOCKED/READY on the dependencies COLUMN (not on
 * metadata.depends_on), so soft-dep'd children could dispatch out of order.
 *
 * THE INVARIANTS:
 *   FR-1: a declared metadata.depends_on populates args.dependencies in the canonical
 *         [{sd_id}] shape (key-string | {sd_id} | {sd_key} all normalized; junk dropped).
 *   FR-2: engine_child_index / parent_sd_key persist onto metadata ONLY when declared
 *         (no coercion/defaulting — closed-whitelist invariant preserved).
 *   NO-REGRESSION: a proposal WITHOUT depends_on yields NO `dependencies` key (→ column [])
 *         and no extra metadata keys.
 *
 * PURE: exercises the exported helpers directly. ZERO live DB access.
 */
import { describe, it, expect } from 'vitest';
import {
  mapProposalToCreateArgs,
  normalizeDependsOn,
} from '../../scripts/leo-create-sd.js';

const NORMALIZED = {
  sdKey: 'SD-LEO-INFRA-CHILD-003',
  title: 'Child proposal',
  type: 'infrastructure',
  priority: 'high',
  rawType: 'infrastructure',
};

function proposal(metadata = {}) {
  return {
    PROPOSAL: true,
    status_intended: 'draft',
    proposed_sd_key: 'SD-LEO-INFRA-CHILD-003',
    title: 'Child proposal',
    sd_type: 'infrastructure',
    priority: 'high',
    rationale: 'child of the sourcing engine',
    scope: 'DOES: x. DOES NOT: y.',
    metadata,
  };
}

describe('normalizeDependsOn (FR-1 helper)', () => {
  it('normalizes bare SD-key strings to {sd_id}', () => {
    expect(normalizeDependsOn(['SD-FOO-001', 'SD-BAR-002'])).toEqual([
      { sd_id: 'SD-FOO-001' },
      { sd_id: 'SD-BAR-002' },
    ]);
  });

  it('passes {sd_id} through and maps {sd_key} alias to {sd_id}', () => {
    expect(normalizeDependsOn([{ sd_id: 'SD-FOO-001' }, { sd_key: 'SD-BAR-002' }])).toEqual([
      { sd_id: 'SD-FOO-001' },
      { sd_id: 'SD-BAR-002' },
    ]);
  });

  it('drops empty/malformed entries fail-soft and trims whitespace', () => {
    expect(normalizeDependsOn(['  SD-FOO-001  ', '', null, {}, 42, { sd_id: '' }])).toEqual([
      { sd_id: 'SD-FOO-001' },
    ]);
  });

  it('returns [] for non-array / nullish input', () => {
    expect(normalizeDependsOn(undefined)).toEqual([]);
    expect(normalizeDependsOn(null)).toEqual([]);
    expect(normalizeDependsOn('SD-FOO-001')).toEqual([]);
    expect(normalizeDependsOn([])).toEqual([]);
  });
});

describe('mapProposalToCreateArgs — dependency + provenance passthrough', () => {
  it('FR-1: maps metadata.depends_on into the canonical dependencies column shape', () => {
    const args = mapProposalToCreateArgs(NORMALIZED, proposal({ depends_on: ['SD-FOO-001', 'SD-BAR-002'] }), 'src');
    expect(args.dependencies).toEqual([{ sd_id: 'SD-FOO-001' }, { sd_id: 'SD-BAR-002' }]);
  });

  it('FR-1: object-form deps pass through without double-wrapping', () => {
    const args = mapProposalToCreateArgs(NORMALIZED, proposal({ depends_on: [{ sd_id: 'SD-FOO-001' }] }), 'src');
    expect(args.dependencies).toEqual([{ sd_id: 'SD-FOO-001' }]);
  });

  it('FR-2: persists engine_child_index and parent_sd_key onto metadata when declared', () => {
    const args = mapProposalToCreateArgs(
      NORMALIZED,
      proposal({ depends_on: ['SD-FOO-001'], engine_child_index: 3, parent_sd_key: 'SD-PARENT-001' }),
      'src'
    );
    expect(args.metadata.engine_child_index).toBe(3);
    expect(args.metadata.parent_sd_key).toBe('SD-PARENT-001');
    // depends_on retained in metadata for back-compat (enforced copy is in the column)
    expect(args.metadata.depends_on).toEqual(['SD-FOO-001']);
  });

  it('FR-2: engine_child_index of 0 is preserved (not dropped as falsy)', () => {
    const args = mapProposalToCreateArgs(NORMALIZED, proposal({ engine_child_index: 0 }), 'src');
    expect(args.metadata.engine_child_index).toBe(0);
  });

  it('NO-REGRESSION: a proposal without depends_on omits dependencies and the extra metadata keys', () => {
    const args = mapProposalToCreateArgs(NORMALIZED, proposal({}), 'src');
    expect(args.dependencies).toBeUndefined(); // → createSD writes column []
    expect('engine_child_index' in args.metadata).toBe(false);
    expect('parent_sd_key' in args.metadata).toBe(false);
    expect('depends_on' in args.metadata).toBe(false);
  });

  it('NO-REGRESSION: an all-junk depends_on yields no dependencies key', () => {
    const args = mapProposalToCreateArgs(NORMALIZED, proposal({ depends_on: ['', null, {}] }), 'src');
    expect(args.dependencies).toBeUndefined();
    expect('depends_on' in args.metadata).toBe(false);
  });
});
