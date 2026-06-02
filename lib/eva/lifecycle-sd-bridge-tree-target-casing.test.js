/**
 * QF-20260602-280: a venture SD tree must carry ONE target_application casing.
 *
 * Root cause: the sprint ROOT orchestrator was stamped from ventureContext.name (display
 * form, e.g. "DataDistill") while DESCENDANTS resolved payload.target_application from the
 * registry slug ("datadistill"), and normalizeTargetApplication only canonicalizes
 * ehg/ehg_engineer — so DataDistill's tree fragmented into root="DataDistill" + 25
 * descendants="datadistill". resolveTreeTargetApplication() collapses the casing to the
 * venture display name when the per-SD value is the same venture (case-insensitive) or
 * absent, while preserving a genuine cross-application per-SD target.
 */
import { describe, it, expect } from 'vitest';
import { _internal } from './lifecycle-sd-bridge.js';

const { resolveTreeTargetApplication, normalizeTargetApplication } = _internal;

describe('resolveTreeTargetApplication — one casing per venture tree (QF-20260602-280)', () => {
  it('collapses the registry slug to the venture display name', () => {
    expect(resolveTreeTargetApplication('datadistill', 'DataDistill')).toBe('DataDistill');
  });

  it('leaves the display form unchanged', () => {
    expect(resolveTreeTargetApplication('DataDistill', 'DataDistill')).toBe('DataDistill');
  });

  it('uses the venture display name when the per-SD target is absent', () => {
    expect(resolveTreeTargetApplication(null, 'DataDistill')).toBe('DataDistill');
    expect(resolveTreeTargetApplication(undefined, 'DataDistill')).toBe('DataDistill');
    expect(resolveTreeTargetApplication('', 'DataDistill')).toBe('DataDistill');
  });

  it('ROOT and DESCENDANT inputs now yield the SAME value (the core regression)', () => {
    const root = resolveTreeTargetApplication('DataDistill', 'DataDistill');   // root site input
    const child = resolveTreeTargetApplication('datadistill', 'DataDistill');  // descendant slug input
    expect(child).toBe(root);
    expect(root).toBe('DataDistill');
  });

  it('preserves a genuine cross-application per-SD target (not the same venture)', () => {
    expect(resolveTreeTargetApplication('EHG', 'DataDistill')).toBe('EHG');
    // and still canonicalizes ehg/ehg_engineer casing on that cross-app target
    expect(resolveTreeTargetApplication('ehg', 'DataDistill')).toBe('EHG');
    expect(resolveTreeTargetApplication('ehg_engineer', 'DataDistill')).toBe('EHG_Engineer');
  });

  it('still applies the ehg/ehg_engineer canonical-case map (QF-20260504-716 intact)', () => {
    expect(normalizeTargetApplication('ehg')).toBe('EHG');
    expect(normalizeTargetApplication('ehg_engineer')).toBe('EHG_Engineer');
    // a venture slug with no display context passes through unchanged (unchanged behavior)
    expect(normalizeTargetApplication('datadistill')).toBe('datadistill');
  });
});
