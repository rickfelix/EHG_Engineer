/**
 * UAT Feedback Analyzer - Multi-Model Intelligence
 *
 * Orchestrates batch feedback parsing and multi-model triangulation
 * using GPT 5.2 and Gemini for higher confidence classifications.
 *
 * Part of: SD-LEO-FEAT-INTELLIGENT-UAT-FEEDBACK-001
 *
 * @module lib/uat/feedback-analyzer
 * @version 1.0.0
 */

import { getLLMClient } from '../llm/client-factory.js';
import dotenv from 'dotenv';

dotenv.config();

// Feedback modes that can be detected
const FEEDBACK_MODES = {
  STRATEGIC: 'strategic',
  PRODUCT: 'product',
  TECHNICAL: 'technical',
  POLISH: 'polish'
};

// Mode detection keywords for initial classification
const MODE_KEYWORDS = {
  [FEEDBACK_MODES.STRATEGIC]: ['vision', 'direction', 'priority', 'shouldn\'t be', 'wrong focus', 'alignment', 'strategy', 'roadmap'],
  [FEEDBACK_MODES.PRODUCT]: ['confusing', 'user would', 'experience', 'flow', 'makes sense', 'intuitive', 'friction', 'ux', 'usability'],
  [FEEDBACK_MODES.TECHNICAL]: ['error', 'broke', 'console', 'fails', 'edge case', 'returns', 'null', 'undefined', 'crash', 'exception', 'bug'],
  [FEEDBACK_MODES.POLISH]: ['spacing', 'alignment', 'color', 'font', 'feels off', 'minor', 'tweak', 'nitpick', 'pixel', 'style']
};

/**
 * Multi-model feedback analyzer
 */
export class FeedbackAnalyzer {
  constructor() {
    this.llmClient = null; // Initialized lazily on first use
    this.geminiApiKey = process.env.GEMINI_API_KEY;
    this.geminiModel = 'gemini-2.0-flash';
  }

  /**
   * Get LLM client from factory (lazy initialization)
   */
  async getLLMClient() {
    if (!this.llmClient) {
      try {
        this.llmClient = await getLLMClient({
          purpose: 'feedback-analysis',
          phase: 'EXEC'
        });
      } catch (error) {
        console.warn('LLM client unavailable - feedback analysis will use fallback methods');
        return null;
      }
    }
    return this.llmClient;
  }

  /**
   * Parse batch feedback text into individual issues
   * @param {string} rawFeedback - Raw batch feedback text
   * @param {Object} options - Parsing options
   * @returns {Promise<Array>} Array of parsed issues
   */
  async parseBatchFeedback(rawFeedback, options = {}) {
    const { sdId, sessionContext } = options;

    // Step 1: Use LLM to split and extract issues
    const extractionPrompt = this.buildExtractionPrompt(rawFeedback, sessionContext);

    let issues = [];

    const llmClient = await this.getLLMClient();

    if (llmClient) {
      try {
        // Use LLM for extraction (faster, cheaper for this task)
        const response = await llmClient.chat.completions.create({
          messages: [
            { role: 'system', content: extractionPrompt.system },
            { role: 'user', content: extractionPrompt.user }
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' }
        });

        const parsed = JSON.parse(response.choices[0].message.content);
        issues = parsed.issues || [];

      } catch (error) {
        console.error('LLM extraction failed:', error.message);
        // Fallback to basic sentence splitting
        issues = this.basicExtraction(rawFeedback);
      }
    } else {
      // No LLM available, use basic extraction
      issues = this.basicExtraction(rawFeedback);
    }

    // Step 2: Detect mode for each issue using keyword matching first
    issues = issues.map(issue => ({
      ...issue,
      detectedMode: this.detectModeByKeywords(issue.text || issue.description),
      confidence: 'low', // Will be updated by triangulation
      sdId
    }));

    return issues;
  }

  /**
   * Build extraction prompt for LLM
   */
  buildExtractionPrompt(rawFeedback, _sessionContext = {}) {
    return {
      system: `You are a UAT feedback parser. Extract individual issues from raw feedback text.

For each issue, identify:
1. The core problem or observation
2. Any mentioned UI element, screen, or action
3. Severity hint (if mentioned: "critical", "annoying", "minor", etc.)

Return JSON format:
{
  "issues": [
    {
      "text": "The core issue description",
      "element": "UI element or screen mentioned (if any)",
      "severityHint": "critical|major|minor|enhancement (if detectable)",
      "rawExcerpt": "Original text snippet this came from"
    }
  ]
}

Split multi-issue feedback into separate entries. Preserve the user's voice but clarify if ambiguous.`,
      user: `Parse this UAT feedback into individual issues:\n\n${rawFeedback}`
    };
  }

  /**
   * Basic extraction fallback (sentence splitting)
   */
  basicExtraction(rawFeedback) {
    // Split by periods, newlines, or common separators
    const sentences = rawFeedback
      .split(/[.\n]|(?:and then)|(?:also,?)|(?:but )/)
      .map(s => s.trim())
      .filter(s => s.length > 10);

    return sentences.map((text) => ({
      text,
      element: null,
      severityHint: null,
      rawExcerpt: text,
      extractionMethod: 'basic'
    }));
  }

  /**
   * Detect feedback mode using keyword matching
   */
  detectModeByKeywords(text) {
    const lowerText = text.toLowerCase();
    const scores = {};

    for (const [mode, keywords] of Object.entries(MODE_KEYWORDS)) {
      scores[mode] = keywords.filter(kw => lowerText.includes(kw)).length;
    }

    const maxScore = Math.max(...Object.values(scores));
    if (maxScore === 0) return FEEDBACK_MODES.PRODUCT; // Default

    return Object.keys(scores).find(mode => scores[mode] === maxScore);
  }

  /**
   * Run multi-model triangulation on issues
   * @param {Array} issues - Parsed issues
   * @returns {Promise<Array>} Issues with triangulated assessments
   */
  async triangulateIssues(issues) {
    const results = [];

    for (const issue of issues) {
      const triangulation = await this.analyzeWithBothModels(issue);
      results.push({
        ...issue,
        ...triangulation
      });
    }

    return results;
  }

  /**
   * Analyze a single issue with both GPT and Gemini
   */
  async analyzeWithBothModels(issue) {
    const analysisPrompt = this.buildAnalysisPrompt(issue);

    // Run both models in parallel
    const [gptResult, geminiResult] = await Promise.allSettled([
      this.analyzeWithGPT(analysisPrompt),
      this.analyzeWithGemini(analysisPrompt)
    ]);

    const gptAnalysis = gptResult.status === 'fulfilled' ? gptResult.value : null;
    const geminiAnalysis = geminiResult.status === 'fulfilled' ? geminiResult.value : null;

    // Calculate consensus
    const consensus = this.calculateConsensus(gptAnalysis, geminiAnalysis);

    return {
      gptAnalysis,
      geminiAnalysis,
      consensus,
      detectedMode: consensus.agreedMode || issue.detectedMode,
      severity: consensus.agreedSeverity,
      suggestedAction: consensus.agreedAction,
      confidenceScore: consensus.confidence,
      needsFollowUp: consensus.confidence < 0.7 || consensus.hasDisagreement
    };
  }

  /**
   * Build analysis prompt for classification
   */
  buildAnalysisPrompt(issue) {
    return `Analyze this UAT feedback issue and classify it:

Issue: "${issue.text}"
${issue.element ? `UI Element: ${issue.element}` : ''}
${issue.severityHint ? `User indicated severity: ${issue.severityHint}` : ''}

Classify:
1. Mode: strategic (vision/direction issues), product (UX/flow issues), technical (bugs/errors), polish (minor styling)
2. Severity: critical, major, minor, enhancement
3. Estimated Scope: <50 LOC (quick-fix), 50-200 LOC (medium), >200 LOC (large SD)
4. Suggested Action: quick-fix, create-sd, backlog
5. Risk Areas: auth, data, ui, performance, none

Return JSON:
{
  "mode": "strategic|product|technical|polish",
  "severity": "critical|major|minor|enhancement",
  "estimatedLOC": <number>,
  "suggestedAction": "quick-fix|create-sd|backlog",
  "riskAreas": ["list of areas"],
  "reasoning": "Brief explanation"
}`;
  }

  /**
   * Analyze with LLM
   */
  async analyzeWithGPT(prompt) {
    const llmClient = await this.getLLMClient();
    if (!llmClient) {
      throw new Error('LLM client not available');
    }

    const response = await llmClient.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a UAT feedback classifier. Return only valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    });

