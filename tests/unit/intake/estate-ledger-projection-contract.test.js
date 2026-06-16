/**
 * SD-LEO-INFRA-ESTATE-LEDGER-PROJECTION-001 (FR-3) — consumer-contract test.
 *
 * The 37 existing estate tests assert helper PURITY but never assert the END-STATE ledger contract,
 * which is why an all-NULL-triage_verdict ledger passed every gate. This test pins the contract the
 * drain's record step + the backfill must satisfy: a registered estate ledger row ends with a
 * non-NULL, queryable triage_verdict and intake_status='triaged', WITHOUT a terminal disposition
 * (so the honest backlog gauge is unaffected). Hermetic — mock client, no DB.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { recordVerdict } from '../../../lib/intake/conversion-ledger.js';
import { extractProjection } from '../../../scripts/intake/backfill-estate-ledger-projection.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const drainSrc = readFileSync(resolve(__dirname, '../../..', 'scripts/intake/drain-intake.mjs'), 'utf8');

// Minimal chainable supabase mock capturing the update patch + returning the post-update row.
function mockClient() {
  const calls = { table: null, update: null, eqId: null };
  const chain = {
    update(patch) { calls.update = patch; return chain; },
    eq(col, val) { if (col === 'id') calls.eqId = val; return chain; },
    select() { return chain; },
    async maybeSingle() { return { data: { id: calls.eqId, disposition: null, ...calls.update }, error: null }; },
  };
  return { calls, from(table) { calls.table = table; return chain; } };
}

describe('recordVerdict — the ledger self-describes without exiting the backlog (FR-2/FR-3 contract)', () => {
  it('CONTRACT: a recorded row carries a non-NULL triage_verdict + intake_status=triaged and NO disposition', async () => {
    const c = mockClient();
    const row = await recordVerdict('ledger-1', { triage_verdict: 'improvement-candidate' }, { client: c });
    expect(c.calls.table).toBe('conversion_ledger');
    expect(c.calls.eqId).toBe('ledger-1');
    expect(c.calls.update.triage_verdict).toBe('improvement-candidate');
    expect(c.calls.update.intake_status).toBe('triaged');
    expect('disposition' in c.calls.update).toBe(false); // never writes a terminal disposition
    // end-state row: queryable verdict present, still in the backlog (disposition NULL)
    expect(row.triage_verdict).toBeTruthy();
    expect(row.disposition).toBeNull();
  });

  it('carries dedup_score ONLY when supplied', async () => {
    const c1 = mockClient();
    await recordVerdict('l', { triage_verdict: 'drop' }, { client: c1 });
    expect('dedup_score' in c1.calls.update).toBe(false);
    const c2 = mockClient();
    await recordVerdict('l', { triage_verdict: 'drop', dedup_score: 0.42 }, { client: c2 });
    expect(c2.calls.update.dedup_score).toBe(0.42);
  });

  it('rejects a missing/empty triage_verdict and a missing id (a row MUST carry a queryable verdict)', async () => {
    const c = mockClient();
    await expect(recordVerdict('l', {}, { client: c })).rejects.toThrow(/triage_verdict/);
    await expect(recordVerdict('l', { triage_verdict: '' }, { client: c })).rejects.toThrow(/triage_verdict/);
    await expect(recordVerdict('', { triage_verdict: 'x' }, { client: c })).rejects.toThrow(/id is required/);
  });
});

describe('extractProjection — the backfill reads the source back-pointer + classification (FR-1)', () => {
  it('extracts {source_id, ledger_id, classification} from a drained source row raw_data', () => {
    const p = extractProjection({ id: 's1', raw_data: { conversion_ledger_id: 'L1', disposition_classification: 'improvement-candidate', compounding_score: 2 } });
    expect(p).toEqual({ source_id: 's1', ledger_id: 'L1', classification: 'improvement-candidate' });
  });

  it('returns null when the back-pointer OR classification is absent (un-drained / un-classified rows skipped)', () => {
    expect(extractProjection({ id: 's', raw_data: { disposition_classification: 'drop' } })).toBeNull(); // no ledger_id
    expect(extractProjection({ id: 's', raw_data: { conversion_ledger_id: 'L' } })).toBeNull();          // no classification
    expect(extractProjection({ id: 's', raw_data: null })).toBeNull();
    expect(extractProjection({ id: 's', raw_data: [] })).toBeNull();
    expect(extractProjection({ id: 's' })).toBeNull();
  });
});

// The drain's suppressed-promote RECORD step is an un-mocked IO call-site inside runEstateDrain, so
// the helper tests above can't exercise it. Pin the wiring by source-text (mirrors
// claim-validity-gate-sd-key-drift.test.js) so a refactor can't silently swap recordVerdict for
// setDisposition or pass the wrong verdict value — the exact caller-interaction class that hides from
// isolated green tests.
describe('drain wiring: the suppressed-promote path RECORDS a verdict on the ledger (FR-2 call-site)', () => {
  it('imports recordVerdict from the conversion-ledger lib', () => {
    expect(drainSrc).toMatch(/import\s*\{[^}]*\brecordVerdict\b[^}]*\}\s*from\s*['"][^'"]*conversion-ledger\.js['"]/);
  });
  it('the if(disposition){setDisposition} block has an else that calls recordVerdict(row.id, {triage_verdict: classification})', () => {
    expect(drainSrc).toMatch(/\}\s*else\s*\{[\s\S]*?recordVerdict\(\s*row\.id\s*,\s*\{\s*triage_verdict:\s*classification\s*\}/);
  });
  it('no recordVerdict call ever passes a disposition (the record step never exits the backlog gauge)', () => {
    // robust: scan every recordVerdict(...) call's arguments — none may carry a disposition key.
    for (const m of drainSrc.matchAll(/recordVerdict\(([\s\S]*?)\)\s*,\s*\{\s*client/g)) {
      expect(m[1]).not.toMatch(/disposition/);
    }
    // and at least one recordVerdict call exists (the FR-2 wiring is present)
    expect(drainSrc).toMatch(/recordVerdict\(/);
  });
});
