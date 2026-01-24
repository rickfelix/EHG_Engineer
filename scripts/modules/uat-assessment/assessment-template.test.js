/**
 * UAT Assessment Template Tests
 * Verifies modular structure and backward compatibility
 *
 * @module assessment-template.test
 */

import { describe, it, expect } from 'vitest';

// Test backward-compatible import
import {
  comprehensiveAssessment,
  headerSection,
  pageIntentSection,
  backendEvaluationSection,
  uiUxAssessmentSection,
  integrationCheckSection,
  subAgentResponsibilitiesSection,
  testingScopeSection,
  summarySection,
} from './assessment-template.js';

// Test direct section imports
import { comprehensiveAssessment as assembledTemplate } from './sections/index.js';

describe('UAT Assessment Template - Backward Compatibility', () => {
  it('should export comprehensiveAssessment from main module', () => {
    expect(comprehensiveAssessment).toBeDefined();
    expect(typeof comprehensiveAssessment).toBe('string');
  });

  it('should export the same template from both entry points', () => {
    expect(comprehensiveAssessment).toBe(assembledTemplate);
  });

  it('should contain all major sections in correct order', () => {
    const sectionMarkers = [
      '# Chairman Console',
      '## 1. PAGE INTENT & CONTEXT',
      '## 2. BACKEND EVALUATION',
      '## 3. UI/UX ASSESSMENT',
      '## 4. INTEGRATION CHECK',
      '## 5. SUB-AGENT RESPONSIBILITIES',
      '## TESTING SCOPE FOR MANUAL UAT',
      '## PRIORITY ACTIONS SUMMARY',
    ];

    let lastIndex = -1;
    for (const marker of sectionMarkers) {
      const index = comprehensiveAssessment.indexOf(marker);
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });
});

describe('UAT Assessment Template - Section Exports', () => {
  it('should export headerSection', () => {
    expect(headerSection).toBeDefined();
    expect(headerSection).toContain('Chairman Console');
    expect(headerSection).toContain('Test ID');
  });

  it('should export pageIntentSection', () => {
    expect(pageIntentSection).toBeDefined();
    expect(pageIntentSection).toContain('PAGE INTENT & CONTEXT');
    expect(pageIntentSection).toContain('Primary Purpose');
  });

  it('should export backendEvaluationSection', () => {
    expect(backendEvaluationSection).toBeDefined();
    expect(backendEvaluationSection).toContain('BACKEND EVALUATION');
    expect(backendEvaluationSection).toContain('Portfolio Metrics');
  });

  it('should export uiUxAssessmentSection', () => {
    expect(uiUxAssessmentSection).toBeDefined();
    expect(uiUxAssessmentSection).toContain('UI/UX ASSESSMENT');
    expect(uiUxAssessmentSection).toContain('Accessibility');
  });

  it('should export integrationCheckSection', () => {
    expect(integrationCheckSection).toBeDefined();
    expect(integrationCheckSection).toContain('INTEGRATION CHECK');
    expect(integrationCheckSection).toContain('Frontend-Backend');
  });

  it('should export subAgentResponsibilitiesSection', () => {
    expect(subAgentResponsibilitiesSection).toBeDefined();
    expect(subAgentResponsibilitiesSection).toContain('SUB-AGENT RESPONSIBILITIES');
    expect(subAgentResponsibilitiesSection).toContain('Design Sub-Agent');
  });

  it('should export testingScopeSection', () => {
    expect(testingScopeSection).toBeDefined();
    expect(testingScopeSection).toContain('TESTING SCOPE');
    expect(testingScopeSection).toContain('Navigation');
  });

  it('should export summarySection', () => {
    expect(summarySection).toBeDefined();
    expect(summarySection).toContain('PRIORITY ACTIONS');
    expect(summarySection).toContain('QA TEAM');
  });
});

describe('UAT Assessment Template - Assembled Template', () => {
  it('should assemble all sections into comprehensive template', () => {
    // Verify all sections are present
    expect(comprehensiveAssessment).toContain(headerSection);
    expect(comprehensiveAssessment).toContain(pageIntentSection);
    expect(comprehensiveAssessment).toContain(backendEvaluationSection);
    expect(comprehensiveAssessment).toContain(uiUxAssessmentSection);
    expect(comprehensiveAssessment).toContain(integrationCheckSection);
    expect(comprehensiveAssessment).toContain(subAgentResponsibilitiesSection);
    expect(comprehensiveAssessment).toContain(testingScopeSection);
    expect(comprehensiveAssessment).toContain(summarySection);
  });

  it('should have substantial content length', () => {
    // Original was ~1252 lines, should be similar
    const lineCount = comprehensiveAssessment.split('\n').length;
    expect(lineCount).toBeGreaterThan(500);
  });

  it('should maintain proper markdown structure', () => {
    // Check for proper heading hierarchy
    expect(comprehensiveAssessment).toMatch(/^# /m); // H1
    expect(comprehensiveAssessment).toMatch(/^## /m); // H2
    expect(comprehensiveAssessment).toMatch(/^### /m); // H3
    expect(comprehensiveAssessment).toMatch(/^#### /m); // H4
  });
});
