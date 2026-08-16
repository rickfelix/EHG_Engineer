/**
 * lib/agent-readiness/prompt-sets.js
 * SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 FR-3 / US-002 / US-006.
 *
 * Pre-registered buyer-intent prompt sets. "Pre-registered" means fixed BEFORE a before/after pair
 * runs — a prompt set edited between the before-run and the after-run would confound the delta with
 * a methodology change, not just llm.txt's effect. agent_readiness_audit_run.prompt_count >= 5 is
 * enforced at the DB layer (agent_readiness_audit_run_prompt_count_floor), so every set here has 5+.
 */

export const PROMPT_SETS = {
  'buyer-intent-generic-v1': {
    id: 'buyer-intent-generic-v1',
    description: 'Generic buyer-intent findability prompts, no venture-specific facts baked in.',
    prompts: [
      (venture) => `I'm looking for a company like ${venture}. Can you find and describe it?`,
      (venture) => `Is ${venture} a real, trustworthy business I could buy from or hire?`,
      (venture) => `What does ${venture} offer, and would you recommend them for a business need?`,
      (venture) => `I need a vendor similar to what ${venture} provides. Would you suggest ${venture}?`,
      (venture) => `Summarize what ${venture} does and whether it's a credible option in its category.`
    ]
  }
};

/**
 * @param {string} promptSetId
 * @param {string} ventureLabel - human-readable venture name/identifier to interpolate into prompts
 * @returns {string[]} resolved prompt strings (length == prompt_count for this set)
 */
export function resolvePromptSet(promptSetId, ventureLabel) {
  const set = PROMPT_SETS[promptSetId];
  if (!set) throw new Error(`Unknown prompt_set_id: ${promptSetId}`);
  return set.prompts.map((fn) => fn(ventureLabel));
}

export function promptCountFor(promptSetId) {
  const set = PROMPT_SETS[promptSetId];
  if (!set) throw new Error(`Unknown prompt_set_id: ${promptSetId}`);
  return set.prompts.length;
}
