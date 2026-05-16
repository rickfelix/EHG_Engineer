import { describe, it, expect, afterEach } from 'vitest';
import { detectReplication, _internals } from '../../scripts/lineage/detect-replication.mjs';

const oldEnv = { ...process.env };
afterEach(() => { process.env = { ...oldEnv }; });

describe('detect-replication exempt list', () => {
  it('exempts scripts/one-off/ paths', () => {
    process.env.ENFORCE_REPLICATION_DETECTOR = 'true';
    const r = detectReplication({ content: 'bypass_validation usage', path: 'scripts/one-off/_foo.mjs' });
    expect(r.exempt).toBe(true);
    expect(r.flagged).toBe(true);
  });

  it('exempts tests/ paths', () => {
    process.env.ENFORCE_REPLICATION_DETECTOR = 'true';
    const r = detectReplication({ content: 'bypass-rubric reference', path: 'tests/integration/foo.test.js' });
    expect(r.exempt).toBe(true);
  });

  it('exempts docs/retrospectives/ paths', () => {
    process.env.ENFORCE_REPLICATION_DETECTOR = 'true';
    const r = detectReplication({ content: '--bypass-validation noted', path: 'docs/retrospectives/sd-foo.md' });
    expect(r.exempt).toBe(true);
  });

  it('exempts docs/plans/archived/ paths', () => {
    process.env.ENFORCE_REPLICATION_DETECTOR = 'true';
    const r = detectReplication({ content: 'EMERGENCY_PUSH', path: 'docs/plans/archived/sd-foo.md' });
    expect(r.exempt).toBe(true);
  });

  it('non-exempt path with enforce=true throws', () => {
    process.env.ENFORCE_REPLICATION_DETECTOR = 'true';
    expect(() => detectReplication({ content: 'bypass_validation', path: 'src/feature.js' })).toThrow();
  });

  it('exempt paths array has expected entries', () => {
    expect(_internals.DEFAULT_EXEMPT_PATHS).toContain('scripts/one-off/');
    expect(_internals.DEFAULT_EXEMPT_PATHS).toContain('tests/');
    expect(_internals.DEFAULT_EXEMPT_PATHS).toContain('docs/retrospectives/');
    expect(_internals.DEFAULT_EXEMPT_PATHS).toContain('docs/plans/archived/');
  });
});
