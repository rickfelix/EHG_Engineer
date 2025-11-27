/**
 * Quick-Fix Root Cause Analysis Integration
 * Detects recurring patterns and systemic issues
 *
 * Purpose: Prevent band-aid fixes by detecting when the same issue
 * appears multiple times (systemic problem requiring full SD)
 *
 * Created: 2025-11-27 (QUICKFIX Enhancement)
 */

import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

// Pattern thresholds
const SIMILAR_ISSUE_THRESHOLD = 4; // 4+ similar issues = systemic
const RECENT_DAYS = 30; // Look back 30 days for patterns
const SIMILARITY_KEYWORDS_MIN = 2; // Minimum keyword matches for similarity

/**
 * Analyze quick-fix for recurring patterns
 * Returns recommendation to escalate if systemic issue detected
 *
 * @param {Object} issue - Quick-fix issue details
 * @returns {Promise<Object>} Pattern analysis results
 */
export async function analyzePatterns(issue) {
  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  const result = {
    isSystemic: false,
    similarIssuesCount: 0,
    similarIssues: [],
    patterns: [],
    rootCauseHypothesis: null,
    recommendation: 'proceed',
    escalationReason: null
  };

  try {
    console.log('\n🔍 Root Cause Analysis - Pattern Detection\n');

    const { title, description, consoleError, type } = issue;
    const combined = `${title || ''} ${description || ''} ${consoleError || ''}`.toLowerCase();

    // Extract keywords for pattern matching
    const keywords = extractKeywords(combined);
    console.log(`   Keywords extracted: ${keywords.slice(0, 5).join(', ')}${keywords.length > 5 ? '...' : ''}`);

    // Step 1: Search for similar quick-fixes in recent history
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - RECENT_DAYS);

    const { data: recentQuickFixes, error: qfError } = await supabase
      .from('quick_fixes')
      .select('id, title, description, actual_behavior, type, status, created_at')
      .gte('created_at', recentDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    if (qfError) {
      console.log(`   ⚠️  Could not query quick-fixes: ${qfError.message}`);
      return result;
    }

    // Find similar issues
    const similarIssues = [];
    for (const qf of recentQuickFixes || []) {
      const qfCombined = `${qf.title || ''} ${qf.description || ''} ${qf.actual_behavior || ''}`.toLowerCase();
      const matchCount = countKeywordMatches(keywords, qfCombined);

      if (matchCount >= SIMILARITY_KEYWORDS_MIN) {
        similarIssues.push({
          id: qf.id,
          title: qf.title,
          matchCount,
          status: qf.status,
          created_at: qf.created_at
        });
      }
    }

    result.similarIssuesCount = similarIssues.length;
    result.similarIssues = similarIssues.slice(0, 10); // Limit for display

    console.log(`   Similar issues found: ${similarIssues.length} (in last ${RECENT_DAYS} days)`);

    // Step 2: Detect systemic pattern
    if (similarIssues.length >= SIMILAR_ISSUE_THRESHOLD) {
      result.isSystemic = true;
      result.recommendation = 'escalate';
      result.escalationReason = `${similarIssues.length} similar issues found in the last ${RECENT_DAYS} days - this appears to be a systemic problem`;

      console.log('\n   ⚠️  SYSTEMIC PATTERN DETECTED');
      console.log(`   ${similarIssues.length} similar issues found - recommending escalation to full SD\n`);

      // List similar issues
      console.log('   Similar issues:');
      similarIssues.slice(0, 5).forEach((si, i) => {
        console.log(`      ${i + 1}. ${si.id}: ${si.title?.substring(0, 50)}...`);
      });
      if (similarIssues.length > 5) {
        console.log(`      ... and ${similarIssues.length - 5} more`);
      }
    }

    // Step 3: Analyze patterns
    const patterns = detectPatterns(similarIssues, keywords);
    result.patterns = patterns;

    if (patterns.length > 0) {
      console.log('\n   Detected patterns:');
      patterns.forEach((p, i) => {
        console.log(`      ${i + 1}. ${p.type}: ${p.description}`);
      });
    }

    // Step 4: Generate root cause hypothesis
    if (result.isSystemic) {
      result.rootCauseHypothesis = generateRootCauseHypothesis(patterns, keywords, type);

      if (result.rootCauseHypothesis) {
        console.log('\n   💡 Root Cause Hypothesis:');
        console.log(`      ${result.rootCauseHypothesis}`);
      }
    }

    // Step 5: Check error patterns in description
    const errorPattern = detectErrorPattern(consoleError || description || '');
    if (errorPattern) {
      result.patterns.push(errorPattern);
      console.log(`\n   Error pattern detected: ${errorPattern.type}`);
    }

    console.log(`\n   Recommendation: ${result.recommendation.toUpperCase()}\n`);

    return result;

  } catch (err) {
    console.log(`   ⚠️  RCA analysis error: ${err.message}`);
    result.error = err.message;
    return result;
  }
}

/**
 * Extract keywords from text for pattern matching
 */
function extractKeywords(text) {
  // Common words to exclude
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of',
    'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'between', 'under',
    'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
    'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some',
    'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
    'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while',
    'fix', 'bug', 'issue', 'error', 'problem', 'quick', 'this', 'that'
  ]);

  // Extract words, filter stop words, and get unique
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  // Count word frequency
  const wordCount = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });

  // Return top keywords by frequency
  return Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word);
}

/**
 * Count how many keywords match in target text
 */
function countKeywordMatches(keywords, targetText) {
  return keywords.filter(kw => targetText.includes(kw)).length;
}

/**
 * Detect patterns from similar issues
 */
