import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Enrichment data for SDs with weak descriptions and/or generic success criteria.
 * Source: eva-platform-architecture.md Sections 8, 13, 14, 15, 16
 */
const enrichments = {
  // ============================================================
  // 10 SDs with vague descriptions — add technical specifics
  // ============================================================

  'SD-EVA-FEAT-CHAIRMAN-DASHBOARD-001': {
    description: 'Visual dashboard for Chairman governance in EHG App (React/Vite). Three panels: (1) Decision Queue — queries chairman_decisions table filtered by status=\'pending\', renders venture brief context with synthesis scores and financial forecast; (2) Health Heatmap — queries ventures + venture_stage_progress, renders 25-column stage grid colored by status (green=progressing, yellow=blocked, red=killed); (3) Event Feed — queries eva_event_log with real-time Supabase subscription, shows recent stage completions, decision submissions, DFE escalations. Phase B Step 8 wireframes from vision doc become the design input for this SD\'s PRD.',
    success_criteria: [
      'Decision Queue panel renders pending chairman_decisions with venture brief context',
      'Health Heatmap displays all active ventures across 25 stages with color-coded status',
      'Event Feed shows real-time events from eva_event_log via Supabase Realtime subscription',
      'Clicking a decision in the queue shows full synthesis scores and financial forecast',
      'Dashboard auto-refreshes when new decisions arrive (no manual reload)',
      'Responsive layout works on desktop (1280px+) and tablet (768px+)',
    ],
    success_metrics: [
      { metric: 'Decision Queue load time', target: '<2s for 50 pending decisions' },
      { metric: 'Heatmap render', target: '25-stage grid for 10+ ventures renders in <1s' },
      { metric: 'Event Feed latency', target: 'New events appear within 3s of database write' },
    ],
  },

  'SD-EVA-FEAT-DFE-PRESENTATION-001': {
    description: 'Render Decision Filter Engine (lib/eva/decision-filter-engine.js) escalation context and suggested mitigations in the Chairman Dashboard. When DFE escalates (triggers: financial_threshold, safety_concern, legal_risk, reputation_risk, resource_constraint, strategic_misalignment), show: (1) which trigger fired and its severity score, (2) the venture data that caused the trigger, (3) DFE-generated mitigation suggestions, (4) historical pattern data from issue_patterns table for similar escalations. Reads from chairman_decisions.metadata.dfe_context and eva_event_log entries with event_type=\'dfe.escalation\'.',
    success_criteria: [
      'EscalationPanel component renders DFE trigger name, severity score, and source data',
      'Mitigation suggestions displayed with accept/reject actions per suggestion',
      'Historical patterns from issue_patterns table shown as "similar past escalations" sidebar',
      'Escalation context loads from chairman_decisions.metadata.dfe_context',
      'Panel integrates into Chairman Dashboard as expandable section per decision',
    ],
    success_metrics: [
      { metric: 'Escalation context completeness', target: 'All 6 DFE trigger types rendered correctly' },
      { metric: 'Historical pattern matches', target: 'At least 1 similar pattern shown when available' },
      { metric: 'Action latency', target: 'Accept/reject mitigation reflected in <1s' },
    ],
  },

  'SD-EVA-FEAT-EVENT-MONITOR-001': {
    description: 'Hybrid event-driven + scheduled venture monitoring service. (1) Supabase Realtime listener subscribes to INSERT/UPDATE on chairman_decisions (status changes), venture_artifacts (new analysis outputs), and orchestration_metrics (performance data) — triggers immediate venture advancement via eva-orchestrator.js processStage(). (2) Cron scheduler (node-cron) runs: portfolio health sweep (daily 2am), ops cycle check for Stage 24+ ventures (every 6h), release scheduling for Stage 22 ventures (weekly), and nursery re-evaluation trigger (weekly). Implements Vision Section 3 hybrid runtime model. Outputs events to eva_event_log for audit trail.',
    success_criteria: [
      'Supabase Realtime subscription on chairman_decisions detects approval and triggers venture advancement',
      'Supabase Realtime subscription on venture_artifacts detects new stage outputs',
      'Cron scheduler runs portfolio health sweep daily at configurable time',
      'Cron scheduler runs ops cycle check for Stage 24+ ventures every 6 hours',
      'All triggered actions logged to eva_event_log with correlation_id',
      'Service starts with EVA stack and gracefully shuts down on SIGTERM',
    ],
    success_metrics: [
      { metric: 'Event detection latency', target: 'Chairman decision detected within 5s of approval' },
      { metric: 'Cron reliability', target: 'Scheduled jobs execute within 60s of configured time' },
      { metric: 'Audit completeness', target: '100% of triggered actions have eva_event_log entries' },
    ],
  },

  'SD-EVA-FEAT-NOTIFICATION-001': {
    description: 'Chairman notification service with three delivery tiers. (1) Immediate: blocking decisions (chairman_decisions with priority=critical) trigger push notification via Resend email API to chairman\'s configured email. (2) Daily Digest: non-blocking updates (stage completions, DFE auto-approvals, venture health changes) batched into a single daily email at configurable time (default 8am). (3) Weekly Summary: portfolio overview email with venture count by stage, kill/park/advance counts, revenue projections delta vs last week. Notification preferences stored in chairman_preferences table. Rate limiting prevents >10 immediate notifications per hour.',
    success_criteria: [
      'Blocking decisions trigger immediate Resend email to chairman within 60 seconds',
      'Daily digest email aggregates all non-blocking events from past 24 hours',
      'Weekly summary includes venture counts by stage and key metric deltas',
      'Notification preferences (email, frequency, quiet hours) configurable in chairman_preferences',
      'Rate limiter caps immediate notifications at configurable threshold (default 10/hour)',
      'Notification history queryable from chairman_notifications table',
    ],
    success_metrics: [
      { metric: 'Immediate delivery', target: 'Critical decisions notified within 60s via Resend' },
      { metric: 'Digest completeness', target: 'Daily digest covers 100% of events from past 24h' },
      { metric: 'Rate limit effectiveness', target: 'No more than 10 immediate notifications per hour' },
    ],
  },

  'SD-EVA-FEAT-SCHEDULER-001': {
    description: 'EVA Master Scheduler replaces manual "eva run <venture_id>" with automated portfolio-level scheduling. Priority queue backed by eva_scheduler_queue table: ventures sorted by (1) blocking_decision_age DESC (oldest blocked ventures first), (2) priority score from evaluation_profiles, (3) FIFO within same priority. Cadence management: each venture has a max_stages_per_cycle config (default 5) to prevent single ventures monopolizing compute. Scheduler runs as a long-lived process, polling every 60s for unblocked ventures. Respects circuit breaker state (evaCircuitBreaker.ts) — pauses scheduling if error rate exceeds threshold. Outputs to orchestration_metrics for observability.',
    success_criteria: [
      'Scheduler auto-advances unblocked ventures without manual "eva run" command',
      'Priority queue orders ventures by blocking age, priority score, then FIFO',
      'Cadence management limits stages per cycle per venture (configurable, default 5)',
      'Scheduler respects circuit breaker state and pauses on high error rates',
      'New ventures added to queue automatically on creation',
      'Scheduler status visible via "eva scheduler status" CLI command',
    ],
    success_metrics: [
      { metric: 'Scheduling latency', target: 'Unblocked venture starts next stage within 120s' },
      { metric: 'Priority ordering', target: 'Older blocking decisions serviced before newer ones' },
      { metric: 'Cadence enforcement', target: 'No venture exceeds max_stages_per_cycle in one run' },
    ],
  },

  'SD-EVA-FEAT-SEMANTIC-SEARCH-001': {
    description: 'Hybrid semantic search for cross-venture learning, enhancing lib/eva/cross-venture-learning.js. (1) SQLite vector index (via better-sqlite3 + sqlite-vss) over issue_patterns.description, venture_artifacts.output, and retrospectives.lessons_learned fields. (2) Local Ollama embeddings using existing LLM Client Factory infrastructure (getEmbeddingClient() → nomic-embed-text model). (3) BM25 keyword matching as fallback when vector search returns low-confidence results (<0.7 cosine similarity). Indexing runs as background job triggered by new issue_pattern or venture_artifact inserts. Query interface: searchSimilar(query, { topK, minScore, tables }) returns ranked results with scores.',
    success_criteria: [
      'SQLite vector index created and populated from issue_patterns and venture_artifacts',
      'Ollama embedding generation via LLM Client Factory getEmbeddingClient()',
      'BM25 fallback activates when vector search confidence below threshold',
      'searchSimilar() function returns ranked results with cosine similarity scores',
      'Index auto-updates when new records inserted into indexed tables',
      'cross-venture-learning.js enhanced to use semantic search for pattern matching',
    ],
    success_metrics: [
      { metric: 'Search relevance', target: 'Top-3 results include correct match for known patterns' },
      { metric: 'Index freshness', target: 'New records indexed within 5 minutes of insertion' },
      { metric: 'Query latency', target: '<500ms for vector search over 10K records' },
    ],
  },

  'SD-EVA-FEAT-SKILL-PACKAGING-001': {
    description: 'Skill packaging system evolving current .partial.md agent files to versioned SKILL.md bundles. Each skill declares: (1) requirements — tools needed, context access level, memory access; (2) trigger conditions — when to inject this skill; (3) version — semver for tracking changes; (4) dependencies — other skills required. Agent compiler (scripts/generate-agent-files.js) enhanced to selectively inject skills per turn based on task context matching against trigger conditions. Skills stored in agent_skills table with JSONB metadata. Resolves current issue where all skills are injected regardless of relevance, consuming context budget.',
    success_criteria: [
      'SKILL.md format defined with requirements, triggers, version, and dependencies sections',
      'agent_skills table stores skill metadata with trigger conditions',
      'Agent compiler reads skill manifests and injects only matching skills per agent',
      'Skills are versioned (semver) with change tracking',
      'Context budget savings measured: only relevant skills injected per turn',
      'Existing .partial.md files migrated to SKILL.md format',
    ],
    success_metrics: [
      { metric: 'Context savings', target: 'Average skill injection reduced by 40% per agent turn' },
      { metric: 'Trigger accuracy', target: '90%+ of injected skills are actually used in turn' },
      { metric: 'Migration coverage', target: 'All existing .partial.md files converted to SKILL.md' },
    ],
  },

  'SD-EVA-FEAT-VENTURE-TEMPLATES-001': {
    description: 'Venture template system that extracts reusable patterns from successful ventures and applies them to new ventures. Extraction: lib/eva/cross-venture-learning.js already provides pattern analysis (kill frequency by stage, failed assumptions, success patterns). This SD builds the template layer on top: (1) extractTemplate(ventureId) — distills a completed venture\'s stage outputs, decisions, and synthesis data into a reusable VentureTemplate record; (2) applyTemplate(templateId, newVentureId) — pre-populates new venture\'s stage templates with adapted content from the template; (3) Template versioning and scoring based on downstream venture success rates. Templates stored in venture_templates table with JSONB stage_data.',
    success_criteria: [
      'extractTemplate() creates a VentureTemplate from a completed ventures stage outputs',
      'applyTemplate() pre-populates new ventures analysisSteps with adapted template content',
      'Templates stored in venture_templates table with stage-by-stage JSONB data',
      'Template effectiveness scored based on downstream venture completion rates',
      'Templates versioned — new extraction from same archetype creates new version',
      'cross-venture-learning.js success_patterns feed into template recommendations',
    ],
    success_metrics: [
      { metric: 'Template extraction', target: 'Completed venture produces template in <30s' },
      { metric: 'Template application', target: 'New venture pre-populated with 80%+ stage defaults' },
      { metric: 'Effectiveness tracking', target: 'Template success rate tracked over 5+ applications' },
    ],
  },

  'SD-EVA-ORCH-PHASE-C-001': {
    description: 'Phase C orchestrator: Platform Capabilities + Marketing Engine. Conditional on Phase B validation (3-venture auto-scheduling test passes). Contains 7 children: (C-11) Event-driven venture monitor — Supabase Realtime + cron scheduler; (C-12) Chairman dashboard wiring — EHG App DecisionsInbox to chairman_decisions; (C-13) Per-agent tool policy profiles — full/coding/readonly/minimal; (C-14) Skill packaging system — SKILL.md format + agent compiler; (C-15) Hybrid semantic search — SQLite vectors + Ollama embeddings; (C-16) Marketing Engine data foundation + publisher; (C-17) Marketing Engine AI feedback loop + assets. Dependency graph: C-11, C-12, C-13, C-15, C-16 independent; C-14 depends on C-13; C-17 depends on C-16.',
    success_criteria: [
      'All 7 children completed with full LEAD-PLAN-EXEC workflow',
      'Supabase Realtime detects Chairman decision and auto-advances venture',
      'Sub-agent spawned with readonly profile cannot write files',
      'Skill injected only when task context matches skill requirements',
      'Semantic search returns related issue patterns across ventures',
      'Marketing publisher posts content and metrics ingested for optimization',
      'Integration test: decision in dashboard triggers event-driven venture advancement',
    ],
    success_metrics: [
      { metric: 'Children completed', target: '7/7 children pass LEAD-FINAL-APPROVAL' },
      { metric: 'Event-driven latency', target: 'Decision to venture advancement in <10s' },
      { metric: 'Marketing pipeline', target: 'Content generated, published, and metrics collected end-to-end' },
    ],
  },

  'SD-EVA-ORCH-PHASE-D-001': {
    description: 'Phase D orchestrator: Portfolio Intelligence. Conditional on Phase C validation (platform capabilities + marketing engine operational). Contains 2 children: (D-18) Venture template system — extract patterns from successful ventures via cross-venture-learning.js, generate and apply templates to new ventures; (D-19) Inter-venture dependency manager — dependency graph with auto-blocking using venture_dependencies table schema. Both children are independent and can execute in parallel. Test: Successful venture generates a template, new venture uses template. Dependency between ventures correctly blocks/unblocks progression.',
    success_criteria: [
      'Both children completed with full LEAD-PLAN-EXEC workflow',
      'Successful venture generates reusable template',
      'New venture created from template has pre-populated stage data',
      'Inter-venture dependency correctly blocks dependent venture until prerequisite completes',
      'Dependency graph queryable via CLI command',
      'Integration test: template creation + application + dependency blocking all functional',
    ],
    success_metrics: [
      { metric: 'Children completed', target: '2/2 children pass LEAD-FINAL-APPROVAL' },
      { metric: 'Template reuse', target: 'Template applied to new venture with 80%+ pre-population' },
      { metric: 'Dependency enforcement', target: 'Blocked ventures cannot advance past dependent stage' },
    ],
  },

  // ============================================================
  // 15 more SDs with generic success criteria only (descriptions OK)
  // ============================================================

  'SD-EVA-FEAT-DASHBOARD-WIRING-001': {
    success_criteria: [
      'DecisionsInbox component approve/reject buttons write to chairman_decisions table',
      'EscalationPanel wired to eva_event_log entries with event_type=dfe.escalation',
      'Stale-context detection rejects decisions when venture state has changed since decision creation',
      'All 25-stage GUI components removed from EHG App (CLI handles stage progression)',
      'Chairman dashboard loads decisions from same chairman_decisions table as CLI',
    ],
    success_metrics: [
      { metric: 'Dashboard-to-DB latency', target: 'Approve/reject reflected in chairman_decisions within 1s' },
      { metric: 'Stale detection accuracy', target: '100% of stale decisions flagged before submission' },
      { metric: 'GUI removal', target: '0 remaining stage-progression UI components in EHG App' },
    ],
  },

  'SD-EVA-FEAT-DEPENDENCY-MANAGER-001': {
    success_criteria: [
      'venture_dependencies table populated when inter-venture dependencies declared',
      'Dependent venture auto-blocks at the dependent stage until prerequisite venture completes required stage',
      'Dependency graph queryable: getDependencyGraph(ventureId) returns upstream and downstream',
      'Circular dependency detection prevents invalid dependency chains',
      'CLI command "eva dependencies <venture_id>" shows dependency tree',
    ],
    success_metrics: [
      { metric: 'Blocking accuracy', target: 'Dependent ventures blocked 100% of the time when prerequisite incomplete' },
      { metric: 'Unblocking latency', target: 'Dependent venture unblocked within 60s of prerequisite completion' },
      { metric: 'Circular detection', target: 'All circular dependencies rejected at creation time' },
    ],
  },

  'SD-EVA-FEAT-EXPAND-SPINOFF-001': {
    success_criteria: [
      'Evaluator runs at Stage 25 using DFE financial, market, and operational criteria',
      'Expand recommendation: venture stays in current entity, scope broadened',
      'Spinoff recommendation: new venture entity created, resources allocated separately',
      'Decision factors include: revenue independence, team overlap, market adjacency, infrastructure sharing',
      'Chairman presented with evaluation summary and recommendation for final decision',
    ],
    success_metrics: [
      { metric: 'Evaluation completeness', target: 'All 4 decision factors assessed with scores' },
      { metric: 'Recommendation accuracy', target: 'Chairman agrees with recommendation 80%+ of the time' },
      { metric: 'Decision persistence', target: 'Expand/spinoff decision recorded in venture_decisions table' },
    ],
  },

  'SD-EVA-FEAT-MARKETING-AI-001': {
    success_criteria: [
      'Thompson Sampling optimizer with Beta distributions selects best-performing content variants',
      'Hourly cadence: channel allocation adjusts based on engagement data',
      'Daily cadence: Champion-Challenger promotes winning variants per channel',
      'Weekly cadence: cross-venture intelligence transfers successful patterns',
      'Nano Banana Pro image generation via Gemini API with Sharp.js brand overlays',
      'I2V video pipeline: Kling 3.0 primary, Veo 3.1 secondary, Runway Gen-4 Turbo fallback',
      'Resend email integration with custom SQL drip campaign state machine',
      'Metrics ingestor polls platform APIs hourly + receives PostHog webhooks',
    ],
    success_metrics: [
      { metric: 'Thompson Sampling convergence', target: 'Best variant identified within 50 impressions' },
      { metric: 'Image generation', target: 'Branded image produced in <30s per venture' },
      { metric: 'Metrics freshness', target: 'Platform metrics ingested within 2 hours of event' },
    ],
  },

  'SD-EVA-FEAT-MARKETING-FOUNDATION-001': {
    success_criteria: [
      'Database schema created: marketing_events, marketing_content, marketing_content_variants, marketing_experiments, marketing_daily_rollups, bandit_state, bandit_arms',
      'Content generator service produces headline/body/CTA/visual variants from venture context via LLM',
      'Publisher abstraction sends to X API (Basic), YouTube Data API v3, Bluesky, Mastodon, Threads',
      'Late aggregator integration for LinkedIn and TikTok distribution',
      'BullMQ queues operational: generate, review, schedule, dispatch, metrics, maintenance',
      'UTM attribution tracks content to conversions via PostHog Cloud',
    ],
    success_metrics: [
      { metric: 'Schema completeness', target: 'All 7 marketing tables created with RLS policies' },
      { metric: 'Publishing success rate', target: '95%+ of scheduled posts published successfully' },
      { metric: 'Attribution tracking', target: 'UTM parameters present on 100% of published content' },
    ],
  },

  'SD-EVA-FEAT-PORTFOLIO-OPT-001': {
    success_criteria: [
      'Resource contention detected when multiple ventures compete for same compute/API quotas',
      'Priority re-ranking adjusts venture order based on ROI potential and urgency score',
      'Portfolio balance maintained: no single venture consumes >40% of total resources',
      'Optimizer runs on configurable schedule (default: before each scheduler cycle)',
      'Results visible via "eva portfolio optimize --dry-run" CLI command',
    ],
    success_metrics: [
      { metric: 'Contention resolution', target: 'Resource conflicts resolved within 1 scheduler cycle' },
      { metric: 'Portfolio balance', target: 'No venture exceeds 40% resource allocation' },
      { metric: 'Optimization latency', target: 'Full portfolio optimization completes in <10s for 20 ventures' },
    ],
  },

  'SD-EVA-FEAT-SHARED-SERVICES-001': {
    success_criteria: [
      'Common service interface defined: loadContext(ventureId, stageId), execute(context, config), emit(eventType, payload)',
      'All existing EVA services refactored to implement the common interface',
      'Service registry tracks all available services with capability metadata',
      'Service invocation standardized: one code path for all service calls',
      'Error handling unified: all services use same retry, circuit breaker, and logging patterns',
    ],
    success_metrics: [
      { metric: 'Interface adoption', target: 'All EVA services implement the 3-method interface' },
      { metric: 'Code reduction', target: 'Service invocation boilerplate reduced by 50%+' },
      { metric: 'Error handling consistency', target: 'All services use unified retry and circuit breaker' },
    ],
  },

  'SD-EVA-FEAT-TOOL-POLICIES-001': {
    success_criteria: [
      'Tool policy profiles (full, coding, readonly, minimal) defined in agent_sub_agents table',
      'Agent compiler enforces profile at .md generation time — restricted tools excluded from agent file',
      'Runtime validation: sub-agent tool calls checked against profile before execution',
      'Readonly profile allows: Read, Glob, Grep, WebFetch, WebSearch — blocks: Edit, Write, Bash, NotebookEdit',
      'Minimal profile allows: Read only — blocks all modification tools',
    ],
    success_metrics: [
      { metric: 'Profile enforcement', target: 'Agent with readonly profile cannot execute Write/Edit/Bash' },
      { metric: 'Compiler integration', target: 'Restricted tools excluded from generated .md files' },
      { metric: 'Runtime validation', target: '100% of tool calls validated against profile before execution' },
    ],
  },

  // Phase B and E orchestrators already have decent descriptions.
  // Enrich their success criteria only.

  'SD-EVA-ORCH-PHASE-B-001': {
    success_criteria: [
      'All 4 children completed with full LEAD-PLAN-EXEC workflow',
      'Scheduler auto-advances 3+ ventures without manual intervention',
      'Chairman receives immediate notification for blocking decisions',
      'Chairman reviews and approves decisions via dashboard (not CLI)',
      'DFE escalation context visible in dashboard with mitigation suggestions',
      'Integration test: create 3 ventures, scheduler runs, chairman uses dashboard, ventures complete',
    ],
    success_metrics: [
      { metric: 'Children completed', target: '4/4 children pass LEAD-FINAL-APPROVAL' },
      { metric: 'Auto-scheduling', target: '3 ventures progress simultaneously without manual commands' },
      { metric: 'Dashboard adoption', target: 'Chairman can complete full decision workflow via dashboard' },
    ],
  },

  'SD-EVA-ORCH-PHASE-E-001': {
    success_criteria: [
      'All 3 children completed with full LEAD-PLAN-EXEC workflow',
      'Shared services interface adopted by all EVA services',
      'Expand-vs-spinoff evaluator produces recommendations at Stage 25',
      'Portfolio optimizer resolves resource contention across active ventures',
      'Integration test: two ventures contend for resource, optimizer re-ranks; Stage 25 venture evaluated',
    ],
    success_metrics: [
      { metric: 'Children completed', target: '3/3 children pass LEAD-FINAL-APPROVAL' },
      { metric: 'Service interface adoption', target: 'All EVA services implement common 3-method interface' },
      { metric: 'Resource optimization', target: 'Portfolio rebalances within 1 scheduler cycle' },
    ],
  },

  // Phase A orchestrator already has good description, but generic criteria
  'SD-EVA-ORCH-PHASE-A-001': {
    success_criteria: [
      'All 6 children completed with full LEAD-PLAN-EXEC workflow',
      'End-to-end 15-step test scenario from architecture Section 13 passes',
      'Chairman initiates venture via "eva ideate" and approves via CLI',
      'Venture progresses from Stage 0 through Stage 25 via "eva run"',
      'Chairman decisions submitted via CLI at Stages 0, 10, 22, 25',
      'SD Bridge creates LEO SDs at Stage 18, return path advances Stage 19',
      'All gate types functional: kill (3, 5), reality (9, 12), promotion (16), decision (10, 22, 25)',
    ],
    success_metrics: [
      { metric: 'Children completed', target: '6/6 children pass LEAD-FINAL-APPROVAL' },
      { metric: 'E2E test', target: '15-step validation scenario passes end-to-end' },
      { metric: 'Gate coverage', target: 'All 4 gate types (kill, reality, promotion, decision) validated' },
    ],
  },

  // Template gap-fill orchestrator — already has good criteria, but enrich metrics
  'SD-EVA-ORCH-TEMPLATE-GAPFILL-001': {
    success_metrics: [
      { metric: 'Template coverage', target: '25/25 templates have active analysisSteps' },
      { metric: 'Upstream consumption', target: 'Each stage reads from venture_artifacts table' },
      { metric: 'Gate types', target: 'Kill (3,5), Reality (9,12), Promotion (16), Decision (10,22,25) all functional' },
    ],
  },

  // Template children — descriptions are strong, but enrich generic success metrics
  'SD-EVA-FEAT-TEMPLATES-TRUTH-001': {
    success_metrics: [
      { metric: 'Stage coverage', target: 'Stages 1-5 all have active analysisSteps with execute()' },
      { metric: 'Kill gate accuracy', target: 'Stages 3 and 5 gates correctly kill ventures below threshold' },
      { metric: 'Hybrid scoring', target: 'Stage 3 uses 50% deterministic + 50% AI scoring' },
    ],
  },

  'SD-EVA-FEAT-TEMPLATES-ENGINE-001': {
    success_metrics: [
      { metric: 'Stage coverage', target: 'Stages 6-9 all have active analysisSteps with execute()' },
      { metric: 'BMC generation', target: 'Stage 8 produces complete 9-block Business Model Canvas' },
      { metric: 'Reality Gate', target: 'Stage 9 gate evaluates generated data against thresholds' },
    ],
  },

  'SD-EVA-FEAT-TEMPLATES-IDENTITY-001': {
    success_metrics: [
      { metric: 'Stage coverage', target: 'Stages 10-12 all have active analysisSteps with execute()' },
      { metric: 'Chairman decision', target: 'Stage 10 creates chairman_decisions record and blocks' },
      { metric: 'GTM strategy', target: 'Stage 11 generates 8-channel go-to-market strategy' },
    ],
  },

  'SD-EVA-FEAT-TEMPLATES-BLUEPRINT-001': {
    success_metrics: [
      { metric: 'Stage coverage', target: 'Stages 13-16 all have active analysisSteps with execute()' },
      { metric: 'Architecture synthesis', target: 'Stage 14 produces viable technical architecture' },
      { metric: 'Promotion gate', target: 'Stage 16 gate checks financial viability before BUILD phase' },
    ],
  },

  'SD-EVA-FEAT-TEMPLATES-BUILDLOOP-001': {
    success_metrics: [
      { metric: 'Stage coverage', target: 'Stages 17-22 all have active analysisSteps with execute()' },
      { metric: 'SD Bridge', target: 'Stage 18 creates LEO SDs via SD Bridge' },
      { metric: 'Chairman decision', target: 'Stage 22 creates release readiness decision and blocks' },
    ],
  },

  'SD-EVA-FEAT-TEMPLATES-LAUNCH-001': {
    success_metrics: [
      { metric: 'Stage coverage', target: 'Stages 23-25 all have active analysisSteps with execute()' },
      { metric: 'AARRR scorecard', target: 'Stage 24 produces metrics across all 5 AARRR categories' },
      { metric: 'Chairman decision', target: 'Stage 25 creates venture decision (continue/pivot/expand/sunset/exit)' },
    ],
  },
};

