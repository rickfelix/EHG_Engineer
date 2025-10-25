#!/usr/bin/env node

/**
 * PRD Auto-Enrichment Pipeline
 * SD-KNOWLEDGE-001: US-003 PRD Auto-Enrichment
 * Enhanced: SD-LEO-LEARN-001 (Issue Pattern Integration)
 *
 * Automatically enriches user stories with implementation context from:
 * - Local retrospectives (past implementations)
 * - Issue patterns (known problems & proven solutions)
 * - Context7 MCP (live library documentation)
 *
 * Confidence-Based Gating:
 * - >0.85: Auto-applied to user_stories.implementation_context
 * - 0.7-0.85: Flagged for human review
 * - <0.7: Rejected, not applied
 *
 * Updates:
 * - user_stories.implementation_context (JSONB)
 * - product_requirements_v2.research_confidence_score (DECIMAL)
 * - Logs all operations to prd_research_audit_log
 */

import { createClient } from '@supabase/supabase-js';
import KnowledgeRetrieval from './automated-knowledge-retrieval.js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const CONFIDENCE_AUTO_APPLY = 0.85;
const CONFIDENCE_REVIEW = 0.70;

class PRDEnrichment {
  constructor(prdId) {
    this.prdId = prdId;
    this.sdId = null;
    this.enrichmentResults = {
      userStoriesEnriched: 0,
      userStoriesFlagged: 0,
      userStoriesRejected: 0,
      overallConfidence: 0,
      techStacksResearched: []
    };
  }

  /**
   * Main enrichment workflow
   */
  async enrich() {
    console.log('\n🚀 PRD Auto-Enrichment Pipeline');
    console.log('================================================================');
    console.log(`PRD: ${this.prdId}\n`);

    try {
      // Step 1: Load PRD
      const prd = await this.loadPRD();
      this.sdId = prd.sd_id;

      // Step 2: Extract tech stacks from requirements
      const techStacks = this.extractTechStacks(prd);
      console.log(`📊 Identified ${techStacks.length} tech stacks to research\n`);

      // Step 3: Research each tech stack
      const researchResults = await this.researchTechStacks(techStacks);

      // Step 4: Load user stories for this SD
      const userStories = await this.loadUserStories();

      // Step 5: Enrich user stories with research results
      await this.enrichUserStories(userStories, researchResults);

      // Step 6: Calculate overall PRD confidence score
      const overallConfidence = this.calculateOverallConfidence(researchResults);
      await this.updatePRDConfidence(overallConfidence);

      // Step 7: Summary report
      this.printSummary();

      return this.enrichmentResults;

    } catch (error) {
      console.error('❌ Enrichment error:', error.message);
      throw error;
    }
  }

  /**
   * Load PRD from database
   */
  async loadPRD() {
    const { data, error } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('id', this.prdId)
      .single();

    if (error || !data) {
      throw new Error(`PRD ${this.prdId} not found: ${error?.message}`);
    }

    console.log(`✅ Loaded PRD: ${data.title}`);
    console.log(`   SD: ${data.sd_id}`);
    return data;
  }

  /**
   * Extract tech stacks from functional/technical requirements
   * Simple keyword extraction for MVP
   */
  extractTechStacks(prd) {
    const techStacks = new Set();

    // Extract from functional requirements
    if (Array.isArray(prd.functional_requirements)) {
      prd.functional_requirements.forEach(req => {
        const keywords = this.extractKeywords(req);
        keywords.forEach(k => techStacks.add(k));
      });
    }

    // Extract from technical requirements
    if (Array.isArray(prd.technical_requirements)) {
      prd.technical_requirements.forEach(req => {
        const keywords = this.extractKeywords(req);
        keywords.forEach(k => techStacks.add(k));
      });
    }

    return Array.from(techStacks);
  }