function detectPatterns(similarIssues, keywords) {
  const patterns = [];

  // Pattern: Same component affected multiple times
  const componentKeywords = ['button', 'form', 'modal', 'table', 'input', 'navigation', 'header', 'footer', 'sidebar'];
  const affectedComponents = keywords.filter(kw => componentKeywords.includes(kw));
  if (affectedComponents.length > 0) {
    patterns.push({
      type: 'component_fragility',
      description: `Component "${affectedComponents[0]}" appears fragile - multiple related issues`,
      component: affectedComponents[0]
    });
  }

  // Pattern: Same error type recurring
  const errorKeywords = ['undefined', 'null', 'typeerror', 'referenceerror', 'syntaxerror'];
  const errorTypes = keywords.filter(kw => errorKeywords.includes(kw));
  if (errorTypes.length > 0) {
    patterns.push({
      type: 'error_type_recurring',
      description: `Error type "${errorTypes[0]}" keeps recurring - may indicate deeper issue`,
      errorType: errorTypes[0]
    });
  }

  // Pattern: Time-based clustering
  if (similarIssues.length >= 3) {
    const dates = similarIssues.map(si => new Date(si.created_at));
    const daySpan = (Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24);

    if (daySpan < 7 && similarIssues.length >= 3) {
      patterns.push({
        type: 'time_clustering',
        description: `${similarIssues.length} similar issues in ${Math.round(daySpan)} days - possible regression`,
        daySpan
      });
    }
  }

  return patterns;
}

/**
 * Detect common error patterns from error message
 */
function detectErrorPattern(errorText) {
  const errorPatterns = [
    { regex: /cannot read propert(y|ies) of (undefined|null)/i, type: 'null_access', description: 'Null/undefined property access - missing null checks' },
    { regex: /is not a function/i, type: 'type_mismatch', description: 'Type mismatch - function expected but not found' },
    { regex: /failed to fetch/i, type: 'network_error', description: 'Network/API error - connectivity or endpoint issue' },
    { regex: /maximum call stack/i, type: 'infinite_loop', description: 'Infinite recursion or loop detected' },
    { regex: /CORS/i, type: 'cors_error', description: 'CORS configuration issue' },
    { regex: /401|unauthorized/i, type: 'auth_error', description: 'Authentication error - session or token issue' },
    { regex: /404|not found/i, type: 'not_found', description: 'Resource not found - routing or data issue' },
    { regex: /timeout/i, type: 'timeout', description: 'Operation timeout - performance or blocking issue' }
  ];

  for (const pattern of errorPatterns) {
    if (pattern.regex.test(errorText)) {
      return {
        type: pattern.type,
        description: pattern.description,
        matched: true
      };
    }
  }

  return null;
}

/**
 * Generate root cause hypothesis based on patterns
 */
function generateRootCauseHypothesis(patterns, keywords, issueType) {
  const hypotheses = [];

  // Based on detected patterns
  for (const pattern of patterns) {
    switch (pattern.type) {
      case 'component_fragility':
        hypotheses.push(`The ${pattern.component} component may need architectural review - consider refactoring`);
        break;
      case 'error_type_recurring':
        hypotheses.push(`Recurring ${pattern.errorType} errors suggest missing validation or type safety`);
        break;
      case 'time_clustering':
        hypotheses.push('Recent clustering of issues suggests a recent change introduced regression');
        break;
      case 'null_access':
        hypotheses.push('Multiple null access errors indicate missing defensive programming patterns');
        break;
    }
  }

  // Based on keywords
  if (keywords.includes('state') || keywords.includes('redux') || keywords.includes('context')) {
    hypotheses.push('State management may need review - consider state architecture audit');
  }

  if (keywords.includes('async') || keywords.includes('promise') || keywords.includes('await')) {
    hypotheses.push('Async handling patterns may need standardization');
  }

  return hypotheses.length > 0 ? hypotheses[0] : null;
}

/**
 * Create retrospective entry for recurring pattern
 * Links quick-fix patterns to learning system
 *
 * @param {string} qfId - Quick-fix ID
 * @param {Object} patternAnalysis - Pattern analysis results
 * @returns {Promise<Object>} Retrospective creation result
 */
export async function createPatternRetrospective(qfId, patternAnalysis) {
  if (!patternAnalysis.isSystemic) {
    return { created: false, reason: 'Not a systemic issue' };
  }

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

  try {
    const { data, error } = await supabase
      .from('retrospectives')
      .insert({
        title: `Recurring Quick-Fix Pattern: ${patternAnalysis.patterns[0]?.type || 'Unknown'}`,
        trigger_type: 'quickfix_pattern',
        trigger_source: qfId,
        status: 'draft',
        lessons_learned: JSON.stringify([
          {
            lesson: patternAnalysis.rootCauseHypothesis || 'Pattern detected across multiple quick-fixes',
            impact: 'high',
            action: 'Consider creating Strategic Directive to address root cause'
          }
        ]),
        quality_score: 0, // To be filled by retro process
        metadata: {
          similar_issues_count: patternAnalysis.similarIssuesCount,
          patterns: patternAnalysis.patterns,
          similar_issues: patternAnalysis.similarIssues.map(si => si.id)
        }
      })
      .select()
      .single();

    if (error) {
      console.log(`   ⚠️  Could not create pattern retrospective: ${error.message}`);
      return { created: false, error: error.message };
    }

    console.log(`   ✅ Pattern retrospective created: ${data.id}`);
    return { created: true, retrospectiveId: data.id };

  } catch (err) {
    return { created: false, error: err.message };
  }
}
