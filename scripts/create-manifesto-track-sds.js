#!/usr/bin/env node

/**
 * Create Strategic Directives for EVA Manifesto Track
 * Operation "Red Spike" - From Physics to Law
 * Target: Feb 14, 2026 Manifesto Activation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const MANIFESTO_SDS = [
  {
    id: 'SD-MANIFESTO-001',
    sd_key: 'SD-MANIFESTO-001',
    title: 'EVA Manifesto Document Creation',
    status: 'draft',
    category: 'strategic',
    priority: 'critical',
    sd_type: 'documentation',
    description: `Create the unified EVA Manifesto v1.0 internal doctrine document by synthesizing 7 Vision V2 specs into a cohesive narrative.

The Manifesto is the "Doctrine of the Sovereign Venture" - the codification of the rules, ethics, and operational logic that will govern this ecosystem for the next decade.`,
    strategic_intent: 'Transform Architecture v9.0.0 technical hardening into codified law that governs autonomous agent behavior.',
    rationale: 'The technical infrastructure is built (RLS, governance, agent hierarchy). What\'s missing is the unified philosophical document that transforms technical constraints into ethical law.',
    scope: `IN SCOPE:
- Chairman's Preface (why this doctrine exists)
- Preamble (EVA's purpose and self-understanding)
- Part I: The Constitution (Prime Directives + Four Oaths)
- Part II: The Economic Doctrine (tokens + kill switches)
- Part III: The Self-Replication Protocol (safe scaling)
- Part IV: Continuity & Succession (Hard Halt Protocol)
- Technical Appendix (cross-references to specs)

OUT OF SCOPE:
- Public-facing documentation (internal only)
- Implementation code (covered by SD-MANIFESTO-002, 003, 004)`,
    key_changes: JSON.stringify([
      { change: 'Synthesize 7 Vision specs into unified Manifesto', impact: 'Creates single source of truth for agent governance' },
      { change: 'Define the Four Oaths', impact: 'Establishes ethical framework for all agents' },
      { change: 'Document authority matrix as doctrine', impact: 'Transforms technical limits into philosophical law' }
    ]),
    dependencies: JSON.stringify([
      { dependency: 'SD-EVA-DECISION-001', type: 'technical', status: 'ready', reason: 'EVA L0 must exist to document its behavior' }
    ]),
    success_criteria: JSON.stringify([
      { criterion: 'Manifesto document at docs/doctrine/EVA_MANIFESTO_v1.md', measure: 'File exists with all 4 parts' },
      { criterion: 'All 4 Oaths defined', measure: 'Each oath has text, rationale, and enforcement mechanism' },
      { criterion: 'Chairman review passed', measure: 'LEAD approval on Manifesto content' }
    ]),
    target_application: 'EHG_Engineer',
    complexity_level: 'complex',
    current_phase: 'LEAD_APPROVAL',
    created_by: 'LEAD'
  },
  {
    id: 'SD-MANIFESTO-002',
    sd_key: 'SD-MANIFESTO-002',
    title: 'Hard Halt Protocol Implementation',
    status: 'draft',
    category: 'infrastructure',
    priority: 'critical',
    sd_type: 'infrastructure',
    description: `Implement the Hard Halt Protocol - the mechanism that pauses all autonomous operations if the Chairman becomes unavailable.

This is the succession protocol that ensures the system fails safe rather than continuing without governance authority.`,
    strategic_intent: 'Ensure system safety by implementing automatic halt when governance authority is unavailable.',
    rationale: 'Autonomous agents must not continue making decisions without Chairman oversight. The Hard Halt is a safety mechanism that preserves system state and queues decisions until authority is restored.',
    scope: `IN SCOPE:
- Hard Halt activation mechanism (lib/governance/hard-halt-protocol.js)
- Manual trigger capability
- Dead-man switch with 72-hour configurable timeout
- Venture CEO maintenance mode transition
- L2+ autonomy operation blocking
- Notification system for halt activation
- Restoration procedure documentation

OUT OF SCOPE:
- Succession to new Chairman (requires human decision)
- Automatic recovery without authority`,
    key_changes: JSON.stringify([
      { change: 'Create hard-halt-protocol.js', impact: 'System can pause all autonomous operations on command' },
      { change: 'Dead-man switch mechanism', impact: 'Auto-halt if no Chairman activity for 72 hours' },
      { change: 'Maintenance mode for CEOs', impact: 'Ventures freeze at current stage during halt' }
    ]),
    dependencies: JSON.stringify([
      { dependency: 'SD-EVA-CIRCUIT-001', type: 'technical', status: 'blocked', reason: 'Circuit breaker infrastructure needed for halt mechanism' }
    ]),
    success_criteria: JSON.stringify([
      { criterion: 'Hard Halt can be triggered manually', measure: 'API call successfully halts all L2+ operations' },
      { criterion: 'Dead-man switch operational', measure: 'Auto-triggers after configurable timeout' },
      { criterion: 'Ventures enter maintenance mode', measure: 'No stage auto-advance during halt' },
      { criterion: 'Restoration procedure works', measure: 'System resumes after Chairman re-authentication' }
    ]),
    target_application: 'EHG_Engineer',
    complexity_level: 'complex',
    current_phase: 'LEAD_APPROVAL',
    created_by: 'LEAD'
  },
  {
    id: 'SD-MANIFESTO-003',
    sd_key: 'SD-MANIFESTO-003',
    title: 'Four Oaths Enforcement Triggers',
    status: 'draft',
    category: 'infrastructure',
    priority: 'high',
    sd_type: 'infrastructure',
    description: `Implement database triggers and runtime checks that enforce the Four Oaths of the EVA Manifesto.

The Four Oaths:
1. Oath of Transparency - All agent decisions must be logged with reasoning
2. Oath of Boundaries - Never exceed defined authority matrix
3. Oath of Escalation Integrity - Escalate honestly, never strategically
4. Oath of Non-Deception - Never misrepresent confidence or capability`,
    strategic_intent: 'Transform philosophical oaths into enforceable technical constraints.',
    rationale: 'Oaths without enforcement are merely suggestions. Each oath must have corresponding database triggers and runtime checks that detect and log violations.',
    scope: `IN SCOPE:
- Database trigger on system_events enforcing decision logging (Oath 1)
- Pre-execution authority check in crew-governance-wrapper.js (Oath 2)
- Escalation audit trail enhancement in system_events (Oath 3)
- Confidence bounds validation on agent outputs (Oath 4)
- Oath violation alerts to compliance_alerts table

OUT OF SCOPE:
- Punitive measures for violations (alerts only)
- UI for viewing violations (future SD)`,
    key_changes: JSON.stringify([
      { change: 'Transparency trigger on system_events', impact: 'Every agent decision logged with reasoning' },
      { change: 'Authority boundary check enhanced', impact: 'Pre-execution validation of capability' },
      { change: 'Escalation audit trail', impact: 'Tracks escalation patterns for integrity analysis' },
      { change: 'Confidence validation', impact: 'Prevents over-confident agent outputs' }
    ]),
    dependencies: JSON.stringify([
      { dependency: 'SD-MANIFESTO-001', type: 'business', status: 'blocked', reason: 'Oaths must be formally defined before enforcement' }
    ]),
    success_criteria: JSON.stringify([
      { criterion: 'Oath 1 enforced', measure: 'System_events has reasoning_log field populated' },
      { criterion: 'Oath 2 enforced', measure: 'Authority violations blocked pre-execution' },
      { criterion: 'Oath 3 enforced', measure: 'Escalation patterns tracked in system_events' },
      { criterion: 'Oath 4 enforced', measure: 'Confidence bounds checked on outputs' }
    ]),
    target_application: 'EHG_Engineer',
    complexity_level: 'complex',
    current_phase: 'LEAD_APPROVAL',
    created_by: 'LEAD'
  },
  {
    id: 'SD-MANIFESTO-004',
    sd_key: 'SD-MANIFESTO-004',
    title: 'Manifesto Mode Activation System',
    status: 'draft',
    category: 'infrastructure',
    priority: 'high',
    sd_type: 'infrastructure',
    description: `Create the ceremonial and technical activation of "Manifesto Mode" - the operational state where the EVA Manifesto governs all agent behavior.

Target activation date: February 14, 2026`,
    strategic_intent: 'Mark the transition from technical hardening to doctrine-governed operations.',
    rationale: `The Manifesto must have a formal activation moment that:
1. Records the "Constitution Signing" in system history
2. Enables manifesto_active flag for runtime checks
3. Establishes the version of doctrine in effect`,
    scope: `IN SCOPE:
- manifesto_active flag in system configuration
- "Constitution Signing" transaction in system_events
- Manifesto version tracking in database
- All agents check manifesto_active before L2+ operations
- Activation date recording (Feb 14, 2026)

OUT OF SCOPE:
- Manifesto document content (SD-MANIFESTO-001)
- Hard Halt Protocol (SD-MANIFESTO-002)
- Oath enforcement (SD-MANIFESTO-003)`,
    key_changes: JSON.stringify([
      { change: 'manifesto_active configuration flag', impact: 'Runtime check for doctrine mode' },
      { change: 'Constitution Signing event', impact: 'Immutable record of activation moment' },
      { change: 'Version tracking', impact: 'Enables future doctrine amendments' }
    ]),
    dependencies: JSON.stringify([
      { dependency: 'SD-MANIFESTO-001', type: 'business', status: 'blocked', reason: 'Manifesto document must exist' },
      { dependency: 'SD-MANIFESTO-002', type: 'technical', status: 'blocked', reason: 'Hard Halt must be operational' }
    ]),
    success_criteria: JSON.stringify([
      { criterion: 'Activation flag operational', measure: 'manifesto_active can be toggled' },
      { criterion: 'Signing event recorded', measure: 'system_events has CONSTITUTION_SIGNED event' },
      { criterion: 'Version tracked', measure: 'manifesto_version in database = 1.0' },
      { criterion: 'Agents check flag', measure: 'L2+ ops blocked when manifesto_active=false' }
    ]),
    target_application: 'EHG_Engineer',
    complexity_level: 'moderate',
    current_phase: 'LEAD_APPROVAL',
    created_by: 'LEAD'
  }
];

async function createManifestoSDs() {
  console.log('===========================================');
  console.log('  OPERATION "RED SPIKE" - SD CREATION');
  console.log('  Track: MANIFESTO');
  console.log('  Target: Feb 14, 2026');
  console.log('===========================================\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('Creating 4 Manifesto Track Strategic Directives...\n');

  for (const sd of MANIFESTO_SDS) {
    try {
      // Check if already exists
      const { data: existing } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('id', sd.id)
        .single();

      if (existing) {
        console.log(`[SKIP] ${sd.id} already exists`);
        continue;
      }

      // Insert new SD
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .insert(sd)
        .select()
        .single();

      if (error) {
        console.error(`[ERROR] ${sd.id}: ${error.message}`);
        continue;
      }

      console.log(`[CREATED] ${sd.id}: ${sd.title}`);
      console.log(`          Priority: ${sd.priority.toUpperCase()}`);
      console.log(`          Type: ${sd.sd_type}`);
      console.log(`          Dependencies: ${JSON.parse(sd.dependencies).map(d => d.dependency).join(', ') || 'None'}`);
      console.log('');

    } catch (err) {
      console.error(`[ERROR] ${sd.id}: ${err.message}`);
    }
  }

  console.log('-------------------------------------------');
  console.log('Manifesto Track SDs creation complete.');
  console.log('');
  console.log('Next steps:');
  console.log('1. Run "npm run sd:next" to see updated queue');
  console.log('2. Complete dependencies to unblock Manifesto SDs');
  console.log('3. Target: Manifesto Activation Feb 14, 2026');
  console.log('-------------------------------------------');
}

createManifestoSDs().catch(console.error);
