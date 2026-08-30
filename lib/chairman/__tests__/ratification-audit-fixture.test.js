/**
 * SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-B FR-5 (TS-7): a deliberately-unencoded FIXTURE
 * row that flags on every audit run and cannot be silenced via tests/quarantine-manifest.json.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURE_ROW, runAuditFixtureCheck } from '../ratification-audit-fixture.mjs';

describe('FR-5/TS-7: FIXTURE_ROW flags on every audit run', () => {
  it('FIXTURE_ROW itself is deliberately unencoded', () => {
    expect(FIXTURE_ROW.encoded_at).toBeNull();
  });

  it('runAuditFixtureCheck flags FIXTURE_ROW among a set of otherwise-encoded rows', () => {
    const rows = [
      { id: 'a', encoded_at: '2026-08-01T00:00:00Z' },
      { id: 'b', encoded_at: '2026-08-02T00:00:00Z' },
      FIXTURE_ROW,
    ];
    const flagged = runAuditFixtureCheck(rows);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].id).toBe(FIXTURE_ROW.id);
  });

  it('flags FIXTURE_ROW every time — repeated calls are not cached/silenced after the first', () => {
    for (let i = 0; i < 5; i++) {
      const flagged = runAuditFixtureCheck([FIXTURE_ROW]);
      expect(flagged).toHaveLength(1);
    }
  });

  it('is a pure function with no DB/fs dependency — nothing here can be neutralized by mocking an external call', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'ratification-audit-fixture.mjs'), 'utf8');
    expect(src).not.toMatch(/supabase|createClient|readFileSync|require\(/);
  });
});

describe('FR-5/TS-7: non-quarantinable by construction', () => {
  const ROOT = path.resolve(__dirname, '..', '..', '..');
  const MANIFEST_PATH = path.join(ROOT, 'tests', 'quarantine-manifest.json');

  it('THIS test file is not currently listed in tests/quarantine-manifest.json', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const thisFile = 'lib/chairman/__tests__/ratification-audit-fixture.test.js';
    const hit = manifest.quarantined.find((e) => e.file === thisFile);
    expect(hit, `${thisFile} must not be quarantined — it is the FR-5 non-quarantinable audit guard itself`).toBeUndefined();
  });

  it('the audit flag lives in a production lib/ module, not a test file — quarantine-manifest.json (vitest.config.js QUARANTINE_EXCLUDE) only ever excludes *.test.js files from the run, so it structurally cannot suppress runAuditFixtureCheck itself', () => {
    // Demonstrates the real invariant: even simulating "this test file is quarantined" (excluded
    // from the vitest run entirely), a non-test caller importing ratification-audit-fixture.mjs
    // directly still sees the flag — because quarantine only ever targets test files, never lib/
    // modules or their exports.
    const flagged = runAuditFixtureCheck([FIXTURE_ROW]);
    expect(flagged).toHaveLength(1);
    // The module path itself is outside tests/ entirely, so it is not even a candidate for a
    // quarantine-manifest.json entry (every existing entry's `file` field is a test path).
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const moduleIsQuarantinable = manifest.quarantined.some((e) => e.file === 'lib/chairman/ratification-audit-fixture.mjs');
    expect(moduleIsQuarantinable).toBe(false);
  });
});
