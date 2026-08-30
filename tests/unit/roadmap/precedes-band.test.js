// SD-LEO-INFRA-GIVE-DISPATCH-RANKER-001 — the sequence band (metadata.precedes_sd_key).
//
// THE DEFECT: the criticalWalkBlocker band can express "A blocks the active mission" (membership)
// but not "A must dispatch before B among band equals" (sequence). Witnessed 2026-08-30 when
// SD-LEO-INFRA-BYPASS-DETECTION-REQUIRED-001 and SD-LEO-INFRA-DIRECTION-BLIND-KILL-001 both
// truthfully qualified for the same band with no mechanical tiebreak for their relative order.
//
// So PLACEMENT + CYCLE SAFETY are the deliverable: below unlockScore (never strands the critical
// path), above the heuristic tie-breaks below it, and provably safe against Array.sort's
// implementation-defined behavior on an inconsistent comparator.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  precedesTarget,
  buildPrecedesEdges,
  detectPrecedesCycles,
  sequenceCompare,
} from '../../../lib/roadmap/precedes-band.js';
import { isCriticalWalkBlocker } from '../../../scripts/coordinator-backlog-rank.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const RANKER = fs.readFileSync(path.join(root, 'scripts/coordinator-backlog-rank.mjs'), 'utf8');

const sd = (k, extra = {}) => ({ sd_key: k, metadata: extra });

describe('precedesTarget', () => {
  it('reads a valid string precedes_sd_key', () => {
    expect(precedesTarget(sd('A', { precedes_sd_key: 'B' }))).toBe('B');
  });
  it('returns null when absent, empty, or non-string', () => {
    expect(precedesTarget(sd('A'))).toBeNull();
    expect(precedesTarget(sd('A', { precedes_sd_key: '' }))).toBeNull();
    expect(precedesTarget(sd('A', { precedes_sd_key: 123 }))).toBeNull();
    expect(precedesTarget(null)).toBeNull();
  });
});

describe('sequenceCompare — direction, pinned', () => {
  it('A.precedes_sd_key = B.sd_key ranks A before B, never the reverse', () => {
    const A = sd('A', { precedes_sd_key: 'B' });
    const B = sd('B');
    expect(sequenceCompare(A, B)).toBeLessThan(0);
    expect(sequenceCompare(B, A)).toBeGreaterThan(0);
  });

  it('returns 0 when neither side names the other, so the next comparator decides', () => {
    expect(sequenceCompare(sd('A'), sd('B'))).toBe(0);
  });

  it('a self-referencing precedes_sd_key is a no-op', () => {
    expect(sequenceCompare(sd('A', { precedes_sd_key: 'A' }), sd('A', { precedes_sd_key: 'A' }))).toBe(0);
  });

  it('never throws on missing inputs', () => {
    expect(() => sequenceCompare(null, undefined)).not.toThrow();
    expect(sequenceCompare(null, undefined)).toBe(0);
  });

  it('an excluded edge (cycle-participant) is treated as absent', () => {
    const A = sd('A', { precedes_sd_key: 'B' });
    const B = sd('B');
    expect(sequenceCompare(A, B, new Set(['A->B']))).toBe(0);
  });
});

describe('buildPrecedesEdges — dangling refs are structural no-ops (GAP-3)', () => {
  it('excludes an edge whose target is not in the claimable set (dangling / left the belt)', () => {
    const claimable = [sd('A', { precedes_sd_key: 'GHOST' })];
    expect(buildPrecedesEdges(claimable)).toEqual([]);
  });

  it('excludes self-references from the edge list', () => {
    const claimable = [sd('A', { precedes_sd_key: 'A' })];
    expect(buildPrecedesEdges(claimable)).toEqual([]);
  });

  it('includes an edge when both endpoints are present', () => {
    const claimable = [sd('A', { precedes_sd_key: 'B' }), sd('B')];
    expect(buildPrecedesEdges(claimable)).toEqual([['A', 'B']]);
  });
});

describe('detectPrecedesCycles — Array.sort must never see an inconsistent comparator (GAP-1)', () => {
  it('an acyclic edge list produces an empty exclusion set', () => {
    const edges = [['A', 'B'], ['B', 'C']];
    expect(detectPrecedesCycles(edges).size).toBe(0);
  });

  it('detects a 3-node cycle and excludes exactly those edges', () => {
    const edges = [['A', 'B'], ['B', 'C'], ['C', 'A']];
    const excluded = detectPrecedesCycles(edges);
    expect(excluded.has('A->B')).toBe(true);
    expect(excluded.has('B->C')).toBe(true);
    expect(excluded.has('C->A')).toBe(true);
  });

  it('a cycle among some nodes does not exclude an unrelated valid edge in the same pass', () => {
    const edges = [['A', 'B'], ['B', 'C'], ['C', 'A'], ['D', 'E']];
    const excluded = detectPrecedesCycles(edges);
    expect(excluded.has('D->E')).toBe(false);
  });

  it('full pipeline: a 3-cycle among claimable SDs excludes those edges from sequenceCompare, ' +
     'while a 4th unrelated SD with a separate valid edge in the same pass still orders correctly', () => {
    const claimable = [
      sd('A', { precedes_sd_key: 'B' }),
      sd('B', { precedes_sd_key: 'C' }),
      sd('C', { precedes_sd_key: 'A' }),
      sd('D', { precedes_sd_key: 'E' }),
      sd('E'),
    ];
    const edges = buildPrecedesEdges(claimable);
    const excluded = detectPrecedesCycles(edges);
    // Cyclic pair: neutral now.
    expect(sequenceCompare(claimable[0], claimable[1], excluded)).toBe(0);
    // Unrelated valid edge: still applies.
    expect(sequenceCompare(claimable[3], claimable[4], excluded)).toBeLessThan(0);
  });
});

