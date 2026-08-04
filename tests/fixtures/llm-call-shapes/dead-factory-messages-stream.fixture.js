/**
 * *** PRESERVED SPECIMEN — NOT LIVE CODE, NOT A DEFECT, DO NOT FILE IT. ***
 *
 * This is a verbatim copy of a call shape that was DELETED from
 * lib/integrations/eva-chat-service.js by SD-LEO-INFRA-LLM-ADAPTER-STREAMING-ABSENT-001.
 * Find the deletion with:  git log -S dead-factory-messages-stream --oneline
 * and diff the removed original with:  git show <that sha> -- lib/integrations/eva-chat-service.js
 *
 * WHY IT IS KEPT. SD-LEO-INFRA-LLM-STORY-CANARY-AND-LINT-001 plans a lint rule for exactly this
 * defect class, and its own evidence recorded the deleted site as the ONLY live specimen in the
 * repo. Deleting the last positive subject would hand that rule no way to prove it can fire — the
 * "a control that cannot fire" defect that SD exists to prevent. So the specimen outlives the
 * defect.
 *
 * WHY BOTH LINES MATTER. The defect is NOT the call form alone. A sweep keyed on `.messages.stream(`
 * cannot tell a factory adapter from a raw SDK client, and ONLY THE FACTORY ADAPTERS ARE DEAD — a
 * raw `new Anthropic()` client has a real `.messages.stream`. So the diagnostic pair is
 * (call form x RECEIVER ORIGIN), and this fixture preserves the receiver-construction line as well
 * as the call. A fixture carrying only the call would encode the very blindness the rule exists to
 * remove.
 *
 * WHAT MADE IT DEAD, both independently fatal:
 *   1. `createLLMClient` has NEVER been exported by lib/llm/client-factory.js (git log -S on that
 *      file is empty). The destructure yields undefined and the call throws on a missing symbol.
 *   2. Even with a real client, the FR-4 compat layer installs `.messages.create` and deliberately
 *      NOT `.messages.stream`, because a `.stream()` that resolved `.complete()` and emitted one
 *      blob would make the word "stream" false.
 *
 * INERT BY THREE INDEPENDENT MECHANISMS, each verified rather than assumed:
 *   - `tests/` is outside dead-code-scanner.mjs IMPORT_GRAPH_DIRS, so it is never graph-scanned.
 *   - the vitest unit project collects only `*.test.js`, so a `.fixture.js` name cannot be run.
 *   - nothing imports this file; the export exists solely to give a parser something to bind.
 *
 * LINTABILITY, CORRECTED AFTER REVIEW MEASURED IT. This file was originally named `.fixture.mjs`,
 * and that made it EFFECTIVELY UNLINTABLE: eslint.config.js's main block matches only .js, .jsx,
 * .ts and .tsx, so `--print-config` returned ONE rule (disabled) for the .mjs name against EIGHT
 * for a sibling .js. A rule registered the ordinary way would not have
 * fired on the very specimen kept to prove it can fire -- the "control that cannot fire" defect
 * this fixture exists to prevent, reproduced inside the fixture. Renamed to `.js`, now 8 rules.
 * NOTE the remaining limit: `npm run lint` is `eslint scripts/ lib/ tools/`, so `tests/` is outside
 * its directory scope. A future rule must target this path explicitly (as
 * scripts/lint/session-coordination-insert-classguard-lint.mjs does for its own subject).
 */

// --- BEGIN PRESERVED SPECIMEN ---------------------------------------------------------------
// Receiver origin: a FACTORY client. This is the half a call-form-only sweep cannot see.
export async function deadFactoryMessagesStreamSpecimen(messages, model, systemPrompt) {
  const { createLLMClient } = await import('../../../lib/llm/client-factory.js');
  const client = await createLLMClient('sonnet');

  // Call form: `.messages.stream(` on that factory client. Neither compat layer defines it.
  const stream = client.messages.stream({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  let fullContent = '';
  stream.on('text', (text) => {
    fullContent += text;
  });

  const finalMessage = await stream.finalMessage();
  return { fullContent, finalMessage };
}
// --- END PRESERVED SPECIMEN -----------------------------------------------------------------
