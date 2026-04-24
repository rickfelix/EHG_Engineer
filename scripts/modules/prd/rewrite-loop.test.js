// Tests for PRD rewrite loop (SD-LEO-INFRA-AUTO-GENERATED-PRD-001, FR-5 + FR-6 + FR-7).
// Covers AC-5.1 through AC-7.3 using a stub LLM client + stub rubric.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRewriteLoop } from './rewrite-loop.js';
import { shouldRewriteStory, getRewriteConfig, BOILERPLATE_AC, GENERIC_BENEFITS } from './rewrite-config.js';
import { createTokenMeter } from './token-meter.js';

function makeStubClient(responses) {
  const calls = [];
  let i = 0;
  return {
    calls,
    async complete(system, user, opts) {
      calls.push({ system, user, opts });
      const next = responses[i++] ?? responses[responses.length - 1];
      return typeof next === 'function' ? next({ system, user, opts }) : next;
    }
  };
}

function makeStubRubric(scoresByStory) {
  let callCount = 0;
  return {
    async validateUserStoryQuality(story) {
      const key = story?.id || story?.story_key || `story_${callCount}`;
      const scoreList = scoresByStory[key] || scoresByStory._default || [60];
      const score = scoreList[Math.min(callCount, scoreList.length - 1)];
      callCount++;
      return {
        passed: score >= 70,
        score,
        issues: score < 50 ? ['User benefit is generic', 'Acceptance criteria are boilerplate'] : [],
        warnings: [],
        details: {},
      };
    }
  };
}

// ---------- AC-5.1: Flag OFF → 0 LLM calls, 0 token delta ----------

test('AC-5.1: PRD_REWRITE_LOOP=false → skipped, no LLM calls', async () => {
  const client = makeStubClient([{ content: '{}', usage: { input_tokens: 100, output_tokens: 50 } }]);
  const rubric = makeStubRubric({ _default: [30] });
  const config = { enabled: false, scoreThreshold: 50, maxRounds: 2, tokenBudgetIn: 10000, tokenBudgetOut: 5000 };
  const prd = { user_stories: [{ id: 'US-001', user_benefit: 'accomplish my goals more efficiently', acceptance_criteria: ['feature is tested and verified'] }] };

  const result = await applyRewriteLoop(prd, { llmClient: client, rubric, config });

  assert.equal(result.skipped, true);
  assert.equal(client.calls.length, 0);
});

// ---------- AC-5.3: AND-gate blocks rewrites without boilerplate signal ----------

test('AC-5.3: low score with NO boilerplate pattern → NO rewrite triggered', async () => {
  const config = { enabled: true, scoreThreshold: 50, maxRounds: 2, tokenBudgetIn: 10000, tokenBudgetOut: 5000 };
  const story = { id: 'US-terse', user_benefit: 'deliver quarterly compliance reports', acceptance_criteria: ['System produces a PDF report for Q3'] };
  const gate = shouldRewriteStory(story, 40, config);
  assert.equal(gate.triggered, false);
});

// ---------- AC-5.4: AND-gate blocks rewrites for high-scoring stories ----------

test('AC-5.4: high score with boilerplate phrase → NO rewrite triggered', async () => {
  const config = { enabled: true, scoreThreshold: 50, maxRounds: 2, tokenBudgetIn: 10000, tokenBudgetOut: 5000 };
  const story = { user_benefit: 'accomplish my goals', acceptance_criteria: ['documentation is updated'] };
  const gate = shouldRewriteStory(story, 85, config);
  assert.equal(gate.triggered, false);
});

// ---------- AC-5.2 + AC-5.5 + AC-5.6: Rewrite happens, max 2 rounds, metadata written ----------

test('AC-5.2/5.5: low+boilerplate story rewrites, max 2 rounds enforced', async () => {
  const client = makeStubClient([
    { content: JSON.stringify({ user_benefit: 'make quarterly decisions', acceptance_criteria: [{ criterion: 'PDF renders' }] }), usage: { input_tokens: 120, output_tokens: 80 } },
    { content: JSON.stringify({ user_benefit: 'drive quarterly strategy', acceptance_criteria: [{ criterion: 'PDF renders with charts' }] }), usage: { input_tokens: 130, output_tokens: 90 } },
    { content: JSON.stringify({ user_benefit: 'support board reviews', acceptance_criteria: [{ criterion: 'PDF includes audit trail' }] }), usage: { input_tokens: 140, output_tokens: 100 } },
  ]);
  const rubric = makeStubRubric({ _default: [40, 60, 75] });
  const config = { enabled: true, scoreThreshold: 50, maxRounds: 2, tokenBudgetIn: 10000, tokenBudgetOut: 5000 };
  const prd = { user_stories: [{ id: 'US-1', user_benefit: 'accomplish my goals more efficiently', acceptance_criteria: ['feature is tested and verified'] }] };

  const result = await applyRewriteLoop(prd, { llmClient: client, rubric, config });

  assert.equal(result.skipped, false);
  assert.equal(result.attempts.length, 1);
  assert.ok(result.attempts[0].rounds.length <= 2, 'max 2 rounds');
  assert.ok(result.attempts[0].rounds.length >= 1, 'at least 1 round');
  assert.ok(client.calls.length <= 2, '3rd round never invoked');
});

