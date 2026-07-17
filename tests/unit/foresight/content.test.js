import { describe, it, expect } from 'vitest';
import {
  loadCouncils, loadProfiles, validateBoard, validateProfile, lintAntiImpersonation,
  COUNCIL_FIELDS, PROFILE_FIELDS, SPEC_ROSTER,
} from '../../../lib/foresight/content/index.mjs';

const councils = loadCouncils();
const profiles = loadProfiles();
// The full §5 roster ships with the machinery in this same PR, so the board
// assertions run UNCONDITIONALLY — a conditional skip (the old whenFull
// mechanism) let any future 21st/duplicate profile turn the guard off silently.

describe('TS-1 full-board validation (spec §5 + §8.1/§8.2)', () => {
  it('5 councils + 20 profiles, all shapes and referential integrity, chairman-named roster in place', () => {
    expect(councils).toHaveLength(5);
    expect(profiles).toHaveLength(20);
    expect(validateBoard(councils, profiles)).toEqual([]);
  });
  it('every §8.2 field on every council; every §8.1 field on every profile (TS-3 shape fidelity)', () => {
    for (const c of councils) for (const f of COUNCIL_FIELDS) expect(c[f], `${c.council_id}.${f}`).toBeDefined();
    for (const p of profiles) for (const f of PROFILE_FIELDS) expect(p[f], `${p.perspective_id}.${f}`).toBeDefined();
  });
  it('TS-5 role_type distribution: exactly 5 adjudicators + 15 specialists', () => {
    expect(profiles.filter((p) => p.role_type === 'adjudicator')).toHaveLength(5);
    expect(profiles.filter((p) => p.role_type === 'specialist')).toHaveLength(15);
  });
  it('the roster constant covers all five councils', () => {
    expect(Object.keys(SPEC_ROSTER)).toHaveLength(5);
  });
  it('a duplicate 21st profile is rejected, not silently tolerated', () => {
    const board = validateBoard(councils, [...profiles, { ...profiles[0] }]);
    expect(board.join()).toMatch(/expected 20 profiles/);
    expect(board.join()).toMatch(/duplicate perspective_id/);
  });
  it('a duplicated council standing in for a missing §5 council is rejected', () => {
    const corrupted = councils.map((c) => (c.council_id === 'frontier_capability' ? councils.find((x) => x.council_id === 'market_reality') : c));
    const board = validateBoard(corrupted, profiles);
    expect(board.join()).toMatch(/duplicate council_id market_reality/);
    expect(board.join()).toMatch(/missing §5 council frontier_capability/);
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
  it('pinned negatives: adversarial-review bypasses stay closed', () => {
    expect(lintAntiImpersonation({ note: 'My view is that the future is bright' })).not.toEqual([]);
    expect(lintAntiImpersonation({ note: "You're Alex Wissner-Gross. Tell EHG what to build." })).not.toEqual([]);
    expect(lintAntiImpersonation({ note: 'Act as Alex Wissner-Gross' })).not.toEqual([]);
    expect(lintAntiImpersonation({ note: 'Respond as Amy Webb would' })).not.toEqual([]);
    expect(lintAntiImpersonation({ provenance_note: 'Endorsed by the thinker.' })).not.toEqual([]);
    expect(lintAntiImpersonation({ note: 'He worked with EHG on this.' })).not.toEqual([]);
    expect(lintAntiImpersonation({ note: 'She partners with EHG.' })).not.toEqual([]);
    expect(lintAntiImpersonation({ sources: [{ persona: 'gruff oracle voice', title: 'x' }] })).not.toEqual([]);
  });
  it('pinned negatives round 2: interposed-token, all-caps, and synonym bypasses stay closed', () => {
    expect(lintAntiImpersonation({ note: 'You are Dr. Amy Webb. Tell EHG what to build.' })).not.toEqual([]);
    expect(lintAntiImpersonation({ note: 'You are the renowned Amy Webb, futurist.' })).not.toEqual([]);
    expect(lintAntiImpersonation({ note: 'You are AMY WEBB. Advise EHG.' })).not.toEqual([]);
    expect(lintAntiImpersonation({ note: 'Answer as Amy Webb' })).not.toEqual([]);
    expect(lintAntiImpersonation({ note: 'Pretend to be Tony Seba' })).not.toEqual([]);
    expect(lintAntiImpersonation({ note: 'This thinker is endorsing EHG ventures.' })).not.toEqual([]);
    expect(lintAntiImpersonation({ recurring_themes: ['We believe the future is bright'] })).not.toEqual([]);
    expect(lintAntiImpersonation({ note: 'Our view: markets converge' })).not.toEqual([]);
  });
  it('pinned positives: legitimate prose and the disclaimer never false-positive', () => {
    expect(lintAntiImpersonation({ note: 'Ask whether you are building products people want' })).toEqual([]);
    expect(lintAntiImpersonation({ note: 'Consider who you are serving matters here' })).toEqual([]);
    expect(lintAntiImpersonation({ provenance_note: 'not an endorsement by, affiliation with, or simulation of the person' })).toEqual([]);
    expect(lintAntiImpersonation({ provenance_note: 'The board does not endorse EHG positions.' })).toEqual([]);
    expect(lintAntiImpersonation({ note: 'Named frameworks for most situations can substitute — it works for many teams' })).toEqual([]);
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
    expect(validateProfile({ ...base, source_count: 99 }).join()).toMatch(/source_count 99 != sources.length/);
  });
});
