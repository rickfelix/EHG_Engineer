// QF-20260912-253: the 6 feedback.update() call sites this migration fixes must find their
// columns -- a regression here silently re-breaks lib/quality/triage-engine.js,
// lib/quality/priority-calculator.js, and lib/quality/ignore-patterns.js.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyMigration } from '../../../scripts/lib/migration-tier-classifier.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FILE = path.join(REPO_ROOT, 'database', 'migrations', '20260912_feedback_triage_assignment_columns.sql');
const sql = existsSync(FILE) ? readFileSync(FILE, 'utf8') : null;

const COLUMNS = ['assigned_at', 'assignment_reason', 'priority_reasoning', 'burst_group_id', 'ignored_by_pattern_id', 'ignore_reason'];

describe('QF-20260912-253 migration placement', () => {
  it('exists in the auto-applied database/migrations/ directory (pure ADD COLUMN, no chairman gate needed)', () => {
    expect(sql, `expected migration at ${FILE}`).not.toBeNull();
  });

  it('classifies TIER-1 (all statements provably additive)', () => {
    const result = classifyMigration(sql);
    expect(result.tier).toBe(1);
  });
});

describe('QF-20260912-253 migration shape', () => {
  it('adds all 6 columns, each nullable', () => {
    for (const col of COLUMNS) {
      expect(sql, `missing ADD COLUMN for ${col}`).toMatch(
        new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}\\s+\\w+\\s+NULL`, 'i')
      );
    }
  });

  it('never touches an existing column (assigned_to) or table (feedback itself)', () => {
    expect(sql).not.toMatch(/DROP COLUMN/i);
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS\s+assigned_to\b/i);
  });

  it('carries no DO block or other FORBIDDEN_TOPLEVEL statement', () => {
    expect(sql).not.toMatch(/\bDO\s*\$/i);
  });
});
