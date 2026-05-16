import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectReplication, _internals } from '../../scripts/lineage/detect-replication.mjs';

const oldEnv = { ...process.env };
afterEach(() => { process.env = { ...oldEnv }; });

describe('detect-replication', () => {
  it('flags content with bypass_validation', () => {
    const r = detectReplication({ content: 'something with bypass_validation here', path: 'src/foo.js' });
    expect(r.flagged).toBe(true);
    expect(r.matches.length).toBeGreaterThan(0);
    expect(r.matches[0].verb).toBe('bypass_validation');
    expect(r.exempt).toBe(false);
  });

  it('clean content returns flagged=false', () => {
    const r = detectReplication({ content: 'totally clean code', path: 'src/foo.js' });
    expect(r.flagged).toBe(false);
    expect(r.matches).toEqual([]);
  });

  it('warn-only default (does not throw when env unset)', () => {
    delete process.env.ENFORCE_REPLICATION_DETECTOR;
    const r = detectReplication({ content: 'bypass_validation here', path: 'src/foo.js' });
    expect(r.flagged).toBe(true);
    expect(r.mode).toBe('WARN-ONLY');
  });

  it('BLOCKING mode throws when enforce=true', () => {
    process.env.ENFORCE_REPLICATION_DETECTOR = 'true';
    expect(() => detectReplication({ content: 'bypass_validation', path: 'src/foo.js' })).toThrow(/Replication detector BLOCKED/);
  });

  it('deny-list contains required verbs', () => {
    expect(_internals.DENY_LIST).toContain('bypass_validation');
    expect(_internals.DENY_LIST).toContain('--bypass-validation');
    expect(_internals.DENY_LIST).toContain('bypass-rubric');
    expect(_internals.DENY_LIST).toContain('EMERGENCY_PUSH');
  });
});
