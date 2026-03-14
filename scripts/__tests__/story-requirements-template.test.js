import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

describe('story-requirements-template', () => {
  const scriptPath = path.resolve('scripts/story-requirements-template.js');

  it('outputs structural requirements section', () => {
    const output = execSync(`node ${scriptPath}`, { encoding: 'utf8', timeout: 15000 });
    expect(output).toContain('STRUCTURAL REQUIREMENTS');
    expect(output).toContain('implementation_context');
    expect(output).toContain('given_when_then');
    expect(output).toContain('testing_scenarios');
    expect(output).toContain('architecture_references');
  });

  it('outputs semantic quality criteria', () => {
    const output = execSync(`node ${scriptPath}`, { encoding: 'utf8', timeout: 15000 });
    expect(output).toContain('SEMANTIC QUALITY CRITERIA');
    expect(output).toContain('Acceptance Criteria Clarity');
    expect(output).toContain('50%');
    expect(output).toContain('Benefit Articulation');
  });

  it('outputs SD type thresholds', () => {
    const output = execSync(`node ${scriptPath}`, { encoding: 'utf8', timeout: 15000 });
    expect(output).toContain('SD TYPE THRESHOLDS');
    expect(output).toContain('infrastructure');
    expect(output).toContain('feature');
    expect(output).toContain('security');
  });

  it('outputs example story', () => {
    const output = execSync(`node ${scriptPath}`, { encoding: 'utf8', timeout: 15000 });
    expect(output).toContain('EXAMPLE STORY');
    expect(output).toContain('user_role');
    expect(output).toContain('user_benefit');
  });

  it('outputs validator source files', () => {
    const output = execSync(`node ${scriptPath}`, { encoding: 'utf8', timeout: 15000 });
    expect(output).toContain('VALIDATOR SOURCE');
    expect(output).toContain('user-story-quality-rubric.js');
  });

  it('shows default threshold without SD-KEY', () => {
    const output = execSync(`node ${scriptPath}`, { encoding: 'utf8', timeout: 15000 });
    expect(output).toContain('Default Threshold: 70%');
  });
});
