import { getLLMClient } from '../llm/client-factory.js';

const SYSTEM_PROMPT = `You are a venture relevance analyst. Given a YouTube video and a list of venture interests, score the video's relevance from 0 to 100.

Scoring guide:
- 90-100: Directly about one of the ventures or its core technology
- 70-89: Strongly related topic (competitor analysis, market trends, relevant tech)
- 50-69: Tangentially related (general industry, adjacent technology)
- 30-49: Weak connection (broad category overlap only)
- 0-29: Not relevant

Respond with valid JSON only:
{
  "score": <number 0-100>,
  "venture_tags": ["<venture_name>", ...],
  "reasoning": "<1-2 sentence explanation>"
}`;

/**
 * Score a video's relevance against venture interests using LLM.
 *
 * @param {Object} video - Video metadata
 * @param {string} video.title
 * @param {string} video.channel_name
 * @param {Array<{name: string, keywords: string[]}>} interests - Venture interest profiles
 * @returns {Promise<{score: number, venture_tags: string[], reasoning: string}>}
 */
export async function scoreVideoRelevance(video, interests) {
  const client = getLLMClient({ purpose: 'classification' });

  const interestList = interests
    .map(i => `- ${i.name}: ${i.keywords.join(', ')}`)
    .join('\n');

  const userPrompt = `Video: "${video.title}" by ${video.channel_name}

Venture Interests:
${interestList}

Score this video's relevance.`;

  try {
    const response = await client.complete(SYSTEM_PROMPT, userPrompt, {
      maxTokens: 200,
      temperature: 0.1
    });

    const text = response.content;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in LLM response');

    const result = JSON.parse(jsonMatch[0]);
    return {
      score: Math.max(0, Math.min(100, Math.round(result.score))),
      venture_tags: Array.isArray(result.venture_tags) ? result.venture_tags : [],
      reasoning: result.reasoning || ''
    };
  } catch (err) {
    console.error(`[Scorer] Failed to score "${video.title}": ${err.message}`);
    return { score: 0, venture_tags: [], reasoning: `Scoring failed: ${err.message}` };
  }
}

/**
 * Score a batch of videos against interests.
 * @param {Array} videos
 * @param {Array} interests
 * @returns {Promise<Map<string, {score: number, venture_tags: string[], reasoning: string}>>}
 */
export async function scoreVideoBatch(videos, interests) {
  const scores = new Map();
  for (const video of videos) {
    const result = await scoreVideoRelevance(video, interests);
    scores.set(video.video_id, result);
  }
  return scores;
}
