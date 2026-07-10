/**
 * Known LEO-Protocol-internal tooling capabilities.
 * SD-LEO-ENH-EVA-INTAKE-DISPOSITION-001 (data), SD-LEO-INFRA-STAGE0-ENVELOPE-REGISTRATION-001
 * (extracted to a side-effect-free module -- FR-3/FR-6).
 *
 * Pure data, no Supabase client, no CLI-invocation side effects: safe to import from any
 * consumer (lib/capabilities/capability-seeder.js's seeding CLI, or the Stage-0 requirement
 * extractor's structural denylist guard) without triggering unrelated module-scope work.
 */

/** Known codebase capabilities organized by type. Each entry: { capability_key, name, capability_type, category, action_details } */
export const KNOWN_CAPABILITIES = [
  // === Sub-Agents (27) ===
  { capability_key: 'rca-agent', name: 'RCA Sub-Agent (LEO Protocol)', capability_type: 'agent', category: 'ai_automation', action_details: 'Root cause analysis with 5-whys methodology, CAPA generation, issue pattern creation' },
  { capability_key: 'design-agent', name: 'Design Sub-Agent (LEO Protocol)', capability_type: 'agent', category: 'ai_automation', action_details: 'UI/UX design validation, accessibility auditing (axe-core), component sizing, WCAG compliance' },
  { capability_key: 'testing-agent', name: 'Testing Sub-Agent (LEO Protocol)', capability_type: 'agent', category: 'ai_automation', action_details: 'E2E test generation, Playwright test execution, coverage validation, QA workflows' },
  { capability_key: 'database-agent', name: 'Database Sub-Agent (LEO Protocol)', capability_type: 'agent', category: 'ai_automation', action_details: 'Schema design, Supabase migration execution, RLS policies, SQL validation' },
  { capability_key: 'security-agent', name: 'Security Sub-Agent (LEO Protocol)', capability_type: 'agent', category: 'ai_automation', action_details: 'Authentication/authorization, RLS policies, vulnerability assessment, OWASP checks' },
  { capability_key: 'performance-agent', name: 'Performance Sub-Agent (LEO Protocol)', capability_type: 'agent', category: 'ai_automation', action_details: 'Load testing, optimization, latency analysis, caching, indexing recommendations' },
  { capability_key: 'api-agent', name: 'API Sub-Agent (LEO Protocol)', capability_type: 'agent', category: 'ai_automation', action_details: 'REST/GraphQL endpoint design, API architecture, versioning, documentation' },
  { capability_key: 'stories-agent', name: 'Stories Sub-Agent (LEO Protocol)', capability_type: 'agent', category: 'ai_automation', action_details: 'User story generation, acceptance criteria, GWT scenarios, epic decomposition' },
  { capability_key: 'validation-agent', name: 'Validation Sub-Agent (LEO Protocol)', capability_type: 'agent', category: 'ai_automation', action_details: 'Codebase validation, duplicate detection, existing implementation checks' },
  { capability_key: 'risk-agent', name: 'Risk Sub-Agent (LEO Protocol)', capability_type: 'agent', category: 'ai_automation', action_details: 'Risk assessment, mitigation strategies, contingency planning' },
  { capability_key: 'regression-agent', name: 'Regression Sub-Agent (LEO Protocol)', capability_type: 'agent', category: 'ai_automation', action_details: 'Refactoring validation, backward compatibility, baseline comparison' },
  { capability_key: 'github-agent', name: 'GitHub Sub-Agent (LEO Protocol)', capability_type: 'agent', category: 'ai_automation', action_details: 'CI/CD pipeline, GitHub Actions, PR management, deployment checks' },
  { capability_key: 'docmon-agent', name: 'DOCMON Sub-Agent (LEO Protocol)', capability_type: 'agent', category: 'ai_automation', action_details: 'Documentation generation, workflow docs, information architecture' },
  { capability_key: 'dependency-agent', name: 'Dependency Sub-Agent (LEO Protocol)', capability_type: 'agent', category: 'ai_automation', action_details: 'npm/package updates, CVE analysis, dependency conflicts, version management' },
  { capability_key: 'retro-agent', name: 'Retrospective Sub-Agent (LEO Protocol)', capability_type: 'agent', category: 'ai_automation', action_details: 'Retrospective generation, lesson extraction, quality scoring, continuous improvement' },
  { capability_key: 'uat-agent', name: 'UAT Sub-Agent (LEO Protocol)', capability_type: 'agent', category: 'ai_automation', action_details: 'User acceptance test execution, acceptance criteria validation, user journey testing' },
  { capability_key: 'vetting-engine', name: 'Vetting Engine (LEO Protocol)', capability_type: 'agent', category: 'ai_automation', action_details: 'Multi-model debate (3 AI critics), proposal evaluation, constitutional AI governance' },
  { capability_key: 'research-engine', name: 'Research Engine (LEO Protocol)', capability_type: 'agent', category: 'ai_automation', action_details: 'Multi-model deep research via API, structured synthesis across providers' },

  // === CLI Commands (16) ===
  { capability_key: 'cmd-leo', name: 'LEO Protocol Orchestrator Command', capability_type: 'skill', category: 'governance', action_details: 'Protocol orchestrator, SD queue management, session control, phase transitions' },
  { capability_key: 'cmd-ship', name: 'Ship Command (LEO Protocol)', capability_type: 'skill', category: 'governance', action_details: 'Git commit, PR creation, merge workflow, branch cleanup, multi-repo coordination' },
  { capability_key: 'cmd-learn', name: 'Learn Command (LEO Protocol)', capability_type: 'skill', category: 'governance', action_details: 'Self-improvement, pattern capture, retrospective analysis, issue pattern creation' },
  { capability_key: 'cmd-document', name: 'Document Command (LEO Protocol)', capability_type: 'skill', category: 'governance', action_details: 'Intelligent documentation updater, DOCMON invocation, CLAUDE.md regeneration' },
  { capability_key: 'cmd-quick-fix', name: 'Quick-Fix Command (LEO Protocol)', capability_type: 'skill', category: 'governance', action_details: 'Small bug fixes (<50 LOC), auto-merge workflow, quick-fix tracking' },
  { capability_key: 'cmd-uat', name: 'UAT Command (LEO Protocol)', capability_type: 'skill', category: 'governance', action_details: 'Human acceptance testing, interactive test execution, screenshot validation' },
  { capability_key: 'cmd-restart', name: 'Restart Command (LEO Protocol)', capability_type: 'skill', category: 'infrastructure', action_details: 'LEO stack server restart (Engineer 3000, App 8080, Agent Platform 8000)' },
  { capability_key: 'cmd-rca', name: 'RCA Command (LEO Protocol)', capability_type: 'skill', category: 'governance', action_details: '5-Whys root cause analysis, CAPA generation, issue pattern tracking' },
  { capability_key: 'cmd-triangulation', name: 'Triangulation Command (LEO Protocol)', capability_type: 'skill', category: 'governance', action_details: 'Multi-AI ground-truth verification, codebase claim validation, cross-repo checks' },
  { capability_key: 'cmd-brainstorm', name: 'Brainstorm Command (LEO Protocol)', capability_type: 'skill', category: 'governance', action_details: 'EHG-aware strategic brainstorming, four-plane evaluation, venture assessment' },
  { capability_key: 'cmd-simplify', name: 'Simplify Command (LEO Protocol)', capability_type: 'skill', category: 'governance', action_details: 'Code simplification, dead code removal, complexity reduction without behavior change' },
  { capability_key: 'cmd-feedback', name: 'Feedback Command (LEO Protocol)', capability_type: 'skill', category: 'governance', action_details: 'Feedback management, inbox processing, quality scoring, triage' },
  { capability_key: 'cmd-status', name: 'Status Command (LEO Protocol)', capability_type: 'skill', category: 'governance', action_details: 'Pipeline status monitoring, SD progress, burn rate, baseline tracking' },

  // === Core Platform Features ===
  { capability_key: 'eva-todoist-sync', name: 'EVA Todoist Sync', capability_type: 'tool', category: 'integration', action_details: 'Todoist API integration, task sync, hierarchy support (parent/section/child order)' },
  { capability_key: 'eva-youtube-sync', name: 'EVA YouTube Sync', capability_type: 'tool', category: 'integration', action_details: 'YouTube API integration, video transcript extraction, idea classification' },
  { capability_key: 'evaluation-bridge', name: 'Evaluation Bridge (LEO Protocol)', capability_type: 'tool', category: 'ai_automation', action_details: 'Intake item evaluation pipeline: classify → dedup → feedback → score → vet' },
  { capability_key: 'triage-engine', name: 'Triage Engine (LEO Protocol)', capability_type: 'tool', category: 'ai_automation', action_details: 'Priority calc, burst detection, ignore patterns, AI triage, disposition classification' },
  { capability_key: 'quality-scoring', name: 'Quality Scoring Engine (LEO Protocol)', capability_type: 'tool', category: 'ai_automation', action_details: 'Feedback quality assessment, multi-dimensional scoring, actionability metrics' },
  { capability_key: 'llm-client-factory', name: 'LEO Protocol LLM Client Factory', capability_type: 'tool', category: 'ai_automation', action_details: 'Central LLM routing: local Ollama (Haiku tier) or cloud Anthropic/OpenAI/Google' },
  { capability_key: 'canary-routing', name: 'Canary Routing (LEO Protocol)', capability_type: 'tool', category: 'ai_automation', action_details: 'Gradual traffic shifting for LLM models with quality gates and auto-rollback' },
  { capability_key: 'handoff-system', name: 'Handoff System (LEO Protocol)', capability_type: 'tool', category: 'governance', action_details: 'Phase transition validation: LEAD→PLAN→EXEC with 50+ gate validators' },
  { capability_key: 'auto-proceed', name: 'Auto-Proceed Continuation (LEO Protocol)', capability_type: 'tool', category: 'governance', action_details: 'Autonomous LEO execution, phase transitions, child-to-child continuation' },
  { capability_key: 'multi-session-coordination', name: 'Multi-Session Coordination (LEO Protocol)', capability_type: 'tool', category: 'infrastructure', action_details: 'Pessimistic locking, heartbeat manager, stale session detection, claim conflicts' },
  { capability_key: 'branch-cleanup-v2', name: 'Branch Cleanup v2 (LEO Protocol)', capability_type: 'tool', category: 'infrastructure', action_details: 'Two-stage branch analysis, multi-repo discovery, superseded detection' },
  { capability_key: 'simplification-engine', name: 'Simplification Engine (LEO Protocol)', capability_type: 'tool', category: 'ai_automation', action_details: 'AST-based code simplification, dead code detection, complexity reduction' },
  { capability_key: 'feedback-quality-processor', name: 'Feedback Quality Processor (LEO Protocol)', capability_type: 'tool', category: 'ai_automation', action_details: 'Multi-dimensional feedback scoring: clarity, actionability, specificity' },
  { capability_key: 'urgency-scorer', name: 'Urgency Scorer (LEO Protocol)', capability_type: 'tool', category: 'governance', action_details: 'SD prioritization: urgency bands, learning signals, downstream blockers, time sensitivity' },
  { capability_key: 'capability-taxonomy', name: 'Capability Taxonomy (LEO Protocol)', capability_type: 'tool', category: 'governance', action_details: 'Capability classification: 5 categories, 23 types, maturity/extraction scoring' },
  { capability_key: 'worktree-isolation', name: 'Worktree Isolation (LEO Protocol)', capability_type: 'tool', category: 'infrastructure', action_details: 'Git worktree-first SD isolation, parallel development, conflict prevention' },

  // === Database Infrastructure ===
  { capability_key: 'db-strategic-directives', name: 'Strategic Directives Database (LEO Protocol)', capability_type: 'tool', category: 'application', action_details: 'SD lifecycle management: draft→approved→in_progress→completed with governance' },
  { capability_key: 'db-feedback-table', name: 'Feedback Database (LEO Protocol)', capability_type: 'tool', category: 'application', action_details: 'Feedback tracking: 50+ columns, quality scoring, triage, resolution tracking' },
  { capability_key: 'db-prd-system', name: 'PRD System Database (LEO Protocol)', capability_type: 'tool', category: 'application', action_details: 'Product requirements: PRD generation, sub-agent orchestration, checklist tracking' },
  { capability_key: 'db-retrospectives', name: 'Retrospectives Database (LEO Protocol)', capability_type: 'tool', category: 'application', action_details: 'Learning capture: issue patterns, quality metrics, continuous improvement' },
  { capability_key: 'db-user-stories', name: 'User Stories Database (LEO Protocol)', capability_type: 'tool', category: 'application', action_details: 'Story management: acceptance criteria, GWT scenarios, quality validation' },
  { capability_key: 'db-llm-registry', name: 'LLM Registry Database (LEO Protocol)', capability_type: 'tool', category: 'ai_automation', action_details: 'Database-driven model registry: providers, models, tiers, canary state' },
];

export default { KNOWN_CAPABILITIES };
