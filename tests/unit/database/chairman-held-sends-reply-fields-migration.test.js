/**
 * SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-3, AC-1) — TESTING sub-agent finding G2 (MEDIUM):
 * FR-3's acceptance criterion explicitly names a unit-tier static assertion over the migration SQL
 * text as the PRIMARY proof (information_schema/db-tier checks are optional, since CI does not run
 * against a live production database). Nothing in the committed suite referenced the migration file
 * at all. This asserts, over the literal SQL text, on disk, at unit tier:
 *   - the three columns are added via ADD COLUMN IF NOT EXISTS,
 *   - each is `text` (matching lint.js's message.replyInstruction/replyId/noReplyConsequence,
 *     which are plain strings),
 *   - none carries NOT NULL, a DEFAULT expression, or a CHECK constraint (nullable/additive-only,
 *     per the migration delegation classifier's self-applicable Rule C),
 *   - reply_id is SINGULAR (not reply_ids) -- the naming-mismatch defect this FR exists to close.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = path.resolve(__dirname, '../../../database/migrations/20260826_chairman_held_sends_reply_fields.sql');
const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('20260826_chairman_held_sends_reply_fields.sql (FR-3 AC-1, unit-tier static assertion)', () => {
  it('adds reply_instruction as a nullable text column via ADD COLUMN IF NOT EXISTS', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS reply_instruction text\b/i);
  });

  it('adds reply_id (SINGULAR) as a nullable text column -- never the plural reply_ids', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS reply_id text\b/i);
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS reply_ids\b/i);
  });

  it('adds no_reply_consequence as a nullable text column', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS no_reply_consequence text\b/i);
  });

  it('the ALTER TABLE statement carries no NOT NULL, DEFAULT, or CHECK qualifier on any of the 3 columns -- additive-only per the migration delegation classifier', () => {
    const alterMatch = sql.match(/ALTER TABLE public\.chairman_held_sends\s+([\s\S]*?);/i);
    expect(alterMatch).toBeTruthy();
    const alterBody = alterMatch[1];
    expect(alterBody).not.toMatch(/not\s+null/i);
    expect(alterBody).not.toMatch(/\bdefault\b/i);
    expect(alterBody).not.toMatch(/\bcheck\b/i);
    expect(alterBody).not.toMatch(/\bconstraint\b/i);
  });

  it('targets public.chairman_held_sends, not a different table', () => {
    expect(sql).toMatch(/ALTER TABLE public\.chairman_held_sends\b/i);
  });
});
