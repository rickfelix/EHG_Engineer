/**
 * SD-LEO-INFRA-VERIFY-CONSUMER-HANDOFF-001 — verify AT THE CONSUMER.
 *
 * Eleven founding instances in one day of producer-verified / consumer-broken. The strongest
 * (corpus #7) survived a RATIFIED completion: a Trend-Eyes alarm whose receipt is written daily
 * and read by nothing. INVOCATION_PATH_PROOF passed it because that gate asks whether the SWEEP
 * RAN, never whether the sweep's OUTPUT HAS A READER. Producer invoked, consumer absent.
 *
 * These tests were authored RED, before the production edit, and each must-FAIL fixture was
 * confirmed failing against the shipped predicate first — writing the PASS case first is how a
 * one-sided proof gets written.
 */
import { describe, it, expect } from 'vitest';
import { validateConsumer } from '../index.js';

/** Producer writes to `feedback`; consumer reads it. Shared by both sides of the two-sided pair. */
const PRODUCER_FILE = { path: 'lib/producer.js', added: "await supabase.from('feedback').insert({ kind: 'harness_backlog' })" };
const CONSUMER_FILE = { path: 'lib/consumer.js', added: "const { data } = await supabase.from('feedback').select('id, kind')" };
const WIRING_DIFF = [PRODUCER_FILE, CONSUMER_FILE];

const CITATION = [{ consumer: 'lib/consumer.js:31', observed_read: "select on feedback where kind='harness_backlog' returned 14 rows", artifact: 'query_result' }];

describe('hole A — an unrelated read must not satisfy the consumer check', () => {
  // MEASURED on the shipped code: this returned consumer_present:true with the evidence string
  // "contains a read-path acting on created output" — a FALSE CLAIM baked into the artifact,
  // worse than a bare boolean because a reviewer reads that line and believes it.
  it('a read-shaped call in an unrelated file does NOT prove consumption', () => {
    const res = validateConsumer({
      changedFiles: [{ path: 'scripts/totally-unrelated.js', added: "const { data } = await supabase.from('audit_log').select('id')" }],
      createdTables: [],
      consumerEvidence: CITATION,
    });
    expect(res.consumer_present).toBe(false);
  });

  it('a bare readX() call does NOT prove consumption', () => {
    const res = validateConsumer({
      changedFiles: [{ path: 'scripts/x.js', added: 'readConfig();' }],
      createdTables: [],
      consumerEvidence: CITATION,
    });
    expect(res.consumer_present).toBe(false);
  });

  it('no evidence string ever asserts "acting on created output" when nothing ties it to the output', () => {
    const res = validateConsumer({
      changedFiles: [{ path: 'scripts/x.js', added: "await supabase.from('other').select('id')" }],
      createdTables: [],
      consumerEvidence: CITATION,
    });
    expect(res.evidence.join(' ')).not.toMatch(/acting on created output/);
  });
});

describe('FR-3 two-sided — same diff, evidence is the only difference', () => {
  it('PASSES with a consumer citation naming the site and the observed read', () => {
    const res = validateConsumer({ changedFiles: WIRING_DIFF, createdTables: ['feedback'], consumerEvidence: CITATION });
    expect(res.consumer_present).toBe(true);
    // TS-1: details must record WHICH citation satisfied it, not merely that one did.
    expect(res.evidence.join(' ')).toContain('lib/consumer.js:31');
  });

  it('FAILS on producer-only evidence — evidence-shaped, but every noun is on the writing side', () => {
    const res = validateConsumer({
      changedFiles: WIRING_DIFF,
      createdTables: ['feedback'],
      consumerEvidence: [{ consumer: 'lib/producer.js:82', observed_read: 'insert returned no error; emitted 14 rows', artifact: 'emission_log' }],
      producerFiles: ['lib/producer.js'],
    });
    expect(res.consumer_present).toBe(false);
    expect(res.issues.join(' ')).toMatch(/producer/i);
  });

  it('FAILS on a citation with no file:line — a bare filename is not a citation', () => {
    const res = validateConsumer({
      changedFiles: WIRING_DIFF, createdTables: ['feedback'],
      consumerEvidence: [{ consumer: 'lib/consumer.js', observed_read: 'read the rows', artifact: 'query_result' }],
    });
    expect(res.consumer_present).toBe(false);
  });

  it('FAILS on a file:line with no observed read — a location is not an observation', () => {
    const res = validateConsumer({
      changedFiles: WIRING_DIFF, createdTables: ['feedback'],
      consumerEvidence: [{ consumer: 'lib/consumer.js:31' }],
    });
    expect(res.consumer_present).toBe(false);
  });

  it('FAILS on a boolean-only attestation — a boolean is a convention with extra steps', () => {
    const res = validateConsumer({ changedFiles: WIRING_DIFF, createdTables: ['feedback'], consumerEvidence: { consumer_verified: true } });
    expect(res.consumer_present).toBe(false);
  });
});

