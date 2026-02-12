import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Map each SD to its relevant architecture doc sections and vision doc sections
const docRefs = {
  // Phase A Orchestrator
  'SD-EVA-ORCH-PHASE-A-001': {
    arch: 'Section 13 (Implementation Sequence, Phase A items 1-6), Section 13.1 (Test Scenario: 15-step validation)',
    vision: 'Section 3 (Hybrid Runtime Model), Section 5 (CLI-First Architecture)',
  },
  // Phase A Children
  'SD-EVA-FEAT-CHAIRMAN-API-001': {
    arch: 'Section 13 items 1-2 (Chairman Decision API + Interactive Review), Section 6 (Chairman Governance)',
    vision: 'Section 4 (Chairman Decision Gates at Stages 0, 10, 22, 25)',
  },
  'SD-EVA-ORCH-TEMPLATE-GAPFILL-001': {
    arch: 'Section 13 item 5 (Stage Template Gap-Fill), Section 8 (25-Stage Target Schemas)',
    vision: 'Section 2 (25-Stage Lifecycle)',
  },
  'SD-EVA-FEAT-EVENT-BUS-001': {
    arch: 'Section 13 item 6 (Event Bus Handler Wiring), Section 5 (Event-Driven Architecture)',
    vision: 'Section 3 (Hybrid Runtime: event-driven + scheduled)',
  },
  'SD-EVA-FEAT-RETURN-PATH-001': {
    arch: 'Section 13 item 4 (Return Path: LEO SD completion to Stage 19 progress sync)',
    vision: 'Section 6 (SD Bridge: LEO Protocol integration)',
  },
  'SD-EVA-FEAT-CLI-DISPATCHER-001': {
    arch: 'Section 13 item 3 (CLI Task Dispatcher: eva run <venture_id>)',
    vision: 'Section 5 (CLI-First Architecture)',
  },
  'SD-EVA-FEAT-PHASE-A-VALIDATION-001': {
    arch: 'Section 13.1 (Test Scenario: 15-step end-to-end validation sequence)',
    vision: 'Full lifecycle validation: Stage 0 through Stage 25',
  },
  // Template Gap-Fill Children (B-1 through B-6)
  'SD-EVA-FEAT-TEMPLATES-TRUTH-001': {
    arch: 'Section 8 Stages 1-5 (THE TRUTH: hydration, multi-persona analysis, hybrid scoring, competitive landscape, financial model)',
    vision: 'Section 2.1 (THE TRUTH phase: kill gates at Stages 3 and 5)',
  },
  'SD-EVA-FEAT-TEMPLATES-ENGINE-001': {
    arch: 'Section 8 Stages 6-9 (THE ENGINE: risk identification, revenue model, BMC generation, exit strategy)',
    vision: 'Section 2.2 (THE ENGINE phase: Reality Gate at Stage 9)',
  },
  'SD-EVA-FEAT-TEMPLATES-IDENTITY-001': {
    arch: 'Section 8 Stages 10-12 (THE IDENTITY: brand analysis + Chairman decision, GTM strategy, sales pipeline)',
    vision: 'Section 2.3 (THE IDENTITY phase: Reality Gate at Stage 12)',
  },
  'SD-EVA-FEAT-TEMPLATES-BLUEPRINT-001': {
    arch: 'Section 8 Stages 13-16 (THE BLUEPRINT: roadmap, architecture synthesis, resource planning, financial projections)',
    vision: 'Section 2.4 (THE BLUEPRINT phase: Promotion gate at Stage 16)',
  },
  'SD-EVA-FEAT-TEMPLATES-BUILDLOOP-001': {
    arch: 'Section 8 Stages 17-22 (THE BUILD LOOP: pre-build, sprint planning + SD Bridge, build execution, QA, review, release readiness)',
    vision: 'Section 2.5 (THE BUILD LOOP phase: Chairman decision at Stage 22)',
  },
  'SD-EVA-FEAT-TEMPLATES-LAUNCH-001': {
    arch: 'Section 8 Stages 23-25 (LAUNCH & LEARN: launch brief, AARRR scorecard, venture decision + Chairman)',
    vision: 'Section 2.6 (LAUNCH & LEARN phase: Chairman decision at Stage 25)',
  },
  // Phase B Orchestrator
  'SD-EVA-ORCH-PHASE-B-001': {
    arch: 'Section 13 (Implementation Sequence, Phase B items 7-10)',
    vision: 'Section 3 (Automated Scheduling), Section 4 (Chairman Dashboard)',
  },
  // Phase B Children
  'SD-EVA-FEAT-SCHEDULER-001': {
    arch: 'Section 13 item 7 (EVA Master Scheduler: priority queue + cadence management)',
    vision: 'Section 3 (Hybrid Runtime: scheduled execution)',
  },
  'SD-EVA-FEAT-CHAIRMAN-DASHBOARD-001': {
    arch: 'Section 13 item 8 (Chairman Dashboard: decision queue + health heatmap + event feed)',
    vision: 'Section 4 (EHG App Integration: Chairman Dashboard)',
  },
  'SD-EVA-FEAT-NOTIFICATION-001': {
    arch: 'Section 13 item 9 (Chairman Notification Service: immediate + daily digest + weekly push)',
    vision: 'Section 4 (Chairman Governance: notification channels)',
  },
  'SD-EVA-FEAT-DFE-PRESENTATION-001': {
    arch: 'Section 13 item 10 (DFE Escalation Presentation: context + mitigations in dashboard)',
    vision: 'Section 4 (Escalation Panel in EHG App)',
  },
  // Phase C Orchestrator
  'SD-EVA-ORCH-PHASE-C-001': {
    arch: 'Section 13 (Implementation Sequence, Phase C items 11-17)',
    vision: 'Section 3 (Platform Capabilities), Section 9 (Marketing Engine)',
  },
  // Phase C Children
  'SD-EVA-FEAT-EVENT-MONITOR-001': {
    arch: 'Section 13 item 11 (Event-driven venture monitor: Supabase Realtime + cron scheduler)',
    vision: 'Section 3 (Hybrid Runtime Model)',
  },
  'SD-EVA-FEAT-DASHBOARD-WIRING-001': {
    arch: 'Section 13 item 12 (Dashboard wiring: EHG App DecisionsInbox to chairman_decisions)',
    vision: 'Section 4 (EHG App Integration: remove 25-stage GUI components)',
  },
  'SD-EVA-FEAT-TOOL-POLICIES-001': {
    arch: 'Section 13 item 13 (Per-agent tool policy profiles: full/coding/readonly/minimal)',
    vision: 'Section 7 (OpenClaw D3: Tool Policies)',
  },
  'SD-EVA-FEAT-SKILL-PACKAGING-001': {
    arch: 'Section 13 item 14 (Skill packaging system: SKILL.md format, versioned bundles)',
    vision: 'Section 7 (OpenClaw D4: Skill Packaging)',
  },
  'SD-EVA-FEAT-SEMANTIC-SEARCH-001': {
    arch: 'Section 13 item 15 (Hybrid semantic search: SQLite vector index, Ollama embeddings, BM25 fallback)',
    vision: 'Section 7 (OpenClaw D6: Semantic Search)',
  },
  'SD-EVA-FEAT-MARKETING-FOUNDATION-001': {
    arch: 'Section 13 item 16 (Marketing Engine data foundation + publisher: DB schema, content generator, publisher abstraction)',
    vision: 'Section 9 (Marketing Engine: platform support, content generation, UTM attribution)',
  },
  'SD-EVA-FEAT-MARKETING-AI-001': {
    arch: 'Section 13 item 17 (Marketing Engine AI feedback loop + assets: Thompson Sampling, 3 cadences, video, email)',
    vision: 'Section 9 (Marketing Engine: AI optimization, asset pipeline, metrics)',
  },
  // Phase D Orchestrator
  'SD-EVA-ORCH-PHASE-D-001': {
    arch: 'Section 13 (Implementation Sequence, Phase D items 18-19)',
    vision: 'Section 8 (Portfolio Intelligence)',
  },
  // Phase D Children
  'SD-EVA-FEAT-VENTURE-TEMPLATES-001': {
    arch: 'Section 13 item 18 (Venture template system: pattern extraction + application)',
    vision: 'Section 8 (Cross-Venture Learning)',
  },
  'SD-EVA-FEAT-DEPENDENCY-MANAGER-001': {
    arch: 'Section 13 item 19 (Inter-venture dependency manager: dependency graph + auto-blocking)',
    vision: 'Section 8 (Portfolio Management: venture dependencies)',
  },
  // Phase E Orchestrator
  'SD-EVA-ORCH-PHASE-E-001': {
    arch: 'Section 13 (Implementation Sequence, Phase E items 20-22)',
    vision: 'Section 10 (Optimization Layer)',
  },
  // Phase E Children
  'SD-EVA-FEAT-SHARED-SERVICES-001': {
    arch: 'Section 13 item 20 (Shared services abstraction: common service interface)',
    vision: 'Section 10 (DRY pattern across EVA services)',
  },
  'SD-EVA-FEAT-EXPAND-SPINOFF-001': {
    arch: 'Section 13 item 21 (Expand-vs-spinoff evaluator: DFE-based scope assessment at Stage 25)',
    vision: 'Section 10 (Venture lifecycle: expand vs spinoff decision)',
  },
  'SD-EVA-FEAT-PORTFOLIO-OPT-001': {
    arch: 'Section 13 item 22 (Advanced portfolio optimization: resource contention, priority re-ranking)',
    vision: 'Section 10 (Portfolio-level optimization)',
  },
};

