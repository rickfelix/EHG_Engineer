/**
 * QF-20260502-pg-stmt-splitter
 *
 * splitPostgreSQLStatements (scripts/lib/supabase-connection.js) used to track
 * only $$ delimiters, so a `;` inside a `--` line comment or a `'...;...'`
 * literal terminated the statement and broke migration apply (rejected as
 * 42601 syntax error). Workaround was to drop the splitter and ship the whole
 * file as one client.query(), which defeated its purpose.
 *
 * Behaviour now under test:
 *   - basic semicolon split
 *   - `--` line comments (inline at end of statement, on their own line, with embedded `;`)
 *   - `/* * /` block comments (multi-line, with embedded `;`)
 *   - single-quoted string literals (with embedded `;`, with `''` escape)
 *   - dollar-quoted function bodies (existing behaviour preserved)
 *   - leading / trailing whitespace, comment-only segments
 */
import { describe, it, expect } from 'vitest';
import { splitPostgreSQLStatements } from '../../scripts/lib/supabase-connection.js';

describe('splitPostgreSQLStatements', () => {
  it('splits two simple statements on a top-level semicolon', () => {
    const stmts = splitPostgreSQLStatements(
      'CREATE TABLE a (id int);\nCREATE TABLE b (id int);'
    );
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain('CREATE TABLE a');
    expect(stmts[1]).toContain('CREATE TABLE b');
  });

  it('does NOT split on `;` inside a single-line `--` comment', () => {
    // The original bug: the inline comment's `;` terminated the SELECT prematurely.
    const sql = 'SELECT 1 -- pretend ; ends here\n  AS one;\nSELECT 2;';
    const stmts = splitPostgreSQLStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain('SELECT 1');
    expect(stmts[0]).toContain('AS one');
    expect(stmts[1]).toContain('SELECT 2');
  });

  it('does NOT split on `;` inside a /* block */ comment that spans lines', () => {
    const sql = 'SELECT 1\n/* block ; with semicolon\n  spanning lines ; here */\n  AS one;';
    const stmts = splitPostgreSQLStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toContain('SELECT 1');
    expect(stmts[0]).toContain('AS one');
  });

  it('does NOT split on `;` inside single-quoted string literals', () => {
    const sql = 'INSERT INTO t (msg) VALUES (\'hello;world\');\nSELECT 1;';
    const stmts = splitPostgreSQLStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain("'hello;world'");
    expect(stmts[1]).toContain('SELECT 1');
  });

  it("handles SQL '' escape inside a single-quoted literal without re-entering quote", () => {
    // 'it''s ok; really' is a single literal — the inner ;` must NOT split.
    const sql = 'INSERT INTO t (msg) VALUES (\'it\'\'s ok; really\');\nSELECT 2;';
    const stmts = splitPostgreSQLStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain("'it''s ok; really'");
    expect(stmts[1]).toContain('SELECT 2');
  });

  it('preserves prior $$ behaviour: function body with internal `;` is one statement', () => {
    const sql = `CREATE OR REPLACE FUNCTION f() RETURNS void AS $$
BEGIN
  PERFORM 1;
  PERFORM 2;
END;
$$ LANGUAGE plpgsql;
SELECT 99;`;
    const stmts = splitPostgreSQLStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain('CREATE OR REPLACE FUNCTION');
    expect(stmts[0]).toContain('END;');
    expect(stmts[1]).toContain('SELECT 99');
  });

  it('drops comment-only segments (no SQL after stripping `--` lines)', () => {
    const sql = '-- header comment\n-- another comment\n;\nSELECT 1;';
    const stmts = splitPostgreSQLStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toContain('SELECT 1');
  });

  it('handles real-world COMMENT ON ... IS literal with embedded semicolon', () => {
    // PostgreSQL COMMENT statements often embed semicolons in the literal body.
    const sql = 'COMMENT ON COLUMN t.col IS \'See: trigger fires; row updated\';\nALTER TABLE t ADD COLUMN c2 int;';
    const stmts = splitPostgreSQLStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain("'See: trigger fires; row updated'");
    expect(stmts[1]).toContain('ALTER TABLE t');
  });

  it('returns empty array for empty / whitespace input', () => {
    expect(splitPostgreSQLStatements('')).toEqual([]);
    expect(splitPostgreSQLStatements('   \n  \n')).toEqual([]);
  });

  it('handles a final statement without trailing `;`', () => {
    const stmts = splitPostgreSQLStatements('SELECT 1;\nSELECT 2');
    expect(stmts).toHaveLength(2);
    expect(stmts[1]).toContain('SELECT 2');
  });
});