  /**
   * Simple keyword extraction (MVP implementation)
   * TODO: Enhance with NLP/LLM-based extraction in future iterations
   */
  extractKeywords(text) {
    const keywords = [];
    const patterns = [
      /\b(React|Vue|Angular|Svelte)\b/gi,
      /\b(Node\.js|Express|Fastify|Koa)\b/gi,
      /\b(PostgreSQL|MySQL|MongoDB|Redis)\b/gi,
      /\b(TypeScript|JavaScript|Python|Go)\b/gi,
      /\b(Docker|Kubernetes|AWS|Azure|GCP)\b/gi,
      /\b(OAuth|JWT|SAML|Auth0)\b/gi,
      /\b(GraphQL|REST|gRPC|WebSocket)\b/gi,
      /\b(Jest|Mocha|Playwright|Cypress)\b/gi,
      /\b(Tailwind|Bootstrap|Material UI|Chakra)\b/gi,
      /\b(Supabase|Firebase|Prisma|Drizzle)\b/gi
    ];

    patterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        keywords.push(...matches);
      }
    });

    return keywords;
  }

  /**
   * Research all identified tech stacks
   */
  async researchTechStacks(techStacks) {
    const results = {};

    for (const techStack of techStacks) {
      console.log(`🔍 Researching: ${techStack}`);

      const retrieval = new KnowledgeRetrieval(this.sdId);
      const research = await retrieval.research(techStack);

      results[techStack] = {
        results: research,
        confidence: this.calculateConfidence(research)
      };

      this.enrichmentResults.techStacksResearched.push({
        techStack,
        resultsCount: research.length,
        confidence: results[techStack].confidence
      });
    }

    return results;
  }

  /**
   * Load user stories for this PRD's SD
   */
  async loadUserStories() {
    const { data, error } = await supabase
      .from('user_stories')
      .select('*')
      .eq('sd_id', this.sdId);

    if (error) {
      console.error('❌ Failed to load user stories:', error.message);
      return [];
    }

    console.log(`\n📚 Loaded ${data.length} user stories`);
    return data;
  }

  /**
   * Enrich user stories with research results
   * Confidence-based gating: auto-apply >0.85, flag 0.7-0.85, reject <0.7
   */
  async enrichUserStories(userStories, researchResults) {
    console.log('\n📝 Enriching user stories with research context...\n');

    for (const story of userStories) {
      const implementationContext = {
        files: [],
        dependencies: [],
        apis: [],
        patterns: []
      };

      let maxConfidence = 0;

      // Match research results to user story
      Object.entries(researchResults).forEach(([techStack, research]) => {
        if (story.title.toLowerCase().includes(techStack.toLowerCase()) ||
            story.user_want?.toLowerCase().includes(techStack.toLowerCase())) {

          // Extract context from research
          research.results.forEach(result => {
            // Handle issue pattern results
            if (result.source === 'issue_patterns') {
              implementationContext.patterns.push({
                pattern_id: result.pattern_id,
                category: result.category,
                severity: result.severity,
                issue: result.issue_summary,
                solution: result.solution,
                prevention: result.prevention_checklist,
                occurrence_count: result.occurrence_count,
                success_rate: result.success_rate
              });
            }
            // Handle retrospective/Context7 results
            else if (result.code_snippet) {
              implementationContext.patterns.push({
                source: result.source || 'retrospective',
                snippet: result.code_snippet.substring(0, 200),
                context: result.implementation_context
              });
            }
          });

          maxConfidence = Math.max(maxConfidence, research.confidence);
        }
      });

      // Confidence-based gating
      if (maxConfidence >= CONFIDENCE_AUTO_APPLY) {
        // Auto-apply
        await this.updateUserStory(story.story_key, implementationContext, maxConfidence);
        this.enrichmentResults.userStoriesEnriched++;
        console.log(`   ✅ ${story.story_key}: Auto-applied (confidence: ${(maxConfidence * 100).toFixed(0)}%)`);

      } else if (maxConfidence >= CONFIDENCE_REVIEW) {
        // Flag for human review
        await this.updateUserStory(story.story_key, implementationContext, maxConfidence, true);
        this.enrichmentResults.userStoriesFlagged++;
        console.log(`   ⚠️  ${story.story_key}: Flagged for review (confidence: ${(maxConfidence * 100).toFixed(0)}%)`);

      } else {
        // Reject (too low confidence)
        this.enrichmentResults.userStoriesRejected++;
        console.log(`   ❌ ${story.story_key}: Rejected (confidence: ${(maxConfidence * 100).toFixed(0)}%)`);
      }
    }
  }

  /**
   * Update user story with implementation context
   */
  async updateUserStory(storyKey, implementationContext, confidence, flagForReview = false) {
    const updates = {
      implementation_context: {
        ...implementationContext,
        confidence_score: confidence,
        auto_applied: !flagForReview,
        requires_review: flagForReview,
        enriched_at: new Date().toISOString()
      }
    };

    const { error } = await supabase
      .from('user_stories')
      .update(updates)
      .eq('story_key', storyKey);

    if (error) {
      console.error(`   ❌ Failed to update ${storyKey}:`, error.message);
    }
  }

  /**
   * Calculate confidence score for research results
   */
  calculateConfidence(results) {
    if (results.length === 0) return 0;

    const avgConfidence = results.reduce((sum, r) => sum + r.confidence_score, 0) / results.length;
    return avgConfidence;
  }

  /**
   * Calculate overall PRD confidence score
   */
  calculateOverallConfidence(researchResults) {
    const allConfidences = Object.values(researchResults).map(r => r.confidence);
    if (allConfidences.length === 0) return 0;

    const overall = allConfidences.reduce((sum, c) => sum + c, 0) / allConfidences.length;
    this.enrichmentResults.overallConfidence = overall;
    return overall;
  }

  /**
   * Update PRD with research confidence score
   */
  async updatePRDConfidence(confidenceScore) {
    const { error } = await supabase
      .from('product_requirements_v2')
      .update({ research_confidence_score: confidenceScore })
      .eq('id', this.prdId);

    if (error) {
      console.error('❌ Failed to update PRD confidence:', error.message);
    } else {
      console.log(`\n📊 PRD confidence score updated: ${(confidenceScore * 100).toFixed(0)}%`);
    }
  }

  /**
   * Print enrichment summary
   */
  printSummary() {
    console.log('\n' + '='.repeat(64));
    console.log('📈 Enrichment Summary');
    console.log('='.repeat(64));
    console.log(`User Stories Enriched: ${this.enrichmentResults.userStoriesEnriched} (auto-applied)`);
    console.log(`User Stories Flagged: ${this.enrichmentResults.userStoriesFlagged} (requires review)`);
    console.log(`User Stories Rejected: ${this.enrichmentResults.userStoriesRejected} (low confidence)`);
    console.log(`Overall Confidence: ${(this.enrichmentResults.overallConfidence * 100).toFixed(0)}%`);
    console.log(`\nTech Stacks Researched: ${this.enrichmentResults.techStacksResearched.length}`);
    this.enrichmentResults.techStacksResearched.forEach(ts => {
      console.log(`  • ${ts.techStack}: ${ts.resultsCount} results (${(ts.confidence * 100).toFixed(0)}%)`);
    });
    console.log('='.repeat(64));
  }
}

export default PRDEnrichment;

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const prdId = process.argv[2];

  if (!prdId) {
    console.log('PRD Auto-Enrichment Pipeline');
    console.log('============================');
    console.log('Usage: node enrich-prd-with-research.js <PRD-ID>');
    console.log('');
    console.log('Example:');
    console.log('  node enrich-prd-with-research.js PRD-KNOWLEDGE-001');
    console.log('');
    console.log('Features:');
    console.log('  • Extracts tech stacks from requirements');
    console.log('  • Researches using local + Context7');
    console.log('  • Enriches user stories with implementation context');
    console.log('  • Confidence-based gating (auto/review/reject)');
    console.log('  • Calculates PRD confidence score');
    process.exit(1);
  }

  const enrichment = new PRDEnrichment(prdId);
  await enrichment.enrich();
}
