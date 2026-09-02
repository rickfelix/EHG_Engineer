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
import { verifyUserStories } from '../../../lib/sub-agents/testing/phases/phase4-evidence.js';

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

// Coordinator ruling (2026-09-02, RULING TESTING-SUB-AGENT-001): "keep protocol/api/backend
// exempt — no silent flip to required. Add a regression test that the 90.5% e2e_test_path=NULL
// stories keep passing (QF-20260801-425 guard)." tests/unit/testing-subagent/
// verify-user-stories-e2e-mapping.test.js already pins the validated-population half (both
// exempt and non-exempt types pass a validated NULL-path story). This pins the other half: the
// NON-validated NULL-path case for every type isE2EApplicabilityExempt now widens exemption to
// (database, refactor, process were previously required by the old 11-entry list's semantics but
// are legitimately NON_APPLICABLE/OPTIONAL per policy) plus the 3 carve-out types -- none of
// them silently flip to requiring e2e_test_path, and non-exempt types (bugfix) still do.
function stubSupabaseFor(rows) {
  return { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: rows, error: null }) }) }) };
}

// e2e_test_status='passing' isolates clause 4 (which independently requires a passing run OR
// validation) so this fixture exercises ONLY clause 2's exemption behavior for a NULL path with
// no validation_status='validated' escape hatch.
function unvalidatedNullPathStory() {
  return {
    story_key: 'SD-X:US-001', title: 'story', status: 'completed',
    validation_status: 'pending', e2e_test_path: null, e2e_test_status: 'passing',
  };
}

describe('SC#1 regression guard: no legacy-exempt type silently flips to requiring e2e mapping', () => {
  it.each(['database', 'infrastructure', 'documentation', 'docs', 'refactor', 'process', 'uat', 'orchestrator', 'protocol', 'api', 'backend'])(
    'sd_type=%s: an unvalidated NULL-path story still passes (exemption preserved)',
    async (sdType) => {
      const res = await verifyUserStories('sd-x', stubSupabaseFor([unvalidatedNullPathStory()]), { sdType });
      expect(res.verified, `${sdType} should stay exempt from e2e_test_path mapping`).toBe(true);
    }
  );

  it('sd_type=bugfix: an unvalidated NULL-path story is still correctly blocked (not newly exempted)', async () => {
    const res = await verifyUserStories('sd-x', stubSupabaseFor([unvalidatedNullPathStory()]), { sdType: 'bugfix' });
    expect(res.verified).toBe(false);
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

  // SC#6: every result also carries the ONE structured representation.
  it('every non-null checkForNonUISdType result carries metadata.test_execution (SC#6)', async () => {
    const sb = mockSupabase({ sd_type: 'documentation', category: null, key_changes: [], scope: 'docs only', title: 'x' });
    const result = await checkForNonUISdType('sd-5', 'prospective', {}, null, sb);
    expect(result.metadata.test_execution).toEqual({
      tests_executed: 0, tests_passed: 0, tests_failed: 0, tests_skipped: 0, artifact_sha: null, runner: null,
      artifact_path: null, source: null
    });
  });
});
