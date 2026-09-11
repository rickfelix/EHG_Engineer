/**
 * Pure-logic unit tests for lib/claim-guard.mjs's deferred-status refusal messaging.
 *
 * SD-LEO-INFRA-DEFERRED-STATE-ENTRANCE-001 — TS-5/TS-6/TS-7. Exercises the extracted
 * builder functions directly (buildDeferredRefusalLines, buildTargetAlreadyTerminalLines,
 * formatClaimFailure) rather than scripts/sd-start.js's console output, because static
 * source-file pinning cannot honestly prove the deferred-vs-terminal branch (PLAN-TO-EXEC
 * TESTING review, evidence e03cc24e-6d29-4dd5-ba23-777ffd66c88f).
 */
import { describe, it, expect } from 'vitest';
import {
  buildUnparkExitCommand,
  buildDeferredRefusalLines,
  formatClaimFailure,
} from '../../lib/claim-guard.mjs';

describe('buildUnparkExitCommand', () => {
  it('names npm run sd:unpark with the SD key', () => {
    expect(buildUnparkExitCommand('SD-X-001')).toContain('npm run sd:unpark');
    expect(buildUnparkExitCommand('SD-X-001')).toContain('SD-X-001');
  });
});

describe('TS-5: claim-guard TERMINAL banner for status=deferred names npm run sd:unpark', () => {
  it('buildDeferredRefusalLines contains the literal substring "npm run sd:unpark"', () => {
    const lines = buildDeferredRefusalLines('SD-X-001');
    expect(lines.join('\n')).toContain('npm run sd:unpark');
  });

  it('formatClaimFailure routes status=deferred through the deferred banner', () => {
    const text = formatClaimFailure({ success: false, error: 'sd_terminal_status', status: 'deferred', sdKey: 'SD-X-001' });
    expect(text).toContain('npm run sd:unpark');
    expect(text).toContain('DEFERRED');
  });
});

describe('TS-7 (regression): formatClaimFailure for completed/cancelled is unchanged', () => {
  it('status=completed keeps the prior TERMINAL wording, no sd:unpark mention', () => {
    const text = formatClaimFailure({ success: false, error: 'sd_terminal_status', status: 'completed', sdKey: 'SD-X-001' });
    expect(text).toContain('ITEM IS TERMINAL — CANNOT CLAIM');
    expect(text).toContain('status=completed');
    expect(text).not.toContain('sd:unpark');
  });

  it('cancelled QF (via claim_sd RPC guard) keeps the prior TERMINAL wording, no sd:unpark mention', () => {
    const text = formatClaimFailure({ success: false, error: 'sd_terminal_status', status: 'cancelled', sdKey: 'QF-X' });
    expect(text).toContain('ITEM IS TERMINAL — CANNOT CLAIM');
    expect(text).toContain('status=cancelled');
    expect(text).not.toContain('sd:unpark');
  });
});

// TS-6/TS-7 for scripts/sd-start.js's TARGET_ALREADY_TERMINAL block itself are covered by
// tests/unit/sd-start-terminal-target-deferred-branch.test.js, using the SAME static-pin
// pattern as the existing QF-20260704-825 regression test (tests/unit/sd-start-terminal-
// target-no-fallback.test.js) — extracting a pure function for that block broke that pinned
// test (PLAN-TO-EXEC TESTING sub-agent review caught this); the established codebase
// convention for sd-start.js's own console-output content is static source-pinning, not
// extraction, so this file stays scoped to lib/claim-guard.mjs's own pure functions.
