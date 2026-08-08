/**
 * D1/D2 — the GATE FACTORY output layer, which had NO behavioural coverage at all.
 * SD-LEO-INFRA-VERIFY-CONSUMER-HANDOFF-001
 *
 * TESTING (row bc7f73bc) found 11 of 19 mutants surviving, and the cluster that mattered was
 * here: createOperatorContractGate OVERWROTE `warnings` with the waived-missing list, so every
 * advisory the arm produced was built and discarded. The gate returned warnings:[] and reason
 * NOT_APPLICABLE for a diff it had evaluated and found an orphan in — the arm was invisible in
 * its own shipped default, and this SD's own branch would have reported NOT_APPLICABLE.
 *
 * The only prior test of this layer asserted toHaveProperty('passed'). That is a shape check;
 * it cannot see a channel being dropped. These drive the REGISTERED entry point.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createOperatorContractGate } from '../harness-adapter.js';
const supabase = { from: () => ({ select: async () => ({ data: [], error: null }), insert: async () => ({ error: null }) }) };
const sd = { sd_key: 'SD-TEST-001', metadata: {} };

/** Corpus #7 through the REAL gate: a producer whose output nothing reads. */
const ORPHAN_DIFF = {
  changedFiles: [{ path: 'scripts/trend-eyes-sweep.mjs', added: "await supabase.from('trend_eyes_receipts').insert(receipt)" }],
  migrations: [], createdTables: [],
};

const gateWith = (diff) => createOperatorContractGate(supabase, sd, '.', { diff });
const UNARMED = { changedFiles: [{ path: 'lib/util.js', added: 'export const noop = () => {};' }], migrations: [], createdTables: [] };
afterEach(() => { delete process.env.ENFORCE_CONSUMER_CITATION; });

describe('D1 — the advisory REACHES the caller (kills mutants C and D)', () => {
  it('an armed diff surfaces the advisory in warnings, not just in a discarded local', async () => {
    const res = await gateWith(ORPHAN_DIFF).validator({ sd });
    // The single assertion that would have caught the dropped channel.
    expect(res.warnings.join(' ')).toMatch(/ORPHANED PRODUCER/);
    expect(res.warnings.join(' ')).toMatch(/trend_eyes_receipts/);
  });

  it('details carry the evaluation, so a reviewer can see WHAT was evaluated', async () => {
    const res = await gateWith(ORPHAN_DIFF).validator({ sd });
    expect(res.details.wiring_detected).toBe(true);
    expect(res.details.orphaned_producers).toEqual(['trend_eyes_receipts']);
    expect(res.details.consumer_citation.present).toBe(false);
    expect(res.details.wiring_miss_classes).toContain('rpc_indirection');
  });

  it('does NOT report NOT_APPLICABLE for a diff it actually evaluated', async () => {
    // Reporting "not applicable" about work you did is a false statement, not a terse one.
    const res = await gateWith(ORPHAN_DIFF).validator({ sd });
    expect(res.details.reason).not.toMatch(/NOT_APPLICABLE/);
    expect(res.details.reason).toMatch(/EVALUATED/);
  });

  it('still passes (warn-first) — visibility is not blocking', async () => {
    const res = await gateWith(ORPHAN_DIFF).validator({ sd });
    expect(res.passed).toBe(true);
  });

  it('a genuinely unarmed diff stays quiet — no advisory noise on every gate run', async () => {
    const res = await gateWith(UNARMED).validator({ sd });
    expect(res.warnings).toEqual([]);
    expect(res.details.wiring_detected).toBeFalsy();
  });
});

describe('D2 — the block names a remedy that can actually resolve it', () => {
  it('a CONSUMER_CITATION_MISSING block names metadata.consumer_evidence', async () => {
    // The generic text says "ship the OPERATOR TRIPLE / attach a waiver". Neither resolves this
    // failure. A gate that names the wrong remedy trains people to bypass it.
    process.env.ENFORCE_CONSUMER_CITATION = '1';
    const res = await gateWith(ORPHAN_DIFF).validator({ sd });
    expect(res.passed).toBe(false);
    expect(res.issues).toContain('CONSUMER_CITATION_MISSING');
    expect(res.details.remedy_field).toBe('metadata.consumer_evidence');
  });

  it('the blocked result still carries the advisory and the evaluated tables', async () => {
    process.env.ENFORCE_CONSUMER_CITATION = '1';
    const res = await gateWith(ORPHAN_DIFF).validator({ sd });
    expect(res.details.orphaned_producers).toEqual(['trend_eyes_receipts']);
    expect(res.warnings.join(' ')).toMatch(/ORPHANED PRODUCER/);
  });
});

describe('fail-open still holds through the new branches', () => {
  it('an execution error resolves to passed:true with a warning, never a false block', async () => {
    process.env.ENFORCE_CONSUMER_CITATION = '1';
    // No injected diff + a non-git path => collectSdDiff throws for real, exercising the catch.
    const res = await createOperatorContractGate(supabase, sd, 'C:/definitely/not/a/repo/xyz').validator({ sd });
    expect(res.passed).toBe(true);
    expect(res.warnings.join(' ')).toMatch(/fail-open/);
  });
});
