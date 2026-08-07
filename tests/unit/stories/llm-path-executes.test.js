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

describe('FR-4 follow-up: the shim must not silently drop conversation history', () => {
  it('preserves assistant turns instead of filtering to role==="user"', async () => {
    /**
     * *** THE FIRST CUT OF THE SHIM REINTRODUCED THIS SD'S OWN DEFECT CLASS. ***
     * It did `messages.filter(m => m.role === 'user')`, so every assistant turn vanished. A live
     * SECURITY control caught it: a [user, assistant, user] exchange reached .complete() with the
     * assistant text gone. eva-chat-service's generateEVAResponse — repaired in this very SD from a
     * hard TypeError to actually running — feeds real DB-backed history, so every reply past the
     * first would have lost EVA's own prior words.
     *
     * Replacing a HARD FAILURE with a QUIET WRONG ANSWER is worse than the bug being fixed, which
     * is why this is a test and not just a patch.
     */
    const { AnthropicAdapter } = await import('../../../lib/sub-agents/vetting/provider-adapters.js');
    const adapter = new AnthropicAdapter({ apiKey: 'test-key-not-used' });
    let captured = null;
    adapter.complete = async (_system, user) => { captured = user; return { content: 'ok', usage: {} }; };

    await adapter.messages.create({
      max_tokens: 16,
      messages: [
        { role: 'user', content: 'first question' },
        { role: 'assistant', content: 'PRIOR ASSISTANT REPLY' },
        { role: 'user', content: 'follow-up question' }
      ]
    });

    expect(captured, 'assistant turn must survive').toContain('PRIOR ASSISTANT REPLY');
    expect(captured).toContain('first question');
    expect(captured).toContain('follow-up question');

    // MUTATION: restore the user-only filter -> the assistant assertion fails.
  });

  it('leaves a single-turn call byte-identical — no framing text the caller did not ask for', async () => {
    // The overwhelmingly common case is one user message. Role labels there would silently alter
    // every existing prompt in the repo, so single-turn passes through verbatim.
    const { AnthropicAdapter } = await import('../../../lib/sub-agents/vetting/provider-adapters.js');
    const adapter = new AnthropicAdapter({ apiKey: 'test-key-not-used' });
    let captured = null;
    adapter.complete = async (_system, user) => { captured = user; return { content: 'ok', usage: {} }; };

    await adapter.messages.create({ max_tokens: 16, messages: [{ role: 'user', content: 'just this' }] });
    expect(captured).toBe('just this');
  });

  it('bounds recursion so a deeply-nested content array cannot blow the stack', async () => {
    // A SECURITY control blew the stack at ~200k depth. No call site passes nested arrays, so this
    // is defense-in-depth for a primitive now shared by EVERY adapter.
    const { AnthropicAdapter } = await import('../../../lib/sub-agents/vetting/provider-adapters.js');
    const adapter = new AnthropicAdapter({ apiKey: 'test-key-not-used' });
    adapter.complete = async (_s, u) => ({ content: String(u), usage: {} });

    let nested = [{ type: 'text', text: 'deep' }];
    for (let i = 0; i < 5000; i++) nested = [nested];

    await expect(
      adapter.messages.create({ max_tokens: 16, messages: [{ role: 'user', content: nested }] })
    ).resolves.toBeDefined();
  });
});

describe('FR-2 follow-up: the loud channel must not carry credentials', () => {
  it('redacts key-shaped tokens from degradation_reason and warnings', async () => {
    /**
     * A SECURITY control planted `Incorrect API key provided: sk-test-fake-planted...` in a thrown
     * error and found it VERBATIM in degradation_reason, warnings[0] and the console.warn. Nothing
     * persists those fields today, so this is defense-in-depth — but FR-2 deliberately made this
     * channel LOUD, and making a channel loud while leaving it unredacted is how a latent leak
     * becomes a real one.
     */
    vi.resetModules();
    vi.doMock('../../../lib/sub-agents/modules/stories/llm-story-generator.js', async (orig) => ({
      ...(await orig()),
      isLLMAvailable: () => true,
      createLLMStoryGenerator: () => ({
        isEnabled: () => true,
        generateStoriesFromCriteria: async () => {
          throw new Error('401 Incorrect API key provided: sk-test-fake-planted-key-00000');
        }
      })
    }));
    const { generateStoriesBatch: batch } = await import('../../../lib/sub-agents/modules/stories/quality-generation.js');
    const result = await batch(['a'], { id: 'PRD-T', functional_requirements: [] }, {}, { sdType: 'infrastructure' });
    vi.doUnmock('../../../lib/sub-agents/modules/stories/llm-story-generator.js');

    expect(result.generated_by, 'non-vacuity: the throwing path must be the one under test').toBe('RULE_BASED');
    expect(result.degradation_reason, 'the planted secret must not survive').not.toContain('sk-test-fake-planted');
    expect(JSON.stringify(result.warnings)).not.toContain('sk-test-fake-planted');
    // The reason must still be USEFUL — redaction that destroys the diagnosis defeats FR-2.
    expect(result.degradation_reason).toContain('[REDACTED]');
    expect(result.degradation_reason).toMatch(/401|Incorrect API key/);
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
      isLLMAvailable: () => true,
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
      isLLMAvailable: () => true,
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
