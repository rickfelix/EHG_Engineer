/**
 * SD-LEO-INFRA-CANONICAL-SCRIPTS-APPLY-001 — FR-5 / TS-4..TS-7
 * Unit tests for scripts/lib/migration-verification.js (mocked pg client).
 *
 * Covers: captureObjectDefinitions dispatches to the correct introspection API
 * per object kind. buildObjectDiffs reports changed=true/false per object and
 * preserves nulls for missing-before / missing-after. (Real-DB integration is
 * TS-4/TS-7 in PRD — those are deferred to PLAN-phase integration suite
 * because they require a sandbox schema and pg-pooler TLS; see PRD test_scenarios.)
 */
import { describe, it, expect, vi } from 'vitest';
import {
  captureObjectDefinitions,
  buildObjectDiffs,
} from '../../scripts/lib/migration-verification.js';

function fakeClientForDef(map) {
  return {
    query: vi.fn(async (sql) => {
      if (/pg_get_functiondef/.test(sql)) return { rows: map.FUNCTION ? [{ def: map.FUNCTION }] : [] };
      if (/pg_get_triggerdef/.test(sql)) return { rows: map.TRIGGER ? [{ def: map.TRIGGER }] : [] };
      if (/pg_views/.test(sql)) return { rows: map.VIEW ? [{ definition: map.VIEW }] : [] };
      if (/pg_indexes/.test(sql)) return { rows: map.INDEX ? [{ indexdef: map.INDEX }] : [] };
      return { rows: [] };
    }),
  };
}

describe('captureObjectDefinitions (TS-4/5/7)', () => {
  it('dispatches FUNCTION → pg_get_functiondef', async () => {
    const c = fakeClientForDef({ FUNCTION: 'CREATE FUNCTION ...' });
    const r = await captureObjectDefinitions(c, [{ kind: 'FUNCTION', schema: 'public', name: 'f' }]);
    expect(r[0].definition).toBe('CREATE FUNCTION ...');
  });

  it('dispatches TRIGGER → pg_get_triggerdef (CONDITION_3 — genesis regression)', async () => {
    const c = fakeClientForDef({ TRIGGER: 'CREATE TRIGGER trg ...' });
    const r = await captureObjectDefinitions(c, [{ kind: 'TRIGGER', schema: 'public', name: 'trg' }]);
    expect(r[0].definition).toBe('CREATE TRIGGER trg ...');
  });

  it('dispatches VIEW → pg_views.definition', async () => {
    const c = fakeClientForDef({ VIEW: 'SELECT 1' });
    const r = await captureObjectDefinitions(c, [{ kind: 'VIEW', schema: 'public', name: 'v' }]);
    expect(r[0].definition).toBe('SELECT 1');
  });

  it('dispatches INDEX → pg_indexes.indexdef', async () => {
    const c = fakeClientForDef({ INDEX: 'CREATE INDEX i_a ...' });
    const r = await captureObjectDefinitions(c, [{ kind: 'INDEX', schema: 'public', name: 'i_a' }]);
    expect(r[0].definition).toBe('CREATE INDEX i_a ...');
  });

  it('returns definition=null when not found (no row)', async () => {
    const c = fakeClientForDef({});
    const r = await captureObjectDefinitions(c, [{ kind: 'FUNCTION', schema: 'public', name: 'missing' }]);
    expect(r[0].definition).toBeNull();
  });
});

describe('buildObjectDiffs (object_diffs JSONB)', () => {
  it('changed=true when before differs from after', () => {
    const before = [{ kind: 'FUNCTION', schema: 'public', name: 'f', definition: 'OLD' }];
    const after = [{ kind: 'FUNCTION', schema: 'public', name: 'f', definition: 'NEW' }];
    const d = buildObjectDiffs(before, after);
    expect(d).toEqual([{ kind: 'FUNCTION', schema: 'public', name: 'f', before: 'OLD', after: 'NEW', changed: true }]);
  });

  it('changed=false when before === after (no-op migration — cascade regression)', () => {
    const before = [{ kind: 'TRIGGER', schema: 'public', name: 't', definition: 'SAME' }];
    const after = [{ kind: 'TRIGGER', schema: 'public', name: 't', definition: 'SAME' }];
    const d = buildObjectDiffs(before, after);
    expect(d[0].changed).toBe(false);
  });

  it('null before + non-null after represents new object', () => {
    const before = [{ kind: 'INDEX', schema: 'public', name: 'i', definition: null }];
    const after = [{ kind: 'INDEX', schema: 'public', name: 'i', definition: 'CREATE INDEX i ...' }];
    const d = buildObjectDiffs(before, after);
    expect(d[0]).toMatchObject({ before: null, after: 'CREATE INDEX i ...', changed: true });
  });

  it('multi-object emits one row per declared object', () => {
    const before = [
      { kind: 'FUNCTION', schema: 'public', name: 'f', definition: 'OLD_F' },
      { kind: 'TRIGGER', schema: 'public', name: 't', definition: null },
    ];
    const after = [
      { kind: 'FUNCTION', schema: 'public', name: 'f', definition: 'NEW_F' },
      { kind: 'TRIGGER', schema: 'public', name: 't', definition: 'CREATE TRIGGER t ...' },
    ];
    const d = buildObjectDiffs(before, after);
    expect(d.length).toBe(2);
    expect(d.every(x => x.changed)).toBe(true);
  });
});
