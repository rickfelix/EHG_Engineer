/**
 * Quiet-failure consumer conversions — SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-B.
 *
 * WHY EVERY TEST HERE INJECTS ITS OWN ROWS. The live tables are CLEAN: codebase_health_snapshots
 * carries 4,009 rows (exact, fully paginated) with ZERO synthetic markers, and all 194
 * periodic_process_registry rows are unmarked. A filter over an already-clean table renders
 * identically whether it is present, absent, or NEUTERED — so any test that reads the live table and
 * asserts "output unchanged" CANNOT FAIL. The first draft of this SD's PRD contained exactly such a
 * test; it was deleted rather than reworded. These tests drive pure/injectable functions instead.
 *
 * AND WHY THEY LIVE IN THE UNIT TIER. tests/helpers/db-target.js DESIGNATED_NON_PROD_REFS is empty,
 * so the vitest `db` project only runs when VITEST_DB_ALLOW_REF names the live ref, and no workflow
 * runs `npm run test:db`. A db-project test proving these conversions would be CI-uninvoked — an
 * instrument nobody invokes is indistinguishable from an absent one.
 *
 * ASSERTIONS USE UNIQUE DISPLAY TOKENS, NEVER SUBSTRINGS. An earlier ad-hoc run of the panel control
 * reported a false FAIL because it searched for "e2e fixture", which collides with the exclusion-count
 * line the conversion itself prints — an assertion matching the very message announcing correct
 * behaviour. Distinctive tokens (E2EPROBEROW, WATCHERSELFROW…) make that collision impossible.
 */
import { describe, test, expect, vi } from 'vitest';
import { checkHealthFreshness } from '../../../scripts/lib/health-urgency.js';

const { printPeriodicLiveness } = require('../../../scripts/fleet-dashboard.cjs');

// ── helpers ────────────────────────────────────────────────────────────────────────────────
const isoAgo = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600000).toISOString();
const snapshot = (hoursAgo, metadata) => ({ scanned_at: isoAgo(hoursAgo), metadata });
const healthClient = (rows) => ({
  from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: rows, error: null }) }) }) }),
});

const registryRow = (process_key, display_name, process_type = 'cron') => ({
  process_key,
  display_name,
  process_type,
  currently_expected_active: true,
  last_fired_at: isoAgo(0),
  last_state: 'OK',
  updated_at: null,
});
const registryClient = (rows) => ({
  from: () => ({ select: () => ({ order: async () => ({ data: rows, error: null }) }) }),
});

async function renderPanel(rows) {
  const lines = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...a) => lines.push(a.join(' ')));
  try {
    await printPeriodicLiveness(registryClient(rows));
  } finally {
    spy.mockRestore();
  }
  return lines.join('\n');
}

