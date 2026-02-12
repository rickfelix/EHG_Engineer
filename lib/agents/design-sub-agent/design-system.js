/**
 * Design System Compliance Checks
 * Validates design system usage and token compliance
 *
 * Extracted from design-sub-agent.js for modularity
 * SD-LEO-REFACTOR-DESIGN-AGENT-001
 * CVA Pattern Enforcement: SD-LEO-ORCH-AESTHETIC-DESIGN-SYSTEM-001-B
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { SEVERITY } from './constants.js';
import { getCSSFiles, getComponentFiles } from './file-helpers.js';

/**
 * Check design system compliance
 * @param {string} basePath - Base path to scan
 * @param {Object} options - File scanning options
 * @returns {Promise<Object>} Design system compliance results
 */
export async function checkDesignSystem(basePath, options = {}) {
  const results = {
    tokens: {},
    components: {},
    compliance: 0,
    issues: []
  };

  // Look for design tokens/variables
  const cssFiles = await getCSSFiles(basePath, options);
  let hasVariables = false;
  let hasTokens = false;

  for (const file of cssFiles) {
    const content = await fs.readFile(file, 'utf8');

    // Check for CSS variables
    if (/--\w+:/gi.test(content)) {
      hasVariables = true;
      const variables = content.match(/--[\w-]+:/gi) || [];
      results.tokens.cssVariables = variables.length;
    }

    // Check for design token usage
    if (/var\(--/gi.test(content)) {
      hasTokens = true;
      const usage = content.match(/var\(--[\w-]+\)/gi) || [];
      results.tokens.usage = usage.length;
    }

    // Check for hard-coded values
    const hardcodedColors = content.match(/#[0-9a-f]{3,6}/gi) || [];
    if (hardcodedColors.length > 10) {
      results.issues.push({
        type: 'HARDCODED_COLORS',
        count: hardcodedColors.length,
        file: path.relative(process.cwd(), file),
        severity: SEVERITY.MEDIUM,
        fix: 'Use CSS variables or design tokens for colors'
      });
    }
  }

  // Check component structure
  const componentFiles = await getComponentFiles(basePath, options);
  const componentPatterns = {
    atomic: 0,
    compound: 0,
    composed: 0
  };

  for (const file of componentFiles) {
    const name = path.basename(file);

    if (/^(Atom|Molecule|Organism)/i.test(name)) {
      componentPatterns.atomic++;
    } else if (/^(Base|Core|Ui)/i.test(name)) {
      componentPatterns.compound++;
    }
  }

  results.components = componentPatterns;

  // Calculate compliance score
  let score = 0;
  if (hasVariables) score += 25;
  if (hasTokens) score += 25;
  if (results.issues.length === 0) score += 25;
  if (componentPatterns.atomic > 0 || componentPatterns.compound > 0) score += 25;

  results.compliance = score;

  results.status = score >= 75 ? 'PASS' : score >= 50 ? 'WARNING' : 'FAIL';

  return results;
}

/**
 * CVA Pattern Detection Constants
 * @sd SD-LEO-ORCH-AESTHETIC-DESIGN-SYSTEM-001-B
 */
const CVA_PATTERNS = {
  // Pattern to detect CVA imports
  cvaImport: /import\s*{\s*(?:cva|type\s+VariantProps)[^}]*}\s*from\s*["']class-variance-authority["']/,

  // Pattern to detect CVA variant definitions
  cvaDefinition: /(?:const|let)\s+(\w+)Variants?\s*=\s*cva\s*\(/,

  // Pattern to detect arbitrary Tailwind strings in className props
  // Matches: className="bg-blue-500 hover:bg-blue-600" (arbitrary Tailwind strings)
  arbitraryClassName: /className\s*=\s*["'`]([^"'`]*(?:bg-|text-|hover:|focus:|p-|m-|flex|grid|border|rounded|shadow|transition)[^"'`]*)["'`]/g,

  // Pattern to detect dynamic className with template literals containing Tailwind
  dynamicClassName: /className\s*=\s*\{[^}]*(?:`[^`]*(?:bg-|text-|hover:|focus:|p-|m-|flex|grid|border|rounded|shadow|transition)[^`]*`|["'][^"']*(?:bg-|text-|hover:|focus:|p-|m-|flex|grid|border|rounded|shadow|transition)[^"']*["'])[^}]*\}/g,

  // Pattern to detect cn() calls with raw Tailwind (acceptable)
  cnCallWithClass: /cn\s*\([^)]*\)/g,

  // Common Tailwind utility class patterns that should use CVA
  tailwindUtilities: [
    /bg-\w+(?:-\d+)?/,      // Background colors
    /text-\w+(?:-\d+)?/,    // Text colors
    /hover:\S+/,            // Hover states
    /focus:\S+/,            // Focus states
    /p[xytblr]?-\d+/,       // Padding
    /m[xytblr]?-\d+/,       // Margin
    /rounded(?:-\w+)?/,     // Border radius
    /border(?:-\w+)?/,      // Borders
    /shadow(?:-\w+)?/,      // Shadows
    /transition(?:-\w+)?/   // Transitions
  ]
};

/**
 * Check for CVA pattern compliance in a file
 * @param {string} content - File content
 * @param {string} filePath - File path for context
 * @returns {Object} CVA compliance results
 */
function checkCVACompliance(content, _filePath) {
  const results = {
    hasCVAImport: CVA_PATTERNS.cvaImport.test(content),
    hasCVADefinitions: false,
    cvaVariants: [],
    violations: [],
    suggestions: []
  };

  // Find CVA variant definitions
  const definitionMatches = content.matchAll(new RegExp(CVA_PATTERNS.cvaDefinition, 'g'));
  for (const match of definitionMatches) {
    results.cvaVariants.push(match[1]);
    results.hasCVADefinitions = true;
  }

  // Skip checking cn() utility calls - they're the CVA-friendly way to combine classes
  const contentWithoutCn = content.replace(CVA_PATTERNS.cnCallWithClass, '');

  // Check for arbitrary className props with Tailwind
  const arbitraryMatches = contentWithoutCn.matchAll(CVA_PATTERNS.arbitraryClassName);
  for (const match of arbitraryMatches) {
    const classString = match[1];

    // Check if it contains Tailwind utility patterns
    const hasTailwindUtilities = CVA_PATTERNS.tailwindUtilities.some(pattern =>
      pattern.test(classString)
    );

    if (hasTailwindUtilities) {
      // Extract line number (approximate)
      const beforeMatch = content.substring(0, content.indexOf(match[0]));
      const lineNumber = (beforeMatch.match(/\n/g) || []).length + 1;

      results.violations.push({
        type: 'ARBITRARY_TAILWIND_CLASSNAME',
        line: lineNumber,
        code: match[0].substring(0, 80) + (match[0].length > 80 ? '...' : ''),
        classes: classString,
        severity: SEVERITY.MEDIUM
      });
    }
  }

  // Check for dynamic className with Tailwind
  const dynamicMatches = contentWithoutCn.matchAll(CVA_PATTERNS.dynamicClassName);
  for (const match of dynamicMatches) {
    const beforeMatch = content.substring(0, content.indexOf(match[0]));
    const lineNumber = (beforeMatch.match(/\n/g) || []).length + 1;

    results.violations.push({
      type: 'DYNAMIC_TAILWIND_CLASSNAME',
      line: lineNumber,
      code: match[0].substring(0, 80) + (match[0].length > 80 ? '...' : ''),
      severity: SEVERITY.MEDIUM
    });
  }

  // Generate migration suggestions if violations found
  if (results.violations.length > 0 && !results.hasCVAImport) {
    results.suggestions.push({
      type: 'ADD_CVA_IMPORT',
      suggestion: "import { cva, type VariantProps } from 'class-variance-authority';",
      reason: 'CVA import required for variant definitions'
    });
  }

  if (results.violations.length > 0) {
    results.suggestions.push({
      type: 'CREATE_CVA_VARIANTS',
      suggestion: generateCVAMigrationSuggestion(results.violations),
      reason: 'Convert arbitrary Tailwind classes to CVA variants'
    });
  }

  return results;
}

/**
 * Generate CVA migration suggestion from violations
 * @param {Array} violations - List of violations
 * @returns {string} Suggested CVA variant definition
 */
function generateCVAMigrationSuggestion(violations) {
  const uniqueClasses = new Set();

  violations.forEach(v => {
    if (v.classes) {
      v.classes.split(/\s+/).forEach(c => uniqueClasses.add(c));
    }
  });

  const baseClasses = [];
  const variantClasses = { color: {}, size: {}, state: {} };

  uniqueClasses.forEach(cls => {
    // Categorize classes
    if (/^(bg|text)-\w+/.test(cls)) {
      variantClasses.color[cls] = cls;
    } else if (/^(p|m|w|h)-/.test(cls)) {
      variantClasses.size[cls] = cls;
    } else if (/^(hover|focus|active):/.test(cls)) {
      variantClasses.state[cls] = cls;
    } else {
      baseClasses.push(cls);
    }
  });

  return `
// Example CVA migration pattern:
const componentVariants = cva(
  "${baseClasses.join(' ')}", // Base styles
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        // Add more variants based on your use cases
      },
      size: {
        sm: "text-sm p-2",
        md: "text-base p-3",
        lg: "text-lg p-4",
      }
    },
    defaultVariants: {
      variant: "default",
      size: "md"
    }
  }
);

// Usage:
// <Component className={componentVariants({ variant: "secondary", size: "lg" })} />
`.trim();
}

/**
 * Validate CVA patterns across component files
 * @param {string} basePath - Base path to scan
 * @param {Object} options - Scanning options
 * @returns {Promise<Object>} CVA validation results
 * @sd SD-LEO-ORCH-AESTHETIC-DESIGN-SYSTEM-001-B
 */
export async function validateCVAPatterns(basePath, options = {}) {
  const componentFiles = await getComponentFiles(basePath, options);

  const results = {
    filesScanned: componentFiles.length,
    filesWithCVA: 0,
    filesWithViolations: 0,
    totalViolations: 0,
    violations: [],
    suggestions: [],
    compliance: 0,
    status: 'UNKNOWN'
  };

  for (const file of componentFiles) {
    try {
      const content = await fs.readFile(file, 'utf8');
      const relativePath = path.relative(process.cwd(), file);

      // Skip test files and stories
      if (/\.(test|spec|stories)\.(tsx?|jsx?)$/.test(file)) {
        continue;
      }

      const fileResults = checkCVACompliance(content, relativePath);

      if (fileResults.hasCVAImport || fileResults.hasCVADefinitions) {
        results.filesWithCVA++;
      }

      if (fileResults.violations.length > 0) {
        results.filesWithViolations++;
        results.totalViolations += fileResults.violations.length;

        results.violations.push({
          file: relativePath,
          violations: fileResults.violations,
          hasCVAImport: fileResults.hasCVAImport,
          cvaVariants: fileResults.cvaVariants
        });

        if (fileResults.suggestions.length > 0) {
          results.suggestions.push({
            file: relativePath,
            suggestions: fileResults.suggestions
          });
        }
      }
    } catch (_error) {
      // Skip files that can't be read
    }
  }

  // Calculate compliance score
  if (results.filesScanned > 0) {
    const cvaAdoption = (results.filesWithCVA / results.filesScanned) * 50;
    const violationPenalty = Math.min(results.filesWithViolations * 5, 50);
    results.compliance = Math.max(0, Math.round(cvaAdoption + 50 - violationPenalty));
  }

  // Determine status
  if (results.totalViolations === 0) {
    results.status = 'PASS';
  } else if (results.totalViolations <= 5) {
    results.status = 'WARNING';
  } else {
    results.status = 'FAIL';
  }

  return results;
}
