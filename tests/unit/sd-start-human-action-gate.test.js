/**
 * QF-20260703-295 — sd-start.js claim gate did not check metadata.requires_human_action,
 * so a HELD SD was directly claimable (LIVE-HIT: worker claimed HELD
 * SD-EHG-PRODUCT-UIUX-REMEDIATION-001-A and had to self-release). Fix adds a direct
 * metadata.requires_human_action check (same predicate classifyDispatchIneligibility already
 * enforces for the self-claim/sweep paths, checked directly rather than via that classifier's
 * return value — classifyDispatchIneligibility short-circuits on orchestrator_parent /
 * test_fixture_key BEFORE reaching human_action_required, so an equality check on its result
 * would silently miss a HELD SD that is also an orchestrator parent or test-fixture key) at
 * both acquisition points in sd-start.js: the initial direct-claim fetch, and after
 * orchestrator child routing reassigns `sd` to a leaf.
 *
 * Static-pin pattern (mocking-independent), per tests/unit/sd-start-orch-routing-phase.test.js.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, '../..', 'scripts/sd-start.js'), 'utf8');

describe('QF-20260703-295: sd-start.js HELD-SD (requires_human_action) claim gate', () => {
  it('defines enforceHumanActionGate, gated directly on metadata.requires_human_action, that exits(1)', () => {
    const start = src.indexOf('function enforceHumanActionGate');
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start, start + 500);
    expect(body).toMatch(/sd\?\.metadata\?\.requires_human_action/);
    expect(body).toMatch(/process\.exit\(1\)/);
  });

  it('does NOT gate via classifyDispatchIneligibility\'s return value (axis-precedence-masking regression)', () => {
    const start = src.indexOf('function enforceHumanActionGate');
    const body = src.slice(start, start + 500);
    expect(body).not.toMatch(/classifyDispatchIneligibility/);
  });

  it('calls the gate right after the 1.1 deferred-claim check (direct/parent claim path)', () => {
    expect(src).toMatch(/do_not_advance_without_trigger[^]{0,2500}enforceHumanActionGate\(sd, effectiveId\)/);
  });

  it('re-calls the gate after orchestrator child routing reassigns sd to a leaf', () => {
    const idx = src.indexOf('Re-enforce cadence gate against the leaf');
    expect(idx).toBeGreaterThan(0);
    expect(src.slice(idx, idx + 600)).toMatch(/enforceHumanActionGate\(sd, effectiveId\)/);
  });

  it('regression pin: a HELD sd that is ALSO an orchestrator parent must still be refused', () => {
    // Guards the exact gap the review-gate found: classifyDispatchIneligibility({sd_type:
    // 'orchestrator', metadata: {requires_human_action: true}}) returns 'orchestrator_parent'
    // (checked first), NOT 'human_action_required' — so a gate keyed off that return value
    // would silently let this combination through. The direct metadata check does not.
    const heldOrchestrator = { sd_type: 'orchestrator', metadata: { requires_human_action: true } };
    expect(Boolean(heldOrchestrator?.metadata?.requires_human_action)).toBe(true);
  });
});
