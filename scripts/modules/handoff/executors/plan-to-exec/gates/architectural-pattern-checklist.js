/**
 * Architectural Pattern Checklist Gate for PLAN-TO-EXEC
 * Part of SD-LEO-ORCH-QUALITY-GATE-ENHANCEMENTS-001-C
 *
 * Scans PRD text for architectural pattern keywords: state management,
 * error handling/compensation, and observability.
 *
 * Only runs for complex SDs (story_points >= 8 OR LOC >= 500 OR hasChildren).
 * ADVISORY only - does not block handoff.
 *
 * Fixes triangulation finding about missing architectural patterns.
 */

/**
 * Pattern categories with keywords for case-insensitive matching.
 * Each category has a set of keywords/phrases that indicate the PRD
 * addresses that architectural concern.
 */
const PATTERN_CATEGORIES = {
  state_management: {
    label: 'State Management',
    keywords: [
      'state management', 'state machine', 'state transition',
      'redux', 'zustand', 'context provider', 'usestate', 'usereducer',
      'database state', 'session state', 'cache invalidation',
      'optimistic update', 'pessimistic lock', 'eventual consistency',
      'saga', 'state store', 'atom', 'signal'
    ]
  },
  error_handling: {
    label: 'Error Handling / Compensation',
    keywords: [
      'error handling', 'error boundary', 'error recovery',
      'compensation', 'rollback', 'retry', 'circuit breaker',
      'fallback', 'graceful degradation', 'dead letter',
      'exception', 'try catch', 'error propagation',
      'idempotent', 'compensating transaction', 'fault tolerance'
    ]
  },
  observability: {
    label: 'Observability',
    keywords: [
      'observability', 'logging', 'monitoring', 'tracing',
      'metrics', 'telemetry', 'audit trail', 'audit log',
      'health check', 'alerting', 'dashboard',
      'structured log', 'correlation id', 'trace id',
      'sentry', 'datadog', 'prometheus', 'grafana'
    ]
  }
};

/**
 * Determine if an SD is "complex" based on story_points, LOC, or children.
 *
 * @param {Object} sd - Strategic Directive object
 * @param {Object} ctx - Gate context (may contain additional info)
 * @returns {{ isComplex: boolean, reason: string }}
 */
function evaluateComplexity(sd, ctx) {
  const storyPoints = sd?.metadata?.story_points || sd?.story_points || 0;
  const loc = sd?.metadata?.loc_estimate || sd?.metadata?.loc || 0;
  const hasChildren = sd?.metadata?.has_children || false;

  // Also check database for children if not in metadata
  const childCount = ctx?.childrenCount || 0;

  if (storyPoints >= 8) {
    return { isComplex: true, reason: `story_points=${storyPoints} (>= 8)` };
  }
  if (loc >= 500) {
    return { isComplex: true, reason: `LOC=${loc} (>= 500)` };
  }
  if (hasChildren || childCount > 0) {
    return { isComplex: true, reason: `hasChildren=true (${childCount} children)` };
  }

  return { isComplex: false, reason: `story_points=${storyPoints}, LOC=${loc}, children=${childCount}` };
}

/**
 * Scan PRD text for pattern keywords (case-insensitive).
 *
 * @param {string} prdText - Combined PRD text to scan
 * @param {Object} categories - Pattern categories with keywords
 * @returns {{ found: string[], missing: string[], details: Object }}
 */
function scanForPatterns(prdText, categories) {
  const normalizedText = prdText.toLowerCase();
  const found = [];
  const missing = [];
  const details = {};

  for (const [categoryKey, category] of Object.entries(categories)) {
    const matchedKeywords = category.keywords.filter(kw =>
      normalizedText.includes(kw.toLowerCase())
    );

    if (matchedKeywords.length > 0) {
      found.push(category.label);
      details[categoryKey] = {
        status: 'found',
        matched_keywords: matchedKeywords,
        count: matchedKeywords.length
      };
    } else {
      missing.push(category.label);
      details[categoryKey] = {
        status: 'missing',
        matched_keywords: [],
        count: 0
      };
    }
  }

  return { found, missing, details };
}

/**
 * Extract combined PRD text from all relevant fields.
 *
 * @param {Object} prd - PRD object from database
 * @returns {string} Combined text
 */
function extractPrdText(prd) {
  const fields = [
    prd.content,
    prd.executive_summary,
    prd.business_context,
    prd.technical_context,
    prd.system_architecture,
    prd.implementation_approach,
    prd.technical_requirements,
    prd.non_functional_requirements
  ];

  // Also include JSON fields as stringified text
  if (prd.functional_requirements) {
    fields.push(JSON.stringify(prd.functional_requirements));
  }
  if (prd.risks) {
    fields.push(JSON.stringify(prd.risks));
  }

  return fields.filter(Boolean).join(' ');
}