// ---------- AC-6.2 + AC-6.3: Budget exceeded → skip, budget_aborted:true in metadata ----------

test('AC-6.2/6.3: token budget exceeded → remaining stories skip, budget_aborted flagged', async () => {
  const client = makeStubClient([
    { content: JSON.stringify({ user_benefit: 'drive decisions', acceptance_criteria: [{ criterion: 'X' }] }), usage: { input_tokens: 10000, output_tokens: 5000 } },
  ]);
  const rubric = makeStubRubric({ _default: [40, 40] }); // stays low so AND-gate keeps firing
  const config = { enabled: true, scoreThreshold: 50, maxRounds: 2, tokenBudgetIn: 100, tokenBudgetOut: 50 }; // tiny budget
  const prd = { user_stories: [
    { id: 'US-1', user_benefit: 'accomplish my goals', acceptance_criteria: ['feature is tested and verified'] },
    { id: 'US-2', user_benefit: 'accomplish my goals', acceptance_criteria: ['feature is tested and verified'] },
  ]};

  const result = await applyRewriteLoop(prd, { llmClient: client, rubric, config });

  assert.equal(result.budgetAborted, true);
});

// ---------- AC-7.1: Fail-open on regression → prior output kept ----------

test('AC-7.1: regressing rewrite keeps prior (highest-scoring) version', async () => {
  const client = makeStubClient([
    { content: JSON.stringify({ user_benefit: 'worse phrasing', acceptance_criteria: [{ criterion: 'worse AC' }] }), usage: { input_tokens: 100, output_tokens: 50 } },
  ]);
  const rubric = makeStubRubric({ _default: [40, 20] }); // 40 initial, 20 after rewrite → regression
  const config = { enabled: true, scoreThreshold: 50, maxRounds: 2, tokenBudgetIn: 10000, tokenBudgetOut: 5000 };
  const originalBenefit = 'accomplish my goals more efficiently';
  const prd = { user_stories: [{ id: 'US-1', user_benefit: originalBenefit, acceptance_criteria: ['feature is tested and verified'] }] };

  const result = await applyRewriteLoop(prd, { llmClient: client, rubric, config });

  assert.equal(result.attempts[0].rounds[0].kept, false);
  assert.equal(prd.user_stories[0].user_benefit, originalBenefit, 'original benefit preserved');
});

// ---------- Token meter sanity ----------

test('token-meter: accumulates tokens and signals exceeded', async () => {
  const client = {
    async complete() {
      return { content: 'ok', usage: { input_tokens: 60, output_tokens: 30 } };
    }
  };
  const meter = createTokenMeter(client, { tokenBudgetIn: 100, tokenBudgetOut: 50 });
  await meter.complete('s', 'u', {});
  assert.equal(meter.isExceeded(), false);
  await meter.complete('s', 'u', {});
  assert.equal(meter.isExceeded(), true);
});

test('token-meter: refuses to call once budget exceeded', async () => {
  const client = { async complete() { return { content: 'x', usage: { input_tokens: 1000, output_tokens: 1000 } }; } };
  const meter = createTokenMeter(client, { tokenBudgetIn: 10, tokenBudgetOut: 10 });
  await meter.complete('s', 'u', {});
  await assert.rejects(() => meter.complete('s', 'u', {}), /token_budget_exceeded/);
});

// ---------- shouldRewriteStory exhaustive gate matrix ----------

test('shouldRewriteStory: all 4 quadrants of AND-gate', () => {
  const config = { scoreThreshold: 50 };
  // Q1: low + boilerplate → rewrite
  const q1 = shouldRewriteStory({ user_benefit: BOILERPLATE_AC[0], acceptance_criteria: [] }, 40, config);
  assert.equal(q1.triggered, true);
  // Q2: low + generic benefit → rewrite
  const q2 = shouldRewriteStory({ user_benefit: GENERIC_BENEFITS[0], acceptance_criteria: ['whatever'] }, 40, config);
  assert.equal(q2.triggered, true);
  // Q3: high + any → skip
  const q3 = shouldRewriteStory({ user_benefit: GENERIC_BENEFITS[0], acceptance_criteria: [] }, 80, config);
  assert.equal(q3.triggered, false);
  // Q4: low + specific → skip
  const q4 = shouldRewriteStory({ user_benefit: 'very specific unique business outcome', acceptance_criteria: ['specific observable criterion'] }, 40, config);
  assert.equal(q4.triggered, false);
});
