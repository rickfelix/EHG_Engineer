/**
 * eva-canvas-prompt.js — System prompt templates for EVA canvas content generation
 * SD-LEO-INFRA-EVA-CHAT-CANVAS-003
 *
 * Provides structured prompt fragments that instruct the LLM to produce
 * canvas-compatible JSON output for various content types.
 */

/**
 * Core instruction fragment for canvas JSON output.
 * Append to the system prompt when canvas mode is active.
 */
export const CANVAS_SYSTEM_PROMPT = `
When the user's question warrants a visual artifact (comparison, analysis, chart, or structured summary), respond with a canvas JSON block.

Format your response as:
\`\`\`canvas-json
{
  "type": "<content-type>",
  "title": "<short descriptive title>",
  "data": { ... }
}
\`\`\`

Supported content types and their data schemas:

1. "decision-matrix" — Weighted scoring of options against criteria
   {
     "options": ["Option A", "Option B"],
     "criteria": [{ "name": "Cost", "weight": 2 }, { "name": "Speed", "weight": 1 }],
     "scores": [[8, 6], [5, 9]],  // scores[option_index][criteria_index], 1-10
     "recommendation": "Option A scores highest due to..."
   }

2. "comparison-table" — Side-by-side comparison
   {
     "columns": [{ "key": "feature", "label": "Feature" }, { "key": "optA", "label": "Option A" }],
     "rows": [{ "feature": "Price", "optA": "$10" }],
     "highlights": [{ "row": 0, "column": "optA", "type": "positive" }]  // positive|negative|neutral
   }

3. "chart" — Bar, line, or pie chart
   {
     "chartType": "bar",  // bar|line|pie
     "data": [{ "name": "Q1", "revenue": 100, "cost": 80 }],
     "xKey": "name",
     "series": [{ "key": "revenue", "label": "Revenue", "color": "#34d399" }]
   }

4. "text" — Structured text with sections
   {
     "content": "Plain text content",
     "sections": [{ "heading": "Overview", "body": "Detailed content here" }]
   }

Guidelines:
- Use decision-matrix for trade-off analysis with quantifiable criteria
- Use comparison-table for feature/option comparisons
- Use chart for numerical data visualization
- Use text for summaries, reports, or structured narratives
- Always include a descriptive title
- Scores in decision-matrix are 1-10
- You can include regular text before or after the canvas-json block
`.trim();

/**
 * Build a complete system prompt for EVA with canvas support.
 * @param {string} basePrompt - The existing EVA system prompt
 * @returns {string} Combined prompt with canvas instructions
 */
export function buildCanvasSystemPrompt(basePrompt) {
  return `${basePrompt}\n\n${CANVAS_SYSTEM_PROMPT}`;
}

/**
 * Content type descriptions for UI display or prompt context.
 */
export const CANVAS_CONTENT_TYPES = {
  'decision-matrix': {
    label: 'Decision Matrix',
    description: 'Weighted scoring of options against criteria',
    suggestWhen: 'comparing multiple options with quantifiable trade-offs',
  },
  'comparison-table': {
    label: 'Comparison Table',
    description: 'Side-by-side feature or option comparison',
    suggestWhen: 'comparing features, specs, or attributes across options',
  },
  'chart': {
    label: 'Chart',
    description: 'Bar, line, or pie chart visualization',
    suggestWhen: 'presenting numerical data, trends, or distributions',
  },
  'text': {
    label: 'Text',
    description: 'Structured text with optional sections',
    suggestWhen: 'presenting summaries, reports, or structured narratives',
  },
};
