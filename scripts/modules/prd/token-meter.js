/**
 * Token-budget meter for PRD rewrite loop (SD-LEO-INFRA-AUTO-GENERATED-PRD-001, FR-6).
 *
 * Wraps an LLM client so cumulative token usage is tracked per-PRD. Remaining
 * rewrites abort when either budget is exceeded; the prior story output is kept.
 *
 * Budget is per-PRD (not per-SD or global) so a single high-value PRD's rewrite
 * spend does not starve others. Reset via createTokenMeter() per generation.
 */

/**
 * Create a token meter bound to a provider client.
 *
 * @param {Object} client - Upstream LLM client with `.complete(system, user, opts)`
 * @param {{tokenBudgetIn:number, tokenBudgetOut:number}} budgets - From getRewriteConfig()
 * @returns {{
 *   complete: (system:string, user:string, opts?:object) => Promise<{content:string, usage:{input_tokens:number, output_tokens:number}}>,
 *   totals: () => {tokensIn:number, tokensOut:number},
 *   isExceeded: () => boolean,
 *   remaining: () => {tokensIn:number, tokensOut:number}
 * }}
 */
export function createTokenMeter(client, budgets) {
  let tokensIn = 0;
  let tokensOut = 0;

  const accountFor = (usage) => {
    if (!usage) return;
    // Anthropic SDK: input_tokens/output_tokens. Normalize snake/camel.
    tokensIn += Number(usage.input_tokens ?? usage.inputTokens ?? 0) || 0;
    tokensOut += Number(usage.output_tokens ?? usage.outputTokens ?? 0) || 0;
  };

  return {
    async complete(system, user, opts = {}) {
      if (this.isExceeded()) {
        const err = new Error('token_budget_exceeded');
        err.code = 'TOKEN_BUDGET_EXCEEDED';
        throw err;
      }
      const response = await client.complete(system, user, opts);
      accountFor(response?.usage);
      return response;
    },
    totals() {
      return { tokensIn, tokensOut };
    },
    isExceeded() {
      return tokensIn >= budgets.tokenBudgetIn || tokensOut >= budgets.tokenBudgetOut;
    },
    remaining() {
      return {
        tokensIn: Math.max(0, budgets.tokenBudgetIn - tokensIn),
        tokensOut: Math.max(0, budgets.tokenBudgetOut - tokensOut),
      };
    },
  };
}
