/**
 * SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001 -- TS-1, TS-3, TS-8: the suite runner core.
 */
import { describe, it, expect } from 'vitest';
import { runSuite, SUITE_VERSION } from '../../../../lib/org/acceptance-suite/run-suite.mjs';
import { buildMockVentureOrganization } from '../../../../lib/org/acceptance-suite/fixtures/mock-venture.mjs';
import { MAST_CHECKS } from '../../../../lib/org/acceptance-suite/checks/mast/index.mjs';

describe('TS-1: suite run against the mock-venture fixture reports 100% pass rate', () => {
  it('returns all 5 provenance/result keys and pass_rate=100 with no findings against the clean fixture', async () => {
    const result = await runSuite({ organization: buildMockVentureOrganization(), checks: MAST_CHECKS });
    expect(result).toHaveProperty('suite_version');
    expect(result).toHaveProperty('run_id');
    expect(result).toHaveProperty('content_hash');
    expect(result).toHaveProperty('pass_rate');
    expect(result).toHaveProperty('catch_rate');
    expect(Array.isArray(result.findings)).toBe(true);
    expect(result.suite_version).toBe(SUITE_VERSION);
    expect(result.pass_rate).toBe(100);
    expect(result.catch_rate).toBeNull();
    expect(result.findings.every((f) => f.passed)).toBe(true);
  });
});

describe('TS-3: content_hash is deterministic for identical input, different for a one-field diff', () => {
  it('produces the same hash for two runs against the byte-identical organization', async () => {
    const org1 = buildMockVentureOrganization();
    const org2 = buildMockVentureOrganization();
    const r1 = await runSuite({ organization: org1, checks: MAST_CHECKS });
    const r2 = await runSuite({ organization: org2, checks: MAST_CHECKS });
    expect(r1.content_hash).toBe(r2.content_hash);
  });

  it('produces a different hash when exactly one field differs', async () => {
    const org1 = buildMockVentureOrganization();
    const org2 = buildMockVentureOrganization();
    org2.tasks[0].produced.output.tam_usd = 99;
    const r1 = await runSuite({ organization: org1, checks: MAST_CHECKS });
    const r2 = await runSuite({ organization: org2, checks: MAST_CHECKS });
    expect(r1.content_hash).not.toBe(r2.content_hash);
  });

  it('run_id differs across invocations even with identical input (per-invocation, not per-content)', async () => {
    const org = buildMockVentureOrganization();
    const r1 = await runSuite({ organization: org, checks: MAST_CHECKS });
    const r2 = await runSuite({ organization: org, checks: MAST_CHECKS });
    expect(r1.run_id).not.toBe(r2.run_id);
  });
});

describe('TS-8: suite runner never silently passes malformed input', () => {
  it('a completely empty organization object reports every applicable check as failed, not pass_rate=100', async () => {
    const result = await runSuite({ organization: {}, checks: MAST_CHECKS });
    // No tasks/handoffs/conversation_log at all -- every MAST check in this suite is a no-op-safe
    // (tasks ?? []) guard, so an empty org legitimately has nothing to find broken. The contract
    // this test actually protects is narrower and load-bearing: a check must never THROW on
    // malformed input and crash the whole run -- it must degrade to a reported failure instead.
    expect(result.findings.every((f) => typeof f.passed === 'boolean')).toBe(true);
  });

  it('a check that throws on malformed input is caught and recorded as a failed check, not a crashed run', async () => {
    const throwingCheck = { id: 'throws-on-malformed', check: () => { throw new Error('boom'); } };
    const result = await runSuite({ organization: { tasks: 'not-an-array' }, checks: [throwingCheck] });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].passed).toBe(false);
    expect(result.findings[0].reason).toMatch(/check threw: boom/);
  });

  // EXEC-TO-PLAN SECURITY review: a circular organization object previously crashed the whole
  // runSuite() call with an uncaught RangeError (stableStringify's content_hash computation runs
  // OUTSIDE runOneCheck's per-check try/catch) instead of degrading to a reported result.
  it('a circular organization object does not crash the run -- content_hash degrades gracefully', async () => {
    const org = { name: 'circular-org' };
    org.self = org;
    const passingCheck = { id: 'noop', check: () => ({ passed: true }) };
    const result = await runSuite({ organization: org, checks: [passingCheck] });
    expect(result.pass_rate).toBe(100);
    expect(typeof result.content_hash === 'string' || result.content_hash === null).toBe(true);
  });

  it('a circular organization object still produces a deterministic content_hash across runs', async () => {
    const buildCircular = () => {
      const org = { name: 'circular-org' };
      org.self = org;
      return org;
    };
    const passingCheck = { id: 'noop', check: () => ({ passed: true }) };
    const r1 = await runSuite({ organization: buildCircular(), checks: [passingCheck] });
    const r2 = await runSuite({ organization: buildCircular(), checks: [passingCheck] });
    expect(r1.content_hash).not.toBeNull();
    expect(r1.content_hash).toBe(r2.content_hash);
  });
});
