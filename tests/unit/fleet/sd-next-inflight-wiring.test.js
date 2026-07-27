/**
 * Pins the REQUIRED-1 wiring — SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-B FR-3.
 *
 * TESTING (725a71bf) deleted the ENTIRE inFlightQfIds wiring and the suite stayed at its
 * pre-existing floor: 3 failed / 1315 passed, byte-identical. Zero tests referenced displayTracks.
 * That is the exact condition this SD exists to eliminate — a guard whose removal nothing notices.
 *
 * BOTH render branches must produce the field. The first cut wired only showFallbackQueue and
 * left displayTracks inert; a later comment then claimed displayTracks was "the live path", which
 * measurement showed was backwards (baseline PRESENT but actionableCount===0, so an unforced
 * sd:next takes showFallbackQueue). Which branch runs flips with belt state, so neither may be
 * assumed — assuming is what left a lane unwired in the first place.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeInFlightQfIds } from '../../../scripts/modules/sd-next/display/fallback-queue.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const selectorSrc = readFileSync(resolve(repoRoot, 'scripts/modules/sd-next/SDNextSelector.js'), 'utf8');

describe('the producer is a real ESM export, not a private function', () => {
  it('computeInFlightQfIds is importable and callable', async () => {
    // The prior pin matched /async function computeInFlightQfIds/, which is true of BOTH an
    // exported and a private function — it never verified the export at all. Importing it is
    // the assertion: this file would fail to load if the export were removed.
    expect(typeof computeInFlightQfIds).toBe('function');
  });

  it('returns an empty Set for an empty candidate list without probing', async () => {
    const ids = await computeInFlightQfIds([]);
    expect(ids).toBeInstanceOf(Set);
    expect(ids.size).toBe(0);
  });

  it('returns an empty Set (never throws) on a malformed list', async () => {
    for (const bad of [null, undefined, 'nope', 42]) {
      const ids = await computeInFlightQfIds(bad);
      expect(ids).toBeInstanceOf(Set);
      expect(ids.size).toBe(0);
    }
  });
});

describe('getSessionContext surfaces inFlightQfIds to every consumer', () => {
  // Constructing SDNextSelector builds a live Supabase client in its constructor, so this asserts
  // the getter's returned literal structurally rather than standing up the whole selector.
  it('the getter includes inFlightQfIds', () => {
    // Structural: the field must be present in the returned literal, or three consumers
    // silently receive undefined and the lane no-ops.
    expect(selectorSrc).toMatch(/inFlightQfIds:\s*this\.inFlightQfIds\s*\|\|\s*new Set\(\)/);
  });

  it('defaults to an empty Set when unpopulated (fail-open, withholds nothing)', () => {
    expect(selectorSrc).toMatch(/this\.inFlightQfIds\s*\|\|\s*new Set\(\)/);
  });
});

describe('displayTracks populates the field BEFORE it classifies', () => {
  it('awaits computeInFlightQfIds ahead of the classifyQuickFixes call', () => {
    // Ordering is the invariant, not mere presence: populating after classification would leave
    // the classifier reading a stale/empty Set while the code still "looks wired".
    const produceIdx = selectorSrc.indexOf('this.inFlightQfIds = await computeInFlightQfIds(');
    const classifyIdx = selectorSrc.indexOf('classified: classifiedQFs } = classifyQuickFixes(');
    expect(produceIdx).toBeGreaterThan(-1);
    expect(classifyIdx).toBeGreaterThan(-1);
    expect(produceIdx).toBeLessThan(classifyIdx);
  });

  it('imports the producer from the display barrel', () => {
    expect(selectorSrc).toMatch(/computeInFlightQfIds/);
    const importBlock = selectorSrc.slice(0, selectorSrc.indexOf("} from './display/index.js';"));
    expect(importBlock).toContain('computeInFlightQfIds');
  });
});

describe('the OTHER render branch is wired too — neither may be assumed live', () => {
  it('showFallbackQueue also threads inFlightQfIds', () => {
    const src = readFileSync(resolve(repoRoot, 'scripts/modules/sd-next/display/fallback-queue.js'), 'utf8');
    expect(src).toMatch(/inFlightQfIds:\s*await computeInFlightQfIds\(/);
  });
});
