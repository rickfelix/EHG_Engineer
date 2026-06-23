/**
 * SD-LEO-INFRA-ROLE-SESSION-NAMING-001 — role-sessions (Adam/Coordinator/Solomon) get a stable
 * status-line name by writing the same per-session identity file the worker statusline reads.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROLE_IDENTITY, roleIdentityFor, writeRoleStatusIdentity, IDENTITY_DIR } = require('../../lib/fleet/role-status-identity.cjs');

const STATUSLINE_COLORS = new Set(['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan']);

describe('SD-LEO-INFRA-ROLE-SESSION-NAMING-001: role-status-identity', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'role-id-')); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  it('ROLE_IDENTITY has stable Adam/Coordinator/Solomon names with statusline-valid colors', () => {
    expect(ROLE_IDENTITY.adam.callsign).toBe('Adam');
    expect(ROLE_IDENTITY.coordinator.callsign).toBe('Coordinator');
    expect(ROLE_IDENTITY.solomon.callsign).toBe('Solomon');
    for (const r of Object.values(ROLE_IDENTITY)) expect(STATUSLINE_COLORS.has(r.color)).toBe(true);
    expect(IDENTITY_DIR.replace(/\\/g, '/')).toMatch(/\.claude$/);
  });

  it('roleIdentityFor is case-insensitive and null on unknown', () => {
    expect(roleIdentityFor('COORDINATOR').callsign).toBe('Coordinator');
    expect(roleIdentityFor(' Adam ').callsign).toBe('Adam');
    expect(roleIdentityFor('nobody')).toBe(null);
    expect(roleIdentityFor(null)).toBe(null);
  });

  it('writes fleet-identity-<sessionId>.json with the role name + color', () => {
    const ok = writeRoleStatusIdentity({ sessionId: 'sess-abc_123', role: 'adam', nowIso: '2026-06-23T00:00:00Z', dir });
    expect(ok).toBe(true);
    const written = JSON.parse(fs.readFileSync(path.join(dir, 'fleet-identity-sess-abc_123.json'), 'utf8'));
    expect(written).toMatchObject({ callsign: 'Adam', color: 'cyan', display_name: 'Adam', role: true, assigned_at: '2026-06-23T00:00:00Z' });
  });

  it('writes the coordinator identity', () => {
    expect(writeRoleStatusIdentity({ sessionId: 's1', role: 'coordinator', dir })).toBe(true);
    const w = JSON.parse(fs.readFileSync(path.join(dir, 'fleet-identity-s1.json'), 'utf8'));
    expect(w.callsign).toBe('Coordinator');
  });

  it('does NOT write for an unknown role', () => {
    expect(writeRoleStatusIdentity({ sessionId: 's1', role: 'ghost', dir })).toBe(false);
    expect(fs.readdirSync(dir)).toHaveLength(0);
  });

  it('does NOT write for an invalid/path-traversal sessionId (security)', () => {
    expect(writeRoleStatusIdentity({ sessionId: '../../evil', role: 'adam', dir })).toBe(false);
    expect(writeRoleStatusIdentity({ sessionId: '', role: 'adam', dir })).toBe(false);
    expect(writeRoleStatusIdentity({ sessionId: null, role: 'adam', dir })).toBe(false);
    expect(fs.readdirSync(dir)).toHaveLength(0);
  });
});
