/**
 * SD-LEO-INFRA-SUB-AGENT-REPO-001 — regression.js's resolveSubAgentRepo() call was passing
 * `targetApplication: options.target_application` only. The CLI entry point never populates
 * `options.target_application`, and (before this fix) getSDDetails() didn't even SELECT the
 * SD's target_application column — so every CLI-invoked run of `node lib/sub-agents/regression.js
 * <sdId> --full-validation` unconditionally hit resolveSubAgentRepo's undefined-candidate
 * fallback ({repoPath:null, repoResolved:false, registrySource:'fallback'}), regardless of
 * whether the actual worktree/registry would have resolved correctly.
 *
 * resolveTargetApplicationForRegression() is the extracted precedence rule now feeding that
 * call: options.target_application (explicit caller override) wins; otherwise fall back to the
 * SD's own target_application (now fetched by getSDDetails before resolution).
 */
import { describe, it, expect } from 'vitest';
import { resolveTargetApplicationForRegression } from '../../../lib/sub-agents/regression.js';

describe('resolveTargetApplicationForRegression', () => {
  it('prefers an explicit options.target_application over the SD default', () => {
    const result = resolveTargetApplicationForRegression(
      { target_application: 'CronGenius' },
      { target_application: 'EHG_Engineer' }
    );
    expect(result).toBe('CronGenius');
  });

  it('falls back to sdDetails.target_application when options omits it (the CLI shape)', () => {
    const result = resolveTargetApplicationForRegression(
      {},
      { target_application: 'EHG_Engineer' }
    );
    expect(result).toBe('EHG_Engineer');
  });

  it('returns undefined when neither source has a value (matches resolveSubAgentRepo\'s undefined-candidate fallback)', () => {
    const result = resolveTargetApplicationForRegression({}, { target_application: null });
    expect(result).toBeUndefined();
  });

  it('is null-safe for a missing sdDetails argument', () => {
    const result = resolveTargetApplicationForRegression({ target_application: 'ehg' }, null);
    expect(result).toBe('ehg');
  });
});
