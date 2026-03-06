/**
 * Sections-to-Markdown Renderer
 * SD-LEO-INFRA-DATABASE-FIRST-VISION-001
 *
 * Renders structured sections back to markdown format.
 * Provides summary utilities for CLI display.
 */

/**
 * Render sections object to markdown string.
 * Uses provided schema order, or falls back to key order.
 *
 * @param {Object} sections - { section_key: content_string, ... }
 * @param {string} title - Document title for H1 heading
 * @param {Array} [schema] - Optional ordered schema array from getSectionSchema
 * @returns {string} Rendered markdown
 */
export function renderSectionsToMarkdown(sections, title, schema) {
  const parts = [];

  if (title) {
    parts.push(`# ${title}\n`);
  }

  if (schema && schema.length > 0) {
    // Render in schema order
    for (const def of schema) {
      const content = sections[def.section_key];
      if (content) {
        parts.push(`## ${def.section_name}\n\n${content}\n`);
      }
    }

    // Render any extra sections not in schema
    const schemaKeys = new Set(schema.map(s => s.section_key));
    for (const [key, content] of Object.entries(sections)) {
      if (!schemaKeys.has(key) && content) {
        const heading = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        parts.push(`## ${heading}\n\n${content}\n`);
      }
    }
  } else {
    // No schema — render in insertion order
    for (const [key, content] of Object.entries(sections)) {
      if (content) {
        const heading = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        parts.push(`## ${heading}\n\n${content}\n`);
      }
    }
  }

  return parts.join('\n');
}

/**
 * Generate a compact summary of sections for CLI display.
 *
 * @param {Object} sections - { section_key: content_string, ... }
 * @returns {string} Summary string like "8 sections (2.4 KB)"
 */
export function renderSectionsSummary(sections) {
  if (!sections || typeof sections !== 'object') return 'no sections';

  const keys = Object.keys(sections);
  const totalSize = Object.values(sections)
    .reduce((sum, v) => sum + (typeof v === 'string' ? v.length : 0), 0);

  const sizeStr = totalSize >= 1024
    ? `${(totalSize / 1024).toFixed(1)} KB`
    : `${totalSize} B`;

  return `${keys.length} sections (${sizeStr})`;
}
