#!/usr/bin/env node

/**
 * Update SD-AGENT-PLATFORM-001 to include CrewAI Organizational Hierarchy
 * Adds 10-department structure with 50+ AI agents
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

async function updateSDScope() {
  console.log('🔄 Updating SD-AGENT-PLATFORM-001 with CrewAI Organizational Hierarchy...');
  console.log('='.repeat(80));

  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .update({
        scope: 'EVA Assistant as central coordinator, 5 additional specialized agents, external data integrations (Reddit, HN, ProductHunt, Crunchbase), shared knowledge base with pgvector, CrewAI Flows orchestration, orchestration infrastructure (sessions, agent communications, actions), Complete SaaS organizational hierarchy with 10 AI agent departments (Product, Marketing, Advertising, Branding, Sales, Customer Success, Finance, Legal, Engineering, AI Agent Management), CEO/COO executive agents, CrewAI hierarchical process with reports_to relationships, agent backstory system, task delegation framework, tool assignment per role, departmental coordination workflows',
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
          // New 16 objectives (organizational hierarchy)
          'Implement CrewAI hierarchical agent structure with reports_to relationships, delegation, and escalation capabilities',
          'Deploy CEO and COO executive agents for strategic oversight and operational coordination',
          'Build 10-department organizational structure mirroring best-in-class SaaS companies',
          'Deploy Product Management Department (Strategy, Marketing, UX Research, Analytics)',
          'Deploy Marketing Department (Content, SEO, Growth, Analytics)',
          'Deploy Advertising Department (Campaign Management, Media Buying, Ad Copy, Performance)',
          'Deploy Branding Department (Strategy, Copywriting, Website Content, Naming)',
          'Deploy Sales Department (SDR, Account Executive, Sales Engineering, Sales Ops)',
          'Deploy Customer Success Department (Onboarding, Support, Account Management, Success Analytics)',
          'Deploy Finance Department (FP&A, Pricing Strategy, Unit Economics, Revenue Ops)',
          'Deploy Legal & Compliance Department (Legal Structure, Compliance, Privacy, Terms)',
          'Deploy Technical/Engineering Department (Solutions Architecture, Dev Strategy, DevOps, Security, QA)',
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

    console.log('✅ Successfully updated SD-AGENT-PLATFORM-001!');
    console.log('\n📊 Updated Scope:');
    console.log(data.scope);
    console.log(`\n🎯 Strategic Objectives: ${data.strategic_objectives.length} total (11 original + 16 organizational hierarchy)`);
    console.log('\nNew Organizational Objectives:');
    data.strategic_objectives.slice(11).forEach((obj, i) => {
      console.log(`${i + 12}. ${obj}`);
    });
    console.log('='.repeat(80));

    return data;
  } catch (error) {
    console.error('❌ Error updating SD:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  updateSDScope();
}

export { updateSDScope };
