/**
 * SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-001 FR-1/FR-2 — TS-1, TS-2, TS-3.
 *
 * Unit tier with no DB and no credentials, deliberately: the `db` vitest project is DISABLED in
 * this repo ("0 of db tests will run"), so a credential-gated test skips SILENTLY AND GREEN. That is
 * the same invisible-pass shape that let FR-0's phantom-column defect survive, and this SD should
 * not reproduce it in its own tests.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  selectExpiredJudgments,
  expiryPatch,
  EXPIRY_DAYS,
  EXPIRY_ACTOR,
  ENABLED_BY_DEFAULT,
} from '../../lib/solomon/judgment-expiry.js';

const NOW = Date.parse('2026-07-29T00:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 86_400_000).toISOString();

describe('TS-1 — expiry fires only past the PINNED threshold', () => {
  it('the threshold is 7 days, asserted against the CONSTANT not a fixture', () => {
    // Measured on live data: 0 pending rows exceed 5d, 176 exceed 72h, oldest 4.8d. A test that let
    // the fixture define the threshold would pass for any value, including one that expires rows
    // history says were about to be judged.
    expect(EXPIRY_DAYS).toBe(7);
  });

  it('stamps a row past the threshold and NOT one just inside it', () => {
    const rows = [
      { id: 'old', decision: 'pending', created_at: daysAgo(EXPIRY_DAYS + 0.01) },
      { id: 'fresh', decision: 'pending', created_at: daysAgo(EXPIRY_DAYS - 0.01) },
    ];
    const got = selectExpiredJudgments(rows, { nowMs: NOW }).map((r) => r.id);
    expect(got).toEqual(['old']);
  });

  it('never re-stamps a row that already expired', () => {
    const rows = [{ id: 'a', decision: 'pending', created_at: daysAgo(30), judgment_expired_at: daysAgo(20) }];
    expect(selectExpiredJudgments(rows, { nowMs: NOW })).toEqual([]);
  });

  it('ONLY unanswered judgments expire — an answered row is never stamped', () => {
    // The load-bearing negative. Stamping an accepted row would assert nobody answered a question
    // that was in fact answered, which is worse than leaving it unstamped.
    const rows = ['accepted', 'rejected', 'partial', 'deferred'].map((decision, i) => ({
      id: `x${i}`, decision, created_at: daysAgo(90),
    }));
    expect(selectExpiredJudgments(rows, { nowMs: NOW })).toEqual([]);
  });

  it('skips rows with an unusable timestamp or clock rather than guessing', () => {
    expect(selectExpiredJudgments([{ id: 'a', decision: 'pending', created_at: 'not-a-date' }], { nowMs: NOW })).toEqual([]);
    expect(selectExpiredJudgments([{ id: 'a', decision: 'pending', created_at: daysAgo(90) }], { nowMs: NaN })).toEqual([]);
  });
});

describe('TS-2 — expiry does NOT touch the decision column', () => {
  it('the patch writes only the expiry columns', () => {
    // REPLACES the original TS-2, which asserted that a judging path could not write
    // `expired_unjudged` — already true via VALID_DISPOSITIONS, so it asserted a no-op, AND the
    // original FR-1 instructed adding that value to the same allow-list, which would have failed it.
    // The real invariant now: aging changes expiry and nothing else.
    const patch = expiryPatch({ nowIso: '2026-07-29T00:00:00Z' });
    expect(Object.keys(patch).sort()).toEqual(['judgment_expired_at', 'judgment_expired_by']);
    expect(patch).not.toHaveProperty('decision');
    expect(patch).not.toHaveProperty('outcome');
  });

  it('always attributes the stamp — the DB CHECK requires it', () => {
    // Guarantees a stamp is never ANONYMOUS. It does NOT establish WHO stamped it: EXPIRY_ACTOR is a
    // public exported constant and every writer shares one service-role identity, so this cannot
    // distinguish the job from a hand-written row. TS-10 needs a witness the DB cannot supply.
    expect(expiryPatch({ nowIso: 'x' }).judgment_expired_by).toBe(EXPIRY_ACTOR);
  });

  it('the migration adds COLUMNS and does not alter the decision CHECK', () => {
    const raw = readFileSync(resolve(process.cwd(), 'database/migrations/20260729_solomon_ledger_judgment_expiry.sql'), 'utf8');
    // STRIP COMMENTS FIRST. The migration's header explains at length WHY the original
    // `expired_unjudged` decision value was rejected, and an earlier version of this assertion read
    // that explanation as the thing it forbids — failing on prose while the SQL was correct. That is
    // the same mistake I made one commit earlier reading `metadata` keys as column names: an
    // assertion that cannot tell documentation from code will eventually punish the documentation.
    const sql = raw.replace(/^\s*--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS judgment_expired_at/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS judgment_expired_by/);
    // The reversal, pinned: no decision-CHECK surgery, and no new decision value in executable SQL.
    expect(sql).not.toMatch(/decision_check/);
    expect(sql).not.toContain('expired_unjudged');
    // The attribution CHECK guarantees an expiry stamp is never ANONYMOUS — narrower than what I
    // first claimed. It does NOT make TS-10 non-forgeable: it constrains neither the value
    // (EXPIRY_ACTOR is a public constant) nor the writer (all writers share one service-role
    // identity), so no CHECK can distinguish a hand-written row from a mechanism's. This is a
    // SOURCE pin, not behaviour: the constraint does
    // not exist in the live schema yet (verified 42703), and only apply-time verification can turn
    // intent into a present fact. But it is the same tier as every other claim asserted about this
    // file, so there is no reason the load-bearing one was the unpinned exception.
    expect(sql).toMatch(/judgment_expired_at IS NULL OR judgment_expired_by IS NOT NULL/);
    // ...and the rationale MUST survive in the prose, so a later reader cannot re-litigate the
    // reversal without meeting the reason for it.
    expect(raw).toContain('expired_unjudged');
  });
});

describe('TS-3 — the job ships DISABLED', () => {
  it('is off by default so the first run is a decision, not a merge side effect', () => {
    // A scheduler entry that exists but is disabled still satisfies "an entry references it", which
    // is why this asserts the flag rather than the entry. Aging is effectively irreversible: once a
    // row records that nobody answered, re-judging it later cannot un-record that.
    expect(ENABLED_BY_DEFAULT).toBe(false);
  });
});

/**
 * FR-2 — the RUNNER and its two independent safety gates.
 *
 * These exist because retro review found FR-2 had shipped as a pure selector with an
 * ENABLED_BY_DEFAULT flag NO CODE READ, described as "ships disabled". That is not a disabled
 * mechanism, it is an absent one — and an absent mechanism is precisely how five prior mechanisms
 * came to sit at zero usage in this same table.
 *
 * The error worth naming: I had a sound argument that TS-3 should assert the enable FLAG rather than
 * the scheduler ENTRY. That argument is about what to ASSERT. I reused it, without noticing, as a
 * reason not to BUILD the entry — a narrower test silently became a narrower deliverable.
 */