describe('TS-9 emptiness sweep — a presence check cannot be reused as an evidence check', () => {
  // real-callee-attestation.js accepts the literal "none" BY DESIGN (presence, never content).
  // That gate is working to contract; this one is a CONTENT check and must reject all of these.
  // NOTE `undefined` is deliberately NOT in this list, and the distinction is load-bearing:
  // 'none' is a caller ASSERTING there is no consumer — a content claim, and it must fail.
  // `undefined` is a caller not participating in the citation contract at all (legacy path).
  // Collapsing the two would either break every existing caller or silently accept an
  // assertion of absence. The legacy path is covered separately below, and must be LOUD.
  const EMPTY_VALUES = ['none', 'None', 'NONE', ' none ', 'n/a', 'TBD', 'see above', 'verified', '', '   ', null, true, 1, {}, [], ['none']];
  for (const v of EMPTY_VALUES) {
    it(`rejects ${JSON.stringify(v)} as consumer evidence`, () => {
      const res = validateConsumer({ changedFiles: WIRING_DIFF, createdTables: ['feedback'], consumerEvidence: v });
      expect(res.consumer_present).toBe(false);
    });
  }

  it('rejects an EMPTY array — "the field exists" is the check that let none through next door', () => {
    expect(validateConsumer({ changedFiles: WIRING_DIFF, createdTables: ['feedback'], consumerEvidence: [] }).consumer_present).toBe(false);
  });
});

describe('legacy path — absent evidence is permitted but never SILENT', () => {
  it('omitting consumerEvidence keeps the pre-existing diff-only contract', () => {
    const res = validateConsumer({ changedFiles: WIRING_DIFF, createdTables: ['feedback'] });
    expect(res.consumer_present).toBe(true);
    expect(res.citation_supplied).toBe(false);
  });

  it('the absence is REPORTED, so a legacy pass is distinguishable from a cited one', () => {
    // Without this, "no citation supplied" and "citation verified" look identical to a reader —
    // which is the silent-fallback class this whole SD exists to remove.
    const legacy = validateConsumer({ changedFiles: WIRING_DIFF, createdTables: ['feedback'] });
    const cited = validateConsumer({ changedFiles: WIRING_DIFF, createdTables: ['feedback'], consumerEvidence: CITATION });
    expect(legacy.citation_supplied).toBe(false);
    expect(cited.citation_supplied).toBe(true);
    expect(cited.accepted_citations).toEqual(['lib/consumer.js:31']);
  });

  it('hole A is closed even on the legacy path — no created output means no consumption claim', () => {
    const res = validateConsumer({ changedFiles: [{ path: 'scripts/x.js', added: 'readConfig();' }], createdTables: [] });
    expect(res.consumer_present).toBe(false);
    expect(res.issues.join(' ')).toMatch(/hole A/);
  });
});

describe('totality — a partial classifier fails OPEN through the adapter catch', () => {
  // harness-adapter.js:190-198 turns any throw into passed:true, so a throw here is a SILENT PASS.
  it('never throws on hostile input', () => {
    const hostile = [null, undefined, 42, 'str', { consumer: 42 }, [{ consumer: null, observed_read: {} }], [[]], [{ toString() { throw new Error('boom'); } }]];
    for (const h of hostile) {
      expect(() => validateConsumer({ changedFiles: WIRING_DIFF, createdTables: ['feedback'], consumerEvidence: h })).not.toThrow();
    }
  });

  it('never throws on malformed changedFiles', () => {
    for (const cf of [null, undefined, 'nope', [null], [{ path: null, added: 42 }]]) {
      expect(() => validateConsumer({ changedFiles: cf, createdTables: ['feedback'], consumerEvidence: CITATION })).not.toThrow();
    }
  });
});

describe('backward compatibility — the pre-existing contract still holds', () => {
  it('still ties a consumer to a created table when evidence is supplied', () => {
    const res = validateConsumer({ changedFiles: WIRING_DIFF, createdTables: ['feedback'], consumerEvidence: CITATION });
    expect(res.consumer_present).toBe(true);
  });

  it('a test file alone is still not a consumer', () => {
    const res = validateConsumer({
      changedFiles: [{ path: 'tests/unit/x.test.js', added: "await supabase.from('feedback').select('id')" }],
      createdTables: ['feedback'],
      consumerEvidence: [{ consumer: 'tests/unit/x.test.js:5', observed_read: 'read rows', artifact: 'query_result' }],
    });
    expect(res.consumer_present).toBe(false);
  });
});
