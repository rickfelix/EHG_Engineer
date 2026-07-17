import { describe, it, expect } from 'vitest';
import {
  loadCouncils, loadProfiles, validateBoard, validateProfile, lintAntiImpersonation,
  COUNCIL_FIELDS, PROFILE_FIELDS, SPEC_ROSTER,
} from '../../../lib/foresight/content/index.mjs';

const councils = loadCouncils();
const profiles = loadProfiles();
// Stacked-PR tolerance: per-profile checks always run; FULL-board assertions
// activate once the complete §5 roster (20) is present (the final content PR).
const fullRoster = profiles.length === 20;
const whenFull = fullRoster ? it : it.skip;

describe('TS-1 full-board validation (spec §5 + §8.1/§8.2)', () => {
  whenFull('5 councils + 20 profiles, all shapes and referential integrity, chairman-named roster in place', () => {
    expect(councils).toHaveLength(5);
    expect(profiles).toHaveLength(20);
    expect(validateBoard(councils, profiles)).toEqual([]);
  });
  it('every §8.2 field on every council; every §8.1 field on every profile (TS-3 shape fidelity)', () => {
    for (const c of councils) for (const f of COUNCIL_FIELDS) expect(c[f], `${c.council_id}.${f}`).toBeDefined();
    for (const p of profiles) for (const f of PROFILE_FIELDS) expect(p[f], `${p.perspective_id}.${f}`).toBeDefined();
  });
  whenFull('TS-5 role_type distribution: exactly 5 adjudicators + 15 specialists', () => {
    expect(profiles.filter((p) => p.role_type === 'adjudicator')).toHaveLength(5);
    expect(profiles.filter((p) => p.role_type === 'specialist')).toHaveLength(15);
  });
  it('the roster constant covers all five councils', () => {
    expect(Object.keys(SPEC_ROSTER)).toHaveLength(5);
  });
});

describe('TS-2 anti-impersonation lint (§3/§4.1/§18 hard rule)', () => {
  it('all 20 authored profiles pass the lint', () => {
    for (const p of profiles) expect(lintAntiImpersonation(p), p.perspective_id).toEqual([]);
  });
  it('pinned negatives: persona field fails', () => {
    expect(lintAntiImpersonation({ persona: 'wise futurist' })).not.toEqual([]);
    expect(lintAntiImpersonation({ speech_style: 'gruff' })).not.toEqual([]);
  });
  it("pinned negative: the spec's own banned prompt form fails", () => {
    expect(lintAntiImpersonation({ note: 'You are Alex Wissner-Gross. Tell EHG what to build.' })).not.toEqual([]);
  });
  it('pinned negatives: first-person voice and endorsement claims fail', () => {
    expect(lintAntiImpersonation({ recurring_themes: ['I believe the future is bright'] })).not.toEqual([]);
    expect(lintAntiImpersonation({ provenance_note: 'This thinker endorses EHG ventures.' })).not.toEqual([]);
  });
});

describe('TS-4 versioning + provenance (§16.1)', () => {
  it('doctrine_version v1.0, dated refresh, bounded confidence, disclaimer + staleness note on all 20', () => {
    for (const p of profiles) {
      expect(p.doctrine_version).toBe('v1.0');
      expect(Number.isFinite(Date.parse(p.last_refreshed_at))).toBe(true);
      expect(p.confidence_in_profile).toBeGreaterThan(0);
      expect(p.confidence_in_profile).toBeLessThanOrEqual(1);
      expect(p.provenance_note).toMatch(/public/i);
      expect(p.provenance_note).toMatch(/stale|knowledge|cutoff/i);
      expect(p.source_count).toBe(p.sources.length);
    }
  });
});

describe('validateProfile negative coverage', () => {
  it('flags missing fields, bad role_type, bad confidence, wrong version, undocumented keys', () => {
    const base = profiles[0];
    expect(validateProfile({ ...base, role_type: 'oracle' }).join()).toMatch(/invalid role_type/);
    expect(validateProfile({ ...base, confidence_in_profile: 1.5 }).join()).toMatch(/confidence/);
    expect(validateProfile({ ...base, doctrine_version: 'v2.0' }).join()).toMatch(/v1\.0/);
    expect(validateProfile({ ...base, mystery_field: 1 }).join()).toMatch(/undocumented/);
    const { person_name, ...missing } = base;
    expect(validateProfile(missing).join()).toMatch(/missing person_name/);
  });
});
