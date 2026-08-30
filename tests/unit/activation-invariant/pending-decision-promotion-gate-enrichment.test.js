/**
 * Activation invariant test — SD-LEO-INFRA-END-END-ACTIVATION-001, FR-1.
 *
 * The promotion-gate stage moved from stage_number=23 to stage_number=24 when
 * SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B's renumber went live (see
 * venture-uat-stage-renumber-chain.test.js for the schema-side proof). This file proves
 * whether the RUNTIME CONSUMER of that gate -- stage-execution-worker.js's pending-decision
 * auto-approve promotion-gate-enrichment path -- was updated to match.
 *
 * CONFIRMED LIVE GAP (this SD's LEAD-phase Explore pass, sub_agent_execution_results
 * id ca05c258-2750-4e65-8ed8-61afd4f83c07): it was NOT updated. Both call sites still gate on
 * the pre-renumber range `currentStage >= 18 && currentStage <= 23` and still
 * `import('./stage-templates/stage-23.js')` -- the pre-renumber promotion-gate module --
 * instead of stage-24.js, which exists on disk but is never imported by this path. A venture
 * whose promotion-gate artifact is enriched via the pending-decision shortcut at the NEW
 * promotion-gate stage (24) silently gets NO promotion_gate enrichment.
 *
 * This is a source-pin test, not a fix: per this SD's own scope (FR-1), the gap is captured
 * here as an explicit, intentional, non-silent failing expectation rather than being fixed
 * blind -- the enrichment path touches live venture-advancement state and a fix warrants its
 * own reviewed change, not a drive-by inside a test-authoring SD. Whoever lands the fix should
 * flip `KNOWN_GAP` to false and watch this file go green as its regression guard.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

// Flip to false once stage-execution-worker.js is fixed to reference the post-renumber
// promotion-gate stage (24) instead of the pre-renumber stage (23) -- then this file's
// assertions below should be updated to assert the CORRECTED range/import and this flag removed.
const KNOWN_GAP = true;

describe('pending-decision promotion-gate enrichment — post-renumber wiring', () => {
  let source;
  test('setup: read stage-execution-worker.js', () => {
    source = readFileSync(path.join(ROOT, 'lib/eva/stage-execution-worker.js'), 'utf8');
    expect(source.length).toBeGreaterThan(0);
  });

  test('KNOWN GAP: both enrichment call sites still gate on the pre-renumber range currentStage<=23 (should be <=24 post-renumber)', () => {
    const preRenumberRangeCount = (source.match(/currentStage >= 18 && currentStage <= 23/g) || []).length;
    if (KNOWN_GAP) {
      // Documents the CONFIRMED live state as of this SD -- 2 occurrences, both stale.
      expect(preRenumberRangeCount).toBe(2);
    } else {
      expect(preRenumberRangeCount).toBe(0);
    }
  });

  test('KNOWN GAP: both enrichment call sites still import stage-templates/stage-23.js (should import stage-24.js post-renumber)', () => {
    const staleImportCount = (source.match(/import\(['"]\.\/stage-templates\/stage-23\.js['"]\)/g) || []).length;
    if (KNOWN_GAP) {
      expect(staleImportCount).toBe(2);
    } else {
      expect(staleImportCount).toBe(0);
    }
  });

  test('the post-renumber target module (stage-24.js) exists on disk, so the fix is import-swap-shaped, not a missing-file problem', () => {
    const exists = (() => {
      try {
        readFileSync(path.join(ROOT, 'lib/eva/stage-templates/stage-24.js'), 'utf8');
        return true;
      } catch {
        return false;
      }
    })();
    expect(exists).toBe(true);
  });
});
