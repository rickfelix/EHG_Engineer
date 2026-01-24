/**
 * Recommendations Domain
 * Generates prioritized recommendations from analysis results
 *
 * @module playwright-analyzer/recommendations
 */

/**
 * Generate recommendations based on analysis results
 * @param {Object} results - Complete analysis results
 * @returns {Array} Prioritized recommendations
 */
export function generateRecommendations(results) {
  const recommendations = [];

  // High Priority - End-to-End Flow
  if (results.endToEndFlow.issues.length > 0) {
    recommendations.push({
      priority: 'HIGH',
      category: 'Process Flow',
      title: 'Improve User Journey Guidance',
      description: 'The multi-step process needs better visual guidance',
      actions: [
        'Add a persistent progress indicator showing current step and total steps',
        'Implement breadcrumb navigation for context',
        'Add "Save and Continue Later" functionality',
        'Include time estimates for each step',
        'Add contextual help tooltips for complex fields'
      ]
    });
  }

  // High Priority - Consistency
  if (results.consistency.issues.find(i => i.type === 'INCONSISTENT_BUTTONS')) {
    recommendations.push({
      priority: 'HIGH',
      category: 'Visual Consistency',
      title: 'Standardize Button System',
      description: 'Multiple button styles create confusion',
      actions: [
        'Create 3 button variants: primary (main CTA), secondary (alternate actions), ghost (tertiary)',
        'Ensure consistent padding: 12px vertical, 24px horizontal',
        'Standardize border-radius to 8px across all buttons',
        'Implement consistent hover/active states',
        'Use consistent disabled state styling'
      ]
    });
  }

  // High Priority - Mobile Experience
  if (results.responsive.issues.find(i => i.viewport === 'mobile')) {
    recommendations.push({
      priority: 'HIGH',
      category: 'Mobile Experience',
      title: 'Fix Mobile Navigation',
      description: 'Mobile users face navigation and interaction issues',
      actions: [
        'Implement stack-based navigation for mobile (no side panels)',
        'Increase touch targets to minimum 44x44px',
        'Add swipe gestures for step navigation',
        'Implement sticky action buttons at bottom',
        'Ensure forms are single-column on mobile'
      ]
    });
  }

  // Medium Priority - Form Experience
  if (!results.interactions.forms.hasValidation) {
    recommendations.push({
      priority: 'MEDIUM',
      category: 'Form UX',
      title: 'Enhance Form Validation',
      description: 'Forms lack real-time validation and feedback',
      actions: [
        'Add inline validation with immediate feedback',
        'Show success checkmarks for valid fields',
        'Display helpful error messages with correction hints',
        'Implement auto-save for form progress',
        'Add field format hints (e.g., date format)'
      ]
    });
  }

  // Medium Priority - Accessibility
  if (results.accessibility.violations && results.accessibility.violations.length > 0) {
    const critical = results.accessibility.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
    if (critical.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Accessibility',
        title: 'Fix Critical Accessibility Issues',
        description: `${critical.length} critical WCAG violations found`,
        actions: critical.slice(0, 5).map(v => v.description)
      });
    }
  }

  // Low Priority - Performance
  if (results.performance.loadTime > 2000) {
    recommendations.push({
      priority: 'LOW',
      category: 'Performance',
      title: 'Optimize Loading Performance',
      description: `Page loads in ${results.performance.loadTime}ms (target: <2000ms)`,
      actions: [
        'Implement code splitting for large components',
        'Lazy load non-critical resources',
        'Optimize and compress images',
        'Enable browser caching',
        'Consider using a CDN for static assets'
      ]
    });
  }

  return recommendations;
}

export default { generateRecommendations };
