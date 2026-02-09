/**
 * Capability Seeder
 * SD-LEO-ENH-EVA-INTAKE-DISPOSITION-001
 *
 * Seeds the sd_capabilities table with known codebase capabilities
 * so the disposition engine can detect "already_exists" items.
 *
 * Usage:
 *   node lib/capabilities/capability-seeder.js [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Known codebase capabilities organized by type.
 * Each entry: { capability_key, capability_type, category, action_details }
 */
const KNOWN_CAPABILITIES = [
  // === Sub-Agents (27) ===
  { capability_key: 'rca-agent', capability_type: 'agent', category: 'ai_automation', action_details: 'Root cause analysis with 5-whys methodology, CAPA generation, issue pattern creation' },
  { capability_key: 'design-agent', capability_type: 'agent', category: 'ai_automation', action_details: 'UI/UX design validation, accessibility auditing (axe-core), component sizing, WCAG compliance' },
  { capability_key: 'testing-agent', capability_type: 'agent', category: 'ai_automation', action_details: 'E2E test generation, Playwright test execution, coverage validation, QA workflows' },
  { capability_key: 'database-agent', capability_type: 'agent', category: 'ai_automation', action_details: 'Schema design, Supabase migration execution, RLS policies, SQL validation' },
  { capability_key: 'security-agent', capability_type: 'agent', category: 'ai_automation', action_details: 'Authentication/authorization, RLS policies, vulnerability assessment, OWASP checks' },
  { capability_key: 'performance-agent', capability_type: 'agent', category: 'ai_automation', action_details: 'Load testing, optimization, latency analysis, caching, indexing recommendations' },
  { capability_key: 'api-agent', capability_type: 'agent', category: 'ai_automation', action_details: 'REST/GraphQL endpoint design, API architecture, versioning, documentation' },
  { capability_key: 'stories-agent', capability_type: 'agent', category: 'ai_automation', action_details: 'User story generation, acceptance criteria, GWT scenarios, epic decomposition' },
  { capability_key: 'validation-agent', capability_type: 'agent', category: 'ai_automation', action_details: 'Codebase validation, duplicate detection, existing implementation checks' },
  { capability_key: 'risk-agent', capability_type: 'agent', category: 'ai_automation', action_details: 'Risk assessment, mitigation strategies, contingency planning' },
  { capability_key: 'regression-agent', capability_type: 'agent', category: 'ai_automation', action_details: 'Refactoring validation, backward compatibility, baseline comparison' },
  { capability_key: 'github-agent', capability_type: 'agent', category: 'ai_automation', action_details: 'CI/CD pipeline, GitHub Actions, PR management, deployment checks' },
  { capability_key: 'docmon-agent', capability_type: 'agent', category: 'ai_automation', action_details: 'Documentation generation, workflow docs, information architecture' },
  { capability_key: 'dependency-agent', capability_type: 'agent', category: 'ai_automation', action_details: 'npm/package updates, CVE analysis, dependency conflicts, version management' },
  { capability_key: 'retro-agent', capability_type: 'agent', category: 'ai_automation', action_details: 'Retrospective generation, lesson extraction, quality scoring, continuous improvement' },
  { capability_key: 'uat-agent', capability_type: 'agent', category: 'ai_automation', action_details: 'User acceptance test execution, acceptance criteria validation, user journey testing' },
  { capability_key: 'vetting-engine', capability_type: 'agent', category: 'ai_automation', action_details: 'Multi-model debate (3 AI critics), proposal evaluation, constitutional AI governance' },
  { capability_key: 'research-engine', capability_type: 'agent', category: 'ai_automation', action_details: 'Multi-model deep research via API, structured synthesis across providers' },

  // === CLI Commands (16) ===
  { capability_key: 'cmd-leo', capability_type: 'skill', category: 'governance', action_details: 'Protocol orchestrator, SD queue management, session control, phase transitions' },
  { capability_key: 'cmd-ship', capability_type: 'skill', category: 'governance', action_details: 'Git commit, PR creation, merge workflow, branch cleanup, multi-repo coordination' },
  { capability_key: 'cmd-learn', capability_type: 'skill', category: 'governance', action_details: 'Self-improvement, pattern capture, retrospective analysis, issue pattern creation' },
  { capability_key: 'cmd-document', capability_type: 'skill', category: 'governance', action_details: 'Intelligent documentation updater, DOCMON invocation, CLAUDE.md regeneration' },
  { capability_key: 'cmd-quick-fix', capability_type: 'skill', category: 'governance', action_details: 'Small bug fixes (<50 LOC), auto-merge workflow, quick-fix tracking' },
  { capability_key: 'cmd-uat', capability_type: 'skill', category: 'governance', action_details: 'Human acceptance testing, interactive test execution, screenshot validation' },
  { capability_key: 'cmd-restart', capability_type: 'skill', category: 'infrastructure', action_details: 'LEO stack server restart (Engineer 3000, App 8080, Agent Platform 8000)' },
  { capability_key: 'cmd-rca', capability_type: 'skill', category: 'governance', action_details: '5-Whys root cause analysis, CAPA generation, issue pattern tracking' },
  { capability_key: 'cmd-triangulation', capability_type: 'skill', category: 'governance', action_details: 'Multi-AI ground-truth verification, codebase claim validation, cross-repo checks' },
  { capability_key: 'cmd-brainstorm', capability_type: 'skill', category: 'governance', action_details: 'EHG-aware strategic brainstorming, four-plane evaluation, venture assessment' },
  { capability_key: 'cmd-simplify', capability_type: 'skill', category: 'governance', action_details: 'Code simplification, dead code removal, complexity reduction without behavior change' },
  { capability_key: 'cmd-feedback', capability_type: 'skill', category: 'governance', action_details: 'Feedback management, inbox processing, quality scoring, triage' },
  { capability_key: 'cmd-status', capability_type: 'skill', category: 'governance', action_details: 'Pipeline status monitoring, SD progress, burn rate, baseline tracking' },

  // === Core Platform Features ===
  { capability_key: 'eva-todoist-sync', capability_type: 'tool', category: 'integration', action_details: 'Todoist API integration, task sync, hierarchy support (parent/section/child order)' },
  { capability_key: 'eva-youtube-sync', capability_type: 'tool', category: 'integration', action_details: 'YouTube API integration, video transcript extraction, idea classification' },
  { capability_key: 'evaluation-bridge', capability_type: 'tool', category: 'ai_automation', action_details: 'Intake item evaluation pipeline: classify → dedup → feedback → score → vet' },
  { capability_key: 'triage-engine', capability_type: 'tool', category: 'ai_automation', action_details: 'Priority calc, burst detection, ignore patterns, AI triage, disposition classification' },
  { capability_key: 'quality-scoring', capability_type: 'tool', category: 'ai_automation', action_details: 'Feedback quality assessment, multi-dimensional scoring, actionability metrics' },
  { capability_key: 'llm-client-factory', capability_type: 'tool', category: 'ai_automation', action_details: 'Central LLM routing: local Ollama (Haiku tier) or cloud Anthropic/OpenAI/Google' },
  { capability_key: 'canary-routing', capability_type: 'tool', category: 'ai_automation', action_details: 'Gradual traffic shifting for LLM models with quality gates and auto-rollback' },
  { capability_key: 'handoff-system', capability_type: 'tool', category: 'governance', action_details: 'Phase transition validation: LEAD→PLAN→EXEC with 50+ gate validators' },
  { capability_key: 'auto-proceed', capability_type: 'tool', category: 'governance', action_details: 'Autonomous LEO execution, phase transitions, child-to-child continuation' },
  { capability_key: 'multi-session-coordination', capability_type: 'tool', category: 'infrastructure', action_details: 'Pessimistic locking, heartbeat manager, stale session detection, claim conflicts' },
  { capability_key: 'branch-cleanup-v2', capability_type: 'tool', category: 'infrastructure', action_details: 'Two-stage branch analysis, multi-repo discovery, superseded detection' },
  { capability_key: 'simplification-engine', capability_type: 'tool', category: 'ai_automation', action_details: 'AST-based code simplification, dead code detection, complexity reduction' },
  { capability_key: 'feedback-quality-processor', capability_type: 'tool', category: 'ai_automation', action_details: 'Multi-dimensional feedback scoring: clarity, actionability, specificity' },
  { capability_key: 'urgency-scorer', capability_type: 'tool', category: 'governance', action_details: 'SD prioritization: urgency bands, learning signals, downstream blockers, time sensitivity' },
  { capability_key: 'capability-taxonomy', capability_type: 'tool', category: 'governance', action_details: 'Capability classification: 5 categories, 23 types, maturity/extraction scoring' },
  { capability_key: 'worktree-isolation', capability_type: 'tool', category: 'infrastructure', action_details: 'Git worktree-first SD isolation, parallel development, conflict prevention' },

  // === Database Infrastructure ===
  { capability_key: 'db-strategic-directives', capability_type: 'tool', category: 'application', action_details: 'SD lifecycle management: draft→approved→in_progress→completed with governance' },
  { capability_key: 'db-feedback-table', capability_type: 'tool', category: 'application', action_details: 'Feedback tracking: 50+ columns, quality scoring, triage, resolution tracking' },
  { capability_key: 'db-prd-system', capability_type: 'tool', category: 'application', action_details: 'Product requirements: PRD generation, sub-agent orchestration, checklist tracking' },
  { capability_key: 'db-retrospectives', capability_type: 'tool', category: 'application', action_details: 'Learning capture: issue patterns, quality metrics, continuous improvement' },
  { capability_key: 'db-user-stories', capability_type: 'tool', category: 'application', action_details: 'Story management: acceptance criteria, GWT scenarios, quality validation' },
  { capability_key: 'db-llm-registry', capability_type: 'tool', category: 'ai_automation', action_details: 'Database-driven model registry: providers, models, tiers, canary state' },
];

