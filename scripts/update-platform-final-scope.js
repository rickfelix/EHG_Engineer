#!/usr/bin/env node

/**
 * Final Update: SD-AGENT-PLATFORM-001 scope with 11 departments
 * Includes Agent Engineering (renamed from Admin) and new Investor Relations
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

async function updatePlatformFinalScope() {
  console.log('🔄 Updating SD-AGENT-PLATFORM-001 with final 11-department structure...');
  console.log('='.repeat(80));

  try {
    const { data: _data, error } = await supabase
      .from('strategic_directives_v2')
      .update({
        scope: 'EVA Assistant as central coordinator, 5 additional specialized agents, external data integrations (Reddit, HN, ProductHunt, Crunchbase), shared knowledge base with pgvector, CrewAI Flows orchestration, orchestration infrastructure (sessions, agent communications, actions), Complete SaaS organizational hierarchy with 11 AI agent departments: (1) Product Management, (2) Marketing, (3) Advertising, (4) Branding, (5) Sales, (6) Customer Success, (7) Finance, (8) Legal & Compliance, (9) Engineering, (10) Agent Engineering, (11) Investor Relations. CEO/COO executive agents, CrewAI hierarchical process with reports_to relationships, agent backstory system, task delegation framework, tool assignment per role, departmental coordination workflows',
        strategic_objectives: [
          // Original 11 objectives (preserved)
          'Preserve EVA Assistant as central coordinator while integrating with unified CrewAI agent platform',
          'Maintain existing orchestration infrastructure (eva_orchestration_sessions, eva_agent_communications, eva_actions, orchestration_metrics)',
          'Deploy 5 additional specialized research agents (total 9): Regulatory, Tech Feasibility, Idea Enhancement, Duplicate Detection, Financial Viability',
          'Integrate external data sources: Enhanced Reddit API, HackerNews, ProductHunt, Crunchbase',
          'Build shared knowledge base using Supabase pgvector for agent memory and learning',
          'Implement pattern recognition from Chairman feedback and past venture decisions',
          'Deploy CrewAI Flows for event-driven workflow orchestration',
          'Extend GenericRestConnector for all external API integrations',
          'Achieve 95%+ duplicate detection accuracy',
          'Deliver 60%+ reduction in venture ideation time vs manual process',
          'Build institutional knowledge with >100 learned patterns in first month',
          // Organizational hierarchy objectives (16)
          'Implement CrewAI hierarchical agent structure with reports_to relationships, delegation, and escalation capabilities',
          'Deploy CEO and COO executive agents for strategic oversight and operational coordination',
          'Build 11-department organizational structure mirroring best-in-class SaaS companies',
          'Deploy Product Management Department (Strategy, Marketing, UX Research, Analytics)',
          'Deploy Marketing Department (Content, SEO, Growth, Analytics)',
          'Deploy Advertising Department (Campaign Management, Media Buying, Ad Copy, Performance)',
          'Deploy Branding Department (Strategy, Copywriting, Website Content, Naming)',
          'Deploy Sales Department (SDR, Account Executive, Sales Engineering, Sales Ops)',
          'Deploy Customer Success Department (Onboarding, Support, Account Management, Success Analytics)',
          'Deploy Finance Department (FP&A, Pricing Strategy, Unit Economics, Revenue Ops)',
          'Deploy Legal & Compliance Department (Legal Structure, Compliance, Privacy, Terms)',
          'Deploy Technical/Engineering Department (Solutions Architecture, Dev Strategy, DevOps, Security, QA)',
          'Deploy Agent Engineering Department (Agent Configuration, Prompt Engineering, Performance Monitoring, Reliability, Lifecycle Management)',
          'Deploy Investor Relations Department (Investor Communications, Pitch Decks, Financial Reporting, Exit Strategy)',
          'Implement agent backstory management system for context-aware decision making and communication styles',
          'Build task delegation framework with hierarchical assignment and escalation rules',
          'Implement role-based tool assignment and access control system',
          'Integrate all departments with existing R&D Department and Creative Media workflows',
          'Deploy AI Agent Management system for agent performance monitoring and optimization'
        ],
        updated_at: new Date().toISOString()
      })
      .eq('id', 'SD-AGENT-PLATFORM-001')
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Successfully updated SD-AGENT-PLATFORM-001 with 11 departments!');
    console.log('\n📊 Updated Scope:');
    console.log(data.scope);
    console.log(`\n🎯 Strategic Objectives: ${data.strategic_objectives.length} total`);
    console.log('\n🏢 11 Departments:');
    console.log('  1. Product Management');
    console.log('  2. Marketing');
    console.log('  3. Advertising');
    console.log('  4. Branding');
    console.log('  5. Sales');
    console.log('  6. Customer Success');
    console.log('  7. Finance');
    console.log('  8. Legal & Compliance');
    console.log('  9. Engineering');
    console.log(' 10. Agent Engineering (renamed from Admin)');
    console.log(' 11. Investor Relations (NEW)');
    console.log('='.repeat(80));

    return data;
  } catch (_error) {
    console.error('❌ Error updating SD:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  updatePlatformFinalScope();
}

export { updatePlatformFinalScope };
