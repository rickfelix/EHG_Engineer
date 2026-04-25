export class ParityViolation extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ParityViolation';
    this.details = details;
  }
}

export function assertParity({ v1Result, v2Result, fixturePath }) {
  if (v1Result.passed !== v2Result.passed) {
    throw new ParityViolation(
      `Validator parity broken for ${fixturePath}: v1.passed=${v1Result.passed} vs v2.passed=${v2Result.passed}`,
      { fixturePath, v1Result, v2Result }
    );
  }
  return { ok: true, fixturePath };
}

export function summarizeReplayResults(results) {
  const total = results.length;
  const passed = results.filter(r => r.ok).length;
  const failed = total - passed;
  return {
    total,
    passed,
    failed,
    parity_holds: failed === 0,
    failures: results.filter(r => !r.ok).map(r => r.fixturePath),
  };
}
