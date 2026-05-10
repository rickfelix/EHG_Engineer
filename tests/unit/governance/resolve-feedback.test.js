// SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001 FR-1 unit tests for lib/governance/resolve-feedback.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveFeedback, parseFeedbackFooters } from '../../../lib/governance/resolve-feedback.js';

const VALID_UUID_1 = '6639e063-b269-4dd0-bfef-fabd8ef0fc09';
const VALID_UUID_2 = '8ccd01b1-5e60-4c79-8280-20967e515580';

function makeMockSupabase({ updateRows = [], updateError = null } = {}) {
  const mock = {
    _captured: { table: null, update: null, eqs: [], neq: null, select: null },
    from(table) {
      mock._captured.table = table;
      return mock;
    },
    update(payload) {
      mock._captured.update = payload;
      return mock;
    },
    eq(column, value) {
      mock._captured.eqs.push({ column, value });
      return mock;
    },
    neq(column, value) {
      mock._captured.neq = { column, value };
      return mock;
    },
    select(cols) {
      mock._captured.select = cols;
      return Promise.resolve({ data: updateRows, error: updateError });
    },
  };
  return mock;
}

describe('parseFeedbackFooters', () => {
  it('parses single "Closes feedback <uuid>" footer', () => {
    const text = `fix(QF-X): some title\n\nBody.\n\nCloses feedback ${VALID_UUID_1}\n`;
    expect(parseFeedbackFooters(text)).toEqual([VALID_UUID_1]);
  });

  it('parses single "Closes harness backlog <uuid>" footer (alternate verb)', () => {
    const text = `body line\n\nCloses harness backlog ${VALID_UUID_1}\n`;
    expect(parseFeedbackFooters(text)).toEqual([VALID_UUID_1]);
  });

  it('parses multiple footers in one body and dedupes', () => {
    const text = `Closes feedback ${VALID_UUID_1}\nMore text.\nCloses harness backlog ${VALID_UUID_2}\nCloses feedback ${VALID_UUID_1}\n`;
    expect(parseFeedbackFooters(text)).toEqual([VALID_UUID_1, VALID_UUID_2]);
  });

  it('rejects malformed UUID (too short)', () => {
    const text = `Closes feedback abcd-1234\n`;
    expect(parseFeedbackFooters(text)).toEqual([]);
  });

  it('rejects mid-line "Closes feedback" reference (must be at line start)', () => {
    const text = `something something Closes feedback ${VALID_UUID_1} not a real footer`;
    // Trailing words after the UUID violate the strict end-of-line shape
    expect(parseFeedbackFooters(text)).toEqual([]);
  });

  it('handles tabs/spaces around the footer', () => {
    const text = `\t  Closes feedback ${VALID_UUID_1}  \t\n`;
    expect(parseFeedbackFooters(text)).toEqual([VALID_UUID_1]);
  });

  it('returns [] for empty/null/non-string input', () => {
    expect(parseFeedbackFooters('')).toEqual([]);
    expect(parseFeedbackFooters(null)).toEqual([]);
    expect(parseFeedbackFooters(undefined)).toEqual([]);
    expect(parseFeedbackFooters(123)).toEqual([]);
  });

  it('is case-insensitive on the verb', () => {
    const text = `closes Feedback ${VALID_UUID_1}\nCLOSES HARNESS BACKLOG ${VALID_UUID_2}\n`;
    expect(parseFeedbackFooters(text)).toEqual([VALID_UUID_1, VALID_UUID_2]);
  });
});

describe('resolveFeedback', () => {
  it('returns { updated: true, id } when the UPDATE matched a non-resolved row', async () => {
    const sb = makeMockSupabase({ updateRows: [{ id: VALID_UUID_1 }] });
    const result = await resolveFeedback({ supabase: sb, feedbackId: VALID_UUID_1, quickFixId: 'QF-X', notes: 'ship via QF-X' });
    expect(result).toEqual({ updated: true, id: VALID_UUID_1 });
    expect(sb._captured.table).toBe('feedback');
    expect(sb._captured.update.status).toBe('resolved');
    expect(sb._captured.update.quick_fix_id).toBe('QF-X');
    expect(sb._captured.update.resolution_notes).toBe('ship via QF-X');
    expect(sb._captured.neq).toEqual({ column: 'status', value: 'resolved' });
  });

  it('returns idempotent {updated:false, reason:"no_row_or_already_resolved"} when zero rows match', async () => {
    const sb = makeMockSupabase({ updateRows: [] });
    const result = await resolveFeedback({ supabase: sb, feedbackId: VALID_UUID_1 });
    expect(result.updated).toBe(false);
    expect(result.reason).toBe('no_row_or_already_resolved');
    expect(result.error).toBeUndefined();
  });

  it('returns {updated:false, error} on DB error (does not throw)', async () => {
    const sb = makeMockSupabase({ updateError: { message: 'connection refused' } });
    const result = await resolveFeedback({ supabase: sb, feedbackId: VALID_UUID_1 });
    expect(result.updated).toBe(false);
    expect(result.error).toBe('connection refused');
  });

  it('rejects malformed feedbackId', async () => {
    const sb = makeMockSupabase();
    const result = await resolveFeedback({ supabase: sb, feedbackId: 'not-a-uuid' });
    expect(result.updated).toBe(false);
    expect(result.error).toBe('invalid_feedback_id');
    expect(sb._captured.table).toBeNull();
  });

  it('rejects missing supabase', async () => {
    const result = await resolveFeedback({ feedbackId: VALID_UUID_1 });
    expect(result.updated).toBe(false);
    expect(result.error).toBe('no_supabase');
  });

  it('rejects missing feedbackId', async () => {
    const sb = makeMockSupabase();
    const result = await resolveFeedback({ supabase: sb });
    expect(result.updated).toBe(false);
    expect(result.error).toBe('no_feedback_id');
  });

  it('does NOT add quick_fix_id / resolution_sd_id / resolution_notes when not supplied', async () => {
    const sb = makeMockSupabase({ updateRows: [{ id: VALID_UUID_1 }] });
    await resolveFeedback({ supabase: sb, feedbackId: VALID_UUID_1 });
    expect(sb._captured.update.quick_fix_id).toBeUndefined();
    expect(sb._captured.update.resolution_sd_id).toBeUndefined();
    expect(sb._captured.update.resolution_notes).toBeUndefined();
    expect(sb._captured.update.status).toBe('resolved');
    expect(sb._captured.update.resolved_at).toBeDefined();
  });
});
