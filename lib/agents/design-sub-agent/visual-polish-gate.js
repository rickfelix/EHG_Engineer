/**
 * Visual Polish Gate with AI Slop Detection and Dual-Mode Auditing
 * @sd SD-LEO-ORCH-AESTHETIC-DESIGN-SYSTEM-001-C
 * @sd SD-LEO-ORCH-AESTHETIC-DESIGN-SYSTEM-001-D
 *
 * Detects AI-generated design anti-patterns ("AI Slop") and enforces
 * visual polish standards with stage-based enforcement:
 * - Ideation/Validation: ADVISORY
 * - Build: WARNING
 * - Launch: HARD_BLOCK
 *
 * Implements Impeccable critique patterns for:
 * - Hierarchy: Visual weight distribution
 * - Clarity: Information architecture
 * - Emotional Resonance: Brand alignment
 *
 * Child D Enhancement: Dual-Mode (Light/Dark) Auditing
 * - Sequential Light and Dark mode audits
 * - Class-based and media-query theme detection
 * - Multi-viewport screenshot capture
 * - WCAG AA contrast validation per mode
 */

import { SEVERITY } from './constants.js';

/**
 * Viewport configurations for multi-device screenshot capture
 * @sd SD-LEO-ORCH-AESTHETIC-DESIGN-SYSTEM-001-D
 */
export const VIEWPORTS = {
  desktop: { width: 1920, height: 1080, name: 'desktop' },
  tablet: { width: 768, height: 1024, name: 'tablet' },
  mobile: { width: 375, height: 667, name: 'mobile' }
};

/**
 * Theme detection methods
 */
export const THEME_METHODS = {
  CLASS_BASED: 'class-based',
  MEDIA_QUERY: 'media-query',
  UNKNOWN: 'unknown'
};

/**
 * AI Slop Anti-Patterns (Hard-Coded)
 * These patterns are immediate red flags for AI-generated content
 */
