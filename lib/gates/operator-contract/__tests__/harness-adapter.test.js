/**
 * Operator Contract — harness adapter (FR-5) tests.
 * Focus: fail-open contract + well-formed gate object. Core decision logic is
 * covered exhaustively in operator-contract.test.js.
 */
import { describe, it, expect } from 'vitest';
import { createOperatorContractGate, resolveOperatorContract } from '../harness-adapter.js';

const supabaseStub = {
  from() {
    return {
      select: async () => ({ data: [] }),
      insert: async () => ({ error: null }),
    };
  },
};

describe('createOperatorContractGate (FR-5 factory)', () => {
  it('returns a well-formed, required gate object', () => {
    const gate = createOperatorContractGate(supabaseStub, { sd_key: 'SD-X' }, process.cwd());
    expect(gate.name).toBe('OPERATOR_CONTRACT');
    expect(gate.required).toBe(true);
    expect(typeof gate.validator).toBe('function');
  });

  it('FAIL-OPEN: an execution error (non-git path) resolves to pass with a warning', async () => {
    const gate = createOperatorContractGate(supabaseStub, { sd_key: 'SD-X' }, '/nonexistent-path-xyz');
    const r = await gate.validator({ sd: { sd_key: 'SD-X' } });
    expect(r.passed).toBe(true);
    expect(r.details.fail_open).toBe(true);
    expect(r.warnings[0]).toMatch(/fail-open/);
  });
});

describe('resolveOperatorContract (adapter → core)', () => {
  it('non-git path fails open by throwing (caught by the gate factory)', async () => {
    await expect(
      resolveOperatorContract({ sd: { sd_key: 'SD-X' }, appPath: '/nonexistent-path-xyz', supabase: supabaseStub })
    ).rejects.toBeTruthy();
  });
});
