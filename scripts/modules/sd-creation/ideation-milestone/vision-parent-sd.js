/**
 * Vision Parent SD Data for EHG Ideation Milestone
 */

export const visionParentSD = {
  id: 'SD-IDEATION-VISION-001',
  sd_key: 'IDEATION-VISION-001',
  title: 'EHG Stages 1-6 Ideation Milestone Vision',
  version: '1.1',
  status: 'active',
  category: 'strategic',
  priority: 'critical',
  target_application: 'EHG',
  current_phase: 'LEAD',
  sd_type: 'feature',

  description: `Comprehensive vision for EHG Stages 1-6 (Ideation Milestone) transformation.
This parent SD establishes the strategic direction for fully autonomous venture ideation with AI-orchestrated
validation, competitive intelligence, and risk assessment. The vision encompasses EHG Holdings architecture
(Chairman, EVA, Board of Directors, Portfolios, Companies, Ventures) with CrewAI agents serving as
AI executives and shared services under EHG Corporate.

Target State: Chairman submits venture idea -> AI agents autonomously execute Stages 1-6 ->
Chairman approves/rejects at Stage 3.4 gate (Kill/Revise/Proceed). Zero manual intervention required
between submission and gate decision.`,

  strategic_intent: `Transform EHG venture ideation from manual, human-dependent process to fully autonomous
AI-orchestrated pipeline. Establish foundation for 40-stage workflow automation with Stages 1-6 as proof of concept.`,

  rationale: `Current venture ideation requires significant Chairman time for research, validation, and analysis.
AI agents can conduct market research, validate pain points, analyze competitors, and assess risks faster and
more comprehensively than manual processes. This frees Chairman to focus on strategic decisions at gates only.`,

  scope: `EHG application Stages 1-6 (Ideation Milestone):
- Stage 1: Enhanced Ideation (idea capture + AI enhancement)
- Stage 2: AI Review (multi-agent analysis)
- Stage 3: Comprehensive Validation (market + technical + strategic)
- Stage 4: Competitive Intelligence (AI-powered market mapping)
- Stage 5: Profitability Forecasting (financial modeling)
- Stage 6: Risk Evaluation (threat assessment + mitigation)
- Stage 3.4 Gate: Kill/Revise/Proceed decision point`,

  strategic_objectives: [
    'Establish fully autonomous ideation pipeline requiring zero manual intervention between submission and gate',
    'Deploy CrewAI agent hierarchy: CEO, VPs, Managers as venture executives',
    'Implement shared services model (Marketing, Legal, Finance) under EHG Corporate',
    'Enable portfolio context injection for synergy detection across ventures',
    'Achieve <2 minute idea submission to agent deployment',
    'Complete full 6-stage analysis in 15-45 minutes (tier-dependent)',
    'Deliver >=85% Chairman acceptance rate on AI recommendations',
    'Support graceful degradation when AI fails (expand manual controls)'
  ],

  success_criteria: [
    'Stages 1-6 execute without manual intervention',
    'CrewAI agents deployed and operational for all 6 stages',
    'Stage 3.4 gate presents actionable Kill/Revise/Proceed recommendation',
    'Portfolio context injected at Stage 4 (synergy detection)',
    'Venture archetypes (SaaS B2B, Marketplace, E-commerce, Content) accelerate validation',
    'Recursion engine enables non-linear stage flow (Stage 5->3 loops)',
    'All validation results stored in database (not markdown)',
    'Chairman dashboard shows real-time agent progress',
    'Error handling provides graceful degradation to manual controls'
  ],

  dependencies: [
    { type: 'internal', sd_id: null, description: 'Supabase database with RLS policies configured' },
    { type: 'internal', sd_id: null, description: 'CrewAI framework installed and operational' },
    { type: 'external', description: 'OpenAI API access for embeddings and LLM calls' },
    { type: 'external', description: 'Reddit API for pain point validation' }
  ],

  risks: [
    { id: 'R1', description: 'CrewAI agent execution may exceed cost budget', likelihood: 'medium', impact: 'high', mitigation: 'Implement cost caps per venture, tier-based LLM model selection' },
    { id: 'R2', description: 'AI recommendations may not align with Chairman preferences', likelihood: 'medium', impact: 'medium', mitigation: 'Learning loop captures Chairman feedback, adjusts agent prompts' },
    { id: 'R3', description: 'External API rate limits may slow Stage 4 competitive intel', likelihood: 'high', impact: 'medium', mitigation: 'Cache results, implement queue-based processing, fallback to LLM research' },
    { id: 'R4', description: 'Complex ventures may require more than 2 recursion iterations', likelihood: 'low', impact: 'low', mitigation: 'Allow Chairman override to force progression' }
  ],

  success_metrics: [
    { metric: 'autonomous_execution_rate', target: '>=95%', description: 'Percentage of ventures completing Stages 1-6 without manual intervention' },
    { metric: 'chairman_acceptance_rate', target: '>=85%', description: 'Percentage of AI recommendations accepted by Chairman' },
    { metric: 'stage_completion_time', target: '15-45 min', description: 'Time from submission to Stage 6 completion (tier-dependent)' },
    { metric: 'agent_confidence_score', target: '>=80%', description: 'Average confidence score across all agent analyses' },
    { metric: 'cost_per_venture', target: '<$2.00', description: 'Average API cost for full 6-stage analysis' }
  ],

  metadata: {
    is_parent: true,
    child_sd_ids: ['SD-IDEATION-DATA-001', 'SD-IDEATION-AGENTS-001', 'SD-IDEATION-PATTERNS-001'],
    grandchild_sd_ids: ['SD-IDEATION-STAGE1-001', 'SD-IDEATION-STAGE2-001', 'SD-IDEATION-STAGE3-001', 'SD-IDEATION-STAGE4-001', 'SD-IDEATION-STAGE5-001', 'SD-IDEATION-STAGE6-001'],
    vision_version: '1.1',
    ehg_holdings_architecture: {
      holding_company: 'EHG Holdings',
      corporate_entity: 'EHG Corporate (platform + shared services)',
      portfolio_structure: 'Portfolios -> Companies -> Ventures',
      ai_hierarchy: {
        chairman_assistant: 'EVA',
        board: 'Board of Directors (CrewAI agents)',
        company_leadership: 'AI CEO, VPs, Managers per company',
        shared_services: ['Marketing', 'Legal', 'Finance', 'Engineering']
      }
    },
    stage_mapping: {
      stage_1: 'SD-IDEATION-STAGE1-001',
      stage_2: 'SD-IDEATION-STAGE2-001',
      stage_3: 'SD-IDEATION-STAGE3-001',
      stage_4: 'SD-IDEATION-STAGE4-001',
      stage_5: 'SD-IDEATION-STAGE5-001',
      stage_6: 'SD-IDEATION-STAGE6-001'
    },
    implementation_layers: [
      'Layer 1 (Critical): Data Foundation + Agent Registry',
      'Layer 2 (High): Recursion Engine + Archetypes',
      'Layer 3 (High): Stage-specific implementations'
    ]
  },

  created_by: 'LEAD'
};
