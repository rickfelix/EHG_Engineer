/**
 * SD-LEO-INFRA-VERIFY-CONSUMER-HANDOFF-001, HOLE B — arming on a producer->consumer WIRING.
 *
 * resolveOperatorContract short-circuited to a no-op pass whenever detectCreator() did not fire,
 * so a change that CREATES nothing was never evaluated — and that is this SD's entire target
 * class. Corpus #7 is exactly that shape: an EXISTING sweep writing an EXISTING receipt that
 * nothing reads. It survived a ratified completion because every gate asked whether the producer
 * RAN, never whether the output had a READER.
 */
import { describe, it, expect } from 'vitest';
import { detectWiring } from '../index.js';

const write = (path, table) => ({ path, added: `await supabase.from('${table}').insert(row)` });
const read = (path, table) => ({ path, added: `const { data } = await supabase.from('${table}').select('*')` });

describe('hole B — a wiring with no new table is DETECTED', () => {
  it('CORPUS #7 SHAPE: existing producer writes, nothing reads -> NOT wired', () => {
    // The receipt is written daily and read by nothing. detectWiring reports no wiring because
    // there is no reader — which is precisely the finding, not a miss: the arm downstream then
    // has nothing to pair, and the absent consumer is the defect.
    const res = detectWiring({ changedFiles: [write('scripts/trend-eyes-sweep.mjs', 'trend_eyes_receipts')] });
    expect(res.wired).toBe(false);
  });

  it('an existing producer wired to an existing consumer IS detected (the class that was never evaluated)', () => {
    const res = detectWiring({ changedFiles: [write('lib/producer.js', 'feedback'), read('lib/consumer.js', 'feedback')] });
    expect(res.wired).toBe(true);
    expect(res.tables).toEqual(['feedback']);
    expect(res.producerFiles).toEqual(['lib/producer.js']);
    expect(res.consumerFiles).toEqual(['lib/consumer.js']);
  });

  it('a write and a read of DIFFERENT tables is not a wiring — no false pairing', () => {
    const res = detectWiring({ changedFiles: [write('lib/a.js', 'table_a'), read('lib/b.js', 'table_b')] });
    expect(res.wired).toBe(false);
  });

  it('test files never count as either side', () => {
    const res = detectWiring({ changedFiles: [write('lib/p.js', 'feedback'), read('tests/unit/x.test.js', 'feedback')] });
    expect(res.wired).toBe(false);
  });

  it('a single file that both writes and reads the same table counts as wired', () => {
    const res = detectWiring({ changedFiles: [{ path: 'lib/both.js', added: "await supabase.from('t').insert(r);\nconst { data } = await supabase.from('t').select('*')" }] });
    expect(res.wired).toBe(true);
  });
});

describe('FR-4 — miss classes are declared, never claimed complete', () => {
  it('every result carries its miss classes, so `wired:false` is not read as "verified unwired"', () => {
    const res = detectWiring({ changedFiles: [] });
    expect(res.miss_classes).toEqual(
      expect.arrayContaining(['dynamic_dispatch', 'config_indirection', 'cross_repo_consumer', 'prose_only_wiring', 'aliased_value']),
    );
  });

  it('a KNOWN miss: a consumer reached by dynamic dispatch is invisible to a static diff scan', () => {
    // Documents the limit rather than pretending coverage. If this ever starts detecting, the
    // heuristic improved and the miss class should be removed deliberately.
    const res = detectWiring({
      changedFiles: [write('lib/p.js', 'feedback'), { path: 'lib/c.js', added: "const t = cfg.table; const { data } = await supabase.from(t).select('*')" }],
    });
    expect(res.wired).toBe(false);
    expect(res.miss_classes).toContain('dynamic_dispatch');
  });
});

describe('totality — a throw here fails OPEN through the adapter catch', () => {
  it('never throws on hostile input', () => {
    for (const cf of [null, undefined, 'nope', [null], [{ path: 42, added: {} }], [{}], [[]]]) {
      expect(() => detectWiring({ changedFiles: cf })).not.toThrow();
    }
  });
});
