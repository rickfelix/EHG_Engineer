#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-CREWAI-ARCHITECTURE-001';
const PRD_ID = 'PRD-CREWAI-ARCHITECTURE-001';

// Checkpoint plan based on implementation_timeline.md (9 phases)
const checkpointPlan = {
  checkpoint_count: 9,
  checkpoints: [
    {
      checkpoint_number: 1,
      name: "Planning & Setup Complete",
      phase: "Phase 0",
      user_story_range: "All prerequisites",
      deliverables: ["Project structure", "Dependencies installed", "Supabase connection verified"],
      duration_estimate_hours: 20,
      success_criteria: ["Dev environment ready", "All tools installed", "Database accessible"]
    },
    {
      checkpoint_number: 2,
      name: "Database Schema Migration Complete",
      phase: "Phase 1",
      user_story_range: "US-001 to US-003",
      deliverables: ["11 tables created", "RLS policies applied", "Schema validation passing"],
      duration_estimate_hours: 14,
      success_criteria: ["All migrations applied", "No rollback required", "Cross-database FK working"]
    },
    {
      checkpoint_number: 3,
      name: "CrewAI Upgrade & Agent Migration Complete",
      phase: "Phase 2",
      user_story_range: "US-004, US-005, US-009, US-019",
      deliverables: ["CrewAI 1.3.0 upgraded", "45 agents migrated", "No breaking changes"],
      duration_estimate_hours: 32,
      success_criteria: ["All tests pass with 1.3.0", "Agent deduplication complete", "Memory configs applied"]
    },
    {
      checkpoint_number: 4,
      name: "Python Backend APIs Complete",
      phase: "Phase 3",
      user_story_range: "US-006 to US-008, US-020",
      deliverables: ["46 API endpoints", "Security validation pipeline", "Bidirectional sync working"],
      duration_estimate_hours: 80,
      success_criteria: ["All endpoints documented", "100% API test coverage", "No security vulnerabilities"]
    },
    {
      checkpoint_number: 5,
      name: "Code Generation System Complete",
      phase: "Phase 4",
      user_story_range: "US-010, US-017, US-018, US-021",
      deliverables: ["Jinja2 templates", "7-layer security validation", "Git integration", "Manual review workflow"],
      duration_estimate_hours: 80,
      success_criteria: ["Templates generate valid Python", "AST validation passing", "Git commits working"]
    },
    {
      checkpoint_number: 6,
      name: "Frontend UI Complete",
      phase: "Phase 5",
      user_story_range: "US-011 to US-015",
      deliverables: ["Agent Wizard (6 steps)", "Crew Builder (drag-drop)", "Task Manager", "Knowledge Source UI", "Tool Registry"],
      duration_estimate_hours: 120,
      success_criteria: ["All 13 components 300-600 LOC", "Form validation working", "State management complete"]
    },
    {
      checkpoint_number: 7,
      name: "Knowledge Sources & RAG Complete",
      phase: "Phase 6",
      user_story_range: "US-014 (full implementation)",
      deliverables: ["pgvector integration", "Document upload", "RAG queries working"],
      duration_estimate_hours: 46,
      success_criteria: ["Vector embeddings working", "Search accuracy > 80%", "Knowledge indexed"]
    },
    {
      checkpoint_number: 8,
      name: "Execution Engine & WebSocket Complete",
      phase: "Phase 7",
      user_story_range: "US-016, US-022, US-023",
      deliverables: ["Live execution monitoring", "WebSocket updates", "Crew orchestration", "Analytics dashboard"],
      duration_estimate_hours: 52,
      success_criteria: ["Real-time updates working", "Process types tested", "History logged"]
    },
    {
      checkpoint_number: 9,
      name: "Governance Bridge & Final Testing Complete",
      phase: "Phase 8-9",
      user_story_range: "US-024, US-025",
      deliverables: ["LEO Protocol integration", "API documentation", "E2E tests", "Performance benchmarks"],
      duration_estimate_hours: 88,
      success_criteria: ["All tests passing", "Documentation complete", "Performance targets met", "PLAN→EXEC handoff accepted"]
    }
  ],
  total_estimated_hours: 532,
  estimated_duration_weeks: "12-13 weeks",
  created_by: "PLAN",
  created_at: new Date().toISOString(),
  notes: "Checkpoint plan based on implementation_timeline.md. Phases can run partially in parallel to optimize from 13 weeks to 11-12 weeks."
};

async function createCheckpointPlan() {
  console.log('📍 Creating Checkpoint Plan for SD-CREWAI-ARCHITECTURE-001');
  console.log('═══════════════════════════════════════════════════\n');

  // Check if plan already exists
  const { data: existing } = await supabase
    .from('checkpoint_plans')
    .select('id')
    .eq('sd_id', SD_ID)
    .maybeSingle();

  if (existing) {
    console.log('⚠️  Checkpoint plan already exists, updating...\n');
    
    const { error } = await supabase
      .from('checkpoint_plans')
      .update(checkpointPlan)
      .eq('sd_id', SD_ID);

    if (error) {
      console.error('❌ Error updating checkpoint plan:', error.message);
      process.exit(1);
    }

    console.log('✅ Checkpoint plan updated');
  } else {
    // Create new plan
    const { error } = await supabase
      .from('checkpoint_plans')
      .insert({
        id: randomUUID(),
        sd_id: SD_ID,
        prd_id: PRD_ID,
        ...checkpointPlan
      });

    if (error) {
      console.error('❌ Error creating checkpoint plan:', error.message);
      process.exit(1);
    }

    console.log('✅ Checkpoint plan created');
  }

  console.log('\n' + '═'.repeat(60));
  console.log('📊 Checkpoint Plan Summary');
  console.log('═'.repeat(60));
  console.log(`Checkpoints: ${checkpointPlan.checkpoint_count}`);
  console.log(`Total Hours: ${checkpointPlan.total_estimated_hours}`);
  console.log(`Duration: ${checkpointPlan.estimated_duration_weeks}`);
  console.log('\nCheckpoints:');
  checkpointPlan.checkpoints.forEach(cp => {
    console.log(`  ${cp.checkpoint_number}. ${cp.name} (${cp.duration_estimate_hours}h)`);
    console.log(`     Phase: ${cp.phase} | Stories: ${cp.user_story_range}`);
  });
  console.log('═'.repeat(60));
}

createCheckpointPlan();
