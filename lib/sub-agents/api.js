#!/usr/bin/env node
/**
 * 🌐 API Sub-Agent - API Architecture & Design Review
 *
 * Purpose:
 * - Review REST/GraphQL endpoint design
 * - Validate API architecture and best practices
 * - Assess versioning strategies and documentation
 * - Ensure security and performance standards
 *
 * Evaluation Areas:
 * 1. Design Quality - RESTful/GraphQL principles adherence
 * 2. Performance - Response time, payload optimization
 * 3. Security - Authentication, authorization, validation
 * 4. Documentation - OpenAPI spec, examples, completeness
 *
 * Activation: Conditional (API-related keywords detected)
 * Blocking: FAIL verdict blocks PLAN→EXEC handoff
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

/**
 * Execute API Architecture Review
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent configuration
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Review results
 */
export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n🌐 API ARCHITECTURE REVIEW - Executing for ${sdId}\n`);

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const results = {
    sd_id: sdId,
    sub_agent_code: 'API',
    timestamp: new Date().toISOString(),
    verdict: 'PASS',
    confidence_score: 0,
    summary: '',
    findings: {
      design_quality_score: 0,
      performance_score: 0,
      security_score: 0,
      documentation_score: 0
    },
    recommendations: [],
    blockers: [],
    warnings: []
  };

  try {
    // ============================================
    // 1. FETCH SD AND PRD
    // ============================================
    console.log('📋 Step 1: Fetching SD and PRD...');

    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (sdError || !sd) {
      throw new Error(`Failed to fetch SD: ${sdError?.message || 'Not found'}`);
    }

    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('sd_id', sdId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    console.log(`   ✓ SD: ${sd.title}`);
    if (prd) {
      console.log(`   ✓ PRD: ${prd.title}`);
    }

    // ============================================
    // 2. DETECT API TYPE
    // ============================================
    console.log('\n🔍 Step 2: Detecting API type and endpoints...');
    const apiInfo = detectAPIType(sd, prd);

    if (!apiInfo.hasAPI) {
      console.log('   ℹ️  No API implementation detected - skipping detailed review');
      results.verdict = 'PASS';
      results.confidence_score = 100;
      results.summary = 'No API endpoints detected in this SD - review not applicable';
      return results;
    }

    console.log(`   ✓ API Type: ${apiInfo.type}`);
    console.log(`   ✓ Endpoints detected: ${apiInfo.endpoints.length}`);

    // ============================================
    // 3. SCAN CODEBASE FOR API FILES
    // ============================================
    console.log('\n📂 Step 3: Scanning codebase for API implementations...');
    const apiFiles = await scanAPIFiles();
    console.log(`   ✓ Found ${apiFiles.length} API-related files`);

    // ============================================
    // 4. EVALUATE API DESIGN
    // ============================================
    console.log('\n📐 Step 4: Evaluating API design quality...');
    const designScore = await evaluateAPIDesign(apiFiles, apiInfo, prd);
    results.findings.design_quality_score = designScore.score;
    results.recommendations.push(...designScore.recommendations);
    results.blockers.push(...designScore.blockers);
    console.log(`   Design Score: ${designScore.score}/10`);

    // ============================================
    // 5. EVALUATE PERFORMANCE
    // ============================================
    console.log('\n⚡ Step 5: Evaluating API performance patterns...');
    const performanceScore = await evaluateAPIPerformance(apiFiles, apiInfo);
    results.findings.performance_score = performanceScore.score;
    results.recommendations.push(...performanceScore.recommendations);
    console.log(`   Performance Score: ${performanceScore.score}/10`);

    // ============================================
    // 6. EVALUATE SECURITY
    // ============================================
    console.log('\n🔒 Step 6: Evaluating API security...');
    const securityScore = await evaluateAPISecurity(apiFiles, apiInfo, prd);
    results.findings.security_score = securityScore.score;
    results.recommendations.push(...securityScore.recommendations);
    results.blockers.push(...securityScore.blockers);
    results.warnings.push(...securityScore.warnings);
    console.log(`   Security Score: ${securityScore.score}/10`);

    // ============================================
    // 7. EVALUATE DOCUMENTATION
    // ============================================
    console.log('\n📚 Step 7: Evaluating API documentation...');
    const documentationScore = await evaluateAPIDocumentation(apiFiles, apiInfo);
    results.findings.documentation_score = documentationScore.score;
    results.recommendations.push(...documentationScore.recommendations);
    console.log(`   Documentation Score: ${documentationScore.score}/10`);

    // ============================================
    // 8. CALCULATE VERDICT
    // ============================================
    console.log('\n📊 Step 8: Calculating final verdict...');

    const avgScore = (
      designScore.score +
      performanceScore.score +
      securityScore.score +
      documentationScore.score
    ) / 4;

    results.confidence_score = Math.round(avgScore * 10); // Convert to 0-100

    // Determine verdict
    if (results.blockers.length > 0) {
      results.verdict = 'FAIL';
      results.summary = `API review FAILED with ${results.blockers.length} critical issue(s). Average score: ${avgScore.toFixed(1)}/10`;
    } else if (avgScore >= 8.0) {
      results.verdict = 'PASS';
      results.summary = `API design meets standards. Average score: ${avgScore.toFixed(1)}/10`;
    } else if (avgScore >= 6.0) {
      results.verdict = 'CONDITIONAL_PASS';
      results.summary = `API design acceptable with improvements needed. Average score: ${avgScore.toFixed(1)}/10`;
    } else {
      results.verdict = 'FAIL';
      results.summary = `API design needs significant improvements. Average score: ${avgScore.toFixed(1)}/10`;
      results.blockers.push('Overall API quality score below acceptable threshold (6.0/10)');
    }

    console.log(`   Verdict: ${results.verdict}`);
    console.log(`   Confidence: ${results.confidence_score}%`);

  } catch (error) {
    console.error(`❌ API review error: ${error.message}`);
    results.verdict = 'FAIL';
    results.confidence_score = 0;
    results.summary = `API review failed: ${error.message}`;
    results.blockers.push(error.message);
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('API REVIEW SUMMARY');
  console.log('='.repeat(60));
  console.log(`Verdict: ${results.verdict}`);
  console.log(`Confidence: ${results.confidence_score}%`);
  console.log(`\nScores:`);
  console.log(`  Design Quality: ${results.findings.design_quality_score}/10`);
  console.log(`  Performance: ${results.findings.performance_score}/10`);
  console.log(`  Security: ${results.findings.security_score}/10`);
  console.log(`  Documentation: ${results.findings.documentation_score}/10`);

  if (results.blockers.length > 0) {
    console.log(`\n🚨 Blockers (${results.blockers.length}):`);
    results.blockers.forEach(b => console.log(`   - ${b}`));
  }

  if (results.recommendations.length > 0) {
    console.log(`\n💡 Recommendations (${results.recommendations.length}):`);
    results.recommendations.slice(0, 5).forEach(r => console.log(`   - ${r}`));
    if (results.recommendations.length > 5) {
      console.log(`   ... and ${results.recommendations.length - 5} more`);
    }
  }

  console.log('='.repeat(60) + '\n');

  return results;
}

/**
 * Detect API type and endpoints from SD/PRD
 */
function detectAPIType(sd, prd) {
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''} ${prd?.technical_requirements || ''}`.toLowerCase();

  const hasAPI = /\b(api|endpoint|route|rest|graphql|controller|middleware)\b/i.test(content);

  const type = content.includes('graphql') ? 'GraphQL' :
               content.includes('rest') || content.includes('endpoint') ? 'REST' :
               'Unknown';

  // Extract endpoint patterns (simple heuristic)
  const endpoints = [];
  const endpointMatches = content.match(/\/[a-z0-9/_-]+/gi);
  if (endpointMatches) {
    endpoints.push(...new Set(endpointMatches));
  }

  return { hasAPI, type, endpoints };
}

