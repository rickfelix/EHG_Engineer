#!/usr/bin/env node

/**
 * API Endpoint: Convert UAT Test Failure to Strategic Directive
 * Handles the conversion of UAT test failures into Strategic Directives using AI
 */

import { UATToSDConverter } from '../scripts/uat-to-strategic-directive-ai.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const testResult = req.body;

    // Validate required fields
    if (!testResult.case_id) {
      return res.status(400).json({ error: 'Missing required field: case_id' });
    }

    // Initialize converter
    const converter = new UATToSDConverter();

    // Convert test failure to Strategic Directive
    const submission = await converter.convertTestFailureToSD(testResult);

    // Return the created submission
    res.status(200).json({
      success: true,
      submission: {
        id: submission.id,
        sd_id: submission.sd_id,
        status: submission.status,
        priority: submission.priority,
        confidence_score: submission.metadata?.ai_confidence || 0.85,
        metadata: submission.metadata
      }
    });

  } catch (error) {
    console.error('API Error - UAT to SD conversion failed:', error);
    res.status(500).json({
      error: 'Failed to convert UAT test to Strategic Directive',
      message: error.message
    });
  }
}