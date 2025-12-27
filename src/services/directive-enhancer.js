/**
 * Strategic Directive Enhancement Service
 *
 * Automatically enhances directive submissions with:
 * - Intent extraction (<=80 words)
 * - 5 decision-shaping questions
 * - Lightweight codebase alignment scan
 * - Database-ready SD preparation
 *
 * Refactored as part of SD-REFACTOR-2025-001-P1-004
 * Pipeline stages extracted to enhancement-pipeline-stages.js
 *
 * @module DirectiveEnhancer
 * @version 2.0.0
 */

import {
  extractIntent,
  generateDecisionQuestions,
  createComprehensiveDescription,
  scanCodebase,
  prepareDatabaseReadySD,
  extractKeywords,
  analyzeFileRecommendation,
  addPatternRecommendations
} from './enhancement-pipeline-stages.js';

// Re-export helpers for backward compatibility
export { extractKeywords, analyzeFileRecommendation, addPatternRecommendations };

export class DirectiveEnhancer {
  constructor(openai, dbLoader) {
    this.openai = openai;
    this.dbLoader = dbLoader;
  }

  /**
   * Main enhancement workflow - orchestrates pipeline stages
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
      // Stage 1: Extract Intent (<=80 words, locked scope)
      console.log('📝 [ENHANCER] Step 1: Extracting intent (<=80 words)...');
      const intent = await extractIntent(this.openai, chairmanInput);

      // Stage 2: Generate 5 Decision-Shaping Questions
      console.log('❓ [ENHANCER] Step 2: Generating decision-shaping questions...');
      const questions = await generateDecisionQuestions(this.openai, intent, chairmanInput);

      // Stage 3: Answer Decision Questions & Create Comprehensive Description
      console.log('💬 [ENHANCER] Step 3: Answering questions and creating comprehensive description...');
      const comprehensiveDescription = await createComprehensiveDescription(
        this.openai,
        intent,
        questions,
        chairmanInput
      );

      // Stage 4: Lightweight Codebase Alignment Scan
      console.log('🔍 [ENHANCER] Step 4: Scanning codebase for relevant components...');
      const codebaseFindings = await scanCodebase(intent);

      // Stage 5: Prepare Database-Ready SD Structure
      console.log('📦 [ENHANCER] Step 5: Preparing enhanced SD structure...');
      const enhancedSD = await prepareDatabaseReadySD(
        this.openai,
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

  // ===========================================================================
  // DELEGATED METHODS: For backward compatibility
  // ===========================================================================

  async extractIntent(chairmanInput) {
    return extractIntent(this.openai, chairmanInput);
  }

  async generateDecisionQuestions(intent, chairmanInput) {
    return generateDecisionQuestions(this.openai, intent, chairmanInput);
  }

  async createComprehensiveDescription(intent, questions, chairmanInput) {
    return createComprehensiveDescription(this.openai, intent, questions, chairmanInput);
  }

  async scanCodebase(intent) {
    return scanCodebase(intent);
  }

  async prepareDatabaseReadySD(intent, questions, codebaseFindings, chairmanInput) {
    return prepareDatabaseReadySD(this.openai, intent, questions, codebaseFindings, chairmanInput);
  }

  extractKeywords(intent) {
    return extractKeywords(intent);
  }

  analyzeFileRecommendation(filepath) {
    return analyzeFileRecommendation(filepath);
  }

  addPatternRecommendations(intent, findings) {
    return addPatternRecommendations(intent, findings);
  }
}

export default DirectiveEnhancer;

// Also export pipeline stages for direct access
export * from './enhancement-pipeline-stages.js';
