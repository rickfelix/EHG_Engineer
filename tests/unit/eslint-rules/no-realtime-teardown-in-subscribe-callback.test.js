/**
 * Unit tests for ESLint rule `no-realtime-teardown-in-subscribe-callback`.
 *
 * SD-LEO-INFRA-REALTIME-REMOVECHANNEL-RECURSION-CLASSGUARD-001 FR-1.
 *
 * Covers: correct pattern (teardown outside the callback), the anti-pattern
 * (removeChannel/unsubscribe called synchronously inside the callback, incl.
 * nested in a conditional branch), the function-boundary exemption (deferred
 * teardown inside a nested closure is NOT synchronous-within-callback), and
 * the escape-hatch pragma contract (mirrors no-process-cwd-in-sub-agents.js).
 *
 * @module tests/unit/eslint-rules/no-realtime-teardown-in-subscribe-callback.test.js
 */

import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import rule from '../../../eslint-rules/no-realtime-teardown-in-subscribe-callback.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const RULE_ID = 'rule-to-test/no-realtime-teardown-in-subscribe-callback';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    globals: { setTimeout: 'readonly' },
  },
});

ruleTester.run('no-realtime-teardown-in-subscribe-callback', rule, {
  valid: [
    // TS-1: correct pattern — null the ref inside the callback, teardown lives
    // in a separate cleanup() function invoked outside the callback.
    {
      code: `
        let subscription = channel.subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
            subscription = null;
            startPolling();
          }
        });
        function cleanup() {
          if (subscription) {
            supabase.removeChannel(subscription);
            subscription = null;
          }
        }
      `,
    },
    // No teardown call anywhere in the callback at all.
    {
      code: `
        channel.subscribe((status) => {
          console.log('status', status);
        });
      `,
    },
    // Deferred teardown inside a nested closure (e.g. setTimeout) is NOT
    // synchronous-within-the-callback-invocation — function-boundary exempt.
    {
      code: `
        channel.subscribe((status) => {
          if (status === 'CLOSED') {
            setTimeout(() => {
              supabase.removeChannel(channel);
            }, 0);
          }
        });
      `,
    },
    // .subscribe() with a non-function argument (e.g. an options object) —
    // rule only activates on inline function callbacks.
    {
      code: `emitter.subscribe(handlerRef);`,
    },
    // Pragma with full REASON — valid suppression.
    {
      code: `
        channel.subscribe((status) => {
          if (status === 'CLOSED') {
            // eslint-disable-next-line ${RULE_ID} -- channel is a DIFFERENT, unrelated one-shot subscription
            channel.unsubscribe();
          }
        });
      `,
    },
  ],

  invalid: [
    // TS-2: supabase.removeChannel(ref) called directly inside the callback.
    {
      code: `
        const subscription = channel.subscribe((status) => {
          if (status === 'CHANNEL_ERROR') {
            supabase.removeChannel(subscription);
          }
        });
      `,
      errors: [{ messageId: 'noTeardownInCallback' }],
    },
    // TS-3: <ref>.unsubscribe() called directly inside the callback.
    {
      code: `
        channel.subscribe((status) => {
          if (status === 'TIMED_OUT') {
            channel.unsubscribe();
          }
        });
      `,
      errors: [{ messageId: 'noTeardownInCallback' }],
    },
    // TS-4: nested inside an if/else status branch — still detected.
    {
      code: `
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('ok');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            if (isVerbose) {
              console.log('tearing down');
            }
            supabase.removeChannel(channel);
          }
        });
      `,
      errors: [{ messageId: 'noTeardownInCallback' }],
    },
    // Arrow function with expression body (no block) — still detected.
    {
      code: `channel.subscribe((status) => status === 'CLOSED' && supabase.removeChannel(channel));`,
      errors: [{ messageId: 'noTeardownInCallback' }],
    },
    // Both removeChannel and unsubscribe present — two separate violations.
    {
      code: `
        channel.subscribe((status) => {
          if (status === 'CLOSED') {
            supabase.removeChannel(channel);
          }
          if (status === 'TIMED_OUT') {
            channel.unsubscribe();
          }
        });
      `,
      errors: [{ messageId: 'noTeardownInCallback' }, { messageId: 'noTeardownInCallback' }],
    },
    // Pragma present but missing the `--` REASON marker entirely.
    {
      code: `
        channel.subscribe((status) => {
          // eslint-disable-next-line ${RULE_ID}
          channel.unsubscribe();
        });
      `,
      errors: [{ messageId: 'noTeardownInCallback' }],
    },
    // Pragma present with `--` marker but an empty REASON body.
    {
      code: `
        channel.subscribe((status) => {
          // eslint-disable-next-line ${RULE_ID} --   \n          channel.unsubscribe();
        });
      `,
      errors: [{ messageId: 'pragmaMissingReason' }],
    },
  ],
});
