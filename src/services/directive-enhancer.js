/**
 * Strategic Directive Enhancement Service
 *
 * Automatically enhances directive submissions with:
 * - Intent extraction (≤80 words)
 * - 5 decision-shaping questions
 * - Lightweight codebase alignment scan
 * - Database-ready SD preparation
 *
 * Runs silently in the background after chairman submits feedback.
 */

// SOVEREIGN PIPE v3.7.0: Removed execSync - using CodebaseSearchService
import path from 'path';
import { getCodebaseSearchService } from './CodebaseSearchService.js';

export class DirectiveEnhancer {
  constructor(openai, dbLoader) {
    this.openai = openai;
    this.dbLoader = dbLoader;
  }

  /**
   * Main enhancement workflow
   * @param {Object} submission - The submission object with chairman_input
   * @returns {Object} Enhanced directive data
   */
  async enhance(submission) {
    console.log('🚀 [ENHANCER] Starting automated SD enhancement...');
    const chairmanInput = submission.chairman_input || submission.feedback || '';

    if (!chairmanInput || !this.openai) {
      console.log('⚠️  [ENHANCER] No input or OpenAI not available, skipping enhancement');
      return null;
    }

    try {
      // 1. Extract Intent (≤80 words, locked scope)
      console.log('📝 [ENHANCER] Step 1: Extracting intent (≤80 words)...');
      const intent = await this.extractIntent(chairmanInput);

      // 2. Generate 5 Decision-Shaping Questions
      console.log('❓ [ENHANCER] Step 2: Generating decision-shaping questions...');
      const questions = await this.generateDecisionQuestions(intent, chairmanInput);

      // 3. Answer Decision Questions & Create Comprehensive Description
      console.log('💬 [ENHANCER] Step 3: Answering questions and creating comprehensive description...');
      const comprehensiveDescription = await this.createComprehensiveDescription(
        intent,
        questions,
        chairmanInput
      );

      // 4. Lightweight Codebase Alignment Scan
      console.log('🔍 [ENHANCER] Step 4: Scanning codebase for relevant components...');
      const codebaseFindings = await this.scanCodebase(intent);

      // 5. Prepare Database-Ready SD Structure
      console.log('📦 [ENHANCER] Step 5: Preparing enhanced SD structure...');
      const enhancedSD = await this.prepareDatabaseReadySD(
        intent,
        questions,
        codebaseFindings,
        chairmanInput
      );

      console.log('✅ [ENHANCER] Enhancement complete!');
      return {
        intent,
        questions,
        comprehensiveDescription,
        codebaseFindings,
        enhancedSD,
        enhanced_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [ENHANCER] Enhancement failed:', error.message);
      return null;
    }
  }

  /**
   * Extract concise intent statement (≤80 words)
   */
  async extractIntent(chairmanInput) {
    const completion = await this.openai.chat.completions.create({
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

  /**
   * Generate 5 decision-shaping questions
   * Each question should materially change the directive's approach
   */
  async generateDecisionQuestions(intent, chairmanInput) {
    const completion = await this.openai.chat.completions.create({
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
    },
    {
      "question": "What are the acceptable latency thresholds?",
      "why": "Defines performance requirements and architecture needs.",
      "impact": "Real-time (<100ms) = complex; Near real-time (<1s) = moderate"
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
      console.log('🔍 [ENHANCER] OpenAI response for questions:', responseContent.substring(0, 200) + '...');
      const parsed = JSON.parse(responseContent);

      if (!parsed.questions || !Array.isArray(parsed.questions)) {
        console.warn('⚠️ [ENHANCER] Response missing questions array, structure:', Object.keys(parsed));
        return [];
      }

      console.log('✅ [ENHANCER] Parsed', parsed.questions.length, 'decision-shaping questions');
      return parsed.questions;
    } catch (error) {
      console.error('❌ [ENHANCER] Failed to parse questions:', error.message);
      return [];
    }
  }

  /**
   * Create comprehensive description by answering the 5 decision questions
   * Combines concise intent with detailed Q&A for a 200-300 word overview
   */
  async createComprehensiveDescription(intent, questions, chairmanInput) {
    if (!questions || questions.length === 0) {
      console.warn('⚠️ [ENHANCER] No questions available, using intent only');
      return intent;
    }

    const completion = await this.openai.chat.completions.create({
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
- Paragraph 2-3: Answers to questions woven into narrative (architecture decisions, data considerations, integration points)
- Paragraph 4: Expected outcomes and success indicators

Keep it concise but comprehensive. Focus on decisions that materially change implementation approach.`
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

  /**
   * Lightweight codebase alignment scan
   * Find relevant components, services, schemas, routes
   *
   * SOVEREIGN PIPE v3.7.0: Uses CodebaseSearchService instead of execSync
   */
  async scanCodebase(intent) {
    const findings = {
      components: [],
      services: [],
      routes: [],
      schemas: [],
      recommendations: []
    };

    try {
      // Extract key terms from intent for searching
      const keywords = this.extractKeywords(intent);
      console.log('🔍 [ENHANCER] Searching for:', keywords.join(', '));

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
                recommendation: this.analyzeFileRecommendation(result.path)
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
      this.addPatternRecommendations(intent, findings);

    } catch (error) {
      console.error('⚠️ [ENHANCER] Codebase scan error:', error.message);
    }

    return findings;
  }

  /**
   * Extract keywords from intent for codebase search
   */
  extractKeywords(intent) {
    // Simple keyword extraction - remove common words
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
  analyzeFileRecommendation(filepath) {
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
  addPatternRecommendations(intent, findings) {
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

  /**
   * Prepare database-ready Strategic Directive
   */
  async prepareDatabaseReadySD(intent, questions, codebaseFindings, chairmanInput) {
    const completion = await this.openai.chat.completions.create({
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
}
