import { describe, it, expect } from 'vitest';
import { runSelfVerification } from '../lib/quickfix-self-verifier.js';
import { QF_HARD_LOC_CAP } from '../scripts/modules/complete-quick-fix/verification.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findExistingQfId() {
  const { data } = await supabase
    .from('quick_fixes')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1);
  return data?.[0]?.id ?? null;
}

describe('quickfix-self-verifier verifyLOCConstraint (QF-20260511-056)', () => {
  it('uses source-only LOC when actualSourceLoc is provided (large test LOC does NOT trip cap)', async () => {
    const qfId = await findExistingQfId();
    if (!qfId) return;

    const result = await runSelfVerification(qfId, {
      actualLoc: 300,
      actualSourceLoc: 20,
      actualTestLoc: 280,
      filesChanged: [],
      testsPass: true,
      uatVerified: true,
      testsVerifiedRecently: true
    });

    const locCheck = result.checks[0];
    expect(locCheck.passed).toBe(true);
    expect(locCheck.message).toMatch(/Source LOC \(20\)/);
    expect(locCheck.message).toMatch(/test: 280, excluded/);
  });

  it('blocks when actualSourceLoc exceeds QF_HARD_LOC_CAP', async () => {
    const qfId = await findExistingQfId();
    if (!qfId) return;

    const overCap = QF_HARD_LOC_CAP + 10;
    const result = await runSelfVerification(qfId, {
      actualLoc: overCap + 50,
      actualSourceLoc: overCap,
      actualTestLoc: 50,
      filesChanged: [],
      testsPass: true,
      uatVerified: true,
      testsVerifiedRecently: true
    });

    const locCheck = result.checks[0];
    expect(locCheck.passed).toBe(false);
    expect(locCheck.message).toMatch(new RegExp(`Source LOC \\(${overCap}\\) exceeds limit \\(${QF_HARD_LOC_CAP}\\)`));
  });

  it('falls back to combined actualLoc when no split is provided', async () => {
    const qfId = await findExistingQfId();
    if (!qfId) return;

    const result = await runSelfVerification(qfId, {
      actualLoc: 25,
      filesChanged: [],
      testsPass: true,
      uatVerified: true,
      testsVerifiedRecently: true
    });

    const locCheck = result.checks[0];
    expect(locCheck.passed).toBe(true);
    expect(locCheck.message).toMatch(/Actual LOC \(25\)/);
    expect(locCheck.message).not.toMatch(/excluded/);
  });

  it('cap aligns with QF_HARD_LOC_CAP (75), not stale value 50', () => {
    expect(QF_HARD_LOC_CAP).toBe(75);
  });
});
