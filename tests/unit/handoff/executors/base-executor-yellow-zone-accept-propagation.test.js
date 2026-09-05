/**
 * FR-9 (SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-A) regression lock, found by a LEAD-TO-PLAN
 * Explore sub-agent review: ValidationOrchestrator.validateGates() sets
 * `results.yellowZoneAccept` when it grants the GATE2-yellow-zone SD_TYPE_THRESHOLD accept,
 * but BaseExecutor.js's final success-return object (the ONLY thing that survives from the
 * raw gateResults to HandoffRecorder.recordSuccess()) is an EXPLICIT field allowlist
 * (gateResults, normalizedScore, totalScore, maxScore, gateCount, warnings) that silently
 * dropped yellowZoneAccept -- so the FR-9 audit stamp (metadata.yellow_zone_accept) would
 * never actually reach production despite both isolated unit tests
 * (validation-orchestrator-gate2-yellow-zone-accept.test.js,
 * handoff-recorder-yellow-zone-accept-stamp.test.js) passing, because neither exercises this
 * middle seam.
 *
 * A full BaseExecutor.execute() integration test is impractical here (850+ lines, multiple
 * dynamic imports of claim-validity-gate.js / ownership-detection.js / gate-skip-detection.js
 * requiring a near-complete environment mock) -- this is instead a source-text regression
 * lock on the exact return-object literal, so a future refactor that drops the field again
 * fails a test immediately rather than silently regressing a second time.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const filePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../scripts/modules/handoff/executors/BaseExecutor.js',
);

describe('BaseExecutor.js success-return object includes yellowZoneAccept', () => {
  it('the applyBypassToResult({...}) success-return object literal explicitly carries yellowZoneAccept from gateResults', () => {
    const src = readFileSync(filePath, 'utf8');
    const match = src.match(/return applyBypassToResult\(\{[\s\S]*?\}, bypassInfo\);/);
    expect(match, 'could not locate the applyBypassToResult({...}, bypassInfo) success-return statement -- has it moved or been renamed?').toBeTruthy();

    const returnBlock = match[0];
    expect(returnBlock).toMatch(/yellowZoneAccept\s*:\s*gateResults\.yellowZoneAccept/);
  });
});
