export class ValidatorContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidatorContractError';
  }
}

export async function runValidator(validator, output) {
  if (typeof validator !== 'function') {
    throw new ValidatorContractError(`validator must be a function, got ${typeof validator}`);
  }
  const result = await validator(output);
  if (result == null || typeof result !== 'object') {
    throw new ValidatorContractError(`validator must return an object, got ${typeof result}`);
  }
  if (typeof result.passed !== 'boolean') {
    throw new ValidatorContractError(`validator result must include 'passed: boolean', got ${typeof result.passed}`);
  }
  return result;
}

export async function runReplay({ promptFn, fixture, validator }) {
  const v2Output = await promptFn(fixture.input);
  const v2Result = await runValidator(validator, v2Output);
  return { v2Output, v2Result };
}
