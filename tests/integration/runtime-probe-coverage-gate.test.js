import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const GATE = join(REPO_ROOT, 'scripts', 'modules', 'handoff', 'executors', 'lead-final-approval', 'gates', 'runtime-probe-coverage-gate.js');

describe('runtime-probe-coverage-gate.js shape', () => {
  it('file exists at expected path', () => {
    expect(existsSync(GATE)).toBe(true);
  });

  it('exports createRuntimeProbeCoverageGate function', () => {
    const src = readFileSync(GATE, 'utf8');
    expect(src).toContain('export function createRuntimeProbeCoverageGate');
  });

  it('queries bypass_ledger + scope_completion_chain + goal_evaluator_verdicts', () => {
    const src = readFileSync(GATE, 'utf8');
    expect(src).toContain('bypass_ledger');
    expect(src).toContain('scope_completion_chain');
    expect(src).toContain('goal_evaluator_verdicts');
  });

  it('threshold default 0.95 (95%)', () => {
    const src = readFileSync(GATE, 'utf8');
    expect(src).toMatch(/DEFAULT_THRESHOLD\s*=\s*0\.95/);
  });

  it('ENFORCE_RUNTIME_PROBE_COVERAGE env flag controls blocking mode', () => {
    const src = readFileSync(GATE, 'utf8');
    expect(src).toContain('ENFORCE_RUNTIME_PROBE_COVERAGE');
  });

  it('imports Sibling A emit-validation-audit-log helper', () => {
    const src = readFileSync(GATE, 'utf8');
    expect(src).toContain('emit-validation-audit-log.mjs');
    expect(src).toMatch(/emitValidationAuditLog/);
  });
});
