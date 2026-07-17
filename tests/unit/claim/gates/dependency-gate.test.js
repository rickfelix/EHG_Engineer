/**
 * SD-ARCH-HOTSPOT-SD-START-001 FR-2 / TS-2 — converged dependency gate:
 * one resolution, raw axes, BOTH caller polarities pinned.
 *
 * @module tests/unit/claim/gates/dependency-gate.test
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createRequire } from 'module';
import { evaluateDependencyGate } from '../../../../lib/sd-start/dependency-gate.mjs';

const require = createRequire(import.meta.url);
const {
  evaluateClaimDependencyGate,
  depsSatisfiedFromVerdict,
  extractDependencyRefs,
} = require('../../../../lib/claim/gates/dependency-gate.cjs');

// Minimal fake supabase: .from().select().or().maybeSingle()/thenable with seeded rows.
function makeSb({ rows = [], depsRow, failWith = null } = {}) {
  return {
    from() {
      const q = { wantMaybe: false };
      const builder = {
        select() { return builder; },
        or() { return builder; },
        in() { return builder; },
        maybeSingle() {
          q.wantMaybe = true;
          if (failWith) return Promise.resolve({ data: null, error: { message: failWith } });
          return Promise.resolve({ data: depsRow !== undefined ? depsRow : null, error: null });
        },
        then(res, rej) {
          if (failWith) return Promise.resolve({ data: null, error: { message: failWith } }).then(res, rej);
          return Promise.resolve({ data: rows, error: null }).then(res, rej);
        },
      };
      return builder;
    },
  };
}

const sdWith = (dependencies, metadata = {}) => ({ id: 'uuid-1', sd_key: 'SD-SELF-001', dependencies, metadata });

describe('extractDependencyRefs — draftDepsSatisfied-heritage resolution (one path)', () => {
  it('handles every fleet dependency shape + the blocked_on_sd fold', () => {
    const refs = extractDependencyRefs(sdWith(
      ['SD-A-001 needs finishing', { sd_id: 'SD-B-001' }, { sd_key: 'SD-C-001' }, { sd_key: 'none' }, { type: 'note', status: 'x', dependency: 'free-form' }, 'None'],
      { blocked_on_sd: 'SD-D-001' },
    ));
    expect(refs).toEqual(['SD-A-001', 'SD-B-001', 'SD-C-001', 'SD-D-001']);
  });
});

describe('evaluateClaimDependencyGate — TS-2 raw-axes matrix', () => {
  it('classifies blocking / satisfied / unresolved and folds blocked_on_sd', async () => {
    const sb = makeSb({ rows: [
      { id: 'u-a', sd_key: 'SD-A-001', status: 'in_progress' },
      { id: 'u-b', sd_key: 'SD-B-001', status: 'completed' },
      { id: 'u-d', sd_key: 'SD-D-001', status: 'draft' },
    ] });
    const v = await evaluateClaimDependencyGate(sb, sdWith(
      [{ sd_key: 'SD-A-001' }, { sd_key: 'SD-B-001' }, { sd_key: 'SD-GONE-001' }],
      { blocked_on_sd: 'SD-D-001' },
    ));
    expect(v.queryError).toBeNull();
    expect(v.blocking.map(d => d.sd_id)).toEqual(['SD-A-001', 'SD-D-001']);
    expect(v.satisfied.map(d => d.sd_id)).toEqual(['SD-B-001']);
    expect(v.unresolved.map(d => d.sd_id)).toEqual(['SD-GONE-001']);
    expect(v.resolved).toHaveLength(4);
  });

  it('all-completed and empty deps both come back clean', async () => {
    const clean = await evaluateClaimDependencyGate(
      makeSb({ rows: [{ id: 'u', sd_key: 'SD-A-001', status: 'completed' }] }),
      sdWith([{ sd_key: 'SD-A-001' }]),
    );
    expect(clean.blocking).toEqual([]);
    expect(clean.unresolved).toEqual([]);
    const empty = await evaluateClaimDependencyGate(makeSb({}), sdWith([]));
    expect(empty.resolved).toEqual([]);
  });

  it('resolves uuid-shaped refs by id (the resolution gap the sd_key-only lookup had)', async () => {
    const v = await evaluateClaimDependencyGate(
      makeSb({ rows: [{ id: 'c6c645c6-2f94-41b6-8e80-2642d7fcdc23', sd_key: 'SD-PARENT-001', status: 'completed' }] }),
      sdWith([{ sd_id: 'c6c645c6-2f94-41b6-8e80-2642d7fcdc23' }]),
    );
    expect(v.satisfied).toHaveLength(1);
    expect(v.unresolved).toEqual([]);
  });

  it('fetches the dependencies column when the caller did not load it (sd-start heritage)', async () => {
    const v = await evaluateClaimDependencyGate(
      makeSb({ depsRow: { dependencies: [{ sd_key: 'SD-A-001' }] }, rows: [{ id: 'u', sd_key: 'SD-A-001', status: 'active' }] }),
      { id: 'uuid-1', sd_key: 'SD-SELF-001', metadata: {} }, // dependencies undefined
    );
    expect(v.blocking.map(d => d.sd_id)).toEqual(['SD-A-001']);
  });

  it('query error → queryError set, axes empty (callers apply native polarity)', async () => {
    const v = await evaluateClaimDependencyGate(makeSb({ failWith: 'boom' }), sdWith([{ sd_key: 'SD-A-001' }]));
    expect(v.queryError).toMatch(/boom/);
    expect(v.blocking).toEqual([]);
    expect(v.unresolved).toEqual([]);
  });
});

describe('TS-2 caller polarities — the D3/D4 parity pins', () => {
  const blockingVerdict = { blocking: [{ sd_id: 'SD-A-001', status: 'draft' }], unresolved: [], satisfied: [], resolved: [], queryError: null };
  const unresolvedVerdict = { blocking: [], unresolved: [{ sd_id: 'SD-GONE-001', status: null }], satisfied: [], resolved: [], queryError: null };
  const errorVerdict = { blocking: [], unresolved: [], satisfied: [], resolved: [], queryError: 'boom' };
  const cleanVerdict = { blocking: [], unresolved: [], satisfied: [{ sd_id: 'SD-B-001', status: 'completed' }], resolved: [], queryError: null };

  it('checkin polarity (fail-CLOSED): skips on blocking, unresolved, AND query error — claims only on clean', () => {
    expect(depsSatisfiedFromVerdict(blockingVerdict)).toBe(false);
    expect(depsSatisfiedFromVerdict(unresolvedVerdict)).toBe(false); // unresolved ⇒ skip (current draftDepsSatisfied behavior)
    expect(depsSatisfiedFromVerdict(errorVerdict)).toBe(false);      // query error ⇒ skip (conservative)
    expect(depsSatisfiedFromVerdict(cleanVerdict)).toBe(true);
  });

  it('sd-start polarity (fail-OPEN, evaluateDependencyGate over verdict.resolved): unresolved warns-never-blocks; --force downgrades a refusal', () => {
    // Unresolved-only: proceed with warning (never block on a bad reference).
    const unresolved = evaluateDependencyGate([{ sd_id: 'SD-GONE-001', status: null }]);
    expect(unresolved.verdict).toBe('proceed');
    expect(unresolved.warn).toBe(true);
    // Confirmed-incomplete: refuse without --force, warn-and-proceed with it.
    const refusal = evaluateDependencyGate([{ sd_id: 'SD-A-001', status: 'draft' }]);
    expect(refusal.verdict).toBe('refuse');
    const forced = evaluateDependencyGate([{ sd_id: 'SD-A-001', status: 'draft' }], { force: true });
    expect(forced.verdict).toBe('proceed');
    expect(forced.warn).toBe(true);
  });
});

// ── ADDITIVE — SD-LEO-INFRA-MAKE-WSJF-SELF-001 FR-1/FR-4b: superset metadata sources ──
describe('FR-1 superset (SD-LEO-INFRA-MAKE-WSJF-SELF-001) — metadata dep sources produce refs', () => {
  it('metadata.dependencies entries produce refs', () => {
    const refs = extractDependencyRefs(sdWith([], { dependencies: [{ sd_key: 'SD-MD-001' }, 'SD-ME-001 waiting', { sd_key: 'none' }] }));
    expect(refs).toEqual(['SD-MD-001', 'SD-ME-001']);
  });

  it('metadata.depends_on produces refs (single string AND array shapes)', () => {
    expect(extractDependencyRefs(sdWith([], { depends_on: 'SD-DO-001' }))).toEqual(['SD-DO-001']);
    expect(extractDependencyRefs(sdWith([], { depends_on: ['SD-DO-001', { sd_id: 'SD-DO-002' }] })))
      .toEqual(['SD-DO-001', 'SD-DO-002']);
  });

  it('metadata.blocked_by_sd_key produces a ref (and its none-sentinel is dropped)', () => {
    expect(extractDependencyRefs(sdWith([], { blocked_by_sd_key: 'SD-BB-001' }))).toEqual(['SD-BB-001']);
    expect(extractDependencyRefs(sdWith([], { blocked_by_sd_key: 'none' }))).toEqual([]);
  });

  it('a metadata.depends_on dep on a non-completed SD BLOCKS through the full gate', async () => {
    const sb = makeSb({ rows: [{ id: 'u-do', sd_key: 'SD-DO-001', status: 'in_progress' }] });
    const v = await evaluateClaimDependencyGate(sb, sdWith([], { depends_on: 'SD-DO-001' }));
    expect(v.blocking.map((d) => d.sd_id)).toEqual(['SD-DO-001']);
    expect(depsSatisfiedFromVerdict(v)).toBe(false);
  });

  it('a SELF-ref via metadata.depends_on evaluates as a blocked dep without throwing', async () => {
    const sb = makeSb({ rows: [{ id: 'uuid-1', sd_key: 'SD-SELF-001', status: 'draft' }] });
    const v = await evaluateClaimDependencyGate(sb, sdWith([], { depends_on: 'SD-SELF-001' }));
    expect(v.queryError).toBeNull();
    expect(v.blocking.map((d) => d.sd_id)).toEqual(['SD-SELF-001']);
    expect(depsSatisfiedFromVerdict(v)).toBe(false);
  });
});

describe('module purity (FR-2 AC — D5 audit ownership + no CLI side effects)', () => {
  const raw = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../../lib/claim/gates/dependency-gate.cjs'),
    'utf8',
  );
  // Strip comments so doc references to the forbidden patterns don't false-positive.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it('contains no process.exit / console / argv / audit writes in CODE', () => {
    expect(src).not.toMatch(/process\.exit/);
    expect(src).not.toMatch(/console\./);
    expect(src).not.toMatch(/process\.argv/);
    expect(src).not.toMatch(/audit_log/); // DEPENDENCY_GATE_REFUSED stays in the sd-start caller
  });
});
