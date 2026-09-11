/**
 * SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-G — WIRING test.
 *
 * A discriminator test on lib/governance/post-compaction-role-recheck.cjs alone cannot prove the
 * hook actually CALLS it on a real Read event. This drives the real, exported processHookInput()
 * from scripts/hooks/protocol-file-tracker.cjs end-to-end, with the two file-based dependencies
 * (compaction marker, identity file) faked via env/fs, and asserts the diagnostic line is printed
 * for a genuine role-seat scenario and silent otherwise.
 *
 * Isolation: writeSessionState() inside protocol-file-tracker.cjs resolves to this worktree's own
 * .claude/unified-session-state.json (gitignored, not the shared root) — safe to let it write for
 * real rather than mocking the whole module.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const { processHookInput } = require('../../../scripts/hooks/protocol-file-tracker.cjs');

let flagDir;
let origSessionId;
let origEnforceFlag;
let logSpy;
let errorSpy;

beforeEach(() => {
  flagDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pft-wiring-'));
  origSessionId = process.env.CLAUDE_SESSION_ID;
  origEnforceFlag = process.env.ROLE_COMPACTION_REREAD_ENFORCE_V1;
  process.env.LEO_COMPACT_FLAG_DIR = flagDir;
  logSpy = jest_spy(console, 'log');
  errorSpy = jest_spy(console, 'error');
});

afterEach(() => {
  fs.rmSync(flagDir, { recursive: true, force: true });
  delete process.env.LEO_COMPACT_FLAG_DIR;
  if (origSessionId === undefined) delete process.env.CLAUDE_SESSION_ID; else process.env.CLAUDE_SESSION_ID = origSessionId;
  if (origEnforceFlag === undefined) delete process.env.ROLE_COMPACTION_REREAD_ENFORCE_V1; else process.env.ROLE_COMPACTION_REREAD_ENFORCE_V1 = origEnforceFlag;
  logSpy.mockRestore();
  errorSpy.mockRestore();
});

// vitest's `vi` is auto-injected as a global by this repo's vitest setup (matches sibling test
// files in this suite, which call vi.spyOn without importing it) — a tiny local alias keeps this
// file's intent explicit without asserting anything about that global's origin.
function jest_spy(obj, method) {
  return vi.spyOn(obj, method).mockImplementation(() => {});
}

function writeMarker(sessionId, timestamp) {
  fs.writeFileSync(path.join(flagDir, 'last-compaction.json'), JSON.stringify({ timestamp, sessionId, trigger: 'auto-precompact' }));
}

function writeIdentity(sessionId, callsign) {
  const identityDir = path.join(process.cwd(), '.claude');
  fs.mkdirSync(identityDir, { recursive: true });
  fs.writeFileSync(path.join(identityDir, `fleet-identity-${sessionId}.json`), JSON.stringify({ role: true, callsign }));
}

function cleanupIdentity(sessionId) {
  const fp = path.join(process.cwd(), '.claude', `fleet-identity-${sessionId}.json`);
  if (fs.existsSync(fp)) fs.rmSync(fp);
}

describe('protocol-file-tracker.cjs — post-compaction role recheck WIRING', () => {
  it('prints POST_COMPACTION_REREAD_REQUIRED for a Solomon session with a stale contract read, on a real Read call', () => {
    const sessionId = `wiring-sol-${Date.now()}`;
    process.env.CLAUDE_SESSION_ID = sessionId;
    writeMarker(sessionId, new Date(Date.now() + 3600_000).toISOString()); // "compacted" 1h in the future relative to any prior read
    writeIdentity(sessionId, 'Solomon');

    try {
      processHookInput({ tool_name: 'Read', tool_input: { file_path: 'CLAUDE_SOLOMON.md' }, tool_response: {} });
      // The read above stamps lastReadAt to "now", which is BEFORE our future-dated marker,
      // so on THIS SAME call the check should already see a stale read relative to the marker.
      const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(printed).toMatch(/POST_COMPACTION_REREAD_REQUIRED role=solomon/);
      expect(printed).toMatch(/mode=diagnostic/);
    } finally {
      cleanupIdentity(sessionId);
    }
  });

  it('mode=enforce when ROLE_COMPACTION_REREAD_ENFORCE_V1 is set, still non-blocking (exit-0 hook philosophy preserved)', () => {
    const sessionId = `wiring-adam-${Date.now()}`;
    process.env.CLAUDE_SESSION_ID = sessionId;
    process.env.ROLE_COMPACTION_REREAD_ENFORCE_V1 = 'true';
    writeMarker(sessionId, new Date(Date.now() + 3600_000).toISOString());
    writeIdentity(sessionId, 'Adam');

    try {
      expect(() => processHookInput({ tool_name: 'Read', tool_input: { file_path: 'CLAUDE_ADAM.md' }, tool_response: {} })).not.toThrow();
      const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(printed).toMatch(/POST_COMPACTION_REREAD_REQUIRED role=adam/);
      expect(printed).toMatch(/mode=enforce/);
    } finally {
      cleanupIdentity(sessionId);
    }
  });

  it('says nothing for a worker session (no role identity file)', () => {
    const sessionId = `wiring-worker-${Date.now()}`;
    process.env.CLAUDE_SESSION_ID = sessionId;
    writeMarker(sessionId, new Date().toISOString());

    processHookInput({ tool_name: 'Read', tool_input: { file_path: 'CLAUDE_ADAM.md' }, tool_response: {} });

    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).not.toMatch(/POST_COMPACTION_REREAD_REQUIRED/);
  });

  it('TS-3 regression guard: a non-protocol-file Read never touches the recheck path at all', () => {
    const sessionId = `wiring-nonprotocol-${Date.now()}`;
    process.env.CLAUDE_SESSION_ID = sessionId;
    writeMarker(sessionId, new Date(Date.now() + 3600_000).toISOString());
    writeIdentity(sessionId, 'Solomon');

    try {
      // protocol-file-tracker.cjs returns early for a non-protocol file (isProtocolFile check),
      // before reaching ANY of the code this SD added -- proving the addition sits strictly after
      // the existing early-return, not ahead of it.
      processHookInput({ tool_name: 'Read', tool_input: { file_path: 'some/unrelated/file.md' }, tool_response: {} });
      const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(printed).not.toMatch(/POST_COMPACTION_REREAD_REQUIRED/);
    } finally {
      cleanupIdentity(sessionId);
    }
  });

  it('never throws even if the recheck helper errors internally (fail-soft around the file-tracking write path)', () => {
    const sessionId = `wiring-corrupt-${Date.now()}`;
    process.env.CLAUDE_SESSION_ID = sessionId;
    // A corrupt marker: readLastCompactionForSession fails soft to null internally, so this should
    // simply result in no flag, not a thrown error propagating out of processHookInput.
    fs.writeFileSync(path.join(flagDir, 'last-compaction.json'), '{not-json');
    writeIdentity(sessionId, 'Adam');

    try {
      expect(() => processHookInput({ tool_name: 'Read', tool_input: { file_path: 'CLAUDE_ADAM.md' }, tool_response: {} })).not.toThrow();
    } finally {
      cleanupIdentity(sessionId);
    }
  });
});
