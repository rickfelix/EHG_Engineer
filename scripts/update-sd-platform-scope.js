#!/usr/bin/env node

/**
 * Update SD-AGENT-PLATFORM-001 to emphasize EVA's coordinator role
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

async function updateSDScope() {
  console.log('🔄 Updating SD-AGENT-PLATFORM-001 scope...');
  console.log('='.repeat(80));

  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .update({
        scope: 'EVA Assistant as central coordinator, 5 additional specialized agents, external data integrations (Reddit, HN, ProductHunt, Crunchbase), shared knowledge base with pgvector, CrewAI Flows orchestration, orchestration infrastructure (sessions, agent communications, actions)',
        strategic_objectives: [
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
          'Build institutional knowledge with >100 learned patterns in first month'
        ],
        updated_at: new Date().toISOString()
      })
      .eq('id', 'SD-AGENT-PLATFORM-001')
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Successfully updated SD-AGENT-PLATFORM-001!');
    console.log('\nUpdated scope:');
    console.log(data.scope);
    console.log('\nKey change: EVA positioned as "central coordinator" not just "another agent"');
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
