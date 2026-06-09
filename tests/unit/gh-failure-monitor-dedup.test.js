// QF-20260609-255: the ci_failure dedup hash must key on workflowName + headBranch, NOT runId.
// run.databaseId (runId) is unique per run, so the old sha256(`${workflowName}:${runId}`) never
// matched across distinct failed runs — every re-failure inserted a new feedback row (962 dup
// rows; LEO-Bypass alone = 305) and burned a fresh LLM triage call. computeErrorHash is exported
// (and the module now guards main() behind require.main === module, so requiring it is side-effect
// free). Functional unit test, no DB.
import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { computeErrorHash } = require('../../scripts/clockwork/gh-failure-monitor.cjs');

describe('QF-20260609-255: gh-failure-monitor computeErrorHash dedup', () => {
  it('is deterministic for the same workflow + branch', () => {
    expect(computeErrorHash('CI', 'main')).toBe(computeErrorHash('CI', 'main'));
  });

  it('dedups across distinct runs of the same workflow + branch (the fix)', () => {
    // Callers now pass headBranch (not the per-run databaseId), so two distinct failed runs of
    // the same workflow on the same branch collapse to one hash → one deduped feedback row.
    expect(computeErrorHash('LEO Protocol Bypass Detection', 'main'))
      .toBe(computeErrorHash('LEO Protocol Bypass Detection', 'main'));
  });

  it('distinguishes different branches', () => {
    expect(computeErrorHash('CI', 'main')).not.toBe(computeErrorHash('CI', 'feature/x'));
  });

  it('distinguishes different workflows', () => {
    expect(computeErrorHash('CI', 'main')).not.toBe(computeErrorHash('Deploy', 'main'));
  });

  it('does NOT vary by runId (regression guard: the hash ignores any per-run id)', () => {
    // computeErrorHash(workflowName, headBranch) uses exactly two inputs; a stray 3rd arg
    // (an old runId) must not change the hash — that was the bug.
    expect(computeErrorHash('CI', 'main', 111)).toBe(computeErrorHash('CI', 'main', 222));
  });
});
