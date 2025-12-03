/**
 * POST /api/competitor-analysis
 * SD-STAGE1-ENTRY-UX-001: Analyze competitor URL
 *
 * Analyzes a competitor URL and returns suggested venture data.
 * Currently returns stub response - AI integration TODO.
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

// Request body validation schema
const AnalyzeCompetitorSchema = z.object({
  url: z.string().url('Please enter a valid URL')
});

// Stub response generator - TODO: Replace with AI integration
function generateStubAnalysis(url: string) {
  // Extract domain for competitor reference
  let domain = '';
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = url;
  }

  return {
    name: `${domain.replace('www.', '').split('.')[0].toUpperCase()} Alternative`,
    problem_statement: `The current market leader (${domain}) has high costs and limited customization options for small businesses.`,
    solution: 'An AI-powered platform offering similar features at lower cost with better customization for SMBs.',
    target_market: 'Small and medium businesses seeking affordable alternatives',
    competitor_reference: url
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      allowed: ['POST']
    });
  }

  // Validate request body
  const parsed = AnalyzeCompetitorSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid URL format',
      details: parsed.error.flatten().fieldErrors
    });
  }

  const { url } = parsed.data;

  try {
    // TODO: Integrate with AI service (OpenAI/Anthropic) to analyze competitor website
    // For now, return stub data that matches E2E test expectations
    const ventureData = generateStubAnalysis(url);

    return res.status(200).json({
      success: true,
      venture: ventureData
    });

  } catch (error) {
    console.error('Competitor analysis error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to analyze competitor website',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
