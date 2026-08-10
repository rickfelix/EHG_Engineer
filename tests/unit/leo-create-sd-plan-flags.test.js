// SD-LEO-INFRA-LEO-CREATE-PLAN-001: --depends-on + --roadmap-link-reason on the
// --from-plan lane. Incorporates the PLAN-phase TESTING gaps (evidence 5d2cc8fc):
//   GAP-1: pins are PER-FILE/PER-BLOCK anchored windows, never a whole-source contains
//          (scripts/leo-create-sd.js already contained '--depends-on' via the child lane,
//          so an unanchored contains was green before the plan lane gained the flag).
//   GAP-2: the comma-split contract is pinned — without split(','), SD-A,SD-B lands ONE
//          malformed dep {sd_id:"SD-A,SD-B"} that fails soft (born silently unfenced).
//   GAP-3: the child-lane surface now normalizes OBJECT entries (behavior-widening half
//          of the de-dupe), asserted as behavior, not just source.
//   GAP-4: knownPlanFlags.has(flag) is UNREACHABLE for flag tokens in the planPath
//          predicate (short-circuits on !startsWith('-')); only flagValuePositions stops
//          a flag VALUE being absorbed as planPath — so the pins target the
//          flagValuePositions array literal specifically, not Set membership.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeDependsOn as fromChild } from '../../lib/sd-creation/source-adapters/child.js';
import { normalizeDependsOn as canonical } from '../../scripts/modules/leo-create-sd/proposal-lanes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.resolve(__dirname, p), 'utf-8');

describe('FR-3: one canonical normalizeDependsOn', () => {
  it('child.js re-exports the SAME function object as proposal-lanes (identity, not similarity)', () => {
    // Reference identity is the strongest possible de-dupe assertion: a re-divergent
    // copy cannot pass it no matter how behaviorally close it starts out.
    expect(fromChild).toBe(canonical);
  });

  it('bare-string behavior unchanged (the behavior-preserving half)', () => {
    expect(fromChild(['SD-A', ' SD-B ', '', null])).toEqual([{ sd_id: 'SD-A' }, { sd_id: 'SD-B' }]);
    expect(fromChild(undefined)).toEqual([]);
    expect(fromChild([])).toEqual([]);
  });

  it('object entries now normalize through the child surface (GAP-3: the widening half)', () => {
    // The old child.js copy filtered typeof entry === 'string' and silently DROPPED these.
    expect(fromChild([{ sd_id: 'SD-A' }, { sd_key: 'SD-B' }])).toEqual([{ sd_id: 'SD-A' }, { sd_id: 'SD-B' }]);
  });

  it('exactly one definition exists across the creation lanes (child.js only re-exports)', () => {
    const childSrc = read('../../lib/sd-creation/source-adapters/child.js');
    expect(childSrc).not.toMatch(/function\s+normalizeDependsOn/);
    const lanesSrc = read('../../scripts/modules/leo-create-sd/proposal-lanes.js');
    expect(lanesSrc).toMatch(/export function normalizeDependsOn/);
  });
});

describe('CLI plan-branch wiring (anchored per-block pins, GAP-1/GAP-2/GAP-4)', () => {
  let cli;
  beforeAll(() => {
    cli = read('../../scripts/leo-create-sd.js');
  });

  function planBranchWindow() {
    // Anchor inside the plan branch specifically — the child lane also parses
    // --depends-on, so an unanchored search proves nothing about this lane.
    const idx = cli.indexOf('const dependsOnIdxPlan');
    expect(idx).toBeGreaterThan(0);
    return cli.slice(idx, idx + 2500);
  }

  it('parses --depends-on with the comma-split contract (GAP-2)', () => {
    const w = planBranchWindow();
    expect(w).toMatch(/args\.indexOf\('--depends-on'\)/);
    expect(w).toMatch(/\.split\(','\)\.map\(\s*\(k\)\s*=>\s*k\.trim\(\)\s*\)\.filter\(Boolean\)/);
  });

  it('registers BOTH new flag values in flagValuePositions (GAP-4: the only guard that is reachable)', () => {
    const w = planBranchWindow();
    const arrStart = w.indexOf('const flagValuePositions');
    expect(arrStart).toBeGreaterThan(0);
    const arr = w.slice(arrStart, arrStart + 900);
    expect(arr).toMatch(/dependsOnIdxPlan\s*!==\s*-1\s*\?\s*dependsOnIdxPlan\s*\+\s*1/);
    expect(arr).toMatch(/linkReasonIdxPlan\s*!==\s*-1\s*\?\s*linkReasonIdxPlan\s*\+\s*1/);
  });

  it('registers both flags in knownPlanFlags (per-block, not whole-file: GAP-1)', () => {
    const w = planBranchWindow();
    const setStart = w.indexOf('const knownPlanFlags = new Set');
    expect(setStart).toBeGreaterThan(0);
    const block = w.slice(setStart, setStart + 400);
    expect(block).toMatch(/'--depends-on'/);
    expect(block).toMatch(/'--roadmap-link-reason'/);
  });

  it('threads both values into the createFromPlan overrides bag', () => {
    const idx = cli.indexOf('const planRes = await createFromPlan(');
    expect(idx).toBeGreaterThan(0);
    const block = cli.slice(idx, idx + 600);
    expect(block).toMatch(/dependsOn:\s*dependsOnPlan/);
    expect(block).toMatch(/roadmapLinkReason:\s*roadmapLinkReasonPlan/);
  });

  it('help text no longer claims --depends-on is child-only (FR-4)', () => {
    expect(cli).not.toMatch(/--depends-on <list>\s+\(--child only\)/);
    expect(cli).toMatch(/--roadmap-link-reason/);
  });
});

describe('plan adapter passthrough (both directions, anchored in plan.js source)', () => {
  let src;
  beforeAll(() => {
    src = read('../../lib/sd-creation/source-adapters/plan.js');
  });

  it('dependencies set ONLY when normalized list is non-empty (flag-absent payload byte-identical)', () => {
    const idx = src.indexOf('overrides.dependsOn');
    expect(idx).toBeGreaterThan(0);
    const w = src.slice(idx - 200, idx + 500);
    expect(w).toMatch(/normalizeDependsOn\(overrides\.dependsOn\)/);
    expect(w).toMatch(/deps\.length\s*>\s*0/);
    expect(w).toMatch(/createOptions\.dependencies\s*=\s*deps/);
  });

  it('roadmap_link_reason set only for non-blank strings, mirroring the direct lane', () => {
    const idx = src.indexOf('overrides.roadmapLinkReason');
    expect(idx).toBeGreaterThan(0);
    const w = src.slice(idx - 100, idx + 400);
    expect(w).toMatch(/typeof overrides\.roadmapLinkReason === 'string'/);
    expect(w).toMatch(/createOptions\.roadmap_link_reason\s*=\s*overrides\.roadmapLinkReason/);
  });

  it('imports the canonical normalizeDependsOn (no local copy)', () => {
    expect(src).toMatch(/import \{ normalizeDependsOn \} from '\.\.\/\.\.\/\.\.\/scripts\/modules\/leo-create-sd\/proposal-lanes\.js'/);
    expect(src).not.toMatch(/function\s+normalizeDependsOn/);
  });
});
