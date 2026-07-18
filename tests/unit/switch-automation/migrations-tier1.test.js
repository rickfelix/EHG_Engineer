/**
 * SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C: TS-5 -- both new migrations are
 * additive-only (no ALTER/DROP TABLE/GRANT/REVOKE), confirming TIER-1 auto-apply
 * eligibility per the tiered migration classifier's allow-list rules.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = [
  'database/migrations/20260718_switchon_auto_actions.sql',
  'database/migrations/20260718_switchon_decision_audit.sql',
];

describe('TS-5: new migrations are TIER-1-eligible (additive-only)', () => {
  for (const rel of MIGRATIONS) {
    it(`${rel} contains only TIER-1-eligible ALTER TABLE usage (ENABLE ROW LEVEL SECURITY), no DROP TABLE / GRANT / REVOKE`, () => {
      const raw = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
      // Strip SQL line-comments before checking statements -- the file's own doc
      // comments legitimately mention ALTER/DROP/GRANT/REVOKE in prose, which must not
      // false-positive this static check.
      // [-D fix, pre-existing bug] `.` never matches \r (a JS line-terminator char for
      // regex purposes), so on a CRLF file `--.*$` couldn't consume a line's trailing \r
      // and silently failed to match at all, leaving GRANT/REVOKE-mentioning comment
      // prose unstripped. Match everything up to (not including) any CR/LF instead.
      const sql = raw.split('\n').map((line) => line.replace(/--[^\r\n]*/, '')).join('\n');
      // Every ALTER TABLE statement present must be the additive "ENABLE ROW LEVEL
      // SECURITY" form (CLAUDE_CORE.md's own TIER-1 allow-list) -- never ALTER COLUMN,
      // DROP COLUMN, RENAME, etc.
      const alterStatements = sql.match(/ALTER TABLE[^;]*;/gi) || [];
      for (const stmt of alterStatements) {
        expect(stmt).toMatch(/ENABLE ROW LEVEL SECURITY/i);
      }
      expect(sql).not.toMatch(/\bDROP TABLE\b/i);
      expect(sql).not.toMatch(/\bGRANT\b/i);
      expect(sql).not.toMatch(/\bREVOKE\b/i);
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS/i);
      expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    });
  }
});