// ── periodic_process_registry: the panel ───────────────────────────────────────────────────
describe('printPeriodicLiveness — fixture filter ADDED, not substituted (FR-4)', () => {
  // THE CONTROL. One evaluation carrying BOTH row types, asserted independently.
  //
  // A test seeding only an __e2e_ row passes under a CORRECT implementation and under a broken
  // replace-the-self-exclusion-with-the-predicate one, because isFixtureProcessKey('__watcher_self__')
  // is FALSE — so under the broken version the watcher silently reappears in its own list. Only
  // asserting both in the same render distinguishes them.
  test('THE CONTROL: __e2e_ excluded by the filter AND __watcher_self__ still excluded by the self-check', async () => {
    const out = await renderPanel([
      registryRow('__watcher_self__', 'WATCHERSELFROW', 'watcher'),
      registryRow('__e2e_fixture_probe', 'E2EPROBEROW', 'test'),
      registryRow('gha_cron:real-job.yml', 'REALJOBROW'),
    ]);
    expect(out).not.toContain('E2EPROBEROW');    // fixture filter did its job
    expect(out).not.toContain('WATCHERSELFROW'); // self-exclusion survived the conversion
    expect(out).toContain('REALJOBROW');         // and a real row is untouched
  });

  // THE FIVE REAL ROWS. Two lead with a bare dunder — the canonical FIXTURE_KEY_RE's ^__ branch
  // would classify them as fixtures — and three merely SOUND test-shaped. A name is a claim, not
  // evidence. __eva_scheduler_watcher_self__ is the load-bearing one: it proves the panel uses the
  // __e2e_-only predicate rather than the canonical key regex.
  test('THE CONTROL: real rows survive, including bare-dunder and test-sounding names', async () => {
    const out = await renderPanel([
      registryRow('__eva_scheduler_watcher_self__', 'SCHEDULERSELFROW', 'watcher'),
      registryRow('gha_cron:venture-fixture-sweep.yml', 'SWEEPROW'),
      registryRow('standard_loop:account-usage-sample', 'LOOPSAMPLEROW', 'loop'),
      registryRow('cron_script:account-usage-sample.mjs', 'SCRIPTSAMPLEROW'),
    ]);
    expect(out).toContain('SCHEDULERSELFROW');
    expect(out).toContain('SWEEPROW');
    expect(out).toContain('LOOPSAMPLEROW');
    expect(out).toContain('SCRIPTSAMPLEROW');
  });

  test('the exclusion is announced rather than silent', async () => {
    const out = await renderPanel([
      registryRow('__e2e_a', 'AAA'),
      registryRow('gha_cron:real.yml', 'REALJOBROW'),
    ]);
    expect(out).toContain('1 e2e fixture row(s) excluded');
  });

  test('renders without a database — proving FR-1 export + injection landed', () => {
    expect(typeof printPeriodicLiveness).toBe('function');
  });
});

// ── codebase_health_snapshots: the staleness check ─────────────────────────────────────────
describe('checkHealthFreshness — one synthetic row cannot mask a stale scanner (FR-2)', () => {
  // THE CORE HAZARD. This read has NO dimension filter at all, so a synthetic row in ANY dimension
  // becomes "the latest scan". Before conversion this returned stale:false on these inputs.
  test('a fresh SYNTHETIC row does not hide a 40h-old real scan', async () => {
    const r = await checkHealthFreshness(healthClient([
      snapshot(0, { synthetic: true }),
      snapshot(40, { source: 'health-scan' }),
    ]));
    expect(r.stale).toBe(true);
    expect(r.hoursOld).toBe(40);
  });

  // FAIL-SAFE DIRECTION. If every row in the window is synthetic we must report STALE, never fresh —
  // a staleness alarm that fails toward "fresh" is silent exactly when it matters.
  test('an all-synthetic window fails toward STALE', async () => {
    const r = await checkHealthFreshness(healthClient([
      snapshot(0, { synthetic: true }),
      snapshot(1, { is_fixture: true }),
    ]));
    expect(r.stale).toBe(true);
    expect(r.lastScan).toBeNull();
  });

  // THE OVER-EATING CONTROL, varying a different axis than the positives above: real rows carrying
  // unrelated metadata shapes, and the null metadata most real rows actually have.
  test('THE CONTROL: real rows survive regardless of metadata shape', async () => {
    await expect(checkHealthFreshness(healthClient([snapshot(1, { source: 'health-scan', run_id: 'abc' })])))
      .resolves.toMatchObject({ stale: false });
    await expect(checkHealthFreshness(healthClient([snapshot(2, { is_fixture: false })])))
      .resolves.toMatchObject({ stale: false });
    await expect(checkHealthFreshness(healthClient([snapshot(3, null)])))
      .resolves.toMatchObject({ stale: false });
  });

  // Strict === true only: a truthy-but-wrong-shaped value must not sweep a real row up.
  test('only strict boolean true marks a row synthetic', async () => {
    const r = await checkHealthFreshness(healthClient([snapshot(1, { synthetic: 'yes' })]));
    expect(r.stale).toBe(false);
  });
});
