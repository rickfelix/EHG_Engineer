/**
 * SD-LEO-INFRA-LEO-STACK-PS-ENCODING-WALKMODE-FIX-001 FR-3.
 *
 * #5226 shipped a PowerShell parse-breaking glyph because the PR validated ONLY leo-stack.sh
 * (bash -n) and never parsed leo-stack.ps1 — so the em-dash that takes the whole stack down on
 * Windows PowerShell 5.1 (no-BOM file -> CP1252 -> runaway string) shipped undetected.
 *
 * This closes that gap with a guard that runs on ANY CI runner:
 *  - TS-1 (deterministic, primary): scripts/leo-stack.ps1 is ASCII-only. This is the reliable guard
 *    for the encoding class — pwsh 7 on ubuntu defaults to UTF-8 and would NOT reproduce the WinPS-5.1
 *    CP1252 break, so a parse-only check could pass while the file is still broken on Windows.
 *  - TS-2 (best-effort): when pwsh is on PATH, parse leo-stack.ps1 with the PowerShell language parser
 *    and assert zero parse errors. Skipped (logged) when pwsh is absent.
 *  - TS-3 (best-effort): when bash is on PATH, `bash -n scripts/leo-stack.sh`. Skipped when absent.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PS1 = join(REPO_ROOT, 'scripts', 'leo-stack.ps1');
const SH = join(REPO_ROOT, 'scripts', 'leo-stack.sh');

function onPath(cmd) {
  const probe = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
  return !probe.error;
}

describe('leo-stack.ps1 ASCII safety (FR-1/FR-3 guard)', () => {
  it('TS-1: contains no non-ASCII byte (prevents the WinPS-5.1 CP1252 parse break)', () => {
    const buf = readFileSync(PS1);
    const offenders = [];
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] > 0x7f) {
        offenders.push(`byte 0x${buf[i].toString(16)} at offset ${i}`);
        if (offenders.length >= 5) break;
      }
    }
    expect(offenders, `leo-stack.ps1 must be ASCII-only; found: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('leo-stack.ps1 PowerShell parse (FR-3, best-effort)', () => {
  it('TS-2: parses with no errors under pwsh when available', () => {
    if (!onPath('pwsh')) {
      console.log('[skip] pwsh not on PATH — ASCII guard (TS-1) still enforces the encoding class');
      return;
    }
    const script = `$errors = $null; [void][System.Management.Automation.Language.Parser]::ParseFile('${PS1.replace(/\\/g, '\\\\')}', [ref]$null, [ref]$errors); if ($errors -and $errors.Count -gt 0) { $errors | ForEach-Object { Write-Output $_.Message }; exit 3 } else { exit 0 }`;
    const r = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' });
    expect(r.status, `pwsh parse errors:\n${r.stdout || ''}${r.stderr || ''}`).toBe(0);
  });
});

describe('leo-stack.sh bash syntax (FR-3, best-effort)', () => {
  it('TS-3: passes `bash -n` when bash is available', () => {
    if (!onPath('bash')) {
      console.log('[skip] bash not on PATH');
      return;
    }
    const r = spawnSync('bash', ['-n', SH], { encoding: 'utf8' });
    expect(r.status, `bash -n errors:\n${r.stderr || ''}`).toBe(0);
  });
});
