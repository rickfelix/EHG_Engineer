import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await sb
    .from('strategic_directives_v2')
    .select('sd_key, current_phase, status, sd_type, priority, parent_sd_id, description, success_criteria, success_metrics, strategic_objectives, key_changes, dependencies')
    .like('sd_key', 'SD-EVA-%')
    .order('sd_key');

  if (error) { console.error('Query error:', error); return; }

  const newSDs = data.filter(s => /SD-EVA-(ORCH|FEAT)/.test(s.sd_key));
  console.log(`\n=== JSONB Field Integrity Check (${newSDs.length} SDs) ===\n`);

  const issues = [];
  const jsonbFields = ['success_criteria', 'success_metrics', 'strategic_objectives', 'key_changes', 'dependencies'];

  newSDs.forEach(s => {
    if (s.current_phase !== 'LEAD') issues.push(`${s.sd_key}: phase=${s.current_phase} (expected LEAD)`);
    if (s.status !== 'draft') issues.push(`${s.sd_key}: status=${s.status} (expected draft)`);
    jsonbFields.forEach(f => {
      if (!Array.isArray(s[f])) issues.push(`${s.sd_key}: ${f} not array (${typeof s[f]})`);
    });
    if (!s.description || s.description.trim().length === 0) {
      issues.push(`${s.sd_key}: description is empty`);
    }
  });

  if (issues.length === 0) {
    console.log('ALL PASS: phases=LEAD, status=draft, all JSONB fields are arrays, all have descriptions');
  } else {
    issues.forEach(i => console.log(`  ISSUE: ${i}`));
  }

  // Check for architecture/vision doc references
  console.log('\n=== Document Reference Check ===\n');
  const archRef = 'eva-platform-architecture.md';
  const visionRef = 'eva-venture-lifecycle-vision.md';

  let hasArchRef = 0;
  let hasVisionRef = 0;
  let missingRefs = [];

  newSDs.forEach(s => {
    const desc = s.description || '';
    const hasArch = desc.includes(archRef) || desc.includes('architecture doc') || desc.includes('Architecture Section');
    const hasVision = desc.includes(visionRef) || desc.includes('Vision Section') || desc.includes('vision doc');
    if (hasArch) hasArchRef++;
    if (hasVision) hasVisionRef++;
    if (!hasArch && !hasVision) missingRefs.push(s.sd_key);
  });

  console.log(`SDs referencing architecture doc: ${hasArchRef}/${newSDs.length}`);
  console.log(`SDs referencing vision doc: ${hasVisionRef}/${newSDs.length}`);
  console.log(`SDs with NO doc references: ${missingRefs.length}`);
  if (missingRefs.length > 0) {
    missingRefs.forEach(k => console.log(`  - ${k}`));
  }

  // Show sample descriptions for reference
  console.log('\n=== Sample Descriptions (first 3 SDs) ===\n');
  newSDs.slice(0, 3).forEach(s => {
    console.log(`${s.sd_key}:`);
    console.log(`  "${s.description}"`);
    console.log();
  });
}

const isMain = import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
if (isMain) main().catch(console.error);
