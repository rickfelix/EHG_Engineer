/**
 * DESIGN Sub-Agent Pattern Analysis
 * Codebase pattern scanning and consistency checking
 *
 * Extracted from design.js for modularity
 * SD-LEO-REFACTOR-DESIGN-SUB-001
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

/**
 * Analyze codebase for existing patterns (error handling, confirmations, forms, etc.)
 *
 * Scans repository to learn from existing patterns and recommend consistency.
 * Results are cached in .workflow-patterns.json for performance.
 *
 * @param {string} repoPath - Path to repository
 * @returns {Promise<Object>} Pattern analysis with frequencies
 */
export async function analyzeCodebasePatterns(repoPath) {
  const patterns = {
    error_recovery: [],
    confirmation_modals: [],
    form_validation: [],
    loading_patterns: [],
    navigation: [],
    last_scan: new Date().toISOString()
  };

  try {
    // 1. Scan for error boundary patterns
    const { stdout: errorBoundaries } = await execAsync(
      `cd "${repoPath}" && grep -r "ErrorBoundary\\|useErrorHandler\\|try.*catch\\|\.catch(" src/ --include="*.jsx" --include="*.tsx" --include="*.js" --include="*.ts" 2>/dev/null | wc -l`
    );
    const errorCount = parseInt(errorBoundaries.trim()) || 0;

    if (errorCount > 0) {
      // Find actual implementations
      const { stdout: errorExamples } = await execAsync(
        `cd "${repoPath}" && grep -r "ErrorBoundary\\|try.*catch" src/ --include="*.jsx" --include="*.tsx" -A 3 2>/dev/null | head -20`
      );
      patterns.error_recovery.push({
        pattern: 'ErrorBoundary / try-catch',
        count: errorCount,
        confidence: errorCount >= 10 ? 'high' : errorCount >= 3 ? 'medium' : 'low',
        examples: errorExamples.split('\n').slice(0, 3)
      });
    }

    // 2. Scan for confirmation modal patterns
    const { stdout: confirmations } = await execAsync(
      `cd "${repoPath}" && grep -ri "confirm\\|AlertDialog\\|ConfirmDialog\\|Modal.*destructive" src/ --include="*.jsx" --include="*.tsx" 2>/dev/null | wc -l`
    );
    const confirmCount = parseInt(confirmations.trim()) || 0;

    if (confirmCount > 0) {
      patterns.confirmation_modals.push({
        pattern: 'Confirmation Dialog',
        count: confirmCount,
        confidence: confirmCount >= 10 ? 'high' : confirmCount >= 3 ? 'medium' : 'low'
      });
    }

    // 3. Scan for form validation patterns
    const { stdout: formValidation } = await execAsync(
      `cd "${repoPath}" && grep -ri "yup\\|zod\\|validation.*schema\\|useForm\\|FormProvider" src/ --include="*.jsx" --include="*.tsx" --include="*.js" --include="*.ts" 2>/dev/null | wc -l`
    );
    const formCount = parseInt(formValidation.trim()) || 0;

    if (formCount > 0) {
      // Detect validation library
      const { stdout: hasYup } = await execAsync(
        `cd "${repoPath}" && grep -r "yup" src/ 2>/dev/null | wc -l`
      );
      const { stdout: hasZod } = await execAsync(
        `cd "${repoPath}" && grep -r "zod" src/ 2>/dev/null | wc -l`
      );

      const yupCount = parseInt(hasYup.trim()) || 0;
      const zodCount = parseInt(hasZod.trim()) || 0;

      const library = yupCount > zodCount ? 'yup' : zodCount > 0 ? 'zod' : 'react-hook-form';

      patterns.form_validation.push({
        pattern: `Form validation (${library})`,
        count: formCount,
        library,
        confidence: formCount >= 10 ? 'high' : formCount >= 3 ? 'medium' : 'low'
      });
    }

    // 4. Scan for loading state patterns
    const { stdout: loadingStates } = await execAsync(
      `cd "${repoPath}" && grep -ri "isLoading\\|loading\\|Skeleton\\|Spinner" src/ --include="*.jsx" --include="*.tsx" 2>/dev/null | wc -l`
    );
    const loadingCount = parseInt(loadingStates.trim()) || 0;

    if (loadingCount > 0) {
      patterns.loading_patterns.push({
        pattern: 'Loading states (isLoading, Skeleton)',
        count: loadingCount,
        confidence: loadingCount >= 10 ? 'high' : loadingCount >= 3 ? 'medium' : 'low'
      });
    }

    // 5. Scan for navigation patterns (React Router, Next.js)
    const { stdout: navigationPatterns } = await execAsync(
      `cd "${repoPath}" && grep -ri "useNavigate\\|useRouter\\|router\\.push\\|navigate(" src/ --include="*.jsx" --include="*.tsx" --include="*.js" --include="*.ts" 2>/dev/null | wc -l`
    );
    const navCount = parseInt(navigationPatterns.trim()) || 0;

    if (navCount > 0) {
      patterns.navigation.push({
        pattern: 'Programmatic navigation',
        count: navCount,
        confidence: navCount >= 10 ? 'high' : navCount >= 3 ? 'medium' : 'low'
      });
    }

  } catch (error) {
    console.warn(`   ⚠️  Pattern scanning error: ${error.message}`);
  }

  return patterns;
}

