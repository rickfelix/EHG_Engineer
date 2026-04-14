import { describe, it, expect } from 'vitest';
import { generateUATTestPlan } from '../../../../lib/eva/bridge/uat-test-plan-generator.js';

describe('generateUATTestPlan', () => {
  it('returns empty plan for empty sprint items', () => {
    const result = generateUATTestPlan([]);
    expect(result.testPlan).toEqual([]);
    expect(result.summary.totalScenarios).toBe(0);
    expect(result.summary.itemsCovered).toBe(0);
  });

  it('returns empty plan for undefined input', () => {
    const result = generateUATTestPlan();
    expect(result.testPlan).toEqual([]);
  });

  it('generates scenarios from acceptance criteria', () => {
    const items = [{
      name: 'User login',
      description: 'Implement user login with email and password',
      acceptanceCriteria: 'User can log in with valid credentials; Error shown for invalid credentials',
      architectureLayer: 'frontend',
    }];
    const result = generateUATTestPlan(items);
    expect(result.summary.itemsCovered).toBe(1);
    expect(result.summary.totalScenarios).toBe(2);
    expect(result.testPlan[0].scenarios[0].title).toContain('Verify:');
    expect(result.testPlan[0].scenarios[0].expectedResult).toContain('valid credentials');
    expect(result.testPlan[0].scenarios[1].expectedResult).toContain('invalid credentials');
  });

  it('generates fallback scenario when no acceptance criteria', () => {
    const items = [{
      name: 'Dashboard page',
      description: 'Build a dashboard showing key metrics',
    }];
    const result = generateUATTestPlan(items);
    expect(result.summary.totalScenarios).toBe(1);
    expect(result.testPlan[0].scenarios[0].title).toContain('Dashboard page');
    expect(result.testPlan[0].scenarios[0].expectedResult).toContain('key metrics');
  });

  it('uses repo analysis routes in frontend steps', () => {
    const items = [{
      name: 'About page',
      description: 'Create about page',
      acceptanceCriteria: 'About page loads correctly',
      architectureLayer: 'frontend',
    }];
    const repoAnalysis = {
      files: [
        { path: 'src/pages/index.tsx' },
        { path: 'src/pages/about.tsx' },
        { path: 'src/pages/dashboard.tsx' },
      ],
      structure: { hasTests: true, hasSrc: true },
    };
    const result = generateUATTestPlan(items, repoAnalysis);
    const steps = result.testPlan[0].scenarios[0].steps;
    expect(steps.some(s => s.includes('/about') || s.includes('Navigate'))).toBe(true);
    expect(steps.some(s => s.includes('test suite'))).toBe(true);
  });

  it('handles backend architecture layer', () => {
    const items = [{
      name: 'API endpoint',
      description: 'Create REST endpoint',
      acceptanceCriteria: 'Returns 200 for valid request',
      architectureLayer: 'backend',
    }];
    const result = generateUATTestPlan(items);
    const steps = result.testPlan[0].scenarios[0].steps;
    expect(steps[0]).toContain('API endpoint');
  });

  it('includes sprint item reference and index', () => {
    const items = [
      { name: 'Feature A', description: 'First feature' },
      { name: 'Feature B', description: 'Second feature' },
    ];
    const result = generateUATTestPlan(items);
    expect(result.testPlan[0].sprintItemRef).toBe('Feature A');
    expect(result.testPlan[0].sprintItemIndex).toBe(0);
    expect(result.testPlan[1].sprintItemRef).toBe('Feature B');
    expect(result.testPlan[1].sprintItemIndex).toBe(1);
  });
});