describe('WIRING — placement in the live comparator chain', () => {
  const unlockIdx = RANKER.indexOf('const ua = unlockScore(a.sd_key)');
  const sequenceIdx = RANKER.indexOf('const sc = sequenceCompare(a, b, excludedPrecedesEdges)');
  const bandIdx = RANKER.indexOf('const ci = committingItemBandCompare(a, b, sdRungMap)');
  const cycleDetectIdx = RANKER.indexOf('detectPrecedesCycles(precedesEdges)');
  const sortCallIdx = RANKER.indexOf('claimable.sort((a, b) => {');

  it('is wired into the ranker at all', () => {
    expect(sequenceIdx).toBeGreaterThan(-1);
    expect(RANKER).toMatch(
      /import \{ buildPrecedesEdges, detectPrecedesCycles, sequenceCompare \} from '\.\.\/lib\/roadmap\/precedes-band\.js'/
    );
  });

  it('sits BELOW unlockScore, so a sequenced item can never strand its own unlocker', () => {
    expect(sequenceIdx).toBeGreaterThan(unlockIdx);
  });

  it('sits ABOVE committingItemBandCompare, so a ruled order settles before the heuristic bands', () => {
    expect(sequenceIdx).toBeLessThan(bandIdx);
  });

  it('runs cycle detection ONCE, before sort() is called — never inside the comparator', () => {
    expect(cycleDetectIdx).toBeGreaterThan(-1);
    expect(cycleDetectIdx).toBeLessThan(sortCallIdx);
  });

  it('never reads a census/membership field (fleet_critical/convergence_caught/blocks_active_mission) ' +
     'in precedes-band.js\'s executable code (comments may reference them to explain why not)', () => {
    const bandSrc = fs.readFileSync(path.join(root, 'lib/roadmap/precedes-band.js'), 'utf8');
    const codeOnly = bandSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')   // strip /* ... */ blocks
      .replace(/\/\/.*$/gm, '');          // strip // ... line comments
    expect(codeOnly).not.toMatch(/fleet_critical|convergence_caught|blocks_active_mission/);
  });
});

describe('REAL FIXTURE — SD-LEO-INFRA-BYPASS-DETECTION-REQUIRED-001 / SD-LEO-INFRA-DIRECTION-BLIND-KILL-001', () => {
  // Both real SDs carry metadata.blocks_active_mission=true (live-verified this session), so both
  // truthfully qualify for the criticalWalkBlocker band with no mechanical tiebreak — the exact
  // motivating incident. This fixture reproduces it and confirms the ruled order now applies.
  it('both specimens qualify for the criticalWalkBlocker band (the incident precondition)', () => {
    const bypass = sd('SD-LEO-INFRA-BYPASS-DETECTION-REQUIRED-001', { blocks_active_mission: true });
    const directionBlind = sd('SD-LEO-INFRA-DIRECTION-BLIND-KILL-001', { blocks_active_mission: true });
    expect(isCriticalWalkBlocker(bypass)).toBe(true);
    expect(isCriticalWalkBlocker(directionBlind)).toBe(true);
  });

  it('a ruling that BYPASS-DETECTION must precede DIRECTION-BLIND-KILL now orders them without ' +
     'touching blocks_active_mission on either row', () => {
    const bypass = sd('SD-LEO-INFRA-BYPASS-DETECTION-REQUIRED-001', {
      blocks_active_mission: true,
      precedes_sd_key: 'SD-LEO-INFRA-DIRECTION-BLIND-KILL-001',
      precedes_sd_key_ruled_by: 'dispatcher+solomon',
      precedes_sd_key_ruled_at: '2026-08-30T00:15:00Z',
    });
    const directionBlind = sd('SD-LEO-INFRA-DIRECTION-BLIND-KILL-001', { blocks_active_mission: true });
    expect(sequenceCompare(bypass, directionBlind)).toBeLessThan(0);
    // Both still true — no truth field was bent to encode the ruling.
    expect(bypass.metadata.blocks_active_mission).toBe(true);
    expect(directionBlind.metadata.blocks_active_mission).toBe(true);
  });
});

describe('REGRESSION — no precedes_sd_key set anywhere is byte-identical to today', () => {
  it('sequenceCompare returns 0 for every pair when metadata is empty', () => {
    const claimable = [sd('A'), sd('B'), sd('C')];
    const edges = buildPrecedesEdges(claimable);
    expect(edges).toEqual([]);
    const excluded = detectPrecedesCycles(edges);
    for (const x of claimable) {
      for (const y of claimable) {
        if (x === y) continue;
        expect(sequenceCompare(x, y, excluded)).toBe(0);
      }
    }
  });
});
