// SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001 FR-1 unit tests for lib/governance/resolve-feedback.js
// QF-20260511-556: parseAndExpandFeedbackFooters short-UUID acceptance.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveFeedback, parseFeedbackFooters, parseAndExpandFeedbackFooters } from '../../../lib/governance/resolve-feedback.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RESOLVE_FB_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../../lib/governance/resolve-feedback.js'),
  'utf-8'
);

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

// QF-20260511-556: short-UUID prefix expansion via DB lookup
function makeLookupSupabase({ rowsByRange = {}, error = null } = {}) {
  const calls = [];
  const builder = (rows) => {
    const chain = {
      _table: null,
      _gte: null,
      _lte: null,
      from(t) { chain._table = t; return chain; },
      select() { return chain; },
      gte(c, v) { chain._gte = { c, v }; return chain; },
      lte(c, v) { chain._lte = { c, v }; return chain; },
      limit() { return Promise.resolve({ data: rows, error }); },
    };
    return chain;
  };
  return {
    from(table) {
      const c = builder(null);
      c.from(table);
      const origGte = c.gte.bind(c);
      c.gte = (col, val) => {
        origGte(col, val);
        calls.push({ table, gte: val });
        // Pull rows by gte-prefix key (8-char head)
        const head = val.slice(0, 8);
        const rows = rowsByRange[head] || [];
        const r = builder(rows);
        r._table = table;
        return r;
      };
      return c;
    },
    _calls: calls,
  };
}

