/**
 * Enhancement Pipeline Stages
 * Extracted from directive-enhancer.js for modularity
 *
 * Part of SD-REFACTOR-2025-001-P1-004: DirectiveEnhancer Refactoring
 *
 * Each stage is a pure function that receives context and returns processed data.
 * Stages: extractIntent, generateDecisionQuestions, createComprehensiveDescription,
 *         scanCodebase, prepareDatabaseReadySD
 *
 * @module EnhancementPipelineStages
 * @version 1.0.0
 */

import path from 'path';
import { getCodebaseSearchService } from './CodebaseSearchService.js';

// =============================================================================
// STAGE 1: Extract Intent (<=80 words)
// =============================================================================

/**
 * Extract concise intent statement from chairman input
 * @param {object} openai - OpenAI client
 * @param {string} chairmanInput - Chairman's feedback
 * @returns {Promise<string>} Extracted intent
 */
export async function extractIntent(openai, chairmanInput) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: `Extract a focused intent statement from the chairman's feedback. Requirements:
- Maximum 80 words
- Intent-first: focus on WHAT and WHY, not HOW
- Outcome-focused: what result do we want?
- Narrow ambiguity: be specific, avoid scope creep
- No implementation details
Example good intent: "Enable users to export analytics reports as PDF/Excel to share insights with stakeholders, reducing manual data compilation from 2 hours to 5 minutes."
Example bad intent: "Build a comprehensive reporting system with dashboards, filters, charts, and multiple export formats..."`
      },
      {
        role: 'user',
        content: chairmanInput
      }
    ],
    temperature: 0.3,
    max_tokens: 120
  });

  return completion.choices[0].message.content.trim();
}

// =============================================================================
// STAGE 2: Generate Decision Questions
// =============================================================================

/**
 * Generate 5 decision-shaping questions that materially change the directive's approach
 * @param {object} openai - OpenAI client
 * @param {string} intent - Extracted intent
 * @param {string} chairmanInput - Original chairman input
 * @returns {Promise<Array>} Array of question objects
 */
export async function generateDecisionQuestions(openai, intent, chairmanInput) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: `Generate exactly 5 decision-shaping questions for this intent. Each question must:
1. Be specific to THIS intent (not generic)
2. Have answers that would materially change the implementation approach
3. Focus on critical decisions (data source, integration boundary, acceptance thresholds)
4. Include why the answer matters (1-2 sentences)

Format as JSON object with a "questions" array:
{
  "questions": [
    {
      "question": "What data sources will feed this feature?",
      "why": "Determines integration complexity and data transformation needs.",
      "impact": "External API = more complex; internal DB = simpler but limited data"
    }
  ]
}

Focus on: architecture choices, data decisions, integration boundaries, acceptance criteria, performance thresholds.`
      },
      {
        role: 'user',
        content: `Intent: ${intent}\n\nOriginal feedback: ${chairmanInput.substring(0, 500)}`
      }
    ],
    temperature: 0.4,
    max_tokens: 600,
    response_format: { type: 'json_object' }
  });

  try {
    const responseContent = completion.choices[0].message.content;
    console.log('🔍 [PIPELINE] OpenAI response for questions:', responseContent.substring(0, 200) + '...');
    const parsed = JSON.parse(responseContent);

    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      console.warn('⚠️ [PIPELINE] Response missing questions array, structure:', Object.keys(parsed));
      return [];
    }

    console.log('✅ [PIPELINE] Parsed', parsed.questions.length, 'decision-shaping questions');
    return parsed.questions;
  } catch (error) {
    console.error('❌ [PIPELINE] Failed to parse questions:', error.message);
    return [];
  }
}

// =============================================================================
// STAGE 3: Create Comprehensive Description
// =============================================================================

/**
 * Create comprehensive description by answering the 5 decision questions
 * @param {object} openai - OpenAI client
 * @param {string} intent - Extracted intent
 * @param {Array} questions - Decision-shaping questions
 * @param {string} chairmanInput - Original chairman input
 * @returns {Promise<string>} Comprehensive description (200-300 words)
 */
