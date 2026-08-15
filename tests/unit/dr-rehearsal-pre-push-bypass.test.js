/**
 * QF-20260815-288.
 *
 * THE DEFECT. .husky/pre-push's non-interactive work-tracking check has no CI-actor exception
 * (unlike .husky/pre-commit's Stage 0, which QF-20260813-589 gave a narrow --no-verify exception
 * for this exact workflow). Every run of the DR-rehearsal cron's "Commit runbook update" step hit
 * "Push blocked: No work tracking found (non-interactive)", and the step swallowed that failure
 * with `|| echo "Push skipped"` -- the job reported green while ops/runbooks/disaster-recovery.md
 * was never actually updated on main.
 *
 * THE FIX is NOT a hook change. .husky/pre-push already ships EHG_ALLOW_MAIN_PUSH=1 as a
 * purpose-built automation escape hatch (bypasses only the SD/QF-tracking predicate; DOCMON and
 * every other pre-push check still run). The fix sets that flag for the one push in
 * .github/workflows/dr-restore-rehearsal-cron.yml's "Commit runbook update" step.
 *
 * THESE TESTS SPAWN THE REAL HOOK, THEY DO NOT MOCK IT (same discipline as
 * tests/unit/docmon-shell-injection.test.js). .husky/pre-push is POSIX sh; on Windows this drives
 * it through Git-for-Windows' bundled sh.exe.
 *
 * BOTH HALVES ARE ARMED: the "still blocked" case proves the underlying hook behavior this fix
 * relies on is real (not "it happened to pass once"), and the "bypass works" case proves the flag
 * the workflow now sets actually clears it. A workflow-YAML assertion proves the fix's own diff is
 * in place and will regress loudly if the flag is ever removed or re-ordered.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const PRE_PUSH = path.join(REPO, '.husky', 'pre-push').replace(/\\/g, '/');
const WORKFLOW = path.join(REPO, '.github', 'workflows', 'dr-restore-rehearsal-cron.yml');
const IS_WIN = process.platform === 'win32';

/** Same probe as tests/unit/docmon-shell-injection.test.js -- PATH first, then Git-for-Windows. */
function findSh() {
  for (const probe of IS_WIN ? ['sh.exe', 'sh'] : ['sh']) {
    try {
      const out = execFileSync(IS_WIN ? 'where' : 'which', [probe], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const first = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
      if (first && fs.existsSync(first)) return first;
    } catch { /* try the next probe */ }
  }
  if (IS_WIN) {
    for (const c of [
      'C:\\Program Files\\Git\\usr\\bin\\sh.exe',
      'C:\\Program Files\\Git\\bin\\sh.exe',
      'C:\\Program Files (x86)\\Git\\usr\\bin\\sh.exe',
    ]) if (fs.existsSync(c)) return c;
  }
  return null;
}
const SH = findSh();

const git = (dir, args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const rm = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } };

function initRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-push-bypass-'));
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'test@example.invalid']);
  git(dir, ['config', 'user.name', 'Test']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(dir, 'file.txt'), 'x\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'base']);
  return dir;
}

/**
 * Run the REAL .husky/pre-push against `dir`, simulating a push of dir's current branch
 * (named "main", so neither SD_ID nor QF_ID matches) to refs/heads/main. stdio is fully piped
 * (never inherited) so `[ -t 0 ]`/`[ -t 1 ]` are false and the script takes its deterministic
 * non-interactive branch -- the same condition a GitHub Actions runner executes under.
 */
function runPrePush(dir, extraEnv) {
  const env = { ...process.env, ...extraEnv };
  for (const k of ['SKIP_SD_CHECK', 'EMERGENCY_PUSH', 'CI']) delete env[k];
  const sha = git(dir, ['rev-parse', 'HEAD']).trim();
  return spawnSync(SH, [PRE_PUSH, 'origin', 'https://example.invalid/repo.git'], {
    cwd: dir,
    input: `refs/heads/main ${sha} refs/heads/main ${sha}\n`,
    encoding: 'utf8',
    env,
    timeout: 30000,
  });
}

describe('QF-20260815-288: pre-push EHG_ALLOW_MAIN_PUSH bypass (spawns the real hook)', () => {
  let dir;
  beforeAll(() => { dir = initRepo(); });
  afterAll(() => { if (dir) rm(dir); });

  it('THE ARM: a non-interactive push on an untracked branch is still blocked by default', () => {
    if (!SH) return; // no sh on this host -- same skip discipline as the docmon suite
    const result = runPrePush(dir, { SKIP_DOCMON: '1' });
    expect(result.status, 'pre-push must still block untracked non-interactive pushes for real developers').not.toBe(0);
    expect(result.stdout).toContain('Push blocked: No work tracking found (non-interactive)');
  });

  it('THE FIX: EHG_ALLOW_MAIN_PUSH=1 makes the same push succeed', () => {
    if (!SH) return;
    const result = runPrePush(dir, { SKIP_DOCMON: '1', EHG_ALLOW_MAIN_PUSH: '1' });
    expect(result.stdout, 'the automation escape hatch must still announce itself').toContain('EHG_ALLOW_MAIN_PUSH=1 - allowing untracked push');
    expect(result.status, 'EHG_ALLOW_MAIN_PUSH=1 must let the push through').toBe(0);
  });
});

describe('QF-20260815-288: the DR-rehearsal workflow sets the bypass on its push', () => {
  // QF-20260815-099 (PR #7038, merged) fixed this same defect first, via a different (and
  // better) mechanism than this QF's original patch: EHG_ALLOW_MAIN_PUSH set on the step's
  // env: block rather than inlined on the push line, and the silent `|| echo "Push skipped"`
  // fallback REMOVED entirely so a future, unrelated push failure fails the job loudly instead
  // of hiding behind a green check. This QF was rebased onto that merged fix and shrunk to its
  // one genuine delta (the spawned-hook tests above); this wiring check now verifies the
  // ACTUAL merged mechanism instead of the superseded inline-prefix one.
  it('the "Commit runbook update" step sets EHG_ALLOW_MAIN_PUSH=1 via env: and pushes without a silent fallback', () => {
    const yaml = fs.readFileSync(WORKFLOW, 'utf8');
    const stepStart = yaml.indexOf('Commit runbook update');
    expect(stepStart, 'workflow step renamed or removed -- update this test to match').toBeGreaterThan(-1);
    const step = yaml.slice(stepStart, stepStart + 2000);
    expect(step, 'the step must set the bypass via its env: block').toMatch(/EHG_ALLOW_MAIN_PUSH:\s*['"]?1['"]?/);
    const pushLine = step.split('\n').find((l) => l.trim() === 'git push' || l.includes('git push'));
    expect(pushLine, 'no git push line found in the Commit runbook update step').toBeTruthy();
    // Fail-loud by design (#7038): a future push failure must fail the job, not hide behind
    // a swallowed-error green check -- the exact silent-failure shape this whole QF family exists
    // to close.
    expect(pushLine).not.toContain('|| echo');
  });
});
