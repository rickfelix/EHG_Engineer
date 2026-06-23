/**
 * SD-REFILL-00A3H5FN — guard that the DECOMPOSE-WEAKEST-LAYER classify-each-capability refinement
 * (Adam board verdict 2026-06-16) survives in the generated role docs. The rule lives in the
 * leo_protocol_sections DB SSOT (id=604 adam_role_contract / id=605 coordinator_role_contract) and
 * is rendered into CLAUDE_ADAM.md / CLAUDE_COORDINATOR.md by generate-claude-md-from-db.js. This
 * test fails if a future regen drops it (or the section is reverted), so the fleet keeps classifying
 * weak capabilities (leaf / foundation-contract / already-built-stale-KR / mis-bucketed) before
 * blindly sourcing one design SD per capability.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('SD-REFILL-00A3H5FN: DECOMPOSE-WEAKEST-LAYER classify-each-capability rule', () => {
  const adam = read('CLAUDE_ADAM.md');
  const coord = read('CLAUDE_COORDINATOR.md');

  it('CLAUDE_ADAM.md carries the CLASSIFY-each-capability rule', () => {
    expect(adam).toMatch(/CLASSIFY each weak capability BEFORE sourcing/i);
    expect(adam).toMatch(/board-of-directors verdict 2026-06-16/i);
  });

  it('the rule lists all four capability classifications', () => {
    // (a) leaf, (b) foundation/data-contract, (c) already-built-stale-KR, (d) mis-bucketed
    expect(adam).toMatch(/genuine leaf/i);
    expect(adam).toMatch(/foundation \/ data-contract/i);
    expect(adam).toMatch(/already-built but reading low ONLY from a STALE/i);
    expect(adam).toMatch(/KR RE-MEASURE/i);
    expect(adam).toMatch(/mis-bucketed/i);
  });

  it('CLAUDE_COORDINATOR.md requires verifying the per-capability gauge gap is real', () => {
    expect(coord).toMatch(/VERIFY each weak-layer capability.{0,4}s gauge gap is REAL/i);
    expect(coord).toMatch(/stale\/manual KR needs a governed KR re-measure/i);
  });
});