async function main() {
  const archDoc = 'docs/plans/eva-platform-architecture.md';
  const visionDoc = 'docs/plans/eva-venture-lifecycle-vision.md';

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const [sdKey, refs] of Object.entries(docRefs)) {
    // Get current description
    const { data, error: fetchErr } = await sb
      .from('strategic_directives_v2')
      .select('sd_key, description')
      .eq('sd_key', sdKey)
      .single();

    if (fetchErr || !data) {
      console.log(`SKIP: ${sdKey} not found in database`);
      skipped++;
      continue;
    }

    // Check if already has references
    if (data.description && data.description.includes(archDoc)) {
      console.log(`SKIP: ${sdKey} already has architecture doc reference`);
      skipped++;
      continue;
    }

    // Build reference block
    const refBlock = [
      '',
      'Reference Documents:',
      `- Architecture: ${archDoc} — ${refs.arch}`,
      `- Vision: ${visionDoc} — ${refs.vision}`,
    ].join('\n');

    const newDescription = (data.description || '') + refBlock;

    const { error: updateErr } = await sb
      .from('strategic_directives_v2')
      .update({ description: newDescription })
      .eq('sd_key', sdKey);

    if (updateErr) {
      console.log(`ERROR: ${sdKey} — ${updateErr.message}`);
      errors++;
    } else {
      console.log(`UPDATED: ${sdKey}`);
      updated++;
    }
  }

  console.log(`\nSummary: ${updated} updated, ${skipped} skipped, ${errors} errors`);
}

const isMain = import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
if (isMain) main().catch(console.error);
