// QF-20260526-904: prevent regression of the bare sd_id existence check at
// scripts/generate-retrospective.js (L66-L79 pre-fix). The bare predicate
//   .from('retrospectives').select('id').eq('sd_id', sdId).limit(1)
// matched ANY row (including retrospective_type='LEAD_TO_PLAN' handoff-time
// retros), so the generator skipped while the LEAD-FINAL-APPROVAL and
// PLAN-TO-LEAD RETROSPECTIVE_QUALITY_GATE rejected the same row, forcing
// hand-rolled INSERTs (10 prior witnesses in the script tree, 6th overall
// writer-consumer-asymmetry witness, PAT-LEO-INFRA-WCA-001).
//
// Static-pattern assertions over the source file (same convention as
// stale-session-sweep-stale-filter.test.js and
// create-quick-fix-insert-order.test.js).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../../scripts/generate-retrospective.js');

describe('QF-20260526-904: generate-retrospective uses gate-filter for existence check', () => {
  const code = fs.readFileSync(SRC, 'utf8');

  it('imports getFilteredRetrospective from the canonical retro-filters module', () => {
    expect(code).toMatch(
      /import\s*\{\s*getFilteredRetrospective\s*\}\s*from\s*['"]\.\/modules\/handoff\/retro-filters\.js['"]/,
    );
  });

  it('does not contain the prior bare existence-check predicate on retrospectives', () => {
    // The exact buggy pattern: select('id').eq('sd_id', X).limit(1) on retrospectives.
    // It must not survive the fix — getFilteredRetrospective is the only entry point.
    const buggy = /from\(\s*['"]retrospectives['"]\s*\)\s*\.select\(\s*['"]id['"]\s*\)\s*\.eq\(\s*['"]sd_id['"]/;
    expect(code).not.toMatch(buggy);
  });

  it('calls getFilteredRetrospective with sdId and sd.created_at (freshness arg)', () => {
    // sd.created_at is the fallback when LEAD-TO-PLAN handoff has no acceptance row;
    // omitting it would degrade the freshness predicate to epoch-zero.
    expect(code).toMatch(/getFilteredRetrospective\s*\(\s*sdId\s*,\s*sd\.created_at\s*,\s*supabase\s*\)/);
  });
});
