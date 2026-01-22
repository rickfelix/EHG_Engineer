/**
 * Orchestrator SD for Blind Spots Research
 */

import { randomUUID } from 'crypto';
import { childSDs } from './child-sds.js';

export function createOrchestratorData() {
  return {
    id: 'SD-BLIND-SPOTS-001',
    title: 'Blind Spots Research Orchestrator',
    description: 'Master Strategic Directive orchestrating the resolution of 6 blind spots identified during venture selection triangulation research. These blind spots represent critical gaps that must be addressed for EHG to scale from 1 to 32+ concurrent ventures. The Oracle\'s Warning: "The math works, but the Psychology is the bottleneck."',
    rationale: 'Triangulation research (OpenAI + Gemini + Claude Code) identified 6 blind spots that none of the AIs initially addressed. These gaps become increasingly critical as the portfolio scales: (1) EVA needed at 4+ ventures, (2) Legal foundation prevents liability exposure, (3) Pricing patterns enable vending machine model, (4) Failure learning prevents repeated mistakes, (5) Skills inventory prevents overreach, (6) Pattern deprecation maintains library health. This orchestrator SD coordinates resolution of all 6 in priority order.',

    scope: JSON.stringify({
      included: [
        'EVA Operating System (Multi-Venture Portfolio Management)',
        'Legal/Compliance Foundation (Series LLC, Templates, GDPR)',
        'Pricing Pattern Library (Patterns, Framework, Testing)',
        'Failure Learning System (Post-mortems, Anti-patterns, Feedback)',
        'Skills Inventory (Capability Ledger, Decision Framework)',
        'Pattern Deprecation (Lifecycle, Metrics)'
      ],
      excluded: [
        'Venture creation workflow (exists)',
        'Genesis pipeline (separate SD)',
        'External integrations beyond core requirements'
      ],
      boundaries: [
        'Each child SD goes through full LEAD->PLAN->EXEC',
        'Priority order determines execution sequence',
        'Dependencies respected across children'
      ]
    }),

    category: 'infrastructure',
    priority: 'critical',
    status: 'draft',
    sd_key: 'SD-BLIND-SPOTS-001',
    target_application: 'EHG',
    current_phase: 'LEAD',
    sd_type: 'orchestrator',

    strategic_intent: 'Build the infrastructure required to scale EHG from a single venture to a 32+ venture holding company, addressing the psychological and operational bottlenecks identified by the Oracle\'s Warning.',

    strategic_objectives: [
      'Implement EVA as the holding company operating system',
      'Establish legal foundation with Series LLC and compliance patterns',
      'Create pricing patterns compatible with vending machine model',
      'Build failure learning system to prevent repeated mistakes',
      'Document skills inventory and acquisition framework',
      'Implement pattern deprecation lifecycle'
    ],

    success_criteria: [
      'EVA dashboard operational with health grid for all ventures',
      'Series LLC formed with venture isolation',
      'Pricing patterns enable revenue from transaction #1',
      'Post-mortems generated for all killed ventures',
      'Skills gaps visible before venture selection',
      'Pattern health tracked with deprecation signals'
    ],

    key_changes: [
      '15+ new database tables across all children',
      '20+ new UI components',
      '10+ new services/patterns',
      'Legal entity structure',
      'Compliance automation'
    ],

    key_principles: [
      'Oracle\'s Warning: Psychology is the bottleneck, not math',
      'Management by Exception: Only surface deviations',
      'Decentralized ops, centralized metrics (Constellation model)',
      'Vending machine pricing: Revenue from transaction #1',
      'Blameless post-mortems: Focus on process not people',
      'Freeze & fork: Don\'t force migration for legacy'
    ],

    created_by: 'LEAD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    uuid_id: randomUUID(),
    version: '1.0',
    phase_progress: 0,
    progress: 0,
    is_active: true,

    dependencies: [
      'Existing scaffold_patterns table (45 patterns)',
      'Existing CrewAI infrastructure',
      'Admin dashboard for UI components',
      'Supabase for database'
    ],

    risks: [
      { description: 'EVA scope creep - trying to automate too much', mitigation: 'Strict guardrails, Class A/B/C decision routing', severity: 'high' },
      { description: 'Legal structure complexity', mitigation: 'Use Series LLC template, consult attorney', severity: 'medium' },
      { description: 'Over-engineering failure learning', mitigation: 'Keep post-mortems simple, focus on action items', severity: 'low' }
    ],

    success_metrics: [
      'Can manage 32 ventures without burnout',
      'Legal liability isolated per venture',
      'Pricing decision time < 30 minutes',
      'Every failure produces pattern improvement',
      'Skill gaps detected before commitment',
      'Pattern library health score > 80%'
    ],

    implementation_guidelines: [
      'Execute in priority order: EVA -> Legal -> Pricing -> Failure -> Skills -> Deprecation',
      'EVA blocks Failure Learning (needs post-mortem auto-draft)',
      'Each child SD has grandchildren for detailed implementation',
      'All SDs go through LEAD->PLAN->EXEC',
      'Reference: docs/research/triangulation-blind-spots-synthesis.md'
    ],

    metadata: {
      origin: 'Triangulation Research (OpenAI + Gemini + Claude Code)',
      research_documents: [
        'docs/prompts/triangulation-blind-spots-unified.md',
        'docs/research/triangulation-blind-spots-openai-response.md',
        'docs/research/triangulation-blind-spots-gemini-response.md',
        'docs/research/triangulation-blind-spots-claude-response.md',
        'docs/research/triangulation-blind-spots-synthesis.md'
      ],
      triangulation_date: '2026-01-01',
      oracle_warning: {
        quote: 'The math works, but the Psychology is the bottleneck.',
        milestones: [
          { ventures: 1, timeline: 'Start', need: 'Fun, manageable' },
          { ventures: 4, timeline: 'May', need: 'Unified Customer Support Dashboard' },
          { ventures: 16, timeline: 'Sept', need: 'Automated CFO Agent' },
          { ventures: 32, timeline: 'Nov', need: 'CEO of Holding Company (not Architect)' }
        ],
        management_cliff: '8-12 ventures without EVA',
        with_eva: '32+ ventures manageable'
      },
      triangulation_consensus: {
        unanimous: [
          'EVA is #1 priority',
          'Traffic light health grid',
          'Series LLC for legal structure',
          'Decentralized ops, centralized metrics',
          'Pattern deprecation is lowest priority'
        ],
        resolved_disagreements: [
          { topic: 'Maintenance ratio', resolution: '70/30 (compromise)' },
          { topic: 'SOC 2 trigger', resolution: '>$20K enterprise deal' },
          { topic: 'A/B testing', resolution: 'Painted Door early, 100+ later' }
        ]
      },
      prioritization: {
        rankings: [
          { rank: 1, id: 'SD-BLIND-SPOT-EVA-001', urgency: 'CRITICAL', impact: 'CRITICAL', effort: 'HIGH' },
          { rank: 2, id: 'SD-BLIND-SPOT-LEGAL-001', urgency: 'HIGH', impact: 'HIGH', effort: 'MEDIUM' },
          { rank: 3, id: 'SD-BLIND-SPOT-PRICING-001', urgency: 'HIGH', impact: 'MEDIUM', effort: 'LOW' },
          { rank: 4, id: 'SD-BLIND-SPOT-FAILURE-001', urgency: 'MEDIUM', impact: 'HIGH', effort: 'MEDIUM' },
          { rank: 5, id: 'SD-BLIND-SPOT-SKILLS-001', urgency: 'LOW', impact: 'MEDIUM', effort: 'LOW' },
          { rank: 6, id: 'SD-BLIND-SPOT-DEPRECATION-001', urgency: 'LOW', impact: 'MEDIUM', effort: 'MEDIUM' }
        ]
      },
      child_sds: childSDs,
      child_count: childSDs.length,
      grandchild_count: childSDs.reduce((acc, child) => acc + child.grandchildren.length, 0),
      dependency_graph: {
        'SD-BLIND-SPOT-EVA-001': [],
        'SD-BLIND-SPOT-LEGAL-001': [],
        'SD-BLIND-SPOT-PRICING-001': [],
        'SD-BLIND-SPOT-FAILURE-001': ['SD-BLIND-SPOT-EVA-001'],
        'SD-BLIND-SPOT-SKILLS-001': [],
        'SD-BLIND-SPOT-DEPRECATION-001': []
      },
      execution_order: [
        'SD-BLIND-SPOT-EVA-001',
        'SD-BLIND-SPOT-LEGAL-001',
        'SD-BLIND-SPOT-PRICING-001',
        'SD-BLIND-SPOT-FAILURE-001',
        'SD-BLIND-SPOT-SKILLS-001',
        'SD-BLIND-SPOT-DEPRECATION-001'
      ],
      effort_summary: {
        total_sessions: '19-24 sessions',
        by_child: [
          { id: 'SD-BLIND-SPOT-EVA-001', sessions: '6-8' },
          { id: 'SD-BLIND-SPOT-LEGAL-001', sessions: '3-4' },
          { id: 'SD-BLIND-SPOT-PRICING-001', sessions: '3-4' },
          { id: 'SD-BLIND-SPOT-FAILURE-001', sessions: '3-4' },
          { id: 'SD-BLIND-SPOT-SKILLS-001', sessions: '2' },
          { id: 'SD-BLIND-SPOT-DEPRECATION-001', sessions: '2' }
        ]
      }
    }
  };
}
