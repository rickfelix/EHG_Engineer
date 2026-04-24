/**
 * Plan Parser Module
 *
 * Parses Claude Code plan files and extracts structured content.
 * Part of SD-LEO-INFRA-PLAN-AWARE-SD-CREATION feature.
 *
 * @module scripts/modules/plan-parser
 */

/**
 * Extract title from plan content
 * Matches patterns like "# Plan: Title" or "# Title"
 *
 * @param {string} content - Plan file content
 * @returns {string|null} Extracted title or null
 */
export function extractTitle(content) {
  if (!content) return null;

  // Try "# Plan: Title" pattern first
  const planMatch = content.match(/^#\s+Plan:\s*(.+)$/m);
  if (planMatch) {
    return planMatch[1].trim();
  }

  // Fall back to first h1 heading
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  return null;
}

/** Maximum characters returned from extractSummary() before paragraph-boundary truncation. */
export const SUMMARY_CAP = 2000;

/**
 * Extract summary/goal from plan content
 * Matches "## Goal", "## Summary", or "## Executive Summary" sections.
 * Returns the full section joined with blank lines, capped at SUMMARY_CAP chars
 * at a paragraph boundary (never mid-sentence).
 *
 * @param {string} content - Plan file content
 * @returns {string|null} Extracted summary or null
 */
export function extractSummary(content) {
  if (!content) return null;

  // Anchor-fix: drop the `m` flag so `$` matches end-of-string (not end-of-line).
  // The original `/^##...$/mi` stopped at the first paragraph break because `$` in
  // multiline mode matches before every `\n`, breaking multi-paragraph capture.
  // Use `(?:^|\n)` to keep the start-of-line anchor for the header.
  const sectionPattern = /(?:^|\n)##\s+(Goal|Summary|Executive Summary)\s*\n+([\s\S]*?)(?=\n##\s|\n#\s|$)/i;
  const match = content.match(sectionPattern);
  if (!match) return null;

  let summary = match[2].trim().replace(/\*\*/g, '').replace(/\*/g, '');
  if (summary.length <= SUMMARY_CAP) return summary;

  // Over cap — truncate at paragraph boundary, falling back to line boundary, never mid-sentence.
  const paragraphs = summary.split(/\n\n/);
  let kept = '';
  for (const para of paragraphs) {
    const candidate = kept ? kept + '\n\n' + para : para;
    if (candidate.length + 3 > SUMMARY_CAP) break; // +3 reserves room for the ... suffix
    kept = candidate;
  }
  if (kept) return kept + '\n\n...';

  // Single paragraph that itself exceeds the cap — truncate at last line break below cap.
  const lines = summary.split(/\n/);
  let lineKept = '';
  for (const line of lines) {
    const candidate = lineKept ? lineKept + '\n' + line : line;
    if (candidate.length + 3 > SUMMARY_CAP) break;
    lineKept = candidate;
  }
  return (lineKept || summary.slice(0, SUMMARY_CAP - 3)) + '...';
}

/**
 * Extract checklist steps from plan content
 * Matches "- [ ]" and "- [x]" task items
 *
 * @param {string} content - Plan file content
 * @returns {Array<{text: string, completed: boolean}>} Array of steps
 */
export function extractSteps(content) {
  if (!content) return [];

  const steps = [];
  // Match both unchecked "- [ ]" and checked "- [x]" items
  const stepPattern = /^-\s+\[([ xX])\]\s+(.+)$/gm;

  let match;
  while ((match = stepPattern.exec(content)) !== null) {
    steps.push({
      text: match[2].trim(),
      completed: match[1].toLowerCase() === 'x'
    });
  }

  return steps;
}

/**
 * Extract file modification table from plan content
 * Matches markdown tables with file paths and actions
 *
 * @param {string} content - Plan file content
 * @returns {Array<{path: string, action: string, purpose: string}>} Array of files
 */
export function extractFiles(content) {
  if (!content) return [];

  const files = [];

  // Look for table rows with file paths
  // Pattern: | path | action | purpose | (or variations)
  const tableRowPattern = /^\|\s*`?([^|`]+)`?\s*\|\s*([^|]+)\s*\|\s*([^|]*)\s*\|$/gm;

  let match;
  while ((match = tableRowPattern.exec(content)) !== null) {
    const path = match[1].trim();
    const action = match[2].trim().toUpperCase();
    const purpose = match[3]?.trim() || '';

    // Skip header rows and separator rows
    if (path === 'File' || path === 'path' || path.match(/^-+$/) || action === 'Action' || action.match(/^-+$/)) {
      continue;
    }

    // Validate it looks like a file path
    if (path.includes('/') || path.includes('\\') || path.includes('.')) {
      files.push({ path, action, purpose });
    }
  }

  return files;
}

/**
 * Infer SD type from plan content based on keywords
 *
 * @param {string} content - Plan file content
 * @returns {string} Inferred SD type
 */
export function inferSDType(content) {
  if (!content) return 'feature';

  const lowerContent = content.toLowerCase();

  // Check for security-related keywords
  if (lowerContent.includes('security') ||
      lowerContent.includes('vulnerability') ||
      lowerContent.includes('cve') ||
      lowerContent.includes('authentication') && lowerContent.includes('fix')) {
    return 'fix'; // Security issues map to fix type
  }

  // Check for bug/error keywords
  if (lowerContent.includes('bug') ||
      lowerContent.includes('error') ||
      lowerContent.includes('broken') ||
      lowerContent.includes('failing') ||
      lowerContent.match(/\bfix\b/)) {
    return 'fix';
  }

  // Check for refactoring keywords
  if (lowerContent.includes('refactor') ||
      lowerContent.includes('cleanup') ||
      lowerContent.includes('restructure') ||
      lowerContent.includes('reorganize')) {
    return 'refactor';
  }

  // Check for infrastructure keywords
  if (lowerContent.includes('infrastructure') ||
      lowerContent.includes('tooling') ||
      lowerContent.includes('script') ||
      lowerContent.includes('ci/cd') ||
      lowerContent.includes('pipeline') ||
      lowerContent.includes('automation')) {
    return 'infrastructure';
  }

  // Check for documentation keywords
  if (lowerContent.includes('documentation') ||
      lowerContent.includes('readme') ||
      lowerContent.includes('docs')) {
    return 'documentation';
  }

  // Default to feature
  return 'feature';
}

/** Canonical sd_type values accepted by strategic_directives_v2. `fix` is an alias for `bugfix` (SDKeyGenerator-compatible). */
export const EXPLICIT_TYPE_ENUM = ['feature', 'bugfix', 'fix', 'infrastructure', 'database', 'security', 'refactor', 'documentation', 'orchestrator'];

/**
 * Extract an explicit `## Type` header value from plan content.
 * Returns the lowercase value if it is in EXPLICIT_TYPE_ENUM; else null.
 * An unknown value emits a stderr warning (so operators see they mis-declared).
 *
 * @param {string} content - Plan file content
 * @returns {string|null} Validated sd_type or null
 */
