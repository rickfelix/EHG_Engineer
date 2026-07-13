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
    const supabase = { from: () => ({ upsert: async (row) => { upserted = row; return { error: null }; } }) };
    const r = await registerOperatorContractCadence(supabase, { expectedIntervalSeconds: 3600 });
    expect(r.ok).toBe(true);
    expect(upserted.process_key).toMatch(/operator-contract-gate/);
    expect(upserted.currently_expected_active).toBe(true);
    expect(upserted.expected_interval_seconds).toBe(3600);
    expect(OPERATOR_CONTRACT_PROCESS_KEY).toBe('operator-contract-gate');
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
