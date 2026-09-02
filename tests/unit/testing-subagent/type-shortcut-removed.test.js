/**
 * SD-FDBK-INFRA-TESTING-SUB-AGENT-001
 *
 * The TESTING sub-agent used to decide E2E applicability from a private hardcoded list
 * (skipE2ESdTypes, index.js) that disagreed with a second private list (E2E_EXEMPT_SD_TYPES,
 * phase4-evidence.js), and auto-passed (verdict PASS, confidence 95) any matching sd_type
 * BEFORE any test ran. This suite pins the replacement: a single policy-derived predicate
 * (isE2EApplicabilityExempt), and checkForNonUISdType never returning a fabricated PASS for a
 * code-producing exempt-type SD.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isE2EApplicabilityExempt } from '../../../scripts/modules/handoff/validation/sd-type-applicability-policy.js';
import { checkForNonUISdType } from '../../../lib/sub-agents/testing/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('SC#1: the two private lists are gone; one policy decides applicability', () => {
  it('skipE2ESdTypes and E2E_EXEMPT_SD_TYPES no longer exist under lib/sub-agents/testing', () => {
    const indexSrc = src('lib/sub-agents/testing/index.js');
    const phase4Src = src('lib/sub-agents/testing/phases/phase4-evidence.js');
    expect(indexSrc).not.toMatch(/skipE2ESdTypes/);
    expect(indexSrc).not.toMatch(/E2E_EXEMPT_SD_TYPES/);
    expect(phase4Src).not.toMatch(/skipE2ESdTypes/);
    expect(phase4Src).not.toMatch(/E2E_EXEMPT_SD_TYPES/);
  });

  it('both files import the single policy predicate', () => {
    expect(src('lib/sub-agents/testing/index.js')).toMatch(/isE2EApplicabilityExempt/);
    expect(src('lib/sub-agents/testing/phases/phase4-evidence.js')).toMatch(/isE2EApplicabilityExempt/);
  });

  // Parity: every type the OLD 11-entry skipE2ESdTypes list exempted must still be exempt today
  // (no silent narrowing for the population this SD is about).
  it('all 8 policy-agreeing legacy types remain exempt', () => {
    for (const t of ['database', 'infrastructure', 'documentation', 'docs', 'refactor', 'process', 'uat', 'orchestrator']) {
      expect(isE2EApplicabilityExempt(t), `${t} should remain exempt`).toBe(true);
    }
  });

  // The 3 types the risk register flagged: policy actually says REQUIRED/undefined for these,
  // so a naive full swap would have silently WIDENED enforcement onto them. The carve-out keeps
  // today's behavior (still exempt) until that widening gets its own explicit sign-off.
  it('the 3 carve-out types (protocol, api, backend) stay exempt for now, not silently widened', () => {
    for (const t of ['protocol', 'api', 'backend']) {
      expect(isE2EApplicabilityExempt(t), `${t} should stay exempt (carve-out)`).toBe(true);
    }
  });

  // NON-GOALS: never widen the exemption to bugfix/feature — these must stay non-exempt.
  it('bugfix and feature are NOT exempt (NON-GOALS: no widening to bugfix)', () => {
    expect(isE2EApplicabilityExempt('bugfix')).toBe(false);
    expect(isE2EApplicabilityExempt('feature')).toBe(false);
  });
});

function mockSupabase(sdRow) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        or: vi.fn(() => ({
          single: vi.fn(async () => ({ data: sdRow, error: null }))
        }))
      }))
    }))
  };
}

describe('SC#2/SC#3: a code-producing exempt-type SD never gets a fabricated PASS', () => {
  it('non-code-producing exempt-type SD: honest PASS with measured=false (nothing to measure)', async () => {
    const sb = mockSupabase({ sd_type: 'infrastructure', category: null, key_changes: [], scope: 'config only, no code', title: 'x' });
    const result = await checkForNonUISdType('sd-1', 'prospective', {}, null, sb);
    expect(result).not.toBeNull();
    expect(result.verdict).toBe('PASS');
    expect(result.metadata.measured).toBe(false);
    expect(result.findings.phase3_execution.skipped).toBe(true);
  });

  it('code-producing exempt-type SD with NO resolvable scoped test: CONDITIONAL_PASS, never PASS', async () => {
    const sb = mockSupabase({
      sd_type: 'infrastructure',
      category: null,
      key_changes: [{ change: 'modify lib/sub-agents/testing/index.js to fix the bug' }],
      scope: '',
      title: 'x'
    });
    // git diff will fail/return nothing meaningful in this sandbox — asserting the shape, not
    // depending on a real git repo state.
    const result = await checkForNonUISdType('sd-2', 'prospective', {}, { repoPath: '/nonexistent-path-for-test' }, sb);
    expect(result).not.toBeNull();
    expect(result.verdict).not.toBe('PASS');
    expect(['CONDITIONAL_PASS', 'FAIL']).toContain(result.verdict);
    expect(result.metadata.measured).toBe(false);
  });

  it('non-exempt type (bugfix) falls through to the normal E2E flow (returns null)', async () => {
    const sb = mockSupabase({ sd_type: 'bugfix', category: null });
    const result = await checkForNonUISdType('sd-3', 'prospective', {}, null, sb);
    expect(result).toBeNull();
  });
});

describe('SC#4: measured implies the verdict is never a bare unmeasured PASS', () => {
  it('every non-null checkForNonUISdType result carries metadata.measured explicitly', async () => {
    const sb = mockSupabase({ sd_type: 'documentation', category: null, key_changes: [], scope: 'docs only', title: 'x' });
    const result = await checkForNonUISdType('sd-4', 'prospective', {}, null, sb);
    expect(result.metadata).toHaveProperty('measured');
    // PASS is only honest here because measured=false is paired with "nothing to measure"
    // (no code produced), never with "something was skipped".
    if (result.verdict === 'PASS') {
      expect(result.findings.phase3_execution.reason).toMatch(/no code produced/);
    }
  });
});
