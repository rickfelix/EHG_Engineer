/**
 * QF-20260703-295 — sd-start.js claim gate did not check metadata.requires_human_action,
 * so a HELD SD was directly claimable (LIVE-HIT: worker claimed HELD
 * SD-EHG-PRODUCT-UIUX-REMEDIATION-001-A and had to self-release). Fix reuses
 * classifyDispatchIneligibility (the SSOT already enforced by the self-claim/sweep paths)
 * at both acquisition points in sd-start.js: the initial direct-claim fetch, and after
 * orchestrator child routing reassigns `sd` to a leaf.
 *
 * Static-pin pattern (mocking-independent), per tests/unit/sd-start-orch-routing-phase.test.js.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { classifyDispatchIneligibility } from '../../lib/fleet/claim-eligibility.cjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, '../..', 'scripts/sd-start.js'), 'utf8');

describe('QF-20260703-295: sd-start.js HELD-SD (requires_human_action) claim gate', () => {
  it('imports classifyDispatchIneligibility from the shared claim-eligibility SSOT', () => {
    expect(src).toMatch(/import\s*\{\s*classifyDispatchIneligibility\s*\}\s*from\s*['"]\.\.\/lib\/fleet\/claim-eligibility\.cjs['"]/);
  });

  it('defines enforceHumanActionGate, gated on human_action_required, that exits(1)', () => {
    const start = src.indexOf('function enforceHumanActionGate');
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start, start + 500);
    expect(body).toMatch(/classifyDispatchIneligibility\(sd\)\s*!==\s*['"]human_action_required['"]/);
    expect(body).toMatch(/process\.exit\(1\)/);
  });

  it('calls the gate right after the 1.1 deferred-claim check (direct/parent claim path)', () => {
    expect(src).toMatch(/do_not_advance_without_trigger[^]{0,2500}enforceHumanActionGate\(sd, effectiveId\)/);
  });

  it('re-calls the gate after orchestrator child routing reassigns sd to a leaf', () => {
    const idx = src.indexOf('Re-enforce cadence gate against the leaf');
    expect(idx).toBeGreaterThan(0);
    expect(src.slice(idx, idx + 600)).toMatch(/enforceHumanActionGate\(sd, effectiveId\)/);
  });

  it('classifyDispatchIneligibility flags a HELD sd (regression pin on the shared predicate)', () => {
    expect(classifyDispatchIneligibility({ metadata: { requires_human_action: true } })).toBe('human_action_required');
    expect(classifyDispatchIneligibility({ metadata: {} })).toBeNull();
  });
});
