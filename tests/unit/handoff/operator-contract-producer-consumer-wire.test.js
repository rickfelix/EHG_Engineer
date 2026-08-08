/**
 * PROOF OF CONCEPT #2 (TESTING sub-agent, EXEC-TO-PLAN review of
 * SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-002).
 *
 * GAP UNDER TEST: FR-4 acceptance criterion 3 requires that mutation M7 (dropping
 * details.repo_path from the PRODUCER) redden a test that lives ON THE CONSUMER SIDE.
 * As shipped it does not: operator-contract-explain.test.js builds its rows as object
 * literals, so the producer and the consumer are never connected by any test, and M7's
 * four failures are all producer-side (verdict-provenance.test.js).
 *
 * This file closes it by feeding the gate's REAL emitted verdict into the REAL reader.
 * Nothing between them is hand-assembled.
 */
import { describe, it, expect } from 'vitest';
import { createOperatorContractGate } from '../../../lib/gates/operator-contract/harness-adapter.js';
import { explainOperatorContract } from '../../../scripts/explain-operator-contract.mjs';

const gateSupabase = { from: () => ({ select: async () => ({ data: [], error: null }), insert: async () => ({ error: null }) }) };
const sd = { sd_key: 'SD-TEST-001', metadata: {} };
const diffOf = (changedFiles, migrations = []) => ({ changedFiles, migrations, createdTables: [] });
const FLAG_CREATOR = diffOf([{ path: 'scripts/add-flag.js', added: "await supabase.from('leo_feature_flags').insert({ key: 'k' })" }]);

/** Reader-side stub: serves whatever row we hand it, shaped like sd_phase_handoffs. */
function readerSupabase(row) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'sd-uuid' }, error: null }) }) }) };
      }
      return { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [row], error: null }) }) }) }) };
    },
  };
}

describe('M7 AT THE CONSUMER — the gate\'s real verdict, read back by the real reader', () => {
  it('a recorded verdict produced by the gate is reproducible by the reader', async () => {
    // PRODUCER: the actual gate, on a real creator diff. This lands on the creator-FAIL
    // details site — the branch an operator is most likely to be reading back.
    const verdict = await createOperatorContractGate(gateSupabase, sd, 'C:/named/tree', { diff: FLAG_CREATOR }).validator({ sd });
    const row = { created_at: '2026-08-08T04:00:00Z', metadata: { gate_results: { OPERATOR_CONTRACT: verdict } } };

    // CONSUMER: the real reader, over the real recorded shape.
    const res = await explainOperatorContract(readerSupabase(row), 'SD-X', {
      collect: () => ({ changedFiles: [], migrations: [] }),
      detect: () => ({ creator_kinds: verdict.details.creator_kinds }),
    });

    // M7 lands HERE: with repo_path dropped from the producer, the reader cannot name a
    // tree and reproducible goes false. This is the consumer-side assertion FR-4 asks for.
    expect(res.reproducible).toBe(true);
    expect(res.repo_path).toBe('C:/named/tree');
    expect(res.reproduced).toBe(true);
  });

  it('the reader re-runs against the tree the PRODUCER named, not the cwd', async () => {
    const verdict = await createOperatorContractGate(gateSupabase, sd, 'C:/producer/named/tree', { diff: FLAG_CREATOR }).validator({ sd });
    const row = { created_at: '2026-08-08T04:00:00Z', metadata: { gate_results: { OPERATOR_CONTRACT: verdict } } };
    let seen;
    await explainOperatorContract(readerSupabase(row), 'SD-X', {
      collect: (o) => { seen = o.appPath; return { changedFiles: [], migrations: [] }; },
      detect: () => ({ creator_kinds: [] }),
    });
    expect(seen).toBe('C:/producer/named/tree');
  });

  it('creator_kinds survives the producer -> record -> reader round trip as DATA', async () => {
    // FR-1 at the consumer: the pre-fix defect was an ABSENT key after JSON.stringify, so
    // the round trip is asserted through a serialise/parse, not on the live object.
    const verdict = await createOperatorContractGate(gateSupabase, sd, 'C:/named/tree', { diff: FLAG_CREATOR }).validator({ sd });
    const row = JSON.parse(JSON.stringify({ created_at: 'x', metadata: { gate_results: { OPERATOR_CONTRACT: verdict } } }));
    const res = await explainOperatorContract(readerSupabase(row), 'SD-X', {
      collect: () => ({ changedFiles: [], migrations: [] }),
      detect: () => ({ creator_kinds: ['flag'] }),
    });
    expect(res.recorded).toEqual(['flag']);
    expect(res.reproduced).toBe(true);
  });
});

describe('M5b / X3 — the two details sites no shipped test reaches', () => {
  it('M5b: the ENFORCED UNEVALUABLE (catch-block fail-CLOSED) branch names the tree', async () => {
    // The shipped test called "M5b" actually lands on the CONSUMER_CITATION_MISSING branch
    // (proved: mutating only that site reddens it, mutating the catch-block site reddens
    // nothing). This is the real fail-closed branch: enforcement ON + a tree git cannot read.
    process.env.ENFORCE_CONSUMER_CITATION = '1';
    try {
      const res = await createOperatorContractGate(gateSupabase, sd, 'C:/definitely/not/a/repo/xyz').validator({ sd });
      expect(res.passed).toBe(false);
      expect(res.details.fail_open).toBe(false);
      expect(res.details.enforced).toBe(true);
      expect(res.details.repo_path).toBe('C:/definitely/not/a/repo/xyz');
    } finally {
      delete process.env.ENFORCE_CONSUMER_CITATION;
    }
  });

  it('X3: the CREATOR-FAIL branch names the tree (producer-side companion)', async () => {
    const res = await createOperatorContractGate(gateSupabase, sd, 'C:/named/tree', { diff: FLAG_CREATOR }).validator({ sd });
    expect(res.passed).toBe(false);
    expect(res.details.repo_path).toBe('C:/named/tree');
    expect(res.details.creator_kinds).toEqual(['flag']);
  });
});
