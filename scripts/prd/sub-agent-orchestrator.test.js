import { describe, it, expect } from 'vitest';
import { needsDesignAnalysis, needsDatabaseAnalysis } from './sub-agent-orchestrator.js';

describe('needsDesignAnalysis', () => {
  it('returns true for sd_type=feature (default code path)', () => {
    expect(needsDesignAnalysis({ sd_type: 'feature' })).toBe(true);
  });

  it('returns true for sd_type=bugfix (default code path)', () => {
    expect(needsDesignAnalysis({ sd_type: 'bugfix' })).toBe(true);
  });

  it('returns false for sd_type=infrastructure with no UI keywords', () => {
    expect(needsDesignAnalysis({ sd_type: 'infrastructure', scope: 'CLI tool', description: 'cleanup engine' })).toBe(false);
  });

  it('returns false for sd_type=documentation with no UI keywords', () => {
    expect(needsDesignAnalysis({ sd_type: 'documentation', scope: 'docs only' })).toBe(false);
  });

  it('returns true for sd_type=infrastructure WHEN scope mentions UI', () => {
    expect(needsDesignAnalysis({ sd_type: 'infrastructure', scope: 'add dashboard component' })).toBe(true);
  });

  it('returns true for sd_type=refactor WHEN key_changes mentions wireframe', () => {
    expect(needsDesignAnalysis({ sd_type: 'refactor', key_changes: [{ change: 'redo wireframe layout' }] })).toBe(true);
  });

  it('falls back to category when sd_type is missing', () => {
    expect(needsDesignAnalysis({ category: 'infrastructure', scope: 'CLI' })).toBe(false);
    expect(needsDesignAnalysis({ category: 'feature' })).toBe(true);
  });
});

describe('needsDatabaseAnalysis', () => {
  it('returns true for sd_type=database always', () => {
    expect(needsDatabaseAnalysis({ sd_type: 'database', scope: 'unrelated text' })).toBe(true);
  });

  it('returns true for sd_type=feature (default code path)', () => {
    expect(needsDatabaseAnalysis({ sd_type: 'feature' })).toBe(true);
  });

  it('returns false for sd_type=infrastructure with no data-model keywords', () => {
    expect(needsDatabaseAnalysis({ sd_type: 'infrastructure', scope: 'CLI tool', description: 'cleanup engine' })).toBe(false);
  });

  it('returns true for sd_type=infrastructure WHEN scope mentions migration', () => {
    expect(needsDatabaseAnalysis({ sd_type: 'infrastructure', scope: 'add migration for table foo' })).toBe(true);
  });

  it('returns true for sd_type=refactor WHEN description mentions schema', () => {
    expect(needsDatabaseAnalysis({ sd_type: 'refactor', description: 'rework schema for X' })).toBe(true);
  });

  it('returns false for sd_type=documentation with no data keywords', () => {
    expect(needsDatabaseAnalysis({ sd_type: 'documentation', scope: 'docs only' })).toBe(false);
  });
});
