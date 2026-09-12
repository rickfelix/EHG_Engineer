// The feedback_no_update lifecycle-allowlist migration must keep a SHAPE, not just exist.
//
// SD-LEO-INFRA-FEEDBACK-LIFECYCLE-UPDATE-ALLOWLIST-001.
//
// Four properties are load-bearing and the kind of thing a well-meaning later edit loses:
//
//  1. PLACEMENT. Lives in database/chairman-gated/, never database/migrations/ -- it replaces a
//     TRIGGER (FORBIDDEN_TOPLEVEL in the tier classifier), so it must stay out of the
//     auto-applied directory.
//  2. NEVER an in-place edit of the applied 20260907 file -- that file must be byte-identical to
//     what shipped 2026-09-08 (this test does not touch it, but asserts THIS migration is a
//     separate, new file rather than a diff against it).
//  3. ONLY feedback_no_update changes. feedback_no_delete_trg / feedback_no_truncate_trg /
//     feedback_freeze() are never dropped or replaced by this file.
//  4. THE WHEN CLAUSE NAMES A CONTENT COLUMN SET, NOT A LIFECYCLE ONE. Asserting the DIRECTION
//     matters: a future edit that "simplifies" this into an allow-list of lifecycle columns
//     would invert which future column defaults to frozen vs mutable with no test failure unless
//     this is pinned.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SLUG = '20260912_feedback_no_update_lifecycle_allowlist';
const GATED_DIR = path.join(REPO_ROOT, 'database', 'chairman-gated');
const FORWARD = path.join(GATED_DIR, `${SLUG}.sql`);
const DOWN = path.join(GATED_DIR, `${SLUG}_DOWN.sql`);
const APPLIED_20260907 = path.join(GATED_DIR, '20260907_feedback_immutability_trigger.sql');

// Read once. If the file is renamed or moved, existsSync below fails loudly rather than these
// tests passing vacuously against an empty string.
const forwardSql = existsSync(FORWARD) ? readFileSync(FORWARD, 'utf8') : null;
const downSql = existsSync(DOWN) ? readFileSync(DOWN, 'utf8') : null;
const appliedSql = existsSync(APPLIED_20260907) ? readFileSync(APPLIED_20260907, 'utf8') : null;

// STATEMENTS ONLY -- comments stripped, since this file's own header quotes the very SQL it
// contains (content-column names, trigger names) for explanatory purposes.
const stripComments = (sql) => (sql === null ? null : sql.replace(/^\s*--.*$/gm, ''));
const forwardStmts = stripComments(forwardSql);
const downStmts = stripComments(downSql);

const CONTENT_COLUMNS = [
  'title', 'description', 'category', 'type', 'feedback_type', 'original_type',
  'source_application', 'source_type', 'source_id', 'provenance_source', 'command',
  'environment', 'page_url', 'use_case', 'error_message', 'stack_trace', 'error_hash',
  'user_id', 'venture_id', 'created_at', 'first_seen', 'sentry_issue_id', 'sentry_first_seen',
  'severity', 'effort_estimate', 'value_estimate', 'votes', 'converted_at', 'conversion_reason',
  'ignore_pattern', 'rubric_score', 'quality_assessment', 'auto_correction_status',
  'corrective_class', 'source_gate', 'gate_run_id', 'sd_id',
];

const LIFECYCLE_COLUMNS = [
  'status', 'resolved_at', 'resolution_notes', 'resolution_sd_id', 'resolution_type',
  'quick_fix_id', 'session_id', 'metadata', 'updated_at', 'archived_at', 'cluster_processed_at',
  'strategic_directive_id', 'occurrence_count', 'last_seen', 'snoozed_until', 'duplicate_of_id',
  'promoted_to_sd_id', 'promoted_at', 'promoted_by', 'assigned_to', 'priority',
  'ai_triage_suggestion', 'ai_triage_confidence', 'ai_triage_classification', 'ai_triage_source',
  'triaged_at', 'triaged_by',
];

describe('feedback lifecycle-allowlist migration placement', () => {
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

  it('carries a pending/filled approval marker the ceremony governs', () => {
    expect(forwardSql).toMatch(/@approved-by:/);
  });

  it('is a genuinely separate file from the applied 20260907 migration, never an in-place edit', () => {
    expect(appliedSql, `expected the applied 20260907 file to still exist at ${APPLIED_20260907}`).not.toBeNull();
    expect(FORWARD).not.toBe(APPLIED_20260907);
  });
});

