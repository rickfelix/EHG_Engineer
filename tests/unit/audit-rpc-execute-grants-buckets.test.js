// SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001 TS-1 (corrected) / TS-8. Fixture-driven unit tests
// for the anon/PUBLIC-axis verifier's core comparison LOGIC (evaluateBucketCompliance /
// findUndeclaredExposures), extracted from scripts/audit-rpc-execute-grants.mjs's
// runBucketsAxisCheck() specifically so this logic is testable without a live database — feed it
// synthetic before/after ACL fixtures and assert it discriminates, per TESTING sub-agent's TS-1
// correction (this is the permanent regression test of the verifier's LOGIC, not a pin of
// today's ephemeral live-catalog fact — that one-shot measurement lives separately in
// scripts/one-off/exec-live-baseline-close-remaining-security-001.mjs).
import { describe, it, expect } from 'vitest';
import { evaluateBucketCompliance, findUndeclaredExposures } from '../../scripts/audit-rpc-execute-grants.mjs';

describe('evaluateBucketCompliance — TS-1: discriminates an exposed function from a closed one', () => {
  it('Bucket A function still carrying anon/auth/public EXECUTE (exposed, pre-fix state) FAILS', () => {
    const failures = evaluateBucketCompliance('public.foo()', 'A', { anon_exec: true, auth_exec: true, public_exec: true });
    expect(failures).toHaveLength(3);
    expect(failures.join(' ')).toMatch(/anon_exec=true/);
    expect(failures.join(' ')).toMatch(/auth_exec=true/);
    expect(failures.join(' ')).toMatch(/public_exec=true/);
  });

  it('Bucket A function with anon/auth/public all revoked (closed, post-fix state) PASSES', () => {
    const failures = evaluateBucketCompliance('public.foo()', 'A', { anon_exec: false, auth_exec: false, public_exec: false });
    expect(failures).toEqual([]);
  });

  it('Bucket B function still carrying anon/public EXECUTE (exposed) FAILS', () => {
    const failures = evaluateBucketCompliance('public.bar()', 'B', { anon_exec: true, auth_exec: true, public_exec: true });
    expect(failures.some((f) => f.includes('anon_exec=true'))).toBe(true);
    expect(failures.some((f) => f.includes('public_exec=true'))).toBe(true);
  });

  it('Bucket B function correctly closed (anon/public false, authenticated preserved) PASSES', () => {
    const failures = evaluateBucketCompliance('public.bar()', 'B', { anon_exec: false, auth_exec: true, public_exec: false });
    expect(failures).toEqual([]);
  });

  it('Bucket B function that lost its authenticated grant entirely is flagged as a REGRESSION, not silently ignored', () => {
    const failures = evaluateBucketCompliance('public.bar()', 'B', { anon_exec: false, auth_exec: false, public_exec: false });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/auth_exec=false.*regression/);
  });

  it('a function absent from the live catalog query result is reported as NOT FOUND, not silently skipped', () => {
    const failures = evaluateBucketCompliance('public.missing()', 'A', undefined);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/NOT FOUND in live catalog/);
  });

  it('Bucket C is never asserted on by this function (the migration verify block owns that axis)', () => {
    const failures = evaluateBucketCompliance('public.baz()', 'C', { anon_exec: true, auth_exec: true, public_exec: true });
    expect(failures).toEqual([]);
  });
});

describe('findUndeclaredExposures — TS-8: the completeness gate catches a function outside every declared bucket', () => {
  it('a live anon/PUBLIC-executable function absent from the manifest is reported as undeclared', () => {
    const declared = new Map([['public.known()', 'A']]);
    const undeclared = findUndeclaredExposures(['public.known()', 'public.surprise_new_function()'], declared);
    expect(undeclared).toEqual(['public.surprise_new_function()']);
  });

  it('when every exposed function is declared somewhere, reports zero undeclared', () => {
    const declared = new Map([['public.known()', 'A'], ['public.also_known()', 'B']]);
    const undeclared = findUndeclaredExposures(['public.known()', 'public.also_known()'], declared);
    expect(undeclared).toEqual([]);
  });

  it('accepts a plain Set as well as a Map for the declared collection', () => {
    const declared = new Set(['public.known()']);
    const undeclared = findUndeclaredExposures(['public.known()', 'public.rogue()'], declared);
    expect(undeclared).toEqual(['public.rogue()']);
  });
});
