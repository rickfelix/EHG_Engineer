/**
 * Operator Contract — venture binding (FR-7) + self-cadence/regression (FR-8) tests.
 */
import { describe, it, expect } from 'vitest';
import { evaluateVentureOperatorContract } from '../venture-adapter.js';
import { registerOperatorContractCadence, regressionFalsePositives, OPERATOR_CONTRACT_PROCESS_KEY } from '../self-cadence.js';

describe('evaluateVentureOperatorContract (FR-7 — shared validator at the venture seam)', () => {
  const creatorStage = {
    migrations: [{ path: 'venture/db/m.sql', sql: 'CREATE TABLE venture_signals (id uuid);' }],
    changedFiles: [{ path: 'venture/writer.js', added: "supabase.from('venture_signals').insert(x)" }],
    createdTables: ['venture_signals'],
  };

  it('BLOCKS a venture-stage CREATOR with no operator triple (same verdict as harness)', () => {
    const r = evaluateVentureOperatorContract({ ...creatorStage, registryRows: [], retentionPolicies: [], now: new Date('2026-07-13') });
    expect(r.verdict).toBe('fail');
    expect(r.reason).toMatch(/OPERATOR_CONTRACT_INCOMPLETE/);
    expect(r.missing).toContain('armed_cadence');
    expect(r.missing).toContain('reaper');
  });

  it('PASSES a venture-stage CREATOR that ships its full triple', () => {
    const r = evaluateVentureOperatorContract({
      ...creatorStage,
      changedFiles: [
        { path: 'venture/writer.js', added: "supabase.from('venture_signals').insert(x)" },
        { path: 'venture/consumer.js', added: "const {data} = await supabase.from('venture_signals').select('*')" },
      ],
      registryRows: [{ process_key: 'venture_signals-sweep', currently_expected_active: true, expected_interval_seconds: 3600 }],
      retentionPolicies: [{ table: 'venture_signals' }],
      now: new Date('2026-07-13'),
    });
    expect(r.verdict).toBe('pass');
    expect(r.reason).toBe('OPERATOR_CONTRACT_COMPLETE');
  });

  it('is a no-op pass for a non-CREATOR venture stage', () => {
    const r = evaluateVentureOperatorContract({ changedFiles: [{ path: 'venture/x.js', added: 'return 1;' }] });
    expect(r.verdict).toBe('pass');
    expect(r.reason).toMatch(/NOT_APPLICABLE/);
  });
});

describe('registerOperatorContractCadence (FR-8 self-registration)', () => {
  it('upserts an ARMED registry row for the gate itself via the shared primitive', async () => {
    let upserted = null;
    // SD-LEO-INFRA-STAMP-ARMING-TIME-001: registerArmedMachinery now READS the existing row before
    // upserting, so armed_at is written once and then AGES rather than being reset every tick.
    // The mock must answer that read; data:null is "no prior row" (first registration).
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        upsert: async (row) => { upserted = row; return { error: null }; },
      }),
    };
    const r = await registerOperatorContractCadence(supabase, { expectedIntervalSeconds: 3600 });
    expect(r.ok).toBe(true);
    expect(upserted.process_key).toMatch(/operator-contract-gate/);
    expect(upserted.currently_expected_active).toBe(true);
    expect(upserted.expected_interval_seconds).toBe(3600);
    // The ARMED primitive prefixes the logical key — the exported process key must
    // match the ACTUAL registry row so a witness lookup can find it.
    expect(OPERATOR_CONTRACT_PROCESS_KEY).toBe('g3-armed-operator-contract-gate');
    expect(upserted.process_key).toBe(OPERATOR_CONTRACT_PROCESS_KEY);
  });
});

describe('regressionFalsePositives (FR-8 / SC#5 zero-false-positive)', () => {
  it('reports zero false-positives for a set of non-CREATOR SD diffs', () => {
    const nonCreatorSds = [
      { sd_key: 'SD-A', changedFiles: [{ path: 'lib/util/a.js', added: 'return x + 1;' }] },
      { sd_key: 'SD-B', changedFiles: [{ path: 'lib/log.js', added: "supabase.from('audit_log').insert(row)" }] }, // existing table
      { sd_key: 'SD-C', changedFiles: [{ path: 'src/ui/Btn.tsx', added: 'const detected = detectClick();' }] }, // loose detectX call
      { sd_key: 'SD-D', changedFiles: [{ path: 'docs/readme.md', added: '# heading' }] },
    ];
    const r = regressionFalsePositives(nonCreatorSds);
    expect(r.clean).toBe(true);
    expect(r.falsePositives).toHaveLength(0);
    expect(r.checked).toBe(4);
  });

  it('DOES report a genuine CREATOR (guards against the detector going blind)', () => {
    const r = regressionFalsePositives([
      { sd_key: 'SD-CREATOR', migrations: [{ path: 'm.sql', sql: 'CREATE TABLE new_thing (id uuid);' }] },
    ]);
    expect(r.clean).toBe(false);
    expect(r.falsePositives[0].sd_key).toBe('SD-CREATOR');
  });
});

/**
 * SD-LEO-INFRA-VERIFY-CONSUMER-HANDOFF-001 — hole B at the VENTURE seam.
 * Same arm as the harness adapter. Both seams share one validator, so they must also share one
 * answer; testing only the harness side would let the two drift apart silently.
 */
describe('hole B — venture seam arms on a wiring, not only on a creator', () => {
  const wiredDiff = [
    { path: 'lib/producer.js', added: "await supabase.from('venture_events').insert(row)" },
    { path: 'lib/consumer.js', added: "const { data } = await supabase.from('venture_events').select('*')" },
  ];

  it('a wired non-creator venture change is EVALUATED, not short-circuited', () => {
    const res = evaluateVentureOperatorContract({ changedFiles: wiredDiff });
    expect(res.wiring_detected).toBe(true);
    expect(res.wiring_tables).toEqual(['venture_events']);
  });

  it('warn-first by default: visible, non-blocking', () => {
    const res = evaluateVentureOperatorContract({ changedFiles: wiredDiff, enforceConsumerCitation: false });
    expect(res.verdict).not.toBe('FAIL');
    expect(res.warnings.join(' ')).toMatch(/WIRING DETECTED/);
  });

  it('enforced: blocks with the SAME reason string the harness adapter uses', () => {
    const res = evaluateVentureOperatorContract({ changedFiles: wiredDiff, enforceConsumerCitation: true });
    expect(res.verdict).toBe('FAIL');
    expect(res.reason).toBe('CONSUMER_CITATION_MISSING');
  });

  it('a genuine citation passes; the diff heuristic alone does not', () => {
    const cited = evaluateVentureOperatorContract({
      changedFiles: wiredDiff,
      enforceConsumerCitation: true,
      consumerEvidence: [{ consumer: 'lib/consumer.js:9', observed_read: 'select returned 3 rows', artifact: 'query_result' }],
    });
    expect(cited.verdict).not.toBe('FAIL');
    // Same circularity guard as the harness side: no metadata must NOT self-certify.
    expect(evaluateVentureOperatorContract({ changedFiles: wiredDiff, enforceConsumerCitation: true }).consumer_citation.present).toBe(false);
  });

  it('an unwired non-creator change still short-circuits', () => {
    const res = evaluateVentureOperatorContract({ changedFiles: [{ path: 'lib/p.js', added: "await supabase.from('t').insert(r)" }] });
    expect(res.wiring_detected).toBeUndefined();
  });
});
