/**
 * Output Schema Extractor
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-004: FR-001
 *
 * Extracts outputSchema from a stage template's schema definition.
 * Non-derived, non-upstream fields become the declared output contract.
 */

/**
 * Extract output schema from a template's schema.
 * Filters out derived fields and upstream data references (stageNData).
 *
 * @param {Object} schema - Template schema definition
 * @returns {Array<{field: string, type: string, required: boolean}>}
 */
export function extractOutputSchema(schema) {
  if (!schema || typeof schema !== 'object') return [];

  return Object.entries(schema)
    .filter(([key, def]) => {
      // Exclude derived fields
      if (typeof def === 'object' && def.derived) return false;
      // Exclude upstream data references
      if (key.match(/^stage\d+Data$/)) return false;
      return true;
    })
    .map(([key, def]) => ({
      field: key,
      type: typeof def === 'object' ? (def.type || 'any') : typeof def,
      required: typeof def === 'object' ? def.required !== false : true,
    }));
}

/**
 * Add outputSchema to a template if not already present.
 * Mutates the template object.
 *
 * @param {Object} template - Stage template (TEMPLATE export)
 * @returns {Object} Same template with outputSchema added
 */
export function ensureOutputSchema(template) {
  if (!template.outputSchema && template.schema) {
    template.outputSchema = extractOutputSchema(template.schema);
  }
  return template;
}
