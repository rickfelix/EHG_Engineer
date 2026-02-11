/**
 * SD Type Classifier - AI-Powered Strategic Directive Classification
 *
 * Uses GPT 5.2 with JSON response mode to accurately classify SD types
 * based on semantic understanding of scope, title, and description.
 *
 * Key Features:
 * - JSON response mode for structured output
 * - Confidence scoring to trigger worst-case handoff requirements
 * - Reasoning explanation for transparency
 * - Fallback to keyword detection if API fails
 * - Intensity detection for refactoring SDs (delegated to IntensityDetector)
 *
 * @module sd-type-classifier
 * @version 1.2.0 - LEO v4.3.3 Refactoring Enhancement
 */

import { getLLMClient } from '../../lib/llm/client-factory.js';
import dotenv from 'dotenv';

// LEO v4.3.3: Import IntensityDetector for refactoring SDs
import { detectIntensityForSD } from './intensity-detector.js';

dotenv.config();

// Valid SD types (must match database CHECK constraint)
const VALID_SD_TYPES = [
  'feature',
  'implementation',  // Backend-only work for existing frontend
  'infrastructure',
  'database',
  'security',
  'documentation',
  'bugfix',
  'refactor',
  'performance',
  'orchestrator'  // Parent SDs with children - auto-set by trigger
];

