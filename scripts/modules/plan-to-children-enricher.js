#!/usr/bin/env node

/**
 * Plan-to-Children Enricher Module
 *
 * Extracts detailed scope information from a master plan file and enriches
 * child SD scope fields. This prevents the common pattern where:
 * - A detailed plan is created
 * - An orchestrator SD is created with children
 * - Children get generic scopes that don't include plan details
 *
 * Usage:
 *   import { extractPlanSections, enrichChildrenFromPlan } from './plan-to-children-enricher.js';
 *
 *   // Extract sections from plan
 *   const sections = await extractPlanSections('docs/planning/my-plan.md');
 *
 *   // Map children to sections and enrich
 *   const childMapping = [
 *     { childId: 'SD-XXX-001-A', sectionPattern: /Phase 1|Discovery/ },
 *     { childId: 'SD-XXX-001-B', sectionPattern: /Phase 2\.1|Root.*Cleanup/ },
 *   ];
 *   await enrichChildrenFromPlan(sections, childMapping);
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Extract sections from a markdown plan file.
 * Sections are delimited by ## headers.
 *
 * @param {string} planPath - Path to the plan markdown file
 * @returns {Array<{title: string, level: number, content: string, subsections: Array}>}
 */
export function extractPlanSections(planPath) {
  const fullPath = path.isAbsolute(planPath)
    ? planPath
    : path.join(process.cwd(), planPath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Plan file not found: ${fullPath}`);
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');

  const sections = [];
  let currentSection = null;
  let currentSubsection = null;

  for (const line of lines) {
    // Check for ## header (main section)
    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      // Save previous section
      if (currentSection) {
        if (currentSubsection) {
          currentSection.subsections.push(currentSubsection);
          currentSubsection = null;
        }
        sections.push(currentSection);
      }

      currentSection = {
        title: h2Match[1].trim(),
        level: 2,
        content: '',
        subsections: []
      };
      continue;
    }

    // Check for ### header (subsection)
    const h3Match = line.match(/^### (.+)$/);
    if (h3Match && currentSection) {
      if (currentSubsection) {
        currentSection.subsections.push(currentSubsection);
      }
      currentSubsection = {
        title: h3Match[1].trim(),
        level: 3,
        content: ''
      };
      continue;
    }

    // Add content to current subsection or section
    if (currentSubsection) {
      currentSubsection.content += line + '\n';
    } else if (currentSection) {
      currentSection.content += line + '\n';
    }
  }

  // Save final section
  if (currentSection) {
    if (currentSubsection) {
      currentSection.subsections.push(currentSubsection);
    }
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Find sections matching a pattern.
 *
 * @param {Array} sections - Sections from extractPlanSections
 * @param {RegExp|string} pattern - Pattern to match section titles
 * @returns {Array} Matching sections with their subsections
 */
export function findSections(sections, pattern) {
  const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
  const matches = [];

  for (const section of sections) {
    if (regex.test(section.title)) {
      matches.push(section);
    }

    // Also check subsections
    for (const sub of section.subsections) {
      if (regex.test(sub.title)) {
        matches.push({
          ...sub,
          parentSection: section.title
        });
      }
    }
  }

  return matches;
}

/**
 * Format matched sections into a scope string.
 *
 * @param {Array} matchedSections - Sections from findSections
 * @param {Object} options - Formatting options
 * @returns {string} Formatted scope content
 */
export function formatScopeFromSections(matchedSections, options = {}) {
  const {
    maxLength = 5000,
    includeSubsections = true,
    headerPrefix = ''
  } = options;

  let scope = '';

  for (const section of matchedSections) {
    // Add section header
    if (headerPrefix) {
      scope += `${headerPrefix}: ${section.title}\n\n`;
    } else {
      scope += `${section.title}\n\n`;
    }

    // Add section content (trimmed)
    const content = section.content.trim();
    if (content) {
      scope += content + '\n\n';
    }

    // Add subsections if requested
    if (includeSubsections && section.subsections) {
      for (const sub of section.subsections) {
        scope += `${sub.title}:\n`;
        const subContent = sub.content.trim();
        if (subContent) {
          // Indent subsection content
          scope += subContent.split('\n').map(l => l).join('\n') + '\n\n';
        }
      }
    }
  }

  // Truncate if too long
  if (scope.length > maxLength) {
    scope = scope.substring(0, maxLength - 50) + '\n\n[... truncated, see plan file for full details]';
  }

  return scope.trim();
}

/**
 * Enrich child SDs with content from plan sections.
 *
 * @param {string} planPath - Path to the plan file
 * @param {Array<{childId: string, sectionPattern: RegExp|string, options?: Object}>} childMapping
 * @returns {Object} Results of enrichment
 */
export async function enrichChildrenFromPlan(planPath, childMapping) {
  const sections = extractPlanSections(planPath);
  const results = { success: [], failed: [], skipped: [] };

  for (const mapping of childMapping) {
    const { childId, sectionPattern, options = {} } = mapping;

    // Find matching sections
    const matchedSections = findSections(sections, sectionPattern);

    if (matchedSections.length === 0) {
      results.skipped.push({
        childId,
        reason: `No sections matched pattern: ${sectionPattern}`
      });
      continue;
    }

    // Format scope
    const scope = formatScopeFromSections(matchedSections, options);

    // Update database
    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({ scope })
      .eq('id', childId);

    if (error) {
      results.failed.push({ childId, error: error.message });
    } else {
      results.success.push({
        childId,
        sectionsMatched: matchedSections.map(s => s.title),
        scopeLength: scope.length
      });
    }
  }

  return results;
}

/**
 * Auto-detect child mapping from plan phases.
 * Assumes plan has "Phase N" sections and children are suffixed A, B, C...
 *
 * @param {string} planPath - Path to plan file
 * @param {string} parentSdId - Parent SD ID (e.g., 'SD-LEO-DOC-CLEANUP-001')
 * @returns {Array} Auto-generated child mapping
 */
export function autoDetectChildMapping(planPath, parentSdId) {
  const sections = extractPlanSections(planPath);
  const mapping = [];

  // Find phase sections
  const phaseSections = sections.filter(s =>
    /^Phase \d/i.test(s.title) ||
    /^Step \d/i.test(s.title) ||
    /^\d+\./i.test(s.title)
  );

  // Map to children (A, B, C, ...)
  phaseSections.forEach((section, index) => {
    const childSuffix = String.fromCharCode(65 + index); // A, B, C...
    const childId = `${parentSdId}-${childSuffix}`;

    mapping.push({
      childId,
      sectionPattern: new RegExp(section.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      detectedTitle: section.title
    });
  });

  return mapping;
}

/**
 * CLI entry point for manual enrichment.
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Plan-to-Children Enricher

Usage:
  node plan-to-children-enricher.js <plan-path> <parent-sd-id> [--auto]

Arguments:
  plan-path     Path to the master plan markdown file
  parent-sd-id  The parent orchestrator SD ID (e.g., SD-LEO-DOC-CLEANUP-001)
  --auto        Auto-detect phase-to-child mapping

Examples:
  # Auto-detect mapping from phases
  node plan-to-children-enricher.js docs/planning/my-plan.md SD-XXX-001 --auto

  # View detected mapping without applying
  node plan-to-children-enricher.js docs/planning/my-plan.md SD-XXX-001 --preview
`);
    process.exit(1);
  }

  const planPath = args[0];
  const parentSdId = args[1];
  const autoDetect = args.includes('--auto');
  const preview = args.includes('--preview');

  console.log('\nPlan-to-Children Enricher');
  console.log('='.repeat(50));
  console.log(`Plan: ${planPath}`);
  console.log(`Parent SD: ${parentSdId}`);
  console.log('');

  // Extract sections
  const sections = extractPlanSections(planPath);
  console.log(`Found ${sections.length} top-level sections in plan`);

  // Auto-detect mapping
  const mapping = autoDetectChildMapping(planPath, parentSdId);
  console.log(`\nAuto-detected ${mapping.length} phase-to-child mappings:`);

  for (const m of mapping) {
    console.log(`  ${m.childId} ← "${m.detectedTitle}"`);
  }

  if (preview) {
    console.log('\n[Preview mode - no changes made]');
    process.exit(0);
  }

  if (!autoDetect) {
    console.log('\nAdd --auto flag to apply enrichment');
    process.exit(0);
  }

  // Apply enrichment
  console.log('\nApplying enrichment...');
  const results = await enrichChildrenFromPlan(planPath, mapping);

  console.log('\nResults:');
  console.log(`  ✅ Success: ${results.success.length}`);
  for (const s of results.success) {
    console.log(`     ${s.childId}: ${s.sectionsMatched.join(', ')} (${s.scopeLength} chars)`);
  }

  if (results.failed.length > 0) {
    console.log(`  ❌ Failed: ${results.failed.length}`);
    for (const f of results.failed) {
      console.log(`     ${f.childId}: ${f.error}`);
    }
  }

  if (results.skipped.length > 0) {
    console.log(`  ⏭️  Skipped: ${results.skipped.length}`);
    for (const s of results.skipped) {
      console.log(`     ${s.childId}: ${s.reason}`);
    }
  }
}

// Run CLI if executed directly
if (process.argv[1].includes('plan-to-children-enricher')) {
  main().catch(console.error);
}