export async function createComprehensiveDescription(openai, intent, questions, chairmanInput) {
  if (!questions || questions.length === 0) {
    console.warn('⚠️ [PIPELINE] No questions available, using intent only');
    return intent;
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: `Create a comprehensive Strategic Directive description (200-300 words) that:

1. Starts with the concise intent statement (provided below)
2. Answers each of the 5 decision-shaping questions based on the original chairman feedback
3. Integrates answers naturally into flowing paragraphs (not Q&A format)
4. Maintains outcome-focused language (WHAT and WHY, not HOW)
5. Provides enough detail for implementation teams to understand scope and approach

Structure:
- Paragraph 1: Intent statement + high-level context
- Paragraph 2-3: Answers to questions woven into narrative
- Paragraph 4: Expected outcomes and success indicators

Keep it concise but comprehensive.`
      },
      {
        role: 'user',
        content: `Intent (80 words): ${intent}

Decision Questions to Answer:
${questions.map((q, i) => `${i + 1}. ${q.question}\n   Why it matters: ${q.why}\n   Impact: ${q.impact}`).join('\n\n')}

Original Chairman Feedback (for context):
${chairmanInput}

Generate comprehensive description (200-300 words, flowing paragraphs, NO Q&A format):`
      }
    ],
    temperature: 0.4,
    max_tokens: 500
  });

  return completion.choices[0].message.content.trim();
}

// =============================================================================
// STAGE 4: Scan Codebase
// =============================================================================

/**
 * Lightweight codebase alignment scan
 * @param {string} intent - Extracted intent
 * @returns {Promise<object>} Codebase findings
 */
export async function scanCodebase(intent) {
  const findings = {
    components: [],
    services: [],
    routes: [],
    schemas: [],
    recommendations: []
  };

  try {
    // Extract key terms from intent for searching
    const keywords = extractKeywords(intent);
    console.log('🔍 [PIPELINE] Searching for:', keywords.join(', '));

    // Get CodebaseSearchService (no shell spawning)
    const searchService = getCodebaseSearchService();

    for (const keyword of keywords.slice(0, 3)) { // Limit to top 3 keywords
      // Search components using native file search
      try {
        const componentResults = await searchService.searchComponents(
          keyword,
          ['.tsx', '.jsx'],
          ['/mnt/c/_EHG/EHG/src', '/mnt/c/_EHG/EHG_Engineer/src']
        );

        componentResults.forEach(result => {
          if (result.path && !findings.components.some(c => c.path === result.relativePath)) {
            findings.components.push({
              path: result.relativePath,
              relevance: `Contains "${keyword}"`,
              recommendation: analyzeFileRecommendation(result.path)
            });
          }
        });
      } catch {
        // No results, continue
      }

      // Search for existing routes using native pattern search
      try {
        const routeResults = await searchService.searchRoutes(keyword);

        if (routeResults.length > 0) {
          findings.routes.push({
            keyword,
            found: 'Existing routes match this keyword',
            recommendation: 'Review existing routes before creating new ones'
          });
        }
      } catch {
        // No routes found
      }
    }

    // Check for common patterns
    addPatternRecommendations(intent, findings);

  } catch (error) {
    console.error('⚠️ [PIPELINE] Codebase scan error:', error.message);
  }

  return findings;
}

// =============================================================================
// STAGE 5: Prepare Database-Ready SD
// =============================================================================

/**
 * Prepare database-ready Strategic Directive structure
 * @param {object} openai - OpenAI client
 * @param {string} intent - Extracted intent
 * @param {Array} questions - Decision-shaping questions
 * @param {object} codebaseFindings - Codebase scan results
 * @param {string} chairmanInput - Original chairman input
 * @returns {Promise<object>} Database-ready SD structure
 */
