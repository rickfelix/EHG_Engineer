/**
 * Unit tests for ContentBasedRubric
 * @sd SD-LEO-INFRA-TYPE-CONTENT-BASED-001
 */

import { describe, it, expect } from 'vitest';
import { ContentBasedRubric } from '../../scripts/modules/sd-type-content-rubric.js';

describe('ContentBasedRubric', () => {
  const rubric = new ContentBasedRubric();

  it('scores infrastructure SD correctly', () => {
    const sd = {
      title: 'Build LEO Protocol validation scripts',
      scope: 'Create automation tooling for CI/CD pipeline',
      description: 'Add script to validate gate handoff workflow',
      key_changes: ['add script', 'create tool', 'update pipeline'],
      sd_type: 'infrastructure'
    };
    const result = rubric.score(sd);
    expect(result.recommendedType).toBe('infrastructure');
    expect(result.confidence).toBeGreaterThan(30);
    expect(result.source).toBe('content_rubric');
  });

  it('scores feature SD correctly', () => {
    const sd = {
      title: 'Build dashboard component',
      scope: 'Create React frontend page with form and dialog',
      description: 'User-facing UI component for navigation sidebar',
      key_changes: ['build component', 'create page', 'add form'],
      sd_type: 'feature'
    };
    const result = rubric.score(sd);
    expect(result.recommendedType).toBe('feature');
    expect(result.confidence).toBeGreaterThan(30);
  });

  it('scores database SD correctly', () => {
    const sd = {
      title: 'Add venture_artifacts table',
      scope: 'Schema migration for new table with index and RLS',
      description: 'Create table, add column, add trigger for postgres supabase',
      key_changes: ['create table', 'add column', 'add index'],
      sd_type: 'database'
    };
    const result = rubric.score(sd);
    expect(result.recommendedType).toBe('database');
    expect(result.confidence).toBeGreaterThan(40);
  });

  it('returns runner-up type', () => {
    const sd = {
      title: 'Some SD',
      scope: 'scope text',
      description: 'description',
      key_changes: [],
      sd_type: 'feature'
    };
    const result = rubric.score(sd);
    expect(result).toHaveProperty('runnerUpType');
    expect(result).toHaveProperty('runnerUpConfidence');
  });

  it('handles empty SD gracefully', () => {
    const sd = { title: '', scope: '', description: '', key_changes: [], sd_type: '' };
    const result = rubric.score(sd);
    expect(result).toHaveProperty('recommendedType');
    expect(result.confidence).toBe(0);
  });

  it('uses PRD indicators when provided', () => {
    const sd = {
      title: 'Build API feature',
      scope: 'Create endpoints',
      description: 'New feature with UI',
      key_changes: [],
      sd_type: 'feature'
    };
    const prd = {
      ui_ux_requirements: [{ id: 1, desc: 'dashboard layout' }],
      api_specifications: { endpoints: ['/api/v1/test'] }
    };
    const result = rubric.score(sd, prd);
    // PRD indicators should boost feature score
    expect(result.scores.feature.prd).toBeGreaterThan(0);
  });
});
