/**
 * SD-LEO-INFRA-COMPLETION-GATE-DATA-001-A FR-4 — static wiring assertion that the
 * shared readback gate (lib/checkers/completion-readback-gate.mjs) is actually called
 * from BOTH completion write sites in orchestrator.js: the merged-early-return reconcile
 * path (~line 473-477) and the primary status:'completed' write (~line 1006-1035). The
 * full pass/fail/malformed/unverifiable behavior matrix is covered directly against the
 * shared gate function in tests/unit/checkers/completion-readback-gate.test.js — this
 * test only pins that both call sites in THIS file invoke it (no accidental removal, no
 * accidental single-site-only wiring).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const orchestratorPath = fileURLToPath(
  new URL('../../../scripts/modules/complete-quick-fix/orchestrator.js', import.meta.url)
);
const src = readFileSync(orchestratorPath, 'utf8');

describe('orchestrator.js — readback gate wiring', () => {
  it('imports applyCompletionReadbackGate from the shared checker module', () => {
    expect(src).toMatch(/import\s*\{\s*applyCompletionReadbackGate/);
    expect(src).toMatch(/lib\/checkers\/completion-readback-gate\.mjs/);
  });

  it('calls the gate at both completion write sites', () => {
    const calls = src.match(/applyCompletionReadbackGate\(/g) || [];
    // 1 in the import destructure line does not match this regex (no trailing paren
    // right after the identifier there); expect exactly the two call sites.
    expect(calls.length).toBe(2);
  });

  it('rethrows gate errors out of the merged-reconcile try/catch instead of swallowing them', () => {
    expect(src).toMatch(/ClaimMalformedError[\s\S]{0,40}ReadbackCheckError[\s\S]{0,20}throw e;/);
  });
});
