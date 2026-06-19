// SD-LEO-INFRA-DISTILL-ARCHIVE-PATH-AND-YT-PROCESSED-001 — guards the three compounding bugs that
// silently stranded chairman-reviewed videos in the YouTube For-Processing playlist:
//   FR-1: the pipeline's archive step invoked scripts/eva-intake-archive.js but the file had been
//         relocated to scripts/archive/one-time/ (ENOENT) — restored to scripts/ so the path + its
//         ../lib import both resolve.
//   FR-2: postProcessYouTube had no status='processed' (reviewedItems) or orphan-recovery branch, so
//         a video the review step marked 'processed' could NEVER be picked up for the physical move.
//   FR-3: an archive failure was a soft warning that silently stranded items — now loud (::error::)
//         + durable (a feedback row via log-harness-bug.js), and the archive script exits non-zero.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

// --- FR-1: the archive script is restored to scripts/ and its ../lib import resolves --------------
describe('FR-1: archive script path + import resolve', () => {
  it('scripts/eva-intake-archive.js exists (restored from scripts/archive/one-time/)', () => {
    expect(existsSync(path.join(REPO_ROOT, 'scripts/eva-intake-archive.js'))).toBe(true);
    expect(existsSync(path.join(REPO_ROOT, 'scripts/archive/one-time/eva-intake-archive.js'))).toBe(false);
  });

  it("the script's ../lib/integrations/post-processor.js import resolves from scripts/", () => {
    const src = read('scripts/eva-intake-archive.js');
    const m = src.match(/import\(['"]([^'"]*post-processor\.js)['"]\)/);
    expect(m, 'expected a dynamic import of post-processor.js').toBeTruthy();
    const resolved = path.resolve(REPO_ROOT, 'scripts', m[1]); // relative to the script's dir = scripts/
    expect(resolved).toBe(path.join(REPO_ROOT, 'lib', 'integrations', 'post-processor.js'));
    expect(existsSync(resolved)).toBe(true);
  });

  it('the pipeline still invokes the scripts/ path (matches where the file now lives)', () => {
    expect(read('scripts/eva-intake-pipeline.js')).toMatch(/node scripts\/eva-intake-archive\.js/);
  });
});

// --- FR-2 (adversarial): the branch union is deduped by id so an overlapping row is processed once -
describe('FR-2: dedupeById prevents a double playlist insert from overlapping branches', () => {
  it('a row matching both classified and orphan branches appears exactly once', async () => {
    const { dedupeById } = await import('../../lib/integrations/post-processor.js');
    const row = { id: 'dup', youtube_video_id: 'v', status: 'pending' };
    const out = dedupeById([row, { id: 'other', status: 'pending' }, row]);
    expect(out).toHaveLength(2);
    expect(out.filter((r) => r.id === 'dup')).toHaveLength(1);
    expect(out[0].id).toBe('dup'); // first-seen order preserved
  });
  it('tolerates null/empty entries', async () => {
    const { dedupeById } = await import('../../lib/integrations/post-processor.js');
    expect(dedupeById([null, { id: 'a' }, undefined])).toEqual([{ id: 'a' }]);
  });
});

// --- FR-3: archive failure is loud + durable, and the script exits non-zero on per-item errors ----
describe('FR-3: archive failure is surfaced loudly, not swallowed', () => {
  it('pipeline Step 5 emits a ::error:: annotation and files a harness-bug row on failure', () => {
    const src = read('scripts/eva-intake-pipeline.js');
    expect(src).toMatch(/::error title=EVA intake archive failed::/);
    expect(src).toMatch(/log-harness-bug\.js/);
    // and it is no longer JUST the old soft one-liner that swallowed the failure
    expect(src).toMatch(/ARCHIVE STEP FAILED/);
  });

  it('the archive script exits non-zero when any item errored (so the pipeline sees !ok)', () => {
    const src = read('scripts/eva-intake-archive.js');
    expect(src).toMatch(/totalErrors\s*>\s*0/);
    expect(src).toMatch(/process\.exitCode\s*=\s*1/);
  });
});