describe('FR-2 — the runner refuses to write by default', () => {
  it('does not run at all without the explicit env gate', async () => {
    const { resolveRunMode } = await import('../../scripts/solomon-judgment-expiry-run.mjs');
    const m = resolveRunMode({ env: {}, argv: ['--apply'] });
    // --apply alone is NOT enough. Merging the workflow cannot start it.
    expect(m.run).toBe(false);
    expect(m.apply).toBe(false);
  });

  it('enabled WITHOUT --apply is a dry run, not a write', async () => {
    const { resolveRunMode } = await import('../../scripts/solomon-judgment-expiry-run.mjs');
    const m = resolveRunMode({ env: { LEO_JUDGMENT_EXPIRY_ENABLED: '1' }, argv: [] });
    expect(m.run).toBe(true);
    expect(m.apply).toBe(false);
    // A dry run is deliberately permitted: seeing the candidate set is how an operator decides
    // whether the first real run is safe, and aging cannot be undone by judging a row later.
    expect(m.reason).toBe('dry-run');
  });

  it('writes only when BOTH gates are open', async () => {
    const { resolveRunMode } = await import('../../scripts/solomon-judgment-expiry-run.mjs');
    const m = resolveRunMode({ env: { LEO_JUDGMENT_EXPIRY_ENABLED: '1' }, argv: ['--apply'] });
    expect(m.run).toBe(true);
    expect(m.apply).toBe(true);
  });

  it('the scheduler entry EXISTS and its cadence is commented out', () => {
    // Asserts the entry as well as the flag. The earlier reasoning — "a disabled entry still
    // satisfies 'an entry references it'" — is a good argument against relying on the entry ALONE,
    // and I wrongly let it stand as a reason to omit the entry entirely.
    const wf = readFileSync(resolve(process.cwd(), '.github/workflows/solomon-judgment-expiry.yml'), 'utf8');
    expect(wf).toMatch(/workflow_dispatch:/);
    expect(wf).toMatch(/solomon-judgment-expiry-run\.mjs/);
    // The cadence must be present-but-commented, so enabling it is a one-line deliberate act rather
    // than a rewrite — and so its absence is visible rather than merely unwritten.
    expect(wf).toMatch(/^\s*#\s*schedule:/m);
    expect(wf).not.toMatch(/^\s{2}schedule:/m);
  });

  it('the runner PAGINATES — the ledger is past the 1000-row cap', () => {
    const src = readFileSync(resolve(process.cwd(), 'scripts/solomon-judgment-expiry-run.mjs'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(src).toMatch(/\.range\(/);
    expect(src, 'an unpaginated read silently clamps at 1000').toMatch(/for \(let from = 0/);
  });
});
