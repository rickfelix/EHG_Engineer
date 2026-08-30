/**
 * QF-20260830-245 — contract-to-code parity fixture.
 *
 * CLAUDE_ADAM.md sec 3b (leo_protocol_sections id=601) enumerates the delegated-apply in-scope
 * forms in prose: "provably-additive DDL (CREATE TABLE/INDEX, add nullable column, CHECK-widen)
 * and governed data-row INSERTs into allow-listed tables." Nothing previously tested that
 * enumeration against the classifier — the SPECIMEN (CHECK-widen) was claimed in scope and
 * rejected by the code for two months until this QF. One canonical example per named form,
 * fed through isDelegatableForApply, must be delegatable — or the contract sentence is a lie.
 */
import { describe, it, expect } from 'vitest';
import { isDelegatableForApply } from '../../lib/migration/adam-delegated-apply.js';

// One canonical example per CLAUDE_ADAM.md sec 3b in-scope form.
const IN_SCOPE_FORMS = {
  'CREATE TABLE': 'CREATE TABLE IF NOT EXISTS parity_fixture_t (id uuid primary key);',
  'CREATE INDEX': 'CREATE INDEX IF NOT EXISTS parity_fixture_idx ON parity_fixture_t (id);',
  'add nullable column': 'ALTER TABLE parity_fixture_t ADD COLUMN IF NOT EXISTS note text;',
  // The QF-20260830-245 specimen, verbatim shape from
  // database/migrations/20260623_competitive_baselines_epistemic_tag_add_observed.sql.
  'CHECK-widen': `
    ALTER TABLE competitive_baselines
      DROP CONSTRAINT IF EXISTS competitive_baselines_epistemic_tag_check;
    ALTER TABLE competitive_baselines
      ADD CONSTRAINT competitive_baselines_epistemic_tag_check
      CHECK (epistemic_tag = ANY (ARRAY['FACT'::text, 'ASSUMPTION'::text, 'SIMULATION'::text, 'UNKNOWN'::text, 'OBSERVED'::text]));
  `,
  'governed data-row INSERT': 'INSERT INTO vision_ladder_criteria (id, label) VALUES (1, \'parity fixture\');',
};

describe('QF-20260830-245: CLAUDE_ADAM.md sec 3b contract-to-code parity', () => {
  for (const [form, sql] of Object.entries(IN_SCOPE_FORMS)) {
    it(`"${form}" — claimed in-scope by the contract, must be delegatable`, () => {
      const verdict = isDelegatableForApply(sql);
      expect(verdict.delegatable, `contract claims "${form}" in scope; code says: ${verdict.reason}`).toBe(true);
    });
  }

  it('[TWO-SIDED] a form NOT named in sec 3b (DROP COLUMN) stays chairman-only', () => {
    const verdict = isDelegatableForApply('ALTER TABLE t DROP COLUMN c;');
    expect(verdict.delegatable).toBe(false);
  });

  it('[TWO-SIDED] a CHECK-widen with a non-literal array element is rejected, not silently widened', () => {
    const verdict = isDelegatableForApply(
      `ALTER TABLE t DROP CONSTRAINT IF EXISTS t_c;
       ALTER TABLE t ADD CONSTRAINT t_c CHECK (c = ANY (ARRAY[some_function()]));`
    );
    expect(verdict.delegatable).toBe(false);
  });
});
