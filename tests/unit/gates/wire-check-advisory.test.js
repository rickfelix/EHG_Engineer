/**
 * WIRE_CHECK_ADVISORY — Unit Tests
 * SD-FDBK-ENH-WIRE-CHECK-GATE-002
 *
 * The advisory gate is the non-blocking EXEC-TO-PLAN twin of the LEAD-FINAL
 * WIRE_CHECK_GATE. These tests pin its advisory contract (never blocks), its
 * structure (required:false), and that it REUSES the canonical exported helpers
 * from wire-check-gate.js rather than re-implementing entry/scope discovery
 * (so the blocking gate stays the single source of truth and is left unchanged).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ADVISORY_FILE = path.resolve(
  __dirname,
  '../../../scripts/modules/handoff/executors/exec-to-plan/gates/wire-check-advisory.js'
);

describe('wire-check-advisory gate (SD-FDBK-ENH-WIRE-CHECK-GATE-002)', () => {
  let createWireCheckAdvisoryGate;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const mod = await import(
      '../../../scripts/modules/handoff/executors/exec-to-plan/gates/wire-check-advisory.js'
    );
    createWireCheckAdvisoryGate = mod.createWireCheckAdvisoryGate;
  });

  // TS-1: gate structure
  it('has the correct name, is NOT required (advisory), and exposes a validator fn', () => {
    const gate = createWireCheckAdvisoryGate(null);
    expect(gate.name).toBe('WIRE_CHECK_ADVISORY');
    expect(gate.required).toBe(false);
    expect(typeof gate.validator).toBe('function');
  });

  // TS-2: advisory never blocks — run against the live repo, must always pass
  it('always returns passed:true with a valid gate shape (never blocks)', async () => {
    const gate = createWireCheckAdvisoryGate(null);
    const result = await gate.validator({ sd: { id: 'test', target_application: 'EHG_Engineer' } });

    expect(result).toHaveProperty('passed', true);
    expect(typeof result.score).toBe('number');
    expect(Array.isArray(result.issues)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
    // Advisory must never surface blocking issues.
    expect(result.issues).toEqual([]);
  });

  // TS-2b: tolerant of a missing sd context (still non-blocking)
  it('returns passed:true even when ctx has no sd', async () => {
    const gate = createWireCheckAdvisoryGate(null);
    const result = await gate.validator({});
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  // TS-3: reuses the canonical exported helpers from the blocking gate
  it('imports the canonical analysis helpers from wire-check-gate.js (source pin)', () => {
    const source = fs.readFileSync(ADVISORY_FILE, 'utf8');
    // Must import the shared, already-exported helpers rather than re-deriving them.
    expect(source).toMatch(/from\s+['"][^'"]*lead-final-approval\/gates\/wire-check-gate\.js['"]/);
    expect(source).toMatch(/discoverEntryPoints/);
    expect(source).toMatch(/getScopedJsFiles/);
    expect(source).toMatch(/isExcludedFromWireCheck/);
  });

  // FR-5: venture opt-out parity is present
  it('preserves venture-repo opt-out parity (source pin)', () => {
    const source = fs.readFileSync(ADVISORY_FILE, 'utf8');
    expect(source).toMatch(/isVentureRepo/);
  });

  // Advisory contract: required:false is the literal guard the runner reads.
  it('declares required:false so BaseExecutor never blocks on it (source pin)', () => {
    const source = fs.readFileSync(ADVISORY_FILE, 'utf8');
    expect(source).toMatch(/required:\s*false/);
  });
});
