/**
 * SD-LEO-INFRA-VISION-KEY-STAMP-AT-SD-CREATION-001 (L7, Vision Loop-Completeness Map @ f2b64a94).
 *
 * THE BUG: the vision-fidelity gate has never executed -- 2142/2142 evaluations skipped with
 * reason no_vision_key, because no SD-creation path stamped sd.metadata.vision_key. Even a
 * correctly-stamped SD would still have failed silently, because
 * lib/sub-agents/vision-fidelity/index.js queried eva_vision_documents/eva_architecture_plans
 * on a column named `key`, which does not exist on either table (the real FK columns are
 * `vision_key` and `plan_key`).
 *
 * This file covers the createSD gap-fill predicate in isolation (mirrors the established
 * tests/unit/fleet/tier-rank-starvation-durable-fix.test.js FR-3 style, since lib/sd-creation/
 * pipeline.js's createSD() has too many DB/side-effect dependencies to unit-test directly).
 * The end-to-end "gate actually evaluates" behavior is covered separately by
 * tests/integration/vision-key-stamp-gate-evaluates.test.js against the real database.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_VISION_KEY } from '../../../lib/sd-creation/pipeline.js';

// Mirrors the createSD gap-fill predicate at lib/sd-creation/pipeline.js
// (search DEFAULT_VISION_KEY): `if (!sdData.metadata?.vision_key) { stamp default }`.
function applyVisionKeyGapFill(metadata) {
  if (!metadata?.vision_key) {
    return { ...metadata, vision_key: DEFAULT_VISION_KEY };
  }
  return metadata;
}

describe('vision_key gap-fill at SD creation', () => {
  it('DEFAULT_VISION_KEY is the canonical chairman-approved EHG L1 vision key', () => {
    expect(DEFAULT_VISION_KEY).toBe('VISION-EHG-L1-001');
  });

  it('stamps the canonical default when no vision_key is present (the direct-args no-flag case)', () => {
    const result = applyVisionKeyGapFill({ source: 'direct' });
    expect(result.vision_key).toBe(DEFAULT_VISION_KEY);
  });

  it('stamps the canonical default when metadata itself is absent', () => {
    const result = applyVisionKeyGapFill(undefined);
    expect(result.vision_key).toBe(DEFAULT_VISION_KEY);
  });

  it('stamps the canonical default for a proposal-sourced SD (proposal-lanes.js deliberately drops any proposal-declared vision_key before this point)', () => {
    // proposal-lanes.js's PROPOSAL_META_DROP_KEYS strips vision_key from preservedProposalMeta,
    // so by the time metadata reaches createSD it never carries a proposal-supplied value.
    const proposalMetadata = { source: 'proposal', proposal_provenance: 'adam-sourcing' };
    const result = applyVisionKeyGapFill(proposalMetadata);
    expect(result.vision_key).toBe(DEFAULT_VISION_KEY);
  });

  it('NEVER overwrites an already-present vision_key (validated --vision-key via enrichFromVisionArch)', () => {
    const result = applyVisionKeyGapFill({ source: 'direct', vision_key: 'VISION-CLAIM-AUTOPROCEED-L2-001' });
    expect(result.vision_key).toBe('VISION-CLAIM-AUTOPROCEED-L2-001');
  });

  it('does not overwrite an inherited child vision_key', () => {
    const result = applyVisionKeyGapFill({ source: 'child', vision_key: 'VISION-PORTFOLIO-SYSTEM-001' });
    expect(result.vision_key).toBe('VISION-PORTFOLIO-SYSTEM-001');
  });
});
