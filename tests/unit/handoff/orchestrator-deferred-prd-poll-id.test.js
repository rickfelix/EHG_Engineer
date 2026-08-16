/**
 * QF-20260816-506. _executeDeferredPrdGeneration's detached-mode (LLM_PRD_INLINE=false)
 * spawn writes with idToUse (sd.id || sdId, resolved UUID form) but the verification poll
 * used to query by the outer sdId (sd_key form) — add-prd-to-database.js persists sd_id as
 * the UUID, so a sd_key-keyed poll never matched a PRD that had, in fact, already been
 * created, burning the full 90s window and printing a misleading retry instruction.
 *
 * Full behavioral coverage (actually driving the detached spawn + poll loop) requires
 * mocking node:child_process, which reliably crashes vitest's fork-pool worker in this repo
 * (verified directly: any vi.mock('child_process', ...) — regardless of shape — produces
 * "Worker exited unexpectedly" with zero tests run). Reflecting on the real runtime function
 * object (not a text-file grep) is the safe alternative: it fails if the fix regresses, is
 * immune to unrelated edits elsewhere in the file, and requires no Node-builtin mocking.
 */
import { describe, it, expect } from 'vitest';
import { HandoffOrchestrator } from '../../../scripts/modules/handoff/HandoffOrchestrator.js';

describe('QF-20260816-506: _executeDeferredPrdGeneration polls by idToUse, not the outer sd_key', () => {
  it('the PRD-creation poll queries sd_id by idToUse, matching the spawn call', () => {
    const src = HandoffOrchestrator.prototype._executeDeferredPrdGeneration.toString();

    // idToUse is defined once, at the top of the method, from sd.id || sdId.
    expect(src).toMatch(/const\s+idToUse\s*=\s*sd\.id\s*\|\|\s*sdId/);

    // The verification poll's .eq('sd_id', ...) must reference idToUse.
    const eqMatch = src.match(/\.eq\(\s*['"]sd_id['"]\s*,\s*(\w+)\s*\)/);
    expect(eqMatch).not.toBeNull();
    expect(eqMatch[1]).toBe('idToUse');
  });
});
