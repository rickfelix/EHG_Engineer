/**
 * Implementation Context Utilities
 * Shared module for context-aware constraints across PRD and story generation.
 *
 * ROOT CAUSE: RCA-STORY-BOILERPLATE-001
 * Previously, implementation context constraints were only in PRD generation
 * (scripts/prd/llm-generator.js) but not in user story generation,
 * causing UI boilerplate to be applied to database/cli/infrastructure SDs.
 *
 * ROOT CAUSE: RCA-HYBRID-SD-001
 * detectImplementationContext() only analyzed SD-level scope, causing ALL stories
 * in hybrid SDs (database + code) to receive the same context. Stories about code
 * received database guidance, failing quality gates.
 * Fix: Added detectImplementationContextFromText() for per-story detection.
 *
 * @module implementation-context
 */

/**
 * Get implementation context constraints for LLM generation
 * Prevents LLM from hallucinating irrelevant requirements
 *
 * @param {string} context - Implementation context (cli, web, api, database, infrastructure, hybrid)
 * @returns {string|null} Context-specific constraints or null if no special constraints
 */
export function getImplementationContextConstraints(context) {
  const constraints = {
    cli: `**DO NOT INCLUDE requirements related to**:
- WCAG 2.1 accessibility (color contrast, screen readers, keyboard navigation)
- Responsive design or mobile layouts
- Browser compatibility or CSS styling
- Theme support (light/dark mode)
- UI render performance (500ms SLA, etc.)
- Component architecture or UI frameworks

**FOCUS ON**:
- Command-line argument parsing and validation
- Exit codes and error messages
- Terminal output formatting
- Signal handling (SIGINT, SIGTERM)
- Piping and file I/O
- Environment variable handling`,

    api: `**DO NOT INCLUDE requirements related to**:
- UI/UX design or user interface components
- WCAG accessibility for visual elements
- Frontend performance metrics
- Browser-specific behavior

**FOCUS ON**:
- REST/GraphQL endpoint design
- Request/response schemas
- HTTP status codes and error handling
- Authentication and authorization
- Rate limiting and throttling
- API versioning
- Documentation (OpenAPI/Swagger)`,

    database: `**DO NOT INCLUDE requirements related to**:
- UI components or user interface
- Frontend frameworks or styling
- User interaction flows
- Browser compatibility
- "on the relevant page" or "form/action page" scenarios
- "displayed inline" or "page reload" UI patterns

**FOCUS ON**:
- Schema design and migrations
- RLS policies and security
- Index optimization
- Data integrity constraints
- Transaction handling
- Backup and recovery
- Query performance`,

    infrastructure: `**DO NOT INCLUDE requirements related to**:
- End-user UI or visual design
- WCAG accessibility for user interfaces
- Customer-facing features
- User journey or experience
- "on the relevant page" or "form/action page" scenarios

**FOCUS ON**:
- System configuration and setup
- Developer tooling and scripts
- CI/CD pipeline integration
- Monitoring and logging
- Internal process automation
- Documentation and runbooks`,

    hybrid: 'This SD involves multiple implementation contexts. Requirements should be tagged with their applicable context (CLI, Web, API, Database) to ensure traceability.',

    web: null // Default context, no special constraints
  };

  return constraints[context] || constraints.web;
}

/**
 * Detect implementation context from SD metadata when not explicitly set
 *
 * @param {Object} sd - Strategic directive data
 * @returns {string} Detected implementation context
 */
