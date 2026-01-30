/**
 * Visual Polish Gate with AI Slop Detection
 * @sd SD-LEO-ORCH-AESTHETIC-DESIGN-SYSTEM-001-C
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
 */

import { SEVERITY } from './constants.js';

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

export default {
  AI_SLOP_PATTERNS,
  STAGE_ENFORCEMENT,
  CRITIQUE_DIMENSIONS,
  PERSONALITY_CONSTRAINTS,
  detectAISlop,
  auditPersonalityCompliance,
  getEnforcementDecision,
  generateImpeccableCritique,
  executeVisualPolishGate,
  formatGateResult
};
