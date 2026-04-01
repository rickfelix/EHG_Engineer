/**
 * Expertise Gap Detection Rubric
 *
 * Structured criteria for board seats to consistently identify
 * when specialist expertise is needed. Replaces ad-hoc LLM intuition
 * with a concrete checklist scored against 5 gap categories.
 */

export const GAP_CATEGORIES = [
  {
    id: 'TOOLING',
    name: 'Tooling Gap',
    description: 'Topic references specific tools, APIs, libraries, or CLI commands that require implementation-level knowledge to evaluate',
    examples: [
      'Supabase migration rollback mechanics',
      'AST parser selection for route detection',
      'GitHub Actions matrix strategy configuration'
    ]
  },
  {
    id: 'DOMAIN',
    name: 'Domain Knowledge Gap',
    description: 'Topic touches an industry vertical, regulatory framework, or specialized discipline outside your C-suite role',
    examples: [
      'HIPAA compliance requirements for data handling',
      'ML model selection and training pipeline design',
      'Cryptographic protocol choices for token storage'
    ]
  },
  {
    id: 'PRECEDENT',
    name: 'Precedent Gap',
    description: 'Your position requires knowledge of how similar problems were solved in this codebase — specific patterns, tables, modules, or prior decisions you cannot reference with confidence',
    examples: [
      'How the existing gate system enforces EXEC checks',
      'What pattern other skills use for DB verification',
      'How the handoff system detects incomplete work'
    ]
  },
  {
    id: 'QUANTITATIVE',
    name: 'Quantitative Gap',
    description: 'Your position requires specific numbers — benchmarks, thresholds, costs, or performance targets — that you cannot provide with confidence',
    examples: [
      'Token cost per board deliberation session',
      'Acceptable migration execution time threshold',
      'Test coverage percentage that correlates with integration quality'
    ]
  },
  {
    id: 'CROSS_SYSTEM',
    name: 'Cross-System Gap',
    description: 'Topic involves interaction between two or more systems where the integration behavior is non-obvious and requires hands-on experience',
    examples: [
      'GitHub Actions triggering Supabase migrations on merge',
      'Replit export format compatibility with LEO import pipeline',
      'CI/CD webhook chains across multiple repositories'
    ]
  }
];

/**
 * Build the rubric text to inject into each board seat's system prompt.
 * The rubric is the same for all seats — each seat applies it from
 * its own domain perspective.
 */
export function buildRubricPrompt() {
  const categoryLines = GAP_CATEGORIES.map((cat, i) => {
    const exampleList = cat.examples.map(e => `     - "${e}"`).join('\n');
    return `${i + 1}. ${cat.name.toUpperCase()} — ${cat.description}
   Examples:
${exampleList}`;
  }).join('\n\n');

  return `
EXPERTISE GAP DETECTION RUBRIC
===============================
Evaluate your position against each category below. Flag a gap when the
missing knowledge would materially change your recommendation.

${categoryLines}

SCORING GUIDANCE:
- If you CAN produce a substantive position without the missing knowledge
  → note the gap but continue with your best assessment
- If the gap would MATERIALLY change your recommendation
  → FLAG as EXPERTISE_GAP (specialists will be summoned)
- If MULTIPLE seats are likely to hit the same gap
  → FLAG (one specialist serves all seats)

FORMAT: EXPERTISE_GAP: [CATEGORY] — [specific knowledge needed]
Example: EXPERTISE_GAP: TOOLING — Supabase CLI migration status API for detecting pending vs applied migrations
Example: EXPERTISE_GAP: PRECEDENT — How the existing handoff.js validates integration completeness before phase transition
Example: EXPERTISE_GAP: CROSS_SYSTEM — Interaction between PreToolUse hooks and skill invocation during EXEC gate checks
`;
}
