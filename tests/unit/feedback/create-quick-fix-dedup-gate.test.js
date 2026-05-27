// QF-20260527-250: prevent regression of the missing pre-INSERT dedup gate.
//
// QF-20260526-885 + QF-20260526-106 were created 89s apart by UAT_AGENT for
// the same feedback symptom (b06e04f8) because scripts/create-quick-fix.js
// had no dedup check before the .from('quick_fixes').insert() call.
//
// Static-pattern assertions (same convention as create-quick-fix-insert-order
// .test.js): inspect source ordering without running the script, which would
// require mocking the full Supabase + worktree-manager + audit_log chain.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../../scripts/create-quick-fix.js');

describe('QF-20260527-250: create-quick-fix.js dedup gate runs before INSERT', () => {
  const code = fs.readFileSync(SRC, 'utf8');

  const QF_INSERT_RE = /\.from\(\s*['"]quick_fixes['"]\s*\)\s*\r?\n?\s*\.insert\(/;
  const HARD_GATE_RE = /\[DUPLICATE_QF\]\s+feedback already claimed/;
  const SOFT_GATE_RE = /\[POSSIBLE_DUPLICATE_QF\]/;
  const ALLOW_DUP_FLAG_RE = /arg\s*===\s*['"]--allow-duplicate['"]/;
  const ALLOW_DUP_USAGE_RE = /options\.allowDuplicate/;

  it('hard-gate marker [DUPLICATE_QF] is present and precedes the quick_fixes insert', () => {
    const gateM = code.match(HARD_GATE_RE);
    const insertM = code.match(QF_INSERT_RE);
    expect(gateM?.index).toBeGreaterThanOrEqual(0);
    expect(insertM?.index).toBeGreaterThanOrEqual(0);
    expect(gateM.index).toBeLessThan(insertM.index);
  });

  it('soft-gate marker [POSSIBLE_DUPLICATE_QF] is present and precedes the quick_fixes insert', () => {
    const gateM = code.match(SOFT_GATE_RE);
    const insertM = code.match(QF_INSERT_RE);
    expect(gateM?.index).toBeGreaterThanOrEqual(0);
    expect(gateM.index).toBeLessThan(insertM.index);
  });

  it('--allow-duplicate argv flag is parsed and requires a non-empty reason', () => {
    expect(code).toMatch(ALLOW_DUP_FLAG_RE);
    expect(code).toMatch(ALLOW_DUP_USAGE_RE);
    // The argv parser must reject empty reason. Matches String(...).trim() guard.
    expect(code).toMatch(/--allow-duplicate requires a non-empty reason/);
  });

  it('soft gate is guarded by a created_at window (60 minute lookback)', () => {
    // Prevents the soft gate from being a forever-blocker on any title-prefix collision.
    expect(code).toMatch(/60\s*\*\s*60\s*\*\s*1000/);
  });

  it('soft gate uses ilike for case-insensitive title-prefix match', () => {
    expect(code).toMatch(/\.ilike\(\s*['"]title['"]/);
  });

  it('preclaim block re-uses the dedup-gate-resolved feedback IDs (no double resolve)', () => {
    // The pre-resolution above the gate is the single resolveFeedbackIds call site;
    // the preclaim block should reference resolvedFeedbackIds, not call again.
    const resolveCalls = code.match(/await\s+resolveFeedbackIds\s*\(/g) || [];
    expect(resolveCalls.length).toBe(1);
  });
});