export const AI_SLOP_PATTERNS = {
  // Purple gradients are LLM defaults - almost always AI-generated
  PURPLE_GRADIENT: {
    name: 'Purple Gradient',
    description: 'Purple/violet gradients are common LLM defaults',
    cssPatterns: [
      /linear-gradient\([^)]*(?:#[89ABCDEFabcdef][0-9A-Fa-f]{2}[0-9A-Fa-f]{2}[Ff][Ff]|#[89ABCDEFabcdef][0-9A-Fa-f]{2}[0-9A-Fa-f]{2})/,
      /(?:purple|violet|indigo)-(?:500|600|700)/,
      /bg-(?:purple|violet|indigo)-\d+/,
      /from-(?:purple|violet|indigo)-\d+.*to-/
    ],
    hexPatterns: [
      /^#[89ABCDEFabcdef][0-5][0-9A-Fa-f]{4}$/i, // Purple hues
      /^#8B5CF6$/i, // Tailwind violet-500
      /^#7C3AED$/i, // Tailwind violet-600
      /^#6D28D9$/i, // Tailwind violet-700
      /^#A855F7$/i, // Tailwind purple-500
      /^#9333EA$/i, // Tailwind purple-600
    ],
    severity: SEVERITY.MEDIUM,
    suggestion: 'Use brand colors or neutral palette instead of generic purple gradients'
  },

  // Pure grays without any tint are lazy defaults
  PURE_GRAY: {
    name: 'Pure Gray (No Tint)',
    description: 'Pure grayscale without warm/cool tint indicates default palette',
    hexPatterns: [
      /^#808080$/i,  // Medium gray
      /^#666666$/i,  // Dark gray
      /^#999999$/i,  // Light gray
      /^#[0-9Aa][0-9Aa][0-9Aa]{4}$/i, // Pure gray pattern (R=G=B)
    ],
    cssPatterns: [
      /(?:gray|grey)-(?:400|500|600)/,
      /bg-(?:gray|grey)-\d+(?!\s*\/)/,  // Without opacity modifier
    ],
    severity: SEVERITY.LOW,
    suggestion: 'Add warm or cool tint to grays for more refined palette'
  },

  // Cards nested in cards indicate template copy-paste
  NESTED_CARDS: {
    name: 'Cards Nested in Cards',
    description: 'Nested card patterns indicate template mediocrity',
    domPatterns: [
      /\.card\s+\.card/,
      /\[class\*="card"\].*\[class\*="card"\]/
    ],
    jsxPatterns: [
      /<Card[^>]*>[\s\S]*<Card/,
      /className="[^"]*card[^"]*"[\s\S]*className="[^"]*card[^"]*"/
    ],
    severity: SEVERITY.LOW,
    suggestion: 'Flatten card hierarchy - use sections or dividers instead of nesting'
  },

  // Overused system fonts indicate default laziness
  DEFAULT_FONTS: {
    name: 'Overused Default Fonts',
    description: 'System defaults without font-stack consideration',
    cssPatterns: [
      /font-family:\s*['"]?Arial['"]?\s*[,;]/i,
      /font-family:\s*['"]?Helvetica['"]?\s*[,;]/i,
      /font-family:\s*system-ui\s*[,;]/,
      /font-family:\s*sans-serif\s*[;]/  // Just "sans-serif" alone
    ],
    severity: SEVERITY.LOW,
    suggestion: 'Define intentional font stack with fallbacks'
  }
};

/**
 * Stage-based enforcement matrix
 */
export const STAGE_ENFORCEMENT = {
  ideation: { action: 'ADVISORY', exitCode: 0 },
  validation: { action: 'ADVISORY', exitCode: 0 },
  build: { action: 'WARNING', exitCode: 0 },
  launch: { action: 'HARD_BLOCK', exitCode: 1 },
  growth: { action: 'HARD_BLOCK', exitCode: 1 },
  maturity: { action: 'HARD_BLOCK', exitCode: 1 }
};

/**
 * Impeccable Critique Dimensions
 * Based on design excellence criteria
 */
export const CRITIQUE_DIMENSIONS = {
  hierarchy: {
    name: 'Hierarchy',
    description: 'Visual weight distribution and information priority',
    maxScore: 100,
    checks: [
      { name: 'headingSizes', description: 'Clear heading size progression', weight: 30 },
      { name: 'visualWeight', description: 'Primary actions visually prominent', weight: 30 },
      { name: 'whitespace', description: 'Intentional whitespace grouping', weight: 20 },
      { name: 'alignment', description: 'Consistent grid alignment', weight: 20 }
    ]
  },
  clarity: {
    name: 'Clarity',
    description: 'Information architecture and readability',
    maxScore: 100,
    checks: [
      { name: 'labelClarity', description: 'Labels are unambiguous', weight: 25 },
      { name: 'actionClarity', description: 'CTAs have clear outcomes', weight: 25 },
      { name: 'errorStates', description: 'Error messages are helpful', weight: 25 },
      { name: 'loadingStates', description: 'Loading states are informative', weight: 25 }
    ]
  },
  emotionalResonance: {
    name: 'Emotional Resonance',
    description: 'Brand alignment and user emotional response',
    maxScore: 100,
    checks: [
      { name: 'brandAlignment', description: 'Colors match brand personality', weight: 35 },
      { name: 'toneConsistency', description: 'Copy tone matches visual style', weight: 25 },
      { name: 'microInteractions', description: 'Animations feel appropriate', weight: 20 },
      { name: 'imagery', description: 'Images reinforce message', weight: 20 }
    ]
  }
};

/**
 * Personality-specific constraints for auditing
 * Maps to venture_personality tags
 */
export const PERSONALITY_CONSTRAINTS = {
  spartan: {
    forbiddenPatterns: [
      /shadow-(?:md|lg|xl)/,        // No medium+ shadows
      /rounded-(?:lg|xl|2xl|full)/, // Sharp corners only
      /bg-gradient/,                 // No gradients
      /animate-/                     // No animations
    ],
    requiredPatterns: [
      /font-mono/                    // Monospace preferred
    ],
    colorRestrictions: {
      maxHues: 2,                    // Monochrome + single accent
      saturationMax: 20             // Low saturation
    }
  },
  enterprise: {
    forbiddenPatterns: [
      /bg-(?:pink|fuchsia|rose)-/,  // No playful colors
      /rounded-full/,               // No pill shapes (except avatars)
      /animate-bounce/              // No bouncy animations
    ],
    colorRestrictions: {
      maxHues: 4,
      saturationMax: 60            // Muted colors
    }
  },
  startup: {
    forbiddenPatterns: [
      /text-(?:xs|sm)/,             // No small text in heroes
    ],
    requiredPatterns: [
      /font-bold|font-semibold/    // Bold headlines
    ]
  },
  dashboard: {
    requiredPatterns: [
      /font-mono/,                  // Monospace for data
      /tabular-nums/               // Tabular numerals
    ],
    forbiddenPatterns: [
      /text-(?:2xl|3xl|4xl)/       // No large text (data-dense)
    ]
  },
  accessible: {
    requiredPatterns: [
      /focus:/,                     // Focus indicators required
      /sr-only/                     // Screen reader content
    ],
    forbiddenPatterns: [
      /text-xs/                     // No tiny text
    ],
    contrastMinimum: 7             // WCAG AAA
  }
};

/**
 * Detect AI Slop patterns in content
 * @param {string} content - CSS/JSX content to analyze
 * @param {string} fileType - Type of file (css, jsx, tsx)
 * @returns {Array} Detected AI slop violations
 */
export function detectAISlop(content, fileType = 'jsx') {
  const violations = [];

  for (const [patternKey, pattern] of Object.entries(AI_SLOP_PATTERNS)) {
    // Check CSS patterns
    if (pattern.cssPatterns) {
      for (const regex of pattern.cssPatterns) {
        const matches = content.match(regex);
        if (matches) {
          violations.push({
            type: patternKey,
            name: pattern.name,
            description: pattern.description,
            severity: pattern.severity,
            matches: matches.slice(0, 3), // Limit to first 3 matches
            suggestion: pattern.suggestion
          });
          break; // Only report once per pattern type
        }
      }
    }

    // Check hex patterns in CSS files
    if (pattern.hexPatterns && (fileType === 'css' || fileType === 'scss')) {
      const hexColors = content.match(/#[0-9A-Fa-f]{6}/g) || [];
      for (const hex of hexColors) {
        for (const hexRegex of pattern.hexPatterns) {
          if (hexRegex.test(hex)) {
            const existing = violations.find(v => v.type === patternKey);
            if (!existing) {
              violations.push({
                type: patternKey,
                name: pattern.name,
                description: pattern.description,
                severity: pattern.severity,
                matches: [hex],
                suggestion: pattern.suggestion
              });
            }
            break;
          }
        }
      }
    }

    // Check JSX patterns
    if (pattern.jsxPatterns && (fileType === 'jsx' || fileType === 'tsx')) {
      for (const regex of pattern.jsxPatterns) {
        const matches = content.match(regex);
        if (matches) {
          const existing = violations.find(v => v.type === patternKey);
          if (!existing) {
            violations.push({
              type: patternKey,
              name: pattern.name,
              description: pattern.description,
              severity: pattern.severity,
              matches: matches.slice(0, 3),
              suggestion: pattern.suggestion
            });
          }
          break;
        }
      }
    }
  }

  return violations;
}

/**
 * Audit content against personality constraints
 * @param {string} content - Content to audit
 * @param {string} personality - Venture personality tag
 * @returns {Object} Audit results
 */
export function auditPersonalityCompliance(content, personality) {
  const constraints = PERSONALITY_CONSTRAINTS[personality];
  if (!constraints) {
    return {
      personality,
      status: 'SKIPPED',
      reason: `No constraints defined for personality: ${personality}`,
      violations: [],
      passed: []
    };
  }

  const violations = [];
  const passed = [];

  // Check forbidden patterns
  if (constraints.forbiddenPatterns) {
    for (const pattern of constraints.forbiddenPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        violations.push({
          type: 'FORBIDDEN_PATTERN',
          pattern: pattern.toString(),
          matches: matches.slice(0, 3),
          severity: SEVERITY.MEDIUM
        });
      } else {
        passed.push({
          type: 'FORBIDDEN_PATTERN',
          pattern: pattern.toString(),
          status: 'COMPLIANT'
        });
      }
    }
  }

  // Check required patterns
  if (constraints.requiredPatterns) {
    for (const pattern of constraints.requiredPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        passed.push({
          type: 'REQUIRED_PATTERN',
          pattern: pattern.toString(),
          status: 'PRESENT'
        });
      } else {
        violations.push({
          type: 'MISSING_REQUIRED',
          pattern: pattern.toString(),
          severity: SEVERITY.LOW
        });
      }
    }
  }

  const totalChecks = violations.length + passed.length;
  const complianceScore = totalChecks > 0
    ? Math.round((passed.length / totalChecks) * 100)
    : 100;

  return {
    personality,
    status: violations.length === 0 ? 'PASS' : 'VIOLATIONS_FOUND',
    complianceScore,
    violations,
    passed,
    constraints: {
      forbiddenCount: constraints.forbiddenPatterns?.length || 0,
      requiredCount: constraints.requiredPatterns?.length || 0
    }
  };
}

/**
 * Get enforcement action based on venture stage
 * @param {string} stage - Venture stage (ideation, validation, build, launch, etc.)
 * @param {Array} violations - AI Slop violations found
 * @returns {Object} Enforcement decision
 */
export function getEnforcementDecision(stage, violations) {
  const normalizedStage = stage?.toLowerCase() || 'build';
  const enforcement = STAGE_ENFORCEMENT[normalizedStage] || STAGE_ENFORCEMENT.build;

  const hasHighSeverity = violations.some(v => v.severity === SEVERITY.HIGH);
  const hasMediumSeverity = violations.some(v => v.severity === SEVERITY.MEDIUM);

  // Escalate to hard block if high severity in any stage
  if (hasHighSeverity && enforcement.action !== 'HARD_BLOCK') {
    return {
      action: 'WARNING',
      exitCode: 0,
      message: 'HIGH severity AI Slop detected - would be HARD_BLOCK in Launch',
      escalated: true
    };
  }

  if (violations.length === 0) {
    return {
      action: 'PASS',
      exitCode: 0,
      message: 'No AI Slop patterns detected'
    };
  }

  return {
    action: enforcement.action,
    exitCode: enforcement.exitCode,
    message: `${violations.length} AI Slop pattern(s) detected`,
    violationCount: violations.length,
    highSeverity: hasHighSeverity,
    mediumSeverity: hasMediumSeverity
  };
}

/**
 * Generate Impeccable critique report
 * @param {Object} analysis - Analysis results from visual verification
 * @returns {Object} Critique report with scores per dimension
 */
export function generateImpeccableCritique(analysis) {
  const report = {
    overallScore: 0,
    dimensions: {},
    suggestions: [],
    timestamp: new Date().toISOString()
  };

  let totalWeight = 0;
  let weightedScore = 0;

  for (const [dimensionKey, dimension] of Object.entries(CRITIQUE_DIMENSIONS)) {
    const dimensionScore = {
      name: dimension.name,
      description: dimension.description,
      score: 0,
      maxScore: dimension.maxScore,
      checks: []
    };

    let dimensionTotal = 0;
    for (const check of dimension.checks) {
      // Default to 70% if not analyzed
      const checkScore = analysis?.[dimensionKey]?.[check.name] ?? 70;
      dimensionScore.checks.push({
        ...check,
        score: checkScore,
        status: checkScore >= 70 ? 'PASS' : checkScore >= 50 ? 'WARNING' : 'FAIL'
      });
      dimensionTotal += (checkScore / 100) * check.weight;
    }

    dimensionScore.score = Math.round(dimensionTotal);
    report.dimensions[dimensionKey] = dimensionScore;

    // Weight dimensions equally for overall score
    weightedScore += dimensionScore.score;
    totalWeight += 1;
  }

  report.overallScore = Math.round(weightedScore / totalWeight);

  // Generate suggestions for low-scoring dimensions
  for (const [key, dimension] of Object.entries(report.dimensions)) {
    if (dimension.score < 70) {
      report.suggestions.push({
        dimension: dimension.name,
        score: dimension.score,
        suggestion: `Improve ${dimension.name.toLowerCase()}: ${dimension.description}`,
        failedChecks: dimension.checks.filter(c => c.status === 'FAIL').map(c => c.name)
      });
    }
  }

  return report;
}

/**
 * Main Visual Polish Gate execution
 * @param {Object} options - Gate options
 * @returns {Object} Gate result with verdict
 */
export async function executeVisualPolishGate(options = {}) {
  const {
    content = '',
    fileType = 'jsx',
    ventureStage = 'build',
    venturePersonality = null,
    analysis = null
  } = options;

  const result = {
    timestamp: new Date().toISOString(),
    gate: 'VISUAL_POLISH_GATE',
    status: 'UNKNOWN',
    score: 100,
    aiSlop: {
      violations: [],
      enforcement: null
    },
    personalityAudit: null,
    critique: null,
    exitCode: 0
  };

  // Step 1: Detect AI Slop patterns
  const aiSlopViolations = detectAISlop(content, fileType);
  result.aiSlop.violations = aiSlopViolations;

  // Step 2: Get enforcement decision
  const enforcement = getEnforcementDecision(ventureStage, aiSlopViolations);
  result.aiSlop.enforcement = enforcement;

  // Deduct points for AI Slop
  const slopDeduction = aiSlopViolations.reduce((acc, v) => {
    if (v.severity === SEVERITY.HIGH) return acc + 15;
    if (v.severity === SEVERITY.MEDIUM) return acc + 8;
    return acc + 3;
  }, 0);
  result.score -= slopDeduction;

  // Step 3: Audit personality compliance (if personality tag present)
  if (venturePersonality) {
    result.personalityAudit = auditPersonalityCompliance(content, venturePersonality);

    // Deduct for personality violations
    const personalityDeduction = result.personalityAudit.violations.length * 5;
    result.score -= personalityDeduction;
  }

  // Step 4: Generate Impeccable critique
  result.critique = generateImpeccableCritique(analysis);

  // Factor critique score into overall
  result.score = Math.round((result.score + result.critique.overallScore) / 2);
  result.score = Math.max(0, Math.min(100, result.score));

  // Step 5: Determine final status
  if (enforcement.exitCode !== 0) {
    result.status = 'HARD_BLOCK';
    result.exitCode = 1;
  } else if (enforcement.action === 'WARNING' || result.score < 70) {
    result.status = 'WARNING';
  } else if (result.score >= 90) {
    result.status = 'EXCELLENT';
  } else {
    result.status = 'PASS';
  }

  return result;
}

/**
 * Format gate result for console output
 * @param {Object} result - Gate execution result
 * @returns {string} Formatted output
 */
export function formatGateResult(result) {
  const lines = [];

  lines.push('');
  lines.push('=' .repeat(60));
  lines.push('VISUAL POLISH GATE RESULT');
  lines.push('=' .repeat(60));
  lines.push('');

  const statusIcon = {
    'EXCELLENT': '✨',
    'PASS': '✅',
    'WARNING': '⚠️',
    'HARD_BLOCK': '❌'
  }[result.status] || '❓';

  lines.push(`${statusIcon} Status: ${result.status}`);
  lines.push(`📊 Score: ${result.score}/100`);
  lines.push('');

  // AI Slop section
  lines.push('🤖 AI SLOP DETECTION');
  lines.push('-'.repeat(40));
  if (result.aiSlop.violations.length === 0) {
    lines.push('   ✅ No AI Slop patterns detected');
  } else {
    lines.push(`   ❌ ${result.aiSlop.violations.length} pattern(s) detected:`);
    for (const v of result.aiSlop.violations) {
      lines.push(`      • ${v.name} (${v.severity})`);
      lines.push(`        ${v.suggestion}`);
    }
  }
  lines.push(`   Enforcement: ${result.aiSlop.enforcement.action}`);
  lines.push('');

  // Personality audit section
  if (result.personalityAudit) {
    lines.push(`🎨 PERSONALITY AUDIT (${result.personalityAudit.personality})`);
    lines.push('-'.repeat(40));
    lines.push(`   Compliance: ${result.personalityAudit.complianceScore}%`);
    if (result.personalityAudit.violations.length > 0) {
      lines.push(`   Violations: ${result.personalityAudit.violations.length}`);
    }
    lines.push('');
  }

  // Critique section
  if (result.critique) {
    lines.push('📐 IMPECCABLE CRITIQUE');
    lines.push('-'.repeat(40));
    for (const [key, dim] of Object.entries(result.critique.dimensions)) {
      const icon = dim.score >= 70 ? '✅' : dim.score >= 50 ? '⚠️' : '❌';
      lines.push(`   ${icon} ${dim.name}: ${dim.score}/100`);
    }
    if (result.critique.suggestions.length > 0) {
      lines.push('');
      lines.push('   💡 Suggestions:');
      for (const s of result.critique.suggestions) {
        lines.push(`      • ${s.suggestion}`);
      }
    }
  }

  lines.push('');
  lines.push('=' .repeat(60));

  return lines.join('\n');
}

/**
 * Detect which theme toggle method the page supports
 * @sd SD-LEO-ORCH-AESTHETIC-DESIGN-SYSTEM-001-D (US-002)
 * @param {Object} page - Playwright page object
 * @returns {Promise<string>} Theme method: 'class-based', 'media-query', or 'unknown'
 */
export async function detectThemeMethod(page) {
  try {
    // Check for class-based theming (.dark class support)
    const hasClassBasedSupport = await page.evaluate(() => {
      const html = document.documentElement;
      const body = document.body;
      // Check if dark class exists or if toggling it changes styles
      const hasDarkClass = html.classList.contains('dark') || body.classList.contains('dark');
      // Check for Tailwind/shadcn dark mode CSS variables
      const style = getComputedStyle(document.documentElement);
      const hasDarkVars = style.getPropertyValue('--background') !== '';
      return hasDarkClass || hasDarkVars;
    });

    if (hasClassBasedSupport) {
      return THEME_METHODS.CLASS_BASED;
    }

    // Check for media query support by testing if styles change with color-scheme
    const hasMediaQuerySupport = await page.evaluate(() => {
      // Check if any stylesheets use prefers-color-scheme
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule.media && rule.media.mediaText.includes('prefers-color-scheme')) {
              return true;
            }
          }
        } catch (e) {
          // Cross-origin stylesheets may throw
        }
      }
      return false;
    });

    if (hasMediaQuerySupport) {
      return THEME_METHODS.MEDIA_QUERY;
    }

    return THEME_METHODS.UNKNOWN;
  } catch (error) {
    console.warn('Theme detection failed:', error.message);
    return THEME_METHODS.UNKNOWN;
  }
}

