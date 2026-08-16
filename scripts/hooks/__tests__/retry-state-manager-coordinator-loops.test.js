// SD-LEO-INFRA-RCA-AUTOSIGNAL-FALSE-POSITIVE-001 — structural replacement of the reactive
// EXEMPT_PATTERNS allowlist (formerly QF-20260610-626 et al). The RCA recurrence detector
// false-blocked read-only/idempotent loops because successful Bash carried no exit signal
// (post-tool-rca-outcome.cjs skipped the write) → the per-signature counter accumulated.
// These tests pin the STRUCTURAL fix: (1) a succeeding poll (prior SAME command exit 0, now
// reliably captured by Control 4) never accumulates; (2) a FAILING loop STILL accumulates
// (teeth); (3) the absence-of-failure exemption is conjunctive with a deny-by-default
// read-only classifier; (4) the classifier rejects compound/mutating shapes; (5) a no-SD-claim
// session can reset via the session-scoped marker (R5); (6) the Control-3 progress fingerprint
// is returned so the caller can suppress a spurious auto-signal.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const MODULE_PATH = path.resolve(__dirname, '../retry-state-manager.cjs');

function loadFresh() {
  delete require.cache[require.resolve(MODULE_PATH)];
  return require(MODULE_PATH);
}

const NO_RCA = { rcaCheck: async () => null };

