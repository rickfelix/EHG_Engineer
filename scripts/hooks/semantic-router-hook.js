#!/usr/bin/env node
/**
 * UserPromptSubmit Hook: Semantic Agent Routing
 *
 * SD-LEO-INFRA-INTEGRATE-SEMANTIC-ROUTER-001
 *
 * Runs the user's prompt through the SemanticAgentRouter and injects
 * routing recommendations into Claude's context via stdout.
 *
 * Input (via stdin JSON):
 *   { "prompt": "user's message", "session_id": "...", ... }
 *
 * Output (via stdout):
 *   [SEMANTIC-ROUTE] Recommended agents: RCA (58%), TESTING (42%)
 *
 * Configuration (env vars):
 *   - SEMANTIC_ROUTER_ENABLED: Set to 'false' to disable (default: true)
 *   - SEMANTIC_ROUTER_TIMEOUT_MS: Timeout in ms (default: 300)
 *   - SEMANTIC_ROUTER_CONFIDENCE_THRESHOLD: Min confidence (default: 0.35)
 *   - SEMANTIC_ROUTER_DEBUG: Set to 'true' for verbose logging
 *
 * Exit codes:
 *   0 - Always (non-blocking, advisory mode)
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load environment
dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const ENABLED = process.env.SEMANTIC_ROUTER_ENABLED !== 'false';
const TIMEOUT_MS = parseInt(process.env.SEMANTIC_ROUTER_TIMEOUT_MS || '300', 10);
const CONFIDENCE_THRESHOLD = parseFloat(process.env.SEMANTIC_ROUTER_CONFIDENCE_THRESHOLD || '0.35');
const DEBUG = process.env.SEMANTIC_ROUTER_DEBUG === 'true';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const TOP_K = 3;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse a vector from PostgreSQL pgvector string format
 */
function parseVector(vec) {
  if (Array.isArray(vec)) return vec;
  if (typeof vec === 'string') {
    try {
      const cleaned = vec.replace(/^\[|\]$/g, '');
      return cleaned.split(',').map(Number);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
  const vecA = parseVector(a);
  const vecB = parseVector(b);

  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Read stdin as JSON (synchronous-ish approach for hooks)
 */
async function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    let hasData = false;

    process.stdin.setEncoding('utf8');

    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk;
        hasData = true;
      }
    });

    process.stdin.on('end', () => {
      if (hasData && data.trim()) {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });

    process.stdin.on('error', () => {
      resolve(null);
    });

    // If stdin is a TTY (no piped input), resolve immediately
    if (process.stdin.isTTY) {
      resolve(null);
    }
  });
}

/**
 * Run with timeout
 */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), ms)
    )
  ]);
}

// ============================================================================
// SEMANTIC ROUTING
// ============================================================================

async function routePrompt(prompt) {
  const startTime = Date.now();

  try {
    // Initialize clients
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // Generate embedding for the prompt
    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: prompt.substring(0, 1000) // Limit prompt length
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    // Load agents with embeddings
    const { data: agents, error } = await supabase
      .from('leo_sub_agents')
      .select('code, name, domain_embedding')
      .eq('active', true)
      .not('domain_embedding', 'is', null);

    if (error || !agents) {
      throw new Error('Failed to load agents');
    }

    // Calculate similarity scores
    const scored = agents
      .map(agent => ({
        code: agent.code,
        name: agent.name,
        score: Math.round(cosineSimilarity(queryEmbedding, agent.domain_embedding) * 100)
      }))
      .filter(agent => agent.score >= CONFIDENCE_THRESHOLD * 100)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K);

    const latencyMs = Date.now() - startTime;

    return {
      success: true,
      matches: scored,
      latencyMs,
      fallbackUsed: false
    };

  } catch (err) {
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      matches: [],
      latencyMs,
      fallbackUsed: true,
      error: err.message
    };
  }
}

// ============================================================================
// MAIN LOGIC
// ============================================================================

async function main() {
  try {
    // Check if routing is enabled
    if (!ENABLED) {
      if (DEBUG) console.error('[SEMANTIC-ROUTE] Disabled via env');
      process.exit(0);
    }

    // Read input from stdin
    if (DEBUG) console.error('[SEMANTIC-ROUTE] Reading stdin...');
    const input = await readStdin();
    if (DEBUG) console.error('[SEMANTIC-ROUTE] Input:', JSON.stringify(input));

    if (!input || !input.prompt) {
      // No prompt available
      if (DEBUG) console.error('[SEMANTIC-ROUTE] No prompt in input');
      process.exit(0);
    }

    const prompt = input.prompt;
    if (DEBUG) console.error('[SEMANTIC-ROUTE] Prompt:', prompt.substring(0, 50));

    // Skip very short prompts
    if (prompt.length < 10) {
      process.exit(0);
    }

    // Run semantic routing with timeout
    const result = await withTimeout(routePrompt(prompt), TIMEOUT_MS);

    // Output recommendations if we have matches
    if (result.success && result.matches.length > 0) {
      const matchStrings = result.matches
        .map(m => `${m.code} (${m.score}%)`)
        .join(', ');

      console.log(`[SEMANTIC-ROUTE] Recommended sub-agents: ${matchStrings}`);

      if (DEBUG) {
        console.log(`[SEMANTIC-ROUTE] Latency: ${result.latencyMs}ms`);
      }
    } else if (result.fallbackUsed && DEBUG) {
      console.log(`[SEMANTIC-ROUTE] Fallback used: ${result.error || 'unknown'}`);
    }

    process.exit(0);

  } catch (err) {
    // Never block the user - just exit silently on errors
    if (DEBUG) {
      console.error(`[SEMANTIC-ROUTE] Error: ${err.message}`);
    }
    process.exit(0);
  }
}

main();
