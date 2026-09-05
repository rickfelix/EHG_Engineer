/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E FR-1 — the shared terminalSessionUpdate() chokepoint.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { terminalSessionUpdate, sessionStatusUpdate, TERMINAL_STATUSES } = require('../../../lib/fleet/terminal-session-update.cjs');

describe('terminalSessionUpdate', () => {
  it('always includes is_alive:false alongside the given status', () => {
    expect(terminalSessionUpdate('released')).toEqual({ status: 'released', is_alive: false });
    expect(terminalSessionUpdate('stale')).toEqual({ status: 'stale', is_alive: false });
  });

  it('merges caller-supplied extra fields', () => {
    const payload = terminalSessionUpdate('released', { released_at: '2026-01-01T00:00:00Z', released_reason: 'TEST', sd_key: null });
    expect(payload).toEqual({
      released_at: '2026-01-01T00:00:00Z', released_reason: 'TEST', sd_key: null, status: 'released', is_alive: false,
    });
  });

  it('a caller cannot override status or is_alive via extraFields', () => {
    const payload = terminalSessionUpdate('released', { status: 'active', is_alive: true, released_reason: 'X' });
    expect(payload.status).toBe('released');
    expect(payload.is_alive).toBe(false);
  });

  it('throws for a non-terminal status — idle/active are out of scope by design', () => {
    expect(() => terminalSessionUpdate('idle')).toThrow(/must be one of/);
    expect(() => terminalSessionUpdate('active')).toThrow(/must be one of/);
    expect(() => terminalSessionUpdate(undefined)).toThrow(/must be one of/);
  });

  it('exports the exact terminal-status set this SD is scoped to', () => {
    expect(TERMINAL_STATUSES).toEqual(['released', 'stale']);
  });
});

describe('sessionStatusUpdate — for a runtime-resolved status that may or may not be terminal', () => {
  it('routes through terminalSessionUpdate (adds is_alive:false) when the resolved status is terminal', () => {
    expect(sessionStatusUpdate('released', { released_reason: 'X' })).toEqual({
      released_reason: 'X', status: 'released', is_alive: false,
    });
    expect(sessionStatusUpdate('stale', { stale_reason: 'Y' })).toEqual({
      stale_reason: 'Y', status: 'stale', is_alive: false,
    });
  });

  it('does NOT add is_alive when the resolved status is non-terminal (idle)', () => {
    expect(sessionStatusUpdate('idle', { released_reason: 'X' })).toEqual({ released_reason: 'X', status: 'idle' });
    expect(sessionStatusUpdate('idle')).not.toHaveProperty('is_alive');
  });
});
