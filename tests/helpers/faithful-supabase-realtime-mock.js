/**
 * Faithful Supabase Realtime channel mock — shared across all consumers.
 * SD-LEO-INFRA-REALTIME-REMOVECHANNEL-RECURSION-CLASSGUARD-001 FR-2.
 *
 * Real behavior being reproduced: `@supabase/phoenix`'s `Channel.leave()` (invoked
 * by BOTH `channel.unsubscribe()` and `supabase.removeChannel(channel)` — the
 * latter wraps the former internally) synchronously re-fires the channel's
 * `.subscribe(status => {...})` status callback with 'CLOSED' before settling.
 * A consumer that calls a teardown method FROM INSIDE that same status callback
 * therefore recurses unboundedly -> RangeError: Maximum call stack size exceeded.
 *
 * A mock whose `unsubscribe()`/`removeChannel()` are simple no-ops (the pattern
 * that shipped 3x independently — ae499d9957/QF-709, PR #5305/QF-762 — before
 * this class-guard existed) CANNOT catch a regression: the recursion never has
 * a chance to start, so the test passes whether or not the code under test is
 * correct. This helper re-fires the callback, so a test written against it
 * genuinely reproduces the crash on the anti-pattern and only passes on the
 * correct fix (null the local reference; defer teardown outside the callback).
 *
 * Usage:
 *   import { createFaithfulRealtimeChannelMock } from '../../helpers/faithful-supabase-realtime-mock.js';
 *   const { channelMock, removeChannel, getStatusCallback, getUnsubscribeCallCount, getRemoveChannelCallCount } =
 *     createFaithfulRealtimeChannelMock();
 *   const supabase = {
 *     ...yourOwnFromMock,
 *     channel: () => channelMock,
 *     removeChannel,
 *   };
 *
 * @module tests/helpers/faithful-supabase-realtime-mock
 */

/**
 * @param {object} [options]
 * @param {number} [options.recursionGuardLimit] — throws once a teardown method's
 *   own re-fire loop exceeds this count, so a genuinely-broken test (not the code
 *   under test) fails loudly instead of hanging/overflowing the real call stack.
 * @returns {{
 *   channelMock: { on: Function, subscribe: Function, unsubscribe: Function },
 *   removeChannel: Function,
 *   getStatusCallback: () => Function | null,
 *   getUnsubscribeCallCount: () => number,
 *   getRemoveChannelCallCount: () => number,
 * }}
 */
export function createFaithfulRealtimeChannelMock(options = {}) {
  const recursionGuardLimit = options.recursionGuardLimit ?? 100;

  let capturedStatusCallback = null;
  let unsubscribeCallCount = 0;
  let removeChannelCallCount = 0;

  const channelMock = {
    on() {
      return channelMock;
    },
    subscribe(cb) {
      capturedStatusCallback = cb;
      return channelMock;
    },
    unsubscribe() {
      unsubscribeCallCount++;
      if (unsubscribeCallCount > recursionGuardLimit) {
        throw new Error('unsubscribe recursion guard tripped -- test itself would overflow');
      }
      // Simulates phoenix's synchronous Channel.leave() re-firing the same status callback.
      capturedStatusCallback?.('CLOSED');
    },
  };

  function removeChannel() {
    removeChannelCallCount++;
    if (removeChannelCallCount > recursionGuardLimit) {
      throw new Error('removeChannel recursion guard tripped -- test itself would overflow');
    }
    // Mirrors the real RealtimeClient.removeChannel() -> Channel.leave() relationship:
    // removeChannel() calls unsubscribe() internally, it does not recurse independently.
    channelMock.unsubscribe();
  }

  return {
    channelMock,
    removeChannel,
    getStatusCallback: () => capturedStatusCallback,
    getUnsubscribeCallCount: () => unsubscribeCallCount,
    getRemoveChannelCallCount: () => removeChannelCallCount,
  };
}
