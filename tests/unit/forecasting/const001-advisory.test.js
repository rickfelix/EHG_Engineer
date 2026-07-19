// SD-LEO-FEAT-FORECAST-LEDGER-001 — FR-6 / CONST-001 negative test. Proves a forecast row can
// NEVER flip a gate verdict: even MAXIMALLY-CONTRADICTING (adversarial) forecasts leave the full
// serialized verdict byte-identical. Fully mocked (no '@supabase/supabase-js' import).
import { describe, it, expect } from 'vitest';
import { attachForecasts, buildGateBrief } from '../../../lib/forecasting/gate-attach.js';

function fakeSupabase(rows = []) {
  function builder() {
    const filters = [];
    const exec = () => Promise.resolve({ data: rows.filter((r) => filters.every(([c, v]) => r[c] === v)), error: null });
    const b = { select: () => b, eq: (c, v) => { filters.push([c, v]); return b; }, then: (res, rej) => exec().then(res, rej) };
    return b;
  }
  return { from: () => builder() };
}

// Adversarial forecasts: p=0.99 (screams PASS) AND p=0.01 (screams FAIL) — maximally at odds with
// whatever the gate decided. If a scoring leak existed, THIS is what would expose it.
const adversarial = (status) => ([
  { id: 'a1', question: 'adversarial-high', p: 0.99, status, resolved_outcome: status === 'resolved' ? false : null, brier_score: status === 'resolved' ? 0.98 : null, question_class: 'kill-gate' },
  { id: 'a2', question: 'adversarial-low', p: 0.01, status, resolved_outcome: status === 'resolved' ? true : null, brier_score: status === 'resolved' ? 0.98 : null, question_class: 'kill-gate' },
]);

describe('CONST-001: a forecast can never flip a gate verdict', () => {
  for (const stage of [3, 5, 16]) {
    for (const status of ['open', 'resolved']) {
      it(`S${stage} × ${status}: verdict byte-identical WITH adversarial forecast, and the forecast DID attach`, async () => {
        const verdict = { stage, verdict: 'FAIL', score: 42, subscores: { a: 10, b: 32 }, reasons: ['insufficient traction'] };
        const attach = await attachForecasts({ supabase: fakeSupabase(adversarial(status)) }, { stage, questionClass: 'kill-gate' });
        const withF = buildGateBrief(verdict, attach);
        const withoutF = buildGateBrief(verdict, { lines: [] });
        // (1) full serialized verdict is byte-identical with vs without the forecast (advisory-only)
        expect(JSON.stringify(withF.verdict)).toBe(JSON.stringify(withoutF.verdict));
        expect(JSON.stringify(withF.verdict)).toBe(JSON.stringify(verdict));
        // (2) the forecast ACTUALLY attached (not "silently nothing") — the test can discriminate
        expect(withF.advisory_evidence.length).toBe(2);
        expect(withoutF.advisory_evidence.length).toBe(0);
        expect(withF.advisory_weight).toBe('advisory');
      });
    }
  }

  it('mutating the returned brief.verdict does not mutate the source verdict (structuredClone isolation)', () => {
    const verdict = { verdict: 'PASS', score: 88 };
    const brief = buildGateBrief(verdict, { lines: [{ id: 'x', weight: 'advisory' }] });
    brief.verdict.score = 0;
    brief.verdict.verdict = 'FAIL';
    expect(verdict.score).toBe(88);
    expect(verdict.verdict).toBe('PASS');
  });
});