    return JSON.parse(response.choices[0].message.content);
  }

  /**
   * Analyze with Gemini
   */
  async analyzeWithGemini(prompt) {
    if (!this.geminiApiKey) {
      throw new Error('Gemini API key not configured');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${this.geminiApiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a UAT feedback classifier. Return only valid JSON.\n\n${prompt}`
          }]
        }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error.substring(0, 200)}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('No response from Gemini');
    }

    return JSON.parse(text);
  }

  /**
   * Calculate consensus between GPT and Gemini analyses
   */
  calculateConsensus(gptAnalysis, geminiAnalysis) {
    // Handle single model availability
    if (!gptAnalysis && !geminiAnalysis) {
      return {
        confidence: 0,
        hasDisagreement: true,
        agreedMode: null,
        agreedSeverity: null,
        agreedAction: null,
        singleModelOnly: true,
        reason: 'Both models failed'
      };
    }

    if (!gptAnalysis || !geminiAnalysis) {
      const available = gptAnalysis || geminiAnalysis;
      return {
        confidence: 0.5,
        hasDisagreement: false,
        agreedMode: available.mode,
        agreedSeverity: available.severity,
        agreedAction: available.suggestedAction,
        singleModelOnly: true,
        reason: `Only ${gptAnalysis ? 'GPT' : 'Gemini'} available`
      };
    }

    // Both models available - calculate agreement
    const agreements = {
      mode: gptAnalysis.mode === geminiAnalysis.mode,
      severity: gptAnalysis.severity === geminiAnalysis.severity,
      action: gptAnalysis.suggestedAction === geminiAnalysis.suggestedAction
    };

    const agreementCount = Object.values(agreements).filter(Boolean).length;
    const confidence = agreementCount / 3;

    return {
      confidence,
      hasDisagreement: agreementCount < 3,
      agreedMode: agreements.mode ? gptAnalysis.mode : null,
      agreedSeverity: agreements.severity ? gptAnalysis.severity : null,
      agreedAction: agreements.action ? gptAnalysis.suggestedAction : null,
      disagreements: Object.keys(agreements).filter(k => !agreements[k]),
      gptValues: {
        mode: gptAnalysis.mode,
        severity: gptAnalysis.severity,
        action: gptAnalysis.suggestedAction,
        loc: gptAnalysis.estimatedLOC
      },
      geminiValues: {
        mode: geminiAnalysis.mode,
        severity: geminiAnalysis.severity,
        action: geminiAnalysis.suggestedAction,
        loc: geminiAnalysis.estimatedLOC
      }
    };
  }
}

// Export singleton instance
export const feedbackAnalyzer = new FeedbackAnalyzer();

// Export types
export { FEEDBACK_MODES, MODE_KEYWORDS };

export default FeedbackAnalyzer;
