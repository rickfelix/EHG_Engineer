/**
 * Capability Taxonomy Module
 * SD: SD-CAP-LEDGER-001 | US-001
 *
 * Defines formal capability types, hierarchy, and scoring criteria
 * for the Automated Capability Ledger with Plane 1 integration.
 *
 * Based on Ground-Truth Triangulation Synthesis (2026-01-08)
 */

/**
 * Capability Categories - Top-level classification
 */
export const CAPABILITY_CATEGORIES = {
  AI_AUTOMATION: {
    code: 'ai_automation',
    name: 'AI & Automation',
    description: 'AI agents, crews, and automated workflows',
    plane1_weight: 1.5, // Higher weight for AI capabilities (core EHG value)
  },
  INFRASTRUCTURE: {
    code: 'infrastructure',
    name: 'Infrastructure',
    description: 'Database schemas, functions, policies, and system foundations',
    plane1_weight: 1.2,
  },
  APPLICATION: {
    code: 'application',
    name: 'Application',
    description: 'APIs, components, services, and user-facing features',
    plane1_weight: 1.0,
  },
  INTEGRATION: {
    code: 'integration',
    name: 'Integration',
    description: 'External integrations, webhooks, and cross-system workflows',
    plane1_weight: 1.1,
  },
  GOVERNANCE: {
    code: 'governance',
    name: 'Governance',
    description: 'Validation rules, quality gates, and protocol enforcement',
    plane1_weight: 1.3,
  },
};

/**
 * Capability Types - Specific capability classifications
 *
 * Each type includes:
 * - category: Parent category code
 * - description: What this type represents
 * - maturity_criteria: How to assess maturity (0-5)
 * - extraction_criteria: How easy to reuse in other ventures
 * - examples: Real examples from EHG codebase
 */
