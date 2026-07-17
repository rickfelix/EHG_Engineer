/**
 * SD-LEO-INFRA-MAKE-WSJF-SELF-001 — dependency- and rank-aware prio:top3
 * (scripts/wsjf-priority-fetcher.js).
 *
 * FR-2: candidates with ANY dependency ref not status='completed' are EXCLUDED
 *       (fail-closed per-SD; none-sentinel + ref-less candidates stay included),
 *       resolved via the SHARED extractAllDependencyRefs
 *       (lib/utils/parse-sd-dependencies.cjs — extractor identity pinned below).
 * FR-3: a FRESH metadata.dispatch_rank (dispatch_rank_at within 1h — parity with
 *       worker-checkin DISPATCH_RANK_TTL_MS) orders first, ascending; stale ranks
 *       are ignored and the legacy priority->status->created_at ordering stands.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Extractor-identity spy: wrap the REAL implementation so behavior is unchanged but the
// fetcher's use of the shared module is observable (FR-4a extractor-identity case).
vi.mock('../../lib/utils/parse-sd-dependencies.cjs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, extractAllDependencyRefs: vi.fn(actual.extractAllDependencyRefs) };
});

import { extractAllDependencyRefs } from '../../lib/utils/parse-sd-dependencies.cjs';
import WSJFPriorityFetcher from '../../scripts/wsjf-priority-fetcher.js';

// Chainable supabase stub (checkin-merged-claim-pool style): first from() = the candidate
// query (awaited after .limit()); second from() = the batch dep-resolution query (thenable
// after .or()/.in()). Records queries so tests can assert the batch lookup was (not) issued.
function makeSb({ candidates = [], depRows = [], depError = null } = {}) {
  let call = 0;
  const sb = { queries: [] };
  sb.from = () => {
    call += 1;
    const isCandidateQuery = call === 1;
    const q = { filters: [] };
    sb.queries.push(q);
    const builder = {
      select(cols) { q.select = cols; return builder; },
      in(col, vals) { q.filters.push(['in', col, vals]); return builder; },
      or(expr) { q.filters.push(['or', expr]); return builder; },
      order() { return builder; },
      limit() { return builder; },
      then(res, rej) {
        const out = isCandidateQuery
          ? { data: candidates, error: null }
          : { data: depError ? null : depRows, error: depError };
        return Promise.resolve(out).then(res, rej);
      },
    };
    return builder;
  };
  return sb;
}

function makeFetcher(sbOpts) {
  const fetcher = new WSJFPriorityFetcher(); // synthetic env from tests/setup.unit.js
  const sb = makeSb(sbOpts);
  fetcher.supabase = sb;
  return { fetcher, sb };
}

// Platform SD candidate (target_application null => never venture-build-filtered).
const sd = (over = {}) => ({
  id: over.id, title: over.id, status: 'active', priority: 80,
  created_at: '2026-07-10T00:00:00Z', target_application: null,
  dependencies: [], metadata: {}, ...over,
});

describe('FR-2 — dependency-aware exclusion', () => {
  it('excludes a candidate whose metadata dep is unresolved; ref-less sibling stays', async () => {
    const { fetcher } = makeFetcher({
      candidates: [
        sd({ id: 'SD-BLOCKED-001', metadata: { depends_on: 'SD-DEP-001' } }),
        sd({ id: 'SD-FREE-001' }),
      ],
      depRows: [{ id: 'u-dep', sd_key: 'SD-DEP-001', status: 'in_progress' }],
    });
    const out = await fetcher.getTop3Priorities();
    expect(out.map((r) => r.id)).toEqual(['SD-FREE-001']);
  });

  it('includes a candidate whose declared dep is completed (output shape unchanged)', async () => {
    const { fetcher } = makeFetcher({
      candidates: [sd({ id: 'SD-READY-001', dependencies: [{ sd_key: 'SD-DEP-001' }] })],
      depRows: [{ id: 'u-dep', sd_key: 'SD-DEP-001', status: 'completed' }],
    });
    const out = await fetcher.getTop3Priorities();
    expect(out).toHaveLength(1);
    expect(Object.keys(out[0]).sort()).toEqual(
      ['id', 'income_contribution', 'income_note', 'priority_reason', 'title'],
    );
    expect(out[0].id).toBe('SD-READY-001');
  });

  it('none-sentinel and ref-less candidates stay included — and no dep query is issued', async () => {
    const { fetcher, sb } = makeFetcher({
      candidates: [
        sd({ id: 'SD-NONE-001', dependencies: [{ sd_key: 'none' }, 'None'], metadata: { blocked_on_sd: 'none' } }),
        sd({ id: 'SD-BARE-001', created_at: '2026-07-09T00:00:00Z' }),
      ],
    });
    const out = await fetcher.getTop3Priorities();
    expect(out.map((r) => r.id)).toEqual(['SD-NONE-001', 'SD-BARE-001']);
    expect(sb.queries).toHaveLength(1); // sentinel/ref-less => zero refs => no batch lookup
  });

  it('unknown/dangling ref => unresolved => fail-closed for THAT candidate only', async () => {
    const { fetcher } = makeFetcher({
      candidates: [
        sd({ id: 'SD-DANGLING-001', metadata: { blocked_by_sd_key: 'SD-GONE-001' } }),
        sd({ id: 'SD-FREE-001' }),
      ],
      depRows: [],
    });
    const out = await fetcher.getTop3Priorities();
    expect(out.map((r) => r.id)).toEqual(['SD-FREE-001']);
  });

  it('uuid-shaped refs resolve against the id column', async () => {
    const uuid = 'c6c645c6-2f94-41b6-8e80-2642d7fcdc23';
    const { fetcher } = makeFetcher({
      candidates: [sd({ id: 'SD-UUIDDEP-001', dependencies: [{ sd_id: uuid }] })],
      depRows: [{ id: uuid, sd_key: 'SD-PARENT-001', status: 'completed' }],
    });
    const out = await fetcher.getTop3Priorities();
    expect(out.map((r) => r.id)).toEqual(['SD-UUIDDEP-001']);
  });
});

describe('FR-3 — fresh dispatch_rank ordering', () => {
  it('a FRESH dispatch_rank sorts ahead of a same-priority unranked (otherwise-first) SD', async () => {
    const { fetcher } = makeFetcher({
      candidates: [
        sd({ id: 'SD-UNRANKED-001', created_at: '2026-07-16T00:00:00Z' }), // newer => legacy-first
        sd({
          id: 'SD-RANKED-001', created_at: '2026-07-01T00:00:00Z',
          metadata: { dispatch_rank: 1, dispatch_rank_at: new Date().toISOString() },
        }),
      ],
    });
    const out = await fetcher.getTop3Priorities();
    expect(out.map((r) => r.id)).toEqual(['SD-RANKED-001', 'SD-UNRANKED-001']);
  });

  it('a STALE (>1h) dispatch_rank is ignored — legacy created_at ordering stands', async () => {
    const staleAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { fetcher } = makeFetcher({
      candidates: [
        sd({ id: 'SD-UNRANKED-001', created_at: '2026-07-16T00:00:00Z' }),
        sd({
          id: 'SD-RANKED-001', created_at: '2026-07-01T00:00:00Z',
          metadata: { dispatch_rank: 1, dispatch_rank_at: staleAt },
        }),
      ],
    });
    const out = await fetcher.getTop3Priorities();
    expect(out.map((r) => r.id)).toEqual(['SD-UNRANKED-001', 'SD-RANKED-001']);
  });
});

describe('FR-4a extractor identity — the fetcher uses the SHARED extractor', () => {
  it('extractAllDependencyRefs from lib/utils/parse-sd-dependencies.cjs is what runs (spy + source pin)', async () => {
    vi.mocked(extractAllDependencyRefs).mockClear();
    const { fetcher } = makeFetcher({ candidates: [sd({ id: 'SD-ANY-001' })] });
    await fetcher.getTop3Priorities();
    expect(extractAllDependencyRefs).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'SD-ANY-001' }),
    );
    // Source pin: the import must literally target the shared module (no local re-derivation).
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../scripts/wsjf-priority-fetcher.js'),
      'utf8',
    );
    expect(src).toMatch(/import\s*\{\s*extractAllDependencyRefs\s*\}\s*from\s*'\.\.\/lib\/utils\/parse-sd-dependencies\.cjs'/);
  });
});
