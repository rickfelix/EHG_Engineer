/**
 * Vitest helper: spy on @anthropic-ai/sdk invocations.
 *
 * SD-LEO-FEAT-GVOS-ACTIVATION-REMEDIATION-001 / FR-4 (TR-3) + FR-5 acceptance.
 *
 * Purpose: encode the "zero Anthropic SDK invocations in rule_only / backfill path"
 * guarantee as a CI-enforced test rather than relying on operator discipline.
 * If a future refactor accidentally introduces an Anthropic call into the rule_only
 * classifier or backfill script, the test FAILS at acceptance.
 *
 * Usage in a vitest spec:
 *
 *   import { setupAnthropicSpy, assertNoAnthropicCalls } from '../helpers/anthropic-spy.js';
 *   import { vi, describe, it, beforeEach } from 'vitest';
 *
 *   describe('FR-5 backfill', () => {
 *     const spy = setupAnthropicSpy(vi);
 *     beforeEach(() => spy.reset());
 *
 *     it('emits zero Anthropic SDK calls', async () => {
 *       await runBackfill();
 *       assertNoAnthropicCalls(spy);
 *     });
 *   });
 *
 * Implementation approach:
 *   vi.mock('@anthropic-ai/sdk', ...) replaces the module with a tracked stub.
 *   Every constructor call + method invocation increments spy.callCount.
 *   assertNoAnthropicCalls throws if any call was recorded.
 */

export function setupAnthropicSpy(vi) {
  const state = {
    callCount: 0,
    invocations: [],
    reset() {
      state.callCount = 0;
      state.invocations.length = 0;
    },
  };

  const track = (label, args) => {
    state.callCount += 1;
    state.invocations.push({ label, args });
  };

  // Replace @anthropic-ai/sdk default export with a Proxy that tracks any access.
  vi.mock('@anthropic-ai/sdk', () => {
    const Anthropic = function () {
      track('Anthropic.constructor', Array.from(arguments));
      return new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === 'messages') {
              return {
                create: (...args) => {
                  track('Anthropic.messages.create', args);
                  return Promise.reject(new Error('@anthropic-ai/sdk invocation in rule_only/backfill path is prohibited'));
                },
              };
            }
            if (prop === 'completions') {
              return {
                create: (...args) => {
                  track('Anthropic.completions.create', args);
                  return Promise.reject(new Error('@anthropic-ai/sdk invocation in rule_only/backfill path is prohibited'));
                },
              };
            }
            track(`Anthropic.<${String(prop)}>`, []);
            return undefined;
          },
        },
      );
    };
    return { default: Anthropic, Anthropic };
  });

  return state;
}

export function assertNoAnthropicCalls(state) {
  if (state.callCount !== 0) {
    const lines = state.invocations
      .slice(0, 5)
      .map((inv, i) => `  ${i + 1}. ${inv.label} args=${JSON.stringify(inv.args).slice(0, 120)}`);
    throw new Error(
      `Expected zero @anthropic-ai/sdk invocations but recorded ${state.callCount}.\n` +
        lines.join('\n') +
        (state.invocations.length > 5 ? `\n  ... ${state.invocations.length - 5} more` : ''),
    );
  }
}
