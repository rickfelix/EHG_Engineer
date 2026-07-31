/**
 * SD-LEO-INFRA-WORKER-ESCALATION-WRITE-001 (FR-6, AC-2) — the blocker re-check has a REAL caller.
 *
 * *** THIS FR EXISTED TO FINISH WIRING A PRIOR SD LEFT UNDONE, AND SHIPPED WITHOUT DOING IT. ***
 * FR-6's own text says SD-LEO-INFRA-BLOCKED-WORKER-SELF-RECHECK-001 shipped
 * scripts/worker-recheck-blocker.mjs "with ZERO callers repo-wide — no hook, no slash command, no
 * npm script, no workflow". VALIDATION found that still true at PLAN_VERIFICATION: the only repo
 * references were the script's own usage docs and one doc comment. So the FR that exists to close a
 * mechanism-without-a-caller gap had reproduced it exactly.
 *
 * WHAT COUNTS AS A CALLER HERE, stated because it is a judgement and a weak answer would be the same
 * defect again: the executor of this script is a WORKER — an LLM following the loop directive. The
 * directive IS the executable surface. So wiring means (a) the directive names the command instead of
 * telling workers to type raw git, and (b) the command resolves and runs. Before this, the directive
 * said "the re-check is one command" and then gave raw git — and exit code 4, DRAIN_REQUIRED, which
 * is FR-6's entire contribution, reached no worker at all.
 *
 * THE THIRD TEST IS THE LOAD-BEARING ONE. Asserting that a doc mentions a filename is the token-caller
 * shape this SD condemns — text matching text. It EXECUTES the CLI and requires a contract-conformant
 * exit code, so the test fails if the script is deleted, renamed, made non-executable, or starts
 * exiting outside its documented set.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const { readFileSync, existsSync } = require_('node:fs');
const { execFileSync } = require_('node:child_process');
const path = require_('node:path');

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../../..');
const CLI = 'scripts/worker-recheck-blocker.mjs';
const DIRECTIVE = 'docs/protocol/fleet-worker-loop-directive.md';

describe('FR-6 AC-2: the blocker re-check CLI is invoked by a real caller', () => {
  it('an npm script points at the CLI', () => {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    expect(pkg.scripts['worker:recheck-blocker']).toBeDefined();
    expect(pkg.scripts['worker:recheck-blocker']).toContain(CLI);
    expect(existsSync(path.join(repoRoot, CLI))).toBe(true);

    // MUTATION: drop the npm script -> fails. It was absent before this FR.
  });

  it('the loop directive names the command, so the worker that must run it can find it', () => {
    // The directive is what a blocked worker actually reads on every wakeup. A CLI no directive
    // names is unreachable by its only intended caller, whatever else references it.
    const src = readFileSync(path.join(repoRoot, DIRECTIVE), 'utf8');
    expect(src).toContain('worker:recheck-blocker');
    // FR-6's contribution is the drain precondition; if the directive omits it the gate is invisible.
    expect(src).toMatch(/DRAIN_REQUIRED/);
    expect(src).toMatch(/may NOT assert blocker-unchanged/i);

    // MUTATION: revert the directive to the raw-git wording -> fails, and exit 4 goes unmentioned
    // again, which is precisely the state VALIDATION found.
  });

  it('EXECUTES the CLI and gets a documented exit code — not a text match', () => {
    /**
     * Runs the real thing. Asserts membership in the DOCUMENTED set rather than one specific value,
     * because the honest verdict depends on live state (a clean tree, a drained inbox, or an
     * unreachable DB legitimately produce different codes) and pinning one would make this test a
     * report about today rather than about the contract.
     *
     *   0 CLEARED · 2 INDETERMINATE · 3 STILL_BLOCKING · 4 DRAIN_REQUIRED
     */
    let code = 0;
    try {
      execFileSync(process.execPath, [CLI, '--dirty', '--no-record'], {
        cwd: repoRoot, stdio: 'pipe', timeout: 60_000,
      });
    } catch (e) {
      code = typeof e.status === 'number' ? e.status : -1;
    }
    expect([0, 2, 3, 4], `CLI exited ${code}, outside its documented contract`).toContain(code);

    // MUTATION: delete or rename the CLI -> execFileSync fails with a non-contract status, fails.
  });
});
