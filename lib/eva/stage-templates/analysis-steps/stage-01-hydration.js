/**
 * Stage 01 Analysis Step - Hydration from Stage 0 Synthesis
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001
 *
 * Consumes Stage 0 synthesis output and hydrates into a structured
 * Draft Idea with description, value proposition, target market,
 * and a required problemStatement field.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-01-hydration
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON } from '../../utils/parse-json.js';

const SYSTEM_PROMPT = `You are EVA's Stage 1 Hydration Engine. Your job is to transform a raw venture synthesis from Stage 0 into a structured draft idea.

You MUST output valid JSON with exactly these fields:
- description (string, min 50 chars): A clear description of the venture idea
- valueProp (string, min 20 chars): The core value proposition
- targetMarket (string, min 10 chars): Who this is for
- problemStatement (string, min 30 chars): The specific problem being solved

Rules:
- Use the synthesis data to ground every field
- problemStatement is REQUIRED and must be specific, not generic
- If the synthesis includes a reframed problem, prefer that over the raw intent
- Keep language crisp and actionable
- Do NOT invent claims not supported by the synthesis
- If template context is provided from a similar successful venture, use it as calibration guidance (not as a replacement for the synthesis data)`;

