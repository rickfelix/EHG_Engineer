/**
 * CONSUMER_IMPACT_ADVISORY — Unit Tests (TS-6)
 * SD-LEO-INFRA-FIRST-PARTY-CODEBASE-STRUCTURAL-ANALYSIS-001
 *
 * Mirrors tests/unit/gates/wire-check-advisory.test.js: pins the advisory
 * contract (never blocks handoffs, required:false) and runs the gate against
 * the live repo since ROOT_DIR is resolved from the module's own location,
 * matching the established convention for this gate family.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GATE_FILE = path.resolve(
  __dirname,
  '../../../scripts/modules/handoff/executors/exec-to-plan/gates/consumer-impact-gate.js'
);
const GATE_INDEX_FILE = path.resolve(
  __dirname,
  '../../../scripts/modules/handoff/executors/exec-to-plan/gates/index.js'
);
const EXEC_TO_PLAN_INDEX_FILE = path.resolve(
  __dirname,
  '../../../scripts/modules/handoff/executors/exec-to-plan/index.js'
);

describe('consumer-impact-gate (CONSUMER_IMPACT_ADVISORY, TS-6)', () => {
  let createConsumerImpactGate;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const mod = await import(
      '../../../scripts/modules/handoff/executors/exec-to-plan/gates/consumer-impact-gate.js'
    );
    createConsumerImpactGate = mod.createConsumerImpactGate;
  });

  it('has the correct name, is NOT required (advisory), and exposes a validator fn', () => {
    const gate = createConsumerImpactGate(null);
    expect(gate.name).toBe('CONSUMER_IMPACT_ADVISORY');
    expect(gate.required).toBe(false);
    expect(typeof gate.validator).toBe('function');
  });

  it('always returns passed:true with a valid gate shape (never blocks)', async () => {
    const gate = createConsumerImpactGate(null);
    const result = await gate.validator({ sd: { id: 'test', target_application: 'EHG_Engineer' } });

    expect(result).toHaveProperty('passed', true);
    expect(typeof result.score).toBe('number');
    expect(Array.isArray(result.issues)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(result.issues).toEqual([]);
  }, 120000); // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: blast-radius
              // scan time scales with diff size vs mainRef; this SD's large sweep diff
              // (199 files) pushed the real (correct, non-flaky) run past the old 30s bound.

  it('returns passed:true even when ctx has no sd', async () => {
    const gate = createConsumerImpactGate(null);
    const result = await gate.validator({});
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  }, 120000);

  it('skips analysis for venture-targeted SDs unless wiring_required is set (source pin)', () => {
    const source = fs.readFileSync(GATE_FILE, 'utf8');
    expect(source).toMatch(/isVentureRepo/);
    expect(source).toMatch(/wiring_required/);
  });

  it('declares required:false so BaseExecutor never blocks on it (source pin)', () => {
    const source = fs.readFileSync(GATE_FILE, 'utf8');
    expect(source).toMatch(/required:\s*false/);
  });

  it('is registered in gates/index.js and exec-to-plan/index.js (wiring pin)', () => {
    const indexSource = fs.readFileSync(GATE_INDEX_FILE, 'utf8');
    expect(indexSource).toMatch(/export\s*\{\s*createConsumerImpactGate\s*\}\s*from\s*['"]\.\/consumer-impact-gate\.js['"]/);

    const execToPlanSource = fs.readFileSync(EXEC_TO_PLAN_INDEX_FILE, 'utf8');
    expect(execToPlanSource).toMatch(/createConsumerImpactGate/);
    expect(execToPlanSource).toMatch(/gates\.push\(createConsumerImpactGate\(/);
  });
});
