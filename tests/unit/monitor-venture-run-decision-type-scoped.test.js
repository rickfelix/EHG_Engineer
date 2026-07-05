/**
 * QF-20260704-968 — scripts/monitor-venture-run.cjs's getPendingDecision(stage) and its
 * cross-stage fallback queried chairman_decisions by venture_id/lifecycle_stage/status
 * with no decision_type filter. SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001 widened
 * chairman_decisions uniqueness so a 'stage_gate' and a 'product_review' decision can both
 * be pending at the same venture+stage -- this ops CLI could then reference (and
 * auto-approve) an arbitrary one of the two instead of only the intended stage-gate lane.
 * product_review is a separate human taste-review decision that must never be
 * auto-approved by this monitoring CLI.
 *
 * Static-pin pattern (mocking-independent), per tests/unit/sd-start-human-action-gate.test.js
 * -- `sb` is a module-scoped Supabase client created at require-time, not easily mockable
 * without modifying the source.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, '..', '..', 'scripts/monitor-venture-run.cjs'), 'utf8');

describe('QF-20260704-968: monitor-venture-run.cjs chairman_decisions queries scoped to decision_type=stage_gate', () => {
  it('getPendingDecision(stage) filters on decision_type=stage_gate', () => {
    const start = src.indexOf('async function getPendingDecision');
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start, start + 1100);
    expect(body).toMatch(/\.eq\('decision_type', 'stage_gate'\)/);
  });

  it('the cross-stage fallback query (re-entry attempts) also filters on decision_type=stage_gate', () => {
    const start = src.indexOf('older pending decisions (from re-entry attempts)');
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start, start + 800);
    expect(body).toMatch(/\.eq\('decision_type', 'stage_gate'\)/);
  });

  it('both queries still select decision_type in their column list (so callers can label the type)', () => {
    const getPendingStart = src.indexOf('async function getPendingDecision');
    const getPendingBody = src.slice(getPendingStart, getPendingStart + 700);
    expect(getPendingBody).toMatch(/select\('id, status, decision, lifecycle_stage, decision_type'\)/);

    const fallbackStart = src.indexOf('older pending decisions (from re-entry attempts)');
    const fallbackBody = src.slice(fallbackStart, fallbackStart + 500);
    expect(fallbackBody).toMatch(/select\('id, lifecycle_stage, status, decision_type, attempt_number'\)/);
  });
});