// SD that owns these seeded capabilities
const SEED_SD_UUID = '017467d3-ba34-4dec-a52a-3294d84b6c03';
const SEED_SD_ID = 'SD-LEO-ENH-EVA-INTAKE-DISPOSITION-001';

/**
 * Seed the sd_capabilities table with known capabilities
 * @param {Object} options
 * @param {boolean} [options.dryRun=false] - If true, only show what would be inserted
 * @param {string} [options.sdUuid] - Override SD UUID for ownership
 * @param {string} [options.sdId] - Override SD ID for ownership
 * @returns {Promise<{inserted: number, skipped: number, errors: number}>}
 */
export async function seedCapabilities(options = {}) {
  const stats = { inserted: 0, skipped: 0, errors: 0 };
  const sdUuid = options.sdUuid || SEED_SD_UUID;
  const sdId = options.sdId || SEED_SD_ID;

  // Get existing capability keys to avoid duplicates
  const { data: existing } = await supabase
    .from('sd_capabilities')
    .select('capability_key');

  const existingKeys = new Set((existing || []).map(e => e.capability_key));

  for (const cap of KNOWN_CAPABILITIES) {
    if (existingKeys.has(cap.capability_key)) {
      stats.skipped++;
      if (options.dryRun) {
        console.log(`  SKIP: ${cap.capability_key} (already exists)`);
      }
      continue;
    }

    if (options.dryRun) {
      console.log(`  INSERT: [${cap.capability_type}/${cap.category}] ${cap.capability_key}`);
      stats.inserted++;
      continue;
    }

    const { error } = await supabase
      .from('sd_capabilities')
      .insert({
        sd_uuid: sdUuid,
        sd_id: sdId,
        capability_key: cap.capability_key,
        capability_type: cap.capability_type,
        category: cap.category,
        action_details: {
          name: cap.capability_key,
          description: cap.action_details,
          capability_key: cap.capability_key,
          capability_type: cap.capability_type
        },
        action: 'registered'
      });

    if (error) {
      console.error(`  ERROR: ${cap.capability_key}: ${error.message}`);
      stats.errors++;
    } else {
      stats.inserted++;
    }
  }

  return stats;
}

// CLI execution
if (process.argv[1]?.includes('capability-seeder')) {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`\nCapability Seeder ${dryRun ? '(DRY RUN)' : ''}`);
  console.log('='.repeat(50));
  console.log(`Known capabilities: ${KNOWN_CAPABILITIES.length}`);
  console.log('');

  seedCapabilities({ dryRun }).then(stats => {
    console.log('\nResults:');
    console.log(`  Inserted: ${stats.inserted}`);
    console.log(`  Skipped: ${stats.skipped} (already exist)`);
    console.log(`  Errors: ${stats.errors}`);
    process.exit(stats.errors > 0 ? 1 : 0);
  }).catch(err => {
    console.error('Seeder failed:', err.message);
    process.exit(1);
  });
}

export default { seedCapabilities, KNOWN_CAPABILITIES };