/**
 * Toggle page theme to specified mode
 * @sd SD-LEO-ORCH-AESTHETIC-DESIGN-SYSTEM-001-D (US-002)
 * @param {Object} page - Playwright page object
 * @param {string} mode - 'light' or 'dark'
 * @param {string} method - Theme method to use (auto-detected if not provided)
 * @returns {Promise<Object>} Toggle result with method used
 */
export async function toggleTheme(page, mode, method = null) {
  const detectedMethod = method || await detectThemeMethod(page);
  const result = {
    mode,
    themeMethod: detectedMethod,
    success: false,
    error: null
  };

  try {
    if (detectedMethod === THEME_METHODS.CLASS_BASED) {
      // Class-based theming: toggle .dark class on html element
      await page.evaluate((targetMode) => {
        const html = document.documentElement;
        if (targetMode === 'dark') {
          html.classList.add('dark');
          html.classList.remove('light');
        } else {
          html.classList.remove('dark');
          html.classList.add('light');
        }
      }, mode);
      result.success = true;
    } else if (detectedMethod === THEME_METHODS.MEDIA_QUERY) {
      // Media query theming: use Playwright emulateMedia
      await page.emulateMedia({ colorScheme: mode });
      result.success = true;
    } else {
      // Unknown method: try both approaches
      await page.evaluate((targetMode) => {
        const html = document.documentElement;
        if (targetMode === 'dark') {
          html.classList.add('dark');
        } else {
          html.classList.remove('dark');
        }
      }, mode);
      await page.emulateMedia({ colorScheme: mode });
      result.success = true;
      result.themeMethod = 'hybrid';
    }

    // Wait for theme transition to complete
    await page.waitForTimeout(300);
  } catch (error) {
    result.error = error.message;
  }

  return result;
}