describe('Control 2 — isReadOnlyCommand (deny-by-default classifier)', () => {
  const { isReadOnlyCommand } = loadFresh();

  it('classifies provably read-only single commands as read-only', () => {
    for (const c of ['git status', 'git log --oneline -5', 'ls -la', 'pwd', 'cat package.json',
                     'grep -r foo src', 'rg pattern', 'find . -name x', 'echo hi', 'stat file']) {
      expect(isReadOnlyCommand(c)).toBe(true);
    }
  });

  it('DENY-BY-DEFAULT: unknown / script-invoking commands are NOT read-only', () => {
    for (const c of ['node scripts/worker-checkin.cjs', 'node scripts/coordinator-audit.mjs',
                     'npm run build', 'rm -rf x', 'git commit -m x', 'psql -c "UPDATE t SET a=1"']) {
      expect(isReadOnlyCommand(c)).toBe(false);
    }
  });

  it('rejects compound/redirecting shapes even with a read-only leading verb (R1)', () => {
    for (const c of ['git status && rm -rf x', 'cat f | tee g', 'ls > out.txt',
                     'echo $(rm x)', 'grep x f; touch y']) {
      expect(isReadOnlyCommand(c)).toBe(false);
    }
  });

  it('fail-open input handling preserved', () => {
    expect(isReadOnlyCommand(null)).toBe(false);
    expect(isReadOnlyCommand(undefined)).toBe(false);
    expect(isReadOnlyCommand('')).toBe(false);
  });

  // SD-LEO-INFRA-RCA-READONLY-GH-VERBS-001 (FR-1): gh CLI read verbs. Legitimate CI polling
  // (gh run list/view, gh pr checks/list/view/diff) previously classified non-read-only —
  // READ_ONLY_LEADING_RE had zero gh verbs — and accumulated toward the 3-strike RCA block.
  it('FR-1: gh read verbs classify as read-only', () => {
    for (const c of [
      'gh run list', 'gh run view 123', 'gh run watch 9',
      'gh pr list', 'gh pr view 45', 'gh pr diff 45', 'gh pr checks 45', 'gh pr status',
      'gh workflow list', 'gh workflow view x',
      'gh issue list', 'gh issue view 1',
      'gh api repos/x/y',
      'GH PR LIST', // case-insensitive
      'gh  pr   list', // tolerant of extra whitespace
    ]) {
      expect(isReadOnlyCommand(c)).toBe(true);
    }
  });

  // FR-1 AC-3 + FR-2: near-miss gh verbs (real gh subcommands, confirmed via `gh <noun> --help`,
  // that are NOT read-only) must not slip through a too-broad pattern. Most consequential:
  // 'gh pr checkout' is one edit away from the allowlisted 'gh pr checks'.
  it('FR-1 AC-3: near-miss gh verbs (real but mutating/targeted subcommands) are NOT read-only', () => {
    for (const c of [
      'gh pr merge 1', 'gh pr create', 'gh pr close 1', 'gh pr comment 1 --body x',
      'gh pr checkout 1', 'gh pr edit 1', 'gh pr review 1', 'gh pr ready 1',
      'gh run rerun 1', 'gh run cancel 1', 'gh run download 1',
      'gh workflow run deploy.yml', 'gh workflow disable x',
      'gh issue create', 'gh issue close 1',
      'gh prune something', // near-miss to the bare-verb family, not a gh subcommand at all
    ]) {
      expect(isReadOnlyCommand(c)).toBe(false);
    }
  });

  // FR-1 AC-2 + TR-1: gh api's mutating-method exclusion must be a FULL-STRING check, not a
  // next-token check — adversarially probed (.artifacts/tst-regex-probe.cjs, 40 cases). A
  // next-token-only implementation passes the obvious cases but false-positives on all of these,
  // including a real mutation with the flag placed after the path.
  it('FR-1 AC-2 + TR-1: gh api mutating-method shapes are NOT read-only, including adversarial flag placement', () => {
    for (const c of [
      'gh api -X POST /x', 'gh api -XPOST /x',
      'gh api --method DELETE /x', 'gh api --method delete /x',
      'gh api -X post /x',
      'gh api /repos/x/y -X POST', // flag AFTER the path (ordering)
      'gh api repos/x --method PATCH',
      'gh api graphql -f query=abc',
      'gh api repos/x -F body=@f',
      'gh api repos/x --field a=b', // long form of -f
      'gh api repos/x --raw-field a=b', // long form of -F
      'gh api repos/x --input f.json',
    ]) {
      expect(isReadOnlyCommand(c)).toBe(false);
    }
  });

  // SECURITY (EXEC-TO-PLAN review): two additional leak classes in the gh-api mutating-method
  // exclusion, found by independent adversarial re-probing of the SHIPPED module (not a
  // re-derivation) -- both fixed in the same commit, asserted here so they cannot regress.
  it('FR-1 AC-2 + TR-1 (SECURITY hardening): quoted method values and newline-continuation mutating flags are NOT read-only', () => {
    for (const c of [
      // Quoted method values -- a quote char between the flag and the verb previously broke
      // the match, since the alternatives required the verb to follow immediately.
      "gh api /repos/o/r -X 'PUT'",
      'gh api /repos/o/r -X "POST"',
      'gh api /repos/o/r --method="POST"',
      "gh api /repos/o/r --method 'DELETE'",
      "gh api /repos/o/r -X'POST'",
      // Newline-continuation -- plain `.` in the lookahead does not match `\n` without /s;
      // a mutating flag on an indented continuation line was invisible to the exclusion.
      'gh api /repos/o/r/pulls/1/merge \\\n --method PUT \\\n -f merge_method=squash',
    ]) {
      expect(isReadOnlyCommand(c)).toBe(false);
    }
    // Sanity control: a genuinely read-only multi-line gh api call (no mutating flag anywhere)
    // must still classify read-only -- the newline fix must not become an over-broad rejection.
    expect(isReadOnlyCommand('gh api \\\n  /repos/o/r/pulls/1')).toBe(true);
  });

  // PLAN_VERIFY VALIDATION (EXEC-TO-PLAN review round 2): -X was the lone alternative among
  // -X/--method/-f,-F that didn't tolerate an `=` separator -- `-X=PUT` (verified against the
  // real gh CLI: behaves identically to `-X PUT`) slipped through. Confirmed newly introduced by
  // this SD (main had zero gh coverage), not a pre-existing gap.
  it('FR-1 AC-2 + TR-1 (VALIDATION hardening): -X=VERB equals-shorthand is NOT read-only; -X=GET stays read-only', () => {
    expect(isReadOnlyCommand('gh api /repos/o/r/pulls/1/merge -X=PUT')).toBe(false);
    expect(isReadOnlyCommand('gh api /repos/o/r -X=DELETE')).toBe(false);
    expect(isReadOnlyCommand('gh api /repos/o/r -X=post')).toBe(false); // case-insensitive
    expect(isReadOnlyCommand('gh api /repos/o/r -X=GET')).toBe(true); // GET is not mutating
  });

  // FR-2 AC-2: gh read verbs combined with chaining/redirection remain non-read-only — the
  // pre-existing MUTATION_OPERATOR_RE guard applies identically to the new gh patterns.
  it('FR-2 AC-2: gh read verbs combined with chaining/redirection remain non-read-only', () => {
    for (const c of [
      'gh run list && git push', 'gh pr view 1 > out.txt', 'gh pr list; echo done',
      'gh run list | grep foo', 'gh pr view $(echo 1)',
    ]) {
      expect(isReadOnlyCommand(c)).toBe(false);
    }
  });

  // FR-2 AC-3: every gh verb pattern added in FR-1 must correspond to a real, documented gh
  // read-only subcommand — not a wildcard over-match. Reference list verified directly against
  // `gh <noun> --help` output (gh CLI, 2026-08-16) — hardcoded here (not shelled out at test
  // time) so the test stays deterministic and does not depend on `gh` being installed in CI.
  it('FR-2 AC-3: parity — every added gh verb is a real, documented read-only subcommand', () => {
    const REAL_GH_READONLY_SUBCOMMANDS = {
      run: ['list', 'view', 'watch'],
      pr: ['list', 'view', 'diff', 'checks', 'status'],
      workflow: ['list', 'view'],
      issue: ['list', 'view'],
    };
    // Real gh subcommands that exist but are deliberately NOT in the read-only set (mutating or
    // targeted-write) — asserts the classifier does not accidentally cover them.
    const REAL_GH_NON_READONLY_SUBCOMMANDS = {
      run: ['cancel', 'delete', 'download', 'rerun'],
      pr: ['checkout', 'close', 'comment', 'create', 'edit', 'lock', 'merge', 'ready', 'reopen', 'review', 'unlock', 'update-branch'],
      workflow: ['disable', 'enable', 'run'],
      issue: ['close', 'comment', 'create', 'delete', 'develop', 'edit', 'lock', 'pin', 'reopen', 'transfer', 'unlock', 'unpin'],
    };
    for (const [noun, verbs] of Object.entries(REAL_GH_READONLY_SUBCOMMANDS)) {
      for (const verb of verbs) {
        expect(isReadOnlyCommand(`gh ${noun} ${verb}`)).toBe(true);
      }
    }
    for (const [noun, verbs] of Object.entries(REAL_GH_NON_READONLY_SUBCOMMANDS)) {
      for (const verb of verbs) {
        expect(isReadOnlyCommand(`gh ${noun} ${verb} arg`)).toBe(false);
      }
    }
  });

  // FR-1 AC-4 (regression guard, C2/TS-3): the pre-existing EXEMPT_PATTERNS allowlist entry for
  // 'gh pr checks' (QF-20260704-784) must remain untouched and still cover piped forms that
  // isReadOnlyCommand structurally cannot (MUTATION_OPERATOR_RE rejects the pipe) — proving FR-1
  // did not regress the 2026-07-05 3-worker incident that entry was created to fix.
  it('FR-1 AC-4 / TS-3: gh-pr-checks EXEMPT_PATTERNS entry still covers piped forms isReadOnlyCommand cannot', () => {
    const { isExempt } = loadFresh();
    const piped = 'gh pr checks 1 --repo x/y | head -3';
    expect(isReadOnlyCommand(piped)).toBe(false); // classifier correctly cannot prove this read-only
    expect(isExempt(piped)).toBe(true); // allowlist backstop still covers it
  });
});

