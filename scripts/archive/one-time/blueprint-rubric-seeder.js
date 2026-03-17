/**
 * Seed quality rubrics into blueprint_templates for all 11 artifact types.
 * Idempotent — updates existing rows, does not duplicate.
 *
 * Usage: node scripts/seed-quality-rubrics.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { RUBRIC_DEFINITIONS, ARTIFACT_TYPES } from '../lib/eva/blueprint-scoring/rubric-definitions.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function seedRubrics() {
  console.log(`Seeding quality rubrics for ${ARTIFACT_TYPES.length} artifact types...\n`);

  let updated = 0;
  let created = 0;

  for (const artifactType of ARTIFACT_TYPES) {
    const rubric = RUBRIC_DEFINITIONS[artifactType];

    // Check if template exists
    const { data: existing } = await supabase
      .from('blueprint_templates')
      .select('id, quality_rubric')
      .eq('artifact_type', artifactType)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (existing) {
      // Update existing template's quality_rubric
      const { error } = await supabase
        .from('blueprint_templates')
        .update({ quality_rubric: rubric, updated_at: new Date().toISOString() })
        .eq('id', existing.id);

      if (error) {
        console.error(`  [FAIL] ${artifactType}: ${error.message}`);
      } else {
        console.log(`  [UPDATE] ${artifactType}: ${rubric.dimensions.length} dimensions, min_pass=${rubric.min_pass_score}`);
        updated++;
      }
    } else {
      // Create new template with rubric
      const { error } = await supabase
        .from('blueprint_templates')
        .insert({
          artifact_type: artifactType,
          archetype: 'default',
          quality_rubric: rubric,
          template_content: {},
          description: `Default template for ${artifactType} artifacts`,
        });

      if (error) {
        console.error(`  [FAIL] ${artifactType}: ${error.message}`);
      } else {
        console.log(`  [CREATE] ${artifactType}: ${rubric.dimensions.length} dimensions, min_pass=${rubric.min_pass_score}`);
        created++;
      }
    }
  }

  console.log(`\nDone: ${updated} updated, ${created} created, ${ARTIFACT_TYPES.length} total`);

  // Verify
  const { data: verify } = await supabase
    .from('blueprint_templates')
    .select('artifact_type')
    .neq('quality_rubric', '{}')
    .eq('is_active', true);

  console.log(`Verification: ${verify?.length || 0}/${ARTIFACT_TYPES.length} templates have rubrics`);
}

seedRubrics().catch(console.error);
