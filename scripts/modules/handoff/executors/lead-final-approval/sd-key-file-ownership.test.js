import { describe, it, expect } from 'vitest';
import { sdKeyOwnsFile } from './sd-key-file-ownership.js';

describe('sdKeyOwnsFile', () => {
  it('regression fixture (coordinator rulings #6/#7): parent -H does NOT own child H1\'s migration by prefix collision', () => {
    const parentKey = 'SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-001-H';
    const childFile = '20260814_SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-001-H1_wire_telemetry.sql';
    expect(sdKeyOwnsFile(parentKey, childFile)).toBe(false);
  });

  it('regression fixture (coordinator confirmation, 2nd specimen): parent -C does NOT own child C4\'s migration by prefix collision', () => {
    const parentKey = 'SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-001-C';
    const childFile = '20260813_SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-001-C4_finalize.sql';
    expect(sdKeyOwnsFile(parentKey, childFile)).toBe(false);
  });

  it('a child DOES own its own migration file', () => {
    const childKey = 'SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-001-H1';
    const childFile = '20260814_SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-001-H1_wire_telemetry.sql';
    expect(sdKeyOwnsFile(childKey, childFile)).toBe(true);
  });

  it('matches at end-of-string (no trailing character at all)', () => {
    expect(sdKeyOwnsFile('SD-FOO-001', 'migrations/SD-FOO-001')).toBe(true);
  });

  it('matches when followed by a non-alphanumeric separator (underscore, dot, dash)', () => {
    expect(sdKeyOwnsFile('SD-FOO-001', 'SD-FOO-001_migration.sql')).toBe(true);
    expect(sdKeyOwnsFile('SD-FOO-001', 'SD-FOO-001.sql')).toBe(true);
    expect(sdKeyOwnsFile('SD-FOO-001', 'SD-FOO-001-final.sql')).toBe(true);
  });

  it('does NOT match when followed by an alphanumeric continuation (the exact bug class)', () => {
    expect(sdKeyOwnsFile('SD-FOO-001', 'SD-FOO-0012_something.sql')).toBe(false);
    expect(sdKeyOwnsFile('SD-FOO-001', 'SD-FOO-001A_something.sql')).toBe(false);
  });

  it('finds a genuine boundary-anchored match even when a false prefix match occurs first in the string', () => {
    // The key appears twice: once as a prefix-of-longer-token (false), once at a real boundary (true).
    const key = 'SD-FOO-001';
    const filename = 'SD-FOO-0019_ignore/real/SD-FOO-001_actual.sql';
    expect(sdKeyOwnsFile(key, filename)).toBe(true);
  });

  it('no match anywhere in the filename', () => {
    expect(sdKeyOwnsFile('SD-FOO-001', 'SD-BAR-002_unrelated.sql')).toBe(false);
  });

  it('handles empty/null inputs without throwing', () => {
    expect(sdKeyOwnsFile('', 'file.sql')).toBe(false);
    expect(sdKeyOwnsFile('SD-FOO-001', '')).toBe(false);
    expect(sdKeyOwnsFile(null, 'file.sql')).toBe(false);
    expect(sdKeyOwnsFile('SD-FOO-001', null)).toBe(false);
  });
});
