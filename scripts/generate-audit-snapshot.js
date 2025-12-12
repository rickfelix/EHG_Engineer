#!/usr/bin/env node
/**
 * Generate Database Snapshot for AntiGravity Phase 1 Audit
 *
 * Creates a JSON snapshot of all relevant database state for the
 * SD-VISION-TRANSITION-001 migration audit.
 *
 * Output: docs/audit/phase1-db-snapshot.json
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function generateSnapshot() {
  console.log('Generating database snapshot for AntiGravity audit...\n');

  const snapshot = {
    generated_at: new Date().toISOString(),
    generated_by: 'Claude Code for AntiGravity Phase 1 Audit',
    purpose: 'SD-VISION-TRANSITION-001 Migration Verification',

    lifecycle_stages: null,
    sd_hierarchy: null,
    prd_status: null,
    user_stories_summary: null,
    handoffs_summary: null,
    crewai_contracts: null
  };

  // 1. Lifecycle stages (the core of 25-stage system)
  console.log('1. Querying lifecycle_stage_config...');
  const { data: stages } = await supabase
    .from('lifecycle_stage_config')
    .select('stage_number, stage_name, phase_name, sd_required, advisory_enabled')
    .order('stage_number');

  snapshot.lifecycle_stages = {
    count: stages?.length || 0,
    expected: 25,
    pass: stages?.length === 25,
    data: stages
  };
  console.log(`   Found ${stages?.length || 0} stages (expected 25)`);

  // 2. SD hierarchy
  console.log('2. Querying strategic_directives_v2...');
  const { data: sds } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, progress, current_phase, sd_type, parent_sd_id')
    .or('id.eq.SD-VISION-TRANSITION-001,id.ilike.SD-VISION-TRANSITION-001%')
    .order('id');

  snapshot.sd_hierarchy = {
    count: sds?.length || 0,
    data: sds?.map(sd => ({
      id: sd.id,
      title: sd.title,
      status: sd.status,
      progress: sd.progress,
      phase: sd.current_phase,
      type: sd.sd_type,
      parent: sd.parent_sd_id
    }))
  };
  console.log(`   Found ${sds?.length || 0} SDs in hierarchy`);

  // 3. PRD status
  console.log('3. Querying product_requirements_v2...');
  const { data: prds } = await supabase
    .from('product_requirements_v2')
    .select('directive_id, status, phase')
    .or('directive_id.eq.SD-VISION-TRANSITION-001,directive_id.ilike.SD-VISION-TRANSITION-001%')
    .order('directive_id');

  snapshot.prd_status = {
    count: prds?.length || 0,
    data: prds
  };
  console.log(`   Found ${prds?.length || 0} PRDs`);

  // 4. User stories by SD
  console.log('4. Querying user_stories...');
  const { data: stories } = await supabase
    .from('user_stories')
    .select('sd_id, status, validation_status')
    .or('sd_id.eq.SD-VISION-TRANSITION-001,sd_id.ilike.SD-VISION-TRANSITION-001%');

  const storyBySd = {};
  (stories || []).forEach(s => {
    if (!storyBySd[s.sd_id]) {
      storyBySd[s.sd_id] = { total: 0, completed: 0, validated: 0 };
    }
    storyBySd[s.sd_id].total++;
    if (s.status === 'completed') storyBySd[s.sd_id].completed++;
    if (s.validation_status === 'validated') storyBySd[s.sd_id].validated++;
  });
  snapshot.user_stories_summary = storyBySd;
  console.log(`   Found ${stories?.length || 0} user stories across ${Object.keys(storyBySd).length} SDs`);

  // 5. Handoffs by SD
  console.log('5. Querying sd_phase_handoffs...');
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('sd_id, handoff_type, status')
    .or('sd_id.eq.SD-VISION-TRANSITION-001,sd_id.ilike.SD-VISION-TRANSITION-001%');

  const handoffBySd = {};
  (handoffs || []).forEach(h => {
    if (!handoffBySd[h.sd_id]) {
      handoffBySd[h.sd_id] = { accepted: [], rejected_count: 0 };
    }
    if (h.status === 'accepted') {
      handoffBySd[h.sd_id].accepted.push(h.handoff_type);
    } else {
      handoffBySd[h.sd_id].rejected_count++;
    }
  });
  snapshot.handoffs_summary = handoffBySd;
  console.log(`   Found ${handoffs?.length || 0} handoff records`);

  // 6. CrewAI contracts
  console.log('6. Querying leo_interfaces...');
  const { data: contracts } = await supabase
    .from('leo_interfaces')
    .select('id, name, kind, version, validation_status');

  snapshot.crewai_contracts = {
    count: contracts?.length || 0,
    data: contracts
  };
  console.log(`   Found ${contracts?.length || 0} CrewAI contracts`);

  // Write to file
  const outputDir = path.join(process.cwd(), 'docs', 'audit');
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, 'phase1-db-snapshot.json');
  fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('SNAPSHOT COMPLETE');
  console.log('='.repeat(60));
  console.log(`Output: ${outputPath}`);
  console.log('');
  console.log('VERIFICATION SUMMARY:');
  console.log(`  Lifecycle stages: ${snapshot.lifecycle_stages.count}/25 ${snapshot.lifecycle_stages.pass ? '✅' : '❌'}`);
  console.log(`  SDs in hierarchy: ${snapshot.sd_hierarchy.count}`);
  console.log(`  PRDs: ${snapshot.prd_status.count}`);
  console.log(`  User stories: ${stories?.length || 0}`);
  console.log(`  CrewAI contracts: ${snapshot.crewai_contracts.count}`);

  return snapshot;
}

generateSnapshot().catch(console.error);
