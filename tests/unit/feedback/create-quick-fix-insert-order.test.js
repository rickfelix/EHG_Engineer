// QF-20260526-106: prevent regression of the fk_feedback_quick_fix ordering bug.
//
// preclaimFeedbackRows writes feedback.quick_fix_id = <qfId>. The FK
// fk_feedback_quick_fix requires the quick_fixes row to exist FIRST. Previously
// create-quick-fix.js inserted the quick_fixes row AFTER the pre-claim block,
// so `--feedback-id` always failed (backlog b06e04f8).
//
// Static-pattern test (same convention as orchestrator.js wiring tests in
// validate-compliance-force-bypass.test.js): assert the source-code ordering
// without running the script — a unit-level execution would need to mock the
// full Supabase chain + worktree manager.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../../scripts/create-quick-fix.js');

describe('QF-20260526-106: create-quick-fix.js inserts quick_fixes BEFORE preclaim', () => {
  const code = fs.readFileSync(SRC, 'utf8');

  // Tolerant of CRLF + indentation drift via regex match indices.
  const QF_INSERT_RE = /\.from\(\s*['"]quick_fixes['"]\s*\)\s*\r?\n?\s*\.insert\(/;
  const PRECLAIM_RE = /\bpreclaimFeedbackRows\s*\(/;
  const ROUTE_RE = /\brouteWorkItem\s*\(/;

  it('the .from("quick_fixes").insert call precedes the preclaimFeedbackRows call', () => {
    const insertM = code.match(QF_INSERT_RE);
    const preclaimM = code.match(PRECLAIM_RE);
    expect(insertM?.index).toBeGreaterThanOrEqual(0);
    expect(preclaimM?.index).toBeGreaterThanOrEqual(0);
    expect(insertM.index).toBeLessThan(preclaimM.index);
  });

  it('routeWorkItem is called before the quick_fixes insert (status discriminator)', () => {
    const routeM = code.match(ROUTE_RE);
    const insertM = code.match(QF_INSERT_RE);
    expect(routeM?.index).toBeGreaterThanOrEqual(0);
    expect(routeM.index).toBeLessThan(insertM.index);
  });

  it('conflict-exit paths delete the orphan quick_fixes row before process.exit', () => {
    // Every conflict-exit branch must clean up the just-created row.
    // There are three exits in the preclaim block: REASON_REQUIRED, QUOTA_EXHAUSTED,
    // and the non-force conflict default. Each must precede its process.exit(1)
    // with a quick_fixes delete keyed on qfId.
    const deleteOrphanPattern =
      /from\('quick_fixes'\)\s*\.delete\(\)\s*\.eq\('id',\s*qfId\)/g;
    const matches = code.match(deleteOrphanPattern) || [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('does NOT introduce an .upsert call (which would mask a duplicate-id collision)', () => {
    // Keep using .insert — .upsert on quick_fixes would silently overwrite if
    // generateQuickFixId ever produced a colliding id.
    expect(code).not.toMatch(/\.from\('quick_fixes'\)[\s\S]{0,40}\.upsert\(/);
  });
});