/**
 * Scan codebase for API-related files
 */
async function scanAPIFiles() {
  const apiFiles = [];
  const searchPaths = [
    '/mnt/c/_EHG/ehg/src/api',
    '/mnt/c/_EHG/ehg/src/routes',
    '/mnt/c/_EHG/ehg/src/controllers',
    '/mnt/c/_EHG/ehg/server',
    '/mnt/c/_EHG/EHG_Engineer/src/api'
  ];

  for (const searchPath of searchPaths) {
    if (existsSync(searchPath)) {
      const files = scanDirectory(searchPath, /\.(js|ts|jsx|tsx)$/);
      apiFiles.push(...files);
    }
  }

  return apiFiles;
}

/**
 * Recursively scan directory for matching files
 */
function scanDirectory(dir, pattern) {
  const files = [];

  if (!existsSync(dir)) return files;

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        files.push(...scanDirectory(fullPath, pattern));
      } else if (pattern.test(entry.name)) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Skip directories with permission issues
  }

  return files;
}

/**
 * Evaluate API design quality
 */
async function evaluateAPIDesign(apiFiles, apiInfo, prd) {
  const score = { score: 8, recommendations: [], blockers: [] };

  // Check REST conventions
  if (apiInfo.type === 'REST') {
    const hasPlurals = apiInfo.endpoints.some(ep => /\/[a-z]+s\b/i.test(ep));
    if (!hasPlurals && apiInfo.endpoints.length > 0) {
      score.recommendations.push('Consider using plural resource names (e.g., /users instead of /user)');
      score.score -= 0.5;
    }
  }

  // Check for versioning
  const hasVersioning = apiInfo.endpoints.some(ep => /\/v\d+\//i.test(ep));
  if (!hasVersioning && apiInfo.endpoints.length > 2) {
    score.recommendations.push('Consider implementing API versioning (e.g., /v1/resource)');
    score.score -= 0.5;
  }

  // Check file structure
  if (apiFiles.length === 0 && apiInfo.hasAPI) {
    score.blockers.push('API implementation mentioned but no API files found in standard locations');
    score.score = 3;
  }

  return score;
}

/**
 * Evaluate API performance
 */
async function evaluateAPIPerformance(apiFiles, apiInfo) {
  const score = { score: 7, recommendations: [] };

  // Check for pagination patterns
  const hasPagination = apiFiles.some(file => {
    if (!existsSync(file)) return false;
    const content = readFileSync(file, 'utf8');
    return /\b(limit|offset|page|cursor)\b/i.test(content);
  });

  if (!hasPagination && apiFiles.length > 0) {
    score.recommendations.push('Consider implementing pagination for list endpoints');
    score.score -= 1;
  }

  // Check for caching headers
  const hasCaching = apiFiles.some(file => {
    if (!existsSync(file)) return false;
    const content = readFileSync(file, 'utf8');
    return /\b(cache-control|etag|max-age)\b/i.test(content);
  });

  if (!hasCaching && apiFiles.length > 0) {
    score.recommendations.push('Consider adding caching headers (Cache-Control, ETag) for performance');
    score.score -= 0.5;
  }

  return score;
}

/**
 * Evaluate API security
 */
async function evaluateAPISecurity(apiFiles, apiInfo, prd) {
  const score = { score: 8, recommendations: [], blockers: [], warnings: [] };

  // Check for authentication
  const hasAuth = apiFiles.some(file => {
    if (!existsSync(file)) return false;
    const content = readFileSync(file, 'utf8');
    return /\b(authenticate|authorize|jwt|token|bearer)\b/i.test(content);
  });

  if (!hasAuth && apiInfo.hasAPI) {
    score.warnings.push('No authentication patterns detected - ensure endpoints are properly secured');
    score.score -= 1;
  }

  // Check for input validation
  const hasValidation = apiFiles.some(file => {
    if (!existsSync(file)) return false;
    const content = readFileSync(file, 'utf8');
    return /\b(validate|validation|sanitize|schema)\b/i.test(content);
  });

  if (!hasValidation && apiFiles.length > 0) {
    score.blockers.push('No input validation patterns detected - this is a security risk');
    score.score = 4;
  }

  // Check for rate limiting
  const hasRateLimiting = apiFiles.some(file => {
    if (!existsSync(file)) return false;
    const content = readFileSync(file, 'utf8');
    return /\b(rate.?limit|throttle)\b/i.test(content);
  });

  if (!hasRateLimiting && apiFiles.length > 0) {
    score.recommendations.push('Consider implementing rate limiting to prevent abuse');
    score.score -= 0.5;
  }

  return score;
}

/**
 * Evaluate API documentation
 */
async function evaluateAPIDocumentation(apiFiles, apiInfo) {
  const score = { score: 7, recommendations: [] };

  // Check for OpenAPI/Swagger
  const hasOpenAPI = apiFiles.some(file => {
    if (!existsSync(file)) return false;
    const content = readFileSync(file, 'utf8');
    return /\b(swagger|openapi|@swagger|@openapi)\b/i.test(content);
  });

  if (!hasOpenAPI && apiFiles.length > 0) {
    score.recommendations.push('Consider adding OpenAPI/Swagger documentation for API endpoints');
    score.score -= 1.5;
  }

  // Check for JSDoc/comments on endpoints
  const hasComments = apiFiles.some(file => {
    if (!existsSync(file)) return false;
    const content = readFileSync(file, 'utf8');
    return /\/\*\*[\s\S]*?@(param|returns|description)/i.test(content);
  });

  if (!hasComments && apiFiles.length > 0) {
    score.recommendations.push('Add JSDoc comments to API endpoints for better documentation');
    score.score -= 1;
  }

  return score;
}

export default { execute };