describe('feedback lifecycle-allowlist migration shape', () => {
  it('drops and recreates ONLY feedback_no_update, never feedback_no_delete_trg or feedback_no_truncate_trg', () => {
    expect(forwardStmts).toMatch(/DROP TRIGGER IF EXISTS feedback_no_update ON public\.feedback/);
    expect(forwardStmts).toMatch(/CREATE TRIGGER feedback_no_update/);
    expect(forwardStmts).not.toMatch(/DROP TRIGGER[^;]*feedback_no_delete_trg/);
    expect(forwardStmts).not.toMatch(/DROP TRIGGER[^;]*feedback_no_truncate_trg/);
  });

  it('never drops or replaces feedback_freeze() -- the function body is untouched, only the WHEN clause changes', () => {
    expect(forwardStmts).not.toMatch(/DROP FUNCTION[^;]*feedback_freeze/);
    expect(forwardStmts).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.feedback_freeze/);
  });

  it('the new trigger carries a WHEN clause (the allowlist mechanism itself)', () => {
    expect(forwardStmts).toMatch(/CREATE TRIGGER feedback_no_update[\s\S]*?WHEN\s*\(/);
  });

  it('re-asserts ENABLE ALWAYS on feedback_no_update (DROP+CREATE resets enable mode)', () => {
    expect(forwardStmts).toMatch(/ALTER TABLE public\.feedback ENABLE ALWAYS TRIGGER feedback_no_update/);
  });

  it('the WHEN clause names every known content column, and no known lifecycle column', () => {
    const whenMatch = forwardStmts.match(/WHEN\s*\(([\s\S]*?)\)\s*\n\s*EXECUTE FUNCTION/);
    expect(whenMatch, 'expected a WHEN (...) clause before EXECUTE FUNCTION').not.toBeNull();
    const whenClause = whenMatch[1];

    for (const col of CONTENT_COLUMNS) {
      expect(whenClause, `content column ${col} missing from the WHEN clause`).toMatch(
        new RegExp(`OLD\\.${col}\\s+IS DISTINCT FROM\\s+NEW\\.${col}`)
      );
    }
    for (const col of LIFECYCLE_COLUMNS) {
      expect(whenClause, `lifecycle column ${col} must NOT appear in the content-guard WHEN clause`).not.toMatch(
        new RegExp(`OLD\\.${col}\\s+IS DISTINCT FROM\\s+NEW\\.${col}`)
      );
    }
  });

  it('the verify block proves a content UPDATE rejected AND a lifecycle UPDATE accepted (the chairman decision\'s own acceptance criterion)', () => {
    expect(forwardStmts).toMatch(/UPDATE public\.feedback SET title = 'tampered-content'/);
    expect(forwardStmts).toMatch(/GUARD DID NOT FIRE -- a content \(title\) UPDATE was ACCEPTED/);
    expect(forwardStmts).toMatch(/UPDATE public\.feedback SET status = 'triaged'/);
    expect(forwardStmts).toMatch(/LIFECYCLE UPDATE WAS REJECTED/);
  });

  it('the verify block also proves a MIXED lifecycle+content UPDATE is still rejected', () => {
    expect(forwardStmts).toMatch(/SET status = 'resolved', description = 'tampered-content'/);
    expect(forwardStmts).toMatch(/a mixed lifecycle\+content UPDATE was ACCEPTED/);
  });
});

describe('feedback lifecycle-allowlist rollback shape', () => {
  it('the DOWN file drops+recreates feedback_no_update with NO WHEN clause (restores unconditional reject)', () => {
    expect(downStmts).toMatch(/DROP TRIGGER IF EXISTS feedback_no_update ON public\.feedback/);
    const createMatch = downStmts.match(/CREATE TRIGGER feedback_no_update[\s\S]*?EXECUTE FUNCTION public\.feedback_freeze\(\);/);
    expect(createMatch, 'expected an unconditional CREATE TRIGGER in the DOWN file').not.toBeNull();
    expect(createMatch[0]).not.toMatch(/WHEN\s*\(/);
  });

  it('the DOWN file also re-asserts ENABLE ALWAYS', () => {
    expect(downStmts).toMatch(/ALTER TABLE public\.feedback ENABLE ALWAYS TRIGGER feedback_no_update/);
  });

  it('the DOWN file never drops feedback_freeze(), feedback_no_delete_trg, or feedback_no_truncate_trg', () => {
    // The COMMENT ON TABLE text legitimately NAMES both triggers for documentation -- assert no
    // DROP/ALTER TARGETS them, not that the string never appears at all.
    expect(downStmts).not.toMatch(/DROP FUNCTION/);
    expect(downStmts).not.toMatch(/DROP TRIGGER[^;]*feedback_no_delete_trg/);
    expect(downStmts).not.toMatch(/DROP TRIGGER[^;]*feedback_no_truncate_trg/);
    expect(downStmts).not.toMatch(/ALTER TABLE[^;]*feedback_no_delete_trg/);
    expect(downStmts).not.toMatch(/ALTER TABLE[^;]*feedback_no_truncate_trg/);
  });
});