/**
 * Capture dual-mode screenshots for all configured viewports
 * @sd SD-LEO-ORCH-AESTHETIC-DESIGN-SYSTEM-001-D (US-003)
 * @param {Object} page - Playwright page object
 * @param {string} outputDir - Output directory for screenshots
 * @param {Object} viewports - Viewport configurations (defaults to VIEWPORTS)
 * @returns {Promise<Object>} Screenshot paths per viewport and mode
 */
export async function captureDualModeScreenshots(page, outputDir = './visual-polish-reports/screenshots', viewports = VIEWPORTS) {
  const screenshots = {};

  for (const [viewportKey, viewport] of Object.entries(viewports)) {
    screenshots[viewportKey] = { light: null, dark: null };

    // Set viewport size
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    // Capture Light mode
    await toggleTheme(page, 'light');
    const lightPath = `${outputDir}/${viewport.name}-light.png`;
    try {
      await page.screenshot({ path: lightPath, fullPage: false });
      screenshots[viewportKey].light = `screenshots/${viewport.name}-light.png`;
    } catch (error) {
      console.warn(`Failed to capture ${viewport.name}-light:`, error.message);
    }

    // Capture Dark mode
    await toggleTheme(page, 'dark');
    const darkPath = `${outputDir}/${viewport.name}-dark.png`;
    try {
      await page.screenshot({ path: darkPath, fullPage: false });
      screenshots[viewportKey].dark = `screenshots/${viewport.name}-dark.png`;
    } catch (error) {
      console.warn(`Failed to capture ${viewport.name}-dark:`, error.message);
    }
  }

  return screenshots;
}

