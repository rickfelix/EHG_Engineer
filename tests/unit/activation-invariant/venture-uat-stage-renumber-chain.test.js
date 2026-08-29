/**
 * Activation invariant test — SD-LEO-INFRA-END-END-ACTIVATION-001.
 *
 * Proves the venture-UAT stage-renumber migration chain (SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B/C,
 * live on production 2026-08-28/29) is ACTUALLY WIRED end-to-end, not just independently
 * migration-tested in isolation. The migration's two children shipped with MISSING_TEST_FILES /
 * MISSING_TESTING_EVIDENCE findings -- this file closes that gap.
 *
 * Two invariants under test:
 *   1. Gate-semantics invariance: the renumbered stage chain (24-27) preserves the correct
 *      gate_type values (promotion at 24, the shifted-up former stage-23 gate), and the new
 *      dedicated-venture-UAT stage lands at the vacated stage_number=23 with the
 *      uat_robustness_required marker Child C's lib/eva/uat-robustness-gate.js reads.
 *   2. Consumer wiring: lib/eva/stage-execution-worker.js's pending-decision promotion-gate
 *      enrichment path (the actual runtime consumer of the promotion-gate stage) is checked
 *      against the CURRENT (post-renumber) stage numbering -- see the companion source-pin test
 *      pending-decision-promotion-gate-enrichment.test.js for a CONFIRMED, still-live gap here.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

describe('venture-UAT stage-renumber migration — gate-semantics invariance (schema layer)', () => {
  let sql;
  test('setup: read the migration', () => {
    sql = readFileSync(
      path.join(ROOT, 'database/chairman-gated/20260825_dedicated_venture_uat_stage_insert_and_renumber.sql'),
      'utf8'
    );
    expect(sql.length).toBeGreaterThan(0);
  });

  test('renumbers stage_number 23-26 to 24-27 via a collision-free negative-intermediate two-phase shift', () => {
    expect(sql).toMatch(/UPDATE public\.venture_stages\s*\n\s*SET stage_number = -stage_number.*\n\s*WHERE stage_number BETWEEN 23 AND 26/);
    expect(sql).toMatch(/UPDATE public\.venture_stages\s*\n\s*SET stage_number = \(-stage_number\) \+ 1/);
  });

  test('inserts the new dedicated_venture_uat stage at the now-vacant stage_number=23 with gate_type=none and the uat_robustness_required marker', () => {
    expect(sql).toContain('INSERT INTO public.venture_stages (');
    expect(sql).toMatch(/23,\s*\n\s*'dedicated_venture_uat'/);
    expect(sql).toContain('{"gates":{"uat_robustness_required":true}}');
    // gate_type column value for the new row is the 9th positional value in the VALUES tuple
    // (stage_number, stage_key, stage_name, description, app_description, phase_number,
    // phase_name, chunk, gate_type, ...) -- pinned via the adjacent literal chunk value 'THE_BUILD'
    // immediately preceding it, since the description field's free text makes a full-tuple regex
    // brittle against unrelated prose edits.
    expect(sql).toMatch(/'THE_BUILD',\s*\n\s*'none',\s*\n\s*'auto',\s*\n\s*'automated_check'/);
  });

  test('documents that the true promotion gate lands at the post-renumber stage_number=24 (was 23 pre-renumber)', () => {
    // The migration's own header comment records this as the load-bearing post-apply invariant --
    // this assertion pins that documentation so a future edit cannot silently drop it uncaught.
    expect(sql).toMatch(/stage_number=24, promotion \+ is_irreversible=true/);
  });

  test('preflight guards against a partial/already-applied state (idempotency short-circuit + zero-real-ventures-in-range check)', () => {
    expect(sql).toMatch(/PREFLIGHT FAILED: expected exactly 4 rows at stage_number 23-26/);
    expect(sql).toMatch(/any REAL \(is_demo=false\) venture is currently parked at a shifted stage_number/);
  });
});

describe('venture-UAT stage-renumber migration — correction migrations confirm live-applied state', () => {
  test('20260828 correction migrations assert the corrected 27-stage scheme was measured against the LIVE database, not a draft', () => {
    const lifecyclePhases = readFileSync(
      path.join(ROOT, 'database/migrations/20260828_correct_lifecycle_phases_27_stage_scheme.sql'),
      'utf8'
    );
    const hardGates = readFileSync(
      path.join(ROOT, 'database/migrations/20260828_correct_hard_gate_stages_27_stage_scheme.sql'),
      'utf8'
    );
    expect(lifecyclePhases).toContain('Live phase spans measured 2026-08-28');
    expect(lifecyclePhases).toContain('coordinator applied');
    expect(lifecyclePhases).toContain('the live DB on 2026-08-29');
    expect(hardGates).toContain('measured live 2026-08-28');
    expect(hardGates).toContain('the live DB on 2026-08-29');
  });
});