async function main() {
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const [sdKey, enrichment] of Object.entries(enrichments)) {
    // Get current data
    const { data, error: fetchErr } = await sb
      .from('strategic_directives_v2')
      .select('sd_key, description, success_criteria, success_metrics')
      .eq('sd_key', sdKey)
      .single();

    if (fetchErr || !data) {
      console.log(`SKIP: ${sdKey} not found`);
      skipped++;
      continue;
    }

    const updatePayload = {};

    // Update description if provided (preserve existing Reference Documents block)
    if (enrichment.description) {
      const existingDesc = data.description || '';
      const refDocsIdx = existingDesc.indexOf('\nReference Documents:');
      const refDocs = refDocsIdx >= 0 ? existingDesc.substring(refDocsIdx) : '';
      updatePayload.description = enrichment.description + refDocs;
    }

    // Update success_criteria if provided
    if (enrichment.success_criteria) {
      updatePayload.success_criteria = enrichment.success_criteria;
    }

    // Update success_metrics if provided
    if (enrichment.success_metrics) {
      updatePayload.success_metrics = enrichment.success_metrics;
    }

    if (Object.keys(updatePayload).length === 0) {
      console.log(`SKIP: ${sdKey} — no updates needed`);
      skipped++;
      continue;
    }

    const { error: updateErr } = await sb
      .from('strategic_directives_v2')
      .update(updatePayload)
      .eq('sd_key', sdKey);

    if (updateErr) {
      console.log(`ERROR: ${sdKey} — ${updateErr.message}`);
      errors++;
    } else {
      const fields = Object.keys(updatePayload).join(', ');
      console.log(`UPDATED: ${sdKey} [${fields}]`);
      updated++;
    }
  }

  console.log(`\nSummary: ${updated} updated, ${skipped} skipped, ${errors} errors`);
  console.log(`Total enrichments defined: ${Object.keys(enrichments).length}`);
}

const isMain = import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
if (isMain) main().catch(console.error);