export const CAPABILITY_TYPES = {
  // ═══════════════════════════════════════════════════════════════
  // AI & AUTOMATION CAPABILITIES
  // ═══════════════════════════════════════════════════════════════
  agent: {
    category: 'ai_automation',
    description: 'Autonomous AI agent with defined role, goal, and backstory',
    maturity_criteria: {
      0: 'Concept only, no implementation',
      1: 'Basic prompt, unreliable output',
      2: 'Functional with supervision required',
      3: 'Reliable in happy path scenarios',
      4: 'Handles edge cases, self-correcting',
      5: 'Production-grade, fully autonomous',
    },
    extraction_criteria: {
      0: 'Hardcoded to specific domain, not reusable',
      1: 'Some configurable parameters',
      2: 'Domain-specific but adaptable',
      3: 'Generic with clear extension points',
      4: 'Fully parameterized, documented API',
      5: 'Published module, versioned, tested',
    },
    examples: ['RISK-AGENT', 'REGRESSION-AGENT', 'DESIGN-AGENT'],
  },

  crew: {
    category: 'ai_automation',
    description: 'Orchestrated multi-agent workflow with defined collaboration patterns',
    maturity_criteria: {
      0: 'Concept only',
      1: 'Agents defined but no orchestration',
      2: 'Basic sequential execution',
      3: 'Parallel execution with handoffs',
      4: 'Dynamic routing based on context',
      5: 'Self-optimizing crew composition',
    },
    extraction_criteria: {
      0: 'Hardcoded agent composition',
      1: 'Configurable agent list',
      2: 'Pluggable agents, fixed workflow',
      3: 'Pluggable agents and workflow',
      4: 'Full configuration via schema',
      5: 'Published as reusable crew template',
    },
    examples: ['PRD-GENERATION-CREW', 'UAT-EXECUTION-CREW'],
  },

  tool: {
    category: 'ai_automation',
    description: 'Discrete capability exposed to AI agents for task execution',
    maturity_criteria: {
      0: 'Concept only',
      1: 'Basic function, no error handling',
      2: 'Error handling, limited validation',
      3: 'Full validation, typed inputs/outputs',
      4: 'Comprehensive logging, metrics',
      5: 'Self-describing, auto-documented',
    },
    extraction_criteria: {
      0: 'Embedded in agent code',
      1: 'Separate function, agent-specific',
      2: 'Standalone module, some dependencies',
      3: 'Zero external dependencies',
      4: 'Published with schema',
      5: 'MCP-compatible, versioned',
    },
    examples: ['database-query-tool', 'file-search-tool', 'web-fetch-tool'],
  },

  skill: {
    category: 'ai_automation',
    description: 'User-invokable capability (slash command) with defined workflow',
    maturity_criteria: {
      0: 'Concept only',
      1: 'Basic implementation, fragile',
      2: 'Works for primary use case',
      3: 'Handles variations, good UX',
      4: 'Comprehensive with help/docs',
      5: 'Self-improving based on usage',
    },
    extraction_criteria: {
      0: 'Embedded in codebase',
      1: 'Configurable via prompts',
      2: 'Standalone skill file',
      3: 'Parameterized, documented',
      4: 'Published skill template',
      5: 'Skill marketplace ready',
    },
    examples: ['/commit', '/review-pr', '/leo', '/quick-fix'],
  },

  // ═══════════════════════════════════════════════════════════════
  // INFRASTRUCTURE CAPABILITIES
  // ═══════════════════════════════════════════════════════════════
  database_schema: {
    category: 'infrastructure',
    description: 'Database table definition with indexes and constraints',
    maturity_criteria: {
      0: 'Conceptual ERD only',
      1: 'Basic CREATE TABLE, no constraints',
      2: 'Constraints, basic indexes',
      3: 'Optimized indexes, referential integrity',
      4: 'Full normalization, audit columns',
      5: 'Partitioned, performance-tuned',
    },
    extraction_criteria: {
      0: 'Domain-specific columns',
      1: 'Some generic columns',
      2: 'Pattern-based (follows conventions)',
      3: 'Template-able structure',
      4: 'Parameterized migration generator',
      5: 'Schema-as-code module',
    },
    examples: ['strategic_directives_v2', 'sd_capabilities', 'retrospectives'],
  },

  database_function: {
    category: 'infrastructure',
    description: 'Stored procedure or database function for business logic',
    maturity_criteria: {
      0: 'Concept only',
      1: 'Basic SQL, no error handling',
      2: 'Error handling, typed parameters',
      3: 'Transaction support, idempotent',
      4: 'Comprehensive logging, metrics',
      5: 'Self-documenting, versioned',
    },
    extraction_criteria: {
      0: 'Hardcoded business logic',
      1: 'Parameterized queries',
      2: 'Generic utility functions',
      3: 'Reusable across tables',
      4: 'Published function library',
      5: 'Cross-database compatible',
    },
    examples: ['fn_handle_capability_lifecycle', 'fn_calculate_sd_progress'],
  },

  rls_policy: {
    category: 'infrastructure',
    description: 'Row Level Security policy for data access control',
    maturity_criteria: {
      0: 'No RLS defined',
      1: 'Basic allow/deny',
      2: 'Role-based access',
      3: 'Multi-tenant aware',
      4: 'Comprehensive audit trail',
      5: 'Dynamic policy generation',
    },
    extraction_criteria: {
      0: 'Table-specific policy',
      1: 'Pattern-based policy',
      2: 'Reusable policy template',
      3: 'Policy generator function',
      4: 'Published RLS framework',
      5: 'Universal access control module',
    },
    examples: ['Service role full access', 'Authenticated users can read'],
  },

  migration: {
    category: 'infrastructure',
    description: 'Database schema migration for evolving data structures',
    maturity_criteria: {
      0: 'Raw SQL changes',
      1: 'Versioned migration file',
      2: 'Reversible (up/down)',
      3: 'Safe for production (no locks)',
      4: 'Zero-downtime capable',
      5: 'Auto-generated from diff',
    },
    extraction_criteria: {
      0: 'Project-specific',
      1: 'Pattern documented',
      2: 'Template available',
      3: 'Generator script',
      4: 'Migration framework',
      5: 'Universal migration tool',
    },
    examples: ['20251202_capability_lifecycle_automation.sql'],
  },

  // ═══════════════════════════════════════════════════════════════
  // APPLICATION CAPABILITIES
  // ═══════════════════════════════════════════════════════════════
  api_endpoint: {
    category: 'application',
    description: 'REST or GraphQL endpoint for data access or actions',
    maturity_criteria: {
      0: 'Concept only',
      1: 'Basic CRUD, no validation',
      2: 'Input validation, error handling',
      3: 'Auth, rate limiting, logging',
      4: 'Versioned, documented, tested',
      5: 'OpenAPI spec, client SDKs',
    },
    extraction_criteria: {
      0: 'Hardcoded to domain',
      1: 'Parameterized routes',
      2: 'Generic CRUD generator',
      3: 'API framework patterns',
      4: 'Published API template',
      5: 'API-as-module package',
    },
    examples: ['/api/sd/next', '/api/handoff/execute'],
  },

  component: {
    category: 'application',
    description: 'React/UI component for user interface rendering',
    maturity_criteria: {
      0: 'Concept only',
      1: 'Basic render, no props',
      2: 'Props, basic styling',
      3: 'Accessible, responsive',
      4: 'Storybook, visual tests',
      5: 'Design system component',
    },
    extraction_criteria: {
      0: 'Page-specific component',
      1: 'Some configurable props',
      2: 'Reusable within project',
      3: 'Generic, well-documented',
      4: 'Published component',
      5: 'Component library entry',
    },
    examples: ['ErrorBoundary', 'SDQueueDisplay', 'HandoffStatusBadge'],
  },

  hook: {
    category: 'application',
    description: 'React hook for shared stateful logic',
    maturity_criteria: {
      0: 'Concept only',
      1: 'Basic hook, side effects',
      2: 'Cleanup, error handling',
      3: 'TypeScript, tested',
      4: 'Comprehensive documentation',
      5: 'Published hook library',
    },
    extraction_criteria: {
      0: 'Component-specific',
      1: 'Extracted to shared',
      2: 'Parameterized',
      3: 'Generic utility hook',
      4: 'Published package',
      5: 'Hook ecosystem entry',
    },
    examples: ['useSDProgress', 'useHandoffStatus', 'useCapabilityLedger'],
  },

  service: {
    category: 'application',
    description: 'Backend service module for business logic orchestration',
    maturity_criteria: {
      0: 'Concept only',
      1: 'Basic implementation',
      2: 'Error handling, logging',
      3: 'Testable, dependency injection',
      4: 'Metrics, health checks',
      5: 'Self-healing, auto-scaling',
    },
    extraction_criteria: {
      0: 'Embedded in route',
      1: 'Separate module',
      2: 'Interface-driven',
      3: 'Pluggable dependencies',
      4: 'Published service',
      5: 'Microservice-ready',
    },
    examples: ['HandoffExecutor', 'CapabilityAnalyzer', 'PRDGenerator'],
  },

  utility: {
    category: 'application',
    description: 'Standalone utility function for common operations',
    maturity_criteria: {
      0: 'Inline code',
      1: 'Extracted function',
      2: 'Typed, documented',
      3: 'Unit tested',
      4: 'Comprehensive edge cases',
      5: 'Published utility',
    },
    extraction_criteria: {
      0: 'Project-specific',
      1: 'Parameterized',
      2: 'Generic',
      3: 'Zero dependencies',
      4: 'npm-publishable',
      5: 'Published package',
    },
    examples: ['formatSDKey', 'calculateProgress', 'parseHandoffScore'],
  },

  // ═══════════════════════════════════════════════════════════════
  // INTEGRATION CAPABILITIES
  // ═══════════════════════════════════════════════════════════════
  workflow: {
    category: 'integration',
    description: 'Multi-step automated process with defined triggers and actions',
    maturity_criteria: {
      0: 'Concept only',
      1: 'Manual multi-step process',
      2: 'Partially automated',
      3: 'Fully automated, happy path',
      4: 'Error recovery, retry logic',
      5: 'Self-optimizing workflow',
    },
    extraction_criteria: {
      0: 'Hardcoded steps',
      1: 'Configurable steps',
      2: 'Template-based',
      3: 'Workflow DSL',
      4: 'Published workflow',
      5: 'Workflow marketplace',
    },
    examples: ['LEO-HANDOFF-WORKFLOW', 'SD-COMPLETION-WORKFLOW'],
  },

  webhook: {
    category: 'integration',
    description: 'HTTP callback endpoint for external system integration',
    maturity_criteria: {
      0: 'Concept only',
      1: 'Basic receiver',
      2: 'Signature validation',
      3: 'Idempotent, queued processing',
      4: 'Comprehensive logging, replay',
      5: 'Self-documenting, versioned',
    },
    extraction_criteria: {
      0: 'Provider-specific',
      1: 'Adapter pattern',
      2: 'Generic webhook handler',
      3: 'Webhook framework',
      4: 'Published handler',
      5: 'Universal webhook gateway',
    },
    examples: ['github-webhook', 'vercel-webhook', 'stripe-webhook'],
  },

  external_integration: {
    category: 'integration',
    description: 'Client library or adapter for external service',
    maturity_criteria: {
      0: 'Direct API calls',
      1: 'Wrapper functions',
      2: 'Typed client',
      3: 'Retry, circuit breaker',
      4: 'Caching, rate limiting',
      5: 'Self-healing client',
    },
    extraction_criteria: {
      0: 'Hardcoded credentials',
      1: 'Configurable endpoints',
      2: 'Environment-based config',
      3: 'Dependency injection',
      4: 'Published client',
      5: 'Official SDK contribution',
    },
    examples: ['supabase-client', 'openai-client', 'anthropic-client'],
  },

  // ═══════════════════════════════════════════════════════════════
  // GOVERNANCE CAPABILITIES
  // ═══════════════════════════════════════════════════════════════
  validation_rule: {
    category: 'governance',
    description: 'Business rule enforced via validation logic',
    maturity_criteria: {
      0: 'Documented requirement',
      1: 'Manual check',
      2: 'Automated check',
      3: 'Enforced at gate',
      4: 'Self-correcting',
      5: 'Predictive prevention',
    },
    extraction_criteria: {
      0: 'Domain-specific',
      1: 'Parameterized rule',
      2: 'Rule template',
      3: 'Rule engine compatible',
      4: 'Published rule',
      5: 'Rule marketplace',
    },
    examples: ['PRD-QUALITY-GATE', 'HANDOFF-SCORE-THRESHOLD'],
  },

  quality_gate: {
    category: 'governance',
    description: 'Checkpoint that blocks progression without meeting criteria',
    maturity_criteria: {
      0: 'Concept only',
      1: 'Manual gate',
      2: 'Automated check',
      3: 'Automated block',
      4: 'Override with audit',
      5: 'Adaptive thresholds',
    },
    extraction_criteria: {
      0: 'Project-specific gate',
      1: 'Configurable threshold',
      2: 'Generic gate pattern',
      3: 'Gate framework',
      4: 'Published gate',
      5: 'Gate marketplace',
    },
    examples: ['PLAN-TO-EXEC-GATE', 'PR-MERGE-GATE', 'UAT-PASS-GATE'],
  },

  protocol: {
    category: 'governance',
    description: 'Defined process with phases, roles, and transitions',
    maturity_criteria: {
      0: 'Informal process',
      1: 'Documented process',
      2: 'Tooling support',
      3: 'Automated transitions',
      4: 'Metrics and optimization',
      5: 'Self-evolving protocol',
    },
    extraction_criteria: {
      0: 'Organization-specific',
      1: 'Documented pattern',
      2: 'Template-based',
      3: 'Protocol framework',
      4: 'Published protocol',
      5: 'Protocol standard',
    },
    examples: ['LEO-PROTOCOL', 'FOUR-OATHS', 'GROUND-TRUTH-TRIANGULATION'],
  },
};

