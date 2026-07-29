/**
 * SD-LEO-INFRA-ROADMAP-REGENERATION-DUPLICATES-001 FR-5.
 *
 * This guard survived mutation TWICE in the EXEC adversarial review — both the refusal and the
 * --reason requirement could be deleted with the whole suite still green — because it lived
 * inline in roadmap-generate.js main(), which self-invokes at module load and therefore cannot be
 * imported by a test. Extracting the predicate is what makes these assertions possible at all.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateFullCreate,
  roadmapsToArchive,
  REFUSE_EXISTING,
  REFUSE_REASON_REQUIRED,
} from '../../../lib/roadmap/full-create-guard.js';

const draft = { id: 'rm-draft', title: 'EVA Intake Roadmap', status: 'draft' };
const active = { id: 'rm-active', title: 'LEO Roadmap', status: 'active' };

describe('FR-5: --full may bootstrap, but may not fork', () => {
  it('allows creation when nothing non-archived exists (the bootstrap case)', () => {
    expect(evaluateFullCreate([], {})).toMatchObject({ allow: true });
  });

  it('REFUSES when a DRAFT roadmap already exists — the actual 2026-07-17 incident shape', () => {
    // My first version of this guard asked "does an ACTIVE roadmap exist". createRoadmap()
    // inserts status:'draft' and only approveSequence flips it to 'active', so that guard could
    // never have fired on the duplicate DRAFT rows (a89b078b, 8ffa7fdf) it was written to prevent.
    // If this assertion ever flips to allow:true, that regression is back.
    const v = evaluateFullCreate([draft], {});
    expect(v.allow).toBe(false);
    expect(v.refusal).toBe(REFUSE_EXISTING);
  });

  it('REFUSES when an ACTIVE roadmap already exists', () => {
    expect(evaluateFullCreate([active], {})).toMatchObject({ allow: false, refusal: REFUSE_EXISTING });
  });

  it('archived roadmaps do not block — they are not passed in, and an empty live set allows', () => {
    // The caller filters with .neq('status','archived'); this documents the contract that the
    // predicate sees only live rows, so archiving is genuinely the way to unblock --full.
    expect(evaluateFullCreate([], { }).allow).toBe(true);
  });
});

describe('FR-5: the override is explicit, reasoned, and total', () => {
  it('--replace-active WITHOUT a reason is refused, not silently allowed', () => {
    const v = evaluateFullCreate([active], { replaceActive: true });
    expect(v.allow).toBe(false);
    expect(v.refusal).toBe(REFUSE_REASON_REQUIRED);
  });

  it('a whitespace-only reason is not a reason', () => {
    // An unaudited override that logs "" is the failure this is guarding, not a formatting nit.
    expect(evaluateFullCreate([active], { replaceActive: true, replaceReason: '   ' }))
      .toMatchObject({ allow: false, refusal: REFUSE_REASON_REQUIRED });
  });

  it('--replace-active WITH a reason allows, and flags itself as an override', () => {
    const v = evaluateFullCreate([active], { replaceActive: true, replaceReason: 'reclustering after Q3 reset' });
    expect(v).toMatchObject({ allow: true, override: true });
    expect(v.existing).toHaveLength(1);
  });

  it('an override must archive EVERY live roadmap, not just the first', () => {
    // Replacing one of two leaves the duplicate state the guard exists to prevent. An override
    // named "replace" that half-replaces is worse than none, because the operator believes the
    // old one is gone.
    expect(roadmapsToArchive([active, draft])).toEqual(['rm-active', 'rm-draft']);
  });

  it('tolerates malformed input rather than throwing mid-create', () => {
    expect(evaluateFullCreate(null, {}).allow).toBe(true);
    expect(roadmapsToArchive(null)).toEqual([]);
    expect(roadmapsToArchive([{ title: 'no id' }])).toEqual([]);
  });
});
