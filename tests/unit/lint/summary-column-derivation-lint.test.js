import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  BASELINE_BOOLEAN_COLUMNS,
  findUndereivedBooleanColumns,
  findUnpairedJsonbSummaryKeys,
  findForeignKeySummaryColumns,
  scanMigrations,
} from '../../../scripts/lint/summary-column-derivation-lint.mjs';

describe('summary-column-derivation-lint', () => {
  describe('findUndereivedBooleanColumns (predicate a)', () => {
    it('flags a new undereived boolean *_passed column (TS-4/original ask)', () => {
      const sql = 'ALTER TABLE widgets ADD COLUMN widget_passed boolean NOT NULL DEFAULT false;';
      const found = findUndereivedBooleanColumns(sql);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ table: 'widgets', column: 'widget_passed', hasGenerated: false });
    });

    it('passes a GENERATED ALWAYS boolean column (TS-5)', () => {
      const sql = 'ALTER TABLE widgets ADD COLUMN widget_verified boolean GENERATED ALWAYS AS (status = \'ok\') STORED;';
      expect(findUndereivedBooleanColumns(sql)).toHaveLength(0);
    });

    it('does not retroactively fail on the 7 baseline column names (TS-5)', () => {
      for (const col of BASELINE_BOOLEAN_COLUMNS) {
        const sql = `ALTER TABLE some_table ADD COLUMN ${col} boolean NOT NULL DEFAULT false;`;
        expect(findUndereivedBooleanColumns(sql)).toHaveLength(0);
      }
    });

    it('ignores a boolean column whose name does not match the suffix heuristic', () => {
      const sql = 'ALTER TABLE widgets ADD COLUMN is_active boolean NOT NULL DEFAULT true;';
      expect(findUndereivedBooleanColumns(sql)).toHaveLength(0);
    });
  });

  describe('findUnpairedJsonbSummaryKeys (predicate b)', () => {
    it('flags a summary-shaped jsonb_set key with no paired CREATE TRIGGER (TS-4)', () => {
      const sql = 'UPDATE widgets SET metadata = jsonb_set(metadata, \'{evaluated}\', \'true\');';
      const found = findUnpairedJsonbSummaryKeys(sql);
      expect(found).toEqual([{ key: 'evaluated', mechanism: 'jsonb_set' }]);
    });

    it('flags a summary-shaped jsonb_build_object key with no paired trigger', () => {
      const sql = 'UPDATE widgets SET metadata = metadata || jsonb_build_object(\'verdict\', \'PASS\');';
      const found = findUnpairedJsonbSummaryKeys(sql);
      expect(found).toEqual([{ key: 'verdict', mechanism: 'jsonb_build_object' }]);
    });

    it('passes when a CREATE TRIGGER exists anywhere in the same file (TS-5)', () => {
      const sql = `
        UPDATE widgets SET metadata = jsonb_set(metadata, '{evaluated}', 'true');
        CREATE TRIGGER trg_derive_evaluated BEFORE INSERT OR UPDATE ON widgets
        FOR EACH ROW EXECUTE FUNCTION derive_evaluated();
      `;
      expect(findUnpairedJsonbSummaryKeys(sql)).toHaveLength(0);
    });

    it('ignores a jsonb key write that does not match the summary-name heuristic', () => {
      const sql = 'UPDATE widgets SET metadata = jsonb_set(metadata, \'{description}\', \'"hello"\');';
      expect(findUnpairedJsonbSummaryKeys(sql)).toHaveLength(0);
    });

    it('ignores jsonb_build_object inside an INSERT INTO ... VALUES (audit-log row, not a persisted summary column)', () => {
      // MEDIUM-3 (EXEC-phase TESTING, evidence cf40b474): an earlier version of this
      // detector matched jsonb_build_object() regardless of statement shape, firing
      // 10/10 false-positive on real audit-log/history-table inserts.
      const sql = `
        INSERT INTO audit_log (event, payload)
        VALUES ('status_change', jsonb_build_object('status', 'accepted', 'verdict', 'PASS'));
      `;
      expect(findUnpairedJsonbSummaryKeys(sql)).toHaveLength(0);
    });
  });

  describe('findForeignKeySummaryColumns (predicate c, manual review only)', () => {
    it('flags a new FK column with a summary-shaped name (TS-5b)', () => {
      const sql = 'ALTER TABLE widgets ADD COLUMN parent_status_id uuid REFERENCES parents(id);';
      const found = findForeignKeySummaryColumns(sql);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ table: 'widgets', column: 'parent_status_id' });
    });

    it('ignores an FK column whose name is not summary-shaped', () => {
      const sql = 'ALTER TABLE widgets ADD COLUMN parent_id uuid REFERENCES parents(id);';
      expect(findForeignKeySummaryColumns(sql)).toHaveLength(0);
    });

    it('ignores a summary-shaped column that is not a foreign key', () => {
      const sql = 'ALTER TABLE widgets ADD COLUMN gate_status text;';
      expect(findForeignKeySummaryColumns(sql)).toHaveLength(0);
    });
  });

  describe('scanMigrations (recursive scan)', () => {
    let tmpDir;

    afterEach(() => {
      if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    });

    it('scans .sql files in subdirectories, not just the top level (SECURITY evidence 62384ee7)', () => {
      // The CI workflow triggers on database/migrations/**/*.sql (recursive); an
      // earlier version of the scanner used a non-recursive readdirSync, silently
      // missing a real, populated subdirectory (database/migrations/rollback/)
      // while still showing a green check for a PR touching only that path.
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'summary-lint-test-'));
      fs.mkdirSync(path.join(tmpDir, 'rollback'));
      fs.writeFileSync(
        path.join(tmpDir, 'rollback', 'nested.sql'),
        'ALTER TABLE widgets ADD COLUMN widget_passed boolean NOT NULL DEFAULT false;'
      );
      const results = scanMigrations(tmpDir);
      expect(results.some((r) => r.file.includes('nested.sql'))).toBe(true);
    });
  });
});