/**
 * Create the GATE_ARCHITECTURAL_PATTERN_CHECKLIST gate validator.
 *
 * @param {Object} prdRepo - PRD repository instance
 * @param {Object} sd - Strategic Directive object
 * @param {Object} supabase - Supabase client (for child count check)
 * @returns {Object} Gate configuration { name, validator, required }
 */
export function createArchitecturalPatternChecklistGate(prdRepo, sd, supabase) {
  return {
    name: 'GATE_ARCHITECTURAL_PATTERN_CHECKLIST',
    validator: async (_ctx) => {
      console.log('\n📐 ARCHITECTURAL PATTERN CHECKLIST GATE');
      console.log('-'.repeat(50));

      const sdType = sd?.sd_type || 'feature';
      console.log(`   📋 SD Type: ${sdType}`);

      // Check for children in database
      let childrenCount = 0;
      try {
        const { data: children } = await supabase
          .from('strategic_directives_v2')
          .select('id')
          .eq('parent_sd_id', sd?.id);
        childrenCount = children?.length || 0;
      } catch {
        // Non-blocking
      }

      // 1. Evaluate complexity
      const complexity = evaluateComplexity(sd, { childrenCount });
      console.log(`   📋 Complex: ${complexity.isComplex} (${complexity.reason})`);

      if (!complexity.isComplex) {
        console.log('   ✅ Non-complex SD - pattern checklist not applicable');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: ['Non-complex SD - architectural pattern checklist skipped'],
          details: {
            status: 'SKIPPED',
            blocking: false,
            reason: 'not_complex',
            complexity: complexity.reason,
            sd_type: sdType
          }
        };
      }

      // 2. Get PRD
      const prd = await prdRepo?.getBySdId(sd?.id);

      if (!prd) {
        console.log('   ⚠️  No PRD found - cannot scan for patterns');
        return {
          passed: true,
          score: 50,
          max_score: 100,
          issues: [],
          warnings: ['No PRD found for architectural pattern scan'],
          details: {
            status: 'WARN',
            blocking: false,
            reason: 'no_prd',
            sd_type: sdType
          }
        };
      }

      // 3. Extract and scan PRD text
      const prdText = extractPrdText(prd);

      if (!prdText || prdText.trim().length < 50) {
        console.log('   ⚠️  PRD text too short for meaningful pattern scan');
        return {
          passed: true,
          score: 60,
          max_score: 100,
          issues: [],
          warnings: ['PRD text too short for architectural pattern scan'],
          details: {
            status: 'WARN',
            blocking: false,
            reason: 'prd_too_short',
            text_length: prdText?.length || 0,
            sd_type: sdType
          }
        };
      }

      // 4. Scan for patterns
      const result = scanForPatterns(prdText, PATTERN_CATEGORIES);
      const totalCategories = Object.keys(PATTERN_CATEGORIES).length;

      console.log(`   📊 Pattern coverage: ${result.found.length}/${totalCategories} categories`);
      console.log(`   ✅ Found: ${result.found.join(', ') || '(none)'}`);

      if (result.missing.length > 0) {
        console.log(`   ⚠️  Missing: ${result.missing.join(', ')}`);
      }

      // 5. Calculate score
      const coveragePercent = Math.round((result.found.length / totalCategories) * 100);
      const score = coveragePercent;

      // 6. Build warnings for missing categories
      const warnings = [];
      if (result.missing.length > 0) {
        warnings.push(
          `Missing architectural pattern coverage: ${result.missing.join(', ')}. ` +
          'Consider addressing these in the PRD before implementation.'
        );
      }

      // All categories found
      if (result.missing.length === 0) {
        console.log('   ✅ All architectural pattern categories covered in PRD');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: {
            status: 'PASS',
            blocking: false,
            coverage_percent: 100,
            found_categories: result.found,
            missing_categories: [],
            pattern_details: result.details,
            sd_type: sdType,
            complexity: complexity.reason,
            summary: `All ${totalCategories} architectural pattern categories addressed in PRD`
          }
        };
      }

      // Some categories missing - ADVISORY only
      console.log(`   ⚠️  ADVISORY: ${result.missing.length} pattern category(ies) not found in PRD`);
      return {
        passed: true, // ADVISORY - never blocks
        score,
        max_score: 100,
        issues: [],
        warnings,
        details: {
          status: 'WARN',
          blocking: false,
          coverage_percent: coveragePercent,
          found_categories: result.found,
          missing_categories: result.missing,
          pattern_details: result.details,
          sd_type: sdType,
          complexity: complexity.reason,
          summary: `${result.found.length}/${totalCategories} categories covered. Missing: ${result.missing.join(', ')}`
        }
      };
    },
    required: false // ADVISORY only - does not block handoff
  };
}
