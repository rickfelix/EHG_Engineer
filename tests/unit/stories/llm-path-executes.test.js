/**
 * SD-LEO-INFRA-USER-STORY-QUALITY-001 (FR-6) — tests that EXECUTE the repaired path.
 *
 * *** THIS FILE EXISTS BECAUSE THE OLD ONE NEVER TOUCHED THE CODE IT WAS NAMED AFTER. ***
 * llm-story-generator.test.js mocks `@anthropic-ai/sdk` — a package the production file stopped
 * importing when it moved onto the client factory — so the mock binds to nothing. And no test in it
 * calls callClaude, generateStoriesFromCriteria, generateSingleStory or detectRequirementGaps. The
 * line that threw on every invocation for 172 days has never been executed by a test. That is not a
 * mock that lied green; it is a check that never touched its subject, which is strictly harder to
 * notice because every signal it emits is honest about something irrelevant.
 *
 * So every test here is written to a single standard: COULD THIS PASS WHILE THE DEFECT IS PRESENT?
 * Where the answer would otherwise be yes, the test carries an explicit negative control that
 * reproduces the old behaviour and asserts it fails.
 */
import { describe, it, expect, vi } from 'vitest';
import { criterionFromFR } from '../../../lib/sub-agents/modules/stories/execute.js';
// NOTE: generateStoriesBatch is deliberately NOT imported statically. The FR-2 tests need the
// generator mocked BEFORE quality-generation.js is evaluated, so they import it dynamically after
// vi.doMock. A static import here would bind the unmocked module and silently defeat the mock —
// which is how the first version of those tests ended up exercising the LLM success path instead of
// the fallback they claimed to guard.

/** Minimal stand-in for what getLLMClient() actually returns: `.complete()`, and NO `.messages`. */
function makeAdapter(overrides = {}) {
  const adapter = {
    provider: 'test',
    defaultModel: 'test-model',
    complete: async (_system, user) => ({
      content: `RESPONSE:${String(user).slice(0, 20)}`,
      usage: { inputTokens: 1, outputTokens: 2 },
      model: 'test-model'
    }),
    ...overrides
  };
  return adapter;
}

describe('FR-4: the adapter compat layer covers BOTH conventions', () => {
  it('addOpenAICompatLayer installs .messages.create alongside .chat.completions.create', async () => {
    /**
     * THE ASYMMETRY WAS THE BUG. Every adapter has had `.chat.completions.create()` all along, so
     * 40+ call sites of that shape work regardless of which client they hold. There was no
     * mirroring `.messages` layer, so the Anthropic-native convention — the one every Anthropic doc
     * shows — threw `Cannot read properties of undefined (reading 'create')` BEFORE any network
     * call. One convention self-healed, the other detonated, and copy-paste reproduced the failure
     * at four separate call sites.
     */
    const { AnthropicAdapter } = await import('../../../lib/sub-agents/vetting/provider-adapters.js');
    const adapter = new AnthropicAdapter({ apiKey: 'test-key-not-used' });

    expect(typeof adapter.complete, 'the real adapter surface').toBe('function');
    expect(typeof adapter.chat?.completions?.create, 'pre-existing OpenAI shim').toBe('function');
    expect(typeof adapter.messages?.create, 'FR-4 shim — this was UNDEFINED, and that was the bug').toBe('function');
  });

  it('the .messages shim returns Anthropic-shaped content and flattens content blocks', async () => {
    const { _testables } = await import('../../../lib/sub-agents/vetting/provider-adapters.js').then((m) => ({ _testables: m }));
    // Drive the shim through a real adapter instance rather than re-implementing it here, so the
    // test fails if the shim is deleted rather than if a copy of it drifts.
    const { AnthropicAdapter } = _testables;
    const adapter = new AnthropicAdapter({ apiKey: 'test-key-not-used' });
    adapter.complete = makeAdapter().complete;

    const res = await adapter.messages.create({
      max_tokens: 16,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }]
    });

    expect(res.content[0].text).toMatch(/^RESPONSE:/);
    // A content-block array reaching a string slot is exactly the corruption FR-5 fixes elsewhere.
    expect(res.content[0].text, 'block array must flatten, not stringify').not.toContain('[object Object]');
    expect(res.usage).toMatchObject({ input_tokens: 1, output_tokens: 2 });
  });
});