/**
 * Validate WCAG AA contrast in specified theme mode
 * @sd SD-LEO-ORCH-AESTHETIC-DESIGN-SYSTEM-001-D (US-004)
 * @param {Object} page - Playwright page object
 * @param {string} mode - 'light' or 'dark'
 * @returns {Promise<Object>} Contrast validation results
 */
export async function validateContrastInMode(page, mode) {
  const result = {
    mode,
    violations: [],
    passed: 0,
    total: 0
  };

  try {
    // Toggle to specified mode first
    await toggleTheme(page, mode);

    // Get all text elements and their computed colors
    const elements = await page.evaluate(() => {
      const textElements = [];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
      );

      let node;
      while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        if (!parent || !node.textContent.trim()) continue;

        const style = getComputedStyle(parent);
        const fontSize = parseFloat(style.fontSize);
        const fontWeight = parseInt(style.fontWeight) || 400;
        const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);

        // Get foreground color
        const fgColor = style.color;

        // Get background color (traverse up to find non-transparent)
        let bgColor = 'rgb(255, 255, 255)';
        let el = parent;
        while (el) {
          const bg = getComputedStyle(el).backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
            bgColor = bg;
            break;
          }
          el = el.parentElement;
        }

        textElements.push({
          selector: parent.tagName.toLowerCase() +
            (parent.id ? '#' + parent.id : '') +
            (parent.className ? '.' + parent.className.split(' ')[0] : ''),
          foreground: fgColor,
          background: bgColor,
          isLargeText,
          fontSize
        });
      }

      // Sample up to 200 elements to avoid performance issues
      return textElements.slice(0, 200);
    });

    result.total = elements.length;

    // Calculate contrast ratios
    for (const el of elements) {
      const fgRgb = parseRgb(el.foreground);
      const bgRgb = parseRgb(el.background);

      if (!fgRgb || !bgRgb) continue;

      const ratio = calculateContrastRatio(fgRgb, bgRgb);
      const requiredRatio = el.isLargeText ? 3.0 : 4.5;

      if (ratio < requiredRatio) {
        result.violations.push({
          selector: el.selector,
          actualRatio: Math.round(ratio * 100) / 100,
          requiredRatio,
          foreground: el.foreground,
          background: el.background,
          mode,
          isLargeText: el.isLargeText
        });
      } else {
        result.passed++;
      }
    }
  } catch (error) {
    result.error = error.message;
  }

  return result;
}

