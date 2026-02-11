/**
 * LLM-Based PRD Content Generator
 * Part of SD-LEO-REFACTOR-PRD-DB-001
 *
 * Uses GPT 5.2 to generate actual PRD content instead of placeholder text
 */

import { getLLMClient } from '../../../lib/llm/client-factory.js';
import { LLM_PRD_CONFIG, buildSystemPrompt } from './config.js';
import { buildPRDGenerationContext } from './context-builder.js';

/**
 * Generate PRD content using LLM (GPT 5.2)
 *
 * @param {Object} sd - Strategic Directive data
 * @param {Object} context - Additional context (design analysis, database analysis, personas)
 * @returns {Promise<Object|null>} Generated PRD content or null if failed
 */
export async function generatePRDContentWithLLM(sd, context = {}) {
  if (!LLM_PRD_CONFIG.enabled) {
    console.log('   \u2139\ufe0f  LLM PRD generation disabled via LLM_PRD_GENERATION=false');
    return null;
  }

  // Get LLM client from factory (handles authentication and model selection)
  const llmClient = await getLLMClient({
    purpose: 'prd-generation',
    phase: 'PLAN'
  });

  if (!llmClient) {
    console.warn('   \u26a0\ufe0f  LLM client unavailable, falling back to template PRD');
    return null;
  }
  const sdType = sd.sd_type || 'feature';

  console.log('   \ud83e\udd16 Generating PRD content with GPT 5.2...');
  console.log(`   \ud83d\udccb SD Type: ${sdType}`);

  try {
    const systemPrompt = buildSystemPrompt(sdType);
    const userPrompt = buildPRDGenerationContext(sd, context);

    const response = await llmClient.chat.completions.create({
      temperature: LLM_PRD_CONFIG.temperature,
      max_completion_tokens: LLM_PRD_CONFIG.maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    const content = response.choices[0]?.message?.content;
    const finishReason = response.choices[0]?.finish_reason;

    if (!content) {
      console.warn('   \u26a0\ufe0f  LLM returned empty content');
      return null;
    }

    if (finishReason === 'length') {
      console.warn('   \u26a0\ufe0f  LLM response truncated (token limit), attempting parse anyway');
    }

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('   \u26a0\ufe0f  Could not extract JSON from LLM response');
      console.log('   Response preview:', content.substring(0, 500));
      return null;
    }

    const prdContent = JSON.parse(jsonMatch[0]);

    console.log('   \u2705 PRD content generated successfully');
    console.log(`   \ud83d\udcca Generated: ${prdContent.functional_requirements?.length || 0} functional requirements`);
    console.log(`   \ud83d\udcca Generated: ${prdContent.test_scenarios?.length || 0} test scenarios`);
    console.log(`   \ud83d\udcca Generated: ${prdContent.risks?.length || 0} risks identified`);

    return prdContent;

  } catch (error) {
    console.error('   \u274c LLM PRD generation failed:', error.message);
    if (error.response?.data) {
      console.error('   API Error:', JSON.stringify(error.response.data, null, 2));
    }
    return null;
  }
}
