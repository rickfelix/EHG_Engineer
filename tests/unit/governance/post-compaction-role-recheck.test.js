/**
 * SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-G — post-compaction role-seat re-read check.
 *
 * TS-1/TS-2/TS-5/TS-6 from the PRD: a role seat whose compaction postdates its recorded
 * contract read is flagged; the flag clears on a genuine re-read; Solomon (no quiet-tick) is
 * reachable via the file-only identity read; a concurrent session's marker never leaks in.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeFileSync } = require('fs');

const {
  IN_SCOPE_ROLES,
  CONTRACT_FILE_BY_ROLE,
  readLastCompactionForSession,
  detectInScopeRole,
  needsRecheck,
  checkRoleSession,
} = require('../../../lib/governance/post-compaction-role-recheck.cjs');

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'post-compaction-recheck-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeMarker(sessionId, timestamp) {
  writeFileSync(path.join(dir, 'last-compaction.json'), JSON.stringify({ timestamp, sessionId, trigger: 'auto-precompact' }));
}

function writeIdentity(sessionId, { role = true, callsign } = {}) {
  writeFileSync(path.join(dir, `fleet-identity-${sessionId}.json`), JSON.stringify({ role, callsign }));
}

describe('IN_SCOPE_ROLES / CONTRACT_FILE_BY_ROLE — the SD-corrected 3-seat roster', () => {
  it('is exactly adam, coordinator, solomon (Michael explicitly out of scope per LEAD decision Q3)', () => {
    expect(IN_SCOPE_ROLES).toEqual(['adam', 'coordinator', 'solomon']);
    expect(Object.keys(CONTRACT_FILE_BY_ROLE).sort()).toEqual(['adam', 'coordinator', 'solomon']);
  });

  it('maps each role to its own register script\'s CONTRACT_FILE constant', () => {
    expect(CONTRACT_FILE_BY_ROLE.adam).toBe('CLAUDE_ADAM.md');
    expect(CONTRACT_FILE_BY_ROLE.coordinator).toBe('CLAUDE_COORDINATOR.md');
    expect(CONTRACT_FILE_BY_ROLE.solomon).toBe('CLAUDE_SOLOMON.md');
  });
});

describe('needsRecheck — pure comparison core', () => {
  it('true when a real compaction postdates the last contract read', () => {
    expect(needsRecheck('2026-09-07T10:00:00.000Z', '2026-09-07T09:00:00.000Z')).toBe(true);
  });

  it('false when the contract read postdates the compaction', () => {
    expect(needsRecheck('2026-09-07T09:00:00.000Z', '2026-09-07T10:00:00.000Z')).toBe(false);
  });

  it('false when the two timestamps are equal (a read AT the compaction instant counts as covering it)', () => {
    expect(needsRecheck('2026-09-07T10:00:00.000Z', '2026-09-07T10:00:00.000Z')).toBe(false);
  });

  it('true when there IS a compaction but NO contract read was ever recorded', () => {
    expect(needsRecheck('2026-09-07T10:00:00.000Z', null)).toBe(true);
  });

  it('false when there is no compaction marker at all — nothing to react to', () => {
    expect(needsRecheck(null, null)).toBe(false);
    expect(needsRecheck(null, '2026-09-07T09:00:00.000Z')).toBe(false);
  });

  it('fails safe (false) on an unparseable compaction timestamp rather than treating garbage as "always stale"', () => {
    expect(needsRecheck('not-a-date', '2026-09-07T09:00:00.000Z')).toBe(false);
  });

  it('true on an unparseable contractReadAt (cannot confirm coverage, so treat as unread)', () => {
    expect(needsRecheck('2026-09-07T10:00:00.000Z', 'not-a-date')).toBe(true);
  });
});

describe('readLastCompactionForSession — TR-2 session-scoped marker read', () => {
  it('returns the timestamp when the marker matches this session', () => {
    writeMarker('sess-a', '2026-09-07T10:00:00.000Z');
    expect(readLastCompactionForSession('sess-a', { dir })).toBe('2026-09-07T10:00:00.000Z');
  });

  it('TS-6: a DIFFERENT session\'s marker on the same machine is never returned for this session', () => {
    writeMarker('sess-OTHER', '2026-09-07T10:00:00.000Z');
    expect(readLastCompactionForSession('sess-a', { dir })).toBeNull();
  });

  it('returns null when no marker file exists', () => {
    expect(readLastCompactionForSession('sess-a', { dir })).toBeNull();
  });

  it('returns null on a corrupt marker file rather than throwing', () => {
    writeFileSync(path.join(dir, 'last-compaction.json'), '{not json');
    expect(readLastCompactionForSession('sess-a', { dir })).toBeNull();
  });

  it('returns null for an empty/missing sessionId', () => {
    writeMarker('sess-a', '2026-09-07T10:00:00.000Z');
    expect(readLastCompactionForSession('', { dir })).toBeNull();
    expect(readLastCompactionForSession(null, { dir })).toBeNull();
  });

  it('respects the LEO_COMPACT_FLAG_DIR env override, mirroring context-compact-nudge.js', () => {
    writeMarker('sess-a', '2026-09-07T10:00:00.000Z');
    expect(readLastCompactionForSession('sess-a', { env: { LEO_COMPACT_FLAG_DIR: dir } })).toBe('2026-09-07T10:00:00.000Z');
  });
});

describe('detectInScopeRole — TS-5 Solomon reachability without a quiet-tick', () => {
  it('detects Solomon via the file-only identity read alone (no quiet-tick script involved)', () => {
    writeIdentity('sess-sol', { callsign: 'Solomon' });
    expect(detectInScopeRole('sess-sol', dir)).toBe('solomon');
  });

  it('detects Adam and coordinator the same way', () => {
    writeIdentity('sess-adam', { callsign: 'Adam' });
    writeIdentity('sess-coord', { callsign: 'Coordinator' });
    expect(detectInScopeRole('sess-adam', dir)).toBe('adam');
    expect(detectInScopeRole('sess-coord', dir)).toBe('coordinator');
  });

  it('Michael is a role but explicitly OUT of this SD\'s scope', () => {
    writeIdentity('sess-michael', { callsign: 'Michael' });
    expect(detectInScopeRole('sess-michael', dir)).toBeNull();
  });

  it('a worker session (no identity file) is not a role', () => {
    expect(detectInScopeRole('sess-worker', dir)).toBeNull();
  });

  it('an identity file with role:false is not a role session', () => {
    writeIdentity('sess-x', { role: false, callsign: 'Adam' });
    expect(detectInScopeRole('sess-x', dir)).toBeNull();
  });
});

describe('checkRoleSession — full integration over an in-memory state object', () => {
  it('TS-1: flags a role seat whose compaction postdates its recorded contract read', () => {
    writeMarker('sess-sol', '2026-09-07T10:00:00.000Z');
    writeIdentity('sess-sol', { callsign: 'Solomon' });
    const state = { protocolFileReadStatus: { 'CLAUDE_SOLOMON.md': { lastReadAt: '2026-09-07T09:00:00.000Z' } } };

    const r = checkRoleSession('sess-sol', state, { dir, identityDir: dir });

    expect(r.role).toBe('solomon');
    expect(r.required).toBe(true);
  });

  it('TS-2: the SAME seat is NOT flagged after a fresh contract re-read advances past the compaction', () => {
    writeMarker('sess-sol', '2026-09-07T10:00:00.000Z');
    writeIdentity('sess-sol', { callsign: 'Solomon' });
    const state = { protocolFileReadStatus: { 'CLAUDE_SOLOMON.md': { lastReadAt: '2026-09-07T10:05:00.000Z' } } };

    const r = checkRoleSession('sess-sol', state, { dir, identityDir: dir });

    expect(r.required).toBe(false);
  });

  it('a non-role (worker) session is never flagged, regardless of state', () => {
    writeMarker('sess-w', '2026-09-07T10:00:00.000Z');
    const state = { protocolFileReadStatus: {} };

    const r = checkRoleSession('sess-w', state, { dir, identityDir: dir });

    expect(r.role).toBeNull();
    expect(r.required).toBe(false);
  });

  it('a role seat with NO compaction marker for this session is not flagged', () => {
    writeIdentity('sess-adam', { callsign: 'Adam' });
    const state = { protocolFileReadStatus: {} };

    const r = checkRoleSession('sess-adam', state, { dir, identityDir: dir });

    expect(r.role).toBe('adam');
    expect(r.required).toBe(false);
  });

  it('tolerates a missing/malformed state object without throwing', () => {
    writeMarker('sess-adam', '2026-09-07T10:00:00.000Z');
    writeIdentity('sess-adam', { callsign: 'Adam' });

    expect(() => checkRoleSession('sess-adam', null, { dir, identityDir: dir })).not.toThrow();
    expect(() => checkRoleSession('sess-adam', {}, { dir, identityDir: dir })).not.toThrow();
  });
});
