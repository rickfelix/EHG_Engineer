// SD-FDBK-INFRA-LAYER-SIDE-CLAIMING-001 FR-7: SQL static-guard for Layer 1
// claiming_session_id release parity. Pins ALL release sites in the new
// migration to clear BOTH active_session_id AND claiming_session_id.
//
// Closes feedback 64e40594. 11th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const migrationFile = path.join(repoRoot, 'database/migrations/20260509_layer1_claiming_session_id_release_parity.sql');

describe('SD-LAYER-SIDE-CLAIMING-001 FR-7: SQL static-guard for claim-release parity', () => {
  let sql;
  beforeAll(() => {
    sql = fs.readFileSync(migrationFile, 'utf-8');
  });

  it('migration file starts with BEGIN; (line-leading)', () => {
    // First non-comment line should be BEGIN; — pre-commit hook STAGE 0.7 enforces this
    const firstNonCommentLine = sql.split('\n').find(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('--');
    });
    expect(firstNonCommentLine).toMatch(/^BEGIN;/);
  });

  it('migration file ends with COMMIT; (line-leading)', () => {
    // Last non-empty non-comment line should be COMMIT;
    const lines = sql.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('--'));
    const last = lines[lines.length - 1];
    expect(last).toMatch(/^COMMIT;/);
  });

  it('uses CREATE OR REPLACE FUNCTION (not DROP+CREATE) for atomicity + grant preservation', () => {
    // 4 actual function definitions (one per `CREATE OR REPLACE FUNCTION <name>(`)
    const definitions = (sql.match(/CREATE OR REPLACE FUNCTION \w+\(/g) || []).length;
    expect(definitions).toBe(4);
    // Negative-pin: no DROP FUNCTION should appear (would forfeit GRANTs)
    expect(sql).not.toMatch(/DROP FUNCTION/i);
  });

  it('all 4 expected functions are replaced', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION create_or_replace_session/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION release_session/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION cleanup_stale_sessions/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION report_pid_validation_failure/);
  });

  it('every UPDATE strategic_directives_v2 SET … includes claiming_session_id = NULL (parity)', () => {
    // Find every UPDATE strategic_directives_v2 block
    const updateBlocks = sql.match(/UPDATE strategic_directives_v2[\s\S]+?(?=;|WHERE)/g) || [];
    expect(updateBlocks.length).toBeGreaterThanOrEqual(4);
    for (const block of updateBlocks) {
      expect(block).toMatch(/active_session_id\s*=\s*NULL/);
      expect(block).toMatch(/claiming_session_id\s*=\s*NULL/);
      expect(block).toMatch(/is_working_on\s*=\s*false/);
    }
  });

  it('every WHERE clause for SD release matches BOTH columns (active_session_id OR claiming_session_id)', () => {
    // The WHERE clauses that follow strategic_directives_v2 UPDATEs should accept either link
    // Find each "WHERE" block immediately following an UPDATE strategic_directives_v2
    const fullUpdates = sql.match(/UPDATE strategic_directives_v2[\s\S]+?;/g) || [];
    expect(fullUpdates.length).toBeGreaterThanOrEqual(4);
    // At least 4 of them must scan both columns — covers FR-2/3/4/5
    const dualColumnUpdates = fullUpdates.filter(stmt =>
      /active_session_id\s*(?:=|IN)/.test(stmt) && /claiming_session_id\s*(?:=|IN)/.test(stmt)
    );
    expect(dualColumnUpdates.length).toBeGreaterThanOrEqual(4);
  });

  it('FR-5: report_pid_validation_failure has TWO UPDATEs in proper order (claude_sessions first, strategic_directives_v2 second)', () => {
    // Locate the function body
    const fnIdx = sql.indexOf('CREATE OR REPLACE FUNCTION report_pid_validation_failure');
    expect(fnIdx).toBeGreaterThan(0);
    // Body ends at the next $$ LANGUAGE
    const bodyEnd = sql.indexOf('$$ LANGUAGE plpgsql;', fnIdx);
    const body = sql.slice(fnIdx, bodyEnd);
    const claudeSessionsUpdateIdx = body.indexOf('UPDATE claude_sessions');
    const sdUpdateIdx = body.indexOf('UPDATE strategic_directives_v2');
    expect(claudeSessionsUpdateIdx).toBeGreaterThan(0);
    expect(sdUpdateIdx).toBeGreaterThan(claudeSessionsUpdateIdx); // SD second
  });

  it('FR-2: create_or_replace_session UPDATE filters by both columns via OR (not AND)', () => {
    const fnIdx = sql.indexOf('CREATE OR REPLACE FUNCTION create_or_replace_session');
    const bodyEnd = sql.indexOf('$$ LANGUAGE plpgsql;', fnIdx);
    const body = sql.slice(fnIdx, bodyEnd);
    // SD UPDATE must use OR (so a session linked via either column releases)
    const sdUpdate = body.match(/UPDATE strategic_directives_v2[\s\S]+?;/);
    expect(sdUpdate).not.toBeNull();
    expect(sdUpdate[0]).toMatch(/\bOR\b/);
  });

  it('LANGUAGE plpgsql preserved (no SECURITY clause regression)', () => {
    const lang = (sql.match(/\$\$ LANGUAGE plpgsql/g) || []).length;
    expect(lang).toBe(4);
  });
});
