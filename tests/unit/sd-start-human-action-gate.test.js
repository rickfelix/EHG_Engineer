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
  it('defines enforceHumanActionGate, keyed on the SPECIFIC human_action_required axis, that exits(1)', () => {
    // SD-ARCH-HOTSPOT-SD-START-001 FR-6/D6: the gate now routes through the shared
    // ALL-MATCH classifier (classifyAllDispatchIneligibility) and keys on
    // .includes('human_action_required') — the same never-miss-a-HELD-orchestrator
    // guarantee the old direct metadata check provided, now via one axis table.
    const start = src.indexOf('function enforceHumanActionGate');
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start, start + 1800);
    expect(body).toMatch(/classifyAllDispatchIneligibility\(sd \|\| \{\}\)/);
    expect(body).toMatch(/axes\.includes\('human_action_required'\)/);
    expect(body).toMatch(/process\.exit\(1\)/);
  });

  it('does NOT gate via the FIRST-MATCH classifier return value or a length>0 blanket (axis-precedence-masking regression, D6)', () => {
    const start = src.indexOf('function enforceHumanActionGate');
    const body = src.slice(start, start + 1800);
    // The first-match form short-circuits on orchestrator_parent/test_fixture_key
    // before human_action_required; a blanket length>0 would over-block routing.
    expect(body).not.toMatch(/classifyDispatchIneligibility\(/);
    expect(body).not.toMatch(/axes\.length\s*>\s*0/);
  });

  it('calls the gate right after the 1.1 deferred-claim check (direct/parent claim path)', () => {
    expect(src).toMatch(/do_not_advance_without_trigger[^]{0,2500}enforceHumanActionGate\(sd, effectiveId\)/);
  });

  it('re-calls the gate after orchestrator child routing reassigns sd to a leaf', () => {
    const idx = src.indexOf('Re-enforce cadence gate against the leaf');
    expect(idx).toBeGreaterThan(0);
    expect(src.slice(idx, idx + 600)).toMatch(/enforceHumanActionGate\(sd, effectiveId\)/);
  });

  it('regression pin: a HELD sd that is ALSO an orchestrator parent must still be refused', async () => {
    // Guards the exact gap the review-gate found: the FIRST-MATCH classifier returns
    // 'orchestrator_parent' (checked first), NOT 'human_action_required' — so a gate
    // keyed off that return value would silently let this combination through. The
    // ALL-MATCH classifier the gate now uses surfaces the hold regardless.
    const { createRequire } = await import('node:module');
    const cjsRequire = createRequire(import.meta.url);
    const { classifyDispatchIneligibility, classifyAllDispatchIneligibility } =
      cjsRequire('../../lib/fleet/claim-eligibility.cjs');
    const heldOrchestrator = { sd_type: 'orchestrator', metadata: { requires_human_action: true } };
    expect(classifyDispatchIneligibility(heldOrchestrator)).toBe('orchestrator_parent'); // the masking
    expect(classifyAllDispatchIneligibility(heldOrchestrator)).toContain('human_action_required'); // the fix
  });
});
