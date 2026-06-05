// SD-FDBK-INFRA-FLEET-WIDE-TRANSITIVE-001 — fleet-wide transitive hook spawn-target guard.
//
// Sibling to SETTINGS-4 (settings-claude-project-dir.test.js). SETTINGS-4 locks the
// directly-wired hook COMMAND files; this suite locks the script files those hooks
// fork INTERNALLY (the transitive spawn targets) — the archive-orphan class that
// silently broke scripts/auto-learning-capture.js (RCA acde2541 / PAT-HOOK-ARCHIVE-ORPHAN-001).
//
// Fixtures are synthesized into per-test os.tmpdir() dirs via analyzeSource() (dependency
// injection) so negatives never pollute the real scripts/hooks/ fleet. Live-fleet
// assertions compare verdict/{file,guarded,resolved} tuples — never line numbers (drift-proof).

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  analyzeFleet, analyzeSource, enumerateWiredHooks, buildRequireClosure,
} from '../../lib/hooks/transitive-spawn-target-guard.js';

const REPO_ROOT = path.resolve(__dirname, '../..');
const SETTINGS_PATH = path.join(REPO_ROOT, '.claude', 'settings.json');

const tmpDirs = [];
function fixtureDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tsg-'));
  tmpDirs.push(d);
  return d;
}
/** Analyze a synthetic hook source in an isolated temp repoRoot. */
function analyze(src, dir = fixtureDir()) {
  return { dir, result: analyzeSource(src, { filePath: path.join(dir, 'hook.cjs'), repoRoot: dir }) };
}
afterAll(() => {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }
});

// ─── Live fleet (the production assertion) ──────────────────────────────────

describe('TSG fleet: every transitive node-fork target in a wired hook resolves-or-is-guarded', () => {
  it('the live wired fleet has zero orphaned/unguarded targets and zero unparseable hooks', () => {
    const r = analyzeFleet({ settingsPath: SETTINGS_PATH, repoRoot: REPO_ROOT });
    // The teeth: any orphaned spawn target, unguarded computed-base fork, or
    // unparseable wired hook fails this assertion loudly with file:line context.
    expect(r.failures).toEqual([]);
    expect(r.unanalyzable).toEqual([]);
    expect(r.sites.every((s) => s.verdict === 'PASS')).toBe(true);
    expect(r.ok).toBe(true);
  });

  it('detects the five known node-fork sites across the spawn AND exec families', () => {
    const r = analyzeFleet({ settingsPath: SETTINGS_PATH, repoRoot: REPO_ROOT });
    const byFile = (name) => r.sites.find((s) => s.filePath.endsWith(name));
    // exec family — `node "<path>"` shell strings split across lines (B1 multiline)
    expect(byFile('agent-compiler-hook.cjs')).toMatchObject({ method: 'execSync', resolved: true, exists: true, verdict: 'PASS' });
    expect(byFile('concurrent-session-worktree.cjs')).toMatchObject({ method: 'execSync', resolved: true, exists: true, verdict: 'PASS' });
    // spawn family
    expect(byFile('capture-session-id.cjs')).toMatchObject({ method: 'spawn', resolved: true, exists: true, guarded: true, verdict: 'PASS' });
    // resolvable-but-absent, existsSync-guarded (the QF-729 case — B2 escape)
    expect(byFile('auto-learning-capture.cjs')).toMatchObject({ method: 'spawn', resolved: true, exists: false, guarded: true, verdict: 'PASS' });
    // unresolvable computed base, guarded → teeth satisfied
    expect(byFile('coordination-inbox.cjs')).toMatchObject({ method: 'spawnSync', resolved: false, guarded: true, verdict: 'PASS' });
  });
});

// ─── Resolution + the exists-OR-guard rule ──────────────────────────────────

describe('TSG resolution: exists OR proximate guard', () => {
  it('FAILS an orphaned spawn target (resolvable, missing, unguarded)', () => {
    const { result } = analyze(
      "const { spawn } = require('child_process');\nconst path = require('path');\nspawn('node', [path.join(__dirname, 'does-not-exist.js')]);\n",
    );
    expect(result.sites).toHaveLength(1);
    expect(result.sites[0]).toMatchObject({ verdict: 'FAIL', resolved: true, exists: false, guarded: false });
  });

  it('PASSES a resolvable-but-absent target guarded via the if(!existsSync){...}else{spawn} idiom', () => {
    const { result } = analyze(
      "const { spawn } = require('child_process');\nconst fs = require('fs');\nconst path = require('path');\n"
      + "const tgt = path.join(__dirname, 'missing.js');\nif (!fs.existsSync(tgt)) { return; } else { spawn('node', [tgt]); }\n",
    );
    expect(result.sites[0]).toMatchObject({ verdict: 'PASS', exists: false, guarded: true });
  });

  it('PASSES an unguarded but resolvable execSync `node "<path>"` (exec family, multiline) and FAILS it when absent', () => {
    const dir = fixtureDir();
    fs.writeFileSync(path.join(dir, 'real.js'), '// present');
    const present = analyzeSource(
      "const { execSync } = require('child_process');\nconst path = require('path');\n"
      + "execSync(\n  `node \"${path.join(__dirname, 'real.js')}\" --flag`,\n  { stdio: 'inherit' }\n);\n",
      { filePath: path.join(dir, 'hook.cjs'), repoRoot: dir },
    );
    expect(present.sites[0]).toMatchObject({ method: 'execSync', family: 'exec', resolved: true, exists: true, verdict: 'PASS' });

    const { result: absent } = analyze(
      "const { execSync } = require('child_process');\nconst path = require('path');\n"
      + "execSync(`node \"${path.join(__dirname, 'gone.js')}\"`);\n",
    );
    expect(absent.sites[0]).toMatchObject({ verdict: 'FAIL', exists: false });
  });
});

