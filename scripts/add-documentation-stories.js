#!/usr/bin/env node

/**
 * Add 7 DOCMON-Driven Documentation user stories to SD-DOCUMENTATION-001
 * US-001 through US-007: Dynamic, flexible documentation platform
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

const SD_ID = 'SD-DOCUMENTATION-001';

const newStories = [
  {
    story_key: `${SD_ID}:US-001`,
    title: 'DOCMON-Driven Documentation Gap Analysis',
    user_role: 'developer',
    user_want: 'to automatically identify documentation gaps using DOCMON sub-agent after each SD implementation',
    user_benefit: 'ensuring comprehensive documentation coverage without manual audits',
    acceptance_criteria: [
      'DOCMON sub-agent scans codebase after SD-VENTURE-IDEATION-MVP-001, SD-AGENT-PLATFORM-001, and SD-AGENT-ADMIN-001 complete',
      'Gap analysis report identifies: missing API docs, outdated examples, broken links, undocumented public interfaces',
      'Intelligent prioritization: critical gaps (public APIs), high priority (user-facing features), medium (internal tools)',
      'Auto-generates documentation stubs for missing files with TODOs',
      'Dashboard view showing documentation health: coverage %, outdated files count, broken links count',
      'Thresholds enforced: 80% code sync, 90% link validity, 70% API coverage, 30-day freshness',
      'Recommendations for each gap: "Document this API endpoint", "Update code example", "Fix broken link to X"',
      'Integration with CI/CD: DOCMON runs on every PR to prevent documentation drift',
      'Export gap report to Markdown for manual review',
      'Configurable scanning rules: exclude test files, include only public APIs, etc.'
    ],
    technical_notes: 'Leverage existing /mnt/c/_EHG/EHG_Engineer/lib/agents/documentation-sub-agent.js (DocumentationSubAgentV2 class), extend intelligentAnalyze() method to scan /mnt/c/_EHG/EHG/docs/ and /mnt/c/_EHG/EHG/src/, use findDocumentationFiles(), analyzeDocFile(), checkMissingDocumentation(), analyzeCodeDocSync() methods, store results in database table documentation_gap_analysis (gap_id, sd_id, gap_type ENUM, severity, description, recommended_action, status, created_at), create DocGapDashboard.tsx component to visualize health metrics',
    story_points: 5,
    priority: 'critical',
    status: 'ready'
  },
  {
    story_key: `${SD_ID}:US-002`,
    title: 'CrewAI Platform Documentation (Dynamic Discovery)',
    user_role: 'developer',
    user_want: 'to have comprehensive CrewAI platform documentation that reflects actual implementation',
    user_benefit: 'understanding organizational hierarchy, agent roles, and workflows as they were actually built',
    acceptance_criteria: [
      'docs/crewai-platform/overview.md: Auto-generated from actual agent deployments in database',
      'docs/crewai-platform/organizational-hierarchy.md: Dynamic org chart showing CEO/COO, 11 departments, VP agents, reporting structure',
      'docs/crewai-platform/agent-roles.md: Auto-discovered from ai_agents table with role descriptions, tools, responsibilities',
      'docs/crewai-platform/workflows.md: Documents actual task flows between agents (captured from agent_tasks table)',
      'DOCMON validates: All listed agents exist in database, all described workflows have corresponding code',
      'Diagrams auto-generated from database relationships (Mermaid syntax)',
      'Links to related API endpoints and UI components',
      'Version history showing when departments/agents were added',
      'Search functionality to find agents by name, role, or department',
      'Export org chart to PNG/PDF for presentations'
    ],
    technical_notes: 'Query ai_agents table for actual deployed agents, query organizational_departments for hierarchy, use DOCMON analyzeAPIDocs() to validate documentation matches implementation, generate Mermaid diagrams from database relationships, create scripts/generate-crewai-docs.js that queries DB and writes markdown files, update on SD completion triggers (webhook or cron)',
    story_points: 8,
    priority: 'high',
    status: 'ready'
  },
  {
    story_key: `${SD_ID}:US-003`,
    title: 'API Reference Auto-Documentation',
    user_role: 'developer',
    user_want: 'to have auto-generated API documentation with validated code examples',
    user_benefit: 'ensuring API docs are always accurate and code examples actually work',
    acceptance_criteria: [
      'docs/api/reference.md: Auto-generated from backend routes (Express/Fastify route definitions)',
      'Each endpoint documented with: HTTP method, path, authentication requirements, request schema, response schema, error codes',
      'docs/api/authentication.md: Documents actual auth implementation (Supabase Auth, JWT, session management)',
      'docs/api/examples/: Code examples extracted from actual integration tests (guarantees they work)',
      'DOCMON code sync validation: Tests each example against live API (or test environment)',
      '80% code sync threshold enforced: If >20% of examples fail, documentation marked as "needs update"',
      'Auto-discovery: Scans src/routes/, src/api/, server.js for endpoint definitions',
      'OpenAPI/Swagger spec auto-generated from route definitions',
      'Interactive API explorer (Swagger UI or similar) for testing endpoints',
      'Version tracking: Documents which API version introduced which endpoints'
    ],
    technical_notes: 'Use swagger-jsdoc or similar to parse JSDoc comments from route files, extract code examples from tests/integration/ directory, implement DOCMON validateCodeExamples() method to run examples against test API, generate docs/api/reference.md programmatically via scripts/generate-api-docs.js, integrate with OpenAPI spec generation, store API changelog in api_versions table (version, endpoint, method, changes, deprecated_at)',
    story_points: 8,
    priority: 'critical',
    status: 'ready'
  },
  {
    story_key: `${SD_ID}:US-004`,
    title: 'Framework-Specific Developer Guides',
    user_role: 'new developer',
    user_want: 'to quickly onboard to the CrewAI codebase with practical, framework-specific guides',
    user_benefit: 'reducing onboarding time from days to hours with clear, actionable documentation',
    acceptance_criteria: [
      'docs/guides/developer-onboarding.md: Step-by-step setup guide (clone repo, install deps, run locally, run tests)',
      'Framework-specific sections: Vite + React setup, Supabase integration, Shadcn UI components, CrewAI agent patterns',
      'Code structure walkthrough: /src/client/, /src/components/, /lib/agents/, /database/, /tests/',
      'Common tasks documented: "How to add a new agent", "How to create a new SD", "How to run DOCMON", "How to trigger sub-agents"',
      'Troubleshooting section: Common errors (build failures, database connection issues, auth problems) with solutions',
      'Links to actual code examples from the codebase (not generic examples)',
      'Environment variables reference: Required vs optional, where to get values (Supabase dashboard)',
      'Testing guide: How to run unit tests, integration tests, E2E tests',
      'Git workflow: Branch naming, commit message format, PR process',
      'DOCMON validates: All commands in guide actually work, all file paths exist'
    ],
    technical_notes: 'Create docs/guides/developer-onboarding.md manually but use DOCMON to validate all commands and file paths, extract code snippets from actual source files (not hardcoded), use DOCMON validateReadme() logic to check command validity, create docs/guides/troubleshooting.md with solutions to common errors (query GitHub issues or retrospectives table for patterns), update guide when major framework changes occur',
    story_points: 5,
    priority: 'high',
    status: 'ready'
  },
  {
    story_key: `${SD_ID}:US-005`,
    title: 'UI Workflow User Guides (As-Built)',
    user_role: 'end user',
    user_want: 'to understand how to use the AI Agent Management UI workflows as they were actually implemented',
    user_benefit: 'performing agent management tasks confidently without trial-and-error',
    acceptance_criteria: [
      'docs/guides/user-guide-agent-management.md: Comprehensive guide for AI Agent Management Page workflows',
      'Section 1: Agent List View - How to search, filter, sort agents; what each column means; quick actions available',
      'Section 2: Agent Detail Pages - Understanding tabs (Overview, Tools, Activity, Performance, Versions); interpreting charts; taking actions',
      'Section 3: Creating Agents - Step-by-step wizard walkthrough with screenshots; common configurations; tool assignment best practices',
      'Section 4: Tools Management - Adding new tools to registry; assigning tools to agents; setting permissions and cost limits',
      'Section 5: Real-Time Dashboards - Reading activity feeds; interpreting uptime/cost/success charts; filtering by department',
      'Section 6: Version Management - Viewing version history; comparing versions; rolling back safely',
      'Section 7: Organization Integration - Understanding department assignments; using hierarchy view',
      'Screenshots from actual implementation (not mockups)',
      'DOCMON validates: All described UI elements exist in codebase, all workflows match implemented routes',
      'Links to related API endpoints for advanced users'
    ],
    technical_notes: 'Document as-built UI from SD-AGENT-ADMIN-001 implementation (US-012 through US-019), use scripts/screenshot-ui-workflows.js to capture actual screenshots from /mnt/c/_EHG/EHG/ application, store screenshots in docs/guides/images/, validate UI element descriptions against component source code in src/components/, use DOCMON to check that all mentioned routes exist in src/App.tsx or routing config',
    story_points: 8,
    priority: 'high',
    status: 'ready'
  },
  {
    story_key: `${SD_ID}:US-006`,
    title: 'Architecture Documentation (Living Diagrams)',
    user_role: 'technical lead',
    user_want: 'to have up-to-date architecture documentation with living diagrams that reflect current system state',
    user_benefit: 'making informed technical decisions based on accurate system architecture understanding',
    acceptance_criteria: [
      'docs/architecture/system-overview.md: High-level architecture diagram (frontend, backend, database, external services)',
      'docs/architecture/database-schema.md: Auto-generated from Supabase schema with table relationships, column types, RLS policies',
      'docs/architecture/component-relationships.md: Component hierarchy and data flow (React components, hooks, services)',
      'docs/architecture/diagrams/: Mermaid diagrams for system architecture, database ERD, component tree, agent workflows',
      'Living diagrams: Auto-regenerated when schema changes or major components added',
      'DOCMON validates: Diagrams match actual database schema, component imports match documented relationships',
      'Documentation for key architectural decisions: "Why Supabase?", "Why Vite?", "Why CrewAI agent pattern?"',
      'Data flow documentation: Request lifecycle from UI → API → Database → Agent',
      'Security architecture: Authentication flow, RLS policies, role-based access control',
      'Performance considerations: Caching strategy, database query optimization, bundle size'
    ],
    technical_notes: 'Use scripts/generate-db-schema-docs.js to query Supabase schema via pg_catalog tables and generate ERD in Mermaid syntax, use dependency analysis tools (madge or es-dependency-graph) to generate component relationship diagrams, create docs/architecture/diagrams/ with Mermaid (.mmd) files that can be rendered by GitHub or Mermaid Live Editor, update diagrams on database migrations or major component additions, store architectural decision records (ADRs) in docs/architecture/decisions/',
    story_points: 8,
    priority: 'medium',
    status: 'ready'
  },
  {
    story_key: `${SD_ID}:US-007`,
    title: 'Documentation Quality Standards & Automation',
    user_role: 'engineering manager',
    user_want: 'to enforce documentation quality standards with automated validation',
    user_benefit: 'maintaining high-quality, trustworthy documentation without manual reviews',
    acceptance_criteria: [
      'Quality thresholds enforced: 80% code sync (examples work), 90% link validity (no broken links), 70% API coverage (public endpoints documented), 30-day freshness (docs updated monthly)',
      'Automated DOCMON runs: On every PR (prevents new gaps), nightly (detects drift), post-SD-completion (ensures coverage)',
      'CI/CD integration: GitHub Actions workflow runs DOCMON, fails PR if thresholds not met',
      'Documentation health dashboard: Real-time metrics (coverage %, broken links, outdated files, sync status)',
      'Automated fixes: DOCMON auto-fixes broken internal links, updates timestamps, flags outdated examples',
      'Notification system: Alerts when documentation falls below thresholds (Slack/email)',
      'Documentation style guide: Markdown standards, code example format, diagram conventions',
      'Review process: Documentation changes require approval (like code reviews)',
      'Version control: Documentation versioned alongside code (git tags/releases)',
      'Rollback capability: Revert to previous documentation version if errors introduced'
    ],
    technical_notes: 'Create .github/workflows/docmon-validation.yml GitHub Action that runs DOCMON on PR events, implement DOCMON reporting dashboard in EHG_Engineer app at /documentation-health route, create DocHealthDashboard.tsx component showing metrics from documentation_gap_analysis table, implement automated link fixing in DOCMON (update relative paths, fix renamed files), create docs/DOCUMENTATION_STANDARDS.md with style guide, integrate with existing CI/CD pipeline, store documentation metrics in doc_quality_metrics table (metric_date, coverage_pct, broken_links_count, outdated_files_count, sync_status)',
    story_points: 5,
    priority: 'high',
    status: 'ready'
  }
];

async function addDocumentationStories() {
  console.log('🔄 Adding 7 DOCMON-Driven Documentation user stories...');
  console.log('='.repeat(80));

  const storiesWithIds = newStories.map(story => ({
    ...story,
    id: randomUUID(),
    sd_id: SD_ID,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));

  try {
    const { data, error } = await supabase
      .from('user_stories')
      .insert(storiesWithIds)
      .select();

    if (error) throw error;

    console.log(`✅ Successfully added ${data.length} new user stories!`);
    console.log('');

    data.forEach((story, i) => {
      console.log(`${i + 1}. ${story.story_key}: ${story.title}`);
      console.log(`   Points: ${story.story_points}, Priority: ${story.priority}`);
      console.log('');
    });

    const totalPoints = data.reduce((sum, s) => sum + s.story_points, 0);
    console.log('='.repeat(80));
    console.log(`📊 Total new story points: ${totalPoints}`);
    console.log('='.repeat(80));

    return data;
  } catch (error) {
    console.error('❌ Error adding user stories:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  addDocumentationStories();
}

export { addDocumentationStories };
