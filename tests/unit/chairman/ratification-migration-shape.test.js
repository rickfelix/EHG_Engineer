// The utterance-provenance migration must keep a SHAPE, not just exist.
//
// SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-D, TS-5.
//
// Three properties of this migration are load-bearing and every one of them is the kind of thing a
// well-meaning later edit "tidies" away:
//
//  1. PLACEMENT. It must live in database/chairman-gated/, never database/migrations/. That
//     directory is not a filing convention — it is what opts a file OUT of BaseExecutor's
//     auto-apply. Moving it would let a schema change to the chairman ledger apply itself.
//
//  2. NOT VALID, never SET NOT NULL. Measured 2026-09-03: the append-only freeze trigger
//     (20260823_chairman_ratifications.sql:96-117) rejects ANY update once encoded_at is set, and
//     49 of ~50 live rows have it set. So the conventional backfill-then-SET-NOT-NULL shape cannot
//     run at all. Someone reading `CHECK (... IS NOT NULL) NOT VALID` without that context will
//     read it as a weaker NOT NULL and be tempted to "strengthen" it into a migration that cannot
//     apply.
//
//  3. NO TOP-LEVEL UPDATE. A backfill UPDATE is FORBIDDEN_TOPLEVEL in the tier classifier, so
//     adding one silently changes how the file is allowed to be handled.
//
// WHY THE CLASSIFIER ASSERTION IS HERE AND NOT JUST THE PATH CHECK: the path is a claim about where
// the file sits; the classifier is the thing that actually decides whether it can auto-apply. I
// asserted the path first, then measured the classifier, and only then learned they can disagree in
// a way that matters — see the split test below, which pins the reason the file must stay whole.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyMigration } from '../../../scripts/lib/migration-tier-classifier.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SLUG = '20260903_chairman_ratifications_utterance_provenance';
const GATED_DIR = path.join(REPO_ROOT, 'database', 'chairman-gated');
const FORWARD = path.join(GATED_DIR, `${SLUG}.sql`);
const DOWN = path.join(GATED_DIR, `${SLUG}_DOWN.sql`);

// Read once. If the file is renamed or moved, existsSync below fails loudly rather than these
// tests passing vacuously against an empty string.
const forwardSql = existsSync(FORWARD) ? readFileSync(FORWARD, 'utf8') : null;
const downSql = existsSync(DOWN) ? readFileSync(DOWN, 'utf8') : null;

// STATEMENTS ONLY — comments stripped. This distinction is not pedantry: the first version of this
// file asserted against the RAW text and failed on its own migration, because both files explain
// their reasoning in comments that quote the very SQL being asserted ("the three ADD COLUMN
// statements", "the DROP COLUMN would have to cascade"). Five ADD COLUMN matches where three
// statements exist; a DROP COLUMN mention 700 chars before the real DROP CONSTRAINT. Correct
// pattern, wrong EXTENT — the same shape as a grep scoped to one subtree answering a question
// about a whole file. Assert prose against `*Sql`, assert SQL against `*Stmts`.
const stripComments = (sql) => (sql === null ? null : sql.replace(/^\s*--.*$/gm, ''));
const forwardStmts = stripComments(forwardSql);
const downStmts = stripComments(downSql);

describe('utterance-provenance migration placement', () => {
  it('the forward migration exists at the chairman-gated path (not merely somewhere)', () => {
    expect(forwardSql, `expected migration at ${FORWARD}`).not.toBeNull();
  });

  it('a rollback sibling exists', () => {
    expect(downSql, `expected rollback at ${DOWN}`).not.toBeNull();
  });

  it('is NOT in database/migrations/, the auto-applied directory', () => {
    const autoApplied = path.join(REPO_ROOT, 'database', 'migrations', `${SLUG}.sql`);
    expect(existsSync(autoApplied)).toBe(false);
  });

  it('carries the @chairman-gated marker the ceremony reads', () => {
    expect(forwardSql).toMatch(/@chairman-gated/);
  });
});

describe('utterance-provenance migration shape', () => {
  it('adds all three columns', () => {
    for (const col of ['uttered_at', 'quote_hash', 'transcript_ref']) {
      expect(forwardStmts, `missing ADD COLUMN for ${col}`).toMatch(
        new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}`, 'i')
      );
    }
  });

  it('enforces presence via CHECK ... NOT VALID', () => {
    expect(forwardStmts).toMatch(/ADD CONSTRAINT\s+cr_utterance_provenance_present/i);
    expect(forwardStmts).toMatch(/NOT VALID/i);
  });

  it('does NOT use ALTER COLUMN ... SET NOT NULL — it cannot apply on this table', () => {
    // The freeze trigger blocks the backfill this would require. See the file header.
    expect(forwardStmts).not.toMatch(/ALTER COLUMN\s+\w+\s+SET NOT NULL/i);
  });

  it('contains no top-level UPDATE (FORBIDDEN_TOPLEVEL in the tier classifier)', () => {
    expect(forwardStmts).not.toMatch(/^\s*UPDATE\s/im);
  });

  it('adds the columns nullable — no DEFAULT, which would rewrite rows', () => {
    const addColumnLines = forwardStmts
      .split('\n')
      .filter((l) => /ADD COLUMN/i.test(l));
    expect(addColumnLines.length).toBe(3);
    for (const line of addColumnLines) {
      expect(line, `ADD COLUMN must not carry a DEFAULT: ${line}`).not.toMatch(/DEFAULT/i);
    }
  });

  it('rollback drops the constraint BEFORE the columns it references', () => {
    const constraintAt = downStmts.search(/DROP CONSTRAINT/i);
    const firstColumnAt = downStmts.search(/DROP COLUMN/i);
    expect(constraintAt).toBeGreaterThan(-1);
    expect(firstColumnAt).toBeGreaterThan(-1);
    expect(constraintAt).toBeLessThan(firstColumnAt);
  });
});

describe('the tier classifier — the thing that actually decides auto-apply', () => {
  it('classifies the forward migration TIER-2, so it CANNOT auto-apply', () => {
    expect(classifyMigration(forwardSql).tier).toBe(2);
  });

  it('classifies the rollback TIER-2 as well', () => {
    expect(classifyMigration(downSql).tier).toBe(2);
  });

  it('PINS WHY THE FILE MUST NOT BE SPLIT: the ADD COLUMNs alone would auto-apply', () => {
    // Measured 2026-09-03 and the reason for the do-not-split warning in the migration header.
    // The columns on their own are provably additive and classify TIER-1 — eligible for
    // BaseExecutor auto-apply. The constraint is what forces TIER-2. Split them into two files and
    // the columns land automatically while the constraint waits on the ceremony, leaving a window
    // where the schema exists and enforces nothing. This test fails if that ever stops being true,
    // which is the point: the warning in the header would then be wrong and should be rewritten.
    const columnsOnly = [
      'ALTER TABLE chairman_ratifications ADD COLUMN IF NOT EXISTS uttered_at timestamptz;',
    ].join('\n');
    const constraintOnly =
      'ALTER TABLE chairman_ratifications ADD CONSTRAINT cr_x CHECK (uttered_at IS NOT NULL) NOT VALID;';

    expect(classifyMigration(columnsOnly).tier).toBe(1);
    expect(classifyMigration(constraintOnly).tier).toBe(2);
  });
});