// ─── Teeth for unresolvable computed bases ──────────────────────────────────

describe('TSG teeth: unresolvable computed-base forks require a bound guard', () => {
  it('FAILS an unresolvable computed-base fork with no guard', () => {
    const { result } = analyze(
      "const { spawnSync } = require('child_process');\nconst computeIt = () => '/x';\n"
      + 'const target = computeIt();\nspawnSync(process.execPath, [target]);\n',
    );
    expect(result.sites[0]).toMatchObject({ verdict: 'FAIL', resolved: false, guarded: false });
  });

  it('PASSES the same computed-base fork when existsSync binds to the forked variable', () => {
    const { result } = analyze(
      "const { spawnSync } = require('child_process');\nconst fs = require('fs');\nconst computeIt = () => '/x';\n"
      + 'const target = computeIt();\nif (fs.existsSync(target)) { spawnSync(process.execPath, [target]); }\n',
    );
    expect(result.sites[0]).toMatchObject({ verdict: 'PASS', resolved: false, guarded: true });
  });

  it('does NOT count an UNRELATED existsSync as a guard (B3: guard binds to the forked variable)', () => {
    const { result } = analyze(
      "const { spawn } = require('child_process');\nconst fs = require('fs');\nconst path = require('path');\n"
      + "const other = path.join(__dirname, 'present.js');\nfs.existsSync(other);\n"
      + "spawn('node', [path.join(__dirname, 'missing.js')]);\n",
    );
    expect(result.sites[0]).toMatchObject({ verdict: 'FAIL', guarded: false });
  });
});

// ─── Exclusions (MUST-ADD-1, MUST-ADD-2, executable position) ───────────────

describe('TSG exclusions: only child_process forks of node, never external binaries', () => {
  it('ignores RegExp.exec() / String.match() — the callee must be a child_process binding', () => {
    const { result } = analyze(
      "const re = /foo/g;\nlet m;\nwhile ((m = re.exec('foobar')) !== null) { break; }\n"
      + "'abc'.match(/b/);\nconst { execSync } = require('child_process');\nexecSync('git status');\n",
    );
    expect(result.sites).toEqual([]);
    expect(result.unanalyzable).toEqual([]);
  });

  it('excludes external-binary spawns (gh / git / powershell-EncodedCommand) and node executable position', () => {
    const { result } = analyze(
      "const { spawn, execSync } = require('child_process');\nspawn('gh', ['pr', 'view']);\n"
      + 'execSync(`git log --oneline`);\nexecSync(`powershell -NoProfile -EncodedCommand AAAA`);\n',
    );
    expect(result.sites).toEqual([]);
  });
});

// ─── Multi-target shell strings (MUST-ADD-3) ────────────────────────────────

describe('TSG multi-target: every node in a chained shell string is a target', () => {
  it('reports BOTH targets in `node a.js && node b.js`', () => {
    const dir = fixtureDir();
    fs.writeFileSync(path.join(dir, 'a.js'), '');
    const result = analyzeSource(
      "const { execSync } = require('child_process');\nexecSync('node a.js && node b.js');\n",
      { filePath: path.join(dir, 'hook.cjs'), repoRoot: dir },
    );
    expect(result.sites).toHaveLength(2);
    const targets = result.sites.map((s) => s.target);
    expect(targets.some((t) => t.endsWith('a.js'))).toBe(true);
    expect(targets.some((t) => t.endsWith('b.js'))).toBe(true);
    // a.js present → PASS, b.js absent+unguarded → FAIL (proves both are evaluated)
    expect(result.sites.find((s) => s.target.endsWith('b.js')).verdict).toBe('FAIL');
  });
});

// ─── Completeness: dynamic requires + parse errors are surfaced, not dropped ─

describe('TSG completeness: unanalyzable constructs are surfaced fail-loud', () => {
  it('records dynamic require(variable) on the dynamicRequires list', () => {
    const dir = fixtureDir();
    fs.writeFileSync(path.join(dir, 'hook.cjs'), "const mod = './x';\nrequire(mod);\n");
    const closure = buildRequireClosure(path.join(dir, 'hook.cjs'), dir);
    expect(closure.dynamic.length).toBeGreaterThanOrEqual(1);
  });

  it('reports a syntactically broken hook as unanalyzable (a parse-failed file could hide a fork)', () => {
    const { result } = analyze("const { spawn } = require('child_process');\nspawn('node', [\n");
    expect(result.parseError).toBeTruthy();
    expect(result.unanalyzable).toHaveLength(1);
  });
});

// ─── Cross-platform + enumeration parity with SETTINGS-4 ────────────────────

describe('TSG hygiene', () => {
  it('emits forward-slash normalized target paths (win32 / CI parity)', () => {
    const dir = fixtureDir();
    fs.writeFileSync(path.join(dir, 'real.js'), '');
    const result = analyzeSource(
      "const { spawn } = require('child_process');\nconst path = require('path');\nspawn('node', [path.join(__dirname, 'real.js')]);\n",
      { filePath: path.join(dir, 'hook.cjs'), repoRoot: dir },
    );
    expect(result.sites[0].target).not.toContain('\\');
    expect(result.sites[0].target).toContain('real.js');
  });

  it('enumerateWiredHooks resolves only JS hook command files under the repo root', () => {
    const hooks = enumerateWiredHooks(SETTINGS_PATH, REPO_ROOT);
    expect(hooks.length).toBeGreaterThan(0);
    expect(hooks.every((h) => /\.(c?js|mjs)$/.test(h))).toBe(true);
    expect(hooks.some((h) => h.endsWith('auto-learning-capture.cjs'))).toBe(true);
  });
});