export function extractExplicitType(content) {
  if (!content) return null;
  const match = content.match(/^##\s+Type\s*\n+\s*([a-z][a-z_-]*)/mi);
  if (!match) return null;
  const value = match[1].toLowerCase().trim();
  if (EXPLICIT_TYPE_ENUM.includes(value)) return value;
  // Unknown type in explicit header — warn and fall through.
  process.stderr.write(`[plan-parser] Unknown explicit \`## Type\` value: "${value}". Falling back to inferSDType(). Valid values: ${EXPLICIT_TYPE_ENUM.join(', ')}\n`);
  return null;
}

/** Canonical priority values accepted by strategic_directives_v2. */
export const EXPLICIT_PRIORITY_ENUM = ['critical', 'high', 'medium', 'low'];

/**
 * Extract an explicit `## Priority` header value from plan content.
 * Returns the lowercase value if it is in EXPLICIT_PRIORITY_ENUM; else null.
 * An unknown value emits a stderr warning.
 *
 * @param {string} content - Plan file content
 * @returns {string|null} Validated priority or null
 */
export function extractExplicitPriority(content) {
  if (!content) return null;
  const match = content.match(/^##\s+Priority\s*\n+\s*([a-z]+)/mi);
  if (!match) return null;
  const value = match[1].toLowerCase().trim();
  if (EXPLICIT_PRIORITY_ENUM.includes(value)) return value;
  process.stderr.write(`[plan-parser] Unknown explicit \`## Priority\` value: "${value}". Falling back to null. Valid values: ${EXPLICIT_PRIORITY_ENUM.join(', ')}\n`);
  return null;
}

/**
 * Extract key changes from plan content
 * Looks for sections describing what will change
 *
 * SD-LEO-INFRA-AUTO-GENERATED-PRD-001 (FR-2): Returns null when no ## Changes section
 * AND no file-table rows contribute — distinguishes "plan is silent" from "plan said nothing".
 * Section present but empty returns []; bullets or file-rows return populated array.
 *
 * @param {string} content - Plan file content
 * @returns {Array<{change: string, impact: string}>|null} Array of key changes, or null when plan provides none
 */
export function extractKeyChanges(content) {
  if (!content) return null;

  const changes = [];

  // Look for "## Changes" or "## Key Changes" or "## What Changes" sections
  // SD-LEO-INFRA-AUTO-GENERATED-PRD-001: lookahead uses (?![\s\S]) for true end-of-string so
  // lazy body does not truncate at first end-of-line (which `$` in multiline mode wrongly enabled).
  const changesPattern = /^##\s+(Changes|Key Changes|What Changes|Implementation)\s*\n\n?([\s\S]*?)(?=\n##|\n#\s|(?![\s\S]))/mi;
  const match = content.match(changesPattern);
  const sectionPresent = Boolean(match);

  if (match) {
    const sectionContent = match[2];
    // Extract bullet points as changes
    const bulletPattern = /^[-*]\s+(.+)$/gm;
    let bulletMatch;
    while ((bulletMatch = bulletPattern.exec(sectionContent)) !== null) {
      const changeText = bulletMatch[1].trim();
      changes.push({
        change: changeText,
        impact: 'See plan for details'
      });
    }
  }

  // Also extract from files table as key changes
  const files = extractFiles(content);
  files.forEach(f => {
    changes.push({
      change: `${f.action}: ${f.path}`,
      impact: f.purpose || 'File modification'
    });
  });

  if (changes.length === 0) {
    // Section present but no bullets/files → [] (author acknowledged but provided nothing).
    // Section absent AND no files → null (plan never addressed changes).
    return sectionPresent ? [] : null;
  }

  return changes.slice(0, 10); // Limit to 10
}

/**
 * Extract strategic objectives from plan content
 *
 * SD-LEO-INFRA-AUTO-GENERATED-PRD-001 (FR-2): Returns null when no Objectives/Goals section.
 * The previous summary-derived fallback was a soft default that hid enrichment gaps — removed.
 * Section present but no bullets returns []; bullets return populated array.
 *
 * @param {string} content - Plan file content
 * @returns {Array<{objective: string, metric: string}>|null} Array of objectives, or null when absent
 */
export function extractStrategicObjectives(content) {
  if (!content) return null;

  // Try to find "## Objectives" or similar sections
  const objectivesPattern = /^##\s+(Objectives|Strategic Objectives|Goals)\s*\n\n?([\s\S]*?)(?=\n##|\n#\s|(?![\s\S]))/mi;
  const match = content.match(objectivesPattern);

  if (!match) return null;

  const objectives = [];
  const sectionContent = match[2];
  const bulletPattern = /^[-*]\s+(.+)$/gm;
  let bulletMatch;
  while ((bulletMatch = bulletPattern.exec(sectionContent)) !== null) {
    objectives.push({
      objective: bulletMatch[1].trim(),
      metric: 'Completion of objective'
    });
  }

  return objectives.slice(0, 5); // Limit to 5
}

/**
 * Extract risks from plan content
 *
 * SD-LEO-INFRA-AUTO-GENERATED-PRD-001 (FR-2): Returns null when no Risks/Concerns section,
 * so ENRICHMENT_WARNING can distinguish absent from deliberately empty.
 *
 * @param {string} content - Plan file content
 * @returns {Array<{risk: string, severity: string, mitigation: string}>|null} Array of risks, or null when absent
 */
export function extractRisks(content) {
  if (!content) return null;

  // Look for "## Risks" or "## Concerns" sections
  const risksPattern = /^##\s+(Risks|Concerns|Considerations|Caveats)\s*\n\n?([\s\S]*?)(?=\n##|\n#\s|(?![\s\S]))/mi;
  const match = content.match(risksPattern);

  if (!match) return null;

  const risks = [];
  const sectionContent = match[2];
  const bulletPattern = /^[-*]\s+(.+)$/gm;
  let bulletMatch;
  while ((bulletMatch = bulletPattern.exec(sectionContent)) !== null) {
    risks.push({
      risk: bulletMatch[1].trim(),
      severity: 'medium',
      mitigation: 'Address during implementation'
    });
  }

  return risks.slice(0, 5); // Limit to 5
}

/**
 * Extract success/acceptance criteria from plan content.
 *
 * SD-LEO-INFRA-AUTO-GENERATED-PRD-001 (FR-1): New extractor. Parses "## Acceptance" or
 * "## Success" / "## Success Criteria" sections; bullets map to {criterion, measure} objects.
 * Returns null when section absent so ENRICHMENT_WARNING can fire on defaulted success_criteria.
 *
 * @param {string} content - Plan file content
 * @returns {Array<{criterion: string, measure: string}>|null} Array of criteria, or null when absent
 */
export function extractSuccessCriteria(content) {
  if (!content) return null;

  const sectionPattern = /^##\s+(Acceptance|Success|Success Criteria|Acceptance Criteria)\s*\n\n?([\s\S]*?)(?=\n##|\n#\s|(?![\s\S]))/mi;
  const match = content.match(sectionPattern);

  if (!match) return null;

  const criteria = [];
  const sectionContent = match[2];
  const bulletPattern = /^[-*]\s+(.+)$/gm;
  let bulletMatch;
  while ((bulletMatch = bulletPattern.exec(sectionContent)) !== null) {
    criteria.push({
      criterion: bulletMatch[1].trim(),
      measure: 'See plan for details'
    });
  }

  return criteria.slice(0, 10);
}

/**
 * Parse a complete plan file and extract all structured content
 *
 * @param {string} content - Plan file content
 * @returns {Object} Parsed plan with title, summary, steps, files, type, and fullContent
 */
export function parsePlanFile(content) {
  if (!content) {
    return {
      title: null,
      summary: null,
      steps: [],
      files: [],
      keyChanges: null,
      strategicObjectives: null,
      risks: null,
      successCriteria: null,
      type: 'feature',
      priority: null,
      fullContent: ''
    };
  }

  // Explicit authored intent wins over heuristic inference. Inference is fallback, not override.
  const explicitType = extractExplicitType(content);
  const explicitPriority = extractExplicitPriority(content);

  return {
    title: extractTitle(content),
    summary: extractSummary(content),
    steps: extractSteps(content),
    files: extractFiles(content),
    keyChanges: extractKeyChanges(content),
    strategicObjectives: extractStrategicObjectives(content),
    risks: extractRisks(content),
    successCriteria: extractSuccessCriteria(content),
    type: explicitType ?? inferSDType(content),
    priority: explicitPriority,
    fullContent: content
  };
}

/**
 * Format files array into scope string for SD
 *
 * @param {Array<{path: string, action: string, purpose: string}>} files - Files to format
 * @returns {string} Formatted scope string
 */
export function formatFilesAsScope(files) {
  if (!files || files.length === 0) {
    return '';
  }

  const lines = files.map(f => {
    const actionIcon = f.action === 'CREATE' ? '+' : f.action === 'MODIFY' ? '~' : '-';
    return `${actionIcon} ${f.path}${f.purpose ? ` - ${f.purpose}` : ''}`;
  });

  return lines.join('\n');
}

/**
 * Format steps array into success criteria for SD
 *
 * @param {Array<{text: string, completed: boolean}>} steps - Steps to format
 * @param {number} maxSteps - Maximum number of steps to include
 * @returns {Array<string>} Formatted success criteria
 */
export function formatStepsAsCriteria(steps, maxSteps = 10) {
  if (!steps || steps.length === 0) {
    return [];
  }

  return steps
    .slice(0, maxSteps)
    .map(s => s.text);
}

// Default export
export default {
  extractTitle,
  extractSummary,
  SUMMARY_CAP,
  extractSteps,
  extractFiles,
  extractKeyChanges,
  extractStrategicObjectives,
  extractRisks,
  extractSuccessCriteria,
  inferSDType,
  extractExplicitType,
  extractExplicitPriority,
  EXPLICIT_TYPE_ENUM,
  EXPLICIT_PRIORITY_ENUM,
  parsePlanFile,
  formatFilesAsScope,
  formatStepsAsCriteria
};
