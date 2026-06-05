/**
 * SD-LEO-INFRA-SUPPRESS-PROVIDER-TEST-001
 * Unit tests for the auto_rca noise classifier.
 *
 * Pure functions — no DB, no subprocess. Covers the PRD test scenarios:
 *  TS-1 provider quota (429 RESOURCE_EXHAUSTED) -> noise
 *  TS-2 test-stub fixture                       -> noise
 *  TS-3 genuine 5xx outage                      -> NOT noise (real defect preserved)
 *  TS-4 gate-validation failure                 -> NOT noise
 * plus the 400-Budget config case, stub-stuck marker, and fail-open edges.
 */
import { describe, it, expect } from 'vitest';
import { isNoiseMessage, isNoiseTriggerEvent } from '../../lib/rca/noise-classifier.js';

describe('isNoiseMessage — provider/test-stub noise', () => {
  it('TS-2: flags test-stub fixtures', () => {
    expect(isNoiseMessage('google API error: unknown - test-stub')).toBe(true);
    expect(isNoiseMessage('openai API error: unknown - test-stub')).toBe(true);
    expect(isNoiseMessage('anthropic API error: unknown - test-stub')).toBe(true);
  });

  it('flags stub-stuck markers', () => {
    expect(isNoiseMessage('anthropic API error: unknown - stub-stuck')).toBe(true);
  });

  it('TS-1: flags provider quota / rate-limit (429 RESOURCE_EXHAUSTED / quota)', () => {
    expect(isNoiseMessage('google API error: 429 - Google API error 429: { "status": "RESOURCE_EXHAUSTED" }')).toBe(true);
    expect(isNoiseMessage('openai API error: 429 - You exceeded your current quota, please check your plan')).toBe(true);
  });

  it('flags provider config/billing ("Budget … invalid")', () => {
    expect(isNoiseMessage('google API error: 400 - Budget 0 is invalid. This model only works in thinking mode.')).toBe(true);
  });
});

describe('isNoiseMessage — real signal is preserved', () => {
  it('TS-3: a genuine 5xx outage is NOT noise', () => {
    expect(isNoiseMessage('anthropic API error: 500 - Internal Server Error')).toBe(false);
    expect(isNoiseMessage('openai API error: 503 - Service Unavailable')).toBe(false);
  });

  it('TS-4: a gate-validation failure is NOT noise', () => {
    expect(isNoiseMessage('Gate ACCEPTANCE_CRITERIA_VALIDATION failed: score 50/100')).toBe(false);
    expect(isNoiseMessage('PLAN-TO-EXEC rejected: PRD does not meet quality standards')).toBe(false);
  });

  it('a handoff failure is NOT noise', () => {
    expect(isNoiseMessage('LEAD-TO-PLAN gate failed - GATE_CLAIM_VALIDITY wrong_worktree')).toBe(false);
  });

  it('a network error without API-error context is NOT noise', () => {
    expect(isNoiseMessage('connect ECONNRESET 10.0.0.1:443')).toBe(false);
  });

  it('a 429 WITHOUT quota context (e.g. app rate limit) is NOT noise', () => {
    // Conservative: only provider quota is suppressed, not every 429.
    expect(isNoiseMessage('HTTP 429 Too Many Requests from internal endpoint')).toBe(false);
  });
});

describe('isNoiseMessage — defensive edges (fail-open to real signal)', () => {
  it('returns false for empty/non-string input', () => {
    expect(isNoiseMessage('')).toBe(false);
    expect(isNoiseMessage(null)).toBe(false);
    expect(isNoiseMessage(undefined)).toBe(false);
    expect(isNoiseMessage(42)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isNoiseMessage('GOOGLE API ERROR: 429 - RESOURCE_EXHAUSTED quota exceeded')).toBe(true);
    expect(isNoiseMessage('Test-Stub marker')).toBe(true);
  });
});

describe('isNoiseTriggerEvent — TriggerEvent wrapper', () => {
  it('classifies via error_message', () => {
    expect(isNoiseTriggerEvent({ error_message: 'google API error: unknown - test-stub', trigger_type: 'api_failure' })).toBe(true);
    expect(isNoiseTriggerEvent({ error_message: 'anthropic API error: 500 - Internal Server Error', trigger_type: 'api_failure' })).toBe(false);
  });

  it('fail-open: malformed / missing event is treated as real signal (false)', () => {
    expect(isNoiseTriggerEvent(null)).toBe(false);
    expect(isNoiseTriggerEvent({})).toBe(false);
    expect(isNoiseTriggerEvent({ trigger_type: 'api_failure' })).toBe(false);
  });
});