export async function prepareDatabaseReadySD(openai, intent, questions, codebaseFindings, chairmanInput) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: `Create a concise, database-ready Strategic Directive structure. Keep it LEAN - only include elements that directly support the intent. Format as JSON:
{
  "title": "Clear, outcome-focused title (≤60 chars)",
  "rationale": "Why this matters (2-3 sentences)",
  "success_criteria": ["Measurable outcome 1", "Measurable outcome 2"],
  "key_constraints": ["Technical constraint 1", "Business constraint 2"],
  "risks": [
    {"risk": "Description", "mitigation": "How to address", "severity": "high|medium|low"}
  ],
  "dependencies": ["Dependency 1", "Dependency 2"],
  "acceptance_signals": ["Signal that work is done 1", "Signal 2"],
  "target_application": "EHG or EHG_Engineer",
  "estimated_complexity": "low|medium|high"
}

Focus on: measurable outcomes, real constraints, actual risks. Skip security/performance/accessibility unless REQUIRED by the intent.`
      },
      {
        role: 'user',
        content: `Intent: ${intent}

Codebase findings: ${JSON.stringify(codebaseFindings, null, 2)}

Decision questions: ${JSON.stringify(questions, null, 2)}

Generate database-ready SD structure (JSON only, no markdown).`
      }
    ],
    temperature: 0.3,
    max_tokens: 800,
    response_format: { type: 'json_object' }
  });

  try {
    return JSON.parse(completion.choices[0].message.content);
  } catch {
    return {
      title: intent.substring(0, 60),
      rationale: chairmanInput.substring(0, 200),
      success_criteria: [],
      key_constraints: [],
      risks: [],
      dependencies: [],
      acceptance_signals: [],
      target_application: 'EHG',
      estimated_complexity: 'medium'
    };
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extract keywords from intent for codebase search
 */
export function extractKeywords(intent) {
  const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can']);

  const words = intent.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !commonWords.has(w));

  // Return unique words, sorted by frequency
  const frequency = {};
  words.forEach(w => frequency[w] = (frequency[w] || 0) + 1);

  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 5);
}

/**
 * Analyze file and recommend action (reuse, refactor, deprecate)
 */
export function analyzeFileRecommendation(filepath) {
  const filename = path.basename(filepath).toLowerCase();

  if (filename.includes('test') || filename.includes('spec')) {
    return 'REVIEW: Test file - check if existing tests cover new requirements';
  }

  if (filename.includes('legacy') || filename.includes('old')) {
    return 'DEPRECATE: Consider replacing legacy implementation';
  }

  return 'REUSE: Leverage existing component, extend if needed';
}

/**
 * Add pattern-based recommendations
 */
export function addPatternRecommendations(intent, findings) {
  const intentLower = intent.toLowerCase();

  // Auth patterns
  if (intentLower.includes('auth') || intentLower.includes('login') || intentLower.includes('permission')) {
    findings.recommendations.push({
      pattern: 'Authentication',
      recommendation: 'Use existing Supabase Auth - check /src/lib/supabase.js',
      rationale: 'Reusing saves 8-10 hours vs custom implementation'
    });
  }

  // Database patterns
  if (intentLower.includes('database') || intentLower.includes('table') || intentLower.includes('data')) {
    findings.recommendations.push({
      pattern: 'Database',
      recommendation: 'Use database agent for schema validation before implementation',
      rationale: 'Prevents 2-3 hours of migration debugging'
    });
  }

  // UI patterns
  if (intentLower.includes('ui') || intentLower.includes('component') || intentLower.includes('interface')) {
    findings.recommendations.push({
      pattern: 'UI Components',
      recommendation: 'Check shadcn/ui components before building custom - /src/components/ui/',
      rationale: 'Consistent design system, accessibility built-in'
    });
  }

  // Export/Report patterns
  if (intentLower.includes('export') || intentLower.includes('pdf') || intentLower.includes('excel')) {
    findings.recommendations.push({
      pattern: 'Export Functionality',
      recommendation: 'Consider libraries: jsPDF (PDF), xlsx (Excel)',
      rationale: 'Battle-tested solutions, saves implementation time'
    });
  }
}
