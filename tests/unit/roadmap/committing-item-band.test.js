// SD-LEO-INFRA-PLAN-POSITION-READABLE-001 (FR-3) — the committing-item band.
//
// THE DEFECT WAS POSITION, NOT ABSENCE. coordinator-backlog-rank.mjs already joined
// roadmap_wave_items.promoted_to_sd_key and fed needleScore into the comparator — but AFTER
// unlockScore and AFTER productPivotCompare, so it could only separate candidates that already tied
// and could never lift a committing-item child across the harness band. That is what the chairman
// asked for and what did not happen.
//
// So PLACEMENT is the deliverable, and placement is what these tests pin: above productPivotCompare
// (the ask) and below unlockScore (so the plan can never starve the critical path).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { committingItemBandCompare, isCommittingItemChild } from '../../../lib/roadmap/committing-item-band.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const RANKER = fs.readFileSync(path.join(root, 'scripts/coordinator-backlog-rank.mjs'), 'utf8');

const sd = (k, extra = {}) => ({ sd_key: k, ...extra });
const RUNGS = { 'SD-PLAN-ITEM-001': 'wave-1', 'SD-PLAN-ITEM-002': 'wave-2' };

describe('FR-3: the band itself', () => {
  it('sorts a committing-item child ahead of one that is not', () => {
    expect(committingItemBandCompare(sd('SD-PLAN-ITEM-001'), sd('SD-LEO-INFRA-X'), RUNGS)).toBeLessThan(0);
    expect(committingItemBandCompare(sd('SD-LEO-INFRA-X'), sd('SD-PLAN-ITEM-001'), RUNGS)).toBeGreaterThan(0);
  });

  it('returns 0 when both agree, so the next comparator decides', () => {
    expect(committingItemBandCompare(sd('SD-PLAN-ITEM-001'), sd('SD-PLAN-ITEM-002'), RUNGS)).toBe(0);
    expect(committingItemBandCompare(sd('SD-LEO-INFRA-X'), sd('SD-LEO-INFRA-Y'), RUNGS)).toBe(0);
  });

  it('treats a null rung as NOT committing — an item with no rung is not plan position', () => {
    expect(isCommittingItemChild(sd('SD-NULL'), { 'SD-NULL': null })).toBe(false);
    expect(isCommittingItemChild(sd('SD-UNDEF'), { 'SD-UNDEF': undefined })).toBe(false);
    expect(isCommittingItemChild(sd('SD-REAL'), { 'SD-REAL': 'wave-1' })).toBe(true);
  });

  it('never throws on missing inputs', () => {
    expect(() => committingItemBandCompare(null, undefined, undefined)).not.toThrow();
    expect(isCommittingItemChild(null)).toBe(false);
    expect(isCommittingItemChild({})).toBe(false);
  });

  // THE FAIL-OPEN, asserted rather than assumed. sdRungMap is built best-effort upstream; if the
  // roadmap read fails it is empty. Degrading to today's ordering is the correct direction for a
  // ranking input — but it means an empty map is indistinguishable from "no committing work is
  // claimable", which is this SD's own subject. Pinned so the behaviour is deliberate.
  it('degrades to a no-op on an empty map rather than inverting the order', () => {
    expect(committingItemBandCompare(sd('SD-PLAN-ITEM-001'), sd('SD-LEO-INFRA-X'), {})).toBe(0);
  });
});

describe('FR-3: PLACEMENT — the actual fix', () => {
  // ANCHOR ON THE CALL SITE, NOT THE NAME. A bare indexOf('productPivotCompare(a, b)') matches the
  // `export function productPivotCompare(a, b) {` DEFINITION at line 134 — hundreds of lines above
  // the comparator — so the placement assertion silently compares against the wrong position and
  // fails on correct code. Each anchor below is the unique `const x = ...` call form.
  const bandIdx = RANKER.indexOf('const ci = committingItemBandCompare(a, b, sdRungMap)');
  const unlockIdx = RANKER.indexOf('const ua = unlockScore(a.sd_key)');
  const pivotIdx = RANKER.indexOf('const pp = productPivotCompare(a, b)');
  const needleIdx = RANKER.indexOf('const na = needleOf(a)');

  it('is wired into the ranker at all', () => {
    expect(bandIdx).toBeGreaterThan(-1);
    expect(RANKER).toMatch(/import \{ committingItemBandCompare \} from '\.\.\/lib\/roadmap\/committing-item-band\.js'/);
  });

  // THE ASK: a committing-item child must outrank harness-class work. This is false today.
  it('sits ABOVE productPivotCompare, so it can cross the harness band', () => {
    expect(bandIdx).toBeLessThan(pivotIdx);
  });

  // THE CONTROL: a committing item that outranked its own unlocker would starve the critical path
  // to serve the plan — a worse failure than the one being fixed.
  it('sits BELOW unlockScore, so it can never strand the dependency graph', () => {
    expect(bandIdx).toBeGreaterThan(unlockIdx);
  });

  it('leaves needleOf below it as the finer rung ordering within the band', () => {
    expect(bandIdx).toBeLessThan(needleIdx);
  });

  // The chairman-ratified (2026-07-18) plan-linkage tie-break is NOT removed. It reads a different
  // source (metadata.plan_linkage.linked, true on 0 of 5,533 SDs — starved, not broken) and stays
  // exactly where it was.
  it('does not disturb the ratified planLinkageCompare tie-break', () => {
    expect(RANKER).toMatch(/const pl = planLinkageCompare\(a, b\);/);
    expect(RANKER.indexOf('const pl = planLinkageCompare(a, b)')).toBeGreaterThan(needleIdx);
  });
});
