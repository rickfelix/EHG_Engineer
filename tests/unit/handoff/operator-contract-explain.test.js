/**
 * TS-4 — the READ-BACK reader, asserted AT THE CONSUMER. (SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-002)
 *
 * This is the load-bearing test of the SD. Every other test here drives the producer; mutation
 * M7 (drop details.repo_path from the gate) reddens THIS one, and if it is absent then FR-4 was
 * not delivered — the emitted fields would be a produced output nothing consumes, which is the
 * exact verdict the gate under change emits.
 *
 * Unit tier deliberately: tests/integration/ is a member of ZERO vitest projects (measured — 0
 * tests across 177 files, and the db project's passWithNoTests:true exits 0), so a test placed
 * there is indistinguishable from a test that does not exist.
 */
import { describe, it, expect } from 'vitest';
import { explainOperatorContract } from '../../../scripts/explain-operator-contract.mjs';

/** Minimal PostgREST-shaped stub: resolves {data, error}, never throws — as the real client does. */
function makeSupabase({ sd = { id: 'sd-uuid' }, sdErr = null, rows = [], rowsErr = null } = {}) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: sd, error: sdErr }) }) }) };
      }
      return { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: rows, error: rowsErr }) }) }) }) };
    },
  };
}

const rowWith = (details) => ({ created_at: '2026-08-08T04:00:00Z', metadata: { gate_results: { OPERATOR_CONTRACT: { passed: false, details } } } });
const collectStub = () => ({ changedFiles: [], migrations: [] });

describe('the reader reproduces a recorded verdict', () => {
  it('reports reproduced:true when the re-run matches what was recorded', async () => {
    const res = await explainOperatorContract(
      makeSupabase({ rows: [rowWith({ repo_path: 'C:/repo', creator_kinds: ['flag'] })] }),
      'SD-X', { collect: collectStub, detect: () => ({ creator_kinds: ['flag'] }) },
    );
    expect(res.reproducible).toBe(true);
    expect(res.reproduced).toBe(true);
    expect(res.repo_path).toBe('C:/repo');
  });

  it('reports reproduced:false when the tree no longer yields the recorded answer', async () => {
    // The whole point of a reproducible verdict is that it can DISAGREE. A reader that always
    // says "reproduced" is a backstop that never fails.
    const res = await explainOperatorContract(
      makeSupabase({ rows: [rowWith({ repo_path: 'C:/repo', creator_kinds: ['flag'] })] }),
      'SD-X', { collect: collectStub, detect: () => ({ creator_kinds: [] }) },
    );
    expect(res.reproduced).toBe(false);
  });

  it('treats creator_kinds as a SET — order is not meaning', async () => {
    const res = await explainOperatorContract(
      makeSupabase({ rows: [rowWith({ repo_path: 'C:/repo', creator_kinds: ['table', 'flag'] })] }),
      'SD-X', { collect: collectStub, detect: () => ({ creator_kinds: ['flag', 'table'] }) },
    );
    expect(res.reproduced).toBe(true);
  });

  it('re-runs against the RECORDED tree, not the current working directory', async () => {
    // If this ever reads process.cwd() the reader silently checks the wrong tree and still
    // reports success — the same wrong-tree silence FR-5 documents.
    let seen;
    await explainOperatorContract(
      makeSupabase({ rows: [rowWith({ repo_path: 'C:/some/other/tree', creator_kinds: [] })] }),
      'SD-X', { collect: (o) => { seen = o.appPath; return collectStub(); }, detect: () => ({ creator_kinds: [] }) },
    );
    expect(seen).toBe('C:/some/other/tree');
  });
});

describe('M7 — the mutation that decides whether FR-4 shipped', () => {
  it('a verdict with NO repo_path is not reproducible, and says why', async () => {
    // Dropping details.repo_path from the producer lands exactly here. This assertion lives on
    // the CONSUMER side, which is what makes it acceptance rather than decoration.
    const res = await explainOperatorContract(
      makeSupabase({ rows: [rowWith({ creator_kinds: ['flag'] })] }),
      'SD-X', { collect: collectStub, detect: () => ({ creator_kinds: ['flag'] }) },
    );
    expect(res.reproducible).toBe(false);
    expect(res.why).toMatch(/names no tree/);
  });
});

describe('degrades honestly instead of throwing', () => {
  it('an unknown SD key', async () => {
    const res = await explainOperatorContract(makeSupabase({ sd: null }), 'SD-NOPE', { collect: collectStub, detect: () => ({}) });
    expect(res.reproducible).toBe(false);
    expect(res.why).toMatch(/no SD found/);
  });

  it('a PostgREST error is surfaced, not swallowed — it resolves {data:null,error}, never throws', async () => {
    const res = await explainOperatorContract(makeSupabase({ rowsErr: { message: '42703 column missing' } }), 'SD-X', { collect: collectStub, detect: () => ({}) });
    expect(res.reproducible).toBe(false);
    expect(res.why).toMatch(/42703/);
  });

  it('an SD with no recorded operator-contract verdict', async () => {
    const res = await explainOperatorContract(makeSupabase({ rows: [{ metadata: {} }] }), 'SD-X', { collect: collectStub, detect: () => ({}) });
    expect(res.reproducible).toBe(false);
    expect(res.why).toMatch(/no recorded OPERATOR_CONTRACT/);
  });

  it('a named tree that can no longer be read', async () => {
    const res = await explainOperatorContract(
      makeSupabase({ rows: [rowWith({ repo_path: 'C:/gone', creator_kinds: [] })] }),
      'SD-X', { collect: () => { throw new Error('ENOENT'); }, detect: () => ({}) },
    );
    expect(res.reproducible).toBe(false);
    expect(res.why).toMatch(/cannot read the named tree/);
    expect(res.repo_path).toBe('C:/gone');
  });
});
