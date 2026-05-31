// QF-20260530-548: showFallbackQueue must return a valid QF summary on its
// no-SD early-return. A bare `return` (undefined) crashed callers in
// SDNextSelector.js (`qfSummary.topStartableQF`), killing `npm run sd:next`
// and `/leo next` for every session with no active baseline and no
// priority-matching SD. This regression test pins the return contract.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { showFallbackQueue } from '../../../scripts/modules/sd-next/display/fallback-queue.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../../scripts/modules/sd-next/display/fallback-queue.js');

const nowIso = () => new Date().toISOString();

// Minimal chainable Supabase stub. The no-SD branch only needs:
//   chairman_dashboard_config -> .single() (config; caught/optional)
//   strategic_directives_v2   -> .limit()  (returns the [] that triggers the branch)
function makeSupabase({ sds = [], sdsError = null } = {}) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    single: async () => ({ data: null, error: null }),
    limit: async () => ({ data: sds, error: sdsError }),
  };
  return { from: () => chain };
}

describe('QF-20260530-548: showFallbackQueue no-SD path returns a valid summary', () => {
  it('returns a defined summary (not undefined) when zero prioritized SDs exist', async () => {
    const summary = await showFallbackQueue(makeSupabase({ sds: [] }), { openQuickFixes: [] });
    expect(summary).toBeDefined();
    expect(summary).not.toBeNull();
    // Callers do `summary.topStartableQF` — it must be a real (null) property.
    expect(summary).toHaveProperty('topStartableQF', null);
    expect(summary.totalCount).toBe(0);
  });

  it('does not throw on `.topStartableQF` of the returned value (the original crash)', async () => {
    const summary = await showFallbackQueue(makeSupabase({ sds: [] }), { openQuickFixes: [] });
    expect(() => summary.topStartableQF).not.toThrow();
  });

  it('still surfaces a startable QF on the no-SD path so AUTO_PROCEED can route', async () => {
    const openQuickFixes = [
      { id: 'QF-FRESH', status: 'open', claiming_session_id: null, pr_url: null, commit_sha: null, severity: 'medium', created_at: nowIso() },
    ];
    const summary = await showFallbackQueue(makeSupabase({ sds: [] }), { openQuickFixes });
    expect(summary.topStartableQF?.id).toBe('QF-FRESH');
  });

  it('source no longer bare-returns undefined on the no-SD branch', () => {
    const src = readFileSync(SRC, 'utf8');
    // No bare `return;` (valueless) anywhere — that was the crash.
    expect(src).not.toMatch(/\n\s*return;\s*(\n|$)/);
    // The no-SD branch returns a classified summary instead.
    expect(src).toMatch(/No prioritized SDs found[\s\S]*?return qfSummary;/);
  });
});
