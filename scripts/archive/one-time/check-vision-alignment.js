#!/usr/bin/env node

/**
 * Check SD-STAGE-ARCH-001 alignment with Vision V2 files
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function checkVisionAlignment() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, scope, strategic_objectives, success_criteria, metadata')
    .like('id', 'SD-STAGE-ARCH%')
    .order('sequence_rank');

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log('VISION V2 ALIGNMENT CHECK');
  console.log('='.repeat(70));
  console.log('');
  console.log('Canonical Vision V2 (GENESIS_RITUAL_SPECIFICATION.md):');
  console.log('  Kill Gates: 3, 5, 13, 23');
  console.log('  Promotion Gates: 16, 17, 22');
  console.log('');

  const issues = [];

  // Check P4 - rebuilds stages 11-23 with gates
  const p4 = data.find(sd => sd.id === 'SD-STAGE-ARCH-001-P4');
  if (p4) {
    console.log('[P4 - Crisis Zone (11-23)]');
    const objectives = JSON.stringify(p4.strategic_objectives || []);
    const hasKillMention = objectives.includes('KILL');
    const hasPromotionMention = objectives.includes('PROMOTION');
    console.log('  Mentions KILL gates: ' + hasKillMention);
    console.log('  Mentions PROMOTION gates: ' + hasPromotionMention);

    if (hasKillMention && !hasPromotionMention) {
      issues.push('P4: Mentions KILL gates but NOT PROMOTION gates - missing elevation semantics');
    }
    if (!hasPromotionMention) {
      issues.push('P4: Should explicitly mention PROMOTION gates 16, 17, 22 for simulation elevation');
    }
  }

  // Check parent references
  const parent = data.find(sd => sd.id === 'SD-STAGE-ARCH-001');
  if (parent && parent.metadata) {
    console.log('');
    console.log('[Parent Vision References]');
    const refs = parent.metadata.vision_spec_references || {};
    console.log('  Primary: ' + (refs.primary_spec || 'NOT SET'));

    const supporting = refs.supporting_specs || [];
    const hasSimChamber = supporting.some(s => s.includes('SIMULATION_CHAMBER'));
    console.log('  Has SIMULATION_CHAMBER ref: ' + hasSimChamber);

    if (!hasSimChamber) {
      issues.push('Parent: Missing SIMULATION_CHAMBER_ARCHITECTURE.md - needed for promotion gate semantics');
    }
  }

  // Check P3 success criteria for gate enforcement
  const p3 = data.find(sd => sd.id === 'SD-STAGE-ARCH-001-P3');
  if (p3) {
    console.log('');
    console.log('[P3 - Safe Stages (1-10, 24-25)]');
    const criteria = JSON.stringify(p3.success_criteria || []);
    console.log('  Mentions kill gates: ' + criteria.includes('kill'));
  }

  console.log('');
  console.log('='.repeat(70));
  if (issues.length === 0) {
    console.log('No conflicts found!');
  } else {
    console.log('CONFLICTS FOUND: ' + issues.length);
    issues.forEach((issue, i) => {
      console.log('  ' + (i + 1) + '. ' + issue);
    });
  }

  return issues;
}

checkVisionAlignment();
