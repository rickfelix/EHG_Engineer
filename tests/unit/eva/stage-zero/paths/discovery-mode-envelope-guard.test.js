/**
 * SD-LEO-INFRA-STAGE0-ENVELOPE-REGISTRATION-001 (FR-6/TS-3/TS-5)
 *
 * sanitizeRequiredCapabilities is the structural (code, not prompt-only) guard applied at
 * discovery-mode.js's single callLLMForCandidates chokepoint -- proves an internal-artifact-
 * shaped requirement is stripped/flagged even if the LLM (contrary to its prompt instruction)
 * still emits one.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeRequiredCapabilities } from '../../../../../lib/eva/stage-zero/paths/discovery-mode.js';

describe('sanitizeRequiredCapabilities (FR-6)', () => {
  it('flags a known LEO-Protocol-internal capability_key as UNKNOWN-CAPABILITY (TS-3)', () => {
    const result = sanitizeRequiredCapabilities([{ name: 'auto-proceed', kind: 'ops' }]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toMatch(/^UNKNOWN-CAPABILITY:/);
    expect(result[0]._stripped_internal_artifact).toBe(true);
  });

  it('flags "db-prd-system" (the exact junk key cited in the SD rationale)', () => {
    const result = sanitizeRequiredCapabilities([{ name: 'db-prd-system', kind: 'ops' }]);
    expect(result[0]._stripped_internal_artifact).toBe(true);
  });

  it('flags a bare SD-key-shaped string even though it is not in the seeder denylist (TS-5)', () => {
    const result = sanitizeRequiredCapabilities([{ name: 'SD-LEO-INFRA-SOME-OTHER-SD-001', kind: 'ops' }]);
    expect(result[0]._stripped_internal_artifact).toBe(true);
    expect(result[0].name).toContain('SD-LEO-INFRA-SOME-OTHER-SD-001');
  });

  it('flags a bare QF-key-shaped string too', () => {
    const result = sanitizeRequiredCapabilities([{ name: 'QF-20260710-123', kind: 'ops' }]);
    expect(result[0]._stripped_internal_artifact).toBe(true);
  });

  it('is case-insensitive on both the denylist and the SD-key regex', () => {
    const denylisted = sanitizeRequiredCapabilities([{ name: 'AUTO-PROCEED', kind: 'ops' }]);
    expect(denylisted[0]._stripped_internal_artifact).toBe(true);
    const sdKey = sanitizeRequiredCapabilities([{ name: 'sd-leo-infra-foo-001', kind: 'ops' }]);
    expect(sdKey[0]._stripped_internal_artifact).toBe(true);
  });

  it('does NOT flag a genuine registered capability (negative control -- no over-firing)', () => {
    const result = sanitizeRequiredCapabilities([{ name: 'Web Hosting', kind: 'form_factor' }]);
    expect(result[0]).toEqual({ name: 'Web Hosting', kind: 'form_factor' });
    expect(result[0]._stripped_internal_artifact).toBeUndefined();
  });

  it('does NOT flag an unrelated, genuinely novel capability name (negative control)', () => {
    const result = sanitizeRequiredCapabilities([{ name: 'Custom CRM Integration', kind: 'integration' }]);
    expect(result[0]._stripped_internal_artifact).toBeUndefined();
  });

  it('handles bare-string requirement entries (not just {name, kind} objects)', () => {
    const result = sanitizeRequiredCapabilities(['auto-proceed', 'Web Hosting']);
    expect(result[0]._stripped_internal_artifact).toBe(true);
    expect(result[1]).toBe('Web Hosting'); // untouched, not internal-artifact-shaped
  });

  it('passes through non-array input unchanged', () => {
    expect(sanitizeRequiredCapabilities(undefined)).toBeUndefined();
    expect(sanitizeRequiredCapabilities(null)).toBeNull();
  });

  it('handles an empty array', () => {
    expect(sanitizeRequiredCapabilities([])).toEqual([]);
  });

  it('handles a mix of real, unknown-shaped, and internal-artifact entries in one call', () => {
    const result = sanitizeRequiredCapabilities([
      { name: 'Web Hosting', kind: 'form_factor' },
      { name: 'cmd-leo', kind: 'ops' },
      { name: 'Some Third-Party API', kind: 'integration' },
    ]);
    expect(result[0]._stripped_internal_artifact).toBeUndefined();
    expect(result[1]._stripped_internal_artifact).toBe(true);
    expect(result[2]._stripped_internal_artifact).toBeUndefined();
  });
});
