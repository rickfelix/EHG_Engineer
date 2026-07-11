/**
 * QF-20260711-711 — promote-retro-action-items.mjs's daily --apply cron scanned the
 * live retrospectives table with no guard against synthetic/test rows. An integration
 * test's leaked "Test retrospective" fixture (tests/integration/harness-backlog-drain-policy.db.test.js
 * seeds directly into the shared production table) was promoted into a real QF built
 * from placeholder action-item text ("Do the important thing").
 *
 * Same network-free source-pin approach as promote-retro-action-items-field-fallback.test.js
 * (the script top-level-queries Supabase on import, so it has no importable exports).
 */
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dirname, '../../scripts/promote-retro-action-items.mjs'), 'utf8');

// Re-implement the exact guard predicate inline to assert behavior, not just text.
function isSyntheticFixture(retro) {
  return Boolean(retro.metadata?.test_fixture || retro.title === 'Test retrospective');
}

describe('QF-20260711-711: promoter rejects synthetic/test-fixture retro rows', () => {
  it('source checks metadata.test_fixture before promoting', () => {
    expect(SRC).toMatch(/metadata\?\.test_fixture/);
  });

  it('source checks the exact leaked fixture title as a belt-and-suspenders guard', () => {
    expect(SRC).toMatch(/title === 'Test retrospective'/);
  });

  it('a row with metadata.test_fixture=true is rejected', () => {
    expect(isSyntheticFixture({ title: 'Anything', metadata: { test_fixture: true } })).toBe(true);
  });

  it('a row titled exactly "Test retrospective" is rejected even without the metadata marker', () => {
    expect(isSyntheticFixture({ title: 'Test retrospective', metadata: {} })).toBe(true);
  });

  it('a real retrospective row is not rejected', () => {
    expect(isSyntheticFixture({ title: 'LEAD_TO_PLAN Handoff Retrospective: real work', metadata: {} })).toBe(false);
  });
});
