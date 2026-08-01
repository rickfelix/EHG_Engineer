/**
 * SD-FDBK-INFRA-TRUTH-DEMAND-THESIS-001 (FR-3) — is this demand thesis FALSIFIABLE ON ITS FACE?
 *
 * *** THE GATE THIS BACKS ALREADY PASSES ANYTHING SHAPED LIKE A THESIS. ***
 * validateThesisChannelClaim (stage-22-distribution-setup.js:182-217) checks only WHO and CHANNEL
 * shape. PAIN, ALTERNATIVES, WTP, KILL_CRITERIA and evidence grade are unenforced — an existing test
 * (stage-22-distribution-setup.test.js:231) proves an arbitrary evidence_grade of 'B' passes. So a
 * fabricated-but-shaped thesis clears the S21 precondition identically to an adjudicated one, and
 * because the precondition is portfolio-wide, a wrong thesis does not fail locally. It succeeds
 * everywhere while making the artifact type meaningless. That is the TIER-3 justification, and it
 * is why presence is not the standard here — REFUTABILITY is.
 *
 * A reader must be able to state what evidence would refute each claim. Per
 * docs/design/venture-selection-demand-thesis-design.md §1-2: six claims, each with an explicit
 * "falsified by", and every claim at evidence grade >=E1 or explicitly tagged an E0 assumption.
 *
 * ── KILL_CRITERIA IS DELIBERATELY EXEMPT FROM THE falsified_by RULE ───────────────────────────
 * MEASURED on ApexNiche's real adjudicated thesis: WHO/PAIN/ALTERNATIVES/CHANNEL/WTP each carry
 * falsified_by + evidence_grade. KILL_CRITERIA carries ONLY kills[]. That is not an omission — the
 * design doc's own six-row table gives its "falsified by" cell as "(this row is what makes the rest
 * honest)", a meta-statement rather than a literal condition.
 *
 * A UNIFORM "every claim needs falsified_by" RULE WOULD THEREFORE DO ONE OF TWO THINGS, BOTH BAD:
 * reject the only real thesis in the fleet, or force an author to synthesise a value the source
 * never had — which is exactly the "quietly rewrites its source" fabrication FR-4 forbids. The
 * validator would have mandated what its sibling requirement prohibits. So KILL_CRITERIA is checked
 * on its structural equivalent instead: each kill needs a criterion AND a threshold, because a kill
 * condition with no threshold is just as unfalsifiable as a claim with no refutation.
 */

/** The six claims the design doc requires. Order is the doc's. */
export const REQUIRED_CLAIMS = Object.freeze(['WHO', 'PAIN', 'ALTERNATIVES', 'CHANNEL', 'WTP', 'KILL_CRITERIA']);

/** Claims judged on falsified_by + evidence_grade. KILL_CRITERIA is judged on kills[] — see docblock. */
export const REFUTABLE_CLAIMS = Object.freeze(['WHO', 'PAIN', 'ALTERNATIVES', 'CHANNEL', 'WTP']);

/** §2 evidence ladder. E0 is an assumption and must say so; E1+ is grounded in something. */
export const EVIDENCE_GRADES = Object.freeze(['E0', 'E1', 'E2', 'E3']);

const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * Resolve an evidence_grade to its EFFECTIVE (weakest) ladder value, or null if it names none.
 *
 * *** THE FIRST CUT OF THIS VALIDATOR REJECTED THE ONLY REAL THESIS IN THE FLEET. ***
 * It required evidence_grade to be exactly one of E0-E3. ApexNiche's adjudicated WTP claim reads
 * "E1-anchor / E0-elicitation" — a COMPOUND grade, because the adjudicator graded the price anchor
 * and the willingness-to-pay elicitation separately. That is MORE precise than a bare grade, not
 * less, and rejecting it would have forced the backfill to dumb its source down to a single value —
 * a quieter cousin of the fabrication FR-4 forbids: not inventing content, but discarding
 * adjudicated nuance to satisfy a validator that assumed a simpler world than the one it validates.
 *
 * Takes the WEAKEST grade present, because a claim is only as grounded as its softest component.
 * "E1-anchor / E0-elicitation" therefore resolves to E0 — an assumption, correctly.
 */
export function effectiveEvidenceGrade(raw) {
  if (typeof raw !== 'string') return null;
  const found = raw.toUpperCase().match(/\bE[0-3]\b/g);
  if (!found || found.length === 0) return null;
  return found.sort()[0]; // E0 < E1 < E2 < E3 lexicographically
}

