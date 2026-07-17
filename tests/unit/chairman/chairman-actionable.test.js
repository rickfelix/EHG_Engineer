/**
 * SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-002 — direct unit coverage for the canonical
 * chairman-actionable fixture predicate (previously untested; the digest leak shipped
 * because nothing pinned which names the surfaces exclude).
 */
import { describe, it, expect } from 'vitest';
import {
  isFixtureVenture,
  isConsoleActionable,
  isEscalationActionable,
  FIXTURE_NAME_PATTERNS,
} from '../../../lib/chairman/chairman-actionable.mjs';

describe('isFixtureVenture', () => {
  it('excludes the HCGate-RealDB leak specimens (RCA 2026-07-16)', () => {
    expect(isFixtureVenture({ name: 'HCGate-RealDB-unclassified-noop-1784238026383', is_demo: false })).toBe(true);
    expect(isFixtureVenture({ name: 'HCGate-RealDB-classified-block-1784238026383', is_demo: false })).toBe(true);
  });

  it('excludes the legacy fixture families', () => {
    for (const name of [
      '__e2e_product_review_gate_a_1__',
      'Test Venture for Owned-Audience Loop',
      'my-citest-venture',
      'canonical-source-test-1752',
    ]) expect(isFixtureVenture({ name, is_demo: false }), name).toBe(true);
  });

  it('excludes the extended realdb/write-guard/real-path-suite families', () => {
    for (const name of [
      'ProductReviewGate-RealDB-a-1752',
      'StageArtifactGate-RealDB-b-1752',
      'something-noop-1752',
      'parity-test-venture',
      'test-stub-venture',
      'TEST-HARNESS-s20',
      'TS-fixture-abc',
      '_PIPELINE_TEST_1752',
      'Pipeline-Test-1752',
      'Gate-Test-1752',
    ]) expect(isFixtureVenture({ name, is_demo: false }), name).toBe(true);
  });

  it('always excludes is_demo=true regardless of name', () => {
    expect(isFixtureVenture({ name: 'ApexNiche AI', is_demo: true })).toBe(true);
  });

  it('includes real ventures and fail-includes null/unreadable ventures', () => {
    expect(isFixtureVenture({ name: 'ApexNiche AI', is_demo: false })).toBe(false);
    expect(isFixtureVenture({ name: 'Image Alt Text Generator', is_demo: false })).toBe(false);
    expect(isFixtureVenture(null)).toBe(false);
    expect(isFixtureVenture(undefined)).toBe(false);
    expect(isFixtureVenture({})).toBe(false);
  });
});

describe('actionability predicates (unchanged semantics)', () => {
  it('console admits pending allowlist types; escalation additionally admits blocking non-telemetry', () => {
    expect(isConsoleActionable({ status: 'pending', decision_type: 'chairman_approval' })).toBe(true);
    expect(isConsoleActionable({ status: 'pending', decision_type: 'session_question', blocking: true })).toBe(false);
    expect(isEscalationActionable({ status: 'pending', decision_type: 'session_question', blocking: true })).toBe(true);
    expect(isEscalationActionable({ status: 'pending', decision_type: 'flag_review', blocking: true })).toBe(false);
    expect(isEscalationActionable({ status: 'resolved', decision_type: 'chairman_approval' })).toBe(false);
  });
});

describe('pattern export', () => {
  it('exports a frozen non-empty pattern list for the SQL parity test', () => {
    expect(Object.isFrozen(FIXTURE_NAME_PATTERNS)).toBe(true);
    expect(FIXTURE_NAME_PATTERNS.length).toBeGreaterThanOrEqual(13);
  });
});
