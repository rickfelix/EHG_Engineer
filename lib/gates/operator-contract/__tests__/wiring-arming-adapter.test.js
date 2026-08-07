/**
 * SD-LEO-INFRA-VERIFY-CONSUMER-HANDOFF-001 — hole B AT THE ADAPTER, not at the pure function.
 *
 * WHY THIS FILE EXISTS, and it is the SD's own thesis turned on itself: my first pass tested
 * detectWiring() directly. A mutation that stopped resolveOperatorContract from CALLING it left
 * all 80 tests GREEN — the producer was verified, the consumer was not. That is the third
 * instance of unit-tests-the-function-but-not-the-wiring recorded today, and it reproduced
 * inside the fix for that exact class. These tests drive the ADAPTER.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { resolveOperatorContract } from '../harness-adapter.js';

const supabaseStub = { from: () => ({ select: async () => ({ data: [], error: null }) }) };
const NOW = new Date('2026-08-07T22:00:00Z');

const diffOf = (changedFiles) => ({ changedFiles, migrations: [], createdTables: [] });
const WIRED = diffOf([
  { path: 'lib/producer.js', added: "await supabase.from('feedback').insert(row)" },
  { path: 'lib/consumer.js', added: "const { data } = await supabase.from('feedback').select('*')" },
]);
const UNWIRED = diffOf([{ path: 'lib/producer.js', added: "await supabase.from('feedback').insert(row)" }]);

const CITATION = [{ consumer: 'lib/consumer.js:12', observed_read: 'select on feedback returned 14 rows', artifact: 'query_result' }];
const run = (diff, metadata = {}) => resolveOperatorContract({ sd: { metadata }, appPath: '.', supabase: supabaseStub, now: NOW, diff });

afterEach(() => { delete process.env.ENFORCE_CONSUMER_CITATION; });

describe('the ADAPTER actually arms on a wiring (mutation-visible)', () => {
  it('a wired non-creator change is EVALUATED, not short-circuited to a no-op pass', async () => {
    const res = await run(WIRED);
    // The single assertion a "stopped calling detectWiring" mutation cannot survive.
    expect(res.wiring_detected).toBe(true);
    expect(res.wiring_tables).toEqual(['feedback']);
  });

  it('an UNWIRED non-creator change still short-circuits — the blast radius stays bounded', async () => {
    const res = await run(UNWIRED);
    expect(res.wiring_detected).toBeUndefined();
  });

  it('carries the miss classes through to the verdict, so coverage is never implied to be complete', async () => {
    const res = await run(WIRED);
    expect(res.wiring_miss_classes).toContain('dynamic_dispatch');
  });
});

describe('warn-first — visible in BOTH states, blocking in only one', () => {
  it('DEFAULT (flag off): missing citation WARNS and does NOT block', async () => {
    const res = await run(WIRED);
    expect(res.consumer_citation.present).toBe(false);
    expect(res.consumer_citation.enforced).toBe(false);
    expect(res.verdict).not.toBe('FAIL');
    // Unenforced must never mean silent, or this ships as a decorative arm.
    expect(res.warnings.join(' ')).toMatch(/consumer-citation advisory/);
    expect(res.warnings.join(' ')).toMatch(/WIRING DETECTED/);
  });

  it('ENFORCED (flag on): the same input BLOCKS with a named reason', async () => {
    process.env.ENFORCE_CONSUMER_CITATION = '1';
    const res = await run(WIRED);
    expect(res.verdict).toBe('FAIL');
    expect(res.reason).toBe('CONSUMER_CITATION_MISSING');
  });

  it('a genuine citation PASSES in the enforced mode — two-sided, not just fail-happy', async () => {
    process.env.ENFORCE_CONSUMER_CITATION = '1';
    const res = await run(WIRED, { consumer_evidence: CITATION });
    expect(res.consumer_citation.present).toBe(true);
    expect(res.consumer_citation.accepted).toEqual(['lib/consumer.js:12']);
    expect(res.verdict).not.toBe('FAIL');
    expect(res.warnings.join(' ')).not.toMatch(/WIRING DETECTED/);
  });

  it('producer-side evidence is REJECTED even when supplied — the whole point of the arm', async () => {
    process.env.ENFORCE_CONSUMER_CITATION = '1';
    const res = await run(WIRED, {
      consumer_evidence: [{ consumer: 'lib/producer.js:1', observed_read: 'insert emitted 14 rows', artifact: 'emission_log' }],
    });
    expect(res.verdict).toBe('FAIL');
    expect(res.consumer_citation.issues.join(' ')).toMatch(/PRODUCER/i);
  });
});

describe('the verifier must not read the detector own signal', () => {
  it('a diff-scanned read-path does NOT satisfy the arm — only an operator citation does', async () => {
    process.env.ENFORCE_CONSUMER_CITATION = '1';
    // WIRED contains a real `.select()` on the wired table. validateConsumer's legacy heuristic
    // would call that a consumer and pass — but it is the SAME bit detectWiring used to declare
    // the wiring. If this ever passes with no metadata, verifier and detector have collapsed into
    // one signal and the arm self-certifies every wired SD it sees.
    const res = await run(WIRED);
    expect(res.verdict).toBe('FAIL');
    expect(res.consumer_citation.present).toBe(false);
  });
});

describe('fail-open contract preserved', () => {
  it('does not throw on a hostile diff — the adapter catch would turn a throw into passed:true', async () => {
    await expect(run(diffOf([{ path: null, added: null }]))).resolves.toBeTypeOf('object');
    await expect(run(diffOf([]))).resolves.toBeTypeOf('object');
  });
});
