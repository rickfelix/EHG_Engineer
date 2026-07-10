/**
 * Stage-0 Anti-Goal Screen
 * SD-LEO-INFRA-STAGE0-POSTURE-SUCCESSOR-001 (CH-3, spec R2)
 *
 * The chairman's Phase-1 anti-goals were inert data with ZERO consumers — 'no
 * app-store surface, no regulatory surface, no long sales cycles, no content moats'
 * disqualified nothing. This screen makes them a hard PRE-RANKING filter with the
 * disqualification reason recorded per candidate — auditable, never silent.
 *
 * Mechanics are pure and deterministic: a documented, conservative matcher per
 * canonical anti-goal, applied over the candidate's own text fields and declared
 * required_capabilities. No LLM judgment inside the screen. False positives are
 * recoverable by design: every disqualification carries matched_field + matched_text
 * for the chairman-review surface.
 *
 * Postures whose criteria carry no anti_goals (e.g. Phase-2 success-weighted)
 * screen nothing — the filter is posture-governed data consumption, not policy.
 */

const SCREENED_FIELDS = Object.freeze([
  'name',
  'problem_statement',
  'solution',
  'target_market',
  'revenue_model',
  'automation_approach',
]);

/**
 * Canonical matcher per Phase-1 anti-goal (keys match the seeded posture's
 * criteria.anti_goals entries by normalized containment).
 */
export const ANTI_GOAL_MATCHERS = Object.freeze({
  'app-store distribution surface': /\bapp store\b|\bapp-store\b|\bios app\b|\bandroid app\b|\bmobile app\b|\bplay store\b/i,
  'regulatory surface': /\bregulat(?:ed|ory|ion)\b|\bcomplian(?:ce|t)\b|\blicens(?:e|ing|ure)\b|\bhipaa\b|\bfinra\b|\bkyc\b|\bfda\b/i,
  'long sales cycles': /\blong sales cycle|\benterprise procurement\b|\brfp process\b|\b(?:6|nine|9|twelve|12)[\s-]*(?:to[\s-]*\d+[\s-]*)?month sales\b/i,
  'content moats': /\bcontent moat\b|\bseo content\b|\beditorial (?:team|calendar|pipeline)\b|\bcontent library\b/i,
});

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Resolve the matcher for a posture-declared anti-goal string (normalized containment). */
function matcherFor(antiGoal) {
  const norm = normalize(antiGoal);
  for (const [key, re] of Object.entries(ANTI_GOAL_MATCHERS)) {
    if (normalize(key).includes(norm) || norm.includes(normalize(key))) return { key, re };
  }
  return null;
}

/**
 * Screen candidates against the active posture's anti-goals. Pure function.
 *
 * A candidate is disqualified when any screened text field — or a declared
 * required_capabilities entry of kind form_factor naming an app-store/native
 * surface — matches an anti-goal's canonical matcher.
 *
 * @param {Object[]} candidates
 * @param {Object} posture - resolved posture (criteria.anti_goals consumed)
 * @returns {{eligible: Object[], disqualified: Array<{candidate, anti_goal, matched_field, matched_text, reason}>}}
 */
export function applyAntiGoalScreen(candidates, posture) {
  const antiGoals = Array.isArray(posture?.criteria?.anti_goals) ? posture.criteria.anti_goals : [];
  if (antiGoals.length === 0) {
    return { eligible: [...(candidates || [])], disqualified: [] };
  }

  const matchers = antiGoals.map(g => ({ goal: g, m: matcherFor(g) })).filter(x => x.m);

  const eligible = [];
  const disqualified = [];

  for (const candidate of candidates || []) {
    let hit = null;

    for (const { goal, m } of matchers) {
      // Text fields
      for (const field of SCREENED_FIELDS) {
        const text = candidate[field];
        if (typeof text === 'string') {
          const match = text.match(m.re);
          if (match) {
            hit = { anti_goal: goal, matched_field: field, matched_text: match[0] };
            break;
          }
        }
      }
      if (hit) break;

      // Declared form-factor requirements (epsilon contract): a native/app-store
      // form factor is itself the app-store anti-goal.
      if (m.key === 'app-store distribution surface' && Array.isArray(candidate.required_capabilities)) {
        const ff = candidate.required_capabilities.find(rc =>
          rc && typeof rc === 'object' && rc.kind === 'form_factor'
          && /\bnative\b|\bapp store\b|\bios\b|\bandroid\b/i.test(String(rc.name || '')));
        if (ff) {
          hit = { anti_goal: goal, matched_field: 'required_capabilities', matched_text: ff.name };
          break;
        }
      }
    }

    if (hit) {
      disqualified.push({
        candidate,
        ...hit,
        reason: `Phase anti-goal '${hit.anti_goal}' matched on ${hit.matched_field} ("${hit.matched_text}") — chairman pre-excluded class (spec R2)`,
      });
    } else {
      eligible.push(candidate);
    }
  }

  return { eligible, disqualified };
}

/**
 * Screen a single routed PathOutput's candidate content (name/problem/solution/
 * target_market ride at the top level of PathOutput). Used by the path-router
 * choke point so ALL entry paths are reached.
 *
 * @param {Object} pathOutput
 * @param {Object} posture
 * @returns {null | {anti_goal, matched_field, matched_text, reason}} disqualification or null
 */
export function screenPathOutput(pathOutput, posture) {
  if (!pathOutput) return null;
  const pseudoCandidate = {
    name: pathOutput.suggested_name,
    problem_statement: pathOutput.suggested_problem,
    solution: pathOutput.suggested_solution,
    target_market: pathOutput.target_market,
  };
  const { disqualified } = applyAntiGoalScreen([pseudoCandidate], posture);
  if (disqualified.length === 0) return null;
  const { candidate, ...rest } = disqualified[0];
  return rest;
}
