/**
 * QF dual-prefix invariant — regression pin
 * SD-LEO-INFRA-SESSION-AWARE-AUTO-001 (FR-5 step 3)
 *
 * FR-5 step 1 changed the HUMAN-DOC "next steps" branch hint from
 * `quick-fix/<id>` to the canonical `qf/<id>`. FR-5 step 2 mandates that
 * dual-prefix ACCEPTANCE is preserved everywhere. This single cross-module
 * test pins that both the canonical `qf/` and the legacy `quick-fix/` prefixes
 * resolve to the SAME QF key via the branch-key extractor AND are detected by
 * the ship qf-detector — so a future "consistency" cleanup cannot silently drop
 * legacy-prefix support (which production merges still use).
 */

import { describe, it, expect } from 'vitest';
import { extractKey } from '../../scripts/lib/branch-key-extractor.js';
import { isQuickFixBranch, extractQFId } from '../../lib/ship/qf-detector.mjs';

describe('QF dual-prefix invariant (SD-LEO-INFRA-SESSION-AWARE-AUTO-001 FR-5)', () => {
  const QF_ID = 'QF-20260101-001';
  const canonical = `qf/${QF_ID}`;
  const legacy = `quick-fix/${QF_ID}`;

  it('extractKey resolves both prefixes to the same QF key', () => {
    expect(extractKey(canonical)).toEqual({ kind: 'QF', key: QF_ID });
    expect(extractKey(legacy)).toEqual({ kind: 'QF', key: QF_ID });
  });

  it('qf-detector detects both prefixes and extracts the same id', () => {
    expect(isQuickFixBranch(canonical)).toBe(true);
    expect(isQuickFixBranch(legacy)).toBe(true);
    expect(extractQFId(canonical)).toBe(QF_ID);
    expect(extractQFId(legacy)).toBe(QF_ID);
  });
});
