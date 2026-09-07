/**
 * QF-20260905-822 — scripts/sd-start.js's hasParentNeedsOwnPlanToExec helper + routing wiring.
 *
 * leo_protocol_sections 439: "Parent setup handoffs are seat-run once, before the first child" —
 * a parent past LEAD-TO-PLAN but short of its own accepted PLAN-TO-EXEC still needs that setup
 * handoff run before any child is claimable. Before this fix, sd-start.js only detected a
 * missing LEAD-TO-PLAN (hasParentNeedsOwnLeadToPlan) and otherwise auto-routed straight to a
 * child once LEAD-TO-PLAN was accepted, silently skipping the parent's own PLAN-TO-EXEC — a seat
 * had to release and re-claim with --parent --confirm to reach it.
 *
 * Static-pin pattern (mocking-independent), matching this repo's own established convention for
 * this file (tests/unit/sd-start-orch-routing-phase.test.js) — but with a WORKING end-boundary
 * marker: that sibling file's own `getOrchestratorChildren` end-anchor pins the substring
 * '\nasync function getOrchestratorChildren', while the real declaration is a plain (non-async)
 * `function getOrchestratorChildren` — that mismatch already makes the sibling's helperRegion
 * empty on unmodified origin/main (verified), unrelated to and unaffected by this QF. This file
 * anchors on this QF's OWN function boundaries instead.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SD_START_PATH = resolve(__dirname, '..', '..', 'scripts/sd-start.js');
const src = readFileSync(SD_START_PATH, 'utf8');

const helperStartIdx = src.indexOf('async function hasParentNeedsOwnPlanToExec');
const helperEndIdx = helperStartIdx >= 0
  ? src.indexOf('SD-ARCH-HOTSPOT-SD-START-001 FR-5', helperStartIdx)
  : -1;
const helperRegion = helperStartIdx >= 0 && helperEndIdx > helperStartIdx
  ? src.slice(helperStartIdx, helperEndIdx)
  : '';

describe('hasParentNeedsOwnPlanToExec helper definition', () => {
  it('exists, defined as async, in scripts/sd-start.js', () => {
    expect(helperStartIdx).toBeGreaterThan(0);
    expect(helperRegion).toMatch(/async\s+function\s+hasParentNeedsOwnPlanToExec/);
  });

  it('gates on sd.sd_type and sd.current_phase (mirrors hasParentNeedsOwnLeadToPlan\'s shape)', () => {
    expect(helperRegion).toMatch(/sd\.sd_type/);
    expect(helperRegion).toMatch(/sd\.current_phase/);
  });

  it('checks the PLAN phase (the destination of an accepted LEAD-TO-PLAN), not LEAD', () => {
    expect(helperRegion).toMatch(/current_phase\s*!==?\s*['"]PLAN['"]/);
  });

  it('returns false early for non-orchestrator types before any DB query', () => {
    expect(helperRegion).toMatch(/sd\.sd_type\s*!==?\s*['"]orchestrator['"][^]{0,80}return\s+false/);
  });

  it('queries sd_phase_handoffs for an accepted PLAN-TO-EXEC row, keyed on sd.id (UUID)', () => {
    expect(helperRegion).toMatch(
      /from\(['"]sd_phase_handoffs['"]\)[\s\S]{0,400}handoff_type[\s\S]{0,400}PLAN-TO-EXEC[\s\S]{0,400}status[\s\S]{0,200}['"]accepted['"]/
    );
    expect(helperRegion).toMatch(/\.eq\(['"]sd_id['"]\s*,\s*sd\.id\)/);
  });

  it('FAIL-LOUD: throws on a PostgrestError rather than silently returning false', () => {
    expect(helperRegion).toMatch(/if\s*\(\s*error\s*\)\s*\{[\s\S]{0,400}throw\s+new\s+Error/);
    expect(helperRegion).toMatch(/hasParentNeedsOwnPlanToExec/);
  });
});

describe('routing wiring: both parent-setup guards combined at the decision points', () => {
  it('the automatic route-to-leaf fallthrough checks hasParentNeedsOwnPlanToExec as an else-if sibling of the LEAD-TO-PLAN guard', () => {
    const blockMarker = src.indexOf('Orchestrator detection');
    expect(blockMarker).toBeGreaterThan(0);
    const slice = src.slice(blockMarker, blockMarker + 4500);
    expect(slice).toMatch(/hasParentNeedsOwnLeadToPlan\(sd\)/);
    expect(slice).toMatch(/\}\s*else if\s*\(await hasParentNeedsOwnPlanToExec\(sd\)\)/);
    expect(slice).toMatch(/own PLAN-TO-EXEC required/i);
  });

  it('the --parent flag safety check ORs both guards, so --parent alone is allowed when EITHER setup handoff is pending', () => {
    expect(src).toMatch(
      /const parentNeeds = \(await hasParentNeedsOwnLeadToPlan\(sd\)\) \|\| \(await hasParentNeedsOwnPlanToExec\(sd\)\)/
    );
  });

  it('references leo_protocol_sections 439 in the operator-facing message for traceability', () => {
    expect(src).toMatch(/own PLAN-TO-EXEC required[\s\S]{0,300}leo_protocol_sections 439/);
  });
});
