// QF-20260906-335 — a detached:true child process spawned WITHOUT windowsHide:true opens a
// visible console window on Windows (measured: 78 new processes / 14 console allocations in 12
// min, a burst of eight in one second right after a worker seat's hook fan-out). This is a
// mechanical, whole-repo guard (not a fixed site list) so a FUTURE detached-spawn site added
// without windowsHide fails CI instead of shipping a silent flash.
//
// scripts/archive/one-time/* is excluded: confirmed dead/unused one-time scripts (not part of any
// live hook/handoff/cron path), kept only for reference.
//
// Terminal spawners are excluded BY DESIGN — they open a visible worker terminal window on
// purpose, per the QF's own fix shape:
//   lib/fleet/spawn-control.js, scripts/fleet/worker-spawn-executor.cjs,
//   scripts/fleet/reboot-respawn.cjs
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scannableText } from '../../../lib/lint/added-line-text.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const ALLOWLIST = new Set([
  'lib/fleet/spawn-control.js',
  'scripts/fleet/worker-spawn-executor.cjs',
  'scripts/fleet/reboot-respawn.cjs',
]);

const DETACHED_TRUE_RE = /detached\s*:\s*true/;
const WINDOWS_HIDE_TRUE_RE = /windowsHide\s*:\s*true/;

function listTrackedSourceFiles() {
  return execFileSync('git', ['ls-files', '--', '*.js', '*.cjs', '*.mjs'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((p) => !p.startsWith('scripts/archive/'));
}

describe('detached-spawn windowsHide guard (QF-20260906-335)', () => {
  it('every detached:true spawn site outside the terminal-spawner allowlist also sets windowsHide:true', () => {
    const violations = [];
    for (const relPath of listTrackedSourceFiles()) {
      if (ALLOWLIST.has(relPath)) continue;
      const content = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
      // stripStrings:true — the false-positive class this guards against is prose describing the
      // pattern (e.g. a PRD/note field's technical_approach text), not real code.
      const scannable = scannableText({ path: relPath, added: content }, { stripStrings: true });
      if (scannable == null) continue; // fixture/test path
      if (!DETACHED_TRUE_RE.test(scannable)) continue;
      if (!WINDOWS_HIDE_TRUE_RE.test(scannable)) violations.push(relPath);
    }
    expect(violations).toEqual([]);
  });

  it('sanity: the allowlisted terminal spawners are still genuinely detached:true (an allowlist entry that stops matching is stale, not safe)', () => {
    for (const relPath of ALLOWLIST) {
      const content = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
      expect(content).toMatch(DETACHED_TRUE_RE);
    }
  });
});
