/**
 * Markdown-to-Sections Parser
 * SD-LEO-INFRA-DATABASE-FIRST-VISION-001
 *
 * Parses markdown content into structured sections using H2 headings
 * as section boundaries. Maps headings to section keys using the
 * document_section_schemas registry.
 */

/**
 * Build a default heading-to-key mapping for common headings.
 * Used when no database mapping is available (offline/fallback).
 *
 * @returns {Map<string, string>}
 */
export function buildDefaultMapping() {
  const entries = [
    // Vision sections
    ['executive summary', 'executive_summary'],
    ['problem statement', 'problem_statement'],
    ['personas', 'personas'],
    ['information architecture', 'information_architecture'],
    ['key decision points', 'key_decision_points'],
    ['integration patterns', 'integration_patterns'],
    ['evolution plan', 'evolution_plan'],
    ['out of scope', 'out_of_scope'],
    ['ui/ux wireframes', 'ui_ux_wireframes'],
    ['ui ux wireframes', 'ui_ux_wireframes'],
    ['wireframes', 'ui_ux_wireframes'],
    ['success criteria', 'success_criteria'],
    // Architecture plan sections
    ['stack & repository decisions', 'stack_and_repository'],
    ['stack and repository decisions', 'stack_and_repository'],
    ['stack & repository', 'stack_and_repository'],
    ['legacy deprecation plan', 'legacy_deprecation'],
    ['legacy deprecation', 'legacy_deprecation'],
    ['route & component structure', 'route_and_component_structure'],
    ['route and component structure', 'route_and_component_structure'],
    ['data layer', 'data_layer'],
    ['api surface', 'api_surface'],
    ['implementation phases', 'implementation_phases'],
    ['testing strategy', 'testing_strategy'],
    ['risk mitigation', 'risk_mitigation'],
  ];
  return new Map(entries);
}

/**
 * Parse markdown content into sections keyed by section_key.
 *
 * @param {string} content - Raw markdown content (may contain CRLF)
 * @param {Map<string, string>} [headingToKeyMap] - Optional heading→key mapping
 * @returns {Object} sections - { section_key: content_string, ... }
 */
export function parseMarkdownToSections(content, headingToKeyMap) {
  const mapping = headingToKeyMap || buildDefaultMapping();

  // Normalize CRLF to LF (Supabase stores CRLF on Windows)
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const lines = normalized.split('\n');
  const sections = {};
  let currentKey = null;
  let currentLines = [];

  for (const line of lines) {
    // Match H2 headings: "## Heading Text"
    const h2Match = line.match(/^##\s+(.+)$/);

    if (h2Match) {
      // Save previous section
      if (currentKey) {
        sections[currentKey] = currentLines.join('\n').trim();
      }

      // Resolve new section key
      const heading = h2Match[1].trim().toLowerCase();
      currentKey = mapping.get(heading) || null;

      // If no mapping found, try fuzzy match (strip common prefixes/suffixes)
      if (!currentKey) {
        for (const [mapHeading, mapKey] of mapping.entries()) {
          if (heading.includes(mapHeading) || mapHeading.includes(heading)) {
            currentKey = mapKey;
            break;
          }
        }
      }

      // If still no match, use a slug of the heading
      if (!currentKey) {
        currentKey = heading
          .replace(/[^a-z0-9\s]/g, ' ')
          .replace(/\s+/g, '_')
          .substring(0, 50);
      }

      currentLines = [];
    } else if (currentKey !== null) {
      currentLines.push(line);
    }
    // Lines before any H2 heading are skipped (title, metadata, etc.)
  }

  // Save last section
  if (currentKey) {
    sections[currentKey] = currentLines.join('\n').trim();
  }

  return sections;
}
