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
    expect(code).toMatch(/const storySourceCriteria = \(prd\.functional_requirements && prd\.functional_requirements\.length > 0\)/);
    expect(code).toMatch(/\?\s*prd\.functional_requirements\.map\(fr => fr\.title \|\| fr\.description \|\| String\(fr\)\)/);
    expect(code).toMatch(/:\s*\(prd\.acceptance_criteria \|\| \[\]\)/);
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
