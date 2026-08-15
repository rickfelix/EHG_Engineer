/**
 * Proven/Better/New (PBN) scoring skill.
 *
 * SD-LEO-FEAT-PROVEN-BETTER-NEW-001 FR-1. Decomposes a raw venture brief into three cited
 * buckets ahead of the nursery -> Stage-0 promotion decision:
 *   PROVEN = incumbent mechanics + evidence of existing demand, each claim cited to a real
 *            market referent, never intuition.
 *   BETTER = a named friction point in the proven model + a testable improvement hypothesis.
 *   NEW    = exactly one novel wedge, pre-declared expected-to-fail, never risking the
 *            foundation.
 *
 * FR-3 (coverage-not-completeness): the LLM is instructed to mark a bucket uncoverable
 * (coverage:false, empty citations) rather than invent a citation to force a pass. This
 * module does not enforce that discipline itself -- pbn-gate.js's resolveCitation() is the
 * deterministic backstop that catches a citation with no real reference field regardless of
 * what the LLM claims.
 */
import { getLLMClient } from '../../llm/client-factory.js';

const SYSTEM_PROMPT = `You are a venture-validation analyst applying the Proven/Better/New framework (Pincus/Zynga) to a raw venture idea, BEFORE any code is written.

Decompose the idea into three buckets:

PROVEN: name the incumbent mechanic(s) this idea's core loop is built on, and cite REAL evidence that demand already exists for that mechanic (an existing product, a market category, a documented user behavior). Never cite intuition or a hypothetical. If you cannot name a real, checkable referent, leave citations empty and set coverage to false -- do NOT invent one.

BETTER: name ONE specific friction point in the proven model this idea removes or reduces, and state a testable improvement hypothesis (a claim specific enough that a "10 of 10 people say f-yes" test could falsify it). If you cannot identify a real friction point distinct from generic "make it better", leave coverage false.

NEW: name EXACTLY ONE genuinely novel wedge -- the one element that is NOT proven anywhere yet. Pre-declare it as expected-to-fail (this is the bet, not the foundation). If the idea has zero novel elements, or more than one, still name what you see -- the hard gate rules (applied downstream, not by you) decide pass/reject/trim, your job is only to describe honestly what is there.

Respond with valid JSON only, no prose outside the JSON:
{
  "proven": { "mechanic": "<name>", "citations": [{"source": "<real referent>", "measured": "<what was observed/measured about it>", "reference": "<how to check it>"}], "coverage": <true|false> },
  "better": { "hypothesis": "<the testable improvement claim>", "friction_point": "<the specific friction being removed>", "citations": [{"source": "...", "measured": "...", "reference": "..."}], "coverage": <true|false> },
  "new": { "wedge": "<the one novel element>", "wedge_count": <integer, how many genuinely novel elements you actually see, even if the idea author only names one>, "coverage": <true|false> }
}`;

/**
 * Score a venture brief into PBN buckets via LLM.
 *
 * @param {Object} brief - venture brief (name, problem_statement, solution, target_market, etc.)
 * @param {Object} [deps]
 * @param {Object} [deps.llmClient] - injectable LLM client (test seam); defaults to
 *   getLLMClient({purpose:'classification'})
 * @param {Object} [deps.logger]
 * @returns {Promise<{proven: object, better: object, new: object}>} raw (unvalidated) buckets
 */
export async function scorePbnBuckets(brief, deps = {}) {
  const { logger = console } = deps;
  const client = deps.llmClient || getLLMClient({ purpose: 'classification' });

  const userPrompt = `Idea: "${brief.name}"
Problem: ${brief.problem_statement || '(not stated)'}
Solution: ${brief.solution || '(not stated)'}
Target market: ${brief.target_market || '(not stated)'}
${brief.thesis ? `Thesis: ${JSON.stringify(brief.thesis)}` : ''}

Decompose into PROVEN / BETTER / NEW.`;

  try {
    const response = await client.complete(SYSTEM_PROMPT, userPrompt, {
      maxTokens: 800,
      temperature: 0.1,
    });

    const text = response.content;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in LLM response');

    const parsed = JSON.parse(jsonMatch[0]);
    return normalizeRawBuckets(parsed);
  } catch (err) {
    logger.error?.(`[PBN Scoring] Failed to score "${brief.name}": ${err.message}`);
    // FR-3 fail-closed: a scoring failure is NOT a pass. Every bucket comes back
    // uncoverable, which pbn-gate.js's empty-proven rule will REJECT -- a failed scorer
    // must never silently produce a PASS-shaped result.
    return {
      proven: { mechanic: null, citations: [], coverage: false },
      better: { hypothesis: null, friction_point: null, citations: [], coverage: false },
      new: { wedge: null, wedge_count: 0, coverage: false },
      scoring_error: err.message,
    };
  }
}

/**
 * Coerce/clamp raw LLM JSON into the expected shape (house pattern: manual coercion,
 * never trust LLM output verbatim -- see lib/eva/youtube-relevance-scorer.js).
 */
function normalizeRawBuckets(parsed) {
  const proven = parsed?.proven || {};
  const better = parsed?.better || {};
  const newBucket = parsed?.new || {};
  return {
    proven: {
      mechanic: typeof proven.mechanic === 'string' ? proven.mechanic : null,
      citations: Array.isArray(proven.citations) ? proven.citations : [],
      coverage: proven.coverage === true,
    },
    better: {
      hypothesis: typeof better.hypothesis === 'string' ? better.hypothesis : null,
      friction_point: typeof better.friction_point === 'string' ? better.friction_point : null,
      citations: Array.isArray(better.citations) ? better.citations : [],
      coverage: better.coverage === true,
    },
    new: {
      wedge: typeof newBucket.wedge === 'string' ? newBucket.wedge : null,
      wedge_count: Number.isFinite(newBucket.wedge_count) ? Math.max(0, Math.round(newBucket.wedge_count)) : (newBucket.wedge ? 1 : 0),
      coverage: newBucket.coverage === true,
    },
  };
}
