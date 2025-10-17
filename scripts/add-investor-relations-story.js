#!/usr/bin/env node

/**
 * Add Investor Relations Department user story to SD-AGENT-PLATFORM-001
 * US-033: Investor Relations & Corporate Development Team
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

const SD_ID = 'SD-AGENT-PLATFORM-001';

async function addInvestorRelationsStory() {
  console.log('🔄 Adding Investor Relations Department story to SD-AGENT-PLATFORM-001...');
  console.log('='.repeat(80));

  const story = {
    id: randomUUID(),
    story_key: `${SD_ID}:US-033`,
    title: 'Investor Relations Department Team',
    user_role: 'developer',
    user_want: 'to deploy Investor Relations department with AI agents managing investor communications, fundraising, and exit strategy',
    user_benefit: 'ensuring professional investor relations, effective fundraising processes, and strategic exit planning',
    acceptance_criteria: [
      'VP Investor Relations agent (manages investor relations team, reports to CEO)',
      'Investor Communications Agent (shareholder updates, investor reports, quarterly newsletters, investor Q&A responses) - reports to VP',
      'Pitch Deck Specialist Agent (fundraising decks, investor presentations, data room preparation, pitch refinement based on feedback) - reports to VP',
      'Financial Reporting Agent (investor KPI dashboards, cap table management, burn rate reports, runway projections, financial metrics for investors) - reports to VP',
      'Exit Strategy Agent (M&A opportunity analysis, IPO readiness assessment, acquisition valuations, exit scenario modeling, competitive buyer research) - reports to VP',
      'Integration with Finance Department for real-time financial data',
      'Pitch deck templates stored in ventures.metadata.investor_relations',
      'Investor contact database with communication history',
      'Data room management for due diligence processes',
      'Exit scenario modeling connected to financial projections'
    ],
    technical_notes: 'Add investor_relations field to ventures.metadata JSONB column, create investor_contacts table (investor_id, venture_id, contact_info, communication_history), integrate with financial_projections for reporting, pitch deck templates in Figma/Canva API integration, M&A database APIs (Crunchbase, PitchBook) for exit analysis',
    story_points: 8,
    priority: 'high',
    status: 'ready',
    sd_id: SD_ID,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    const { data, error } = await supabase
      .from('user_stories')
      .insert([story])
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Successfully added Investor Relations Department story!');
    console.log('\n📊 Story Details:');
    console.log(`Story Key: ${data.story_key}`);
    console.log(`Title: ${data.title}`);
    console.log(`Story Points: ${data.story_points}`);
    console.log(`Priority: ${data.priority}`);
    console.log(`Sprint: ${data.sprint_number}`);
    console.log(`Status: ${data.status}`);
    console.log('\n✅ Acceptance Criteria:');
    data.acceptance_criteria.forEach((criterion, i) => {
      console.log(`${i + 1}. ${criterion}`);
    });
    console.log('='.repeat(80));

    return data;
  } catch (error) {
    console.error('❌ Error adding story:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  addInvestorRelationsStory();
}

export { addInvestorRelationsStory };
