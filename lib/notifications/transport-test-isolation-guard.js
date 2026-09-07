/**
 * Shared transport-layer test-isolation guard.
 * SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-C.
 *
 * Replaces the per-call-site guard at lib/comms/adam-outbound/chairman-sms-gate/index.js:243
 * (which covered only ONE of 8+ callers reaching the shared email transport, and none of the SMS
 * transport's 2 callers). Both lib/notifications/resend-adapter.js and
 * lib/messaging/providers/twilio-provider.js import isFetchMocked() from here rather than
 * duplicating the check or depending on each other -- neither transport is a natural dependency
 * of the other.
 *
 * Refuses a real network send whenever running under a test runner (VITEST/NODE_ENV=test)
 * UNLESS the caller has already installed a mocked fetch. Legitimate transport-level tests
 * (tests/unit/notifications/resend-adapter.test.js, tests/unit/messaging/twilio-provider-*.test.js)
 * replace globalThis.fetch with a vi.fn()/vi.stubGlobal mock, which carries a `.mock` property --
 * that is the detection signal. An accidental fallthrough from an UNRELATED test (the actual
 * incident shape: a throwing SMS sender with no opts.fallbackSend injected, falling through to
 * the real Resend adapter) leaves the REAL fetch in place and is refused before any network I/O.
 */

/**
 * @returns {boolean} true if globalThis.fetch has been replaced with a vitest/jest mock function.
 */
export function isFetchMocked() {
  const f = globalThis.fetch;
  return typeof f === 'function' && f.mock !== undefined;
}

/**
 * @returns {boolean} true when the caller should refuse a real network send: running under a
 *   test runner (VITEST or NODE_ENV=test) AND fetch has not been mocked.
 */
export function shouldRefuseRealSend() {
  return Boolean((process.env.VITEST || process.env.NODE_ENV === 'test') && !isFetchMocked());
}
