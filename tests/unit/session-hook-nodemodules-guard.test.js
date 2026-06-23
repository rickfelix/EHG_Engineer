// SD-REFILL-00BEALYD — store-wipe #3 audit + regression guard. The 3 unaudited SessionStart hooks
// (+ their spawns) contain ZERO destructive node_modules ops; this guard encodes that and fails if a
// future SessionStart hook ever introduces a node_modules-wipe path. Recovery-side complement:
// the auto-heal SD-REFILL-00RXDLKM.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  scanForDestructiveNodeModules,
  sessionStartHookScripts,
  DESTRUCTIVE_PATTERNS,
} from '../../lib/audit/session-hook-nodemodules-guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('scanForDestructiveNodeModules (SD-REFILL-00BEALYD)', () => {
  it('TS-1: detects rm -rf node_modules', () => {
    expect(scanForDestructiveNodeModules('rm -rf node_modules/').length).toBeGreaterThan(0);
    expect(scanForDestructiveNodeModules('rm -r ./node_modules').length).toBeGreaterThan(0);
  });

  it('TS-2: detects PowerShell Remove-Item node_modules', () => {
    expect(scanForDestructiveNodeModules('Remove-Item -Recurse -Force node_modules').length).toBeGreaterThan(0);
  });

  it('TS-3: detects npm ci / prune (which wipe node_modules) + rimraf + fs.rmSync', () => {
    expect(scanForDestructiveNodeModules('npm ci')).toContain('npm-ci-or-prune');
    expect(scanForDestructiveNodeModules('rimraf node_modules')).toContain('rimraf-node_modules');
    expect(scanForDestructiveNodeModules("fs.rmSync(path.join(root,'node_modules'),{recursive:true})")).toContain('fs-rm-node_modules');
  });

  it('TS-4: a clean hook body returns [] and never throws', () => {
    expect(scanForDestructiveNodeModules('const x = require("path"); console.log("ok");')).toEqual([]);
    expect(scanForDestructiveNodeModules('')).toEqual([]);
    expect(scanForDestructiveNodeModules(null)).toEqual([]);
  });

  it('does NOT flag a benign node_modules mention (e.g. a resolve path)', () => {
    expect(scanForDestructiveNodeModules("require.resolve('x',{paths:[join(root,'node_modules')]})")).toEqual([]);
  });

  it('guards CODE, not COMMENTS: a defensive comment is clean but the executable op flags', () => {
    // The recovery auto-heal hook documents "NEVER npm ci / rm -rf node_modules" — comments must not flag.
    expect(scanForDestructiveNodeModules('// additive only: NEVER `npm ci` or `rm -rf node_modules`')).toEqual([]);
    expect(scanForDestructiveNodeModules('# PowerShell: do not Remove-Item node_modules here')).toEqual([]);
    expect(scanForDestructiveNodeModules('/* never rm -rf node_modules */')).toEqual([]);
    // but the real executable op still flags
    expect(scanForDestructiveNodeModules('spawnSync("rm", ["-rf", "node_modules"]); rm -rf node_modules').length).toBeGreaterThan(0);
  });
});

describe('sessionStartHookScripts (TS-5)', () => {
  it('extracts node + powershell script paths and expands ${CLAUDE_PROJECT_DIR}', () => {
    const settings = { hooks: { SessionStart: [
      { hooks: [
        { type: 'command', command: 'node ${CLAUDE_PROJECT_DIR}/scripts/hooks/foo.cjs' },
        { type: 'command', command: 'powershell.exe -NoProfile -File ${CLAUDE_PROJECT_DIR}/scripts/hooks/bar.ps1' },
        { type: 'command', command: 'echo no-script-here' },
      ] },
    ] } };
    const scripts = sessionStartHookScripts(settings, '/root');
    expect(scripts.some(p => p.endsWith('scripts/hooks/foo.cjs'))).toBe(true);
    expect(scripts.some(p => p.endsWith('scripts/hooks/bar.ps1'))).toBe(true);
    expect(scripts.length).toBe(2); // the echo command resolves no script
  });

  it('returns [] for malformed settings', () => {
    expect(sessionStartHookScripts({}, '/root')).toEqual([]);
    expect(sessionStartHookScripts(null, '/root')).toEqual([]);
  });
});

describe('TS-6: live SessionStart hook scripts are all clean (audit encoded + regression guard)', () => {
  it('no SessionStart-registered hook script contains a destructive node_modules op', () => {
    const settingsPath = path.join(ROOT, '.claude', 'settings.json');
    if (!fs.existsSync(settingsPath)) return; // no settings -> nothing to guard
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const scripts = sessionStartHookScripts(settings, ROOT);
    const offenders = [];
    for (const rel of scripts) {
      const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
      if (!fs.existsSync(abs)) continue; // missing/unresolvable -> skip, not a failure
      const hits = scanForDestructiveNodeModules(fs.readFileSync(abs, 'utf8'));
      if (hits.length) offenders.push(`${rel}: ${hits.join(',')}`);
    }
    expect(offenders, `SessionStart hook(s) with a node_modules-wipe path: ${offenders.join(' | ')}`).toEqual([]);
  });

  it('DESTRUCTIVE_PATTERNS is non-empty (guard is armed)', () => {
    expect(DESTRUCTIVE_PATTERNS.length).toBeGreaterThan(0);
  });
});
