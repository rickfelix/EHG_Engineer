#!/usr/bin/env node
/**
 * Generate Sub-Agent Domain Embeddings with OpenAI
 *
 * Purpose: Generate semantic search embeddings for sub-agent domains using OpenAI text-embedding-3-small
 *
 * Features:
 * - Comprehensive domain descriptions for each sub-agent
 * - Batch processing with rate limit handling
 * - Retry logic with exponential backoff
 * - Cost estimation and monitoring
 * - Updates existing embeddings (idempotent)
 *
 * Usage:
 *   node scripts/generate-subagent-embeddings.js [--force] [--agent-code=CODE]
 *
 * Options:
 *   --force        Regenerate embeddings even if they exist
 *   --agent-code   Process only a specific sub-agent (for testing)
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 dimensions, $0.02/1M tokens
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // Start with 1 second

// Initialize clients
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ============================================================================
// Sub-Agent Domain Descriptions
// ============================================================================

/**
 * Comprehensive domain descriptions for each sub-agent
 * These descriptions are used to generate semantic embeddings
 */
const SUB_AGENT_DOMAINS = {
  API: `API Architecture and Design. REST API design patterns, RESTful principles, HTTP methods (GET, POST, PUT, DELETE),
    endpoint naming conventions, resource modeling, API versioning strategies (URL versioning, header versioning),
    GraphQL schema design, queries, mutations, subscriptions, resolver optimization, N+1 query prevention,
    OpenAPI and Swagger documentation, request/response schemas, status code usage (2xx, 4xx, 5xx),
    pagination patterns (cursor-based, offset-based), filtering and sorting strategies, rate limiting and throttling,
    API security (authentication, authorization, API keys, OAuth, JWT), CORS configuration, error response standardization,
    API performance optimization, caching strategies, payload size efficiency, middleware patterns, controller architecture`,

  DEPENDENCY: `Dependency Management and Security. npm package management, yarn and pnpm workflows, package.json configuration,
    dependency version management, semantic versioning (semver), major/minor/patch updates, dependency conflicts and resolution,
    peer dependency management, security vulnerability scanning (CVE detection), npm audit integration, CVSS score assessment,
    exploit maturity analysis, outdated package detection, deprecated package identification, unmaintained dependency warnings,
    license compatibility checking, bundle size impact analysis, supply chain security, package provenance verification,
    maintainer trust assessment, typosquatting detection, breaking change analysis, upgrade path recommendations,
    Snyk and Dependabot integration, node_modules optimization, lock file management (package-lock.json, yarn.lock)`,

  DATABASE: `Database Architecture and Design. PostgreSQL database schema design, SQL query optimization, table structure and normalization,
    primary keys and foreign keys, indexes and index optimization (B-tree, GiST, GIN, BRIN), database migrations and versioning,
    schema evolution strategies, data integrity and constraints, row-level security (RLS) policies, database performance tuning,
    query execution plans (EXPLAIN ANALYZE), connection pooling, transaction management (ACID properties), stored procedures and functions,
    database triggers, views and materialized views, data types and type casting, JSON and JSONB columns, full-text search,
    database backup and recovery, replication strategies, partitioning and sharding, Supabase integration,
    database testing strategies, data seeding, database documentation`,

  SECURITY: `Security Architecture and Best Practices. Authentication mechanisms (password-based, multi-factor, biometric),
    authorization models (RBAC, ABAC, ACL), session management, token-based auth (JWT, OAuth, OpenID Connect),
    SSO implementation, password hashing and salting (bcrypt, argon2), encryption (symmetric, asymmetric, end-to-end),
    HTTPS and TLS configuration, CORS and CSRF protection, XSS prevention, SQL injection prevention, input validation and sanitization,
    OWASP Top 10 vulnerabilities, security headers (CSP, HSTS, X-Frame-Options), rate limiting and DDoS protection,
    API security, secrets management, key rotation, access control lists, privilege escalation prevention,
    security auditing and logging, penetration testing, vulnerability scanning, compliance (GDPR, HIPAA, SOC2),
    secure coding practices, threat modeling, security incident response`,

  DESIGN: `UI/UX Design and Frontend Architecture. User interface design principles, user experience best practices,
    responsive web design, mobile-first approach, accessibility standards (WCAG 2.1, Section 508), ARIA attributes,
    screen reader compatibility, keyboard navigation, color contrast ratios, component-based architecture,
    design systems and style guides, UI component libraries (Material UI, Ant Design, Chakra UI),
    layout patterns (grid, flexbox, CSS Grid), typography and font systems, color theory and palettes,
    spacing and visual hierarchy, interactive design patterns, micro-interactions, animation and transitions,
    form design and validation UX, error message design, loading states and skeletons, empty states,
    navigation patterns, responsive images, progressive enhancement, browser compatibility,
    design tokens and theming, dark mode implementation, user flow and journey mapping`,

  TESTING: `Quality Assurance and Testing. Unit testing methodologies, integration testing strategies,
    end-to-end testing (E2E) with Playwright, test automation frameworks (Vitest, Jest, Mocha),
    test coverage measurement and reporting, test-driven development (TDD), behavior-driven development (BDD),
    testing pyramid concepts, mocking and stubbing, test fixtures and factories, snapshot testing,
    visual regression testing, accessibility testing, performance testing and load testing,
    security testing, API testing, database testing, continuous testing in CI/CD,
    test data management, test environment setup, flaky test prevention, test maintenance strategies,
    quality metrics and KPIs, bug tracking and triage, regression testing, smoke testing,
    acceptance testing, user acceptance testing (UAT), exploratory testing,
    test documentation and reporting, QA best practices`,

  PERFORMANCE: `Performance Engineering and Optimization. Web performance metrics (Core Web Vitals, LCP, FID, CLS),
    performance profiling and monitoring, Chrome DevTools performance analysis, Lighthouse audits,
    JavaScript performance optimization, bundle size optimization, code splitting and lazy loading,
    tree shaking, minification and compression (gzip, brotli), caching strategies (browser cache, CDN, service workers),
    image optimization (WebP, AVIF, lazy loading, responsive images), font optimization,
    CSS performance (critical CSS, unused CSS removal), render blocking resources,
    server response time optimization, database query optimization, N+1 query prevention,
    connection pooling, load balancing, horizontal and vertical scaling, CDN configuration,
    rate limiting and throttling, memory leak detection, garbage collection optimization,
    performance budgets, real user monitoring (RUM), synthetic monitoring`,

  VALIDATION: `Codebase Validation and Duplicate Detection. Static code analysis, code quality metrics,
    duplicate code detection, code complexity analysis (cyclomatic complexity), code smell identification,
    design pattern recognition, architectural pattern validation, dependency graph analysis,
    circular dependency detection, dead code elimination, unused import detection,
    naming convention validation, code style consistency, linting and formatting,
    codebase search and discovery, existing implementation detection, similar code detection,
    refactoring opportunity identification, code reuse analysis, technical debt assessment,
    codebase documentation analysis, comment quality evaluation, code ownership tracking,
    merge conflict prediction, breaking change detection, backward compatibility validation`,

  DOCMON: `Documentation Generation and Information Architecture. Technical writing best practices,
    API documentation generation (OpenAPI, Swagger, JSDoc), user guide creation,
    developer documentation, architecture documentation (C4 model, ADRs),
    README file standards, documentation site generation (Docusaurus, VuePress, MkDocs),
    code comment standards, inline documentation, documentation versioning,
    documentation search and discoverability, information architecture principles,
    content organization and hierarchy, documentation style guides, markdown formatting,
    diagram generation (PlantUML, Mermaid), example code snippets,
    tutorial and walkthrough creation, troubleshooting guides, FAQ documentation,
    changelog management, release notes, documentation testing and validation,
    documentation maintenance strategies, docs-as-code workflows`,

  GITHUB: `DevOps and CI/CD Pipeline Management. GitHub Actions workflows, continuous integration setup,
    continuous deployment strategies, pipeline design and optimization, build automation,
    test automation in CI, deployment automation, environment management (dev, staging, production),
    infrastructure as code (IaC), Docker and containerization, Kubernetes orchestration,
    version control best practices, branch protection rules, pull request workflows,
    code review automation, merge strategies, release management, semantic versioning,
    GitHub releases and tags, artifact management, secret management in CI/CD,
    pipeline security, deployment rollback strategies, blue-green deployments,
    canary deployments, feature flags, monitoring and alerting integration,
    CI/CD performance optimization, pipeline cost optimization`,

  RETRO: `Retrospective Analysis and Continuous Improvement. Agile retrospective facilitation,
    lessons learned documentation, root cause analysis (5 Whys, Fishbone diagrams),
    post-mortem analysis, incident retrospectives, sprint retrospectives,
    team performance metrics, velocity tracking, quality metrics evolution,
    process improvement identification, action item tracking, retrospective formats (Start/Stop/Continue, Mad/Sad/Glad),
    team health assessment, psychological safety evaluation, communication pattern analysis,
    technical debt tracking, architecture decision records (ADRs), knowledge capture and sharing,
    pattern identification across projects, best practice documentation, anti-pattern identification,
    continuous improvement culture, feedback loop optimization, learning organization principles`,

  RISK: `Risk Assessment and Management. Risk identification methodologies, threat modeling,
    risk probability and impact assessment, risk matrix and heat maps, risk mitigation strategies,
    risk acceptance and transfer decisions, security risk assessment, business risk analysis,
    technical risk evaluation, dependency risk (third-party services, external APIs),
    scalability risks, performance risks, data loss risks, compliance risks (GDPR, HIPAA),
    operational risks, financial risks, reputational risks, contingency planning,
    disaster recovery planning, business continuity planning, risk monitoring and tracking,
    risk communication and reporting, SWOT analysis, failure mode and effects analysis (FMEA),
    pre-mortem analysis, assumption validation`,

  STORIES: `User Story Engineering and Context. User story writing (As a... I want... So that...),
    acceptance criteria definition (Given/When/Then), story point estimation,
    story splitting and decomposition, epic and theme management, user persona development,
    user journey mapping, story mapping, feature prioritization (MoSCoW, RICE, Kano),
    backlog grooming and refinement, story dependency management, story context engineering,
    implementation guidance documentation, architecture reference links, code pattern examples,
    testing scenario definition, edge case identification, non-functional requirements,
    story size optimization (300-600 LOC sweet spot), story completeness validation,
    story traceability, story to test case mapping`,

  COST: `Cost Optimization and Resource Management. Cloud cost analysis (AWS, GCP, Azure),
    infrastructure cost optimization, compute instance right-sizing, storage cost optimization,
    bandwidth and data transfer costs, serverless cost optimization (Lambda, Cloud Functions),
    database cost optimization (RDS, DynamoDB pricing), cache optimization (Redis, Elasticache costs),
    CDN cost analysis, load balancer cost optimization, cost monitoring and alerting,
    reserved instance vs on-demand analysis, spot instance optimization, auto-scaling cost impact,
    resource tagging and cost allocation, cost budget setting, cost forecasting,
    FinOps best practices, total cost of ownership (TCO) analysis, cost-performance trade-offs,
    license cost management, SaaS subscription optimization, cost attribution by feature`
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate embedding with retry logic
 */
async function generateEmbeddingWithRetry(text, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text
      });

      return response.data[0].embedding;

    } catch (error) {
      if (attempt === retries) {
        throw error;
      }

      const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff
      console.log(`   ⚠️  Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Estimate cost based on token count
 */
function estimateCost(text) {
  // Rough estimate: 1 token ≈ 4 characters
  const estimatedTokens = Math.ceil(text.length / 4);
  const costPerMillionTokens = 0.02; // $0.02 per 1M tokens
  const cost = (estimatedTokens / 1_000_000) * costPerMillionTokens;
  return { tokens: estimatedTokens, cost };
}

// ============================================================================
// Main Function
// ============================================================================

async function main() {
  console.log('\n🧠 Sub-Agent Embedding Generation - Starting...\n');
  console.log('='.repeat(70));

  // Parse command line arguments
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const agentCodeArg = args.find(arg => arg.startsWith('--agent-code='));
  const targetAgentCode = agentCodeArg ? agentCodeArg.split('=')[1] : null;

  // Check OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in environment variables');
    console.error('   Please set OPENAI_API_KEY in your .env file');
    process.exit(1);
  }

  // Get all sub-agents from database
  const { data: agents, error: fetchError } = await supabase
    .from('leo_sub_agents')
    .select('id, code, name, priority')
    .eq('active', true)
    .order('priority', { ascending: false });

  if (fetchError) {
    console.error('❌ Failed to fetch sub-agents:', fetchError.message);
    process.exit(1);
  }

  console.log(`📋 Found ${agents.length} active sub-agents`);

  // Filter by target agent if specified
  const agentsToProcess = targetAgentCode
    ? agents.filter(a => a.code === targetAgentCode)
    : agents;

  if (agentsToProcess.length === 0) {
    console.error(`❌ No agents found matching criteria`);
    process.exit(1);
  }

  console.log(`🎯 Processing ${agentsToProcess.length} agent(s)`);
  console.log('='.repeat(70));
  console.log('');

  // Calculate total cost estimate
  let totalTokens = 0;
  let totalCost = 0;

  for (const agent of agentsToProcess) {
    const domain = SUB_AGENT_DOMAINS[agent.code];
    if (domain) {
      const estimate = estimateCost(domain);
      totalTokens += estimate.tokens;
      totalCost += estimate.cost;
    }
  }

  console.log(`💰 Cost Estimate:`);
  console.log(`   Total tokens: ~${totalTokens.toLocaleString()}`);
  console.log(`   Estimated cost: $${totalCost.toFixed(4)}`);
  console.log('');

  // Process each agent
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const agent of agentsToProcess) {
    console.log(`\n🔄 Processing: ${agent.code} (${agent.name})`);
    console.log('-'.repeat(70));

    const domain = SUB_AGENT_DOMAINS[agent.code];

    if (!domain) {
      console.log(`   ⚠️  No domain description found - skipping`);
      skipCount++;
      continue;
    }

    // Check if embedding already exists
    const { data: existing } = await supabase
      .from('leo_sub_agents')
      .select('domain_embedding')
      .eq('id', agent.id)
      .single();

    if (existing?.domain_embedding && !force) {
      console.log(`   ⏭️  Embedding already exists - skipping (use --force to regenerate)`);
      skipCount++;
      continue;
    }

    try {
      // Generate embedding
      console.log(`   🧠 Generating embedding...`);
      const embedding = await generateEmbeddingWithRetry(domain);

      // Update database
      const { error: updateError } = await supabase
        .from('leo_sub_agents')
        .update({ domain_embedding: embedding })
        .eq('id', agent.id);

      if (updateError) {
        throw new Error(`Failed to update database: ${updateError.message}`);
      }

      const estimate = estimateCost(domain);
      console.log(`   ✅ Embedding generated and stored`);
      console.log(`   📊 Tokens: ~${estimate.tokens.toLocaleString()}, Cost: $${estimate.cost.toFixed(6)}`);

      successCount++;

    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      errorCount++;
    }
  }

  // Summary
  console.log('');
  console.log('='.repeat(70));
  console.log('📊 Summary');
  console.log('='.repeat(70));
  console.log(`✅ Success: ${successCount}`);
  console.log(`⏭️  Skipped: ${skipCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`💰 Total Cost: $${totalCost.toFixed(4)}`);
  console.log('='.repeat(70));
  console.log('');

  if (successCount > 0) {
    console.log('🎉 Embedding generation complete!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Apply SD embedding migration (add scope_embedding column)');
    console.log('2. Generate embeddings for existing SDs');
    console.log('3. Update context-aware selector to use hybrid matching');
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

main();
