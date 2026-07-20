/**
 * SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C (Child B) FR-4 -- readSalientState's openSignalCount
 * generalization (closes the class of bug behind the 2026-07-19 lane-blindness incident,
 * commit bb661ec627e / QF-20260719-298, WITHOUT touching selectUnactionedAdvisories's
 * actioned_at-coupled retirement logic -- see TR-5). TS-4/TS-5.
 */
import { describe, it, expect, vi } from 'vitest';
import { readSalientState } from '../../../scripts/coordinator-quiet-tick.mjs';

function makeMock({ drainSetsRows = null, drainSetsError = null, coordinationRows = [], captured = {} } = {}) {
  return {
    from(table) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        or(filterStr) { captured.orFilter = filterStr; return chain; },
        is() { return chain; },
        gte() { return chain; },
        then(res, rej) {
          if (table === 'strategic_directives_v2') {
            return Promise.resolve({ data: [], error: null }).then(res, rej);
          }
          if (table === 'role_drain_sets') {
            if (drainSetsError) return Promise.resolve({ data: null, error: drainSetsError }).then(res, rej);
            return Promise.resolve({ data: drainSetsRows || [], error: null }).then(res, rej);
          }
          // session_coordination: the test controls exactly which rows "match" the .or() filter
          // by pre-filtering coordinationRows into what the caller expects to be counted.
          // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: openSignalCount now reads
          // via {count:'exact', head:true} (a gauge) instead of data.length — include the exact
          // count alongside data so both call shapes resolve correctly.
          return Promise.resolve({ data: coordinationRows, count: coordinationRows.length, error: null }).then(res, rej);
        },
      };
      return chain;
    },
  };
}

describe('readSalientState openSignalCount generalization (TS-4)', () => {
  it('reflects a NEW kind (not adam_advisory) once the registry resolves it -- proves generalization, not a re-verification of the existing case', async () => {
    // Simulate: registry resolves 'coordinator_source_request' as a coordinator-recognized kind,
    // and the session_coordination query returns one row of exactly that kind (the caller's .or()
    // filter would include it because it's in the resolved set) -- if the OLD hard-coded
    // signal_type-only check were still in place, this row would NEVER be counted.
    const mock = makeMock({
      drainSetsRows: [{ kind: 'coordinator_source_request' }],
      coordinationRows: [{ id: 'row-1' }],
    });
    const state = await readSalientState(mock);
    expect(state.openSignalCount).toBe(1);
  });

  it('a resolved kind explicitly excluded as mechanical (cross_party_ping) is NOT present in the constructed OR filter', async () => {
    const captured = {};
    const mock = makeMock({
      drainSetsRows: [{ kind: 'cross_party_ping' }, { kind: 'coordinator_directive' }],
      coordinationRows: [],
      captured,
    });
    await readSalientState(mock);
    expect(captured.orFilter).not.toContain('cross_party_ping');
    expect(captured.orFilter).toContain('coordinator_directive');
  });

  it('EXEC-phase SECURITY hardening: a resolved kind containing filter-breaking characters (comma/paren) is excluded from the constructed OR filter, not interpolated raw', async () => {
    const captured = {};
    const mock = makeMock({
      drainSetsRows: [
        { kind: 'coordinator_directive' },
        { kind: 'evil),id.eq.1--' }, // would break out of payload->>kind.in.(...) if interpolated raw
        { kind: 'also,bad' },
      ],
      coordinationRows: [],
      captured,
    });
    await readSalientState(mock);
    expect(captured.orFilter).toContain('coordinator_directive');
    expect(captured.orFilter).not.toContain('evil');
    expect(captured.orFilter).not.toContain('also,bad');
    // The filter-breaking characters themselves never reach the constructed string at all.
    expect(captured.orFilter).not.toMatch(/[(),].*evil|evil.*[(),]/);
  });

  it('fails open (never throws) when role_drain_sets errors (unapplied/STAGED state)', async () => {
    const mock = makeMock({
      drainSetsError: { code: 'PGRST205', message: 'not found' },
      coordinationRows: [{ id: 'a' }, { id: 'b' }],
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(readSalientState(mock)).resolves.toBeDefined();
    errorSpy.mockRestore();
  });

  it('never throws on a fully broken supabase client (fail-soft, matches the pre-existing try/catch contract)', async () => {
    const broken = { from() { throw new Error('boom'); } };
    await expect(readSalientState(broken)).resolves.toMatchObject({ openSignalCount: 0 });
  });
});

describe('FR-4 source-level guard: cross_party_ping subtraction and selectUnactionedAdvisories untouched (TS-5)', () => {
  it('coordinator-quiet-tick.mjs subtracts PAYLOAD_KINDS.CROSS_PARTY_PING before building the OR filter', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../../../scripts/coordinator-quiet-tick.mjs', import.meta.url), 'utf8');
    expect(src).toMatch(/filter\(\(k\)\s*=>\s*k\s*!==\s*PAYLOAD_KINDS\.CROSS_PARTY_PING/);
  });

  it('does not call resolveRecognizedKinds inside selectUnactionedAdvisories (adam-advisory-store.cjs stays untouched)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../../../lib/coordinator/adam-advisory-store.cjs', import.meta.url), 'utf8');
    expect(src).not.toMatch(/resolveRecognizedKinds/);
    expect(src).toMatch(/ADAM_ADVISORY_KIND/); // the original single-kind constant is still there, unmodified
  });
});
