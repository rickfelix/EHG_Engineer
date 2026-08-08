/**
 * SEC-3 / SEC-4 — SECURITY row 778f9a78.
 * SD-LEO-INFRA-VERIFY-CONSUMER-HANDOFF-001
 *
 * The producer refusal is this gate's CENTRAL claim: producer-side proof that the write
 * happened is exactly what it exists to reject. It was an exact string compare, so
 * `lib/producer.js:9` blocked while SIX equivalent spellings of the same file passed — measured
 * at gate level under ENFORCE=1 as passed:true "consumer citation verified". A refusal that can
 * be spelled around is the "check a caller can satisfy without changing the harm" shape this SD
 * exists to abolish; shipping it inside this SD would have been self-refuting.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { validateConsumer } from '../index.js';
import { createOperatorContractGate } from '../harness-adapter.js';

const PRODUCER = 'lib/producer.js';
const files = [{ path: PRODUCER, added: "await supabase.from('t').insert(row)" }];
const check = (consumer) => validateConsumer({
  changedFiles: files, createdTables: ['t'], producerFiles: [PRODUCER], allowOutOfDiffConsumer: true,
  consumerEvidence: [{ consumer, observed_read: 'claims to read t', artifact: 'query_result' }],
});

describe('SEC-3 — every spelling of the producer is refused', () => {
  it.each([
    ['exact (already blocked)', 'lib/producer.js:9'],
    ['dot-slash prefix', './lib/producer.js:9'],
    ['interior dot segment', 'lib/./producer.js:9'],
    ['doubled separator', 'lib//producer.js:9'],
    ['upper case (same file on Windows)', 'LIB/PRODUCER.JS:9'],
    ['backslash separator', 'lib\\producer.js:9'],
    ['parent traversal', 'lib/x/../producer.js:9'],
  ])('%s is rejected as PRODUCER-side', (_label, consumer) => {
    const res = check(consumer);
    expect(res.consumer_present).toBe(false);
    expect(res.issues.join(' ')).toMatch(/PRODUCER/i);
  });

  it('a genuinely different file is still ACCEPTED — the guard is two-sided, not just strict', () => {
    // Without this, "reject everything" would pass the suite above and break the gate.
    const res = check('lib/consumer.js:12');
    expect(res.consumer_present).toBe(true);
  });

  it('a file whose name merely CONTAINS the producer name is not refused', () => {
    expect(check('lib/producer-helper.js:3').consumer_present).toBe(true);
  });

  it('test-file refusal also survives the same spellings', () => {
    for (const c of ['./tests/unit/x.js:4', 'tests\\unit\\x.js:4', 'lib/../tests/unit/x.js:4']) {
      expect(check(c).issues.join(' '), c).toMatch(/test file/i);
    }
  });
});

describe('SEC-4 — enforcement fails CLOSED; warn-first still fails open', () => {
  const supabase = { from: () => ({ select: async () => ({ data: [], error: null }) }) };
  const sd = { sd_key: 'SD-TEST-001', metadata: {} };
  const brokenRepo = 'C:/definitely/not/a/repo/xyz';
  afterEach(() => { delete process.env.ENFORCE_CONSUMER_CITATION; });

  it('WARN-FIRST: a git error passes with a warning — never false-block the shared pipeline', async () => {
    const res = await createOperatorContractGate(supabase, sd, brokenRepo).validator({ sd });
    expect(res.passed).toBe(true);
    expect(res.details.fail_open).toBe(true);
  });

  it('ENFORCED: the same error BLOCKS — a missing ref must not erase an enforced block', async () => {
    // No malice needed: `git diff origin/main...HEAD` throws whenever the ref is absent, so a
    // shallow clone, a --branch clone, or an unfetched worktree used to convert a block to a pass.
    process.env.ENFORCE_CONSUMER_CITATION = '1';
    const res = await createOperatorContractGate(supabase, sd, brokenRepo).validator({ sd });
    expect(res.passed).toBe(false);
    expect(res.issues).toContain('OPERATOR_CONTRACT_UNEVALUABLE');
    expect(res.details.fail_open).toBe(false);
  });
});
