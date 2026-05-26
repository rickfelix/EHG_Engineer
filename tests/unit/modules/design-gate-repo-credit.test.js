/**
 * SD-LEO-INFRA-CROSS-REPO-AWARE-001 — FR-3 gate fail-closed scoring.
 *
 * GATE1_DESIGN_DATABASE used to award the full 20/20 DESIGN-execution credit for the
 * mere existence of a PASS-verdict row, never reading whether DESIGN actually scanned the
 * right repo. evaluateDesignExecutionCredit makes that credit conditional on the
 * repo-resolution metadata, while keeping legacy rows (no metadata keys) at full credit.
 */

import { describe, it, expect } from 'vitest';
import { evaluateDesignExecutionCredit } from '../../../scripts/modules/design-database-gates-validation.js';

describe('SD-LEO-INFRA-CROSS-REPO-AWARE-001 — FR-3 evaluateDesignExecutionCredit', () => {
  it('TS-C: withholds credit when repo_resolved=false (unresolved repo)', () => {
    const c = evaluateDesignExecutionCredit({ verdict: 'PASS', metadata: { repo_resolved: false, components_dir_exists: false } });
    expect(c.awardCredit).toBe(false);
    expect(c.repoUnresolved).toBe(true);
  });

  it('withholds credit when components_dir_exists=false (scanned the wrong repo)', () => {
    const c = evaluateDesignExecutionCredit({ verdict: 'PASS', metadata: { repo_resolved: true, components_dir_exists: false } });
    expect(c.awardCredit).toBe(false);
    expect(c.componentsMissing).toBe(true);
  });

  it('awards credit when the repo resolved and src/components exists', () => {
    const c = evaluateDesignExecutionCredit({ verdict: 'PASS', metadata: { repo_resolved: true, components_dir_exists: true } });
    expect(c.awardCredit).toBe(true);
    expect(c.repoUnresolved).toBe(false);
    expect(c.componentsMissing).toBe(false);
  });

  it('awards credit for legacy rows missing the metadata keys (backward compatible)', () => {
    const c = evaluateDesignExecutionCredit({ verdict: 'PASS', metadata: { workflow_analysis: {} } });
    expect(c.awardCredit).toBe(true);
  });

  it('awards credit when metadata is absent or the row is null', () => {
    expect(evaluateDesignExecutionCredit({ verdict: 'PASS' }).awardCredit).toBe(true);
    expect(evaluateDesignExecutionCredit(null).awardCredit).toBe(true);
  });
});
