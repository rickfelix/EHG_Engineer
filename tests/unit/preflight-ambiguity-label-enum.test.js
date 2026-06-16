/**
 * Preflight ambiguity-marker classification-label-enum false-positive regression
 * SD-LEO-INFRA-PREFLIGHT-AMBIGUITY-LABEL-FP-001
 *
 * The implementation-fidelity preflight scans committed diffs for ambiguity markers
 * (unclear/ambiguous/FIXME/...). The 'unclear' pattern guards with lookarounds that
 * exclude only [a-z-], so the deliberate assessment-label enum
 * 'redundant/unclear/orphaned/adequate' (slash-delimited) false-tripped AMBIGUITY_RESOLUTION
 * (harness_backlog f5090617 / 7d1401d8). The fix neutralizes ONLY slash-delimited runs of
 * 2+ known labels before the scan; bare prose and comma-joined runs still gate.
 *
 * Pure: imports the exported helper, no DB / git / I/O.
 */
import { describe, it, expect } from 'vitest';
import { stripClassificationLabelEnums } from '../../scripts/modules/implementation-fidelity/preflight/index.js';

// Mirrors the production 'unclear' ambiguity pattern at preflight/index.js (the marker the
// enum falsely tripped). We assert the helper's effect on THIS exact marker.
const UNCLEAR_MARKER = () => /(?<![a-z-])unclear(?![a-z-])/gi;
// scan() models the production loop: neutralize first, then match the marker.
const scanTripsUnclear = (text) => UNCLEAR_MARKER().test(stripClassificationLabelEnums(text));

describe('stripClassificationLabelEnums — slash label-enum FP fix (FR-1/FR-2/FR-3)', () => {
  it('(a) the slash label enum does NOT trip the unclear marker (FP fixed)', () => {
    const diff = '+ | surface | redundant/unclear/orphaned/adequate |';
    expect(scanTripsUnclear(diff)).toBe(false);
    // the enum substring is replaced by the inert placeholder
    expect(stripClassificationLabelEnums(diff)).not.toContain('unclear');
  });

  it('(a2) slash enum with surrounding whitespace and 2-label runs also neutralized', () => {
    expect(scanTripsUnclear('+ assessed redundant / unclear / orphaned')).toBe(false);
    expect(scanTripsUnclear('+ verdict: unclear/redundant')).toBe(false);
  });

  it('(b) bare prose "this requirement is unclear" STILL trips the gate (no gate hole)', () => {
    expect(scanTripsUnclear('+ // this requirement is unclear')).toBe(true);
  });

  it('(c) comma-joined "status was unclear, redundant" STILL trips (comma not neutralized — explicit conservative behavior)', () => {
    expect(scanTripsUnclear('+ status was unclear, redundant')).toBe(true);
  });

  it('a single bare label is untouched (no 2+ slash run) and still trips if it is a marker', () => {
    // a lone "unclear" not in a slash run is left intact → still trips
    expect(scanTripsUnclear('+ result was unclear')).toBe(true);
    // a lone non-marker label (e.g. "redundant") is irrelevant to the unclear marker
    expect(stripClassificationLabelEnums('+ this is redundant')).toContain('redundant');
  });

  it('non-string / empty input returns the input unchanged (pure, defensive)', () => {
    expect(stripClassificationLabelEnums('')).toBe('');
    expect(stripClassificationLabelEnums(null)).toBe(null);
    expect(stripClassificationLabelEnums(undefined)).toBe(undefined);
  });
});
