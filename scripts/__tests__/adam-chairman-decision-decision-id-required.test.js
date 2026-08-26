/**
 * SD-LEO-INFRA-SMS-DECIDE-REPLY-MATCHABLE-001 FR-4 / TS-5 — scripts/adam-chairman-decision.mjs
 * must refuse to build a send when --decision-id is omitted, matching its existing
 * --body/--option/--no-reply-policy required-field pattern.
 *
 * Subprocess-based (spawnSync), matching tests/cli-graceful-exit.test.js's convention — this
 * script has top-level, argv-driven side-effecting code that can only be exercised by actually
 * running it. --dry-run keeps it offline (no Twilio/Supabase reached).
 *
 * REGRESSION sub-agent finding REG-1 (HIGH, PLAN_VERIFICATION, SD-LEO-INFRA-CHAIRMAN-SMS-
 * DECISION-002 FR-5): the placeholder decision-id fixtures below ('dec-cli-test-1'/-2) predate
 * FR-5's --decision-id UUID validation and are not themselves valid UUIDs. 'dec-cli-test-1' is
 * used on the one test that reaches the UUID check (decisionId present, all other required
 * fields present too) and was updated to a real UUID -- this is the CORRECT tightened contract
 * FR-5 exists to enforce, not a workaround. 'dec-cli-test-2' is left unchanged: that test omits
 * --body, so parseDecisionArgs' missing-required-field check short-circuits before the UUID
 * check is ever reached (verified by reading the check order in adam-chairman-decision.mjs) --
 * it was never actually exercising decision-id validation and needs no change.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'adam-chairman-decision.mjs');

function runCli(args, timeoutMs = 15000) {
  return spawnSync(process.execPath, [SCRIPT, '--dry-run', ...args], {
    encoding: 'utf8', timeout: timeoutMs, cwd: ROOT,
  });
}

describe('adam-chairman-decision.mjs — --decision-id required (FR-4)', () => {
  it('TS-5: --body/--option x2/--no-reply-policy but NO --decision-id refuses, exit 0, no dry-run payload printed', () => {
    const r = runCli(['--body', 'Ship now or wait?', '--option', 'A', '--option', 'B', '--no-reply-policy', 'defaults to hold']);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain('DRY RUN');
    expect(r.stdout + r.stderr).toContain('--decision-id');
  });

  it('the same invocation WITH a valid --decision-id proceeds exactly as before this SD (dry-run payload printed, carries decisionId)', () => {
    // A real UUID (SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 FR-5 requires --decision-id to be one) --
    // the pre-FR-5 placeholder 'dec-cli-test-1' is not a valid UUID and would now be correctly
    // refused; see REGRESSION finding REG-1 in the file header.
    const VALID_UUID = '9e5aac51-0000-4000-8000-0000000000aa';
    const r = runCli(['--body', 'Ship now or wait?', '--option', 'A', '--option', 'B', '--no-reply-policy', 'defaults to hold', '--decision-id', VALID_UUID]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('DRY RUN');
    const jsonStart = r.stdout.indexOf('{');
    const payload = JSON.parse(r.stdout.slice(jsonStart));
    expect(payload.decisionId).toBe(VALID_UUID);
    expect(payload.type).toBe('decision');
  });

  it('still refuses on other pre-existing missing-field cases (regression: the OR-condition was extended, not replaced)', () => {
    const r = runCli(['--option', 'A', '--option', 'B', '--no-reply-policy', 'defaults to hold', '--decision-id', 'dec-cli-test-2']); // no --body
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain('DRY RUN');
  });
});