describe('parseAndExpandFeedbackFooters', () => {
  it('passes through full 36-char UUIDs without DB lookup', async () => {
    const sb = makeLookupSupabase({});
    const text = `Closes feedback ${VALID_UUID_1}\nCloses harness backlog ${VALID_UUID_2}\n`;
    const result = await parseAndExpandFeedbackFooters({ text, supabase: sb });
    expect(result.uuids).toEqual([VALID_UUID_1, VALID_UUID_2]);
    expect(result.warnings).toEqual([]);
    expect(sb._calls.length).toBe(0);
  });

  it('expands an 8-char short ID with a unique DB match', async () => {
    const sb = makeLookupSupabase({ rowsByRange: { 'acd4e5ab': [{ id: 'acd4e5ab-1111-2222-3333-444444444444' }] } });
    const text = `body\n\nCloses feedback acd4e5ab\n`;
    const result = await parseAndExpandFeedbackFooters({ text, supabase: sb });
    expect(result.uuids).toEqual(['acd4e5ab-1111-2222-3333-444444444444']);
    expect(result.warnings).toEqual([]);
  });

  it('warn-skips ambiguous (>=2 matches) short ID', async () => {
    const sb = makeLookupSupabase({
      rowsByRange: { '12345678': [
        { id: '12345678-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
        { id: '12345678-bbbb-bbbb-bbbb-bbbbbbbbbbbb' },
      ] },
    });
    const text = `Closes feedback 12345678\n`;
    const result = await parseAndExpandFeedbackFooters({ text, supabase: sb });
    expect(result.uuids).toEqual([]);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toMatch(/12345678/);
    expect(result.warnings[0]).toMatch(/ambiguous/i);
  });

  it('warn-skips short ID with no match', async () => {
    const sb = makeLookupSupabase({});
    const text = `Closes feedback deadbeef\n`;
    const result = await parseAndExpandFeedbackFooters({ text, supabase: sb });
    expect(result.uuids).toEqual([]);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toMatch(/deadbeef/);
    expect(result.warnings[0]).toMatch(/no match/i);
  });

  it('merges full + short, deduping when short expands to a full already present', async () => {
    const headOfFull = VALID_UUID_1.slice(0, 8);
    const sb = makeLookupSupabase({ rowsByRange: { [headOfFull]: [{ id: VALID_UUID_1 }] } });
    const text = `Closes feedback ${VALID_UUID_1}\nCloses harness backlog ${headOfFull}\n`;
    const result = await parseAndExpandFeedbackFooters({ text, supabase: sb });
    expect(result.uuids).toEqual([VALID_UUID_1]);
    expect(result.warnings).toEqual([]);
  });

  it('silently drops non-hex / wrong-length tokens (e.g. 7-char, 12-char no-dashes)', async () => {
    const sb = makeLookupSupabase({});
    const text = `Closes feedback abcdef0\nCloses feedback abcdef0123ab\nCloses feedback zzzzzzzz\n`;
    const result = await parseAndExpandFeedbackFooters({ text, supabase: sb });
    expect(result.uuids).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('returns warning if short IDs are present but no supabase is supplied', async () => {
    const text = `Closes feedback acd4e5ab\n`;
    const result = await parseAndExpandFeedbackFooters({ text });
    expect(result.uuids).toEqual([]);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toMatch(/no supabase/i);
  });

  it('returns empty + no warnings for empty/null input', async () => {
    expect(await parseAndExpandFeedbackFooters({ text: '', supabase: null })).toEqual({ uuids: [], warnings: [] });
    expect(await parseAndExpandFeedbackFooters({ text: null, supabase: null })).toEqual({ uuids: [], warnings: [] });
    expect(await parseAndExpandFeedbackFooters({})).toEqual({ uuids: [], warnings: [] });
  });
});

// Static-pin regression: lock in the contracts so future drift is caught.
describe('resolve-feedback.js static-pin', () => {
  it('UUID_REGEX matches canonical UUID v1-5 shape (36 chars, dashed)', () => {
    expect(RESOLVE_FB_SRC).toMatch(/^const UUID_REGEX = \/\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$\/i;$/m);
  });

  it('SHORT_ID_REGEX matches exactly 8 hex chars (matches /leo inbox display format)', () => {
    expect(RESOLVE_FB_SRC).toMatch(/^const SHORT_ID_REGEX = \/\^\[0-9a-f\]\{8\}\$\/i;$/m);
  });

  it('FOOTER_REGEX_LOOSE accepts 8-36 char hex-and-dash payloads', () => {
    expect(RESOLVE_FB_SRC).toMatch(/^const FOOTER_REGEX_LOOSE = \/\^\[ \\t\]\*Closes\\s\+\(\?:feedback\|harness\\s\+backlog\)\\s\+\(\[0-9a-f\]\[0-9a-f-\]\{7,35\}\)\[ \\t\]\*\$\/gim;$/m);
  });

  it('UUID range bounds use canonical "0000-0000-0000-000000000000" / "ffff-ffff-ffff-ffffffffffff" tails', () => {
    expect(RESOLVE_FB_SRC).toMatch(/`\$\{prefix\}-0000-0000-0000-000000000000`/);
    expect(RESOLVE_FB_SRC).toMatch(/`\$\{prefix\}-ffff-ffff-ffff-ffffffffffff`/);
  });

  it('expand path uses .gte() / .lte() / .limit(2) on the feedback table (NOT LIKE — uuid columns reject LIKE)', () => {
    expect(RESOLVE_FB_SRC).toMatch(/\.from\(['"]feedback['"]\)[\s\S]*?\.gte\(['"]id['"], lo\)[\s\S]*?\.lte\(['"]id['"], hi\)[\s\S]*?\.limit\(2\)/);
    expect(RESOLVE_FB_SRC).not.toMatch(/\.like\(['"]id['"]/);
    expect(RESOLVE_FB_SRC).not.toMatch(/\.ilike\(['"]id['"]/);
  });

  it('parseAndExpandFeedbackFooters is exported alongside backward-compat parseFeedbackFooters', () => {
    expect(RESOLVE_FB_SRC).toMatch(/^export async function parseAndExpandFeedbackFooters/m);
    expect(RESOLVE_FB_SRC).toMatch(/^export function parseFeedbackFooters/m);
    expect(RESOLVE_FB_SRC).toMatch(/parseFeedbackFooters,\s*parseAndExpandFeedbackFooters,\s*resolveFeedback/);
  });
});
