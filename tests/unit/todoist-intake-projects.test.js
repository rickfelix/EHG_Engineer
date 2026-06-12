/**
 * Quick-fix QF-20260612-416: distill Todoist sync scoped to the dedicated
 * for-processing project by default; env-configurable per run.
 */
import { describe, it, expect } from 'vitest';
import { getTargetProjects } from '../../lib/integrations/todoist/todoist-sync.js';

describe('getTargetProjects (QF-20260612-416)', () => {
  it('defaults to ONLY the for-processing project id', () => {
    expect(getTargetProjects({})).toEqual(['6gfJpjh9Ghvv8fFq']);
  });

  it('does not include the legacy EVA projects in the default', () => {
    const defaults = getTargetProjects({});
    expect(defaults).not.toContain('EVA');
    expect(defaults).not.toContain('EVA Next Steps');
  });

  it('TODOIST_INTAKE_PROJECTS env overrides the default (comma-separated, trimmed)', () => {
    expect(getTargetProjects({ TODOIST_INTAKE_PROJECTS: '6Wrq3gHw2j3gC2Gw, someName' }))
      .toEqual(['6Wrq3gHw2j3gC2Gw', 'someName']);
  });

  it('blank/whitespace env falls back to the default', () => {
    expect(getTargetProjects({ TODOIST_INTAKE_PROJECTS: '   ' })).toEqual(['6gfJpjh9Ghvv8fFq']);
  });

  it('returns a fresh array (no shared-mutation of the default)', () => {
    const a = getTargetProjects({});
    a.push('mutated');
    expect(getTargetProjects({})).toEqual(['6gfJpjh9Ghvv8fFq']);
  });
});
