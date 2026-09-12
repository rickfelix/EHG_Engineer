/**
 * QF-20260912-150 (escalated to SD-LEO-FIX-POST-WRITE-HANG-001), FR-2: 5 post-write steps in
 * LeadFinalApprovalExecutor's completion tail had ZERO protection (no try/catch, no timeout) --
 * resolveLearningItems, rescoreOriginalSD, runProgrammaticRetrospective, releaseSessionClaim,
 * checkAndCompleteParentSD. A hang in any of them, AFTER the SD's completion stamp
 * (stampCompletion/stampExecutionContext) had already landed, blocked the caller past its
 * external kill timeout with no output.
 *
 * runPostWriteStage's OWN hang-safety (the start/done/TIMED-OUT markers, the bounded race, the
 * distinct exit code, never throwing) is already proven generically in
 * tests/unit/post-write-stage.test.js. executeSpecific() is a 1600+ line method whose tail
 * sequentially depends on ~30 prior steps (CAS completion, shipping, orchestrator hooks) all
 * succeeding first -- fully mocking that chain just to reach these 5 lines would be a large,
 * fragile harness for marginal signal over what the generic test already proves. This file
 * follows the SAME lighter-weight convention this repo already uses for this exact file's
 * hard-to-isolate inline hooks (see tests/unit/lead-final-approval-rescore.test.js's own
 * "hook configuration" describe block): assert the wiring is actually present at each site,
 * not re-prove the helper's generic behavior.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.join(
  __dirname,
  '../../../scripts/modules/handoff/executors/lead-final-approval/index.js'
);
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

describe('LEAD-FINAL-APPROVAL post-write-stage wiring (QF-20260912-150 FR-2)', () => {
  it('imports runPostWriteStage and the shared timeout exit code from the canonical helper', () => {
    expect(source).toContain(
      "import { runPostWriteStage, POST_WRITE_STAGE_TIMEOUT_EXIT_CODE } from '../../../../../lib/completion/post-write-stage.js';"
    );
  });

  const sites = [
    { name: 'resolveLearningItems', call: 'resolveLearningItems(sd, this.supabase)' },
    { name: 'rescoreOriginalSD', call: 'rescoreOriginalSD(sd, this.supabase)' },
    { name: 'runProgrammaticRetrospective', call: 'runProgrammaticRetrospective(sd)' },
    { name: 'releaseSessionClaim', call: 'releaseSessionClaim(sd, this.supabase)' },
    { name: 'checkAndCompleteParentSD', call: 'checkAndCompleteParentSD(sd, this.supabase, { shippingResults })' },
  ];

  for (const { name, call } of sites) {
    it(`${name} is invoked through runPostWriteStage, not a bare await`, () => {
      // The bare, unwrapped call must no longer appear on its own line -- only inside the
      // runPostWriteStage(...) wrapper's arrow function.
      expect(source).toContain(`runPostWriteStage('${name}', () => ${call})`);
      // And the raw defect shape (a standalone `await name(...)` with nothing wrapping it)
      // must be gone.
      expect(source).not.toMatch(new RegExp(`^\\s*await ${name}\\(`, 'm'));
    });

    it(`${name}'s wrapped call checks .timedOut and marks the shared exit code`, () => {
      const idx = source.indexOf(`runPostWriteStage('${name}'`);
      expect(idx).toBeGreaterThan(-1);
      const nearby = source.slice(idx, idx + 400);
      expect(nearby).toContain('.timedOut');
      expect(nearby).toContain('POST_WRITE_STAGE_TIMEOUT_EXIT_CODE');
    });
  }

  it('checkAndCompleteParentSD falls back to the documented {orchestratorCompleted:false} default on timeout, never leaving parentInfo undefined', () => {
    const idx = source.indexOf("runPostWriteStage('checkAndCompleteParentSD'");
    const nearby = source.slice(idx, idx + 500);
    expect(nearby).toContain('{ orchestratorCompleted: false }');
  });
});