// --- FR-2: postProcessYouTube actually RUNS a status='processed' selection + moves it --------------
// Mock the YouTube auth + client so postProcessYouTube proceeds to its DB selection without a network
// call; inject a recording Supabase so we can assert which branches were queried and what got updated.
vi.mock('../../lib/integrations/youtube/oauth-manager.js', () => ({
  getAuthenticatedClient: vi.fn(async () => ({}))
}));
vi.mock('googleapis', () => ({
  google: {
    youtube: () => ({
      playlists: { list: vi.fn(async () => ({ data: { items: [{ id: 'PROCESSED_PL', snippet: { title: 'Processed' } }] } })) },
      playlistItems: { insert: vi.fn(async () => ({})), delete: vi.fn(async () => ({})) }
    })
  }
}));

function makeRecordingSupabase(selectResolver) {
  const selects = [];
  const updates = [];
  function builder(table) {
    const q = { table, op: 'select', filters: [], update: null };
    const api = {
      select(cols) { q.cols = cols; return api; },
      in(col, vals) { q.filters.push(['in', col, vals]); return api; },
      eq(col, val) { q.filters.push(['eq', col, val]); return api; },
      not(col, op, val) { q.filters.push(['not', col, op, val]); return api; },
      is(col, val) { q.filters.push(['is', col, val]); return api; },
      update(vals) { q.op = 'update'; q.update = vals; updates.push(q); return api; },
      then(resolve) {
        if (q.op === 'select') { selects.push(q); return resolve({ data: selectResolver(q), error: null }); }
        return resolve({ data: null, error: null });
      }
    };
    return api;
  }
  return { client: { from: (t) => builder(t) }, selects, updates };
}

// A filter matcher: does this recorded query contain a filter matching the predicate tuple?
const hasFilter = (q, kind, col, ...rest) =>
  q.filters.some(([k, c, ...r]) => k === kind && c === col && JSON.stringify(r) === JSON.stringify(rest));

describe('FR-2: postProcessYouTube selects + moves status=processed (reviewed) and orphaned items', () => {
  let savedTodoistToken;
  beforeAll(() => {
    // Isolate the YouTube path: with no Todoist token, postProcessTodoist short-circuits (no network).
    savedTodoistToken = process.env.TODOIST_API_TOKEN;
    delete process.env.TODOIST_API_TOKEN;
  });
  afterAll(() => { if (savedTodoistToken !== undefined) process.env.TODOIST_API_TOKEN = savedTodoistToken; });

  it('issues a reviewedItems branch (status=processed + processed_at NULL) and an orphan branch, then moves the reviewed video', async () => {
    const { postProcessAll } = await import('../../lib/integrations/post-processor.js');

    const reviewed = { id: 'row-reviewed', youtube_video_id: 'vid-reviewed', youtube_playlist_item_id: 'pli-reviewed', status: 'processed' };
    const rec = makeRecordingSupabase((q) => {
      if (q.table !== 'eva_youtube_intake') return [];
      // Only the reviewedItems branch returns a row; all other branches are empty.
      if (hasFilter(q, 'eq', 'status', 'processed') && hasFilter(q, 'is', 'processed_at', null)) return [reviewed];
      return [];
    });

    const result = await postProcessAll({ supabase: rec.client, verbose: false });

    const yt = rec.selects.filter((q) => q.table === 'eva_youtube_intake');
    // reviewedItems branch (the core FR-2 fix) was issued
    expect(yt.some((q) => hasFilter(q, 'eq', 'status', 'processed') && hasFilter(q, 'is', 'processed_at', null))).toBe(true);
    // orphan-recovery branch (mirror of the Todoist side) was issued
    expect(yt.some((q) => hasFilter(q, 'not', 'chairman_reviewed_at', 'is', null) && hasFilter(q, 'eq', 'status', 'pending'))).toBe(true);

    // the reviewed video was actually moved: marked processed with a destination playlist id
    const mv = rec.updates.find((q) => q.table === 'eva_youtube_intake');
    expect(mv, 'expected an update marking the reviewed video processed').toBeTruthy();
    expect(mv.update.status).toBe('processed');
    expect(mv.update.destination_playlist_id).toBe('PROCESSED_PL');
    expect(mv.update.processed_at).toBeTruthy();
    expect(result.youtube.processed).toBe(1);
    expect(result.youtube.errors).toHaveLength(0);
  });
});
