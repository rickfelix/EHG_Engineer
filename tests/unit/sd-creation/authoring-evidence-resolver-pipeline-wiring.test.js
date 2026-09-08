/**
 * SD-LEO-FIX-AUTHORING-TIME-EVIDENCE-001: wiring test for the authoring-time
 * evidence-artifact resolver at its single hook point, lib/sd-creation/pipeline.js
 * createSD() (mirrors tests/unit/sd-creation/dedup-match-stamp.test.js's mocking
 * pattern for the SAME choke point, extended to distinguish the dedup read
 * (.select().range()) from the resolver's owner probe (.select().eq().maybeSingle())).
 *
 * Both --from-plan and child-decomposition converge on this one createSD() call
 * (confirmed by EXPLORE evidence 15b8149c-7c85-41d9-ada1-09d0193f24ef), so testing the
 * hook here covers both named call sites without duplicating the test per adapter.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const capturedInserts = vi.hoisted(() => []);
const resolvableRows = vi.hoisted(() => ({ rows: {} })); // { [table]: { [id]: row } }

vi.mock('../../../lib/supabase-client.js', () => {
  function mkChain(table) {
    const state = { inserted: false, eqVal: null };
    const resolveDedupRead = () => ({ data: [], error: null, count: 0 }); // no dedup matches, empty existing SDs
    const resolveInsert = () => {
      if (table === 'strategic_directives_v2') {
        return { data: { id: 'new-sd-uuid', sd_key: 'SD-NEW-001' }, error: null, count: 1 };
      }
      return { data: null, error: null, count: 0 };
    };
    // ONE flat proxy for the whole chain. The terminal method actually called
    // determines the resolved value; every intermediate call (.select/.eq/.range/etc.)
    // just returns this SAME proxy so any call order chains correctly.
    const proxy = new Proxy(function proxyBase() { return undefined; }, {
      get(_t, prop) {
        if (prop === 'then') {
          const resolved = state.inserted ? resolveInsert() : resolveDedupRead();
          return (onFulfilled, onRejected) => Promise.resolve(resolved).then(onFulfilled, onRejected);
        }
        if (prop === 'catch') {
          const resolved = state.inserted ? resolveInsert() : resolveDedupRead();
          return (onRejected) => Promise.resolve(resolved).catch(onRejected);
        }
        if (prop === 'maybeSingle' || prop === 'single') {
          return async () => {
            if (state.inserted) return resolveInsert();
            const rows = resolvableRows.rows[table] || {};
            const row = rows[state.eqVal] || null;
            return { data: row, error: null };
          };
        }
        return (...args) => {
          if (prop === 'eq') state.eqVal = args[1];
          if (prop === 'insert') {
            state.inserted = true;
            if (table === 'strategic_directives_v2') capturedInserts.push(args[0]);
          }
          return proxy;
        };
      },
    });
    return proxy;
  }
  return {
    createSupabaseServiceClient: () => ({
      from: (table) => mkChain(table),
      rpc: () => Promise.resolve({ data: null, error: null }),
    }),
  };
});

vi.mock('../../../lib/governance/guardrail-registry.js', () => ({
  check: () => ({ passed: true, warnings: [], violations: [] }),
}));
vi.mock('../../../scripts/modules/governance/cascade-validator.js', () => ({
  validateCascade: async () => ({ passed: true, warnings: [], violations: [], rulesChecked: 0 }),
}));
vi.mock('../../../lib/fleet/sd-tier-rank.mjs', () => ({
  stampPayloadForCreation: () => ({}),
}));
vi.mock('../../../lib/coordinator/trigger-rank-pass.mjs', () => ({
  triggerRankPass: () => {},
}));

const RESOLVABLE_TOKEN = 'aaaaaaaa-1111-2222-3333-444444444444';
const UNRESOLVABLE_TOKEN = 'bbbbbbbb-1111-2222-3333-444444444444';

describe('SD-LEO-FIX-AUTHORING-TIME-EVIDENCE-001: artifact-owner resolution wired into createSD()', () => {
  let exitSpy;
  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code}) must not be called from library code`);
    });
    capturedInserts.length = 0;
    resolvableRows.rows = {};
  });
  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('a resolvable uuid in the description is annotated with its verified owner before insert', async () => {
    resolvableRows.rows.strategic_directives_v2 = { [RESOLVABLE_TOKEN]: { id: RESOLVABLE_TOKEN, sd_key: 'SD-REAL-001' } };
    const { createSD } = await import('../../../lib/sd-creation/pipeline.js');
    const res = await createSD({
      sdKey: 'SD-ARCH-HOTSPOT-TEST-ARTIFACT-001',
      title: 'A mint citing a real fixture uuid',
      description: `Uses fixture row ${RESOLVABLE_TOKEN} as the test specimen.`,
      type: 'infrastructure',
      rationale: 'unit-test fixture',
      metadata: { source: 'leo' },
    });
    expect(exitSpy).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    expect(capturedInserts).toHaveLength(1);
    expect(capturedInserts[0].description).toContain(`${RESOLVABLE_TOKEN} (owner: SD-REAL-001)`);
  });

  it('an unresolvable uuid in the description refuses the mint loudly, naming the token, before any insert', async () => {
    const { createSD } = await import('../../../lib/sd-creation/pipeline.js');
    const res = await createSD({
      sdKey: 'SD-ARCH-HOTSPOT-TEST-ARTIFACT-002',
      title: 'A mint citing a uuid that resolves nowhere',
      description: `Uses fixture row ${UNRESOLVABLE_TOKEN} which does not exist anywhere.`,
      type: 'infrastructure',
      rationale: 'unit-test fixture',
      metadata: { source: 'leo' },
    });
    expect(exitSpy).not.toHaveBeenCalled();
    expect(res.ok).toBe(false);
    expect(res.code).toBe('UNRESOLVED_ARTIFACT_TOKEN');
    expect(res.error).toContain(UNRESOLVABLE_TOKEN);
    expect(capturedInserts).toHaveLength(0);
  });

  it('prose with no uuid-shaped tokens at all is completely unaffected (zero live impact)', async () => {
    const { createSD } = await import('../../../lib/sd-creation/pipeline.js');
    const res = await createSD({
      sdKey: 'SD-ARCH-HOTSPOT-TEST-ARTIFACT-003',
      title: 'A perfectly ordinary mint with no fixture references',
      description: 'Plain prose describing the work, no ids anywhere.',
      type: 'infrastructure',
      rationale: 'unit-test fixture',
      metadata: { source: 'leo' },
    });
    expect(exitSpy).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    expect(capturedInserts).toHaveLength(1);
    expect(capturedInserts[0].description).toBe('Plain prose describing the work, no ids anywhere.');
  });
});
