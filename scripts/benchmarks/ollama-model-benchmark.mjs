#!/usr/bin/env node
/**
 * Ollama Local Model Benchmark Tool
 *
 * Purpose: Benchmark local LLM models via Ollama to inform model selection decisions.
 * Use Case: Compare speed, accuracy, and reliability of local models as potential
 *           replacements for cloud models (e.g., replacing Claude Haiku with local inference).
 *
 * Features:
 * - Speed measurement (tokens/second, time-to-first-token)
 * - Classification accuracy testing
 * - JSON output reliability testing
 * - Instruction following assessment
 * - Detailed results in JSON and human-readable formats
 *
 * Usage:
 *   node scripts/benchmarks/ollama-model-benchmark.mjs [options]
 *
 * Options:
 *   --models <list>     Comma-separated list of models to test (default: all installed)
 *   --tasks <list>      Comma-separated list of tasks: speed,classify,json,instruct (default: all)
 *   --iterations <n>    Number of iterations per test (default: 3)
 *   --output <file>     Output JSON file path (default: stdout + console table)
 *   --verbose           Show detailed output during tests
 *   --help              Show this help message
 *
 * Examples:
 *   node scripts/benchmarks/ollama-model-benchmark.mjs
 *   node scripts/benchmarks/ollama-model-benchmark.mjs --models gpt-oss:20b,llama3.2:3b
 *   node scripts/benchmarks/ollama-model-benchmark.mjs --tasks speed,classify --iterations 5
 *   node scripts/benchmarks/ollama-model-benchmark.mjs --output benchmark-results.json
 *
 * Output:
 *   - Console table with summary results
 *   - JSON file with detailed metrics (if --output specified)
 *   - Results saved to scripts/benchmarks/results/ with timestamp
 *
 * @module scripts/benchmarks/ollama-model-benchmark
 * @version 1.1.0
 * @created 2026-02-05
 * @author EHG Engineering Team
 *
 * Changelog:
 *   1.1.0 (2026-02-05): Added EHG-specific tests for frontend AI features
 *     - content: User-facing content generation (chairman insights, nav suggestions)
 *     - analytics: Portfolio analytics reasoning
 *     - research: Market research data simulation
 *     - painpoint: Pain point validation
 *     - New --ehg flag to run EHG frontend tests
 *     - EHG readiness scoring for user-facing feature routing
 *   1.0.0 (2026-02-05): Initial version - speed, classify, JSON, instruct tests
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  defaultIterations: 3,
  timeoutMs: 60000, // 60 second timeout per request
  warmupIterations: 1, // Warm up model before benchmarking
};

// ============================================================================
// TEST DEFINITIONS
// ============================================================================

/**
 * Test prompts for different benchmark categories.
 * Designed to match typical Haiku workloads: classification, fast ops, CI checks.
 */
