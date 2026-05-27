// SD-FDBK-INFRA-RETROFIT-LIB-EVA-001 / FR-2 + FR-3 + parity
//
// Verifies lib/eva/lifecycle-sd-bridge.js venture-enrichment query consumes the
// canonical getActiveSDFilter helper (shipped by parent SD-EVA-SUPPORT-CLI-
// SKILL-ORCH-001-C FR-6). The retrofit changes behavior in two ways:
//   1. Excludes `archived_at IS NOT NULL` SDs (FR-2 archived exclusion).
//   2. Excludes `is_active = false` SDs (parity with the canonical predicate).
//
// Plus parity guard: non-archived SDs with status IN (draft, in_progress, active)
// and is_active!=false continue to flow through enrichment (FR-3).
//
// Static-pattern test (same convention as create-quick-fix-insert-order.test.js
// and other regression-pin tests this session): inspect source ordering and
// helper-import to confirm the retrofit landed, without mocking the entire
// enrichment pipeline.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../../lib/eva/lifecycle-sd-bridge.js');

describe('SD-FDBK-INFRA-RETROFIT-LIB-EVA-001: lifecycle-sd-bridge venture-enrichment uses getActiveSDFilter', () => {
  const code = fs.readFileSync(SRC, 'utf8');

  it('imports getActiveSDFilter from the canonical lib/sd/active-sd-predicate module', () => {
    expect(code).toMatch(
      /import\s*\{\s*getActiveSDFilter\s*\}\s*from\s*['"]\.\.\/sd\/active-sd-predicate\.js['"]/,
    );
  });

  it('does not contain the prior inline status filter for venture-enrichment', () => {
    // Pre-retrofit pattern: `.in('status', ['draft', 'in_progress', 'active'])`
    // appearing in the venture-enrichment query. The retrofit replaces this with
    // a wrapping getActiveSDFilter call.
    expect(code).not.toMatch(
      /\.in\(\s*['"]status['"]\s*,\s*\[\s*['"]draft['"]\s*,\s*['"]in_progress['"]\s*,\s*['"]active['"]\s*\]\s*\)/,
    );
  });

  it('calls getActiveSDFilter with a Supabase query builder wrapping the venture-enrichment query', () => {
    // The retrofit wraps the .from('strategic_directives_v2')...neq('sd_type','orchestrator')
    // chain inside a getActiveSDFilter() call. Verify both the call and that
    // venture_id + non-orchestrator filters are still chained on the inner builder.
    expect(code).toMatch(
      /getActiveSDFilter\(\s*\n?\s*supabase\s*\n?\s*\.from\(\s*['"]strategic_directives_v2['"]\s*\)/,
    );
    expect(code).toMatch(/\.eq\(\s*['"]venture_id['"]\s*,\s*ventureId\s*\)/);
    expect(code).toMatch(/\.neq\(\s*['"]sd_type['"]\s*,\s*['"]orchestrator['"]\s*\)/);
  });

  it('the deferred-retrofit-follow-up exempt comment has been removed', () => {
    // FR-6 placed an `active-sd-predicate-exempt: deferred-retrofit-follow-up`
    // marker at the venture-enrichment query site. This SD's retrofit must
    // remove it; presence post-retrofit indicates the wrong call site was
    // edited or the marker was left stale.
    expect(code).not.toMatch(/active-sd-predicate-exempt:\s*deferred-retrofit-follow-up/);
  });
});
