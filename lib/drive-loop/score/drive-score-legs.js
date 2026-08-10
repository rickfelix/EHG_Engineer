/**
 * DRIVE-SCORE LEG SET — the single source of truth for which legs the denominator is over.
 * SD-LEO-INFRA-DRIVE-SCORE-DENOMINATOR-001 (FR-2 + FR-3).
 *
 * WHY THIS FILE EXISTS. Before this SD the leg count lived as a bare `SPEC_LEG_COUNT = 4` in
 * aggregate.js while only three legs were ever defined — a number nobody ratified, sitting next
 * to a limitation string that admitted it was a placeholder. A bare constant can be edited to 5
 * in one commit and nothing notices; the denominator silently widens and every historical score
 * re-bases. So the leg set is now a FROZEN SSOT and the count is DERIVED from it, and adding a leg
 * is made loud by construction (see the ratified-marker rule below and the guard test that pins
 * the produced leg-id set against this list).
 *
 * THE RATIFIED-MARKER RULE (FR-3). Every leg carries a `ratified_by` provenance token. The
 * denominator is "the legs actually ratified", so a leg WITHOUT a ratified_by is a phantom — it
 * cannot silently join the set, because assertLegSetRatified() throws on it. Minting a new leg is
 * therefore an EXPLICIT spec change: add the leg here WITH a chairman-surfaced ratification token,
 * or CI fails. This is the same anti-drift idiom the drive-report lanes use (a frozen SSOT the
 * tests hold equal to the code that consumes it), applied to the leg vocabulary.
 *
 * RATIFICATION PROVENANCE. Adam ruling d50b9f12 (the chairman-accepted Drive-Loop A-review
 * verdict, delegated lane per CLAUDE_ADAM.md 4b): the interim denominator is the SMALLEST HONEST
 * one — the legs actually defined, 3 legs / 6 points. Any future leg mint (including reviving the
 * long-absent "leg 3") is an explicit spec change surfaced to the chairman, never a silent
 * widening. Coordinator scope ruling ac704cbd narrowed this SD's wiring to leg2; leg1's git-runner
 * CI work is split to SD-LEO-INFRA-DRIVE-SCORE-LEG1-001. leg4_capacity is ratified but stays
 * fail-closed until belt_capacity_verdicts applies (APPLY-STATE-002).
 */

/** The ratification token for this SD's denominator — the chairman-accepted Adam ruling. A leg
 *  minted later must carry its OWN token (a new ruling / SMS row), never reuse this one blindly. */
export const RATIFICATION = Object.freeze({
  ruling: 'd50b9f12',
  scope_ruling: 'ac704cbd',
  note: 'smallest-honest denominator: the legs actually defined (3 legs / 6 points). A new leg is an explicit chairman-surfaced spec change.',
});

/**
 * The ratified legs, frozen. Order is the emission order. Each carries a ratified_by marker;
 * a leg without one is a phantom (assertLegSetRatified throws).
 */
export const DRIVE_SCORE_LEGS = Object.freeze([
  Object.freeze({ id: 'leg1_landed', ratified_by: RATIFICATION.ruling }),
  Object.freeze({ id: 'leg2_uptake', ratified_by: RATIFICATION.ruling }),
  Object.freeze({ id: 'leg4_capacity', ratified_by: RATIFICATION.ruling }),
]);

/** The ratified leg ids, frozen — the population the produced report is pinned against (FR-3). */
export const RATIFIED_LEG_IDS = Object.freeze(DRIVE_SCORE_LEGS.map((l) => l.id));

/** The denominator's leg count, DERIVED from the SSOT — never a bare literal. = 3 (ratified). */
export const SPEC_LEG_COUNT = DRIVE_SCORE_LEGS.length;

/**
 * Assert the leg set is fully ratified — every leg carries a ratified_by marker. Throws loudly on
 * a phantom (a leg minted without an explicit ratification token). Called by the guard test and
 * safe to call at import time by consumers that want the invariant enforced eagerly.
 * @param {ReadonlyArray<{id:string, ratified_by?:string}>} [legs]
 * @returns {ReadonlyArray<string>} the ratified ids
 */
export function assertLegSetRatified(legs = DRIVE_SCORE_LEGS) {
  const phantoms = legs.filter((l) => !l || typeof l.ratified_by !== 'string' || l.ratified_by.trim() === '');
  if (phantoms.length) {
    throw new Error(
      'DRIVE_SCORE_LEG_UNRATIFIED: ' + phantoms.map((p) => p?.id ?? '(unnamed)').join(', ') +
      ' — a leg has no ratified_by marker. Minting a leg is an EXPLICIT spec change: add a ' +
      'chairman-surfaced ratification token (a ruling/SMS row), never a silent denominator widening.'
    );
  }
  return Object.freeze(legs.map((l) => l.id));
}

/**
 * Assert the leg-id set a producer actually emitted matches the ratified SSOT — bidirectionally.
 * A produced leg NOT in the SSOT is an unratified phantom; an SSOT leg the producer never emits is
 * a dropped leg. Either fails loud (FR-3). This is the pin the guard test runs against buildGather.
 * @param {ReadonlyArray<string>} producedLegIds
 */
export function assertProducedLegsMatchSSOT(producedLegIds) {
  const ratified = new Set(RATIFIED_LEG_IDS);
  const produced = new Set(producedLegIds);
  const phantom = [...produced].filter((id) => !ratified.has(id));
  const dropped = [...ratified].filter((id) => !produced.has(id));
  if (phantom.length || dropped.length) {
    throw new Error(
      'DRIVE_SCORE_LEG_SET_DRIFT: ' +
      (phantom.length ? `unratified leg(s) produced: ${phantom.join(', ')}. ` : '') +
      (dropped.length ? `ratified leg(s) not produced: ${dropped.join(', ')}. ` : '') +
      'The produced leg set must equal DRIVE_SCORE_LEGS. Adding a leg is an explicit spec change ' +
      '(update the SSOT with a ratification token); dropping one is a regression.'
    );
  }
}
