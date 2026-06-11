// SD-LEO-FIX-RECONCILE-DEAD-ARRIVAL-001: the FR_DELIVERY_TRACEABILITY gate shipped
// 2026-06-08 for the EXEC-TO-PLAN boundary with ZERO importers (dead on arrival;
// WIRE_CHECK missed the exported-no-caller factory). Pins: (1) the gate is wired
// into BOTH exec-to-plan gate paths; (2) the FR-2 fail-open contract — a thrown
// classifier in warn-only mode resolves to a passing warn result instead of
// hard-failing the handoff via ValidationOrchestrator's static-required block;
// (3) the two reconciled dead files are gone from live paths.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const EXEC_TO_PLAN = path.resolve(__dirname, '../../scripts/modules/handoff/executors/exec-to-plan/index.js');
const src = readFileSync(EXEC_TO_PLAN, 'utf8');

describe('FR-1: gate wired into exec-to-plan', () => {
  it('imports createFrDeliveryTraceabilityGate from the gates module', () => {
    expect(src).toMatch(/import \{ createFrDeliveryTraceabilityGate \} from '\.\.\/\.\.\/gates\/fr-delivery-traceability-gate\.js'/);
  });

  it('pushes the gate in BOTH the orchestrator-child path and the normal path (2 sites)', () => {
    const pushes = src.match(/gates\.push\(createFrDeliveryTraceabilityGate\(this\.supabase\)\)/g) || [];
    expect(pushes).toHaveLength(2);
  });

  it('the child-path push sits inside the child branch (between scope-completion and the early return)', () => {
    const childStart = src.indexOf('Scope Completion Verification (applies to children too)');
    const childReturn = src.indexOf('return gates;', childStart);
    expect(childStart).toBeGreaterThan(0);
    const childBlock = src.slice(childStart, childReturn);
    expect(childBlock).toMatch(/createFrDeliveryTraceabilityGate\(this\.supabase\)/);
  });
});

describe('FR-2: fail-open contract in warn-only mode', async () => {
  // Stub the classifier module so the gate factory can be exercised hermetically.
  vi.mock('../../scripts/modules/handoff/gates/fr-delivery-classifier.js', () => ({
    classifyFrDelivery: vi.fn(),
    projectGateResult: vi.fn(() => ({ passed: true, score: 100, max_score: 100, issues: [], warnings: [] })),
    isFrTraceabilityEnforced: vi.fn(() => process.env.LEO_FR_TRACEABILITY_ENFORCE === 'true'),
  }));
  const { createFrDeliveryTraceabilityGate } = await import('../../scripts/modules/handoff/gates/fr-delivery-traceability-gate.js');

  function throwingSupabase() {
    return { from: () => { throw new Error('transient db error'); } };
  }

  it('thrown classifier path with enforcement OFF => passing warn result (never blocks)', async () => {
    delete process.env.LEO_FR_TRACEABILITY_ENFORCE;
    const gate = createFrDeliveryTraceabilityGate(throwingSupabase());
    const result = await gate.validator({ sd: { id: 'x', sd_key: 'SD-X' } });
    expect(result.passed).toBe(true);
    expect(result.required).toBe(false);
    expect(result.warnings.join(' ')).toMatch(/fail-open/);
  });

  it('thrown classifier path with enforcement ON => error propagates (strict)', async () => {
    process.env.LEO_FR_TRACEABILITY_ENFORCE = 'true';
    try {
      const gate = createFrDeliveryTraceabilityGate(throwingSupabase());
      await expect(gate.validator({ sd: { id: 'x', sd_key: 'SD-X' } })).rejects.toThrow('transient db error');
    } finally {
      delete process.env.LEO_FR_TRACEABILITY_ENFORCE;
    }
  });
});

describe('FR-3/FR-4: dead files retired from live paths', () => {
  const ROOT = path.resolve(__dirname, '../..');
  it('pre-commit-secret-scan.sh moved to _deprecated (inline husky scan is the live one)', () => {
    expect(existsSync(path.join(ROOT, 'scripts/hooks/pre-commit-secret-scan.sh'))).toBe(false);
    expect(existsSync(path.join(ROOT, 'scripts/_deprecated/pre-commit-secret-scan.sh'))).toBe(true);
  });
  it('feature-flag-expiry-checker.js moved to _deprecated (governance digest covers expiry_at)', () => {
    expect(existsSync(path.join(ROOT, 'scripts/jobs/feature-flag-expiry-checker.js'))).toBe(false);
    expect(existsSync(path.join(ROOT, 'scripts/_deprecated/feature-flag-expiry-checker.js'))).toBe(true);
  });
  it('the inline husky secret scan is still present', () => {
    const husky = readFileSync(path.join(ROOT, '.husky/pre-commit'), 'utf8');
    expect(husky).toMatch(/secret detection scan/i);
  });
});