const TEST_PROMPTS = {
  // ============================================================================
  // CORE TESTS (Basic capabilities)
  // ============================================================================
  speed: {
    name: 'Speed Test',
    description: 'Measure raw token generation speed',
    system: 'You are a helpful assistant. Respond concisely.',
    user: 'Explain what an API is in exactly 50 words.',
    expectedMinTokens: 40,
  },

  classify: {
    name: 'Classification Test',
    description: 'Test classification accuracy (typical Haiku task)',
    system: 'You are a classifier. Respond with ONLY one word: BUG, FEATURE, REFACTOR, or DOCS. No explanation.',
    cases: [
      { user: 'Fix the null pointer exception in user login', expected: 'BUG' },
      { user: 'Add dark mode support to settings page', expected: 'FEATURE' },
      { user: 'Extract duplicate code into shared utility function', expected: 'REFACTOR' },
      { user: 'Update README with new installation steps', expected: 'DOCS' },
      { user: 'Button click handler throws TypeError', expected: 'BUG' },
      { user: 'Implement OAuth2 authentication flow', expected: 'FEATURE' },
    ],
  },

  json: {
    name: 'JSON Output Test',
    description: 'Test JSON format reliability',
    system: 'You are a JSON generator. Output ONLY valid JSON, no markdown, no explanation.',
    user: 'Generate a JSON object with fields: name (string), age (number), active (boolean). Use realistic values.',
    validate: (response) => {
      try {
        const parsed = JSON.parse(response.trim());
        return typeof parsed.name === 'string' &&
               typeof parsed.age === 'number' &&
               typeof parsed.active === 'boolean';
      } catch {
        return false;
      }
    },
  },

  instruct: {
    name: 'Instruction Following Test',
    description: 'Test strict instruction adherence',
    system: 'Follow instructions exactly. No extra text.',
    cases: [
      {
        user: 'List exactly 3 colors, one per line, no numbering.',
        validate: (r) => {
          const lines = r.trim().split('\n').filter(l => l.trim());
          return lines.length === 3 && !lines.some(l => /^\d/.test(l.trim()));
        }
      },
      {
        user: 'Say only the word "CONFIRMED" with no other text.',
        validate: (r) => r.trim().toUpperCase() === 'CONFIRMED'
      },
      {
        user: 'Output the number 42 and nothing else.',
        validate: (r) => r.trim() === '42'
      },
    ],
  },

  // ============================================================================
  // AGENT-SPECIFIC TESTS (Match sub-agent workloads)
  // ============================================================================

  /**
   * RCA Agent Test - Chain-of-thought reasoning, 5-whys analysis
   * Best for: Models with strong reasoning (deepseek-r1)
   */
  rca: {
    name: 'RCA Agent Test',
    description: 'Test root cause analysis / 5-whys reasoning',
    agentMatch: 'rca-agent',
    system: `You are a root cause analysis expert. When given a problem:
1. Identify the immediate symptom
2. Apply 5-whys analysis (go at least 3 levels deep)
3. Output structured JSON with: symptom, whys (array), root_cause, recommendation`,
    cases: [
      {
        user: 'Users report login fails intermittently during peak hours.',
        validate: (r) => {
          try {
            const parsed = JSON.parse(r.trim());
            return parsed.symptom && Array.isArray(parsed.whys) && parsed.whys.length >= 3 && parsed.root_cause;
          } catch { return false; }
        }
      },
      {
        user: 'CI pipeline fails on the same test 30% of the time but passes locally.',
        validate: (r) => {
          try {
            const parsed = JSON.parse(r.trim());
            return parsed.symptom && Array.isArray(parsed.whys) && parsed.root_cause;
          } catch { return false; }
        }
      },
    ],
  },

  /**
   * Design Agent Test - Component decisions, trade-off analysis
   * Best for: Models with balanced reasoning + structure
   */
  design: {
    name: 'Design Agent Test',
    description: 'Test design decision / trade-off analysis',
    agentMatch: 'design-agent',
    system: `You are a software design expert. Analyze the request and output JSON with:
- approach: chosen approach name
- rationale: 1-2 sentence justification
- tradeoffs: array of {pro, con} objects (at least 2)
- complexity: "low", "medium", or "high"`,
    cases: [
      {
        user: 'Should we use Redux or React Context for state management in a medium-sized app?',
        validate: (r) => {
          try {
            const parsed = JSON.parse(r.trim());
            return parsed.approach && parsed.rationale &&
                   Array.isArray(parsed.tradeoffs) && parsed.tradeoffs.length >= 2 &&
                   ['low', 'medium', 'high'].includes(parsed.complexity);
          } catch { return false; }
        }
      },
      {
        user: 'Implement caching: Redis vs in-memory Map for user sessions?',
        validate: (r) => {
          try {
            const parsed = JSON.parse(r.trim());
            return parsed.approach && parsed.tradeoffs && parsed.complexity;
          } catch { return false; }
        }
      },
    ],
  },

  /**
   * Quick-Fix Agent Test - Fast triage, small scope estimation
   * Best for: Fast models with decent accuracy (llama3.2:3b)
   */
  quickfix: {
    name: 'Quick-Fix Agent Test',
    description: 'Test quick bug triage capability',
    agentMatch: 'quickfix-agent',
    system: `You are a quick bug triage assistant. For each issue, output JSON with:
- is_quickfix: boolean (true if ≤50 LOC fix)
- estimated_loc: number
- files_affected: number
- fix_summary: one sentence`,
    cases: [
      {
        user: 'Button text says "Cancle" instead of "Cancel"',
        validate: (r) => {
          try {
            const parsed = JSON.parse(r.trim());
            return parsed.is_quickfix === true && parsed.estimated_loc <= 10;
          } catch { return false; }
        }
      },
      {
        user: 'Need to refactor authentication to support SSO across 12 services',
        validate: (r) => {
          try {
            const parsed = JSON.parse(r.trim());
            return parsed.is_quickfix === false && parsed.estimated_loc > 50;
          } catch { return false; }
        }
      },
      {
        user: 'Missing null check on user.email in profile component',
        validate: (r) => {
          try {
            const parsed = JSON.parse(r.trim());
            return parsed.is_quickfix === true && parsed.files_affected <= 2;
          } catch { return false; }
        }
      },
    ],
  },

  /**
   * Schema Agent Test - Database/API schema generation
   * Best for: Models with strong JSON/structure (qwen-coder)
   */
  schema: {
    name: 'Schema Agent Test',
    description: 'Test database/API schema generation',
    agentMatch: 'database-agent',
    system: `You are a database schema expert. Generate PostgreSQL-compatible JSON schema definitions.
Output valid JSON with: table_name, columns (array of {name, type, nullable, constraints})`,
    cases: [
      {
        user: 'Create a users table with id, email, created_at, and role',
        validate: (r) => {
          try {
            const parsed = JSON.parse(r.trim());
            return parsed.table_name && Array.isArray(parsed.columns) &&
                   parsed.columns.length >= 4 &&
                   parsed.columns.every(c => c.name && c.type);
          } catch { return false; }
        }
      },
      {
        user: 'Create an audit_log table for tracking user actions with user_id foreign key',
        validate: (r) => {
          try {
            const parsed = JSON.parse(r.trim());
            const hasForeignKey = parsed.columns?.some(c =>
              c.constraints?.includes('REFERENCES') || c.constraints?.includes('foreign')
            );
            return parsed.table_name && parsed.columns && hasForeignKey;
          } catch { return false; }
        }
      },
    ],
  },

  /**
   * Code Review Test - Identify issues in code snippets
   * Best for: Coding models (qwen-coder)
   */
  review: {
    name: 'Code Review Test',
    description: 'Test code review / issue detection',
    agentMatch: 'testing-agent',
    system: `You are a code reviewer. Analyze the code and output JSON with:
- issues: array of {severity: "critical"|"warning"|"info", description, line}
- has_critical: boolean
- overall_quality: 1-10 score`,
    cases: [
      {
        user: `Review this JavaScript:
function getUser(id) {
  const user = db.query("SELECT * FROM users WHERE id = " + id);
  return user;
}`,
        validate: (r) => {
          try {
            const parsed = JSON.parse(r.trim());
            // Should detect SQL injection
            return parsed.issues?.some(i =>
              i.severity === 'critical' &&
              (i.description.toLowerCase().includes('sql') || i.description.toLowerCase().includes('injection'))
            );
          } catch { return false; }
        }
      },
      {
        user: `Review this:
async function fetchData() {
  const data = await fetch('/api/data');
  return data.json();
}`,
        validate: (r) => {
          try {
            const parsed = JSON.parse(r.trim());
            // Should note missing error handling but not critical
            return parsed.overall_quality >= 4 && Array.isArray(parsed.issues);
          } catch { return false; }
        }
      },
    ],
  },

  // ============================================================================
  // EHG-SPECIFIC TESTS (Frontend AI features, user-facing content)
  // ============================================================================

  /**
   * Content Generation Test - Chairman insights, navigation suggestions
   * Tests: Natural language quality, business context understanding
   * Maps to: EHG/src/lib/ai/ai-service-manager.ts, supabase/functions/ai-generate
   */
  content: {
    name: 'Content Generation Test',
    description: 'Test user-facing content generation quality (EHG frontend)',
    category: 'ehg',
    system: `You are an executive business advisor for a venture capital portfolio management system.
Generate clear, professional, actionable insights. Write in a confident but accessible tone.
Avoid jargon. Focus on strategic implications and recommended actions.`,
    cases: [
      {
        user: `Generate a chairman insight for this portfolio data:
- Total ventures: 12
- Active investments: $4.2M
- Average runway: 8 months
- 2 ventures flagged as high-risk
- Q3 revenue growth: 15% across portfolio`,
        validate: (r) => {
          const text = r.trim().toLowerCase();
          // Must mention key data points and provide actionable insight
          const mentionsData = text.includes('12') || text.includes('venture') || text.includes('portfolio');
          const mentionsRisk = text.includes('risk') || text.includes('runway') || text.includes('flagged');
          const hasAction = text.includes('recommend') || text.includes('consider') || text.includes('should') || text.includes('focus');
          const minLength = text.length >= 100; // Substantive response
          const maxLength = text.length <= 1000; // Not rambling
          return mentionsData && mentionsRisk && hasAction && minLength && maxLength;
        }
      },
      {
        user: `Write a navigation suggestion for a user who just viewed:
1. Security audit page (3 minutes)
2. Two venture detail pages
3. Risk assessment dashboard
What should they look at next?`,
        validate: (r) => {
          const text = r.trim().toLowerCase();
          // Must suggest a logical next step based on context
          const hasSuggestion = text.includes('suggest') || text.includes('consider') || text.includes('might') || text.includes('next') || text.includes('recommend');
          const contextAware = text.includes('security') || text.includes('risk') || text.includes('venture') || text.includes('audit');
          const minLength = text.length >= 50;
          return hasSuggestion && contextAware && minLength;
        }
      },
      {
        user: `Create a brief executive summary for a board meeting:
- 3 new investments this quarter
- 1 exit (2.3x return)
- Pipeline: 15 deals in evaluation
- Key concern: market volatility affecting Series A valuations`,
        validate: (r) => {
          const text = r.trim().toLowerCase();
          // Executive summary quality checks
          const mentionsInvestments = text.includes('investment') || text.includes('deal') || text.includes('portfolio');
          const mentionsExit = text.includes('exit') || text.includes('return') || text.includes('2.3');
          const mentionsConcern = text.includes('volatility') || text.includes('valuation') || text.includes('concern') || text.includes('risk');
          const professionalTone = !text.includes('!') || text.split('!').length <= 2; // Not overly enthusiastic
          return mentionsInvestments && mentionsExit && mentionsConcern && professionalTone;
        }
      },
    ],
  },

  /**
   * Analytics Reasoning Test - Portfolio analysis, trend interpretation
   * Tests: Data interpretation, analytical reasoning, structured output
   * Maps to: EHG/src/lib/ai/ai-analytics-engine.ts
   */
  analytics: {
    name: 'Analytics Reasoning Test',
    description: 'Test analytical reasoning for portfolio/business data (EHG analytics engine)',
    category: 'ehg',
    system: `You are a data analyst for venture capital portfolios.
Analyze the provided data and output JSON with:
- summary: 2-3 sentence overview
- trends: array of identified trends (at least 2)
- risks: array of risk factors
- opportunities: array of opportunities
- recommendation: single most important action`,
    cases: [
      {
        user: `Analyze this quarterly data:
Q1: Revenue $120K, Burn $80K, Headcount 12
Q2: Revenue $145K, Burn $95K, Headcount 15
Q3: Revenue $138K, Burn $110K, Headcount 18
Q4: Revenue $160K, Burn $125K, Headcount 20`,
        validate: (r) => {
          try {
            const parsed = JSON.parse(r.trim());
            return parsed.summary &&
                   Array.isArray(parsed.trends) && parsed.trends.length >= 2 &&
                   Array.isArray(parsed.risks) &&
                   Array.isArray(parsed.opportunities) &&
                   parsed.recommendation;
          } catch { return false; }
        }
      },
      {
        user: `Compare these two ventures:
Venture A: SaaS, $2M ARR, 40% growth, 18mo runway, Series A
Venture B: Marketplace, $800K GMV, 120% growth, 6mo runway, Seed
Which is performing better and why?`,
        validate: (r) => {
          try {
            const parsed = JSON.parse(r.trim());
            // Should have analysis with clear reasoning
            const hasSummary = parsed.summary && parsed.summary.length > 50;
            const hasTrends = Array.isArray(parsed.trends) && parsed.trends.length >= 1;
            const hasRec = parsed.recommendation && parsed.recommendation.length > 20;
            return hasSummary && hasTrends && hasRec;
          } catch { return false; }
        }
      },
    ],
  },

  /**
   * Research Simulation Test - Creative data generation for market research
   * Tests: Realistic data generation, domain knowledge, structure
   * Maps to: EHG/agent-platform/app/tools/llm_tools.py, llm_fallback.py
   */
  research: {
    name: 'Research Simulation Test',
    description: 'Test research data generation quality (EHG agent platform)',
    category: 'ehg',
    system: `You are a market research analyst generating realistic venture capital data.
Generate plausible, internally consistent data. Use realistic company names, valuations, and metrics.
Output must be valid JSON.`,
    cases: [
      {
        user: `Generate funding round data for a B2B SaaS startup in the HR tech space.
Include: company_name, round_type, amount_raised, valuation, lead_investor, key_metrics`,
        validate: (r) => {
          try {
            const parsed = JSON.parse(r.trim());
            const hasRequired = parsed.company_name && parsed.round_type &&
                               (parsed.amount_raised || parsed.amount) &&
                               parsed.valuation;
            // Sanity check: valuation should be higher than amount raised
            const valuation = parseInt(String(parsed.valuation).replace(/[^0-9]/g, '')) || 0;
            const raised = parseInt(String(parsed.amount_raised || parsed.amount).replace(/[^0-9]/g, '')) || 0;
            const sensibleValuation = valuation > raised || raised === 0;
            return hasRequired && sensibleValuation;
          } catch { return false; }
        }
      },
      {
        user: `Generate market sizing data for the "AI-powered recruitment" market.
Include: tam, sam, som, cagr, key_trends (array of 3), top_players (array of 3)`,
        validate: (r) => {
          try {
            const parsed = JSON.parse(r.trim());
            // TAM > SAM > SOM check
            const tam = parseInt(String(parsed.tam).replace(/[^0-9]/g, '')) || 0;
            const sam = parseInt(String(parsed.sam).replace(/[^0-9]/g, '')) || 0;
            const som = parseInt(String(parsed.som).replace(/[^0-9]/g, '')) || 0;
            const sensibleSizing = tam >= sam && sam >= som;
            const hasTrends = Array.isArray(parsed.key_trends) && parsed.key_trends.length >= 2;
            const hasPlayers = Array.isArray(parsed.top_players) && parsed.top_players.length >= 2;
            return sensibleSizing && hasTrends && hasPlayers && parsed.cagr;
          } catch { return false; }
        }
      },
      {
        user: `Simulate a competitive analysis for a fintech startup entering the "expense management" space.
Include: market_overview, competitors (array with name, strengths, weaknesses), entry_barriers, opportunity_score (1-10)`,
        validate: (r) => {
          try {
            const parsed = JSON.parse(r.trim());
            const hasOverview = parsed.market_overview && parsed.market_overview.length > 30;
            const hasCompetitors = Array.isArray(parsed.competitors) &&
                                   parsed.competitors.length >= 2 &&
                                   parsed.competitors.every(c => c.name && c.strengths);
            const hasScore = typeof parsed.opportunity_score === 'number' &&
                            parsed.opportunity_score >= 1 &&
                            parsed.opportunity_score <= 10;
            return hasOverview && hasCompetitors && hasScore;
          } catch { return false; }
        }
      },
    ],
  },

  /**
   * Pain Point Validation Test - Qualitative assessment, market validation
   * Tests: Problem understanding, validation logic, structured reasoning
   * Maps to: EHG/agent-platform/app/utils/llm_fallback.py (fallback_pain_point_research)
   */
  painpoint: {
    name: 'Pain Point Validation Test',
    description: 'Test pain point research and validation (EHG agent fallback)',
    category: 'ehg',
    system: `You are a startup advisor validating market pain points.
Analyze the described problem and output JSON with:
- pain_point_valid: boolean
- severity: "critical", "significant", "moderate", or "minor"
- target_segment: who has this problem
- willingness_to_pay: "high", "medium", "low"
- existing_solutions: array of current alternatives
- validation_confidence: 1-10 score with reasoning`,
    cases: [
      {
        user: `Validate this pain point: "Small business owners spend 10+ hours per week on manual bookkeeping because existing accounting software is too complex for non-accountants."`,
        validate: (r) => {
          try {
            const parsed = JSON.parse(r.trim());
            return typeof parsed.pain_point_valid === 'boolean' &&
                   ['critical', 'significant', 'moderate', 'minor'].includes(parsed.severity) &&
                   parsed.target_segment &&
                   ['high', 'medium', 'low'].includes(parsed.willingness_to_pay) &&
                   Array.isArray(parsed.existing_solutions) &&
                   typeof parsed.validation_confidence === 'number';
          } catch { return false; }
        }
      },
      {
        user: `Validate this pain point: "Enterprise CTOs struggle to track software license compliance across 500+ SaaS tools, leading to audit failures and overspending."`,
        validate: (r) => {
          try {
            const parsed = JSON.parse(r.trim());
            // This is a real enterprise problem - should validate as significant+
            const validSeverity = ['critical', 'significant'].includes(parsed.severity);
            const hasExistingSolutions = parsed.existing_solutions && parsed.existing_solutions.length >= 1;
            return parsed.pain_point_valid === true && validSeverity && hasExistingSolutions;
          } catch { return false; }
        }
      },
    ],
  },
};

