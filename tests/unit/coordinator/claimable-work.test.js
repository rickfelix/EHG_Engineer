/**
 * SD-REFILL-00XE6T7E — claimable-work must ignore conceptual-input PROSE mis-filed into
 * strategic_directives_v2.dependencies (table lists, file refs, "Chairman approval CONST-002").
 * Before this fix, parseDeps returned any non-empty string, so a prose dep had no status row and
 * isClaimableSd treated it as an UNMET blocker -> the SD was phantom-excluded from the claimable
 * belt. parseDeps now delegates to the canonical /^SD-/ resolver (parse-sd-dependencies.cjs SSOT).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseDeps, dependencyKeys, isClaimableSd } = require('../../../lib/coordinator/claimable-work.cjs');

const PROSE = [
  'objectives / strategic_vision / key_results (the scattered substrate inventoried).',
  'lib/vision/vdr-registry.js — the ord 11 probe.',
  'Chairman approval of the north-star definition (CONST-002) — gates the follow-on build SD.',
];

describe('SD-REFILL-00XE6T7E: claimable-work ignores non-SD-key prose dependencies', () => {
  it('parseDeps drops prose entries, keeping only /^SD-/ keys', () => {
    expect(parseDeps({ dependencies: PROSE })).toEqual([]);
    expect(parseDeps({ dependencies: [...PROSE, 'SD-X-001'] })).toEqual(['SD-X-001']);
    expect(parseDeps({ dependencies: [{ sd_key: 'SD-Y-002' }, { sd_id: 'SD-Z-003' }] })).toEqual(['SD-Y-002', 'SD-Z-003']);
  });

  it('isClaimableSd is TRUE for an SD whose deps are only prose (no longer phantom-blocked)', () => {
    expect(isClaimableSd({ sd_type: 'feature', dependencies: PROSE }, {})).toBe(true);
  });

  it('isClaimableSd still BLOCKS on a real SD-key dependency that is non-terminal', () => {
    expect(isClaimableSd({ sd_type: 'feature', dependencies: ['SD-X-001'] }, { 'SD-X-001': 'draft' })).toBe(false);
  });

  it('isClaimableSd is TRUE when a real SD-key dependency is terminal', () => {
    expect(isClaimableSd({ sd_type: 'feature', dependencies: ['SD-X-001'] }, { 'SD-X-001': 'completed' })).toBe(true);
  });

  it('isClaimableSd drops prose and gates only on the real SD-key (mixed deps)', () => {
    const sd = { sd_type: 'feature', dependencies: [...PROSE, 'SD-Y-002'] };
    expect(isClaimableSd(sd, { 'SD-Y-002': 'completed' })).toBe(true);
    expect(isClaimableSd(sd, { 'SD-Y-002': 'in_progress' })).toBe(false);
  });

  it('orchestrator parents are never claimable', () => {
    expect(isClaimableSd({ sd_type: 'orchestrator', dependencies: [] }, {})).toBe(false);
  });

  it('dependencyKeys excludes prose across a batch', () => {
    const rows = [{ dependencies: PROSE }, { dependencies: ['SD-A-001', 'some prose'] }];
    expect(dependencyKeys(rows)).toEqual(['SD-A-001']);
  });
});