/**
 * Parse RGB color string to {r, g, b} object
 * @param {string} color - CSS color string (rgb or rgba format)
 * @returns {Object|null} RGB values or null if parse fails
 */
function parseRgb(color) {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return null;
  return {
    r: parseInt(match[1]),
    g: parseInt(match[2]),
    b: parseInt(match[3])
  };
}

/**
 * Calculate relative luminance per WCAG 2.1
 * @param {Object} rgb - RGB color object
 * @returns {number} Relative luminance
 */
function calculateLuminance(rgb) {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(c => {
    const sRGB = c / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate contrast ratio between two colors
 * @param {Object} fg - Foreground RGB
 * @param {Object} bg - Background RGB
 * @returns {number} Contrast ratio (1-21)
 */
function calculateContrastRatio(fg, bg) {
  const l1 = calculateLuminance(fg);
  const l2 = calculateLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Execute dual-mode Visual Polish Gate audit
 * @sd SD-LEO-ORCH-AESTHETIC-DESIGN-SYSTEM-001-D (US-001)
 * @param {Object} options - Audit options
 * @param {Object} options.page - Playwright page object (required for full audit)
 * @param {string} options.previewUrl - URL to audit
 * @param {string} options.outputDir - Output directory for screenshots
 * @param {string} options.ventureStage - Venture stage for enforcement
 * @param {string} options.venturePersonality - Optional personality tag
 * @returns {Promise<Object>} Combined dual-mode audit results
 */
export async function executeDualModeAudit(options = {}) {
  const {
    page = null,
    previewUrl = null,
    outputDir = './visual-polish-reports',
    ventureStage = 'build',
    venturePersonality = null,
    viewports = VIEWPORTS
  } = options;

  const result = {
    timestamp: new Date().toISOString(),
    gate: 'VISUAL_POLISH_GATE_DUAL_MODE',
    previewUrl,
    status: 'UNKNOWN',
    exitCode: 0,
    themeMethod: null,
    modes: {
      light: null,
      dark: null
    },
    screenshots: {},
    contrastViolations: {
      light: [],
      dark: []
    },
    summary: {
      lightPassed: false,
      darkPassed: false,
      totalViolations: 0
    }
  };

  // If no page provided, return with content-only analysis
  if (!page) {
    result.status = 'SKIPPED';
    result.error = 'Playwright page object required for dual-mode audit';
    return result;
  }

  try {
    // Navigate to URL if provided
    if (previewUrl) {
      await page.goto(previewUrl, { waitUntil: 'networkidle' });
    }

    // Detect theme method
    result.themeMethod = await detectThemeMethod(page);

    // Run Light mode audit
    await toggleTheme(page, 'light', result.themeMethod);
    const pageContent = await page.content();
    result.modes.light = await executeVisualPolishGate({
      content: pageContent,
      fileType: 'jsx',
      ventureStage,
      venturePersonality
    });
    result.modes.light.mode = 'light';

    // Run contrast validation in Light mode
    const lightContrast = await validateContrastInMode(page, 'light');
    result.contrastViolations.light = lightContrast.violations;

    // Run Dark mode audit
    await toggleTheme(page, 'dark', result.themeMethod);
    const darkPageContent = await page.content();
    result.modes.dark = await executeVisualPolishGate({
      content: darkPageContent,
      fileType: 'jsx',
      ventureStage,
      venturePersonality
    });
    result.modes.dark.mode = 'dark';

    // Run contrast validation in Dark mode
    const darkContrast = await validateContrastInMode(page, 'dark');
    result.contrastViolations.dark = darkContrast.violations;

    // Capture dual-mode screenshots
    result.screenshots = await captureDualModeScreenshots(page, `${outputDir}/screenshots`, viewports);

    // Calculate summary
    result.summary.lightPassed = result.modes.light.status !== 'HARD_BLOCK';
    result.summary.darkPassed = result.modes.dark.status !== 'HARD_BLOCK';
    result.summary.totalViolations =
      (result.modes.light.aiSlop?.violations?.length || 0) +
      (result.modes.dark.aiSlop?.violations?.length || 0) +
      result.contrastViolations.light.length +
      result.contrastViolations.dark.length;

    // Determine overall status
    if (!result.summary.lightPassed || !result.summary.darkPassed) {
      result.status = 'HARD_BLOCK';
      result.exitCode = 1;
    } else if (result.summary.totalViolations > 0) {
      result.status = 'WARNING';
    } else {
      result.status = 'PASS';
    }

  } catch (error) {
    result.status = 'ERROR';
    result.error = error.message;
    result.exitCode = 1;
  }

  return result;
}

/**
 * Format dual-mode audit result for console output
 * @sd SD-LEO-ORCH-AESTHETIC-DESIGN-SYSTEM-001-D
 * @param {Object} result - Dual-mode audit result
 * @returns {string} Formatted output
 */
export function formatDualModeResult(result) {
  const lines = [];

  lines.push('');
  lines.push('='.repeat(70));
  lines.push('VISUAL POLISH GATE - DUAL MODE AUDIT');
  lines.push('='.repeat(70));
  lines.push('');

  const statusIcon = {
    'PASS': '✅',
    'WARNING': '⚠️',
    'HARD_BLOCK': '❌',
    'ERROR': '💥',
    'SKIPPED': '⏭️'
  }[result.status] || '❓';

  lines.push(`${statusIcon} Overall Status: ${result.status}`);
  lines.push(`🔧 Theme Method: ${result.themeMethod || 'unknown'}`);
  lines.push(`📍 URL: ${result.previewUrl || 'N/A'}`);
  lines.push('');

  // Light mode section
  lines.push('☀️  LIGHT MODE AUDIT');
  lines.push('-'.repeat(50));
  if (result.modes.light) {
    const lightIcon = result.summary.lightPassed ? '✅' : '❌';
    lines.push(`   ${lightIcon} Status: ${result.modes.light.status}`);
    lines.push(`   📊 Score: ${result.modes.light.score}/100`);
    lines.push(`   🤖 AI Slop: ${result.modes.light.aiSlop?.violations?.length || 0} violations`);
    lines.push(`   🎨 Contrast: ${result.contrastViolations.light.length} violations`);
  }
  lines.push('');

  // Dark mode section
  lines.push('🌙 DARK MODE AUDIT');
  lines.push('-'.repeat(50));
  if (result.modes.dark) {
    const darkIcon = result.summary.darkPassed ? '✅' : '❌';
    lines.push(`   ${darkIcon} Status: ${result.modes.dark.status}`);
    lines.push(`   📊 Score: ${result.modes.dark.score}/100`);
    lines.push(`   🤖 AI Slop: ${result.modes.dark.aiSlop?.violations?.length || 0} violations`);
    lines.push(`   🎨 Contrast: ${result.contrastViolations.dark.length} violations`);
  }
  lines.push('');

  // Screenshots section
  lines.push('📸 SCREENSHOTS CAPTURED');
  lines.push('-'.repeat(50));
  for (const [viewport, paths] of Object.entries(result.screenshots || {})) {
    lines.push(`   ${viewport}:`);
    lines.push(`      Light: ${paths.light || 'failed'}`);
    lines.push(`      Dark: ${paths.dark || 'failed'}`);
  }
  lines.push('');

  // Contrast violations detail
  if (result.summary.totalViolations > 0) {
    lines.push('⚠️  CONTRAST VIOLATIONS');
    lines.push('-'.repeat(50));
    if (result.contrastViolations.light.length > 0) {
      lines.push('   Light Mode:');
      for (const v of result.contrastViolations.light.slice(0, 5)) {
        lines.push(`      • ${v.selector}: ${v.actualRatio}:1 (need ${v.requiredRatio}:1)`);
      }
    }
    if (result.contrastViolations.dark.length > 0) {
      lines.push('   Dark Mode:');
      for (const v of result.contrastViolations.dark.slice(0, 5)) {
        lines.push(`      • ${v.selector}: ${v.actualRatio}:1 (need ${v.requiredRatio}:1)`);
      }
    }
  }

  lines.push('');
  lines.push(`🏁 Exit Code: ${result.exitCode}`);
  lines.push('='.repeat(70));

  return lines.join('\n');
}

export default {
  AI_SLOP_PATTERNS,
  STAGE_ENFORCEMENT,
  CRITIQUE_DIMENSIONS,
  PERSONALITY_CONSTRAINTS,
  VIEWPORTS,
  THEME_METHODS,
  detectAISlop,
  auditPersonalityCompliance,
  getEnforcementDecision,
  generateImpeccableCritique,
  executeVisualPolishGate,
  formatGateResult,
  detectThemeMethod,
  toggleTheme,
  captureDualModeScreenshots,
  validateContrastInMode,
  executeDualModeAudit,
  formatDualModeResult
};
