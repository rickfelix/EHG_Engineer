/**
 * SD-LEO-INFRA-PRODUCT-PROMOTION-TARGET-REPO-001 — tests for repo routing on the
 * --from-roadmap-item promotion path: parse + validate --target-repos and translate it into the
 * promoted SD's target_application (primary repo) + metadata.target_repos overrides.
 */
import { describe, it, expect } from 'vitest';
import { parseTargetReposArg, buildPromotionRepoOverrides } from '../../scripts/leo-create-sd.js';

describe('parseTargetReposArg (reused on the roadmap-item route)', () => {
  it('normalizes case → canonical repo names', () => {
    expect(parseTargetReposArg('ehg')).toEqual(['EHG']);
    expect(parseTargetReposArg('EHG_Engineer')).toEqual(['EHG_Engineer']);
    expect(parseTargetReposArg('ehg,ehg_engineer')).toEqual(['EHG', 'EHG_Engineer']);
  });
  it('dedups and trims', () => {
    expect(parseTargetReposArg(' EHG , ehg ')).toEqual(['EHG']);
  });
  it('returns null for empty/missing', () => {
    expect(parseTargetReposArg(null)).toBeNull();
    expect(parseTargetReposArg('')).toBeNull();
    expect(parseTargetReposArg('   ')).toBeNull();
  });
});

describe('buildPromotionRepoOverrides', () => {
  it('routes a product roadmap item to EHG: primary → target_application, list → target_repos', () => {
    expect(buildPromotionRepoOverrides(['EHG'])).toEqual({ target_application: 'EHG', target_repos: ['EHG'] });
  });
  it('uses the FIRST repo as the primary target_application for a multi-repo list', () => {
    expect(buildPromotionRepoOverrides(['EHG', 'EHG_Engineer'])).toEqual({
      target_application: 'EHG',
      target_repos: ['EHG', 'EHG_Engineer'],
    });
  });
  it('returns {} (no override → createSD keeps its default) for empty/missing', () => {
    expect(buildPromotionRepoOverrides(null)).toEqual({});
    expect(buildPromotionRepoOverrides([])).toEqual({});
    expect(buildPromotionRepoOverrides(undefined)).toEqual({});
  });

  it('end-to-end: --target-repos EHG promotes to the product repo (parse → overrides)', () => {
    const parsed = parseTargetReposArg('ehg');               // CLI value
    const overrides = buildPromotionRepoOverrides(parsed);   // what createFromRoadmapItem applies
    expect(overrides.target_application).toBe('EHG');         // routes EXEC/gates/branch → rickfelix/ehg
    expect(overrides.target_repos).toEqual(['EHG']);
  });
});
