/**
 * Regression test for PLAN-TO-LEAD SD status hardening
 * SD: SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-126 (Phase 2)
 * Pattern: PAT-HF-LEADFINALAPPROVAL-d94c34d8
 *
 * Before fix: state-transitions.js:449-466 logged a warning on SD UPDATE failure
 * but continued — downstream LEAD-FINAL-APPROVAL failed with confusing
 * "SD status must be 'pending_approval'" error (3 recorded occurrences).
 *
 * After fix:
 *   (a) state-transitions.js throws on sdError or !sdUpdateResult
 *   (b) lead-final-approval/index.js detects silent-failure state (PLAN-TO-LEAD
 *       accepted but SD.status still draft) and surfaces a targeted error.
 *
 * This is a unit-level assertion of the SHAPE of those behaviors — full
 * integration is covered by handoff system tests.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL(import.meta.url).pathname.replace(/^\//, ''), '../../../..');

function readSource(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

describe('PLAN-TO-LEAD SD status hardening (PAT-HF-LEADFINALAPPROVAL-d94c34d8)', () => {
  it('state-transitions.js throws on sdError (not warn-and-continue)', () => {
    const src = readSource('scripts/modules/handoff/executors/plan-to-lead/state-transitions.js');
    // Must contain a throw statement referencing the pattern ID or sdError in the SD-update block
    expect(src).toMatch(/if\s*\(\s*sdError\s*\)\s*\{[^}]*throw new Error/);
  });

  it('state-transitions.js throws on silent empty-result (!sdUpdateResult)', () => {
    const src = readSource('scripts/modules/handoff/executors/plan-to-lead/state-transitions.js');
    expect(src).toMatch(/if\s*\(\s*!sdUpdateResult\s*\)\s*\{[^}]*throw new Error/);
  });

  it('lead-final-approval detects silent-failure scenario', () => {
    const src = readSource('scripts/modules/handoff/executors/lead-final-approval/index.js');
    expect(src).toContain('silentFailureDetected');
  });

  it('lead-final-approval silent-failure diagnostic mentions remediation', () => {
    const src = readSource('scripts/modules/handoff/executors/lead-final-approval/index.js');
    expect(src).toMatch(/silentFailureDetected:\s*true/);
    expect(src).toMatch(/silent pre-fix failure|Remediation:/);
  });

  it('references pattern id in fix comments', () => {
    const srcSt = readSource('scripts/modules/handoff/executors/plan-to-lead/state-transitions.js');
    const srcLfa = readSource('scripts/modules/handoff/executors/lead-final-approval/index.js');
    expect(srcSt).toContain('PAT-HF-LEADFINALAPPROVAL-d94c34d8');
    expect(srcLfa).toContain('PAT-HF-LEADFINALAPPROVAL-d94c34d8');
  });
});
