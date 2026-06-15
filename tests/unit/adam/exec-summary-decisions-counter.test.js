/**
 * SD-LEO-INFRA-ADAM-PRIORITY-ANCHORING-001 (FR-4) — the exec-summary
 * 'chairman_decisions consumed: N of <total>' counter line.
 *
 * The exec-summary script (scripts/adam-exec-summary.mjs) runs at import time and
 * touches the live DB, so we don't import it here. Instead we assert the SAME
 * function the script uses (deriveDecisionsPrior) and reproduce the exact line
 * shape + the fail-soft fallback the script emits.
 */
import { describe, it, expect } from 'vitest';
import { deriveDecisionsPrior } from '../../../lib/adam/preference-model.js';

// Mirror of the script's line builder (kept identical to scripts/adam-exec-summary.mjs FR-4).
function decisionsLineFrom(rows) {
  try {
    const r = rows || [];
    const { consumed } = deriveDecisionsPrior(r);
    return `chairman_decisions consumed: ${consumed} of ${r.length}`;
  } catch {
    return 'chairman_decisions consumed: (unavailable)';
  }
}

describe('FR-4 chairman_decisions-consumed counter', () => {
  it('renders N of <total> reflecting the consumed decisions', () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({ id: i, decision: 'approve' }));
    expect(decisionsLineFrom(rows)).toBe('chairman_decisions consumed: 51 of 51');
  });

  it('degrades gracefully to 0 of 0 when there are no decisions (no crash)', () => {
    expect(decisionsLineFrom([])).toBe('chairman_decisions consumed: 0 of 0');
    expect(decisionsLineFrom(null)).toBe('chairman_decisions consumed: 0 of 0');
  });

  it('is fail-soft: a thrown source degrades to (unavailable), never crashes', () => {
    const bad = { get length() { throw new Error('boom'); } };
    expect(decisionsLineFrom(bad)).toBe('chairman_decisions consumed: (unavailable)');
  });
});
