// QF-20260703-894: STORIES sub-agent auto-invocation must derive stories from
// prd.functional_requirements (rich, FR-specific) rather than prd.acceptance_criteria
// (thin build-verification checks) -- the latter produced ~31%-scoring fake stories
// requiring a manual delete+re-invoke cycle every SD. Static-pattern assertions on
// source ordering, same convention as create-quick-fix-dedup-gate.test.js (avoids
// mocking the full Supabase + LLM generation chain).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../../lib/sub-agents/modules/stories/execute.js');

describe('QF-20260703-894: createStoriesFromPRD derives criteria from functional_requirements', () => {
  const code = fs.readFileSync(SRC, 'utf8');

  it('defines storySourceCriteria preferring functional_requirements, falling back to acceptance_criteria', () => {
    /**
     * *** THIS TEST WAS PINNING THE BUG IN PLACE. ***
     * It asserted the source contained the LITERAL expression
     * `fr.title || fr.description || String(fr)` — which is exactly the defect
     * SD-LEO-INFRA-USER-STORY-QUALITY-001/FR-5 fixed. That chain omits `requirement` from the
     * canonical FR contract, so such an FR fell through to String(fr) and became the literal
     * "[object Object]": 66 stories carry it in the TITLE, and all 66 have
     * validation_status='validated'.
     *
     * So anyone fixing the corruption met a RED TEST demanding they put it back. A source-pin test
     * does not just break on legitimate change — it can actively defend a defect, and the more
     * precisely it pins, the harder it defends.
     *
     * The INTENT was right and is preserved: criteria come from functional_requirements when
     * present, else acceptance_criteria. Only the pinned spelling changed — plus a negative
     * assertion below so the old expression can never come back silently.
     */
    expect(code).toMatch(/const storySourceCriteria = \(prd\.functional_requirements && prd\.functional_requirements\.length > 0\)/);
    expect(code).toMatch(/\?\s*prd\.functional_requirements\.map\(\(fr, i\) => criterionFromFR\(fr, i\)\)/);
    expect(code).toMatch(/:\s*\(prd\.acceptance_criteria \|\| \[\]\)/);

    // REGRESSION GUARD: the unguarded chain must never return as the MAP BODY. It is the
    // "[object Object]" source. Scoped to `.map(fr => ...)` rather than the bare expression,
    // because execute.js's own docblock QUOTES the old chain to explain why it was removed — and a
    // naive text match flagged that comment, i.e. the guard fired on the documentation of the fix.
    // A source-pin assertion matches prose as readily as code; it has to name the shape it forbids.
    expect(code, 'the pre-FR-5 map body emits "[object Object]" for requirement-only FRs')
      .not.toMatch(/\.map\(fr => fr\.title \|\| fr\.description \|\| String\(fr\)\)/);
  });

  it('the batch generation call and the story-build loop both use storySourceCriteria, not the raw PRD field', () => {
    expect(code).toMatch(/generateStoriesBatch\(storySourceCriteria,/);
    expect(code).not.toMatch(/generateStoriesBatch\(prd\.acceptance_criteria,/);
    expect(code).toMatch(/for \(let i = 0; i < storySourceCriteria\.length; i\+\+\)/);
    expect(code).toMatch(/const criterion = storySourceCriteria\[i\];/);
  });

  it('storySourceCriteria is defined before its first use (generateStoriesBatch call)', () => {
    const defIdx = code.indexOf('const storySourceCriteria');
    const useIdx = code.indexOf('generateStoriesBatch(storySourceCriteria,');
    expect(defIdx).toBeGreaterThan(0);
    expect(useIdx).toBeGreaterThan(0);
    expect(defIdx).toBeLessThan(useIdx);
  });
});
