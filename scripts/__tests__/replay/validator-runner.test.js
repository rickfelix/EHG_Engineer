import { describe, it, expect } from 'vitest';
import { runValidator, runReplay, ValidatorContractError } from './validator-runner.mjs';

const VALID_FIXTURE = {
  input: { question: 'q' },
  v1_output: { answer: 'a' },
  validator_result: { passed: true },
  captured_at: '2026-04-25T12:00:00Z',
  sanitized: true,
};

describe('runValidator', () => {
  it('returns the validator result on a well-shaped function', async () => {
    const validator = (out) => ({ passed: out.answer === 'a', details: 'ok' });
    const r = await runValidator(validator, { answer: 'a' });
    expect(r.passed).toBe(true);
    expect(r.details).toBe('ok');
  });

  it('throws ValidatorContractError when validator is not a function', async () => {
    await expect(runValidator(null, {})).rejects.toThrow(ValidatorContractError);
  });

  it('throws when validator returns non-object', async () => {
    await expect(runValidator(() => 'pass', {})).rejects.toThrow(/must return an object/);
  });

  it('throws when validator result lacks passed:boolean', async () => {
    await expect(runValidator(() => ({ ok: true }), {})).rejects.toThrow(/passed: boolean/);
  });
});

describe('runReplay', () => {
  it('invokes promptFn with fixture.input and validates output', async () => {
    const promptFn = async (input) => ({ answer: input.question.toUpperCase() });
    const validator = (out) => ({ passed: out.answer === 'Q' });
    const { v2Output, v2Result } = await runReplay({ promptFn, fixture: VALID_FIXTURE, validator });
    expect(v2Output).toEqual({ answer: 'Q' });
    expect(v2Result.passed).toBe(true);
  });
});
