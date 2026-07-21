/**
 * SD-LEO-INFRA-LEO-COMPLETION-001-D FR-4 — buildLiveSpawnInvocation `--resume` extension.
 * Pure argv builder: resume append + strict back-compat (no-resume path byte-identical) + the
 * CLAUDE_CONFIG_DIR-into-returned-env-only isolation invariant preserved.
 */
import { describe, it, expect } from 'vitest';
import { buildLiveSpawnInvocation } from '../../../lib/fleet/spawn-control.js';

describe('buildLiveSpawnInvocation --resume (FR-4)', () => {
  it('appends [--resume, <uuid>] to the argv when a resumeUuid is supplied', () => {
    const inv = buildLiveSpawnInvocation({ role: 'worker', callsign: 'Worker-1', resumeUuid: 'abc-123' });
    // RED against pre-change code (which had NO resume path): args would be ['new-tab','--','claude'].
    expect(inv.args).toEqual(['new-tab', '--', 'claude', '--resume', 'abc-123']);
    expect(inv.program).toBe('wt.exe');
  });

  it('is byte-identical to the legacy invocation when no resumeUuid is given (back-compat)', () => {
    const inv = buildLiveSpawnInvocation({ role: 'worker', callsign: 'Worker-1' });
    expect(inv.args).toEqual(['new-tab', '--', 'claude']);
  });

  it('coerces a non-string resume token via String() (never leaks a raw object into argv)', () => {
    const inv = buildLiveSpawnInvocation({ callsign: 'W', resumeUuid: 42 });
    expect(inv.args).toEqual(['new-tab', '--', 'claude', '--resume', '42']);
  });

  it('injects CLAUDE_CONFIG_DIR only into the returned env, never process.env, and never as an argv token', () => {
    const before = process.env.CLAUDE_CONFIG_DIR;
    const inv = buildLiveSpawnInvocation({ role: 'worker', callsign: 'Worker-1', profileDir: 'C:\\profiles\\canary', resumeUuid: 'u-1' });
    expect(inv.env.CLAUDE_CONFIG_DIR).toBe('C:\\profiles\\canary');
    expect(inv.args).not.toContain('C:\\profiles\\canary');
    expect(process.env.CLAUDE_CONFIG_DIR).toBe(before); // isolation invariant untouched
  });

  it('omits CLAUDE_CONFIG_DIR from env when no profileDir is given', () => {
    const inv = buildLiveSpawnInvocation({ callsign: 'W', resumeUuid: 'u' });
    expect(inv.env).not.toHaveProperty('CLAUDE_CONFIG_DIR');
    expect(inv.env.FLEET_WORKER_CALLSIGN).toBe('W');
  });
});