export function detectImplementationContext(sd) {
  // If explicitly set, use it
  if (sd.implementation_context && sd.implementation_context !== 'web') {
    return sd.implementation_context;
  }

  const sdType = (sd.sd_type || '').toLowerCase();
  const scope = (sd.scope || sd.description || '').toLowerCase();
  const title = (sd.title || '').toLowerCase();
  const text = `${scope} ${title}`;

  // SD type-based detection
  if (sdType === 'database') return 'database';
  if (sdType === 'infrastructure') return 'infrastructure';

  // Keyword-based detection from scope/title
  const contextScores = {
    database: 0,
    cli: 0,
    api: 0,
    infrastructure: 0,
    web: 0
  };

  const databaseKeywords = ['schema', 'migration', 'column', 'table', 'constraint', 'check constraint', 'foreign key', 'fk', 'rls', 'index', 'sql', 'alter table', 'add column', 'uuid'];
  const cliKeywords = ['command line', 'cli', 'terminal', 'script', 'node scripts/', 'npm run', 'exit code', 'stdout', 'stderr'];
  const apiKeywords = ['endpoint', 'rest api', 'graphql', 'http', 'request', 'response', 'route', 'middleware'];
  const infraKeywords = ['ci/cd', 'pipeline', 'deployment', 'docker', 'monitoring', 'logging', 'automation', 'tooling', '.js ', '.mjs', 'engine.js', 'processissue', 'routing logic', 'deterministic'];
  const webKeywords = ['component', 'page', 'dashboard', 'ui', 'ux', 'responsive', 'button', 'form', 'modal', 'sidebar'];

  for (const kw of databaseKeywords) { if (text.includes(kw)) contextScores.database += 2; }
  for (const kw of cliKeywords) { if (text.includes(kw)) contextScores.cli += 2; }
  for (const kw of apiKeywords) { if (text.includes(kw)) contextScores.api += 2; }
  for (const kw of infraKeywords) { if (text.includes(kw)) contextScores.infrastructure += 2; }
  for (const kw of webKeywords) { if (text.includes(kw)) contextScores.web += 2; }

  // Find highest scoring context
  const sorted = Object.entries(contextScores).sort((a, b) => b[1] - a[1]);
  const [topContext, topScore] = sorted[0];
  const [, secondScore] = sorted[1];

  // Only override web default if there's a clear winner
  if (topScore > 0 && topScore > secondScore) {
    return topContext;
  }

  return sd.implementation_context || 'web';
}

/**
 * Detect implementation context from arbitrary text (story title, user want, etc.)
 * RCA-HYBRID-SD-001: Enables per-story context detection for hybrid SDs
 *
 * Used when an SD has mixed contexts (database + code) to detect the appropriate
 * context for each individual user story based on its title and content.
 *
 * @param {...string} textParts - Text fragments to analyze (title, user want, description)
 * @returns {{ context: string, score: number, isConclusive: boolean }} Context with confidence
 */
export function detectImplementationContextFromText(...textParts) {
  const text = textParts.filter(Boolean).join(' ').toLowerCase();

  const contextScores = {
    database: 0,
    cli: 0,
    api: 0,
    infrastructure: 0,
    web: 0
  };

  // Use same keyword lists as detectImplementationContext for consistency
  const databaseKeywords = ['schema', 'migration', 'column', 'table', 'constraint', 'check constraint', 'foreign key', 'fk', 'rls', 'index', 'sql', 'alter table', 'add column', 'uuid'];
  const cliKeywords = ['command line', 'cli', 'terminal', 'script', 'node scripts/', 'npm run', 'exit code', 'stdout', 'stderr'];
  const apiKeywords = ['endpoint', 'rest api', 'graphql', 'http', 'request', 'response', 'route', 'middleware'];
  const infraKeywords = ['ci/cd', 'pipeline', 'deployment', 'docker', 'monitoring', 'logging', 'automation', 'tooling', '.js ', '.mjs', 'engine.js', 'processissue', 'routing logic', 'deterministic'];
  const webKeywords = ['component', 'page', 'dashboard', 'ui', 'ux', 'responsive', 'button', 'form', 'modal', 'sidebar'];

  for (const kw of databaseKeywords) { if (text.includes(kw)) contextScores.database += 2; }
  for (const kw of cliKeywords) { if (text.includes(kw)) contextScores.cli += 2; }
  for (const kw of apiKeywords) { if (text.includes(kw)) contextScores.api += 2; }
  for (const kw of infraKeywords) { if (text.includes(kw)) contextScores.infrastructure += 2; }
  for (const kw of webKeywords) { if (text.includes(kw)) contextScores.web += 2; }

  const sorted = Object.entries(contextScores).sort((a, b) => b[1] - a[1]);
  const [topContext, topScore] = sorted[0];
  const [, secondScore] = sorted[1];

  // Conclusive if: top score >= 4 (at least 2 keyword matches) AND clear winner (topScore > secondScore)
  const isConclusive = topScore >= 4 && topScore > secondScore;

  return {
    context: isConclusive ? topContext : 'web',
    score: topScore,
    isConclusive
  };
}

/**
 * Check if an implementation context is non-web (i.e. needs special handling)
 *
 * @param {string} context - Implementation context
 * @returns {boolean} True if context requires non-UI treatment
 */
export function isNonWebContext(context) {
  return ['database', 'cli', 'api', 'infrastructure'].includes(context);
}