describe('FR-2: taking the fallback is LOUD', () => {
  it('reports degraded=true with a reason, and still returns stories', async () => {
    /**
     * Coordinator-mandated. The old return said success:true on the fallback with only a
     * console.log, which is why 6,167 template rows accumulated while 0 LLM rows were ever written.
     *
     * *** THE FIRST VERSION OF THIS TEST WAS VACUOUS AND MUTATION TESTING IS THE ONLY REASON I
     * KNOW. *** It called generateStoriesBatch with ambient env, and because the LLM path now
     * WORKS it took the success branch every time — so the `if (generated_by === 'RULE_BASED')`
     * body never ran, and stripping every degraded field from the fallback return did not fail it.
     * A test guarding the fallback that never reaches the fallback is the same shape as the file
     * this SD is fixing: a check that never touched the code it was named after.
     *
     * So the generator is now FORCED to fail. The fallback is the only reachable path, and the
     * non-vacuity assertion below fails loudly if that ever stops being true.
     */
    vi.resetModules();
    vi.doMock('../../../lib/sub-agents/modules/stories/llm-story-generator.js', async (orig) => ({
      ...(await orig()),
      createLLMStoryGenerator: () => ({
        isEnabled: () => true,
        generateStoriesFromCriteria: async () => { throw new Error('forced provider outage'); },
        generateSingleStory: async () => { throw new Error('forced provider outage'); }
      })
    }));
    const { generateStoriesBatch: batch } = await import('../../../lib/sub-agents/modules/stories/quality-generation.js');

    const result = await batch(
      ['The system shall page results', 'The system shall record a receipt'],
      { id: 'PRD-TEST', functional_requirements: [] },
      {},
      { sdType: 'infrastructure' }
    );
    vi.doUnmock('../../../lib/sub-agents/modules/stories/llm-story-generator.js');

    // NON-VACUITY: prove the fallback actually ran. Without this the assertions below can pass by
    // never executing the branch they describe — which is exactly how the first version failed.
    expect(result.generated_by, 'the fallback path must be the one under test').toBe('RULE_BASED');

    expect(Array.isArray(result.stories), 'degrading must not be fatal').toBe(true);
    expect(result.stories.length).toBe(2);
    expect(result, 'the field that did not exist before FR-2').toHaveProperty('degraded');
    expect(result.degraded).toBe(true);
    expect(typeof result.degradation_reason).toBe('string');
    expect(result.degradation_reason, 'must name WHY, not merely that').toMatch(/LLM_THREW|forced provider outage/);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('reports degraded=false when the LLM path succeeds', async () => {
    // The other half of the contract: `degraded` is present on BOTH paths, so a caller branches on
    // one field instead of inferring health from the absence of a warning.
    vi.resetModules();
    vi.doMock('../../../lib/sub-agents/modules/stories/llm-story-generator.js', async (orig) => ({
      ...(await orig()),
      createLLMStoryGenerator: () => ({
        isEnabled: () => true,
        generateStoriesFromCriteria: async (criteria) => ({
          success: true,
          stories: criteria.map((c, i) => ({ title: `S${i}`, user_role: 'Platform User', original_criterion: c })),
          gaps: []
        })
      })
    }));
    const { generateStoriesBatch: batch } = await import('../../../lib/sub-agents/modules/stories/quality-generation.js');
    const result = await batch(['a', 'b'], { id: 'PRD-TEST', functional_requirements: [] }, {}, { sdType: 'infrastructure' });
    vi.doUnmock('../../../lib/sub-agents/modules/stories/llm-story-generator.js');

    expect(result.generated_by, 'the success path must be the one under test').toBe('LLM');
    expect(result.degraded).toBe(false);
    expect(result.degradation_reason).toBeNull();
  });

  it('NEGATIVE CONTROL: asserting generated_by alone would pass against the defect', () => {
    /**
     * *** THE PRD ORIGINALLY NAMED THE WRONG KILLING MUTATION AND THIS TEST IS WHY IT CHANGED. ***
     * "Revert to the bare success:true shape" does not kill a test that checks
     * generated_by === 'RULE_BASED', because that field was ALREADY PRESENT in the broken shape.
     * Such a test passes against the very thing FR-2 forbids. The discriminator has to be a field
     * that did not exist before, so this control pins that reasoning in place: if someone later
     * weakens the test above to check generated_by, this assertion documents why that is not an
     * FR-2 test.
     */
    const oldShape = { success: true, stories: [], gaps: [], generated_by: 'RULE_BASED', sd_context_applied: false };

    expect(oldShape.generated_by, 'present in the DEFECTIVE shape too — so useless as a signal').toBe('RULE_BASED');
    expect(oldShape, 'the actual discriminator is absent from the defective shape').not.toHaveProperty('degraded');
  });
});

describe('FR-5: story-source text is never "[object Object]"', () => {
  it('reads the `requirement` field the old chain omitted', () => {
    expect(criterionFromFR({ requirement: 'The system shall page results' }))
      .toBe('The system shall page results');
  });

  it('guards non-string input with a traceable placeholder', () => {
    const out = criterionFromFR({ id: 'FR-9' }, 8);
    expect(out).not.toContain('[object Object]');
    expect(out, 'placeholder must be greppable back to a specific FR').toContain('FR-9');
    expect(criterionFromFR(null, 0)).not.toContain('[object');
    expect(criterionFromFR(42, 0)).not.toContain('[object');
  });

  it('NEGATIVE CONTROL: the old expression really does emit the corruption', () => {
    // Without this, the tests above would pass against a codebase that never had the bug, and would
    // not distinguish "guard works" from "input happened to be benign". 66 real stories carry this
    // string in their TITLE, and all 66 have validation_status='validated'.
    const oldExpression = (fr) => fr.title || fr.description || String(fr);
    expect(oldExpression({ requirement: 'x' })).toBe('[object Object]');
    expect(criterionFromFR({ requirement: 'x' })).toBe('x');
  });

  it('preserves precedence so existing PRDs generate identical criteria', () => {
    expect(criterionFromFR({ title: 'T', description: 'D', requirement: 'R' })).toBe('T');
    expect(criterionFromFR({ description: 'D', requirement: 'R' })).toBe('D');
    expect(criterionFromFR('already a string')).toBe('already a string');
  });
});