/**
 * PURE/TOTAL. Never throws — a validator that can throw becomes a reason to wrap it in a try/catch
 * that swallows the verdict, which is how this codebase lost an LLM path for 172 days.
 *
 * @param {object} thesis - the `thesis` object (expects `.claims`)
 * @param {object} [opts]
 * @param {boolean} [opts.allowE0Assumptions=true] - accept E0 when explicitly tagged as an assumption
 * @returns {{valid:boolean, violations:Array<{claim:string,code:string,detail:string}>, checked:string[]}}
 */
export function validateDemandThesisFalsifiability(thesis, { allowE0Assumptions = true } = {}) {
  const violations = [];
  const claims = thesis && typeof thesis === 'object' ? (thesis.claims || null) : null;

  if (!claims || typeof claims !== 'object') {
    return {
      valid: false,
      violations: [{ claim: '(root)', code: 'NO_CLAIMS', detail: 'thesis.claims is missing or not an object' }],
      checked: []
    };
  }

  for (const name of REQUIRED_CLAIMS) {
    if (!claims[name] || typeof claims[name] !== 'object') {
      violations.push({ claim: name, code: 'CLAIM_MISSING', detail: `required claim ${name} is absent` });
    }
  }

  for (const name of REFUTABLE_CLAIMS) {
    const c = claims[name];
    if (!c || typeof c !== 'object') continue; // already reported as missing

    if (!nonEmpty(c.falsified_by)) {
      violations.push({
        claim: name, code: 'NOT_FALSIFIABLE',
        detail: `${name} has no falsified_by — a reader cannot state what evidence would refute it`
      });
    }

    const grade = effectiveEvidenceGrade(c.evidence_grade);
    if (!grade) {
      violations.push({
        claim: name, code: 'EVIDENCE_GRADE_INVALID',
        detail: `${name} evidence_grade ${JSON.stringify(c.evidence_grade)} names no grade on the ${EVIDENCE_GRADES.join('/')} ladder`
      });
    } else if (grade === 'E0' && !allowE0Assumptions) {
      violations.push({ claim: name, code: 'E0_NOT_PERMITTED', detail: `${name} is E0 and E0 assumptions are not permitted here` });
    }
  }

  // KILL_CRITERIA — structural equivalent, per the docblock.
  const kc = claims.KILL_CRITERIA;
  if (kc && typeof kc === 'object') {
    const kills = Array.isArray(kc.kills) ? kc.kills : null;
    if (!kills || kills.length === 0) {
      violations.push({
        claim: 'KILL_CRITERIA', code: 'NO_KILLS',
        detail: 'KILL_CRITERIA has no kills[] — it is the row that makes the others honest, so an empty one voids the thesis'
      });
    } else {
      kills.forEach((k, i) => {
        if (!k || typeof k !== 'object') {
          violations.push({ claim: 'KILL_CRITERIA', code: 'KILL_MALFORMED', detail: `kills[${i}] is not an object` });
          return;
        }
        if (!nonEmpty(k.criterion)) {
          violations.push({ claim: 'KILL_CRITERIA', code: 'KILL_NO_CRITERION', detail: `kills[${i}] has no criterion` });
        }
        // A kill with no threshold is unfalsifiable in exactly the way falsified_by guards against.
        if (!nonEmpty(k.threshold)) {
          violations.push({
            claim: 'KILL_CRITERIA', code: 'KILL_NO_THRESHOLD',
            detail: `kills[${i}] has no threshold — "it dies if demand is weak" is not a kill condition`
          });
        }
      });
    }
  }

  return { valid: violations.length === 0, violations, checked: REQUIRED_CLAIMS.slice() };
}

/**
 * PURE/TOTAL. Does the promoted artifact faithfully reproduce its source (FR-4 / TS-4)?
 *
 * A backfill that quietly improves its source is indistinguishable from one that fabricates it, so
 * this is deliberately one-directional: every claim in the ARTIFACT must exist in the SOURCE. The
 * reverse is permitted — a promotion may carry fewer claims than the source (and the falsifiability
 * check above will catch a missing REQUIRED one) but never MORE.
 *
 * @returns {{faithful:boolean, invented:string[], missing:string[]}}
 */
export function verifyPromotionFaithfulness(artifactClaims, sourceClaims) {
  const a = artifactClaims && typeof artifactClaims === 'object' ? artifactClaims : {};
  const s = sourceClaims && typeof sourceClaims === 'object' ? sourceClaims : {};
  const invented = Object.keys(a).filter((k) => !(k in s));
  const missing = Object.keys(s).filter((k) => !(k in a));
  return { faithful: invented.length === 0, invented, missing };
}