describe('TS-1 — succeeding poll (prior SAME command exit 0) never accumulates', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rca-fp-')); process.env.LEO_RETRY_STATE_DIR = tmpDir; });
  afterEach(() => { delete process.env.LEO_RETRY_STATE_DIR; fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('a non-allowlisted succeeding tick (Control 4 exit-0 capture) stays at attempts 0 across 5 ticks', async () => {
    const { recordAndCount, bashCmdHash } = loadFresh();
    // NOT in EXEMPT_PATTERNS — exemption here is driven purely by the captured exit_code 0.
    const cmd = 'node scripts/my-idempotent-tick.js';
    const lastOutcome = { exit_code: 0, command_sha: bashCmdHash(cmd), stderr_sha: '' };
    for (let i = 0; i < 5; i++) {
      const r = await recordAndCount('sess-poll', null, 'Bash', { command: cmd }, { ...NO_RCA, lastOutcome });
      expect(r.attempts).toBe(0);
    }
  });

  it('a pure read-only command with NO prior outcome stays at 0 (Control 1 + classifier)', async () => {
    const { recordAndCount } = loadFresh();
    for (let i = 0; i < 5; i++) {
      const r = await recordAndCount('sess-ro', null, 'Bash', { command: 'git status' }, NO_RCA);
      expect(r.attempts).toBe(0);
    }
  });
});

describe('TS-2 — TEETH: a FAILING loop still accumulates to the hard-block', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rca-fp-')); process.env.LEO_RETRY_STATE_DIR = tmpDir; });
  afterEach(() => { delete process.env.LEO_RETRY_STATE_DIR; fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('a non-read-only retry loop accumulates 1..4 (3-strikes machinery intact)', async () => {
    const { recordAndCount } = loadFresh();
    const counts = [];
    for (let i = 0; i < 4; i++) {
      const r = await recordAndCount('sess-fail', null, 'Bash', { command: 'node scripts/flaky.js' }, NO_RCA);
      counts.push(r.attempts);
    }
    expect(counts).toEqual([1, 2, 3, 4]);
  });

  it('a FAILING read-only loop (prior exit non-zero) still accumulates', async () => {
    const { recordAndCount, bashCmdHash } = loadFresh();
    const cmd = 'grep needle haystack';
    const lastOutcome = { exit_code: 1, command_sha: bashCmdHash(cmd), stderr_sha: 'abc123' };
    const counts = [];
    for (let i = 0; i < 3; i++) {
      const r = await recordAndCount('sess-rofail', null, 'Bash', { command: cmd }, { ...NO_RCA, lastOutcome });
      counts.push(r.attempts);
    }
    expect(counts).toEqual([1, 2, 3]);
  });
});

describe('TS-3 — conjunction: success ALONE or read-only ALONE does not over-exempt', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rca-fp-')); process.env.LEO_RETRY_STATE_DIR = tmpDir; });
  afterEach(() => { delete process.env.LEO_RETRY_STATE_DIR; fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('read-only command WITH a failure outcome is NOT exempted by the Control-1 path', async () => {
    const { recordAndCount } = loadFresh();
    // read-only verb but the prior outcome shows a failure (stderr present) → must accumulate.
    const lastOutcome = { exit_code: null, command_sha: 'deadbeef', stderr_sha: 'eee111' };
    const r1 = await recordAndCount('sess-c1', null, 'Bash', { command: 'git status' }, { ...NO_RCA, lastOutcome });
    const r2 = await recordAndCount('sess-c1', null, 'Bash', { command: 'git status' }, { ...NO_RCA, lastOutcome });
    expect(r2.attempts).toBe(2);
  });

  it('non-read-only command with absence-of-failure is NOT exempted by the Control-1 path', async () => {
    const { recordAndCount } = loadFresh();
    // no prior outcome (absence of failure) but the command is not provably read-only → accumulate.
    const r1 = await recordAndCount('sess-c2', null, 'Bash', { command: 'node scripts/mutator.js' }, NO_RCA);
    const r2 = await recordAndCount('sess-c2', null, 'Bash', { command: 'node scripts/mutator.js' }, NO_RCA);
    expect(r2.attempts).toBe(2);
  });
});

describe('TS-7 — R5: no-SD-claim session can reset via the session-scoped marker', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rca-fp-')); process.env.LEO_RETRY_STATE_DIR = tmpDir; });
  afterEach(() => { delete process.env.LEO_RETRY_STATE_DIR; fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('writeSessionRcaReset clears the counter for a sdKey=null session', async () => {
    const { recordAndCount, writeSessionRcaReset } = loadFresh();
    const cmd = 'node scripts/flaky.js';
    const a = await recordAndCount('sess-r5', null, 'Bash', { command: cmd }, NO_RCA);
    const b = await recordAndCount('sess-r5', null, 'Bash', { command: cmd }, NO_RCA);
    expect(b.attempts).toBe(2);
    // A no-claim (coordinator/Adam) session drops the marker — newer than reset_at.
    writeSessionRcaReset('sess-r5', new Date(Date.now() + 1000).toISOString());
    const c = await recordAndCount('sess-r5', null, 'Bash', { command: cmd }, NO_RCA);
    expect(c.rcaResetApplied).toBe(true);
    expect(c.attempts).toBe(1); // counter reset, this call is the first post-reset
  });
});

describe('Control 3 — progress fingerprint drives progressStalled', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rca-fp-')); process.env.LEO_RETRY_STATE_DIR = tmpDir; });
  afterEach(() => { delete process.env.LEO_RETRY_STATE_DIR; fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('unchanged fingerprint across the repetition → progressStalled true', async () => {
    const { recordAndCount } = loadFresh();
    const cmd = 'node scripts/flaky.js';
    await recordAndCount('sess-p1', null, 'Bash', { command: cmd }, { ...NO_RCA, progressFingerprint: 'sd:EXEC:40' });
    const r2 = await recordAndCount('sess-p1', null, 'Bash', { command: cmd }, { ...NO_RCA, progressFingerprint: 'sd:EXEC:40' });
    expect(r2.attempts).toBe(2);
    expect(r2.progressStalled).toBe(true);
  });

  it('changed fingerprint (session advanced) → progressStalled false', async () => {
    const { recordAndCount } = loadFresh();
    const cmd = 'node scripts/flaky.js';
    await recordAndCount('sess-p2', null, 'Bash', { command: cmd }, { ...NO_RCA, progressFingerprint: 'sd:EXEC:40' });
    const r2 = await recordAndCount('sess-p2', null, 'Bash', { command: cmd }, { ...NO_RCA, progressFingerprint: 'sd:EXEC:55' });
    expect(r2.attempts).toBe(2);
    expect(r2.progressStalled).toBe(false);
  });

  it('no fingerprint supplied → progressStalled undefined (back-compat)', async () => {
    const { recordAndCount } = loadFresh();
    const r = await recordAndCount('sess-p3', null, 'Bash', { command: 'node scripts/flaky.js' }, NO_RCA);
    expect(r.progressStalled).toBeUndefined();
  });
});