/**
 * Load or scan codebase patterns (with caching)
 *
 * @param {string} repoPath - Path to repository
 * @param {Object} options - Options including cache path
 * @returns {Promise<Object>} Cached or fresh pattern analysis
 */
export async function loadOrScanPatterns(repoPath, options = {}) {
  const cacheFile = options.patternCacheFile || '.workflow-patterns.json';
  const cacheMaxAge = options.cacheMaxAgeHours || 24; // Cache for 24 hours by default

  // Try to load from cache
  try {
    const cacheData = await fs.readFile(cacheFile, 'utf8');
    const cachedPatterns = JSON.parse(cacheData);

    // Check if cache is still valid
    const cacheAge = new Date() - new Date(cachedPatterns.last_scan);
    const cacheAgeHours = cacheAge / (1000 * 60 * 60);

    if (cacheAgeHours < cacheMaxAge) {
      console.log(`   📦 Using cached patterns (${Math.round(cacheAgeHours)}h old)`);
      return cachedPatterns;
    }
  } catch {
    // Cache doesn't exist or is invalid, will scan
  }

  // Scan codebase and cache results
  console.log('   🔍 Scanning codebase for patterns...');
  const patterns = await analyzeCodebasePatterns(repoPath);

  // Save to cache
  try {
    await fs.writeFile(cacheFile, JSON.stringify(patterns, null, 2));
    console.log(`   ✅ Patterns cached to ${cacheFile}`);
  } catch (error) {
    console.warn(`   ⚠️  Could not cache patterns: ${error.message}`);
  }

  return patterns;
}

/**
 * Check if a user story should use existing codebase patterns
 *
 * @param {Object} userStory - User story to analyze
 * @param {Object} codebasePatterns - Discovered patterns from codebase
 * @returns {Array<Object>} Pattern-based recommendations
 */
export function checkAgainstPatterns(userStory, codebasePatterns) {
  const recommendations = [];

  const storyText = [
    userStory.title,
    userStory.user_want,
    userStory.implementation_context
  ].join(' ').toLowerCase();

  // Check for error recovery needs
  if (/submit|save|update|delete|api|fetch/i.test(storyText) &&
      codebasePatterns.error_recovery.length > 0) {
    const pattern = codebasePatterns.error_recovery[0];
    recommendations.push({
      priority: 'MEDIUM',
      category: 'consistency',
      pattern: pattern.pattern,
      action: 'Add error recovery pattern',
      rationale: `Codebase uses ${pattern.pattern} in ${pattern.count} places`,
      confidence: pattern.confidence === 'high' ? 0.90 : pattern.confidence === 'medium' ? 0.75 : 0.60
    });
  }

  // Check for confirmation needs on destructive actions
  if (/delete|remove|cancel.*subscription|deactivate/i.test(storyText) &&
      codebasePatterns.confirmation_modals.length > 0) {
    const pattern = codebasePatterns.confirmation_modals[0];
    recommendations.push({
      priority: 'HIGH',
      category: 'consistency',
      pattern: pattern.pattern,
      action: 'Add confirmation modal before destructive action',
      rationale: `Codebase uses ${pattern.pattern} in ${pattern.count} places`,
      confidence: pattern.confidence === 'high' ? 0.95 : pattern.confidence === 'medium' ? 0.80 : 0.65
    });
  }

  // Check for form validation needs
  if (/form|input|field|validation/i.test(storyText) &&
      codebasePatterns.form_validation.length > 0) {
    const pattern = codebasePatterns.form_validation[0];
    recommendations.push({
      priority: 'MEDIUM',
      category: 'consistency',
      pattern: pattern.pattern,
      action: `Use ${pattern.library} for form validation`,
      rationale: `Codebase standardizes on ${pattern.library} (${pattern.count} uses)`,
      confidence: pattern.confidence === 'high' ? 0.92 : pattern.confidence === 'medium' ? 0.77 : 0.62
    });
  }

  // Check for loading state needs
  if (/fetch|load|api|query|async/i.test(storyText) &&
      codebasePatterns.loading_patterns.length > 0) {
    const pattern = codebasePatterns.loading_patterns[0];
    recommendations.push({
      priority: 'LOW',
      category: 'consistency',
      pattern: pattern.pattern,
      action: 'Add loading state indicator',
      rationale: `Codebase uses loading patterns in ${pattern.count} places`,
      confidence: pattern.confidence === 'high' ? 0.85 : pattern.confidence === 'medium' ? 0.70 : 0.55
    });
  }

  return recommendations;
}