/**
 * Get all capability type codes for database constraint
 */
export function getCapabilityTypeCodes() {
  return Object.keys(CAPABILITY_TYPES);
}

/**
 * Get capability type details
 */
export function getCapabilityType(typeCode) {
  return CAPABILITY_TYPES[typeCode] || null;
}

/**
 * Get all types in a category
 */
export function getTypesByCategory(categoryCode) {
  return Object.entries(CAPABILITY_TYPES)
    .filter(([_, type]) => type.category === categoryCode)
    .map(([code, type]) => ({ code, ...type }));
}

/**
 * Calculate Plane 1 sub-scores for a capability
 *
 * Plane 1 (Capability Graph) components:
 * - Graph Centrality Gain (0-5): How central is this to the capability graph?
 * - Maturity Lift (0-5): What maturity level does this add?
 * - Extraction Clarity (0-5): How reusable/extractable is this?
 *
 * @param {Object} capability - Capability with type, maturity, extraction scores
 * @returns {Object} Plane 1 scoring breakdown
 */
export function calculatePlane1Score(capability) {
  const type = CAPABILITY_TYPES[capability.capability_type];
  if (!type) {
    return {
      graph_centrality_gain: 0,
      maturity_lift: 0,
      extraction_clarity: 0,
      raw_total: 0,
      weighted_total: 0,
      category_weight: 1.0,
    };
  }

  const category = CAPABILITY_CATEGORIES[type.category.toUpperCase()];
  const categoryWeight = category?.plane1_weight || 1.0;

  // Graph Centrality Gain: Based on how many other capabilities depend on this
  // For now, use reuse_count as proxy (will be enhanced with dependency analysis)
  const reuse = capability.reuse_count || 0;
  const graphCentralityGain = Math.min(5, Math.floor(reuse / 2));

  // Maturity Lift: Direct from maturity score
  const maturityLift = capability.maturity_score || 0;

  // Extraction Clarity: Direct from extraction score
  const extractionClarity = capability.extraction_score || 0;

  const rawTotal = graphCentralityGain + maturityLift + extractionClarity;
  const weightedTotal = rawTotal * categoryWeight;

  return {
    graph_centrality_gain: graphCentralityGain,
    maturity_lift: maturityLift,
    extraction_clarity: extractionClarity,
    raw_total: rawTotal,
    weighted_total: Math.round(weightedTotal * 100) / 100,
    category_weight: categoryWeight,
    max_possible: 15 * categoryWeight,
  };
}

/**
 * Validate a capability type is valid
 */
export function isValidCapabilityType(typeCode) {
  return typeCode in CAPABILITY_TYPES;
}

/**
 * Get maturity description for a type and score
 */
export function getMaturityDescription(typeCode, score) {
  const type = CAPABILITY_TYPES[typeCode];
  if (!type || !type.maturity_criteria) return null;
  return type.maturity_criteria[score] || null;
}

/**
 * Get extraction description for a type and score
 */
export function getExtractionDescription(typeCode, score) {
  const type = CAPABILITY_TYPES[typeCode];
  if (!type || !type.extraction_criteria) return null;
  return type.extraction_criteria[score] || null;
}

// Export for database migration
export const CAPABILITY_TYPE_ENUM = getCapabilityTypeCodes().map((c) => `'${c}'`).join(', ');
