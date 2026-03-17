/**
 * Seed script: Canonical Stage Name Synchronization
 * SD-EVA-R2-FIX-DOSSIER-NAMES-001
 *
 * Updates lifecycle_stage_config to match Vision v4.7 canonical stage names
 * and fixes phase boundaries (BUILD LOOP = stages 17-22).
 *
 * Idempotent: safe to run multiple times.
 *
 * Usage: node scripts/seed-canonical-stage-names.js [--dry-run] [--verify]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const CANONICAL_STAGES = [
  { stage_number: 1,  stage_name: 'Idea Capture',           phase_name: 'THE TRUTH' },
  { stage_number: 2,  stage_name: 'Idea Analysis',          phase_name: 'THE TRUTH' },
  { stage_number: 3,  stage_name: 'Kill Gate',              phase_name: 'THE TRUTH' },
  { stage_number: 4,  stage_name: 'Competitive Landscape',  phase_name: 'THE TRUTH' },
  { stage_number: 5,  stage_name: 'Kill Gate (Financial)',   phase_name: 'THE TRUTH' },
  { stage_number: 6,  stage_name: 'Risk Assessment',        phase_name: 'THE ENGINE' },
  { stage_number: 7,  stage_name: 'Revenue Architecture',   phase_name: 'THE ENGINE' },
  { stage_number: 8,  stage_name: 'Business Model Canvas',  phase_name: 'THE ENGINE' },
  { stage_number: 9,  stage_name: 'Exit Strategy',          phase_name: 'THE ENGINE' },
  { stage_number: 10, stage_name: 'Naming/Brand',           phase_name: 'THE IDENTITY' },
  { stage_number: 11, stage_name: 'GTM Strategy',           phase_name: 'THE IDENTITY' },
  { stage_number: 12, stage_name: 'Sales Identity',         phase_name: 'THE IDENTITY' },
  { stage_number: 13, stage_name: 'Product Roadmap',        phase_name: 'THE BLUEPRINT' },
  { stage_number: 14, stage_name: 'Technical Architecture', phase_name: 'THE BLUEPRINT' },
  { stage_number: 15, stage_name: 'Resource Planning',      phase_name: 'THE BLUEPRINT' },
  { stage_number: 16, stage_name: 'Financial Projections',  phase_name: 'THE BLUEPRINT' },
  { stage_number: 17, stage_name: 'Pre-Build Checklist',    phase_name: 'THE BUILD LOOP' },
  { stage_number: 18, stage_name: 'Sprint Planning',        phase_name: 'THE BUILD LOOP' },
  { stage_number: 19, stage_name: 'Build Execution',        phase_name: 'THE BUILD LOOP' },
  { stage_number: 20, stage_name: 'Quality Assurance',      phase_name: 'THE BUILD LOOP' },
  { stage_number: 21, stage_name: 'Build Review',           phase_name: 'THE BUILD LOOP' },
  { stage_number: 22, stage_name: 'Release Readiness',      phase_name: 'THE BUILD LOOP' },
  { stage_number: 23, stage_name: 'Launch Execution',       phase_name: 'LAUNCH & LEARN' },
  { stage_number: 24, stage_name: 'Metrics & Learning',     phase_name: 'LAUNCH & LEARN' },
  { stage_number: 25, stage_name: 'Venture Review',         phase_name: 'LAUNCH & LEARN' },
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const verifyOnly = process.argv.includes('--verify');

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  if (verifyOnly) {
    await verify(supabase);
    return;
  }

  console.log(`\n=== Canonical Stage Name Seed ${dryRun ? '(DRY RUN)' : ''} ===\n`);

  let updated = 0;
  let skipped = 0;

  for (const stage of CANONICAL_STAGES) {
    // Fetch current
    const { data: current } = await supabase
      .from('lifecycle_stage_config')
      .select('stage_name, phase_name')
      .eq('stage_number', stage.stage_number)
      .single();

    if (!current) {
      console.log(`  Stage ${stage.stage_number}: NOT FOUND in DB (skipped)`);
      skipped++;
      continue;
    }

    const nameMatch = current.stage_name === stage.stage_name;
    const phaseMatch = current.phase_name === stage.phase_name;

    if (nameMatch && phaseMatch) {
      console.log(`  Stage ${stage.stage_number}: ✅ Already correct (${stage.stage_name})`);
      skipped++;
      continue;
    }

    const changes = [];
    if (!nameMatch) changes.push(`name: "${current.stage_name}" → "${stage.stage_name}"`);
    if (!phaseMatch) changes.push(`phase: "${current.phase_name}" → "${stage.phase_name}"`);

    if (dryRun) {
      console.log(`  Stage ${stage.stage_number}: Would update — ${changes.join(', ')}`);
    } else {
      const { error } = await supabase
        .from('lifecycle_stage_config')
        .update({ stage_name: stage.stage_name, phase_name: stage.phase_name })
        .eq('stage_number', stage.stage_number);

      if (error) {
        console.error(`  Stage ${stage.stage_number}: ❌ Error — ${error.message}`);
      } else {
        console.log(`  Stage ${stage.stage_number}: ✅ Updated — ${changes.join(', ')}`);
      }
    }
    updated++;
  }

  console.log(`\n  Summary: ${updated} updated, ${skipped} unchanged\n`);

  if (!dryRun) {
    await verify(supabase);
  }
}

async function verify(supabase) {
  console.log('\n=== Verification ===\n');

  const { data: rows } = await supabase
    .from('lifecycle_stage_config')
    .select('stage_number, stage_name, phase_name')
    .order('stage_number');

  let mismatches = 0;
  for (const canonical of CANONICAL_STAGES) {
    const dbRow = rows?.find(r => r.stage_number === canonical.stage_number);
    if (!dbRow) {
      console.log(`  Stage ${canonical.stage_number}: ❌ Missing from DB`);
      mismatches++;
      continue;
    }
    const nameOk = dbRow.stage_name === canonical.stage_name;
    const phaseOk = dbRow.phase_name === canonical.phase_name;
    if (!nameOk || !phaseOk) {
      const issues = [];
      if (!nameOk) issues.push(`name: "${dbRow.stage_name}" (expected "${canonical.stage_name}")`);
      if (!phaseOk) issues.push(`phase: "${dbRow.phase_name}" (expected "${canonical.phase_name}")`);
      console.log(`  Stage ${canonical.stage_number}: ❌ ${issues.join(', ')}`);
      mismatches++;
    }
  }

  if (mismatches === 0) {
    console.log('  ✅ All 25 stages match Vision v4.7 canonical names\n');
  } else {
    console.log(`\n  ❌ ${mismatches} stage(s) do not match\n`);
  }
}

// ESM entry point
const isMain = import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
               import.meta.url === `file://${process.argv[1]}`;
if (isMain) { main().catch(console.error); }

export { CANONICAL_STAGES };
