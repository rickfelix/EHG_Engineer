#!/usr/bin/env node

/**
 * Create SD-LEO-TASK-SYSTEM-001: LEO 5.0 Task System Architecture
 *
 * Run: node scripts/create-leo-5-sd.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createSD() {
  const sdData = {
    id: 'SD-LEO-TASK-SYSTEM-001',
    title: 'LEO 5.0 Task System Architecture - Hybrid Identity + Execution Model',
    description: `Implement the LEO 5.0 Hybrid Architecture that separates Identity (CLAUDE.md files) from Execution (Claude Code Tasks). This enables persistent task state, strict phase dependencies via blockedBy constraints, and right-sized governance through 4 execution tracks.

**Architecture Reference Document**: plans/LEO_5_0_ARCHITECTURE.md

This comprehensive technical specification contains:
- Executive Summary with key innovations
- 4-Track System (FULL/STANDARD/FAST/HOTFIX)
- 5-Phase Lifecycle diagrams
- Hydration mechanism design
- 5 Walls specification
- SAFETY-WALL for hotfix compensating control
- Kickback system for failure handling
- Wall invalidation for dynamic corrections
- Complete JSON task templates
- Sub-agent orchestration patterns
- CLI extension specifications

The PRD should reference and incorporate the detailed designs from this document.`,
    strategic_intent: 'Upgrade LEO Protocol to leverage Claude Code Tasks feature for persistent task state, strict dependency enforcement, and automated workflow orchestration while preserving the identity/constitution model defined in CLAUDE.md files.',
    rationale: `Current LEO Protocol limitations:
1. Manual todo tracking via ad-hoc lists
2. No persistent task state across sessions
3. Phase transitions require manual enforcement
4. One-size-fits-all workflow regardless of SD complexity
5. No automated failure recovery or kickback mechanisms

LEO 5.0 addresses all of these through:
1. Tasks as persistent files (~/.claude/tasks/{SD_ID}/)
2. blockedBy constraints create impenetrable walls
3. Handoffs trigger automatic task hydration
4. 4 execution tracks for right-sized governance
5. Kickback system and wall invalidation for graceful failure handling`,
    scope: `In Scope:
- Task Hydrator class (lib/tasks/task-hydrator.js)
- Track selector logic (lib/tasks/track-selector.js)
- Task templates for all 4 tracks (lib/tasks/templates/tracks/)
- Integration with existing handoff.js system
- 6 wall implementations (LEAD, PLAN, EXEC, SAFETY, VERIFY, FINAL)
- Kickback task generation on gate failures
- Wall invalidation command
- CLI extensions to handoff.js

Out of Scope:
- Modifying CLAUDE.md identity files (they remain the constitution)
- Changing the LEAD/PLAN/EXEC phase semantics
- Database schema changes (tasks are file-based)
- Frontend dashboard for task visualization (future enhancement)`,
    status: 'draft',
    category: 'infrastructure',
    priority: 'high',
    sd_type: 'infrastructure',
    target_application: 'EHG_Engineer',
    current_phase: 'LEAD_APPROVAL',
    phase_progress: 0,
    progress_percentage: 0,
    is_active: true,
    is_working_on: false,
    created_by: 'LEAD',
    key_changes: JSON.stringify([
      { change: 'Implement TaskHydrator class for handoff-triggered task generation', impact: 'Enables lazy task creation at phase transitions' },
      { change: 'Create 4 execution tracks (FULL/STANDARD/FAST/HOTFIX)', impact: 'Right-sized governance based on SD type and scope' },
      { change: 'Implement 6 walls with blockedBy enforcement', impact: 'Impenetrable phase boundaries via Claude Code Tasks' },
      { change: 'Add SAFETY-WALL for hotfix track', impact: 'Compensating control when skipping LEAD/PLAN phases' },
      { change: 'Implement kickback system for gate failures', impact: 'Graceful failure recovery with automatic phase rollback' },
      { change: 'Add wall invalidation command', impact: 'Enables mid-phase corrections without SD restart' }
    ]),
    success_criteria: JSON.stringify([
      { criterion: 'TaskHydrator generates correct tasks', measure: 'Unit tests pass for all 4 tracks' },
      { criterion: 'Walls block downstream tasks', measure: 'Integration test: EXEC tasks cannot start until PLAN-WALL passes' },
      { criterion: 'Track selection works correctly', measure: 'SD type maps to correct track, scope escalation works' },
      { criterion: 'Kickback creates recovery path', measure: 'After 3 gate failures, kickback task is auto-created' },
      { criterion: 'Wall invalidation pauses/resumes', measure: 'E2E test: invalidate PLAN-WALL, correct, resume EXEC' }
    ]),
    dependencies: JSON.stringify([
      { dependency: 'Claude Code Tasks feature available', type: 'technical', status: 'ready' },
      { dependency: 'Existing handoff.js system', type: 'technical', status: 'ready' },
      { dependency: 'LEO 5.0 Architecture document', type: 'documentation', status: 'ready' }
    ]),
    risks: JSON.stringify([
      { risk: 'Task file format changes in Claude Code', severity: 'medium', mitigation: 'Abstract task operations behind TaskHydrator interface' },
      { risk: 'Performance impact from task file I/O', severity: 'low', mitigation: 'Tasks are small JSON files, minimal overhead' },
      { risk: 'Breaking existing handoff.js callers', severity: 'medium', mitigation: 'Hydration is additive, existing gate validation unchanged' }
    ]),
    implementation_guidelines: JSON.stringify([
      { guideline: 'Reference plans/LEO_5_0_ARCHITECTURE.md for all design decisions', rationale: 'Single source of truth for architecture' },
      { guideline: 'Implement track selector before hydrator', rationale: 'Track determines which templates to load' },
      { guideline: 'Start with FULL and HOTFIX tracks', rationale: 'Maximum contrast shows system flexibility' },
      { guideline: 'Test walls with integration tests', rationale: 'Unit tests cannot verify blockedBy enforcement' }
    ]),
    metadata: JSON.stringify({
      architecture_doc: 'plans/LEO_5_0_ARCHITECTURE.md',
      tracks: ['FULL', 'STANDARD', 'FAST', 'HOTFIX'],
      walls: ['LEAD-WALL', 'PLAN-WALL', 'EXEC-WALL', 'SAFETY-WALL', 'VERIFY-WALL', 'FINAL-APPROVE'],
      gap_fixes: ['Kickback System', 'Wall Invalidation', 'Track System'],
      version: '5.0'
    })
  };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sdData)
    .select()
    .single();

  if (error) {
    console.error('Error creating SD:', error.message);
    process.exit(1);
  }

  console.log('\n✅ SD Created Successfully!\n');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  ID:      ${data.id}`);
  console.log(`  Title:   ${data.title}`);
  console.log(`  Status:  ${data.status}`);
  console.log(`  Phase:   ${data.current_phase}`);
  console.log(`  Type:    ${data.sd_type}`);
  console.log(`  Target:  ${data.target_application}`);
  console.log('════════════════════════════════════════════════════════════');
  console.log('\n📋 Next: Run LEAD-TO-PLAN handoff when ready');
  console.log(`   node scripts/handoff.js execute LEAD-TO-PLAN ${data.id}\n`);
}

createSD().catch(console.error);
