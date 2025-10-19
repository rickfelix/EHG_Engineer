#!/usr/bin/env node
/**
 * Integration Checker Module
 * Enhanced QA Engineering Director v2.0
 *
 * Verifies components are actually integrated (imported and used).
 * Impact: Catches integration gaps during EXEC, saves 30-60 minutes.
 */

import { execSync } from 'child_process';
import path from 'path';

/**
 * Verify component integration
 * @param {string[]} componentPaths - Array of component file paths
 * @param {string} targetApp - 'ehg' or 'EHG_Engineer'
 * @returns {Promise<Object>} Integration check results
 */
export async function verifyComponentIntegration(componentPaths, targetApp = 'ehg') {
  const appPath = targetApp === 'ehg'
    ? '/mnt/c/_EHG/ehg'
    : '/mnt/c/_EHG/EHG_Engineer';

  console.log(`🔍 Integration Checker: Verifying ${componentPaths.length} component(s)...`);

  const results = [];

  // Performance optimization: Batch all component names into single grep
  const componentNames = componentPaths.map(extractComponentName);

  if (componentNames.length === 0) {
    return {
      verdict: 'PASS',
      components_checked: 0,
      integrations_found: 0,
      warnings_count: 0,
      warnings: [],
      integrated: [],
      details: [],
      app: targetApp,
      summary: 'No components to check'
    };
  }

  // Build regex pattern for all components (batched grep - 100x faster)
  const pattern = componentNames.join('|');
  const grepCommand = `grep -rE "from.*(${pattern})" ${appPath}/src/ 2>/dev/null || true`;

  let allMatches = '';
  try {
    allMatches = execSync(grepCommand, {
      encoding: 'utf8',
      stdio: 'pipe'
    });
  } catch (error) {
    // grep failed - continue with empty matches
  }

  // Process each component by filtering batched results
  for (let i = 0; i < componentPaths.length; i++) {
    const componentPath = componentPaths[i];
    const componentName = componentNames[i];

    // Find all lines matching this specific component
    const lines = allMatches
      .split('\n')
      .filter(line => {
        // Must contain component name and import statement
        return line.trim() &&
               line.includes(componentName) &&
               line.includes('from');
      });

    // Subtract 1 for the component file itself (self-import)
    const importCount = Math.max(0, lines.length - 1);

    if (importCount === 0) {
      results.push({
        component: componentName,
        path: componentPath,
        verdict: 'WARNING',
        issue: 'Component built but not integrated (0 imports)',
        recommendation: 'Verify PRD requirement - component may be unused or integration incomplete',
        severity: 'medium',
        import_count: 0
      });
    } else {
      results.push({
        component: componentName,
        path: componentPath,
        verdict: 'INTEGRATED',
        import_count: importCount,
        import_locations: lines.slice(0, 5).map(l => l.split(':')[0]), // First 5 files
        severity: 'none'
      });
    }
  }

  const warnings = results.filter(r => r.verdict === 'WARNING');
  const integrated = results.filter(r => r.verdict === 'INTEGRATED');

  return {
    verdict: warnings.length > 0 ? 'WARNING' : 'PASS',
    components_checked: results.length,
    integrations_found: integrated.length,
    warnings_count: warnings.length,
    warnings: warnings,
    integrated: integrated,
    details: results,
    app: targetApp,
    summary: `${integrated.length}/${results.length} components integrated, ${warnings.length} warnings`
  };
}

/**
 * Extract component name from file path
 */
function extractComponentName(filePath) {
  const filename = filePath.split('/').pop();
  return filename.replace(/\.(tsx|ts|jsx|js)$/, '');
}

/**
 * Find new components (created/modified in last 24 hours)
 * Limited to 50 most recent for performance
 */
export async function findNewComponents(targetApp = 'ehg') {
  const appPath = targetApp === 'ehg'
    ? '/mnt/c/_EHG/ehg/src/components'
    : '/mnt/c/_EHG/EHG_Engineer/src/client/src/components';

  try {
    // Find components modified in last 24 hours, sort by modification time
    const findCommand = `find ${appPath} -type f \\( -name "*.tsx" -o -name "*.jsx" \\) -mtime -1 -printf '%T@ %p\\n' 2>/dev/null | sort -rn | head -50 | cut -d' ' -f2-`;
    const output = execSync(findCommand, {
      encoding: 'utf8',
      stdio: 'pipe'
    });

    const files = output.split('\n').filter(f => f.trim());
    return files;
  } catch (error) {
    // Fallback: simpler find without sorting (macOS/WSL compatibility)
    try {
      const fallbackCommand = `find ${appPath} -type f \\( -name "*.tsx" -o -name "*.jsx" \\) -mtime -1 2>/dev/null | head -50`;
      const output = execSync(fallbackCommand, {
        encoding: 'utf8',
        stdio: 'pipe'
      });
      return output.split('\n').filter(f => f.trim());
    } catch {
      return [];
    }
  }
}
