/**
 * QF-20260524-337: protocol-read tracking must survive context compaction.
 *
 * Root cause (feedback 6bbe551f): the wired PreCompact hook
 * scripts/hooks/precompact-snapshot.ps1 rebuilt .claude/unified-session-state.json
 * from scratch on every auto-compaction, dropping protocolFilesRead /
 * protocolFileReadStatus and 5 sibling keys. Post-compaction, /sd-create
 * (sd-key-generator.js validateCoreFileRead Case 1) then re-blocked with
 * "CLAUDE_CORE.md has not been read in this session".
 *
 * These tests assert the preservation contract in BOTH state writers:
 *   1. UnifiedStateManager.buildState (portable JS — runs on CI), and
 *   2. precompact-snapshot.ps1 — the actually-wired hook (Windows-gated, since
 *      it is a PowerShell file that only executes on the win32 hook host).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// The seven non-SD context keys the compaction snapshot must NOT discard.
const PROTOCOL_KEYS = [
  'protocolFilesRead',
  'protocolFilesReadAt',
  'protocolFileReadStatus',
  'protocolGate',
  'protocolFilesPartiallyRead',
  'protocolReadConfirmations',
  'protocolFileEscalations',
];

function seedState() {
  const now = new Date().toISOString();
  return {
    version: '2.0.0',
    timestamp: now,
    trigger: 'manual',
    protocolFilesRead: ['CLAUDE_CORE.md', 'CLAUDE_CORE_DIGEST.md', 'CLAUDE_LEAD.md'],
    protocolFilesReadAt: { 'CLAUDE_CORE.md': now },
    protocolFileReadStatus: {
      'CLAUDE_CORE.md': {
        readCount: 2,
        lastReadWasPartial: true,
        lastPartialRead: { limit: 700, offset: 0 },
        ranges: [{ offset: 1, limit: 800 }, { offset: 801, limit: 843 }],
      },
    },
    protocolGate: { compactionCount: 1, fileReads: {} },
  };
}

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qf337-'));
  fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true });
});
afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

// ---------- Portable: buildState (lib/context/unified-state-manager.js) ----------
describe('UnifiedStateManager.buildState preserves protocol-read tracking', () => {
  it('carries forward existing protocol keys through a precompact rebuild', async () => {
    const stateFile = path.join(tmpDir, '.claude', 'unified-session-state.json');
    fs.writeFileSync(stateFile, JSON.stringify(seedState(), null, 2), 'utf8');

    const { default: UnifiedStateManager } = await import('../../lib/context/unified-state-manager.js');
    const built = await new UnifiedStateManager(tmpDir).buildState('precompact');

    expect(built.protocolFilesRead).toContain('CLAUDE_CORE.md');
    expect(built.protocolFileReadStatus['CLAUDE_CORE.md'].readCount).toBe(2);
    expect(built.protocolFileReadStatus['CLAUDE_CORE.md'].ranges).toHaveLength(2);
    expect(built.protocolGate.compactionCount).toBe(1);
  });

  it('does not fabricate protocol keys when prior state has none', async () => {
    const stateFile = path.join(tmpDir, '.claude', 'unified-session-state.json');
    fs.writeFileSync(stateFile, JSON.stringify(
      { version: '2.0.0', timestamp: new Date().toISOString(), trigger: 'manual' }, null, 2), 'utf8');

    const { default: UnifiedStateManager } = await import('../../lib/context/unified-state-manager.js');
    const built = await new UnifiedStateManager(tmpDir).buildState('precompact');

    for (const key of PROTOCOL_KEYS) expect(built[key]).toBeUndefined();
  });
});

// ---------- Windows-gated: the actually-wired precompact-snapshot.ps1 ----------
describe.skipIf(process.platform !== 'win32')(
  'precompact-snapshot.ps1 (wired PreCompact hook) preserves protocol-read tracking',
  () => {
    it('keeps protocolFilesRead/Status after a real snapshot rewrite', () => {
      const stateFile = path.join(tmpDir, '.claude', 'unified-session-state.json');
      fs.writeFileSync(stateFile, JSON.stringify(seedState(), null, 2), 'utf8');

      const ps1 = path.join(REPO_ROOT, 'scripts', 'hooks', 'precompact-snapshot.ps1');
      execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${ps1}"`, {
        // Point both CLAUDE_PROJECT_DIR and USERPROFILE at the temp dir so the hook
        // never touches the real shared session state or ~/.claude/flags.
        env: { ...process.env, CLAUDE_PROJECT_DIR: tmpDir, USERPROFILE: tmpDir },
        stdio: 'pipe',
        timeout: 30000,
      });

      let raw = fs.readFileSync(stateFile, 'utf8');
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1); // PS Out-File -Encoding UTF8 adds a BOM
      const after = JSON.parse(raw);

      // trigger flips to 'precompact' only if the hook actually ran and rewrote the file.
      expect(after.trigger).toBe('precompact');
      expect(after.protocolFilesRead).toContain('CLAUDE_CORE.md');
      expect(after.protocolFileReadStatus['CLAUDE_CORE.md'].readCount).toBe(2);
      expect(after.protocolFileReadStatus['CLAUDE_CORE.md'].ranges).toHaveLength(2);
    });
  },
);
