// SD-LEO-INFRA-REVIVE-EVA-PURGE-MGMT-REVIEWS-001 — static source-pin tests.
//
// These tests are deliberately STATIC source-pins (read the files, assert invariants) rather than
// live-DB or subprocess tests. Rationale (QF-20260609-547 lesson): migration/hook tests that spawn
// subprocesses or require a live DB flake in CI; pinning the on-disk artifact is deterministic and
// still catches every regression that matters here (a writer reverting to bare .insert, a missing
// safety clause in the irreversible migration).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const UP_SQL = path.join(ROOT, 'database', 'migrations', '20260610_purge_management_reviews_pollution.sql');
const DOWN_SQL = path.join(ROOT, 'database', 'migrations', '20260610_purge_management_reviews_pollution_DOWN.sql');
const ROUND_WRITER = path.join(ROOT, 'scripts', 'eva', 'management-review-round.mjs');
const GEN_WRITER = path.join(ROOT, 'scripts', 'pipeline', 'management-review-generator.js');

const read = (p) => fs.readFileSync(p, 'utf8');

describe('purge migration (UP) — irreversible-safe invariants', () => {
  const sql = read(UP_SQL);

  it('exists and carries the @approved-by header (apply-migration.js 3-factor guard)', () => {
    expect(sql).toMatch(/^--\s*@approved-by:\s*\S+@\S+/m);
  });

  it('takes an ACCESS EXCLUSIVE lock BEFORE any DML (race guard against per-second pollution)', () => {
    expect(sql).toMatch(/LOCK TABLE\s+management_reviews\s+IN\s+ACCESS EXCLUSIVE MODE/i);
    const lockIdx = sql.search(/LOCK TABLE\s+management_reviews\s+IN\s+ACCESS EXCLUSIVE MODE/i);
    const deleteIdx = sql.search(/DELETE FROM management_reviews/i);
    expect(lockIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeGreaterThan(-1);
    expect(lockIdx).toBeLessThan(deleteIdx); // lock comes first
  });

  it('quarantines the full table before deleting (reversibility source)', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS\s+management_reviews_quarantine_20260610\s+AS\s+SELECT \* FROM management_reviews/i);
  });

  it('pre-asserts quarantine==live count AND zero chairman-touched rows (keep-predicate tripwire)', () => {
    expect(sql).toMatch(/v_quar\s*<>\s*v_live/);            // snapshot completeness
    expect(sql).toMatch(/chairman_notes IS NOT NULL OR chairman_approved_proposals IS NOT NULL/i);
    expect(sql).toMatch(/RAISE EXCEPTION 'purge aborted:[^']*keep-predicate/i);
  });

  it('DELETE is backup-bound (WHERE mr.id = q.id against the quarantine), not a bare predicate', () => {
    expect(sql).toMatch(/DELETE FROM management_reviews mr\s+USING\s+management_reviews_quarantine_20260610 q\s+WHERE mr\.id = q\.id/i);
  });

  it('post-asserts the table is empty before declaring success', () => {
    expect(sql).toMatch(/v_remaining\s*<>\s*0/);
    expect(sql).toMatch(/RAISE EXCEPTION 'purge failed:/i);
  });

  it('adds the durable UNIQUE(review_date, review_type) guard AFTER the purge', () => {
    expect(sql).toMatch(/ADD CONSTRAINT\s+management_reviews_review_date_type_key\s+UNIQUE\s*\(review_date,\s*review_type\)/i);
    const deleteIdx = sql.search(/DELETE FROM management_reviews/i);
    const constraintIdx = sql.search(/ADD CONSTRAINT\s+management_reviews_review_date_type_key/i);
    expect(deleteIdx).toBeLessThan(constraintIdx); // constraint added on the now-empty table
  });

  it('does not hardcode the row count in executable logic (counts computed live)', () => {
    // Strip SQL line-comments — the header legitimately documents the live-verified figure;
    // what must never happen is a hardcoded count in the DELETE/assert logic.
    const executable = sql.replace(/--.*$/gm, '');
    expect(executable).not.toMatch(/\b44[,_]?\d{3}\b/);
  });
});

describe('purge migration (DOWN) — reversibility', () => {
  const sql = read(DOWN_SQL);

  it('exists and carries the @approved-by header', () => {
    expect(sql).toMatch(/^--\s*@approved-by:\s*\S+@\S+/m);
  });

  it('drops the UNIQUE constraint FIRST (quarantine holds duplicate date/type pairs)', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS\s+management_reviews_review_date_type_key/i);
    const dropIdx = sql.search(/DROP CONSTRAINT/i);
    const insertIdx = sql.search(/INSERT INTO management_reviews/i);
    expect(dropIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(dropIdx).toBeLessThan(insertIdx); // drop before re-insert, else 23505
  });

  it('re-inserts every quarantined row idempotently (ON CONFLICT (id) DO NOTHING)', () => {
    expect(sql).toMatch(/INSERT INTO management_reviews\s+SELECT \* FROM management_reviews_quarantine_20260610\s+ON CONFLICT \(id\) DO NOTHING/i);
  });
});

describe('management_reviews writers — upsert, not insert', () => {
  it('management-review-round.mjs upserts with the correct conflict target', () => {
    const src = read(ROUND_WRITER);
    expect(src).toMatch(/\.from\(['"]management_reviews['"]\)\s*\.upsert\(\s*review\s*,\s*\{\s*onConflict:\s*['"]review_date,review_type['"]\s*\}\s*\)/);
    // and must NOT regress to a bare insert into management_reviews
    expect(src).not.toMatch(/\.from\(['"]management_reviews['"]\)\s*\.insert\(/);
  });

  it('management-review-generator.js upserts with the correct conflict target', () => {
    const src = read(GEN_WRITER);
    expect(src).toMatch(/\.from\(['"]management_reviews['"]\)\s*\.upsert\(\s*review\s*,\s*\{\s*onConflict:\s*['"]review_date,review_type['"]\s*\}\s*\)/);
    expect(src).not.toMatch(/\.from\(['"]management_reviews['"]\)\s*\.insert\(/);
  });

  it('regression sweep: neither writer contains a bare .insert into management_reviews', () => {
    for (const f of [ROUND_WRITER, GEN_WRITER]) {
      const src = read(f);
      const bareInsert = /management_reviews['"]\)\s*\.insert\(/.test(src);
      expect(bareInsert, `${path.basename(f)} still has a bare .insert into management_reviews`).toBe(false);
    }
  });
});