// Handoff requirements by SD type (from database sd_type_validation_profiles)
const HANDOFF_REQUIREMENTS = {
  feature: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD'],
  implementation: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD'],  // Backend-only work
  infrastructure: ['LEAD-TO-PLAN', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD'],
  database: ['LEAD-TO-PLAN', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD'],
  documentation: ['LEAD-TO-PLAN', 'PLAN-TO-LEAD'],
  bugfix: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD'],
  refactor: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD'],
  security: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD'],
  performance: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD'],
  orchestrator: []  // Parent SDs - progress derived from child SD completion, no direct handoffs
};

// LEO v4.3.3: VALID_INTENSITY_LEVELS and INTENSITY_HINTS now imported from intensity-detector.js

// JSON schema for GPT 5.2 response
const EXPECTED_JSON_SCHEMA = `{
  "sd_type": "feature|implementation|infrastructure|database|security|documentation|bugfix|refactor|performance",
  "confidence": 0-100,
  "reasoning": "Brief explanation of why this type was chosen",
  "alternative_type": "second-best type or 'none'",
  "alternative_confidence": 0-100
}`;

export class SDTypeClassifier {
  constructor() {
    this.llmClient = null; // Initialized lazily via getLLMClient()
  }

  /**
   * Get LLM client from factory (lazy initialization)
   */
  async getLLMClient() {
    if (!this.llmClient) {
      try {
        this.llmClient = await getLLMClient({
          purpose: 'sd-type-classification',
          phase: 'LEAD'
        });
      } catch (_error) {
        console.warn('LLM client unavailable - AI classification will fall back to keyword detection');
        return null;
      }
    }
    return this.llmClient;
  }

  /**
   * Classify SD type using AI with JSON response mode
   *
   * @param {Object} sd - Strategic Directive object
   * @param {string} sd.title - SD title
   * @param {string} sd.scope - SD scope
   * @param {string} sd.description - SD description
   * @param {string} sd.sd_type - Currently declared sd_type
   * @returns {Promise<Object>} Classification result
   */
  async classify(sd) {
    // Get LLM client from factory
    const llmClient = await this.getLLMClient();

    // If LLM client not available, fall back to keyword detection
    if (!llmClient) {
      return this.keywordFallback(sd);
    }

    try {
      const result = await this.callOpenAI(sd, llmClient);
      return this.processResult(result, sd);
    } catch (error) {
      console.error('AI classification failed, falling back to keywords:', error.message);
      return this.keywordFallback(sd);
    }
  }

  /**
   * Call LLM with JSON response mode via factory
   */
  async callOpenAI(sd, llmClient) {
    const systemPrompt = `You are an expert at classifying Strategic Directives (SDs) in a software development lifecycle.

**SD Type Definitions:**

1. **feature** - Building NEW user-facing functionality including UI AND backend APIs that serve users
   - Key indicators: React components, UI/UX work, forms, buttons, dialogs, frontend code
   - ALSO: Product API endpoints that users/frontend consume (REST, GraphQL)
   - Example: "Build Stage 21-25 UI components for venture workflow"
   - Example: "Build content generation API with LLM integration"

2. **implementation** - Building backend services/APIs for an EXISTING frontend (backend-only work)
   - Key indicators: API endpoints, service layer, adapters, integrations where UI already exists
   - Distinction from feature: Frontend/UI is ALREADY COMPLETE, this SD adds backend only
   - Example: "Implement Content Forge API endpoints (frontend already built)"
   - Example: "Add LLM adapter to support existing AI features"

3. **infrastructure** - Building CI/CD pipelines, tooling, scripts, automation, developer workflows
   - Key indicators: GitHub Actions, deployment scripts, build tools, monitoring, DevOps
   - NOT product APIs - those are feature or implementation
   - Example: "Set up automated deployment pipeline with staging environment"
   - Example: "Build LEO Protocol validation scripts"

4. **database** - Schema design, migrations, tables, indexes, RLS policies, stored procedures
   - Key indicators: CREATE TABLE, ALTER TABLE, migrations, Supabase, PostgreSQL
   - Example: "Add venture_artifacts table with epistemic tracking columns"

5. **security** - Authentication, authorization, RLS policies, vulnerability fixes, secrets management
   - Key indicators: Auth flows, JWT, session management, RBAC, OWASP compliance
   - Example: "Implement row-level security for multi-tenant data isolation"

6. **documentation** - README files, guides, API docs, tutorials, comments
   - Key indicators: Markdown files, JSDoc, documentation updates, onboarding guides
   - Example: "Create developer onboarding guide for LEO Protocol"

7. **bugfix** - Fixing broken functionality, errors, crashes, regressions
   - Key indicators: "fix", "broken", "error", "crash", existing functionality not working
   - Example: "Fix authentication token refresh failing on session timeout"

8. **refactor** - Restructuring code without changing functionality, tech debt reduction
   - Key indicators: "refactor", "cleanup", "restructure", "extract", no new features
   - Example: "Extract authentication logic into reusable service module"

9. **performance** - Optimization, speed improvements, caching, bundle size reduction
   - Key indicators: "optimize", "performance", "cache", "latency", "bundle size"
   - Example: "Implement query caching to reduce API latency by 50%"

**Critical Rules:**
1. Focus on what the SD BUILDS, not what it REFERENCES
2. If frontend UI already exists and SD builds backend only → **implementation**
3. If building both frontend AND backend → **feature**
4. If building internal tooling/scripts (not product APIs) → **infrastructure**

Examples:
- "Build a deployment dashboard UI" = **feature** (building UI)
- "Build deployment pipeline scripts" = **infrastructure** (building CI/CD)
- "Implement API endpoints for existing Content Forge UI" = **implementation** (backend for existing frontend)
- "Build Content Forge feature end-to-end" = **feature** (full stack)

Return ONLY valid JSON in this exact format:
${EXPECTED_JSON_SCHEMA}

NO additional text, explanations, or markdown - ONLY the JSON object.`;

    const userPrompt = `Classify this Strategic Directive:

**Title:** ${sd.title || 'N/A'}

**Scope:** ${sd.scope || 'N/A'}

**Description:** ${sd.description || 'N/A'}

**Currently declared as:** ${sd.sd_type || 'not set'}

Analyze the SD carefully and classify it based on what is actually being BUILT or CHANGED.`;

    const response = await llmClient.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 500,
      temperature: 0,  // Issue 6 fix: Deterministic output for classification
      seed: 42         // Issue 6 fix: Reproducible results with fixed seed
    });

    // Parse JSON response
    const content = response.choices[0].message.content;
    try {
      const result = JSON.parse(content);

      // Validate required fields
      if (!result.sd_type || typeof result.confidence !== 'number') {
        throw new Error('Missing required fields in response');
      }

      // Ensure sd_type is valid
      if (!VALID_SD_TYPES.includes(result.sd_type)) {
        throw new Error(`Invalid sd_type: ${result.sd_type}`);
      }

      return result;
    } catch (parseError) {
      console.error('Failed to parse GPT 5.2 response:', content.substring(0, 200));
      throw new Error(`JSON parse failed: ${parseError.message}`);
    }
  }

  /**
   * Process AI result and determine effective handoff requirements
   */
  processResult(aiResult, sd) {
    const declaredType = sd.sd_type || 'feature';
    const detectedType = aiResult.sd_type;
    const confidence = aiResult.confidence;

    // Determine if there's a mismatch
    const mismatch = declaredType !== detectedType;

    // Calculate effective handoff requirements
    // If confidence < 80%, use worst-case (most restrictive) requirements
    let effectiveType = detectedType;
    let effectiveHandoffs = HANDOFF_REQUIREMENTS[detectedType];
    let usedWorstCase = false;

    if (confidence < 80 && aiResult.alternative_type !== 'none') {
      // Low confidence - use worst case between detected and alternative
      const altHandoffs = HANDOFF_REQUIREMENTS[aiResult.alternative_type] || [];

      if (altHandoffs.length > effectiveHandoffs.length) {
        effectiveHandoffs = altHandoffs;
        effectiveType = aiResult.alternative_type;
        usedWorstCase = true;
      }
    }

    // Also compare against declared type if different
    if (mismatch && confidence < 80) {
      const declaredHandoffs = HANDOFF_REQUIREMENTS[declaredType] || [];
      if (declaredHandoffs.length > effectiveHandoffs.length) {
        effectiveHandoffs = declaredHandoffs;
        effectiveType = declaredType;
        usedWorstCase = true;
      }
    }

    return {
      declaredType,
      detectedType,
      confidence,
      reasoning: aiResult.reasoning,
      alternativeType: aiResult.alternative_type,
      alternativeConfidence: aiResult.alternative_confidence,
      mismatch,
      effectiveType,
      effectiveHandoffs,
      usedWorstCase,
      recommendation: this.generateRecommendation(declaredType, detectedType, confidence, usedWorstCase)
    };
  }

  /**
   * Generate human-readable recommendation
   */
  generateRecommendation(declaredType, detectedType, confidence, usedWorstCase) {
    if (declaredType === detectedType && confidence >= 80) {
      return `✅ Classification confirmed: '${declaredType}' matches detected type with ${confidence}% confidence.`;
    }

    if (declaredType !== detectedType && confidence >= 80) {
      return `⚠️ MISMATCH: SD is declared as '${declaredType}' but AI detected '${detectedType}' with ${confidence}% confidence. Consider updating sd_type.`;
    }

    if (usedWorstCase) {
      return `⚠️ LOW CONFIDENCE (${confidence}%): Using worst-case handoff requirements to be safe. Detected '${detectedType}' but classification is uncertain.`;
    }

    return `ℹ️ Moderate confidence (${confidence}%): Detected '${detectedType}'. Review classification if unexpected.`;
  }

  /**
   * Keyword-based fallback when AI is unavailable
   */
  keywordFallback(sd) {
    const text = `${sd.title || ''} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

    const typePatterns = {
      security: {
        keywords: ['auth', 'authentication', 'authorization', 'rls', 'permission', 'role', 'vulnerability', 'jwt', 'session'],
        weight: 1.2
      },
      database: {
        keywords: ['schema', 'migration', 'table', 'column', 'index', 'postgres', 'sql', 'trigger'],
        weight: 1.1
      },
      infrastructure: {
        keywords: ['ci/cd', 'pipeline', 'github action', 'workflow', 'deploy', 'docker', 'script', 'tooling', 'automation'],
        weight: 1.0
      },
      documentation: {
        // Enhanced keywords to catch research/evaluation SDs (LEO v4.3.3 improvement)
        keywords: ['documentation', 'docs', 'readme', 'guide', 'tutorial',
                   'research', 'evaluation', 'analysis', 'triangulation',
                   'assessment', 'audit', 'verdict', 'go/no-go', 'investigation'],
        weight: 0.9
      },
      bugfix: {
        keywords: ['bug', 'fix', 'error', 'broken', 'crash', 'regression'],
        weight: 1.0
      },
      refactor: {
        keywords: ['refactor', 'restructure', 'cleanup', 'technical debt'],
        weight: 1.0
      },
      performance: {
        keywords: ['performance', 'optimize', 'cache', 'latency', 'bundle size'],
        weight: 1.0
      },
      implementation: {
        keywords: ['api endpoint', 'backend', 'service layer', 'adapter', 'implement api', 'rest api', 'graphql', 'existing frontend', 'frontend already'],
        weight: 1.0
      },
      feature: {
        keywords: ['ui', 'component', 'page', 'form', 'dialog', 'dashboard', 'frontend', 'react', 'stage'],
        weight: 0.8
      }
    };

    let bestMatch = { type: 'feature', confidence: 30, keywords: [] };

    for (const [type, config] of Object.entries(typePatterns)) {
      const matchedKeywords = config.keywords.filter(kw => text.includes(kw));
      if (matchedKeywords.length > 0) {
        const baseConfidence = Math.min(matchedKeywords.length / 3, 1) * 100;
        const weightedConfidence = Math.min(baseConfidence * config.weight, 100);

        if (weightedConfidence > bestMatch.confidence) {
          bestMatch = {
            type,
            confidence: Math.round(weightedConfidence),
            keywords: matchedKeywords
          };
        }
      }
    }

    const declaredType = sd.sd_type || 'feature';
    const mismatch = declaredType !== bestMatch.type;

    // For keyword fallback, always use worst-case if confidence < 80%
    let effectiveHandoffs = HANDOFF_REQUIREMENTS[bestMatch.type];
    let usedWorstCase = false;

    if (bestMatch.confidence < 80 && mismatch) {
      const declaredHandoffs = HANDOFF_REQUIREMENTS[declaredType] || [];
      if (declaredHandoffs.length > effectiveHandoffs.length) {
        effectiveHandoffs = declaredHandoffs;
        usedWorstCase = true;
      }
    }

    return {
      declaredType,
      detectedType: bestMatch.type,
      confidence: bestMatch.confidence,
      reasoning: `Keyword detection matched: ${bestMatch.keywords.join(', ')}`,
      alternativeType: 'none',
      alternativeConfidence: 0,
      mismatch,
      effectiveType: usedWorstCase ? declaredType : bestMatch.type,
      effectiveHandoffs,
      usedWorstCase,
      recommendation: this.generateRecommendation(declaredType, bestMatch.type, bestMatch.confidence, usedWorstCase),
      fallbackMode: true
    };
  }

  /**
   * LEO v4.3.3: Detect intensity level for refactoring SDs
   * Delegates to IntensityDetector module (extracted for Single Responsibility)
   * @param {Object} sd - Strategic directive
   * @returns {Object} Intensity detection result
   */
  detectIntensity(sd) {
    // Delegate to extracted IntensityDetector module
    return detectIntensityForSD(sd);
  }
}

/**
 * CLI interface for testing
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node sd-type-classifier.js <SD-ID>');
    console.log('       node sd-type-classifier.js --test');
    process.exit(1);
  }

  if (args[0] === '--test') {
    // Test with SD-VISION-TRANSITION-001D6
    const testSd = {
      title: 'Phase 6 Stages: LAUNCH & LEARN (Stages 21-25)',
      scope: `DELIVERABLE: Complete working UI/UX, forms, APIs, and AI agents for Stages 21-25 (LAUNCH & LEARN phase).
BUILD REQUIREMENTS:
1. UI/Forms: QA test runner, deployment dashboard, launch checklist, analytics viewer
2. Stage Components: Stage21QA, Stage22Deployment, Stage23Launch, Stage24Analytics, Stage25Optimization`,
      description: 'Implement the final phase of the venture lifecycle with React components for QA, deployment, launch, analytics, and optimization stages.',
      sd_type: 'infrastructure'
    };

    const classifier = new SDTypeClassifier();
    const result = await classifier.classify(testSd);

    console.log('\n' + '='.repeat(60));
    console.log('SD TYPE CLASSIFICATION RESULT');
    console.log('='.repeat(60));
    console.log('\nDeclared Type:', result.declaredType);
    console.log('Detected Type:', result.detectedType);
    console.log('Confidence:', result.confidence + '%');
    console.log('Reasoning:', result.reasoning);
    console.log('\nAlternative Type:', result.alternativeType);
    console.log('Alternative Confidence:', result.alternativeConfidence + '%');
    console.log('\nMismatch:', result.mismatch ? 'YES' : 'NO');
    console.log('Used Worst Case:', result.usedWorstCase ? 'YES' : 'NO');
    console.log('Effective Handoffs:', result.effectiveHandoffs.join(' → '));
    console.log('\nRecommendation:', result.recommendation);

    if (result.fallbackMode) {
      console.log('\n⚠️ Running in FALLBACK MODE (keyword detection)');
    }

    process.exit(0);
  }

  // Load SD from database
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const sdId = args[0];
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, scope, description, sd_type')
    .eq('id', sdId)
    .single();

  if (error || !sd) {
    console.error('SD not found:', sdId);
    process.exit(1);
  }

  const classifier = new SDTypeClassifier();
  const result = await classifier.classify(sd);

  console.log('\n' + '='.repeat(60));
  console.log(`SD TYPE CLASSIFICATION: ${sdId}`);
  console.log('='.repeat(60));
  console.log(JSON.stringify(result, null, 2));
}

// Execute if run directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default SDTypeClassifier;