// ============================================================================
// OLLAMA API FUNCTIONS
// ============================================================================

/**
 * Get list of installed Ollama models
 */
async function getInstalledModels() {
  try {
    const response = await fetch(`${CONFIG.ollamaBaseUrl}/api/tags`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.models.map(m => m.name);
  } catch (error) {
    console.error('Failed to get model list. Is Ollama running?');
    console.error(`Tried: ${CONFIG.ollamaBaseUrl}/api/tags`);
    throw error;
  }
}

/**
 * Check if Ollama server is running
 */
async function checkOllamaHealth() {
  try {
    const response = await fetch(`${CONFIG.ollamaBaseUrl}/api/version`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return { healthy: true, version: data.version };
  } catch (error) {
    return { healthy: false, error: error.message };
  }
}

/**
 * Call Ollama chat completion API (OpenAI-compatible endpoint)
 */
async function chatCompletion(model, systemPrompt, userPrompt, options = {}) {
  const startTime = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || CONFIG.timeoutMs);

  try {
    const response = await fetch(`${CONFIG.ollamaBaseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ollama', // Required but ignored
      },
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens || 256,
        temperature: options.temperature ?? 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        ...(options.format === 'json' && { response_format: { type: 'json_object' } }),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const data = await response.json();
    const endTime = Date.now();

    return {
      content: data.choices[0].message.content,
      model: data.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      durationMs: endTime - startTime,
      tokensPerSecond: data.usage?.completion_tokens
        ? (data.usage.completion_tokens / ((endTime - startTime) / 1000)).toFixed(2)
        : null,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  }
}

// ============================================================================
// BENCHMARK FUNCTIONS
// ============================================================================

/**
 * Warm up model to ensure it's loaded in VRAM
 */
async function warmupModel(model, verbose) {
  if (verbose) console.log(`  Warming up ${model}...`);
  try {
    await chatCompletion(model, 'You are helpful.', 'Say hello.', { maxTokens: 10 });
  } catch (error) {
    console.warn(`  Warning: Warmup failed for ${model}: ${error.message}`);
  }
}

/**
 * Run speed benchmark
 */
async function benchmarkSpeed(model, iterations, verbose) {
  const results = [];
  const test = TEST_PROMPTS.speed;

  for (let i = 0; i < iterations; i++) {
    if (verbose) console.log(`  Speed test iteration ${i + 1}/${iterations}`);
    try {
      const result = await chatCompletion(model, test.system, test.user, { maxTokens: 100 });
      results.push({
        iteration: i + 1,
        durationMs: result.durationMs,
        tokensPerSecond: parseFloat(result.tokensPerSecond) || 0,
        completionTokens: result.usage.completionTokens,
        success: true,
      });
    } catch (error) {
      results.push({
        iteration: i + 1,
        error: error.message,
        success: false,
      });
    }
  }

  const successful = results.filter(r => r.success);
  return {
    test: 'speed',
    iterations: iterations,
    successful: successful.length,
    failed: results.length - successful.length,
    avgDurationMs: successful.length ?
      Math.round(successful.reduce((a, r) => a + r.durationMs, 0) / successful.length) : null,
    avgTokensPerSecond: successful.length ?
      parseFloat((successful.reduce((a, r) => a + r.tokensPerSecond, 0) / successful.length).toFixed(2)) : null,
    minTokensPerSecond: successful.length ?
      Math.min(...successful.map(r => r.tokensPerSecond)) : null,
    maxTokensPerSecond: successful.length ?
      Math.max(...successful.map(r => r.tokensPerSecond)) : null,
    details: results,
  };
}

/**
 * Run classification benchmark
 */
async function benchmarkClassify(model, iterations, verbose) {
  const results = [];
  const test = TEST_PROMPTS.classify;

  for (const testCase of test.cases) {
    const caseResults = [];
    for (let i = 0; i < iterations; i++) {
      if (verbose) console.log(`  Classify "${testCase.user.substring(0, 30)}..." iteration ${i + 1}`);
      try {
        const result = await chatCompletion(model, test.system, testCase.user, { maxTokens: 10 });
        const response = result.content.trim().toUpperCase();
        const correct = response === testCase.expected || response.includes(testCase.expected);
        caseResults.push({
          iteration: i + 1,
          response,
          expected: testCase.expected,
          correct,
          durationMs: result.durationMs,
          success: true,
        });
      } catch (error) {
        caseResults.push({
          iteration: i + 1,
          error: error.message,
          success: false,
          correct: false,
        });
      }
    }
    results.push({
      prompt: testCase.user,
      expected: testCase.expected,
      results: caseResults,
      accuracy: caseResults.filter(r => r.correct).length / caseResults.length,
    });
  }

  const overallAccuracy = results.reduce((a, r) => a + r.accuracy, 0) / results.length;
  return {
    test: 'classify',
    cases: results.length,
    iterationsPerCase: iterations,
    overallAccuracy: parseFloat((overallAccuracy * 100).toFixed(1)),
    details: results,
  };
}

/**
 * Run JSON output benchmark
 */
async function benchmarkJson(model, iterations, verbose) {
  const results = [];
  const test = TEST_PROMPTS.json;

  for (let i = 0; i < iterations; i++) {
    if (verbose) console.log(`  JSON test iteration ${i + 1}/${iterations}`);
    try {
      // Try without format flag first
      const result = await chatCompletion(model, test.system, test.user, { maxTokens: 100 });
      const valid = test.validate(result.content);
      results.push({
        iteration: i + 1,
        response: result.content.substring(0, 200),
        valid,
        durationMs: result.durationMs,
        success: true,
      });
    } catch (error) {
      results.push({
        iteration: i + 1,
        error: error.message,
        valid: false,
        success: false,
      });
    }
  }

  const validCount = results.filter(r => r.valid).length;
  return {
    test: 'json',
    iterations,
    validOutputs: validCount,
    reliability: parseFloat(((validCount / iterations) * 100).toFixed(1)),
    details: results,
  };
}

/**
 * Run instruction following benchmark
 */
async function benchmarkInstruct(model, iterations, verbose) {
  const results = [];
  const test = TEST_PROMPTS.instruct;

  for (const testCase of test.cases) {
    const caseResults = [];
    for (let i = 0; i < iterations; i++) {
      if (verbose) console.log(`  Instruct "${testCase.user.substring(0, 30)}..." iteration ${i + 1}`);
      try {
        const result = await chatCompletion(model, test.system, testCase.user, { maxTokens: 50 });
        const passed = testCase.validate(result.content);
        caseResults.push({
          iteration: i + 1,
          response: result.content.substring(0, 100),
          passed,
          durationMs: result.durationMs,
          success: true,
        });
      } catch (error) {
        caseResults.push({
          iteration: i + 1,
          error: error.message,
          passed: false,
          success: false,
        });
      }
    }
    results.push({
      prompt: testCase.user,
      results: caseResults,
      passRate: caseResults.filter(r => r.passed).length / caseResults.length,
    });
  }

  const overallPassRate = results.reduce((a, r) => a + r.passRate, 0) / results.length;
  return {
    test: 'instruct',
    cases: results.length,
    iterationsPerCase: iterations,
    overallPassRate: parseFloat((overallPassRate * 100).toFixed(1)),
    details: results,
  };
}

/**
 * Generic agent workload benchmark
 * Used for: rca, design, quickfix, schema, review tests
 */
async function benchmarkAgentWorkload(testKey, model, iterations, verbose) {
  const results = [];
  const test = TEST_PROMPTS[testKey];

  if (!test || !test.cases) {
    throw new Error(`Unknown or invalid test: ${testKey}`);
  }

  for (const testCase of test.cases) {
    const caseResults = [];
    for (let i = 0; i < iterations; i++) {
      if (verbose) console.log(`  ${test.name} "${testCase.user.substring(0, 40)}..." iteration ${i + 1}`);
      try {
        // Agent tests typically need more tokens for structured output
        const result = await chatCompletion(model, test.system, testCase.user, { maxTokens: 500 });
        const passed = testCase.validate(result.content);
        caseResults.push({
          iteration: i + 1,
          response: result.content.substring(0, 300),
          passed,
          durationMs: result.durationMs,
          success: true,
        });
      } catch (error) {
        caseResults.push({
          iteration: i + 1,
          error: error.message,
          passed: false,
          success: false,
        });
      }
    }
    results.push({
      prompt: testCase.user.substring(0, 100),
      results: caseResults,
      passRate: caseResults.filter(r => r.passed).length / caseResults.length,
    });
  }

  const overallPassRate = results.reduce((a, r) => a + r.passRate, 0) / results.length;
  const avgDuration = results.flatMap(r => r.results)
    .filter(r => r.success)
    .reduce((a, r, _, arr) => a + r.durationMs / arr.length, 0);

  return {
    test: testKey,
    agentMatch: test.agentMatch || null,
    cases: results.length,
    iterationsPerCase: iterations,
    overallPassRate: parseFloat((overallPassRate * 100).toFixed(1)),
    avgDurationMs: Math.round(avgDuration),
    details: results,
  };
}

// ============================================================================
// RESULTS FORMATTING
// ============================================================================

/**
 * Print results as a console table
 */
function printResultsTable(allResults) {
  console.log('\n' + '='.repeat(120));
  console.log('BENCHMARK RESULTS SUMMARY');
  console.log('='.repeat(120));

  // Check if agent tests were run
  const hasAgentTests = allResults.some(r =>
    r.results.rca || r.results.design || r.results.quickfix || r.results.schema || r.results.review
  );

  // Core results header
  console.log('\n--- CORE TESTS ---');
  console.log(
    'Model'.padEnd(25) +
    'Speed (tok/s)'.padEnd(15) +
    'Classify %'.padEnd(12) +
    'JSON %'.padEnd(10) +
    'Instruct %'.padEnd(12) +
    'Recommendation'
  );
  console.log('-'.repeat(100));

  // Calculate scores and sort
  const scored = allResults.map(r => {
    const speed = r.results.speed?.avgTokensPerSecond || 0;
    const classify = r.results.classify?.overallAccuracy || 0;
    const json = r.results.json?.reliability || 0;
    const instruct = r.results.instruct?.overallPassRate || 0;

    // Weighted score: speed matters most for Haiku replacement
    const score = (speed * 0.3) + (classify * 0.3) + (json * 0.2) + (instruct * 0.2);

    return { ...r, speed, classify, json, instruct, score };
  }).sort((a, b) => b.score - a.score);

  // Print core rows
  scored.forEach((r, i) => {
    const rec = i === 0 ? 'RECOMMENDED' : (r.score > 50 ? 'Viable' : 'Not recommended');
    console.log(
      r.model.padEnd(25) +
      (r.speed?.toFixed(1) || 'N/A').toString().padEnd(15) +
      (r.classify?.toFixed(1) || 'N/A').toString().padEnd(12) +
      (r.json?.toFixed(1) || 'N/A').toString().padEnd(10) +
      (r.instruct?.toFixed(1) || 'N/A').toString().padEnd(12) +
      rec
    );
  });

  // Agent-specific results (if run)
  if (hasAgentTests) {
    console.log('\n--- AGENT WORKLOAD TESTS ---');
    console.log(
      'Model'.padEnd(25) +
      'RCA %'.padEnd(10) +
      'Design %'.padEnd(10) +
      'QuickFix %'.padEnd(12) +
      'Schema %'.padEnd(10) +
      'Review %'.padEnd(10) +
      'Best For'
    );
    console.log('-'.repeat(100));

    // Calculate agent scores
    const agentScored = allResults.map(r => {
      const rca = r.results.rca?.overallPassRate || 0;
      const design = r.results.design?.overallPassRate || 0;
      const quickfix = r.results.quickfix?.overallPassRate || 0;
      const schema = r.results.schema?.overallPassRate || 0;
      const review = r.results.review?.overallPassRate || 0;

      // Find best task for this model
      const tasks = [
        { name: 'RCA', score: rca },
        { name: 'Design', score: design },
        { name: 'QuickFix', score: quickfix },
        { name: 'Schema', score: schema },
        { name: 'Review', score: review },
      ].filter(t => t.score > 0);

      const bestTask = tasks.sort((a, b) => b.score - a.score)[0];

      return { ...r, rca, design, quickfix, schema, review, bestTask };
    });

    agentScored.forEach(r => {
      const best = r.bestTask ? `${r.bestTask.name} (${r.bestTask.score.toFixed(0)}%)` : 'N/A';
      console.log(
        r.model.padEnd(25) +
        (r.rca?.toFixed(0) || '-').toString().padEnd(10) +
        (r.design?.toFixed(0) || '-').toString().padEnd(10) +
        (r.quickfix?.toFixed(0) || '-').toString().padEnd(12) +
        (r.schema?.toFixed(0) || '-').toString().padEnd(10) +
        (r.review?.toFixed(0) || '-').toString().padEnd(10) +
        best
      );
    });

    // Model-to-Agent routing recommendations
    console.log('\n--- RECOMMENDED AGENT ROUTING ---');
    const routingRecs = {};
    ['rca', 'design', 'quickfix', 'schema', 'review'].forEach(task => {
      const best = agentScored
        .filter(r => r.results[task]?.overallPassRate > 50)
        .sort((a, b) => (b.results[task]?.overallPassRate || 0) - (a.results[task]?.overallPassRate || 0))[0];
      if (best) {
        const agentName = TEST_PROMPTS[task]?.agentMatch || task;
        routingRecs[agentName] = {
          model: best.model,
          score: best.results[task].overallPassRate,
        };
      }
    });

    Object.entries(routingRecs).forEach(([agent, rec]) => {
      console.log(`  ${agent.padEnd(20)} → ${rec.model} (${rec.score.toFixed(0)}%)`);
    });
  }

  // Check if EHG tests were run
  const hasEhgTests = allResults.some(r =>
    r.results.content || r.results.analytics || r.results.research || r.results.painpoint
  );

  if (hasEhgTests) {
    console.log('\n--- EHG FRONTEND TESTS (User-Facing AI Features) ---');
    console.log(
      'Model'.padEnd(25) +
      'Content %'.padEnd(12) +
      'Analytics %'.padEnd(13) +
      'Research %'.padEnd(12) +
      'PainPoint %'.padEnd(13) +
      'EHG Ready?'
    );
    console.log('-'.repeat(100));

    // Calculate EHG scores
    const ehgScored = allResults.map(r => {
      const content = r.results.content?.overallPassRate || 0;
      const analytics = r.results.analytics?.overallPassRate || 0;
      const research = r.results.research?.overallPassRate || 0;
      const painpoint = r.results.painpoint?.overallPassRate || 0;

      // EHG readiness: content is most critical for user-facing
      const ehgScore = (content * 0.4) + (analytics * 0.25) + (research * 0.2) + (painpoint * 0.15);
      const isEhgReady = content >= 60 && ehgScore >= 50;

      return { ...r, content, analytics, research, painpoint, ehgScore, isEhgReady };
    });

    ehgScored.forEach(r => {
      const ready = r.isEhgReady ? '✅ YES' : (r.ehgScore >= 40 ? '⚠️ PARTIAL' : '❌ NO');
      console.log(
        r.model.padEnd(25) +
        (r.content?.toFixed(0) || '-').toString().padEnd(12) +
        (r.analytics?.toFixed(0) || '-').toString().padEnd(13) +
        (r.research?.toFixed(0) || '-').toString().padEnd(12) +
        (r.painpoint?.toFixed(0) || '-').toString().padEnd(13) +
        ready
      );
    });

    // EHG task routing recommendations
    console.log('\n--- RECOMMENDED EHG TASK ROUTING ---');
    const ehgRoutingRecs = {};
    ['content', 'analytics', 'research', 'painpoint'].forEach(task => {
      const best = ehgScored
        .filter(r => r.results[task]?.overallPassRate > 50)
        .sort((a, b) => (b.results[task]?.overallPassRate || 0) - (a.results[task]?.overallPassRate || 0))[0];
      if (best) {
        const taskLabels = {
          content: 'Chairman Insights / UI Content',
          analytics: 'Portfolio Analytics Engine',
          research: 'Agent Research Simulation',
          painpoint: 'Pain Point Validation',
        };
        ehgRoutingRecs[taskLabels[task] || task] = {
          model: best.model,
          score: best.results[task].overallPassRate,
        };
      }
    });

    if (Object.keys(ehgRoutingRecs).length > 0) {
      Object.entries(ehgRoutingRecs).forEach(([task, rec]) => {
        console.log(`  ${task.padEnd(30)} → ${rec.model} (${rec.score.toFixed(0)}%)`);
      });
    } else {
      console.log('  ⚠️  No models passed EHG tests with >50% accuracy');
      console.log('  Recommendation: Keep user-facing AI features on cloud models');
    }

    // Warning about user-facing quality
    const anyEhgReady = ehgScored.some(r => r.isEhgReady);
    if (!anyEhgReady) {
      console.log('\n⚠️  CAUTION: No local models achieved EHG-ready status.');
      console.log('   For user-facing content generation, continue using cloud models.');
      console.log('   Consider local models only for internal/non-user-facing tasks.');
    }
  }

  console.log('\n' + '='.repeat(120));
  console.log('\nLegend:');
  console.log('  Speed: Average tokens per second (higher = faster)');
  console.log('  Classify %: Classification accuracy');
  console.log('  JSON %: Valid JSON output rate');
  console.log('  Instruct %: Instruction following rate');
  if (hasAgentTests) {
    console.log('  RCA %: Root cause analysis quality');
    console.log('  Design %: Design decision / trade-off quality');
    console.log('  QuickFix %: Bug triage accuracy');
    console.log('  Schema %: Database schema generation quality');
    console.log('  Review %: Code review issue detection');
  }
  if (hasEhgTests) {
    console.log('  Content %: User-facing content generation quality');
    console.log('  Analytics %: Portfolio/business analytics reasoning');
    console.log('  Research %: Market research data simulation');
    console.log('  PainPoint %: Pain point validation quality');
    console.log('  EHG Ready: ✅ = Safe for user-facing, ⚠️ = Internal only, ❌ = Not recommended');
  }
  console.log('');
}

/**
 * Save detailed results to JSON file
 */
function saveResults(allResults, outputPath) {
  const resultsDir = join(__dirname, 'results');
  if (!existsSync(resultsDir)) {
    mkdirSync(resultsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = outputPath || join(resultsDir, `benchmark-${timestamp}.json`);

  const output = {
    metadata: {
      timestamp: new Date().toISOString(),
      ollamaUrl: CONFIG.ollamaBaseUrl,
      toolVersion: '1.0.0',
    },
    results: allResults,
  };

  writeFileSync(filename, JSON.stringify(output, null, 2));
  console.log(`\nDetailed results saved to: ${filename}`);
  return filename;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  // Define available task categories
  const CORE_TASKS = ['speed', 'classify', 'json', 'instruct'];
  const AGENT_TASKS = ['rca', 'design', 'quickfix', 'schema', 'review'];
  const EHG_TASKS = ['content', 'analytics', 'research', 'painpoint'];
  const ALL_TASKS = [...CORE_TASKS, ...AGENT_TASKS, ...EHG_TASKS];

  // Parse arguments
  const options = {
    models: null,
    tasks: CORE_TASKS, // Default to core tests only for speed
    iterations: CONFIG.defaultIterations,
    output: null,
    verbose: args.includes('--verbose'),
    help: args.includes('--help'),
    includeAgentTests: args.includes('--agents'), // Include agent-specific tests
    includeEhgTests: args.includes('--ehg'), // Include EHG frontend tests
  };

  // If --agents flag, add agent tests
  if (options.includeAgentTests) {
    options.tasks = [...CORE_TASKS, ...AGENT_TASKS];
  }

  // If --ehg flag, add EHG-specific tests
  if (options.includeEhgTests) {
    options.tasks = [...options.tasks, ...EHG_TASKS];
  }

  // If both --agents and --ehg, include all
  if (options.includeAgentTests && options.includeEhgTests) {
    options.tasks = ALL_TASKS;
  }

  if (options.help) {
    console.log(`
Ollama Local Model Benchmark Tool

Usage: node scripts/benchmarks/ollama-model-benchmark.mjs [options]

Options:
  --models <list>     Comma-separated list of models to test (default: all installed)
  --tasks <list>      Tasks to run (default: core tasks only)
  --agents            Include EHG_Engineer agent tests (rca, design, quickfix, schema, review)
  --ehg               Include EHG frontend tests (content, analytics, research, painpoint)
  --iterations <n>    Number of iterations per test (default: 3)
  --output <file>     Output JSON file path
  --verbose           Show detailed output during tests
  --help              Show this help message

Available Tasks:
  Core (EHG_Engineer):   speed, classify, json, instruct
  Agent (EHG_Engineer):  rca, design, quickfix, schema, review
  EHG (Frontend):        content, analytics, research, painpoint

Test Categories:
  Core tests validate basic LLM capabilities (classification, JSON output, instruction following)
  Agent tests validate EHG_Engineer sub-agent workloads (database schema, code review, RCA)
  EHG tests validate frontend AI features (content generation, analytics, research simulation)

Examples:
  # Run core tests only (fast)
  node scripts/benchmarks/ollama-model-benchmark.mjs

  # Run core + EHG_Engineer agent tests
  node scripts/benchmarks/ollama-model-benchmark.mjs --agents

  # Run core + EHG frontend tests (RECOMMENDED for EHG integration)
  node scripts/benchmarks/ollama-model-benchmark.mjs --ehg

  # Run ALL tests (core + agents + EHG)
  node scripts/benchmarks/ollama-model-benchmark.mjs --agents --ehg

  # Test specific models with EHG tests
  node scripts/benchmarks/ollama-model-benchmark.mjs --ehg --models qwen3-coder:30b,llama3.2:3b

  # Run specific EHG tests only
  node scripts/benchmarks/ollama-model-benchmark.mjs --tasks content,analytics --verbose

  # Full benchmark for multi-repo model routing
  node scripts/benchmarks/ollama-model-benchmark.mjs --agents --ehg --iterations 5
`);
    process.exit(0);
  }

  // Parse specific arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--models' && args[i + 1]) {
      options.models = args[i + 1].split(',').map(m => m.trim());
    }
    if (args[i] === '--tasks' && args[i + 1]) {
      options.tasks = args[i + 1].split(',').map(t => t.trim());
    }
    if (args[i] === '--iterations' && args[i + 1]) {
      options.iterations = parseInt(args[i + 1], 10);
    }
    if (args[i] === '--output' && args[i + 1]) {
      options.output = args[i + 1];
    }
  }

  console.log('='.repeat(60));
  console.log('OLLAMA LOCAL MODEL BENCHMARK');
  console.log('='.repeat(60));

  // Check Ollama health
  console.log('\nChecking Ollama server...');
  const health = await checkOllamaHealth();
  if (!health.healthy) {
    console.error(`Ollama not running at ${CONFIG.ollamaBaseUrl}`);
    console.error('Start Ollama with: ollama serve');
    process.exit(1);
  }
  console.log(`Ollama v${health.version} running at ${CONFIG.ollamaBaseUrl}`);

  // Get models to test
  const installedModels = await getInstalledModels();
  const modelsToTest = options.models || installedModels;

  console.log(`\nModels to test: ${modelsToTest.join(', ')}`);
  console.log(`Tasks: ${options.tasks.join(', ')}`);
  console.log(`Iterations per test: ${options.iterations}`);

  // Run benchmarks
  const allResults = [];

  for (const model of modelsToTest) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Testing: ${model}`);
    console.log('─'.repeat(60));

    // Warmup
    await warmupModel(model, options.verbose);

    const modelResults = { model, results: {} };

    if (options.tasks.includes('speed')) {
      console.log('\n[Speed Test]');
      modelResults.results.speed = await benchmarkSpeed(model, options.iterations, options.verbose);
      console.log(`  Avg: ${modelResults.results.speed.avgTokensPerSecond} tok/s`);
    }

    if (options.tasks.includes('classify')) {
      console.log('\n[Classification Test]');
      modelResults.results.classify = await benchmarkClassify(model, options.iterations, options.verbose);
      console.log(`  Accuracy: ${modelResults.results.classify.overallAccuracy}%`);
    }

    if (options.tasks.includes('json')) {
      console.log('\n[JSON Output Test]');
      modelResults.results.json = await benchmarkJson(model, options.iterations, options.verbose);
      console.log(`  Reliability: ${modelResults.results.json.reliability}%`);
    }

    if (options.tasks.includes('instruct')) {
      console.log('\n[Instruction Following Test]');
      modelResults.results.instruct = await benchmarkInstruct(model, options.iterations, options.verbose);
      console.log(`  Pass Rate: ${modelResults.results.instruct.overallPassRate}%`);
    }

    // Agent-specific tests (EHG_Engineer)
    const agentTests = ['rca', 'design', 'quickfix', 'schema', 'review'];
    for (const agentTest of agentTests) {
      if (options.tasks.includes(agentTest)) {
        const testDef = TEST_PROMPTS[agentTest];
        console.log(`\n[${testDef.name}]`);
        modelResults.results[agentTest] = await benchmarkAgentWorkload(agentTest, model, options.iterations, options.verbose);
        console.log(`  Pass Rate: ${modelResults.results[agentTest].overallPassRate}%`);
        if (testDef.agentMatch) {
          console.log(`  → Maps to: ${testDef.agentMatch}`);
        }
      }
    }

    // EHG-specific tests (Frontend AI features)
    const ehgTests = ['content', 'analytics', 'research', 'painpoint'];
    for (const ehgTest of ehgTests) {
      if (options.tasks.includes(ehgTest)) {
        const testDef = TEST_PROMPTS[ehgTest];
        console.log(`\n[${testDef.name}] (EHG Frontend)`);
        modelResults.results[ehgTest] = await benchmarkAgentWorkload(ehgTest, model, options.iterations, options.verbose);
        console.log(`  Pass Rate: ${modelResults.results[ehgTest].overallPassRate}%`);
      }
    }

    allResults.push(modelResults);
  }

  // Print summary
  printResultsTable(allResults);

  // Save results
  saveResults(allResults, options.output);

  console.log('Benchmark complete!');
}

main().catch(error => {
  console.error('Benchmark failed:', error.message);
  process.exit(1);
});
