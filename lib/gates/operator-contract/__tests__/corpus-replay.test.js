/**
 * FR-5 REPLAYS — would-have-caught demonstrations against the founding corpus.
 * SD-LEO-INFRA-VERIFY-CONSUMER-HANDOFF-001
 *
 * The corpus is materialized as 12 structured records at
 * strategic_directives_v2.metadata.founding_corpus_records (9 in-class, 3 out-of-class).
 * The PRD says eleven; the evidence says twelve and the reconciliation is recorded on the SD.
 *
 * HONEST RECALL. These replays cover 3 of the 9 IN-CLASS instances — never "3 of 3". The six
 * in-SD instances (1-5) are function-level verification gaps, NOT table wirings, and this arm
 * does not detect them; that is a real coverage limit, stated here rather than hidden behind a
 * flattering ratio. The out-of-class three (two turn-behaviour lapses, one environment
 * staleness) are unreplayable by construction.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { resolveOperatorContract } from '../harness-adapter.js';

const supabase = { from: () => ({ select: async () => ({ data: [], error: null }) }) };
const diffOf = (changedFiles) => ({ changedFiles, migrations: [], createdTables: [] });
const run = (diff, metadata = {}) => resolveOperatorContract({ sd: { metadata }, appPath: '.', supabase, diff });

afterEach(() => { delete process.env.ENFORCE_CONSUMER_CITATION; });

/** Recall is reported against the IN-CLASS subset, with the out-of-class count on the same line. */
const CORPUS = { total: 12, in_class: 9, out_of_class: 3 };
const REPLAYED = [12, 8, 10];

describe(`FR-5 replay — ${REPLAYED.length} of ${CORPUS.in_class} IN-CLASS (${CORPUS.out_of_class} out-of-class, not replayable)`, () => {
  it('n=12 TREND-EYES UNWIRED ALARM — the hard-end case, required by FR-5', async () => {
    // The only instance to survive a RATIFIED completion: handoffs at 93/94/87/92/96, a
    // 100-quality retro, and a six-flag interrogation. INVOCATION_PATH_PROOF passed because it
    // asks whether the producer RAN; nothing asked whether the output had a READER.
    process.env.ENFORCE_CONSUMER_CITATION = '1';
    const res = await run(diffOf([
      { path: 'scripts/trend-eyes-sweep.mjs', added: "await supabase.from('trend_eyes_receipts').insert(receipt)" },
    ]));
    expect(res.verdict).toBe('FAIL');
    expect(res.reason).toBe('CONSUMER_CITATION_MISSING');
    expect(res.orphaned_producers).toEqual(['trend_eyes_receipts']);
  });

  it('n=12 — the PRODUCER-SIDE artifact that actually fooled the humans is rejected', async () => {
    // The SECURITY artifact literally contained the words ZERO IMPORTS and no human converted
    // it. Producer-side evidence reads like proof; this is the assertion that refuses it.
    process.env.ENFORCE_CONSUMER_CITATION = '1';
    const res = await run(
      diffOf([{ path: 'scripts/trend-eyes-sweep.mjs', added: "await supabase.from('trend_eyes_receipts').insert(receipt)" }]),
      { consumer_evidence: [{ consumer: 'scripts/trend-eyes-sweep.mjs:12', observed_read: 'the sweep ran and wrote the receipt', artifact: 'run_log' }] },
    );
    expect(res.verdict).toBe('FAIL');
    expect(res.consumer_citation.issues.join(' ')).toMatch(/PRODUCER/i);
  });

  it('n=12 — naming a REAL out-of-diff reader clears it (the arm is satisfiable)', async () => {
    // An orphan's reader lives outside the diff by definition. A gate nobody can pass gets
    // bypassed, not obeyed — so this direction has to work.
    process.env.ENFORCE_CONSUMER_CITATION = '1';
    const res = await run(
      diffOf([{ path: 'scripts/trend-eyes-sweep.mjs', added: "await supabase.from('trend_eyes_receipts').insert(receipt)" }]),
      { consumer_evidence: [{ consumer: 'lib/chairman/daily-review/panel.js:88', observed_read: 'reads trend_eyes_receipts; returned 14 rows', artifact: 'query_result' }] },
    );
    expect(res.verdict).not.toBe('FAIL');
    expect(res.consumer_citation.accepted).toEqual(['lib/chairman/daily-review/panel.js:88']);
    // Out-of-diff acceptance must stay visibly marked, or it launders an operator assertion
    // into something that looks diff-verified.
    expect(res.consumer_citation.present).toBe(true);
  });

  it('n=8 PRODUCER NO-OP AT ITS ONLY CALLER — drive_reports stayed at ZERO rows', async () => {
    // drive-report-produce.mjs exited 0 with no output; the Windows file:// guard meant main()
    // never ran, and the cron dispatch went GREEN while producing nothing.
    process.env.ENFORCE_CONSUMER_CITATION = '1';
    const res = await run(diffOf([
      { path: 'scripts/drive-report-produce.mjs', added: "await supabase.from('drive_reports').insert(report)" },
    ]));
    expect(res.verdict).toBe('FAIL');
    expect(res.orphaned_producers).toEqual(['drive_reports']);
  });

  it('n=10 THE REAP VERIFICATION — a reaper whose main() never fires looks like a clean reap', async () => {
    process.env.ENFORCE_CONSUMER_CITATION = '1';
    const res = await run(diffOf([
      { path: 'scripts/reap-e2e-liveness-fixtures.mjs', added: "await supabase.from('reap_receipts').insert({ deleted })" },
    ]));
    expect(res.verdict).toBe('FAIL');
    expect(res.orphaned_producers).toEqual(['reap_receipts']);
  });
});

describe('FR-5 — coverage limits stated, never implied away', () => {
  it('IN-CLASS BUT NOT DETECTED: instances 1-5 are function-level gaps, not table wirings', async () => {
    // Instance 2: "Math.min clamp removed but proven only at the probe, never through the
    // resolver." A diff heuristic COULD catch this in principle (which is why FR-5 classes it
    // in-class), but THIS arm reads table reads/writes and sees nothing here. Asserting the miss
    // keeps the recall number honest: 3 of 9, not 9 of 9.
    process.env.ENFORCE_CONSUMER_CITATION = '1';
    const res = await run(diffOf([
      { path: 'lib/probe/clamp.js', added: 'const capped = value; // Math.min removed' },
      { path: 'lib/probe/resolver.js', added: 'return resolve(capped);' },
    ]));
    expect(res.verdict).not.toBe('FAIL');
    expect(res.orphaned_producers).toBeUndefined();
  });

  it('the replay set covers exactly 3 of 9 in-class, and the count is asserted not narrated', () => {
    // A prose claim of "3 of 9" drifts the moment someone adds a replay. This binds it.
    expect(REPLAYED).toHaveLength(3);
    expect(CORPUS.in_class + CORPUS.out_of_class).toBe(CORPUS.total);
    expect(REPLAYED.length).toBeLessThan(CORPUS.in_class);
  });
});
